import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
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
import { canonicalJson } from "./guarded-runtime-crypto.js";

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
  authority_seal: string | null;
};

type CoworkerAccessInviteRow = {
  invite_hash: string;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by_owner_id: string | null;
  authority_seal: string | null;
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
const COWORKER_AUTHORITY_KEY_SALT = "matterhorn:crypto-coworker-authority-key:v1";
const COWORKER_ACCESS_INVITE_AAD_DOMAIN = "matterhorn:crypto-coworker-access-invite-authority:v1";
const COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN = "matterhorn:crypto-coworker-account-access-authority:v1";
const COWORKER_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const COWORKER_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;
const COWORKER_ACCESS_ID_PATTERN = /^mhca_[A-Za-z0-9_-]{20,64}$/;
const COWORKER_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_ACCESS_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

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

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function coworkerAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < COWORKER_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new MatterhornCoworkerStoreError("coworker_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    COWORKER_AUTHORITY_KEY_SALT,
    COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function authorityAad(domain: string, value: unknown): Buffer {
  return Buffer.from(canonicalJson({ domain, value }), "utf8");
}

function sealAuthority(domain: string, value: unknown, key: Buffer): string {
  const aad = authorityAad(domain, value);
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);
    cipher.final();
    const tag = cipher.getAuthTag();
    try {
      return `${nonce.toString("base64url")}.${tag.toString("base64url")}`;
    } finally {
      tag.fill(0);
    }
  } finally {
    aad.fill(0);
    nonce.fill(0);
  }
}

function authoritySealValid(domain: string, value: unknown, seal: string | null, key: Buffer): boolean {
  if (!seal || !COWORKER_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const [encodedNonce, encodedTag] = seal.split(".");
  const aad = authorityAad(domain, value);
  const nonce = Buffer.from(encodedNonce!, "base64url");
  const tag = Buffer.from(encodedTag!, "base64url");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    decipher.final();
    return true;
  } catch {
    return false;
  } finally {
    aad.fill(0);
    nonce.fill(0);
    tag.fill(0);
  }
}

function verifiedAuthority<T>(domain: string, value: T, seal: string | null, key: Buffer): T {
  if (!authoritySealValid(domain, value, seal, key)) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return value;
}

function accessInviteAuthorityValue(row: CoworkerAccessInviteRow) {
  if (!HASH_PATTERN.test(row.invite_hash)
    || !exactTimestamp(row.created_at)
    || !exactTimestamp(row.expires_at)
    || Date.parse(row.expires_at) <= Date.parse(row.created_at)
    || Date.parse(row.expires_at) - Date.parse(row.created_at) > MAX_ACCESS_INVITE_TTL_MS
    || (row.consumed_at !== null && (!exactTimestamp(row.consumed_at)
      || Date.parse(row.consumed_at) < Date.parse(row.created_at)
      || Date.parse(row.consumed_at) > Date.parse(row.expires_at)))
    || (row.consumed_by_owner_id !== null && !COWORKER_OWNER_ID_PATTERN.test(row.consumed_by_owner_id))
    || (row.consumed_at === null && row.consumed_by_owner_id !== null)) {
    throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
  }
  return {
    inviteHash: row.invite_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    consumedByOwnerId: row.consumed_by_owner_id,
  };
}

