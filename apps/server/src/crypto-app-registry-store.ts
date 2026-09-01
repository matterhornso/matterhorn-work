import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import type { MatterhornCryptoAppCertificationState } from "./crypto-app-registry.js";

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

export type PersistedCryptoAppManifest = {
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  manifest: MatterhornCryptoAppManifest;
  registeredAt: string;
};

export type PersistedCryptoAppCertification = {
  sequence: number;
  appId: string;
  manifestRevision: string;
  state: Exclude<MatterhornCryptoAppCertificationState, "pending">;
  report: MatterhornCryptoAppConformanceReport | null;
  reportHash: string | null;
  policyVersion: string;
  reason: string | null;
  updatedAt: string;
};

type StoredManifestRow = {
  app_id: string;
  manifest_revision: string;
  manifest_hash: string;
  manifest_json: string;
  registered_at: string;
};

type StoredCertificationRow = {
  sequence: number;
  app_id: string;
  manifest_revision: string;
  state: string;
  report_json: string | null;
  report_hash: string | null;
  policy_version: string;
  reason: string | null;
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

function parseJson<T>(value: string, errorCode: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new MatterhornCryptoAppRegistryStoreError(errorCode);
  }
}

function certificationState(value: string): PersistedCryptoAppCertification["state"] {
  if (value === "certified_testnet" || value === "certified_mainnet" || value === "suspended" || value === "revoked") {
    return value;
  }
  throw new MatterhornCryptoAppRegistryStoreError("crypto_app_registry_state_corrupt");
}

export class MatterhornCryptoAppRegistryStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoAppRegistryStoreError";
  }
}

export function cryptoAppRegistryPath(): string {
  const explicit = process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "crypto-apps", "registry.db");
}

/** Durable, host-level registry state. It contains no workspace credentials. */
export class MatterhornCryptoAppRegistryStore {
  readonly #db: SqliteDatabase;

