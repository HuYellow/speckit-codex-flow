import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_SPEC_KIT_TAG = "v0.12.2";
export const DEFAULT_SPEC_KIT_RELEASE_DATE = "2026-06-30";
const SPEC_KIT_REPO = "https://github.com/github/spec-kit.git";

export type Phase = "plan" | "tasks" | "implement" | "converge";
export type BootstrapMode = "current" | "new";

export interface CommandStatus {
  name: string;
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface RunResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FileCheck {
  exists: boolean;
  path: string;
  bytes?: number;
  hasNeedsClarification: boolean;
  placeholders: string[];
  emptySections: string[];
  taskCount?: number;
  testTaskCount?: number;
}

export interface FeatureStatus {
  name: string;
  path: string;
  isCurrent: boolean;
  spec: FileCheck;
  plan: FileCheck;
  tasks: FileCheck;
}

export interface ProjectStatus {
  root: string;
  initialized: boolean;
  gitRoot?: string;
  gitBranch?: string;
  constitution: FileCheck;
  officialSkills: string[];
  features: FeatureStatus[];
  currentFeature?: FeatureStatus;
  constitutionRequiresTests: boolean;
  nextRecommendedSkill: string;
  blockers: string[];
}

export interface GateResult {
  phase: Phase;
  allowed: boolean;
  blockers: string[];
  nextSkill: string;
  status: ProjectStatus;
}

function trimOutput(value: string | Buffer | undefined): string {
  return String(value ?? "").trim();
}

function commandForDisplay(command: string, args: string[]): string {
  return [command, ...args].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 120000,
): Promise<RunResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      command,
      args,
      cwd,
      exitCode: 0,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
    };
    return {
      command,
      args,
      cwd,
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: trimOutput(err.stdout),
      stderr: trimOutput(err.stderr || err.message),
    };
  }
}

async function resolveCommand(command: string, cwd: string): Promise<CommandStatus> {
  const resolver =
    process.platform === "win32"
      ? {
          command: "powershell.exe",
          args: [
            "-NoProfile",
            "-Command",
            `Get-Command ${JSON.stringify(command)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source`,
          ],
        }
      : { command: "sh", args: ["-lc", `command -v ${JSON.stringify(command)}`] };

  const resolved = await runCommand(resolver.command, resolver.args, cwd, 10000);
  if (resolved.exitCode !== 0 || !resolved.stdout) {
    return { name: command, available: false, error: resolved.stderr || "Command not found on PATH." };
  }

  return { name: command, available: true, path: resolved.stdout.split(/\r?\n/)[0] };
}

async function commandVersion(command: string, cwd: string): Promise<string | undefined> {
  const result = await runCommand(command, ["--version"], cwd, 10000);
  if (result.exitCode !== 0) {
    return undefined;
  }
  return result.stdout.split(/\r?\n/)[0];
}

async function commandStatus(command: string, cwd: string): Promise<CommandStatus> {
  const status = await resolveCommand(command, cwd);
  if (!status.available) {
    return status;
  }
  return { ...status, version: await commandVersion(command, cwd) };
}

async function gitRoot(startPath: string): Promise<string | undefined> {
  const git = await resolveCommand("git", startPath);
  if (!git.available) {
    return undefined;
  }
  const result = await runCommand("git", ["-C", startPath, "rev-parse", "--show-toplevel"], startPath, 10000);
  return result.exitCode === 0 && result.stdout ? result.stdout : undefined;
}

async function gitBranch(startPath: string): Promise<string | undefined> {
  const git = await resolveCommand("git", startPath);
  if (!git.available) {
    return undefined;
  }
  const result = await runCommand("git", ["-C", startPath, "rev-parse", "--abbrev-ref", "HEAD"], startPath, 10000);
  return result.exitCode === 0 && result.stdout ? result.stdout : undefined;
}