function accessAuthorityValue(row: CoworkerAccessRow): MatterhornCoworkerAccessRecord {
  if ((row.state !== "active" && row.state !== "revoked")
    || !COWORKER_ACCESS_ID_PATTERN.test(row.access_id)
    || !COWORKER_OWNER_ID_PATTERN.test(row.owner_id)
    || !exactTimestamp(row.granted_at)
    || !exactTimestamp(row.updated_at)
    || Date.parse(row.updated_at) < Date.parse(row.granted_at)
    || (row.state === "active" && row.revoked_at !== null)
    || (row.state === "revoked" && (row.revoked_at === null
      || !exactTimestamp(row.revoked_at)
      || Date.parse(row.revoked_at) < Date.parse(row.granted_at)
      || Date.parse(row.revoked_at) > Date.parse(row.updated_at)))) {
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

function accessFromRow(row: CoworkerAccessRow, key: Buffer): MatterhornCoworkerAccessRecord {
  return verifiedAuthority(
    COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN,
    accessAuthorityValue(row),
    row.authority_seal,
    key,
  );
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
    | "coworker_integrity_secret_invalid"
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
  readonly #authorityKey: Buffer;

  constructor(
    readonly path = cryptoCoworkerStorePath(),
    integritySecret = process.env.MATTERHORN_COWORKER_INTEGRITY_SECRET ?? "",
  ) {
    this.#authorityKey = coworkerAuthorityKey(integritySecret);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    try {
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
        authority_seal TEXT NOT NULL,
        CHECK (length(invite_hash) = 64)
      );
      CREATE TABLE IF NOT EXISTS crypto_coworker_account_access (
        owner_id TEXT PRIMARY KEY,
        access_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revoked_at TEXT,
        authority_seal TEXT NOT NULL,
        CHECK (state IN ('active', 'revoked')),
        CHECK ((state = 'active' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS crypto_coworker_account_access_state_idx
        ON crypto_coworker_account_access(state, updated_at, owner_id);
      `);
      const inviteColumns = statement(this.#db, "PRAGMA table_info(crypto_coworker_access_invites)")
        .all() as Array<{ name: string }>;
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
      const legacyInvites = !inviteColumns.some((column) => column.name === "authority_seal");
      const legacyAccess = !accessColumns.some((column) => column.name === "authority_seal");
      if (legacyInvites) this.#db.exec("ALTER TABLE crypto_coworker_access_invites ADD COLUMN authority_seal TEXT;");
      if (legacyAccess) this.#db.exec("ALTER TABLE crypto_coworker_account_access ADD COLUMN authority_seal TEXT;");
      if (legacyInvites) this.#backfillAccessInviteAuthoritySeals();
      if (legacyAccess) this.#backfillAccountAccessAuthoritySeals();
      this.#verifyAccessAuthorityState();
      this.#db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS crypto_coworker_account_access_id_idx
        ON crypto_coworker_account_access(access_id);
      CREATE TRIGGER IF NOT EXISTS crypto_coworker_access_invite_seal_insert
      BEFORE INSERT ON crypto_coworker_access_invites
      WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
        OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
      BEGIN SELECT RAISE(ABORT, 'coworker_state_corrupt'); END;
      CREATE TRIGGER IF NOT EXISTS crypto_coworker_access_invite_seal_update
      BEFORE UPDATE ON crypto_coworker_access_invites
      WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
        OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        OR NEW.authority_seal = OLD.authority_seal
      BEGIN SELECT RAISE(ABORT, 'coworker_state_corrupt'); END;
      CREATE TRIGGER IF NOT EXISTS crypto_coworker_account_access_seal_insert
      BEFORE INSERT ON crypto_coworker_account_access
      WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
        OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
      BEGIN SELECT RAISE(ABORT, 'coworker_state_corrupt'); END;
      CREATE TRIGGER IF NOT EXISTS crypto_coworker_account_access_seal_update
      BEFORE UPDATE ON crypto_coworker_account_access
      WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
        OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        OR NEW.authority_seal = OLD.authority_seal
      BEGIN SELECT RAISE(ABORT, 'coworker_state_corrupt'); END;
      `);
      chmodSync(path, 0o600);
    } catch (error) {
      this.#db.close();
      this.#authorityKey.fill(0);
      throw error;
    }
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
    const row: CoworkerAccessInviteRow = {
      invite_hash: inviteHash,
      expires_at: expiresAt,
      created_at: createdAt,
      consumed_at: null,
      consumed_by_owner_id: null,
      authority_seal: null,
    };
    const value = accessInviteAuthorityValue(row);
    statement(this.#db, `
      INSERT INTO crypto_coworker_access_invites(invite_hash, expires_at, created_at, authority_seal)
      VALUES (?, ?, ?, ?)
    `).run(
      inviteHash,
      expiresAt,
      createdAt,
      sealAuthority(COWORKER_ACCESS_INVITE_AAD_DOMAIN, value, this.#authorityKey),
    );
  }

  getAccountAccess(ownerId: string): MatterhornCoworkerAccessRecord | null {
    const row = statement(this.#db, `
      SELECT access_id, owner_id, state, granted_at, updated_at, revoked_at, authority_seal
      FROM crypto_coworker_account_access WHERE owner_id = ? LIMIT 1
    `).get(ownerId) as CoworkerAccessRow | undefined;
    return row ? accessFromRow(row, this.#authorityKey) : null;
  }

  listAccountAccess(limit = 100): MatterhornCoworkerAccessRecord[] {
    return (statement(this.#db, `
      SELECT access_id, owner_id, state, granted_at, updated_at, revoked_at, authority_seal
      FROM crypto_coworker_account_access
      ORDER BY updated_at DESC, owner_id ASC
      LIMIT ?
    `).all(limit) as CoworkerAccessRow[]).map((row) => accessFromRow(row, this.#authorityKey));
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
        SELECT *
        FROM crypto_coworker_access_invites WHERE invite_hash = ? LIMIT 1
      `).get(input.inviteHash) as CoworkerAccessInviteRow | undefined;
      if (!invite) throw new MatterhornCoworkerStoreError("coworker_access_invite_invalid");
      verifiedAuthority(
        COWORKER_ACCESS_INVITE_AAD_DOMAIN,
        accessInviteAuthorityValue(invite),
        invite.authority_seal,
        this.#authorityKey,
      );
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
      const accessRow: CoworkerAccessRow = {
        access_id: input.accessId,
        owner_id: input.ownerId,
        state: "active",
        granted_at: input.now,
        updated_at: input.now,
        revoked_at: null,
        authority_seal: null,
      };
      const accessValue = accessAuthorityValue(accessRow);
      statement(this.#db, `
        INSERT INTO crypto_coworker_account_access(
          owner_id, access_id, state, granted_at, updated_at, revoked_at, authority_seal
        ) VALUES (?, ?, 'active', ?, ?, NULL, ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          access_id = excluded.access_id,
          state = 'active',
          granted_at = excluded.granted_at,
          updated_at = excluded.updated_at,
          revoked_at = NULL,
          authority_seal = excluded.authority_seal
      `).run(
        input.ownerId,
        input.accessId,
        input.now,
        input.now,
        sealAuthority(COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN, accessValue, this.#authorityKey),
      );
      const consumedRow: CoworkerAccessInviteRow = {
        ...invite,
        consumed_at: input.now,
        consumed_by_owner_id: input.ownerId,
      };
      const consumedValue = accessInviteAuthorityValue(consumedRow);
      const consumed = statement(this.#db, `
        UPDATE crypto_coworker_access_invites
        SET consumed_at = ?, consumed_by_owner_id = ?, authority_seal = ?
        WHERE invite_hash = ? AND consumed_at IS NULL AND authority_seal = ?
      `).run(
        input.now,
        input.ownerId,
        sealAuthority(COWORKER_ACCESS_INVITE_AAD_DOMAIN, consumedValue, this.#authorityKey),
        input.inviteHash,
        invite.authority_seal,
      );
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
    return this.#revokeAccountAccess("owner_id", ownerId, now);
  }

  revokeAccountAccessById(accessId: string, now: string): MatterhornCoworkerAccessRecord {
    return this.#revokeAccountAccess("access_id", accessId, now);
  }

  purgeAccountAccess(ownerId: string): MatterhornCoworkerAccessPurgeResult {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const inviteRows = statement(this.#db, `
        SELECT * FROM crypto_coworker_access_invites WHERE consumed_by_owner_id = ?
      `).all(ownerId) as CoworkerAccessInviteRow[];
      let inviteBindingsCleared = 0;
      for (const row of inviteRows) {
        verifiedAuthority(
          COWORKER_ACCESS_INVITE_AAD_DOMAIN,
          accessInviteAuthorityValue(row),
          row.authority_seal,
          this.#authorityKey,
        );
        const unlinked: CoworkerAccessInviteRow = { ...row, consumed_by_owner_id: null };
        inviteBindingsCleared += statement(this.#db, `
          UPDATE crypto_coworker_access_invites
          SET consumed_by_owner_id = NULL, authority_seal = ?
          WHERE invite_hash = ? AND consumed_by_owner_id = ? AND authority_seal = ?
        `).run(
          sealAuthority(
            COWORKER_ACCESS_INVITE_AAD_DOMAIN,
            accessInviteAuthorityValue(unlinked),
            this.#authorityKey,
          ),
          row.invite_hash,
          ownerId,
          row.authority_seal,
        ).changes ?? 0;
      }
      if (inviteBindingsCleared !== inviteRows.length) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
      const accessRow = statement(this.#db, `
        SELECT * FROM crypto_coworker_account_access WHERE owner_id = ? LIMIT 1
      `).get(ownerId) as CoworkerAccessRow | undefined;
      if (accessRow) accessFromRow(accessRow, this.#authorityKey);
      const accessDeleted = accessRow
        ? statement(this.#db, `
            DELETE FROM crypto_coworker_account_access
            WHERE owner_id = ? AND authority_seal = ?
          `).run(ownerId, accessRow.authority_seal).changes ?? 0
        : 0;
      if (accessRow && accessDeleted !== 1) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
      this.#db.exec("COMMIT;");
      return { accessDeleted, inviteBindingsCleared };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  pruneAccessMetadata(before: string): MatterhornCoworkerAccessMaintenanceResult {
    if (!exactTimestamp(before)) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const accessRows = statement(this.#db, `
        SELECT * FROM crypto_coworker_account_access
        WHERE state = 'revoked' AND revoked_at IS NOT NULL AND revoked_at < ?
      `).all(before) as CoworkerAccessRow[];
      let revokedAccessDeleted = 0;
      for (const row of accessRows) {
        accessFromRow(row, this.#authorityKey);
        revokedAccessDeleted += statement(this.#db, `
          DELETE FROM crypto_coworker_account_access
          WHERE owner_id = ? AND authority_seal = ?
        `).run(row.owner_id, row.authority_seal).changes ?? 0;
      }
      if (revokedAccessDeleted !== accessRows.length) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
      const inviteRows = statement(this.#db, `
        SELECT * FROM crypto_coworker_access_invites
        WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
          OR (consumed_at IS NULL AND expires_at < ?)
      `).all(before, before) as CoworkerAccessInviteRow[];
      let invitesDeleted = 0;
      for (const row of inviteRows) {
        verifiedAuthority(
          COWORKER_ACCESS_INVITE_AAD_DOMAIN,
          accessInviteAuthorityValue(row),
          row.authority_seal,
          this.#authorityKey,
        );
        invitesDeleted += statement(this.#db, `
          DELETE FROM crypto_coworker_access_invites
          WHERE invite_hash = ? AND authority_seal = ?
        `).run(row.invite_hash, row.authority_seal).changes ?? 0;
      }
      if (invitesDeleted !== inviteRows.length) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
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
        if (requireActiveAccountAccess && this.getAccountAccess(watch.ownerId)?.state !== "active") {
          throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
        }
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
        const access = this.getAccountAccess(input.ownerId);
        if (access?.state !== "active") {
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

  #revokeAccountAccess(
    column: "owner_id" | "access_id",
    value: string,
    now: string,
  ): MatterhornCoworkerAccessRecord {
    if (!exactTimestamp(now)) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const currentRow = statement(this.#db, `
        SELECT * FROM crypto_coworker_account_access WHERE ${column} = ? LIMIT 1
      `).get(value) as CoworkerAccessRow | undefined;
      if (!currentRow) throw new MatterhornCoworkerStoreError("coworker_access_not_found");
      const current = accessFromRow(currentRow, this.#authorityKey);
      if (current.state === "revoked") {
        this.#db.exec("COMMIT;");
        return current;
      }
      const nextRow: CoworkerAccessRow = {
        ...currentRow,
        state: "revoked",
        updated_at: now,
        revoked_at: now,
      };
      const nextValue = accessAuthorityValue(nextRow);
      const updated = statement(this.#db, `
        UPDATE crypto_coworker_account_access
        SET state = 'revoked', updated_at = ?, revoked_at = ?, authority_seal = ?
        WHERE ${column} = ? AND state = 'active' AND authority_seal = ?
      `).run(
        now,
        now,
        sealAuthority(COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN, nextValue, this.#authorityKey),
        value,
        currentRow.authority_seal,
      ).changes ?? 0;
      if (updated !== 1) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      this.#db.exec("COMMIT;");
      return nextValue;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  #verifyAccessAuthorityState(): void {
    const accessByOwner = new Map<string, MatterhornCoworkerAccessRecord>();
    for (const row of statement(this.#db, "SELECT * FROM crypto_coworker_account_access").all() as CoworkerAccessRow[]) {
      const access = accessFromRow(row, this.#authorityKey);
      accessByOwner.set(access.ownerId, access);
    }
    for (const row of statement(this.#db, "SELECT * FROM crypto_coworker_access_invites").all() as CoworkerAccessInviteRow[]) {
      const invite = verifiedAuthority(
        COWORKER_ACCESS_INVITE_AAD_DOMAIN,
        accessInviteAuthorityValue(row),
        row.authority_seal,
        this.#authorityKey,
      );
      if (invite.consumedByOwnerId !== null && !accessByOwner.has(invite.consumedByOwnerId)) {
        throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
    }
  }

  #backfillAccessInviteAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_coworker_access_invites WHERE authority_seal IS NULL")
      .all() as CoworkerAccessInviteRow[];
    this.#backfillAuthorityRows(rows, (row) => statement(this.#db, `
      UPDATE crypto_coworker_access_invites SET authority_seal = ?
      WHERE invite_hash = ? AND authority_seal IS NULL
    `).run(
      sealAuthority(COWORKER_ACCESS_INVITE_AAD_DOMAIN, accessInviteAuthorityValue(row), this.#authorityKey),
      row.invite_hash,
    ).changes ?? 0);
  }

  #backfillAccountAccessAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_coworker_account_access WHERE authority_seal IS NULL")
      .all() as CoworkerAccessRow[];
    this.#backfillAuthorityRows(rows, (row) => statement(this.#db, `
      UPDATE crypto_coworker_account_access SET authority_seal = ?
      WHERE owner_id = ? AND authority_seal IS NULL
    `).run(
      sealAuthority(COWORKER_ACCOUNT_ACCESS_AAD_DOMAIN, accessAuthorityValue(row), this.#authorityKey),
      row.owner_id,
    ).changes ?? 0);
  }

  #backfillAuthorityRows<T>(rows: T[], update: (row: T) => number): void {
    if (rows.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      for (const row of rows) {
        if (update(row) !== 1) throw new MatterhornCoworkerStoreError("coworker_state_corrupt");
      }
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
    this.#authorityKey.fill(0);
  }
}
