import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkEnvironment, DEFAULT_SPEC_KIT_TAG, gatePhase, projectStatus } from "../src/core.js";

const tempRoots: string[] = [];

async function tempProject(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "speckit-flow-"));
  tempRoots.push(root);
  return root;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = resolve(root, relativePath);
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function createOfficialSkill(root: string): Promise<void> {
  await write(
    root,
    ".agents/skills/speckit-constitution/SKILL.md",
    [
      "---",
      "name: speckit-constitution",
      "description: Test skill.",
      "---",
      "",
      "# Test Skill",
      "",
    ].join("\n"),
  );
}

async function createConstitution(root: string, requiresTests = true): Promise<void> {
  await write(
    root,
    ".specify/memory/constitution.md",
    [
      "# Test Constitution",
      "",
      "## Core Principles",
      "",
      requiresTests ? "All changed behavior has REQUIRED tests before implementation." : "Keep changes small and reviewable.",
      "",
      "## Governance",
      "",
      "Review constitution compliance before implementation.",
      "",
    ].join("\n"),
  );
}

async function createSpec(root: string, extraRequirement = ""): Promise<void> {
  await write(
    root,
    "specs/001-demo/spec.md",
    [
      "# Feature Specification: Demo",
      "",
      "## User Scenarios & Testing",
      "",
      "A user can complete the demo flow.",
      "",
      "### User Story 1 - Demo (Priority: P1)",
      "",
      "The user completes the main workflow.",
      "",
      "## Requirements",
      "",
      "### Functional Requirements",
      "",
      "- **FR-001**: System MUST support the demo flow.",
      extraRequirement,
      "",
      "## Success Criteria",
      "",
      "- **SC-001**: Demo flow completes successfully.",
      "",
    ].join("\n"),
  );
}

async function createPlan(root: string): Promise<void> {
  await write(
    root,
    "specs/001-demo/plan.md",
    [
      "# Implementation Plan: Demo",
      "",
      "## Summary",
      "",
      "Implement the demo flow.",
      "",
      "## Technical Context",
      "",
      "Use the existing stack.",
      "",
      "## Constitution Check",
      "",
      "No violations found.",
      "",
    ].join("\n"),
  );
}

async function createTasks(root: string, includeTests = true): Promise<void> {
  await write(
    root,
    "specs/001-demo/tasks.md",
    [
      "# Tasks: Demo",
      "",
      includeTests ? "- [ ] T001 Write unit tests for the demo flow" : "- [ ] T001 Implement the demo flow",
      "- [ ] T002 Wire the demo flow into the app",
      "",
    ].join("\n"),
  );
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("environment", () => {
  it("reports pinned Spec Kit metadata and command statuses", async () => {
    const env = await checkEnvironment();

    expect(env.pinnedSpecKit.tag).toBe(DEFAULT_SPEC_KIT_TAG);
    expect(env.commands).toHaveProperty("codex");
    expect(env.commands).toHaveProperty("uv");
    expect(env.commands).toHaveProperty("specify");
  });
});

describe("project status and gates", () => {
  it("recommends bootstrap for an uninitialized project", async () => {
    const root = await tempProject();
    const status = await projectStatus({ path: root });
    const gate = await gatePhase({ path: root, phase: "implement" });

    expect(status.initialized).toBe(false);
    expect(status.nextRecommendedSkill).toBe("$speckit-bootstrap");
    expect(gate.allowed).toBe(false);
    expect(gate.blockers.join("\n")).toContain("not initialized");
  });

  it("allows implementation when constitution, spec, plan, and test tasks are complete", async () => {
    const root = await tempProject();
    await createConstitution(root, true);
    await createOfficialSkill(root);
    await createSpec(root);
    await createPlan(root);
    await createTasks(root, true);

    const gate = await gatePhase({ path: root, phase: "implement" });

    expect(gate.allowed).toBe(true);
    expect(gate.nextSkill).toBe("$speckit-implement");
    expect(gate.status.currentFeature?.name).toBe("001-demo");
  });

  it("blocks planning when the spec has unresolved clarification markers", async () => {
    const root = await tempProject();
    await createConstitution(root, false);
    await createOfficialSkill(root);
    await createSpec(root, "- **FR-002**: System MUST support [NEEDS CLARIFICATION: unclear mode].");

    const gate = await gatePhase({ path: root, phase: "plan" });

    expect(gate.allowed).toBe(false);
    expect(gate.blockers.join("\n")).toContain("NEEDS CLARIFICATION");
    expect(gate.nextSkill).toBe("$speckit-clarify");
  });

  it("blocks implementation when tests are required but tasks contain no test work", async () => {
    const root = await tempProject();
    await createConstitution(root, true);
    await createOfficialSkill(root);
    await createSpec(root);
    await createPlan(root);
    await createTasks(root, false);

    const gate = await gatePhase({ path: root, phase: "implement" });

    expect(gate.allowed).toBe(false);
    expect(gate.blockers.join("\n")).toContain("no test tasks");
  });
});