async function findProjectRoot(startPath?: string): Promise<string> {
  let current = resolve(startPath || process.cwd());
  const currentStat = await safeStat(current);
  if (currentStat?.isFile()) {
    current = dirname(current);
  }

  let cursor = current;
  while (true) {
    if (await pathExists(resolve(cursor, ".specify"))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  return (await gitRoot(current)) || current;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function placeholderMatches(text: string): string[] {
  const matches = text.match(/\[(?:NEEDS CLARIFICATION[^\]]*|[A-Z][A-Z0-9_ -]{2,}|#{2,}[^\]]*)\]/g) || [];
  return unique(matches).slice(0, 50);
}

function emptySections(text: string, names: string[]): string[] {
  const empty: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const name of names) {
    const headingIndex = lines.findIndex((line) => {
      const match = line.match(/^(#{2,4})\s+(.+?)\s*$/);
      return !!match && match[2].toLowerCase().startsWith(name.toLowerCase());
    });
    if (headingIndex === -1) {
      empty.push(name);
      continue;
    }
    const bodyLines: string[] = [];
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      if (/^#{2,4}\s+/.test(lines[index])) {
        break;
      }
      bodyLines.push(lines[index]);
    }
    const body = bodyLines
      .join("\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\[[^\]]+\]/g, "")
      .trim();
    if (!body) {
      empty.push(name);
    }
  }
  return empty;
}

async function inspectMarkdown(path: string, sectionNames: string[] = []): Promise<FileCheck> {
  if (!(await pathExists(path))) {
    return {
      exists: false,
      path,
      hasNeedsClarification: false,
      placeholders: [],
      emptySections: sectionNames,
    };
  }

  const stats = await stat(path);
  const text = await readFile(path, "utf8");
  const taskLines = text.match(/^\s*-\s+\[[ xX]\]\s+(?:T\d+|\*\*)?.*$/gm) || [];
  const testTaskLines = taskLines.filter((line) =>
    /\b(test|tests|testing|unit|integration|e2e|pytest|vitest|jest|playwright|spec|coverage)\b|测试/i.test(line),
  );

  return {
    exists: true,
    path,
    bytes: stats.size,
    hasNeedsClarification: /\[NEEDS CLARIFICATION[^\]]*\]/i.test(text),
    placeholders: placeholderMatches(text),
    emptySections: emptySections(text, sectionNames),
    taskCount: taskLines.length || undefined,
    testTaskCount: testTaskLines.length || undefined,
  };
}

async function listOfficialSkills(root: string): Promise<string[]> {
  const skillsDir = resolve(root, ".agents", "skills");
  if (!(await pathExists(skillsDir))) {
    return [];
  }
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("speckit-")) {
      continue;
    }
    if (await pathExists(resolve(skillsDir, entry.name, "SKILL.md"))) {
      skills.push(entry.name);
    }
  }
  return skills.sort();
}

function featureSortValue(name: string): number {
  const match = name.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function chooseCurrentFeature(features: FeatureStatus[], branch?: string): FeatureStatus | undefined {
  if (features.length === 0) {
    return undefined;
  }
  if (branch) {
    const branchPrefix = branch.match(/^(\d+)/)?.[1];
    const exact = features.find((feature) => feature.name === branch);
    if (exact) {
      return exact;
    }
    if (branchPrefix) {
      const prefixed = features.find((feature) => feature.name.startsWith(`${branchPrefix}-`));
      if (prefixed) {
        return prefixed;
      }
    }
  }
  return [...features].sort((a, b) => featureSortValue(b.name) - featureSortValue(a.name) || b.name.localeCompare(a.name))[0];
}

function hasFileBlockers(file: FileCheck): boolean {
  return !file.exists || file.hasNeedsClarification || file.placeholders.length > 0 || file.emptySections.length > 0;
}

async function listFeatures(root: string, branch?: string): Promise<FeatureStatus[]> {
  const specsDir = resolve(root, "specs");
  if (!(await pathExists(specsDir))) {
    return [];
  }
  const entries = await readdir(specsDir, { withFileTypes: true });
  const features: FeatureStatus[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const featurePath = resolve(specsDir, entry.name);
    features.push({
      name: entry.name,
      path: featurePath,
      isCurrent: false,
      spec: await inspectMarkdown(resolve(featurePath, "spec.md"), [
        "User Scenarios & Testing",
        "Functional Requirements",
        "Success Criteria",
      ]),
      plan: await inspectMarkdown(resolve(featurePath, "plan.md"), ["Summary", "Technical Context", "Constitution Check"]),
      tasks: await inspectMarkdown(resolve(featurePath, "tasks.md"), []),
    });
  }
  const current = chooseCurrentFeature(features, branch);
  return features
    .map((feature) => ({ ...feature, isCurrent: feature.name === current?.name }))
    .sort((a, b) => featureSortValue(a.name) - featureSortValue(b.name) || a.name.localeCompare(b.name));
}

function constitutionRequiresTestsText(text: string): boolean {
  return (
    /\b(MUST|REQUIRED|MANDATORY|NON-NEGOTIABLE)\b.{0,100}\b(test|tests|testing|TDD|coverage)\b/i.test(text) ||
    /(必须|强制|要求).{0,80}(测试|覆盖率|TDD)/i.test(text)
  );
}

async function constitutionRequiresTests(path: string): Promise<boolean> {
  if (!(await pathExists(path))) {
    return false;
  }
  return constitutionRequiresTestsText(await readFile(path, "utf8"));
}

function projectBlockers(status: ProjectStatus): string[] {
  const blockers: string[] = [];
  if (!status.initialized) {
    blockers.push("Project is not initialized with Spec Kit. Run $speckit-bootstrap first.");
  }
  if (!status.constitution.exists) {
    blockers.push("Missing .specify/memory/constitution.md. Run $speckit-constitution.");
  } else if (hasFileBlockers(status.constitution)) {
    blockers.push("Constitution contains unresolved placeholders or empty required sections.");
  }
  if (status.officialSkills.length === 0) {
    blockers.push("Missing official project-local Spec Kit Codex skills under .agents/skills/speckit-*.");
  }
  return blockers;
}

function nextSkillForStatus(status: ProjectStatus): string {
  if (!status.initialized || status.officialSkills.length === 0) {
    return "$speckit-bootstrap";
  }
  if (!status.constitution.exists || hasFileBlockers(status.constitution)) {
    return "$speckit-constitution";
  }
  if (!status.currentFeature) {
    return "$speckit-specify";
  }
  if (hasFileBlockers(status.currentFeature.spec)) {
    return "$speckit-clarify";
  }
  if (hasFileBlockers(status.currentFeature.plan)) {
    return "$speckit-plan";
  }
  if (hasFileBlockers(status.currentFeature.tasks) || !status.currentFeature.tasks.taskCount) {
    return "$speckit-tasks";
  }
  return "$speckit-flow-implement";
}

export async function checkEnvironment(input: { path?: string } = {}) {
  const cwd = resolve(input.path || process.cwd());
  const [codex, uv, specify, powershell] = await Promise.all([
    commandStatus("codex", cwd),
    commandStatus("uv", cwd),
    commandStatus("specify", cwd),
    process.platform === "win32" ? commandStatus("powershell", cwd) : Promise.resolve<CommandStatus>({ name: "powershell", available: false }),
  ]);
  const root = await gitRoot(cwd);

  return {
    cwd,
    platform: process.platform,
    pinnedSpecKit: {
      tag: DEFAULT_SPEC_KIT_TAG,
      releaseDate: DEFAULT_SPEC_KIT_RELEASE_DATE,
      repository: "https://github.com/github/spec-kit",
    },
    commands: {
      codex,
      uv,
      specify,
      powershell,
    },
    gitRoot: root,
    ready: codex.available && uv.available && specify.available,
    recommendations: [
      !uv.available ? "Install uv before using install_specify_cli." : undefined,
      uv.available && !specify.available
        ? `Run install_specify_cli to install specify-cli pinned to ${DEFAULT_SPEC_KIT_TAG}.`
        : undefined,
      !codex.available ? "Install Codex CLI before initializing Spec Kit with the codex integration." : undefined,
    ].filter(Boolean),
  };
}

export async function installSpecifyCli(input: { tag?: string } = {}) {
  const tag = input.tag || DEFAULT_SPEC_KIT_TAG;
  const cwd = process.cwd();
  const uv = await commandStatus("uv", cwd);
  if (!uv.available) {
    return {
      ok: false,
      reason: "uv is not available on PATH.",
      installUv: "https://docs.astral.sh/uv/getting-started/installation/",
      intendedCommand: `uv tool install specify-cli --from git+${SPEC_KIT_REPO}@${tag}`,
    };
  }

  const args = ["tool", "install", "specify-cli", "--from", `git+${SPEC_KIT_REPO}@${tag}`];
  const result = await runCommand("uv", args, cwd, 10 * 60 * 1000);
  return {
    ok: result.exitCode === 0,
    tag,
    command: commandForDisplay("uv", args),
    result,
    specify: await commandStatus("specify", cwd),
  };
}

export async function bootstrapProject(input: { path?: string; mode?: BootstrapMode; force?: boolean } = {}) {
  const targetPath = resolve(input.path || process.cwd());
  const mode = input.mode || "current";
  const specify = await commandStatus("specify", process.cwd());
  if (!specify.available) {
    return {
      ok: false,
      reason: "specify is not available on PATH.",
      nextTool: "install_specify_cli",
      intendedCommand:
        mode === "new"
          ? `specify init ${targetPath} --integration codex --integration-options="--skills"`
          : `specify init . --integration codex --integration-options="--skills"`,
    };
  }

  if (mode === "current") {
    await mkdir(targetPath, { recursive: true });
  } else {
    await mkdir(dirname(targetPath), { recursive: true });
  }

  const args =
    mode === "new"
      ? ["init", targetPath, "--integration", "codex", "--integration-options=--skills"]
      : ["init", ".", "--integration", "codex", "--integration-options=--skills"];
  if (input.force) {
    args.push("--force");
  }
  const cwd = mode === "new" ? dirname(targetPath) : targetPath;
  const result = await runCommand("specify", args, cwd, 10 * 60 * 1000);
  const status = await projectStatus({ path: targetPath });

  return {
    ok: result.exitCode === 0,
    mode,
    targetPath,
    command: commandForDisplay("specify", args),
    result,
    status,
  };
}

export async function projectStatus(input: { path?: string } = {}): Promise<ProjectStatus> {
  const root = await findProjectRoot(input.path);
  const [branch, gRoot] = await Promise.all([gitBranch(root), gitRoot(root)]);
  const constitutionPath = resolve(root, ".specify", "memory", "constitution.md");
  const [constitution, officialSkills, features, requiresTests] = await Promise.all([
    inspectMarkdown(constitutionPath, ["Core Principles", "Governance"]),
    listOfficialSkills(root),
    listFeatures(root, branch),
    constitutionRequiresTests(constitutionPath),
  ]);
  const currentFeature = features.find((feature) => feature.isCurrent);
  const initialized = await pathExists(resolve(root, ".specify"));
  const preliminary: ProjectStatus = {
    root,
    initialized,
    gitRoot: gRoot,
    gitBranch: branch,
    constitution,
    officialSkills,
    features,
    currentFeature,
    constitutionRequiresTests: requiresTests,
    nextRecommendedSkill: "$speckit-bootstrap",
    blockers: [],
  };
  const blockers = projectBlockers(preliminary);
  const finalStatus = {
    ...preliminary,
    nextRecommendedSkill: nextSkillForStatus(preliminary),
    blockers,
  };
  return finalStatus;
}

function requireFeature(status: ProjectStatus, blockers: string[]): FeatureStatus | undefined {
  if (!status.currentFeature) {
    blockers.push("No current feature spec found under specs/. Run $speckit-specify.");
    return undefined;
  }
  return status.currentFeature;
}

function addFileGate(blockers: string[], label: string, file: FileCheck, createSkill: string): void {
  if (!file.exists) {
    blockers.push(`Missing ${label}. Run ${createSkill}.`);
    return;
  }
  if (file.hasNeedsClarification) {
    blockers.push(`${label} still contains [NEEDS CLARIFICATION] markers. Run $speckit-clarify or refine the artifact.`);
  }
  if (file.placeholders.length > 0) {
    blockers.push(`${label} contains unresolved template placeholders: ${file.placeholders.slice(0, 5).join(", ")}.`);
  }
  if (file.emptySections.length > 0) {
    blockers.push(`${label} has empty or missing required sections: ${file.emptySections.join(", ")}.`);
  }
}

export async function gatePhase(input: { path?: string; phase: Phase }): Promise<GateResult> {
  const status = await projectStatus({ path: input.path });
  const blockers = [...projectBlockers(status)];
  let nextSkill = status.nextRecommendedSkill;

  if (blockers.length === 0) {
    const feature = requireFeature(status, blockers);
    if (feature) {
      if (input.phase === "plan") {
        addFileGate(blockers, "feature spec", feature.spec, "$speckit-specify");
        nextSkill = blockers.length ? "$speckit-clarify" : "$speckit-plan";
      }
      if (input.phase === "tasks") {
        addFileGate(blockers, "feature spec", feature.spec, "$speckit-specify");
        addFileGate(blockers, "technical plan", feature.plan, "$speckit-plan");
        nextSkill = blockers.length ? status.nextRecommendedSkill : "$speckit-tasks";
      }
      if (input.phase === "implement" || input.phase === "converge") {
        addFileGate(blockers, "feature spec", feature.spec, "$speckit-specify");
        addFileGate(blockers, "technical plan", feature.plan, "$speckit-plan");
        addFileGate(blockers, "task list", feature.tasks, "$speckit-tasks");
        if (feature.tasks.exists && !feature.tasks.taskCount) {
          blockers.push("tasks.md does not contain executable checkbox tasks.");
        }
        if (status.constitutionRequiresTests && feature.tasks.exists && !feature.tasks.testTaskCount) {
          blockers.push("Constitution appears to require tests, but tasks.md has no test tasks.");
        }
        nextSkill = blockers.length ? status.nextRecommendedSkill : input.phase === "implement" ? "$speckit-implement" : "$speckit-converge";
      }
    }
  }

  return {
    phase: input.phase,
    allowed: blockers.length === 0,
    blockers: unique(blockers),
    nextSkill,
    status,
  };
}
