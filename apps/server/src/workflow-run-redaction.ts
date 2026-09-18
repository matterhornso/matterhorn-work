import { MATTERHORN_WORKFLOW_RUN_EVENT_REDACTED_FIELD_PATTERNS } from "@matterhorn-work/types/workflow-runs";
import { containsForbiddenMemorySecretMaterial, FORBIDDEN_MEMORY_SECRET_FIELD_NAMES } from "@matterhorn-work/types/memory";

const SECRET_KEY_PATTERN = new RegExp(
  `^(.*[_-])?(${MATTERHORN_WORKFLOW_RUN_EVENT_REDACTED_FIELD_PATTERNS.join("|")})([_-].*)?$`,
  "i",
);

const MEDICAL_KEY_PATTERN = /(diagnosis|prescription|clinicalRecord|clinical_record|medicalRecord|medical_record|patientId|patient_id)/i;

export type RedactedPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
    || FORBIDDEN_MEMORY_SECRET_FIELD_NAMES.some((field) => field.toLowerCase() === key.toLowerCase());
}

export function redactWorkflowRunText(value: string, fieldName = "text"): string {
  // Reuse the bounded secret scanner, preserving public hash/address field context.
  const secret = containsForbiddenMemorySecretMaterial({ [fieldName]: value })
    || /\bbearer\s+[a-z0-9._~+/=-]+/i.test(value)
    || /\b(?:api[_-]?key|authorization|password|passphrase|secret|token)\s*[:=]\s*\S+/i.test(value);
  return secret ? "[REDACTED]" : value;
}

function isMedicalKey(key: string): boolean {
  return MEDICAL_KEY_PATTERN.test(key);
}

export function redactWorkflowRunEventPayload(payload: unknown, fieldName?: string): {
  redacted: boolean;
  value: RedactedPayload;
} {
  return redactPayload(payload, fieldName, { nodes: 0, seen: new WeakSet<object>() }, 0);
}

function redactPayload(
  payload: unknown,
  fieldName: string | undefined,
  scan: { nodes: number; seen: WeakSet<object> },
  depth: number,
): { redacted: boolean; value: RedactedPayload } {
  scan.nodes += 1;
  if (depth > 64 || scan.nodes > 4096) {
    throw new Error("workflow_run_event_rejected: task log payload exceeds safe inspection limits.");
  }
  if (typeof payload === "object" && payload !== null) {
    if (scan.seen.has(payload)) {
      throw new Error("workflow_run_event_rejected: task log payload contains repeated object references.");
    }
    scan.seen.add(payload);
  }
  if (payload === null || payload === undefined) {
    return { redacted: false, value: null };
  }

  if (typeof payload === "string") {
    const value = redactWorkflowRunText(payload, fieldName);
    return { redacted: value !== payload, value };
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return { redacted: false, value: payload };
  }

  if (isArray(payload)) {
    let redacted = false;
    const value = payload.map((item) => {
      const result = redactPayload(item, fieldName, scan, depth + 1);
      if (result.redacted) redacted = true;
      return result.value;
    });
    return { redacted, value };
  }

  if (isRecord(payload)) {
    let redacted = false;
    const value: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload)) {
      if (isMedicalKey(key)) {
        throw new Error(
          "workflow_run_event_rejected: task logs must not store medical or private clinical details.",
        );
      }
      if (shouldRedactKey(key)) {
        redacted = true;
        value[key] = "[REDACTED]";
        continue;
      }
      const result = redactPayload(val, key, scan, depth + 1);
      if (result.redacted) redacted = true;
      value[key] = result.value;
    }
    return { redacted, value };
  }

  return { redacted: false, value: String(payload) };
}

export function sanitizeWorkflowRunEventPayload(payload: unknown): RedactedPayload {
  return redactWorkflowRunEventPayload(payload).value;
}
