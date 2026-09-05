import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import type {
  GuardedRuntimeStateKind,
  GuardedRuntimeStateRecord,
  MatterhornGuardedRuntimeStateStore,
} from "./guarded-runtime-state-store.js";

/**
 * Narrow adapter for authority-bearing records in guarded SQLite.
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

  getRecord<T>(key: string, nowMs: number): GuardedRuntimeStateRecord<T> | null {
    try {
      return this.openRecord<T>(this.stateStore.getRecord<unknown>(this.kind, key, nowMs));
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  get<T>(key: string, nowMs: number): T | null {
    return this.getRecord<T>(key, nowMs)?.value ?? null;
  }

  takeRecord<T>(key: string, nowMs: number): GuardedRuntimeStateRecord<T> | null {
    try {
      return this.openRecord<T>(this.stateStore.takeRecord<unknown>(this.kind, key, nowMs));
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  take<T>(key: string, nowMs: number): T | null {
    return this.takeRecord<T>(key, nowMs)?.value ?? null;
  }

  listRecords<T>(input: { workspaceId?: string; nowMs?: number } = {}): GuardedRuntimeStateRecord<T>[] {
    try {
      return this.stateStore.listRecords<unknown>(this.kind, input).map((record) => {
        const opened = this.openRecord<T>(record);
        if (!opened) throw this.invalidError();
        return opened;
      });
    } catch (error) {
      return this.rethrowIntegrityFailure(error);
    }
  }

  list<T>(input: { workspaceId?: string; nowMs?: number } = {}): T[] {
    return this.listRecords<T>(input).map((record) => record.value);
  }

  put<T>(input: {
    key: string;
    workspaceId: string;
    sessionId?: string | null;
    value: T;
    expiresAtMs: number | null;
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
    expiresAtMs: number | null;
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
    expiresAtMs: number | null;
    nowMs: number;
  }): void {
    if (!input.key
      || !input.workspaceId
      || !Number.isSafeInteger(input.nowMs)
      || (input.expiresAtMs !== null
        && (!Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs <= input.nowMs))) {
      throw this.invalidError();
    }
  }

  private openRecord<T>(
    record: GuardedRuntimeStateRecord<unknown> | null,
  ): GuardedRuntimeStateRecord<T> | null {
    if (!record) return null;
    const value = this.authority.open<T>(record, this.invalidCode);
    if (value === null) throw this.invalidError();
    return { ...record, value };
  }

  private rethrowIntegrityFailure(error: unknown): never {
    if (error instanceof Error
      && (error.message === this.invalidCode || error.message === "guarded_runtime_state_corrupt")) {
      throw this.invalidError();
    }
    throw error;
  }
}
