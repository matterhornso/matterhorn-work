type RequestStage = "preflight" | "dispatch";
type DiagnosticValue = string | number | boolean | null;
type DiagnosticRecord = (name: string, data: Record<string, DiagnosticValue>) => void;

// Opaque identifiers only. Never accept paths, URLs, request bodies or free text.
export function diagnosticIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

function failureMetadata(error: unknown): Record<string, DiagnosticValue> {
  let status: number | null = null;
  if (error && typeof error === "object" && "status" in error &&
    typeof error.status === "number" && Number.isInteger(error.status) &&
    error.status >= 400 && error.status <= 599) {
    status = error.status;
  }
  // Only classify known local errors. Never copy messages, stacks, backend
  // details, or arbitrary backend error codes into the diagnostic buffer.
  const failure = error instanceof Error && error.message === "Request timed out."
    ? "timeout"
    : error instanceof Error && error.name === "AbortError"
      ? "aborted"
      : status === 401 || status === 403
        ? "access_denied"
        : status === 429
          ? "rate_limited"
          : status !== null && status >= 500
            ? "server_error"
            : status !== null
              ? "request_rejected"
              : "request_failed";
  return { failure, status };
}

function resultMetadata(stage: RequestStage, result: unknown): Record<string, DiagnosticValue> {
  if (!result || typeof result !== "object") return {};
  if (stage === "preflight" && "decision" in result) {
    const decision = result.decision;
    return { decision: decision === "allow" || decision === "blocked" || decision === "consent_required"
      ? decision : "unknown" };
  }
  if (stage === "dispatch" && "accepted" in result && result.accepted === true) {
    return {
      accepted: true,
      runId: "runId" in result ? diagnosticIdentifier(result.runId) : null,
      acceptedSessionId: "sessionId" in result ? diagnosticIdentifier(result.sessionId) : null,
    };
  }
  return {};
}

export function createPromptRequestDiagnostics(input: {
  attemptId: string;
  workspaceId: string;
  sessionId: string;
  record: DiagnosticRecord;
  now?: () => number;
}) {
  const now = input.now ?? (() => performance.now());
  const context = {
    attemptId: diagnosticIdentifier(input.attemptId),
    workspaceId: diagnosticIdentifier(input.workspaceId),
    sessionId: diagnosticIdentifier(input.sessionId),
  };
  const record: DiagnosticRecord = (name, data) => {
    try {
      input.record(name, { ...context, ...data });
    } catch {
      // Observability must never change submission, consent or retry behavior.
    }
  };
  return {
    async observe<T>(stage: RequestStage, request: () => Promise<T>): Promise<T> {
      const started = now();
      record(`session.request.${stage}.started`, {});
      try {
        const result = await request();
        const elapsed = Math.max(0, Math.round(now() - started));
        record(`session.request.${stage}.completed`, {
          durationMs: Number.isFinite(elapsed) ? elapsed : 0,
          ...resultMetadata(stage, result),
        });
        return result;
      } catch (error) {
        const elapsed = Math.max(0, Math.round(now() - started));
        record(`session.request.${stage}.failed`, {
          durationMs: Number.isFinite(elapsed) ? elapsed : 0,
          ...failureMetadata(error),
        });
        throw error;
      }
    },
  };
}
