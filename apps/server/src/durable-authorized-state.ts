import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import type {
  GuardedRuntimeStateKind,
  MatterhornGuardedRuntimeStateStore,
} from "./guarded-runtime-state-store.js";

/**
 * Narrow adapter for short-lived authority-bearing records in guarded SQLite.
 *
 * The authenticated envelope binds the payload to the exact kind, key, tenant,
 * session, expiry, and SQLite update time used for persistence. Callers still
 * validate their domain payload after opening it; this boundary prevents a
 * valid-looking raw or transplanted row from reaching that validator.
 */
export class MatterhornDurableAuthorizedState {
  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly authority: MatterhornDurableStateAuthority,
    private readonly kind: GuardedRuntimeStateKind,
    private readonly invalidCode: string,
    private readonly invalidError: () => Error = () => new Error(invalidCode),
  ) {}

  get<T>(key: string, nowMs: number): T | null {
    try {
      return this.authority.open<T>(
        this.stateStore.getRecord<unknown>(this.kind, key, nowMs),
        this.invalidCode,
      );
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  take<T>(key: string, nowMs: number): T | null {
    try {
      return this.authority.open<T>(
        this.stateStore.takeRecord<unknown>(this.kind, key, nowMs),
        this.invalidCode,
      );
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  list<T>(input: { workspaceId?: string; nowMs?: number } = {}): T[] {
    try {
      return this.stateStore.listRecords<unknown>(this.kind, input).map((record) => {
        const value = this.authority.open<T>(record, this.invalidCode);
        if (value === null) throw this.invalidError();
        return value;
      });
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  put<T>(input: {
    key: string;
    workspaceId: string;
    sessionId?: string | null;
    value: T;
    expiresAtMs: number;
    nowMs: number;
  }): void {
    const sessionId = input.sessionId ?? null;
    this.assertWritable(input);
    this.stateStore.put({
      kind: this.kind,
      key: input.key,
      workspaceId: input.workspaceId,
      sessionId,
      value: this.authority.seal({
        kind: this.kind,
        key: input.key,
        workspaceId: input.workspaceId,
        sessionId,
        expiresAtMs: input.expiresAtMs,
        updatedAtMs: input.nowMs,
        value: input.value,
      }),
      expiresAtMs: input.expiresAtMs,
      nowMs: input.nowMs,
    });
  }

  putIfAbsent<T>(input: {
    key: string;
    workspaceId: string;
    sessionId?: string | null;
    value: T;
    expiresAtMs: number;
    nowMs: number;
  }): boolean {
    this.assertWritable(input);
    const sessionId = input.sessionId ?? null;
    return this.stateStore.putIfAbsent({
      kind: this.kind,
      key: input.key,
      workspaceId: input.workspaceId,
      sessionId,
      value: this.authority.seal({
        kind: this.kind,
        key: input.key,
        workspaceId: input.workspaceId,
        sessionId,
        expiresAtMs: input.expiresAtMs,
        updatedAtMs: input.nowMs,
        value: input.value,
      }),
      expiresAtMs: input.expiresAtMs,
      nowMs: input.nowMs,
    });
  }

  delete(key: string): boolean {
    return this.stateStore.delete(this.kind, key);
  }

  private assertWritable(input: {
    key: string;
    workspaceId: string;
    expiresAtMs: number;
    nowMs: number;
  }): void {
    if (!input.key
      || !input.workspaceId
      || !Number.isSafeInteger(input.expiresAtMs)
      || !Number.isSafeInteger(input.nowMs)
      || input.expiresAtMs <= input.nowMs) {
      throw this.invalidError();
    }
  }

  private rethrowIntegrityFailure(error: unknown): never {
    if (error instanceof Error
      && (error.message === this.invalidCode || error.message === "guarded_runtime_state_corrupt")) {
      throw this.invalidError();
    }
    throw error;
  }
}
