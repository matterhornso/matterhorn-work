import { MATTERHORN_WORKFLOW_RUN_EVENT_REDACTED_FIELD_PATTERNS } from "@matterhorn-work/types/workflow-runs";

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
  return SECRET_KEY_PATTERN.test(key);
}

function isMedicalKey(key: string): boolean {
  return MEDICAL_KEY_PATTERN.test(key);
}

export function redactWorkflowRunEventPayload(payload: unknown): {
  redacted: boolean;
  value: RedactedPayload;
} {
  if (payload === null || payload === undefined) {
    return { redacted: false, value: null };
  }

  if (typeof payload === "string") {
    return { redacted: false, value: payload };
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return { redacted: false, value: payload };
  }

  if (isArray(payload)) {
    let redacted = false;
    const value = payload.map((item) => {
      const result = redactWorkflowRunEventPayload(item);
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
          `workflow_run_event_rejected: task logs must not store medical or private clinical details (key: ${key}).`,
        );
      }
      if (shouldRedactKey(key)) {
        redacted = true;
        value[key] = "[REDACTED]";
        continue;
      }
      const result = redactWorkflowRunEventPayload(val);
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
