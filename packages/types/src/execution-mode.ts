import {
  buildMatterhornDeskReadOnlyTools,
  getMatterhornDeskAgentById,
} from "./desk-agents.js";

export type MatterhornExecutionMode = "discuss" | "plan" | "work";

export const MATTERHORN_EXECUTION_MODE_HEADER = "x-matterhorn-execution-mode";

export const MATTERHORN_EXECUTION_MODE_OPTIONS: ReadonlyArray<{
  value: MatterhornExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: "discuss",
    label: "Discuss",
    description: "Answer and inspect read-only context. No edits or commands.",
  },
  {
    value: "plan",
    label: "Plan",
    description: "Research and produce a plan. No edits or commands.",
  },
  {
    value: "work",
    label: "Work",
    description: "Edit this project and use approved tools within its safety limits.",
  },
];

const DEFAULT_READ_ONLY_TOOLS = ["read", "glob", "grep", "webfetch", "websearch"] as const;

export function isMatterhornExecutionMode(value: unknown): value is MatterhornExecutionMode {
  return value === "discuss" || value === "plan" || value === "work";
}

export function normalizeMatterhornExecutionMode(value: unknown): MatterhornExecutionMode {
  return isMatterhornExecutionMode(value) ? value : "work";
}

/**
 * Request-scoped restrictions are deny-by-default. Known desk agents receive
 * only the read-only subset declared by their manifest; unknown agents receive
 * no tools so changing mode can never broaden a custom agent's permissions.
 */
export function buildMatterhornExecutionModeTools(
  mode: MatterhornExecutionMode,
  agentId?: string | null,
): Record<string, boolean> | undefined {
  if (mode === "work") return undefined;

  const normalizedAgentId = agentId?.trim() || "matterhorn";
  const deskAgent = getMatterhornDeskAgentById(normalizedAgentId);
  if (deskAgent && normalizedAgentId !== "matterhorn") {
    return buildMatterhornDeskReadOnlyTools(deskAgent);
  }
  const allowedTools = normalizedAgentId === "matterhorn" ? DEFAULT_READ_ONLY_TOOLS : [];

  return Object.fromEntries([
    ["*", false],
    ...allowedTools.map((tool) => [tool, true] as const),
  ]);
}

export function buildMatterhornExecutionModeSystemPrompt(mode: MatterhornExecutionMode): string {
  const behavior = mode === "discuss"
    ? [
        "Answer, explain, and inspect read-only context only.",
        "Do not edit files, run shell commands, invoke commands, create saved previews, or change local or external state.",
      ]
    : mode === "plan"
      ? [
          "Inspect read-only context and produce a concrete, ordered implementation plan.",
          "Do not edit files, run shell commands, invoke commands, create saved previews, or change local or external state.",
          "End with the next action that can begin when the user switches to Work mode.",
        ]
      : [
          "Work within the current project and the tools and approvals available to this agent.",
          "Ask for approval whenever the runtime or product safety policy requires it.",
        ];

  return [
    "## Matterhorn Execution Mode",
    `Mode: ${mode}`,
    ...behavior,
    "This mode never weakens desk allowlists, authorized workspace roots, wallet review, external-signer boundaries, billing controls, secret handling, or transaction safety.",
  ].join("\n");
}
