import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerWorkingState,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerWorkingState,
} from "@matterhorn-work/types/crypto-coworkers";

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
  if (result.workspaceId !== row.workspace_id
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
  if (validateMatterhornCoworkerWorkingState(state).length > 0) {
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

export class MatterhornCoworkerStoreError extends Error {
  constructor(public readonly code:
    | "coworker_conflict"
    | "coworker_revision_conflict"
    | "coworker_state_corrupt") {
    super(code);
    this.name = "MatterhornCoworkerStoreError";
  }
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
