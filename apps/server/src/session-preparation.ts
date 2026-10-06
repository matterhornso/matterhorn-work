import { ApiError } from "./errors.js";

export interface SessionPreparationScope {
  workspaceId: string;
  sessionId: string;
  subjectId: string;
}

// Tracks admitted, in-process preparations, not accepted runtime work. Every
// checkpoint rechecks the original principal as well as explicit cancellation.
export class SessionPreparationRegistry {
  private readonly pending = new Map<Request, { scope: SessionPreparationScope; stopped: boolean }>();

  constructor(private readonly assertAccess: (request: Request) => void) {}

  async run<T>(scope: SessionPreparationScope, request: Request, prepare: () => Promise<T>): Promise<T> {
    const entry = { scope, stopped: false };
    this.pending.set(request, entry);
    try {
      this.assertActive(request);
      return await prepare();
    } finally {
      this.pending.delete(request);
    }
  }

  assertActive(request: Request): void {
    this.assertAccess(request);
    if (request.signal.aborted || this.pending.get(request)?.stopped) {
      throw new ApiError(403, "write_denied", "Request stopped before model dispatch.", { reason: "cancelled" });
    }
  }

  stop(scope: SessionPreparationScope): void {
    for (const entry of this.pending.values()) {
      if (entry.scope.workspaceId === scope.workspaceId
        && entry.scope.sessionId === scope.sessionId
        && entry.scope.subjectId === scope.subjectId) entry.stopped = true;
    }
  }
}
