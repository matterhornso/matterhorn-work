import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  MATTERHORN_COWORKER_SESSION_BINDING_VERSION,
  type MatterhornCoworkerResourceScope,
  type MatterhornCoworkerInboxItem,
  type MatterhornCoworkerInboxSummary,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerSessionBinding,
  type MatterhornCoworkerWatch,
  type MatterhornCoworkerWorkingState,
  validateMatterhornCoworkerInboxItem,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerResourceScope,
  validateMatterhornCoworkerWatch,
  validateMatterhornCoworkerWorkingState,
} from "@matterhorn-work/types/crypto-coworkers";
import {
  containsForbiddenCoworkerInboxMaterial,
  containsForbiddenCoworkerProfileMaterial,
  containsForbiddenCoworkerWatchMaterial,
  containsForbiddenCoworkerWorkingStateMaterial,
} from "./crypto-coworker-secret-boundary.js";

type SqliteRunResult = { changes?: number };
type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => SqliteRunResult;
};
type SqliteDatabase = {
  exec: (sql: string) => unknown;
  close: () => unknown;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
};
type SqliteConstructor = new (path: string) => SqliteDatabase;

type CoworkerRow = {
  workspace_id: string;
  owner_id: string;
  coworker_id: string;
  revision: number;
  state: string;
  policy_version: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
};

type CoworkerWorkingStateRow = {
  workspace_id: string;
  owner_id: string;
  coworker_id: string;
  revision: number;
  profile_revision: number;
  state_json: string;
  created_at: string;
  updated_at: string;
};

type CoworkerResourceScopeRow = {
  workspace_id: string;
  owner_id: string;
  coworker_id: string;
  revision: number;
  profile_revision: number;
  scope_hash: string;
  scope_json: string;
  created_at: string;
  updated_at: string;
};

