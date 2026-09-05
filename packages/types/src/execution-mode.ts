import {
  buildMatterhornDeskReadOnlyTools,
  getMatterhornDeskAgentById,
} from "./desk-agents.js";

export type MatterhornExecutionMode = "discuss" | "plan" | "work";
export type MatterhornReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const MATTERHORN_EXECUTION_MODE_HEADER = "x-matterhorn-execution-mode";

export const MATTERHORN_EXECUTION_MODE_OPTIONS: ReadonlyArray<{
  value: MatterhornExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: "discuss",
    label: "Discuss",
    description: "Answer questions and look up information. Nothing is changed.",
  },
  {
    value: "plan",
    label: "Plan",
    description: "Research the request and suggest next steps. Nothing is changed.",
  },
  {
    value: "work",
    label: "Work",
    description: "Use approved tools to complete the task. Wallet actions still need your approval.",
  },
];

const DEFAULT_READ_ONLY_TOOLS = ["read", "glob", "grep", "webfetch", "websearch"] as const;
const MATTERHORN_REASONING_EFFORTS = new Set<MatterhornReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export function isMatterhornExecutionMode(value: unknown): value is MatterhornExecutionMode {
  return value === "discuss" || value === "plan" || value === "work";
}

export function normalizeMatterhornExecutionMode(value: unknown): MatterhornExecutionMode {
  return isMatterhornExecutionMode(value) ? value : "work";
}

export function isMatterhornReasoningEffort(value: unknown): value is MatterhornReasoningEffort {
  return typeof value === "string" && MATTERHORN_REASONING_EFFORTS.has(value.trim().toLowerCase() as MatterhornReasoningEffort);
}

export function normalizeMatterhornReasoningEffort(value: unknown): MatterhornReasoningEffort | undefined {
  if (!isMatterhornReasoningEffort(value)) return undefined;
  return value.trim().toLowerCase() as MatterhornReasoningEffort;
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
        "Lead with the answer, stay concise, and expand only when it improves the user's decision.",
        "Do not edit files, run shell commands, invoke commands, create saved previews, or change local or external state.",
      ]
    : mode === "plan"
      ? [
          "Inspect read-only context and produce a concrete, ordered implementation plan.",
          "Make the plan decision-ready: state the recommendation first, then dependencies, risks, verification, and the shortest safe path.",
          "Do not edit files, run shell commands, invoke commands, create saved previews, or change local or external state.",
          "End with the next action that can begin when the user switches to Work mode.",
        ]
      : [
          "Work within the current project and the tools and approvals available to this agent.",
          "Act before narrating, parallelize independent reads, and ask only for missing safety-critical information.",
          "For structured actions, collect all missing fields in one compact request and return the reviewable result before commentary.",
          "Ask for approval whenever the runtime or product safety policy requires it.",
        ];

  return [
    "## Matterhorn Execution Mode",
    `Mode: ${mode}`,
    ...behavior,
    "Never expose hidden chain-of-thought or internal deliberation. Provide conclusions, concise rationale, and verifiable evidence instead.",
    "This mode never weakens desk allowlists, authorized workspace roots, connected-wallet boundaries, billing controls, secret handling, or transaction safety.",
  ].join("\n");
}