  constructor(readonly path = cryptoAppRegistryPath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_app_manifests (
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        PRIMARY KEY (app_id, manifest_revision)
      );
      CREATE TABLE IF NOT EXISTS crypto_app_certification_history (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        state TEXT NOT NULL,
        report_json TEXT,
        report_hash TEXT,
        policy_version TEXT NOT NULL,
        reason TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id, manifest_revision)
          REFERENCES crypto_app_manifests(app_id, manifest_revision)
          ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS crypto_app_certification_lookup_idx
        ON crypto_app_certification_history(app_id, manifest_revision, sequence);
      CREATE TABLE IF NOT EXISTS crypto_app_current (
        app_id TEXT PRIMARY KEY,
        manifest_revision TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id, manifest_revision)
          REFERENCES crypto_app_manifests(app_id, manifest_revision)
          ON DELETE RESTRICT
      );
    `);
    chmodSync(path, 0o600);
  }

  putManifest(input: PersistedCryptoAppManifest): "inserted" | "existing" {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = statement(this.#db, `
        SELECT manifest_hash, manifest_json
        FROM crypto_app_manifests
        WHERE app_id = ? AND manifest_revision = ?
      `).get(input.appId, input.manifestRevision) as { manifest_hash: string; manifest_json: string } | undefined;
      if (existing) {
        const storedManifest = parseJson<MatterhornCryptoAppManifest>(
          existing.manifest_json,
          "crypto_app_registry_manifest_corrupt",
        );
        if (existing.manifest_hash !== input.manifestHash
          || storedManifest.publisher.signature !== input.manifest.publisher.signature) {
          throw new MatterhornCryptoAppRegistryStoreError("crypto_app_manifest_revision_conflict");
        }
        this.#db.exec("COMMIT;");
        return "existing";
      }
      statement(this.#db, `
        INSERT INTO crypto_app_manifests(
          app_id, manifest_revision, manifest_hash, manifest_json, registered_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        input.appId,
        input.manifestRevision,
        input.manifestHash,
        JSON.stringify(input.manifest),
        input.registeredAt,
      );
      this.#db.exec("COMMIT;");
      return "inserted";
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  appendCertification(input: Omit<PersistedCryptoAppCertification, "sequence"> & {
    expectedPreviousState: MatterhornCryptoAppCertificationState;
  }): PersistedCryptoAppCertification {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const manifest = statement(this.#db, `
        SELECT 1 FROM crypto_app_manifests WHERE app_id = ? AND manifest_revision = ?
      `).get(input.appId, input.manifestRevision);
      if (!manifest) throw new MatterhornCryptoAppRegistryStoreError("crypto_app_manifest_not_found");

      const latest = statement(this.#db, `
        SELECT state FROM crypto_app_certification_history
        WHERE app_id = ? AND manifest_revision = ?
        ORDER BY sequence DESC LIMIT 1
      `).get(input.appId, input.manifestRevision) as { state: string } | undefined;
      const previousState = latest ? certificationState(latest.state) : "pending";
      if (previousState !== input.expectedPreviousState) {
        throw new MatterhornCryptoAppRegistryStoreError("crypto_app_certification_state_conflict");
      }

      const result = statement(this.#db, `
        INSERT INTO crypto_app_certification_history(
          app_id, manifest_revision, state, report_json, report_hash, policy_version, reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING sequence
      `).get(
        input.appId,
        input.manifestRevision,
        input.state,
        input.report ? JSON.stringify(input.report) : null,
        input.reportHash,
        input.policyVersion,
        input.reason,
        input.updatedAt,
      ) as { sequence: number } | undefined;
      if (!result) throw new MatterhornCryptoAppRegistryStoreError("crypto_app_certification_write_failed");

      if (input.state === "certified_testnet" || input.state === "certified_mainnet") {
        statement(this.#db, `
          INSERT INTO crypto_app_current(app_id, manifest_revision, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(app_id) DO UPDATE SET
            manifest_revision = excluded.manifest_revision,
            updated_at = excluded.updated_at
        `).run(input.appId, input.manifestRevision, input.updatedAt);
      } else {
        statement(this.#db, `
          DELETE FROM crypto_app_current WHERE app_id = ? AND manifest_revision = ?
        `).run(input.appId, input.manifestRevision);
      }
      this.#db.exec("COMMIT;");
      const { expectedPreviousState: _expectedPreviousState, ...event } = input;
      return { ...event, sequence: result.sequence };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  listManifests(): PersistedCryptoAppManifest[] {
    const rows = statement(this.#db, `
      SELECT app_id, manifest_revision, manifest_hash, manifest_json, registered_at
      FROM crypto_app_manifests
      ORDER BY app_id ASC, manifest_revision ASC
    `).all() as StoredManifestRow[];
    return rows.map((row) => ({
      appId: row.app_id,
      manifestRevision: row.manifest_revision,
      manifestHash: row.manifest_hash,
      manifest: parseJson<MatterhornCryptoAppManifest>(row.manifest_json, "crypto_app_registry_manifest_corrupt"),
      registeredAt: row.registered_at,
    }));
  }

  listCertificationHistory(appId: string, manifestRevision: string): PersistedCryptoAppCertification[] {
    const rows = statement(this.#db, `
      SELECT sequence, app_id, manifest_revision, state, report_json, report_hash, policy_version, reason, updated_at
      FROM crypto_app_certification_history
      WHERE app_id = ? AND manifest_revision = ?
      ORDER BY sequence ASC
    `).all(appId, manifestRevision) as StoredCertificationRow[];
    return rows.map((row) => ({
      sequence: row.sequence,
      appId: row.app_id,
      manifestRevision: row.manifest_revision,
      state: certificationState(row.state),
      report: row.report_json
        ? parseJson<MatterhornCryptoAppConformanceReport>(row.report_json, "crypto_app_registry_report_corrupt")
        : null,
      reportHash: row.report_hash,
      policyVersion: row.policy_version,
      reason: row.reason,
      updatedAt: row.updated_at,
    }));
  }

  listCurrentRevisions(): Array<{ appId: string; manifestRevision: string }> {
    return statement(this.#db, `
      SELECT app_id, manifest_revision FROM crypto_app_current ORDER BY app_id ASC
    `).all().map((row) => ({
      appId: (row as { app_id: string }).app_id,
      manifestRevision: (row as { manifest_revision: string }).manifest_revision,
    }));
  }

  close(): void {
    this.#db.close();
  }
}
