import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bootstrapProject, checkEnvironment, gatePhase, installSpecifyCli, projectStatus } from "./core.js";

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: (error as Error).message || String(error),
      },
    ],
  };
}

function tool<T extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: T,
  handler: (input: z.infer<z.ZodObject<T>>) => Promise<unknown>,
) {
  const parser = z.object(inputSchema);
  const registerToolAny = server.registerTool.bind(server) as (
    toolName: string,
    config: Record<string, unknown>,
    cb: (input: Record<string, unknown>) => Promise<ReturnType<typeof jsonResult> | ReturnType<typeof errorResult>>,
  ) => unknown;
  registerToolAny(
    name,
    {
      title: name,
      description,
      inputSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        return jsonResult(await handler(parser.parse(input)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

const server = new McpServer({
  name: "speckit-codex-flow",
  version: "0.1.0",
});

tool(
  server,
  "check_environment",
  "Check local Codex, uv, specify, PowerShell, Git root, and pinned Spec Kit version readiness.",
  {
    path: z.string().optional(),
  },
  async (input) => checkEnvironment(input),
);

tool(
  server,
  "install_specify_cli",
  "Install or upgrade specify-cli with uv, pinned to the requested Spec Kit tag.",
  {
    tag: z.string().default("v0.12.2"),
  },
  async (input) => installSpecifyCli(input),
);

tool(
  server,
  "bootstrap_project",
  "Run official Spec Kit initialization for Codex skills in a new or existing project.",
  {
    path: z.string().optional(),
    mode: z.enum(["current", "new"]).default("current"),
    force: z.boolean().default(false),
  },
  async (input) => bootstrapProject(input),
);

tool(
  server,
  "project_status",
  "Read Spec Kit project state, official project-local skills, feature artifacts, and recommended next skill.",
  {
    path: z.string().optional(),
  },
  async (input) => projectStatus(input),
);

tool(
  server,
  "gate_phase",
  "Evaluate strict Spec Kit gates before plan, tasks, implement, or converge.",
  {
    path: z.string().optional(),
    phase: z.enum(["plan", "tasks", "implement", "converge"]),
  },
  async (input) => gatePhase(input),
);

await server.connect(new StdioServerTransport());
