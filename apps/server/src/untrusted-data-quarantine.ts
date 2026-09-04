type JsonObject = Record<string, unknown>;

const UNTRUSTED_INSTRUCTION_PATTERN = /\b(?:ignore|override|disregard|bypass)\b[\s\S]{0,80}\b(?:instruction|policy|permission|system|tool)|\b(?:call|invoke|run)\b[\s\S]{0,40}\btool\b|\b(?:change|switch|select)\b[\s\S]{0,40}\b(?:agent|provider|model)\b|\b(?:grant|approve|forge|generate)\b[\s\S]{0,40}\b(?:consent|permission|capability|token)\b/i;

const UNTRUSTED_CONTROL_FIELD_PATTERN = /^(?:instruction|systemPrompt|prompt|toolCall|permission|agent|agentId|provider|providerId|model|modelId|privacyConsentToken|consent|capability|grant|access|_matterhornCallId|_matterhornCapability)$/i;

export function containsUntrustedInstruction(value: string): boolean {
  return UNTRUSTED_INSTRUCTION_PATTERN.test(value);
}

/**
 * External crypto metadata is data, never control. Instruction-like strings
 * and control-plane-shaped keys are replaced before model projection while the
 * unrestricted source remains available only to bounded evidence storage.
 */
export function quarantineUntrustedContent(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return containsUntrustedInstruction(value)
      ? "[Matterhorn quarantined instruction-like external content]"
      : value;
  }
  if (value == null || typeof value !== "object") return value;
  if (depth >= 10) return "[Matterhorn quarantined over-nested external content]";
  if (Array.isArray(value)) return value.map((item) => quarantineUntrustedContent(item, depth + 1));
  return Object.fromEntries(Object.entries(value as JsonObject).map(([key, item]) => [
    key,
    UNTRUSTED_CONTROL_FIELD_PATTERN.test(key)
      ? "[Matterhorn quarantined an untrusted control field]"
      : quarantineUntrustedContent(item, depth + 1),
  ]));
}

export function untrustedContentChanged(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