type CoworkerSessionBindingRow = {
  workspace_id: string;
  owner_id: string;
  session_id: string;
  coworker_id: string;
  coworker_revision: number;
  resource_scope_hash: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type CoworkerWatchRow = {
  workspace_id: string;
  owner_id: string;
  coworker_id: string;
  watch_id: string;
  revision: number;
  profile_revision: number;
  state: string;
  next_check_at: string;
  watch_json: string;
  created_at: string;
  updated_at: string;
};

type CoworkerInboxItemRow = {
  workspace_id: string;
  owner_id: string;
  coworker_id: string;
  item_id: string;
  state: string;
  created_at: string;
  updated_at: string;
  item_json: string;
};

type CoworkerAccessRow = {
  access_id: string;
  owner_id: string;
  state: string;
  granted_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export type MatterhornCoworkerAccessRecord = {
  accessId: string;
  ownerId: string;
  state: "active" | "revoked";
  grantedAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type MatterhornCoworkerAccessPurgeResult = {
  accessDeleted: number;
  inviteBindingsCleared: number;
};

export type MatterhornCoworkerAccessMaintenanceResult = {
  revokedAccessDeleted: number;
  invitesDeleted: number;
};

const require = createRequire(import.meta.url);

function openSqliteDatabase(path: string): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as { Database: new (path: string) => SqliteDatabase };
    return new bunSqlite.Database(path);
  }
  const betterSqlite = require("better-sqlite3") as { default?: SqliteConstructor } | SqliteConstructor;
  const DatabaseCtor = (typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default) as SqliteConstructor;
  return new DatabaseCtor(path);
}

function statement(db: SqliteDatabase, sql: string): SqliteStatement {
  if (db.prepare) return db.prepare(sql);
  if (db.query) return db.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

function profileFromRow(row: CoworkerRow): MatterhornCoworkerProfile {
  let profile: unknown;
  try {
    profile = JSON.parse(row.profile_json);
  } catch {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  const issues = validateMatterhornCoworkerProfile(profile);
  if (issues.length > 0) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  const result = profile as MatterhornCoworkerProfile;
  if (containsForbiddenCoworkerProfileMaterial(result)
    || result.workspaceId !== row.workspace_id
    || result.ownerId !== row.owner_id
    || result.id !== row.coworker_id
    || result.revision !== row.revision
    || result.state !== row.state
    || result.policyVersion !== row.policy_version
    || result.createdAt !== row.created_at
    || result.updatedAt !== row.updated_at) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return structuredClone(result);
}

function workingStateFromRow(row: CoworkerWorkingStateRow): MatterhornCoworkerWorkingState {
  let state: unknown;
  try {
    state = JSON.parse(row.state_json);
  } catch {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  if (validateMatterhornCoworkerWorkingState(state).length > 0
    || containsForbiddenCoworkerWorkingStateMaterial(state as Record<string, unknown>)) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  const result = state as MatterhornCoworkerWorkingState;
  if (result.workspaceId !== row.workspace_id
    || result.ownerId !== row.owner_id
    || result.coworkerId !== row.coworker_id
    || result.revision !== row.revision
    || result.profileRevision !== row.profile_revision
    || result.createdAt !== row.created_at
    || result.updatedAt !== row.updated_at) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return structuredClone(result);
}

function resourceScopeFromRow(row: CoworkerResourceScopeRow): MatterhornCoworkerResourceScope {
  let scope: unknown;
  try {
    scope = JSON.parse(row.scope_json);
  } catch {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  if (validateMatterhornCoworkerResourceScope(scope).length > 0) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  const result = scope as MatterhornCoworkerResourceScope;
  const expectedScopeHash = createHash("sha256").update(JSON.stringify({
    workspaceId: result.workspaceId,
    ownerId: result.ownerId,
    coworkerId: result.coworkerId,
    profileRevision: result.profileRevision,
    agentFiles: result.agentFiles,
    memories: result.memories,
    connections: result.connections,
    privacy: result.privacy,
  })).digest("hex");
  if (result.workspaceId !== row.workspace_id
    || result.ownerId !== row.owner_id
    || result.coworkerId !== row.coworker_id
    || result.revision !== row.revision
    || result.profileRevision !== row.profile_revision
    || result.scopeHash !== row.scope_hash
    || result.scopeHash !== expectedScopeHash
    || result.createdAt !== row.created_at
    || result.updatedAt !== row.updated_at) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return structuredClone(result);
}

function sessionBindingFromRow(row: CoworkerSessionBindingRow): MatterhornCoworkerSessionBinding {
  if (!row.workspace_id
    || !row.owner_id
    || !row.session_id
    || !row.coworker_id
    || !Number.isSafeInteger(row.coworker_revision)
    || row.coworker_revision < 1
    || !/^[a-f0-9]{64}$/.test(row.resource_scope_hash)
    || !Number.isSafeInteger(row.revision)
    || row.revision < 1
    || !Number.isFinite(Date.parse(row.created_at))
    || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return {
    version: MATTERHORN_COWORKER_SESSION_BINDING_VERSION,
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    sessionId: row.session_id,
    coworkerId: row.coworker_id,
    coworkerRevision: row.coworker_revision,
    resourceScopeHash: row.resource_scope_hash,
    revision: row.revision,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function watchFromRow(row: CoworkerWatchRow): MatterhornCoworkerWatch {
  let watch: unknown;
  try {
    watch = JSON.parse(row.watch_json);
  } catch {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  if (validateMatterhornCoworkerWatch(watch).length > 0
    || containsForbiddenCoworkerWatchMaterial(watch as Record<string, unknown>)) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  const result = watch as MatterhornCoworkerWatch;
  if (result.workspaceId !== row.workspace_id
    || result.ownerId !== row.owner_id
    || result.coworkerId !== row.coworker_id
    || result.id !== row.watch_id
    || result.revision !== row.revision
    || result.profileRevision !== row.profile_revision
    || result.state !== row.state
    || result.schedule.nextCheckAt !== row.next_check_at
    || result.createdAt !== row.created_at
    || result.updatedAt !== row.updated_at) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return structuredClone(result);
}

function inboxItemFromRow(row: CoworkerInboxItemRow): MatterhornCoworkerInboxItem {
  let item: unknown;
  try {
    item = JSON.parse(row.item_json);
  } catch {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  if (validateMatterhornCoworkerInboxItem(item).length > 0
    || containsForbiddenCoworkerInboxMaterial(item as Record<string, unknown>)) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  const result = item as MatterhornCoworkerInboxItem;
  if (result.workspaceId !== row.workspace_id
    || result.ownerId !== row.owner_id
    || result.coworkerId !== row.coworker_id
    || result.id !== row.item_id
    || result.state !== row.state
    || result.createdAt !== row.created_at
    || result.updatedAt !== row.updated_at) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return structuredClone(result);
}

function accessFromRow(row: CoworkerAccessRow): MatterhornCoworkerAccessRecord {
  if ((row.state !== "active" && row.state !== "revoked")
    || !/^mhca_[A-Za-z0-9_-]{20,64}$/.test(row.access_id)
    || !row.owner_id
    || !Number.isFinite(Date.parse(row.granted_at))
    || !Number.isFinite(Date.parse(row.updated_at))
    || (row.revoked_at !== null && !Number.isFinite(Date.parse(row.revoked_at)))) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return {
    accessId: row.access_id,
    ownerId: row.owner_id,
    state: row.state,
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

export class MatterhornCoworkerStoreError extends Error {
  constructor(public readonly code:
    | "coworker_conflict"
    | "coworker_revision_conflict"
    | "coworker_watch_limit"
    | "coworker_access_invite_invalid"
    | "coworker_access_invite_expired"
    | "coworker_access_invite_consumed"
    | "coworker_access_already_active"
    | "coworker_access_not_found"
    | "coworker_state_corrupt") {
    super(code);
    this.name = "MatterhornCoworkerStoreError";
  }
}

export type MatterhornCoworkerWatchCompletion = {
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  watchId: string;
  claimedRevision: number;
  checkedAt: string;
  resultHash: string | null;
  conditionValues: Record<string, string | null> | null;
  inboxItem?: MatterhornCoworkerInboxItem | null;
};

function nextUtcDay(dayBucket: string): string {
  const start = Date.parse(`${dayBucket}T00:00:00.000Z`);
  return new Date(start + 24 * 60 * 60_000).toISOString();
}

export function cryptoCoworkerStorePath(): string {
  const explicit = process.env.MATTERHORN_COWORKER_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "crypto-coworkers", "coworkers.db");
}

export class MatterhornCoworkerStore {
  readonly #db: SqliteDatabase;

  constructor(readonly path = cryptoCoworkerStorePath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_coworkers (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, coworker_id),
        CHECK (revision >= 1),
        CHECK (state IN ('active', 'paused', 'revoked'))
      );
      CREATE INDEX IF NOT EXISTS crypto_coworkers_owner_idx
        ON crypto_coworkers(workspace_id, owner_id, state, updated_at, coworker_id);
      CREATE TABLE IF NOT EXISTS crypto_coworker_working_state (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, coworker_id),
        CHECK (revision >= 1),
        CHECK (profile_revision >= 1),
        FOREIGN KEY (workspace_id, owner_id, coworker_id)
          REFERENCES crypto_coworkers(workspace_id, owner_id, coworker_id)
          ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS crypto_coworker_resource_scopes (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        scope_hash TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, coworker_id),
        CHECK (revision >= 1),
        CHECK (profile_revision >= 1),
        CHECK (length(scope_hash) = 64),
        FOREIGN KEY (workspace_id, owner_id, coworker_id)
          REFERENCES crypto_coworkers(workspace_id, owner_id, coworker_id)
          ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS crypto_coworker_session_bindings (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        coworker_revision INTEGER NOT NULL,
        resource_scope_hash TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, session_id),
        CHECK (coworker_revision >= 1),
        CHECK (revision >= 1),
        CHECK (length(resource_scope_hash) = 64),
        FOREIGN KEY (workspace_id, owner_id, coworker_id)
          REFERENCES crypto_coworkers(workspace_id, owner_id, coworker_id)
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS crypto_coworker_session_bindings_coworker_idx
        ON crypto_coworker_session_bindings(workspace_id, owner_id, coworker_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS crypto_coworker_watches (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        watch_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        next_check_at TEXT NOT NULL,
        watch_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, coworker_id, watch_id),
        CHECK (revision >= 1),
        CHECK (profile_revision >= 1),
        CHECK (state IN ('active', 'paused')),
        FOREIGN KEY (workspace_id, owner_id, coworker_id)
          REFERENCES crypto_coworkers(workspace_id, owner_id, coworker_id)
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS crypto_coworker_watches_due_idx
        ON crypto_coworker_watches(state, next_check_at, workspace_id, owner_id, coworker_id);
      CREATE TABLE IF NOT EXISTS crypto_coworker_inbox (
        workspace_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        coworker_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        item_json TEXT NOT NULL,
        PRIMARY KEY (workspace_id, owner_id, coworker_id, item_id),
        CHECK (state IN ('unread', 'read', 'dismissed')),
        FOREIGN KEY (workspace_id, owner_id, coworker_id)
          REFERENCES crypto_coworkers(workspace_id, owner_id, coworker_id)
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS crypto_coworker_inbox_owner_idx
        ON crypto_coworker_inbox(workspace_id, owner_id, coworker_id, state, created_at DESC);
      CREATE TABLE IF NOT EXISTS crypto_coworker_access_invites (
        invite_hash TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT,
        consumed_by_owner_id TEXT,
        CHECK (length(invite_hash) = 64)
      );
      CREATE TABLE IF NOT EXISTS crypto_coworker_account_access (
        owner_id TEXT PRIMARY KEY,
        access_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revoked_at TEXT,
        CHECK (state IN ('active', 'revoked')),
        CHECK ((state = 'active' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS crypto_coworker_account_access_state_idx
        ON crypto_coworker_account_access(state, updated_at, owner_id);
    `);
    const accessColumns = statement(this.#db, "PRAGMA table_info(crypto_coworker_account_access)")
      .all() as Array<{ name: string }>;
    if (!accessColumns.some((column) => column.name === "access_id")) {
      this.#db.exec("BEGIN IMMEDIATE;");
      try {
        this.#db.exec("ALTER TABLE crypto_coworker_account_access ADD COLUMN access_id TEXT;");
        const owners = statement(this.#db, "SELECT owner_id FROM crypto_coworker_account_access")
          .all() as Array<{ owner_id: string }>;
        const update = statement(this.#db, `
          UPDATE crypto_coworker_account_access SET access_id = ? WHERE owner_id = ?
        `);
        for (const owner of owners) {
          update.run(`mhca_${randomBytes(18).toString("base64url")}`, owner.owner_id);
        }
        this.#db.exec("COMMIT;");
      } catch (error) {
        this.#db.exec("ROLLBACK;");
        throw error;
      }
    }
    this.#db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS crypto_coworker_account_access_id_idx
        ON crypto_coworker_account_access(access_id);
    `);
    chmodSync(path, 0o600);
  }

  create(profile: MatterhornCoworkerProfile): MatterhornCoworkerProfile {
    try {
      statement(this.#db, `
        INSERT INTO crypto_coworkers(
          workspace_id, owner_id, coworker_id, revision, state,
          policy_version, profile_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.workspaceId,
        profile.ownerId,
        profile.id,
        profile.revision,
        profile.state,
        profile.policyVersion,
        JSON.stringify(profile),
        profile.createdAt,
        profile.updatedAt,
      );
      return structuredClone(profile);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) throw new MatterhornCoworkerStoreError("coworker_conflict");
      throw error;
    }
  }

  get(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerProfile | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworkers
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
    `).get(workspaceId, ownerId, coworkerId) as CoworkerRow | undefined;
    return row ? profileFromRow(row) : null;
  }

  list(workspaceId: string, ownerId: string): MatterhornCoworkerProfile[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_coworkers
      WHERE workspace_id = ? AND owner_id = ?
      ORDER BY created_at ASC, coworker_id ASC
    `).all(workspaceId, ownerId) as CoworkerRow[]).map(profileFromRow);
  }

  issueAccessInvite(inviteHash: string, expiresAt: string, createdAt: string): void {
    statement(this.#db, `
      INSERT INTO crypto_coworker_access_invites(invite_hash, expires_at, created_at)
      VALUES (?, ?, ?)
    `).run(inviteHash, expiresAt, createdAt);
  }

  getAccountAccess(ownerId: string): MatterhornCoworkerAccessRecord | null {
    const row = statement(this.#db, `
      SELECT access_id, owner_id, state, granted_at, updated_at, revoked_at
      FROM crypto_coworker_account_access WHERE owner_id = ? LIMIT 1
    `).get(ownerId) as CoworkerAccessRow | undefined;
    return row ? accessFromRow(row) : null;
  }

  listAccountAccess(limit = 100): MatterhornCoworkerAccessRecord[] {
    return (statement(this.#db, `
      SELECT access_id, owner_id, state, granted_at, updated_at, revoked_at
      FROM crypto_coworker_account_access
      ORDER BY updated_at DESC, owner_id ASC
      LIMIT ?
    `).all(limit) as CoworkerAccessRow[]).map(accessFromRow);
  }

  consumeAccessInvite(input: {
    accessId: string;
    inviteHash: string;
    ownerId: string;
    now: string;
  }): MatterhornCoworkerAccessRecord {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const invite = statement(this.#db, `
        SELECT expires_at, consumed_at, consumed_by_owner_id
        FROM crypto_coworker_access_invites WHERE invite_hash = ? LIMIT 1
      `).get(input.inviteHash) as {
        expires_at: string;
        consumed_at: string | null;
        consumed_by_owner_id: string | null;
      } | undefined;
      if (!invite) throw new MatterhornCoworkerStoreError("coworker_access_invite_invalid");
      const existing = this.getAccountAccess(input.ownerId);
      if (invite.consumed_at) {
        if (invite.consumed_by_owner_id === input.ownerId && existing?.state === "active") {
          this.#db.exec("COMMIT;");
          return existing;
        }
        throw new MatterhornCoworkerStoreError("coworker_access_invite_consumed");
      }
      if (Date.parse(invite.expires_at) <= Date.parse(input.now)) {
        throw new MatterhornCoworkerStoreError("coworker_access_invite_expired");
      }
      if (existing?.state === "active") {
        throw new MatterhornCoworkerStoreError("coworker_access_already_active");
      }
      statement(this.#db, `
        INSERT INTO crypto_coworker_account_access(
          owner_id, access_id, state, granted_at, updated_at, revoked_at
        ) VALUES (?, ?, 'active', ?, ?, NULL)
        ON CONFLICT(owner_id) DO UPDATE SET
          access_id = excluded.access_id,
          state = 'active',
          granted_at = excluded.granted_at,
          updated_at = excluded.updated_at,
          revoked_at = NULL
      `).run(input.ownerId, input.accessId, input.now, input.now);
      const consumed = statement(this.#db, `
        UPDATE crypto_coworker_access_invites
        SET consumed_at = ?, consumed_by_owner_id = ?
        WHERE invite_hash = ? AND consumed_at IS NULL
      `).run(input.now, input.ownerId, input.inviteHash);
      if (consumed.changes !== 1) {
        throw new MatterhornCoworkerStoreError("coworker_access_invite_consumed");
      }
      const access = this.getAccountAccess(input.ownerId);
      if (!access) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      this.#db.exec("COMMIT;");
      return access;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  revokeAccountAccess(ownerId: string, now: string): MatterhornCoworkerAccessRecord {
    const row = statement(this.#db, `
      UPDATE crypto_coworker_account_access
      SET state = 'revoked', updated_at = ?, revoked_at = ?
      WHERE owner_id = ? AND state = 'active'
      RETURNING access_id, owner_id, state, granted_at, updated_at, revoked_at
    `).get(now, now, ownerId) as CoworkerAccessRow | undefined;
    if (row) return accessFromRow(row);
    const existing = this.getAccountAccess(ownerId);
    if (existing?.state === "revoked") return existing;
    throw new MatterhornCoworkerStoreError("coworker_access_not_found");
  }

  revokeAccountAccessById(accessId: string, now: string): MatterhornCoworkerAccessRecord {
    const row = statement(this.#db, `
      UPDATE crypto_coworker_account_access
      SET state = 'revoked', updated_at = ?, revoked_at = ?
      WHERE access_id = ? AND state = 'active'
      RETURNING access_id, owner_id, state, granted_at, updated_at, revoked_at
    `).get(now, now, accessId) as CoworkerAccessRow | undefined;
    if (row) return accessFromRow(row);
    const existing = statement(this.#db, `
      SELECT access_id, owner_id, state, granted_at, updated_at, revoked_at
      FROM crypto_coworker_account_access WHERE access_id = ? LIMIT 1
    `).get(accessId) as CoworkerAccessRow | undefined;
    if (existing?.state === "revoked") return accessFromRow(existing);
    throw new MatterhornCoworkerStoreError("coworker_access_not_found");
  }

  purgeAccountAccess(ownerId: string): MatterhornCoworkerAccessPurgeResult {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const inviteBindingsCleared = statement(this.#db, `
        UPDATE crypto_coworker_access_invites
        SET consumed_by_owner_id = NULL
        WHERE consumed_by_owner_id = ?
      `).run(ownerId).changes ?? 0;
      const accessDeleted = statement(this.#db, `
        DELETE FROM crypto_coworker_account_access WHERE owner_id = ?
      `).run(ownerId).changes ?? 0;
      this.#db.exec("COMMIT;");
      return { accessDeleted, inviteBindingsCleared };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  pruneAccessMetadata(before: string): MatterhornCoworkerAccessMaintenanceResult {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const revokedAccessDeleted = statement(this.#db, `
        DELETE FROM crypto_coworker_account_access
        WHERE state = 'revoked' AND revoked_at IS NOT NULL AND revoked_at < ?
      `).run(before).changes ?? 0;
      const invitesDeleted = statement(this.#db, `
        DELETE FROM crypto_coworker_access_invites
        WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
          OR (consumed_at IS NULL AND expires_at < ?)
      `).run(before, before).changes ?? 0;
      this.#db.exec("COMMIT;");
      return { revokedAccessDeleted, invitesDeleted };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  replace(profile: MatterhornCoworkerProfile, expectedRevision: number): MatterhornCoworkerProfile | null {
    const row = statement(this.#db, `
      UPDATE crypto_coworkers
      SET revision = ?, state = ?, policy_version = ?, profile_json = ?, updated_at = ?
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND revision = ?
      RETURNING *
    `).get(
      profile.revision,
      profile.state,
      profile.policyVersion,
      JSON.stringify(profile),
      profile.updatedAt,
      profile.workspaceId,
      profile.ownerId,
      profile.id,
      expectedRevision,
    ) as CoworkerRow | undefined;
    return row ? profileFromRow(row) : null;
  }

  getWorkingState(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerWorkingState | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworker_working_state
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
    `).get(workspaceId, ownerId, coworkerId) as CoworkerWorkingStateRow | undefined;
    return row ? workingStateFromRow(row) : null;
  }

  createWorkingState(state: MatterhornCoworkerWorkingState): MatterhornCoworkerWorkingState {
    try {
      statement(this.#db, `
        INSERT INTO crypto_coworker_working_state(
          workspace_id, owner_id, coworker_id, revision, profile_revision,
          state_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        state.workspaceId,
        state.ownerId,
        state.coworkerId,
        state.revision,
        state.profileRevision,
        JSON.stringify(state),
        state.createdAt,
        state.updatedAt,
      );
      return structuredClone(state);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) throw new MatterhornCoworkerStoreError("coworker_conflict");
      throw error;
    }
  }

  replaceWorkingState(
    state: MatterhornCoworkerWorkingState,
    expectedRevision: number,
  ): MatterhornCoworkerWorkingState | null {
    const row = statement(this.#db, `
      UPDATE crypto_coworker_working_state
      SET revision = ?, profile_revision = ?, state_json = ?, updated_at = ?
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND revision = ?
      RETURNING *
    `).get(
      state.revision,
      state.profileRevision,
      JSON.stringify(state),
      state.updatedAt,
      state.workspaceId,
      state.ownerId,
      state.coworkerId,
      expectedRevision,
    ) as CoworkerWorkingStateRow | undefined;
    return row ? workingStateFromRow(row) : null;
  }

  getResourceScope(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerResourceScope | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworker_resource_scopes
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
    `).get(workspaceId, ownerId, coworkerId) as CoworkerResourceScopeRow | undefined;
    return row ? resourceScopeFromRow(row) : null;
  }

  createResourceScope(scope: MatterhornCoworkerResourceScope): MatterhornCoworkerResourceScope {
    try {
      statement(this.#db, `
        INSERT INTO crypto_coworker_resource_scopes(
          workspace_id, owner_id, coworker_id, revision, profile_revision,
          scope_hash, scope_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        scope.workspaceId,
        scope.ownerId,
        scope.coworkerId,
        scope.revision,
        scope.profileRevision,
        scope.scopeHash,
        JSON.stringify(scope),
        scope.createdAt,
        scope.updatedAt,
      );
      return structuredClone(scope);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) throw new MatterhornCoworkerStoreError("coworker_conflict");
      throw error;
    }
  }

  replaceResourceScope(
    scope: MatterhornCoworkerResourceScope,
    expectedRevision: number,
  ): MatterhornCoworkerResourceScope | null {
    const row = statement(this.#db, `
      UPDATE crypto_coworker_resource_scopes
      SET revision = ?, profile_revision = ?, scope_hash = ?, scope_json = ?, updated_at = ?
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND revision = ?
      RETURNING *
    `).get(
      scope.revision,
      scope.profileRevision,
      scope.scopeHash,
      JSON.stringify(scope),
      scope.updatedAt,
      scope.workspaceId,
      scope.ownerId,
      scope.coworkerId,
      expectedRevision,
    ) as CoworkerResourceScopeRow | undefined;
    return row ? resourceScopeFromRow(row) : null;
  }

  getSessionBinding(
    workspaceId: string,
    ownerId: string,
    sessionId: string,
  ): MatterhornCoworkerSessionBinding | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworker_session_bindings
      WHERE workspace_id = ? AND owner_id = ? AND session_id = ?
      LIMIT 1
    `).get(workspaceId, ownerId, sessionId) as CoworkerSessionBindingRow | undefined;
    return row ? sessionBindingFromRow(row) : null;
  }

  bindSession(input: {
    workspaceId: string;
    ownerId: string;
    sessionId: string;
    coworkerId: string;
    coworkerRevision: number;
    resourceScopeHash: string;
    expectedRevision: number;
    updatedAt: string;
  }): MatterhornCoworkerSessionBinding | null {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const current = statement(this.#db, `
        SELECT * FROM crypto_coworker_session_bindings
        WHERE workspace_id = ? AND owner_id = ? AND session_id = ?
        LIMIT 1
      `).get(input.workspaceId, input.ownerId, input.sessionId) as CoworkerSessionBindingRow | undefined;
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        this.#db.exec("ROLLBACK;");
        return null;
      }
      const eligible = statement(this.#db, `
        SELECT 1 AS eligible
        FROM crypto_coworkers AS coworkers
        INNER JOIN crypto_coworker_resource_scopes AS resources
          ON resources.workspace_id = coworkers.workspace_id
          AND resources.owner_id = coworkers.owner_id
          AND resources.coworker_id = coworkers.coworker_id
        WHERE coworkers.workspace_id = ?
          AND coworkers.owner_id = ?
          AND coworkers.coworker_id = ?
          AND coworkers.revision = ?
          AND coworkers.state = 'active'
          AND resources.profile_revision = coworkers.revision
          AND resources.scope_hash = ?
        LIMIT 1
      `).get(
        input.workspaceId,
        input.ownerId,
        input.coworkerId,
        input.coworkerRevision,
        input.resourceScopeHash,
      ) as { eligible: number } | undefined;
      if (!eligible) {
        this.#db.exec("ROLLBACK;");
        return null;
      }
      const createdAt = current?.created_at ?? input.updatedAt;
      const revision = (current?.revision ?? 0) + 1;
      statement(this.#db, `
        INSERT INTO crypto_coworker_session_bindings(
          workspace_id, owner_id, session_id, coworker_id, coworker_revision,
          resource_scope_hash, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, owner_id, session_id) DO UPDATE SET
          coworker_id = excluded.coworker_id,
          coworker_revision = excluded.coworker_revision,
          resource_scope_hash = excluded.resource_scope_hash,
          revision = excluded.revision,
          updated_at = excluded.updated_at
      `).run(
        input.workspaceId,
        input.ownerId,
        input.sessionId,
        input.coworkerId,
        input.coworkerRevision,
        input.resourceScopeHash,
        revision,
        createdAt,
        input.updatedAt,
      );
      const binding = this.getSessionBinding(input.workspaceId, input.ownerId, input.sessionId);
      if (!binding) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      this.#db.exec("COMMIT;");
      return binding;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  inheritSessionBinding(input: {
    workspaceId: string;
    ownerId: string;
    sourceSessionId: string;
    targetSessionId: string;
    updatedAt: string;
  }):
    | { status: "created"; binding: MatterhornCoworkerSessionBinding }
    | { status: "source_missing" | "source_stale" | "target_conflict" } {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const source = statement(this.#db, `
        SELECT * FROM crypto_coworker_session_bindings
        WHERE workspace_id = ? AND owner_id = ? AND session_id = ?
        LIMIT 1
      `).get(input.workspaceId, input.ownerId, input.sourceSessionId) as CoworkerSessionBindingRow | undefined;
      if (!source) {
        this.#db.exec("ROLLBACK;");
        return { status: "source_missing" };
      }
      const target = statement(this.#db, `
        SELECT 1 AS present FROM crypto_coworker_session_bindings
        WHERE workspace_id = ? AND owner_id = ? AND session_id = ?
        LIMIT 1
      `).get(input.workspaceId, input.ownerId, input.targetSessionId) as { present: number } | undefined;
      if (target) {
        this.#db.exec("ROLLBACK;");
        return { status: "target_conflict" };
      }
      const eligible = statement(this.#db, `
        SELECT 1 AS eligible
        FROM crypto_coworkers AS coworkers
        INNER JOIN crypto_coworker_resource_scopes AS resources
          ON resources.workspace_id = coworkers.workspace_id
          AND resources.owner_id = coworkers.owner_id
          AND resources.coworker_id = coworkers.coworker_id
        WHERE coworkers.workspace_id = ?
          AND coworkers.owner_id = ?
          AND coworkers.coworker_id = ?
          AND coworkers.revision = ?
          AND coworkers.state = 'active'
          AND resources.profile_revision = coworkers.revision
          AND resources.scope_hash = ?
        LIMIT 1
      `).get(
        input.workspaceId,
        input.ownerId,
        source.coworker_id,
        source.coworker_revision,
        source.resource_scope_hash,
      ) as { eligible: number } | undefined;
      if (!eligible) {
        this.#db.exec("ROLLBACK;");
        return { status: "source_stale" };
      }
      statement(this.#db, `
        INSERT INTO crypto_coworker_session_bindings(
          workspace_id, owner_id, session_id, coworker_id, coworker_revision,
          resource_scope_hash, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        input.workspaceId,
        input.ownerId,
        input.targetSessionId,
        source.coworker_id,
        source.coworker_revision,
        source.resource_scope_hash,
        input.updatedAt,
        input.updatedAt,
      );
      const binding = this.getSessionBinding(input.workspaceId, input.ownerId, input.targetSessionId);
      if (!binding) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      this.#db.exec("COMMIT;");
      return { status: "created", binding };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteSessionBinding(
    workspaceId: string,
    ownerId: string,
    sessionId: string,
    expectedRevision: number,
  ): boolean {
    return (statement(this.#db, `
      DELETE FROM crypto_coworker_session_bindings
      WHERE workspace_id = ? AND owner_id = ? AND session_id = ? AND revision = ?
    `).run(workspaceId, ownerId, sessionId, expectedRevision).changes ?? 0) === 1;
  }

  purgeSessionBinding(
    workspaceId: string,
    ownerId: string,
    sessionId: string,
  ): boolean {
    return (statement(this.#db, `
      DELETE FROM crypto_coworker_session_bindings
      WHERE workspace_id = ? AND owner_id = ? AND session_id = ?
    `).run(workspaceId, ownerId, sessionId).changes ?? 0) === 1;
  }

  listWatches(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerWatch[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_coworker_watches
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
      ORDER BY created_at ASC, watch_id ASC
    `).all(workspaceId, ownerId, coworkerId) as CoworkerWatchRow[]).map(watchFromRow);
  }

  getWatch(workspaceId: string, ownerId: string, coworkerId: string, watchId: string): MatterhornCoworkerWatch | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworker_watches
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? LIMIT 1
    `).get(workspaceId, ownerId, coworkerId, watchId) as CoworkerWatchRow | undefined;
    return row ? watchFromRow(row) : null;
  }

  listDueWatches(dueBefore: string, limit = 100): MatterhornCoworkerWatch[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_coworker_watches
      WHERE state = 'active' AND next_check_at <= ?
      ORDER BY next_check_at ASC, workspace_id ASC, owner_id ASC, coworker_id ASC, watch_id ASC
      LIMIT ?
    `).all(dueBefore, limit) as CoworkerWatchRow[]).map(watchFromRow);
  }

  claimDueWatches(
    dueBefore: string,
    limit = 20,
    leaseMs = 60_000,
    requireActiveAccountAccess = false,
  ): MatterhornCoworkerWatch[] {
    const now = new Date(dueBefore);
    if (!Number.isFinite(now.getTime())
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
      || !Number.isSafeInteger(leaseMs) || leaseMs < 10_000 || leaseMs > 10 * 60_000) {
      throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
    }
    const nowIso = now.toISOString();
    const dayBucket = nowIso.slice(0, 10);
    const claimed: MatterhornCoworkerWatch[] = [];
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const candidates = (statement(this.#db, `
        SELECT watches.* FROM crypto_coworker_watches AS watches
        ${requireActiveAccountAccess
          ? "INNER JOIN crypto_coworker_account_access AS access ON access.owner_id = watches.owner_id AND access.state = 'active'"
          : ""}
        WHERE watches.state = 'active' AND watches.next_check_at <= ?
        ORDER BY watches.next_check_at ASC, watches.workspace_id ASC, watches.owner_id ASC,
          watches.coworker_id ASC, watches.watch_id ASC
        LIMIT ?
      `).all(nowIso, Math.min(100, limit * 4)) as CoworkerWatchRow[]).map(watchFromRow);
      for (const watch of candidates) {
        if (claimed.length >= limit) break;
        const parent = statement(this.#db, `
          SELECT revision, state FROM crypto_coworkers
          WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
        `).get(watch.workspaceId, watch.ownerId, watch.coworkerId) as { revision: number; state: string } | undefined;
        if (!parent || parent.state !== "active" || parent.revision !== watch.profileRevision) {
          const paused: MatterhornCoworkerWatch = {
            ...watch,
            revision: watch.revision + 1,
            profileRevision: parent?.revision ?? watch.profileRevision,
            state: "paused",
            pauseReason: parent?.state === "active" ? "profile_changed" : "coworker_paused",
            updatedAt: nowIso,
          };
          statement(this.#db, `
            UPDATE crypto_coworker_watches
            SET revision = ?, profile_revision = ?, state = ?, watch_json = ?, updated_at = ?
            WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ?
          `).run(
            paused.revision,
            paused.profileRevision,
            paused.state,
            JSON.stringify(paused),
            paused.updatedAt,
            paused.workspaceId,
            paused.ownerId,
            paused.coworkerId,
            paused.id,
            watch.revision,
          );
          continue;
        }
        const checksToday = watch.schedule.dayBucket === dayBucket ? watch.schedule.checksToday : 0;
        if (checksToday >= watch.schedule.maxChecksPerDay) {
          const deferred: MatterhornCoworkerWatch = {
            ...watch,
            revision: watch.revision + 1,
            schedule: {
              ...watch.schedule,
              dayBucket,
              checksToday,
              nextCheckAt: nextUtcDay(dayBucket),
            },
            updatedAt: nowIso,
          };
          statement(this.#db, `
            UPDATE crypto_coworker_watches
            SET revision = ?, next_check_at = ?, watch_json = ?, updated_at = ?
            WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ?
          `).run(
            deferred.revision,
            deferred.schedule.nextCheckAt,
            JSON.stringify(deferred),
            deferred.updatedAt,
            deferred.workspaceId,
            deferred.ownerId,
            deferred.coworkerId,
            deferred.id,
            watch.revision,
          );
          continue;
        }
        const next: MatterhornCoworkerWatch = {
          ...watch,
          revision: watch.revision + 1,
          schedule: {
            ...watch.schedule,
            dayBucket,
            checksToday: checksToday + 1,
            nextCheckAt: new Date(now.getTime() + leaseMs).toISOString(),
          },
          updatedAt: nowIso,
        };
        if (validateMatterhornCoworkerWatch(next).length > 0) {
          throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
        }
        const result = statement(this.#db, `
          UPDATE crypto_coworker_watches
          SET revision = ?, next_check_at = ?, watch_json = ?, updated_at = ?
          WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ?
            AND revision = ? AND state = 'active' AND next_check_at <= ?
        `).run(
          next.revision,
          next.schedule.nextCheckAt,
          JSON.stringify(next),
          next.updatedAt,
          next.workspaceId,
          next.ownerId,
          next.coworkerId,
          next.id,
          watch.revision,
          nowIso,
        );
        if ((result.changes ?? 0) === 1) claimed.push(next);
      }
      this.#db.exec("COMMIT;");
      return claimed.map((watch) => structuredClone(watch));
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  completeWatchCheck(
    input: MatterhornCoworkerWatchCompletion,
    requireActiveAccountAccess = false,
  ): MatterhornCoworkerWatch | null {
    const checkedAt = new Date(input.checkedAt);
    if (!Number.isFinite(checkedAt.getTime())) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const row = statement(this.#db, `
        SELECT * FROM crypto_coworker_watches
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ? LIMIT 1
      `).get(
        input.workspaceId,
        input.ownerId,
        input.coworkerId,
        input.watchId,
        input.claimedRevision,
      ) as CoworkerWatchRow | undefined;
      if (!row) {
        this.#db.exec("ROLLBACK;");
        return null;
      }
      if (requireActiveAccountAccess) {
        const access = statement(this.#db, `
          SELECT 1 AS allowed FROM crypto_coworker_account_access
          WHERE owner_id = ? AND state = 'active' LIMIT 1
        `).get(input.ownerId) as { allowed: number } | undefined;
        if (!access) {
          this.#db.exec("ROLLBACK;");
          return null;
        }
      }
      const watch = watchFromRow(row);
      const parent = statement(this.#db, `
        SELECT revision, state FROM crypto_coworkers
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
      `).get(input.workspaceId, input.ownerId, input.coworkerId) as { revision: number; state: string } | undefined;
      if (!parent || parent.state !== "active" || parent.revision !== watch.profileRevision || watch.state !== "active") {
        this.#db.exec("ROLLBACK;");
        return null;
      }
      const next: MatterhornCoworkerWatch = {
        ...watch,
        revision: watch.revision + 1,
        schedule: {
          ...watch.schedule,
          nextCheckAt: new Date(checkedAt.getTime() + watch.schedule.intervalMs).toISOString(),
          lastCheckedAt: checkedAt.toISOString(),
          lastResultHash: input.resultHash ?? watch.schedule.lastResultHash,
          lastConditionValues: input.conditionValues ?? watch.schedule.lastConditionValues,
        },
        updatedAt: checkedAt.toISOString(),
      };
      if (validateMatterhornCoworkerWatch(next).length > 0) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
      if (input.inboxItem) {
        const item = input.inboxItem;
        if (validateMatterhornCoworkerInboxItem(item).length > 0
          || item.workspaceId !== watch.workspaceId
          || item.ownerId !== watch.ownerId
          || item.coworkerId !== watch.coworkerId
          || item.profileRevision !== watch.profileRevision
          || item.watchId !== watch.id
          || (item.source !== null && (item.source.appId !== watch.appId || item.source.actionId !== watch.actionId))) {
          throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
        }
      }
      const result = statement(this.#db, `
        UPDATE crypto_coworker_watches
        SET revision = ?, next_check_at = ?, watch_json = ?, updated_at = ?
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ?
          AND revision = ? AND state = 'active'
      `).run(
        next.revision,
        next.schedule.nextCheckAt,
        JSON.stringify(next),
        next.updatedAt,
        next.workspaceId,
        next.ownerId,
        next.coworkerId,
        next.id,
        watch.revision,
      );
      if ((result.changes ?? 0) !== 1) {
        this.#db.exec("ROLLBACK;");
        return null;
      }
      if (input.inboxItem) {
        const item = input.inboxItem;
        statement(this.#db, `
          INSERT INTO crypto_coworker_inbox(
            workspace_id, owner_id, coworker_id, item_id, state, created_at, updated_at, item_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.workspaceId,
          item.ownerId,
          item.coworkerId,
          item.id,
          item.state,
          item.createdAt,
          item.updatedAt,
          JSON.stringify(item),
        );
        statement(this.#db, `
          DELETE FROM crypto_coworker_inbox
          WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
            AND item_id NOT IN (
              SELECT item_id FROM crypto_coworker_inbox
              WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
              ORDER BY created_at DESC, item_id DESC LIMIT 500
            )
        `).run(
          item.workspaceId,
          item.ownerId,
          item.coworkerId,
          item.workspaceId,
          item.ownerId,
          item.coworkerId,
        );
      }
      this.#db.exec("COMMIT;");
      return structuredClone(next);
    } catch (error) {
      try {
        this.#db.exec("ROLLBACK;");
      } catch {
        // An expected stale completion may already have rolled back.
      }
      throw error;
    }
  }

  createWatch(watch: MatterhornCoworkerWatch, maxActiveWatches: number): MatterhornCoworkerWatch {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const parent = statement(this.#db, `
        SELECT revision, state FROM crypto_coworkers
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
      `).get(watch.workspaceId, watch.ownerId, watch.coworkerId) as { revision: number; state: string } | undefined;
      if (!parent || parent.revision !== watch.profileRevision || parent.state !== "active") {
        this.#db.exec("ROLLBACK;");
        throw new MatterhornCoworkerStoreError("coworker_revision_conflict");
      }
      const count = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_coworker_watches
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND state = 'active'
      `).get(watch.workspaceId, watch.ownerId, watch.coworkerId) as { count: number };
      if (count.count >= maxActiveWatches) {
        this.#db.exec("ROLLBACK;");
        throw new MatterhornCoworkerStoreError("coworker_watch_limit");
      }
      statement(this.#db, `
        INSERT INTO crypto_coworker_watches(
          workspace_id, owner_id, coworker_id, watch_id, revision, profile_revision,
          state, next_check_at, watch_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        watch.workspaceId,
        watch.ownerId,
        watch.coworkerId,
        watch.id,
        watch.revision,
        watch.profileRevision,
        watch.state,
        watch.schedule.nextCheckAt,
        JSON.stringify(watch),
        watch.createdAt,
        watch.updatedAt,
      );
      this.#db.exec("COMMIT;");
      return structuredClone(watch);
    } catch (error) {
      try {
        this.#db.exec("ROLLBACK;");
      } catch {
        // Transaction may have already been rolled back for an expected policy failure.
      }
      if (error instanceof MatterhornCoworkerStoreError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) throw new MatterhornCoworkerStoreError("coworker_conflict");
      throw error;
    }
  }

  replaceWatch(
    watch: MatterhornCoworkerWatch,
    expectedRevision: number,
    maxActiveWatches?: number,
  ): MatterhornCoworkerWatch | null {
    const update = () => statement(this.#db, `
        UPDATE crypto_coworker_watches
        SET revision = ?, profile_revision = ?, state = ?, next_check_at = ?, watch_json = ?, updated_at = ?
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ?
        RETURNING *
      `).get(
        watch.revision,
        watch.profileRevision,
        watch.state,
        watch.schedule.nextCheckAt,
        JSON.stringify(watch),
        watch.updatedAt,
        watch.workspaceId,
        watch.ownerId,
        watch.coworkerId,
        watch.id,
        expectedRevision,
      ) as CoworkerWatchRow | undefined;
    if (watch.state !== "active" || maxActiveWatches === undefined) {
      const row = update();
      return row ? watchFromRow(row) : null;
    }
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const parent = statement(this.#db, `
        SELECT revision, state FROM crypto_coworkers
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
      `).get(watch.workspaceId, watch.ownerId, watch.coworkerId) as { revision: number; state: string } | undefined;
      if (!parent || parent.revision !== watch.profileRevision || parent.state !== "active") {
        throw new MatterhornCoworkerStoreError("coworker_revision_conflict");
      }
      const count = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_coworker_watches
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND state = 'active' AND watch_id != ?
      `).get(watch.workspaceId, watch.ownerId, watch.coworkerId, watch.id) as { count: number };
      if (count.count >= maxActiveWatches) throw new MatterhornCoworkerStoreError("coworker_watch_limit");
      const row = update();
      this.#db.exec("COMMIT;");
      return row ? watchFromRow(row) : null;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  pauseWatches(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    profileRevision: number;
    reason: Exclude<MatterhornCoworkerWatch["pauseReason"], null>;
    updatedAt: string;
  }): number {
    let changed = 0;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const watches = (statement(this.#db, `
        SELECT * FROM crypto_coworker_watches
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
        ORDER BY created_at ASC, watch_id ASC
      `).all(input.workspaceId, input.ownerId, input.coworkerId) as CoworkerWatchRow[]).map(watchFromRow);
      for (const watch of watches) {
        const next: MatterhornCoworkerWatch = {
          ...watch,
          revision: watch.revision + 1,
          profileRevision: input.profileRevision,
          state: "paused",
          pauseReason: input.reason,
          updatedAt: input.updatedAt,
        };
        const result = statement(this.#db, `
          UPDATE crypto_coworker_watches
          SET revision = ?, profile_revision = ?, state = ?, watch_json = ?, updated_at = ?
          WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ?
        `).run(
          next.revision,
          next.profileRevision,
          next.state,
          JSON.stringify(next),
          next.updatedAt,
          next.workspaceId,
          next.ownerId,
          next.coworkerId,
          next.id,
          watch.revision,
        );
        if ((result.changes ?? 0) !== 1) throw new MatterhornCoworkerStoreError("coworker_revision_conflict");
        changed += 1;
      }
      this.#db.exec("COMMIT;");
      return changed;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  pauseWatchesForConnection(input: {
    workspaceId: string;
    connectionId: string;
    updatedAt: string;
  }): number {
    let changed = 0;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const watches = (statement(this.#db, `
        SELECT * FROM crypto_coworker_watches
        WHERE workspace_id = ? AND state = 'active'
        ORDER BY owner_id ASC, coworker_id ASC, created_at ASC, watch_id ASC
      `).all(input.workspaceId) as CoworkerWatchRow[]).map(watchFromRow);
      for (const watch of watches) {
        if (watch.connectionBinding?.connectionId !== input.connectionId) continue;
        const next: MatterhornCoworkerWatch = {
          ...watch,
          revision: watch.revision + 1,
          state: "paused",
          pauseReason: "app_disconnected",
          updatedAt: input.updatedAt,
        };
        const result = statement(this.#db, `
          UPDATE crypto_coworker_watches
          SET revision = ?, state = ?, watch_json = ?, updated_at = ?
          WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ? AND state = 'active'
        `).run(
          next.revision,
          next.state,
          JSON.stringify(next),
          next.updatedAt,
          next.workspaceId,
          next.ownerId,
          next.coworkerId,
          next.id,
          watch.revision,
        );
        if ((result.changes ?? 0) !== 1) throw new MatterhornCoworkerStoreError("coworker_revision_conflict");
        changed += 1;
      }
      this.#db.exec("COMMIT;");
      return changed;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteWatch(workspaceId: string, ownerId: string, coworkerId: string, watchId: string, expectedRevision: number): boolean {
    return (statement(this.#db, `
      DELETE FROM crypto_coworker_watches
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND watch_id = ? AND revision = ?
    `).run(workspaceId, ownerId, coworkerId, watchId, expectedRevision).changes ?? 0) === 1;
  }

  createInboxItem(item: MatterhornCoworkerInboxItem): MatterhornCoworkerInboxItem {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const parent = statement(this.#db, `
        SELECT revision, state FROM crypto_coworkers
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? LIMIT 1
      `).get(item.workspaceId, item.ownerId, item.coworkerId) as { revision: number; state: string } | undefined;
      if (!parent || parent.revision !== item.profileRevision || parent.state !== "active") {
        throw new MatterhornCoworkerStoreError("coworker_revision_conflict");
      }
      statement(this.#db, `
        INSERT INTO crypto_coworker_inbox(
          workspace_id, owner_id, coworker_id, item_id, state, created_at, updated_at, item_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.workspaceId,
        item.ownerId,
        item.coworkerId,
        item.id,
        item.state,
        item.createdAt,
        item.updatedAt,
        JSON.stringify(item),
      );
      statement(this.#db, `
        DELETE FROM crypto_coworker_inbox
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
          AND item_id NOT IN (
            SELECT item_id FROM crypto_coworker_inbox
            WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
            ORDER BY created_at DESC, item_id DESC
            LIMIT 500
          )
      `).run(
        item.workspaceId,
        item.ownerId,
        item.coworkerId,
        item.workspaceId,
        item.ownerId,
        item.coworkerId,
      );
      this.#db.exec("COMMIT;");
      return structuredClone(item);
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) throw new MatterhornCoworkerStoreError("coworker_conflict");
      throw error;
    }
  }

  getInboxItem(workspaceId: string, ownerId: string, coworkerId: string, itemId: string): MatterhornCoworkerInboxItem | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_coworker_inbox
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND item_id = ? LIMIT 1
    `).get(workspaceId, ownerId, coworkerId, itemId) as CoworkerInboxItemRow | undefined;
    return row ? inboxItemFromRow(row) : null;
  }

  listInbox(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    includeDismissed: boolean;
    limit: number;
  }): MatterhornCoworkerInboxItem[] {
    const rows = input.includeDismissed
      ? statement(this.#db, `
        SELECT * FROM crypto_coworker_inbox
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
        ORDER BY created_at DESC, item_id DESC LIMIT ?
      `).all(input.workspaceId, input.ownerId, input.coworkerId, input.limit)
      : statement(this.#db, `
        SELECT * FROM crypto_coworker_inbox
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND state != 'dismissed'
        ORDER BY created_at DESC, item_id DESC LIMIT ?
      `).all(input.workspaceId, input.ownerId, input.coworkerId, input.limit);
    return (rows as CoworkerInboxItemRow[]).map(inboxItemFromRow);
  }

  listInboxSummaries(workspaceId: string, ownerId: string): MatterhornCoworkerInboxSummary[] {
    const rows = statement(this.#db, `
      SELECT *
      FROM crypto_coworker_inbox
      WHERE workspace_id = ? AND owner_id = ? AND state = 'unread'
      ORDER BY created_at DESC, item_id DESC
    `).all(workspaceId, ownerId) as CoworkerInboxItemRow[];
    const summaries = new Map<string, MatterhornCoworkerInboxSummary>();
    for (const row of rows) {
      // Restored rows must pass the same schema, ownership and secret scan as a
      // full inbox read before even their content-free metadata is disclosed.
      const item = inboxItemFromRow(row);
      const existing = summaries.get(item.coworkerId);
      if (existing) {
        existing.unreadCount += 1;
        continue;
      }
      summaries.set(item.coworkerId, {
        coworkerId: item.coworkerId,
        unreadCount: 1,
        latestUnreadAt: item.createdAt,
      });
    }
    return [...summaries.values()];
  }

  replaceInboxItem(item: MatterhornCoworkerInboxItem, expectedState: MatterhornCoworkerInboxItem["state"]): MatterhornCoworkerInboxItem | null {
    const row = statement(this.#db, `
      UPDATE crypto_coworker_inbox
      SET state = ?, updated_at = ?, item_json = ?
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND item_id = ? AND state = ?
      RETURNING *
    `).get(
      item.state,
      item.updatedAt,
      JSON.stringify(item),
      item.workspaceId,
      item.ownerId,
      item.coworkerId,
      item.id,
      expectedState,
    ) as CoworkerInboxItemRow | undefined;
    return row ? inboxItemFromRow(row) : null;
  }

  deleteWorkingState(workspaceId: string, ownerId: string, coworkerId: string): boolean {
    return (statement(this.#db, `
      DELETE FROM crypto_coworker_working_state
      WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
    `).run(workspaceId, ownerId, coworkerId).changes ?? 0) === 1;
  }

  delete(workspaceId: string, ownerId: string, coworkerId: string, expectedRevision: number): boolean {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      statement(this.#db, `
        DELETE FROM crypto_coworker_inbox
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
      `).run(workspaceId, ownerId, coworkerId);
      statement(this.#db, `
        DELETE FROM crypto_coworker_watches
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
      `).run(workspaceId, ownerId, coworkerId);
      statement(this.#db, `
        DELETE FROM crypto_coworker_resource_scopes
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
      `).run(workspaceId, ownerId, coworkerId);
      statement(this.#db, `
        DELETE FROM crypto_coworker_working_state
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ?
      `).run(workspaceId, ownerId, coworkerId);
      const deleted = (statement(this.#db, `
        DELETE FROM crypto_coworkers
        WHERE workspace_id = ? AND owner_id = ? AND coworker_id = ? AND revision = ?
      `).run(workspaceId, ownerId, coworkerId, expectedRevision).changes ?? 0) === 1;
      if (!deleted) {
        this.#db.exec("ROLLBACK;");
        return false;
      }
      this.#db.exec("COMMIT;");
      return true;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  purgeWorkspace(workspaceId: string): number {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      statement(this.#db, "DELETE FROM crypto_coworker_inbox WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_coworker_watches WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_coworker_resource_scopes WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_coworker_working_state WHERE workspace_id = ?").run(workspaceId);
      const deleted = statement(this.#db, "DELETE FROM crypto_coworkers WHERE workspace_id = ?")
        .run(workspaceId).changes ?? 0;
      this.#db.exec("COMMIT;");
      return deleted;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }
}
