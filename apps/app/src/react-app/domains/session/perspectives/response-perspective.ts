export type ResponsePerspective = "cautious" | "balanced" | "optimistic";

export const RESPONSE_PERSPECTIVE_OPTIONS: Array<{
  value: ResponsePerspective;
  label: string;
  description: string;
}> = [
  {
    value: "cautious",
    label: "Cautious",
    description: "Less optimistic: lead with risks, reversibility, and what could go wrong.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Normal: answer directly with evidence, tradeoffs, and no directional spin.",
  },
  {
    value: "optimistic",
    label: "Optimistic",
    description: "Lead with possibilities and practical opportunities while keeping every safety boundary.",
  },
];

const STORAGE_PREFIX = "matterhorn.response-perspective.v1";

function storageKey(workspaceId: string, sessionId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}:${sessionId}`;
}

function isResponsePerspective(value: unknown): value is ResponsePerspective {
  return value === "cautious" || value === "balanced" || value === "optimistic";
}

export function readResponsePerspective(workspaceId: string, sessionId: string | null): ResponsePerspective {
  if (!workspaceId || !sessionId || typeof window === "undefined") return "balanced";
  try {
    const stored = window.localStorage.getItem(storageKey(workspaceId, sessionId));
    return isResponsePerspective(stored) ? stored : "balanced";
  } catch {
    return "balanced";
  }
}

export function writeResponsePerspective(
  workspaceId: string,
  sessionId: string | null,
  perspective: ResponsePerspective,
) {
  if (!workspaceId || !sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(workspaceId, sessionId), perspective);
  } catch {
    // Storage is optional; the active chat still keeps its in-memory selection.
  }
}

export function buildResponsePerspectiveSystemPrompt(perspective: ResponsePerspective) {
  // Balanced is the runtime default and is already enforced by the direct
  // response and execution-mode contracts. Sending another neutral framing
  // block on every turn adds tokens without changing behavior.
  if (perspective === "balanced") return "";
  const framing = perspective === "cautious"
    ? "Answer cautiously. Lead with material risks, failure cases, reversibility, and what could go wrong before describing upside."
    : "Answer constructively. Lead with realistic possibilities, opportunities, and actionable next steps while acknowledging material tradeoffs.";

  return `## Response Perspective\n${framing}\nThis changes framing only. Never remove, weaken, delay, or hide safety constraints, non-custodial boundaries, external-signer requirements, financial risk disclosures, compliance limits, or wellness disclaimers.`;
}
