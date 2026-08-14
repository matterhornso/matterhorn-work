import {
  buildMatterhornExecutionModeTools,
  type MatterhornExecutionMode,
} from "./execution-mode";

const NO_TOOLS = { "*": false } as const;

// These are deliberately intent signals, not topic keywords. A conceptual
// question about a protocol does not need to pay for every tool schema. Live
// reads, workspace mutations, and explicit external actions do.
const TOOL_INTENT_PATTERNS: readonly RegExp[] = [
  /\b(?:current|latest|live|today|right now|real[- ]?time)\b/i,
  /\b(?:read|open|inspect|search|browse|fetch|look up|research|find|list)\b/i,
  /\b(?:file|folder|workspace|repository|repo|codebase|attachment|upload|download)\b/i,
  /\b(?:create|write|edit|update|change|delete|remove|rename|move|copy|save|export)\b/i,
  /\b(?:build|fix|implement|run|test|install|configure|connect|deploy|debug)\b/i,
  /\b(?:memory|note|output|artifact|spreadsheet|document|report|mcp|extension)\b/i,
  /\b(?:price|balance|funding|orderbook|position|validator|subnet|receipt)\b/i,
  /\b(?:wallet|transaction|transfer|trade|order|swap|simulate|submit|cancel)\b/i,
  /\b(?:stake|unstake)\b(?=[^\n]{0,80}\b(?:\d|tao|validator|hotkey|wallet)\b)/i,
];

export function promptNeedsMatterhornTools(text: string, hasAttachments = false): boolean {
  if (hasAttachments) return true;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * OpenCode serializes enabled tool schemas into every model request. For a
 * normal answer-only turn that catalog costs thousands of input tokens even
 * though no tool can improve the answer. Keep the existing mode and managed
 * desk allowlists, but make blank Work-mode chat deny tools unless the prompt
 * actually asks for data access or an action.
 */
export function buildMatterhornPromptTools(input: {
  mode: MatterhornExecutionMode;
  agentId?: string | null;
  text: string;
  hasAttachments?: boolean;
}): Record<string, boolean> | undefined {
  const modeTools = buildMatterhornExecutionModeTools(input.mode, input.agentId);
  if (modeTools) return modeTools;

  const agentId = input.agentId?.trim() || "matterhorn";
  if (agentId !== "matterhorn") {
    // Managed desk agents already have a narrow deny-by-default allowlist in
    // their checked-in runtime definition. Do not override it here.
    return undefined;
  }

  return promptNeedsMatterhornTools(input.text, input.hasAttachments)
    ? undefined
    : { ...NO_TOOLS };
}
