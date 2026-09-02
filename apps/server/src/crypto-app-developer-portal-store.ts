import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  type MatterhornCryptoAppManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  type MatterhornCryptoAppConformanceReport,
  verifyCryptoAppConformanceReport,
} from "./crypto-app-conformance.js";
import {
  cryptoAppManifestHash,
  cryptoAppPublisherKeyFingerprint,
  verifyCryptoAppManifestSignature,
} from "./crypto-app-signature.js";
import {
  type MatterhornCryptoAppRuntimeCertificationReport,
  verifyCryptoAppRuntimeCertificationOutcome,
} from "./crypto-app-runtime-certification.js";

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

export type MatterhornCryptoDeveloperProfile = {
  id: string;
  accountId: string;
  publisherId: string;
  displayName: string;
  createdAt: string;
};

export type MatterhornCryptoDeveloperPublisherKey = {
  developerId: string;
  publisherId: string;
  keyId: string;
  publicKeyPem: string;
  fingerprint: string;
  createdAt: string;
};

export type MatterhornCryptoDeveloperSubmissionState =
  | "static_failed"
  | "static_passed"
  | "certification_requested"
  | "certification_passed"
  | "certification_failed";

export type MatterhornCryptoDeveloperSubmission = {
  developerId: string;
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  manifest: MatterhornCryptoAppManifest;
  publisherKeyFingerprint: string;
  targetEnvironment: "testnet";
  staticReport: MatterhornCryptoAppConformanceReport;
  state: MatterhornCryptoDeveloperSubmissionState;
  createdAt: string;
  updatedAt: string;
  certificationRequestedAt: string | null;
  runtimeReport: MatterhornCryptoAppRuntimeCertificationReport | null;
  certificationDecidedAt: string | null;
};

type DeveloperRow = {
  developer_id: string;
  account_id: string;
  publisher_id: string;
  display_name: string;
  created_at: string;
};

type PublisherKeyRow = {
  developer_id: string;
  publisher_id: string;
  key_id: string;
  public_key_pem: string;
  fingerprint: string;
  created_at: string;
};

type SubmissionRow = {
  developer_id: string;
  app_id: string;
  manifest_revision: string;
  manifest_hash: string;
  manifest_json: string;
  publisher_key_fingerprint: string;
  target_environment: string;
  static_report_json: string;
  state: string;
  created_at: string;
  updated_at: string;
  certification_requested_at: string | null;
  runtime_report_json: string | null;
  certification_decided_at: string | null;
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

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
}

function developer(row: DeveloperRow): MatterhornCryptoDeveloperProfile {
  return {
    id: row.developer_id,
    accountId: row.account_id,
    publisherId: row.publisher_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function publisherKey(row: PublisherKeyRow): MatterhornCryptoDeveloperPublisherKey {
  if (cryptoAppPublisherKeyFingerprint(row.public_key_pem) !== row.fingerprint) {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  return {
    developerId: row.developer_id,
    publisherId: row.publisher_id,
    keyId: row.key_id,
    publicKeyPem: row.public_key_pem,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
  };
}

function submissionState(value: string): MatterhornCryptoDeveloperSubmissionState {
  if (["static_failed", "static_passed", "certification_requested", "certification_passed", "certification_failed"].includes(value)) {
    return value as MatterhornCryptoDeveloperSubmissionState;
  }
  throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
}

function submission(row: SubmissionRow): MatterhornCryptoDeveloperSubmission {
  if (row.target_environment !== "testnet") {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  const manifest = parseJson<MatterhornCryptoAppManifest>(row.manifest_json);
  const staticReport = parseJson<MatterhornCryptoAppConformanceReport>(row.static_report_json);
  const state = submissionState(row.state);
  const runtimeReport = row.runtime_report_json
    ? parseJson<MatterhornCryptoAppRuntimeCertificationReport>(row.runtime_report_json)
    : null;
  const stateConsistent = state === "static_failed"
    ? !staticReport.passed && row.certification_requested_at === null && runtimeReport === null && row.certification_decided_at === null
    : state === "static_passed"
      ? staticReport.passed && row.certification_requested_at === null && runtimeReport === null && row.certification_decided_at === null
      : state === "certification_requested"
        ? staticReport.passed && row.certification_requested_at !== null && runtimeReport === null && row.certification_decided_at === null
        : staticReport.passed
          && row.certification_requested_at !== null
          && runtimeReport !== null
          && row.certification_decided_at !== null
          && runtimeReport.passed === (state === "certification_passed");
  if (validateMatterhornCryptoAppManifest(manifest).length > 0
    || cryptoAppManifestHash(manifest) !== row.manifest_hash
    || manifest.appId !== row.app_id
    || manifest.manifestRevision !== row.manifest_revision
    || !verifyCryptoAppConformanceReport(staticReport)
    || (runtimeReport !== null && !verifyCryptoAppRuntimeCertificationOutcome(runtimeReport, manifest, staticReport))
    || staticReport.appId !== row.app_id
    || staticReport.manifestRevision !== row.manifest_revision
    || staticReport.manifestHash !== row.manifest_hash
    || staticReport.publisherId !== manifest.publisher.id
    || staticReport.publisherKeyId !== manifest.publisher.keyId
    || staticReport.targetEnvironment !== "testnet"
    || !/^[0-9a-f]{64}$/.test(row.publisher_key_fingerprint)
    || !stateConsistent
    || !Number.isFinite(Date.parse(row.created_at))
    || !Number.isFinite(Date.parse(row.updated_at))
    || (row.certification_requested_at !== null && !Number.isFinite(Date.parse(row.certification_requested_at)))
    || (row.certification_decided_at !== null && !Number.isFinite(Date.parse(row.certification_decided_at)))) {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  return {
    developerId: row.developer_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    manifestHash: row.manifest_hash,
    manifest,
    publisherKeyFingerprint: row.publisher_key_fingerprint,
    targetEnvironment: "testnet",
    staticReport,
    state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    certificationRequestedAt: row.certification_requested_at,
    runtimeReport,
    certificationDecidedAt: row.certification_decided_at,
  };
}

export class MatterhornCryptoDeveloperStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoDeveloperStoreError";
  }
}

export function cryptoAppDeveloperPortalPath(): string {
  const explicit = process.env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "crypto-apps", "developer-portal.db");
}

/** Durable staging state. It stores no invite tokens, private keys, or wallet authority. */
export class MatterhornCryptoDeveloperPortalStore {
  readonly #db: SqliteDatabase;

  constructor(readonly path = cryptoAppDeveloperPortalPath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_developer_invites (
        invite_hash TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT,
        consumed_by_developer_id TEXT
      );
      CREATE TABLE IF NOT EXISTS crypto_developers (
        developer_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        publisher_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crypto_developer_publisher_keys (
        developer_id TEXT NOT NULL,
        publisher_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        public_key_pem TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (publisher_id, key_id),
        FOREIGN KEY (developer_id) REFERENCES crypto_developers(developer_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS crypto_developer_submissions (
        developer_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        publisher_key_fingerprint TEXT NOT NULL,
        target_environment TEXT NOT NULL CHECK(target_environment = 'testnet'),
        static_report_json TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        certification_requested_at TEXT,
        runtime_report_json TEXT,
        certification_decided_at TEXT,
        PRIMARY KEY (app_id, manifest_revision),
        FOREIGN KEY (developer_id) REFERENCES crypto_developers(developer_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS crypto_developer_submission_owner_idx
        ON crypto_developer_submissions(developer_id, created_at);
      CREATE INDEX IF NOT EXISTS crypto_developer_certification_queue_idx
        ON crypto_developer_submissions(state, updated_at);
    `);
    const submissionColumns = new Set(
      (statement(this.#db, "PRAGMA table_info(crypto_developer_submissions)").all() as Array<{ name: string }>)
        .map((column) => column.name),
    );
    if (!submissionColumns.has("runtime_report_json")) {
      this.#db.exec("ALTER TABLE crypto_developer_submissions ADD COLUMN runtime_report_json TEXT;");
    }
    if (!submissionColumns.has("certification_decided_at")) {
      this.#db.exec("ALTER TABLE crypto_developer_submissions ADD COLUMN certification_decided_at TEXT;");
    }
    chmodSync(path, 0o600);
  }

  issueInvite(inviteHash: string, expiresAt: string, createdAt: string): void {
    statement(this.#db, `
      INSERT INTO crypto_developer_invites(invite_hash, expires_at, created_at)
      VALUES (?, ?, ?)
    `).run(inviteHash, expiresAt, createdAt);
  }

  consumeInvite(input: {
    inviteHash: string;
    now: string;
    developer: MatterhornCryptoDeveloperProfile;
  }): MatterhornCryptoDeveloperProfile {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const invite = statement(this.#db, `
        SELECT expires_at, consumed_at, consumed_by_developer_id
        FROM crypto_developer_invites WHERE invite_hash = ?
      `).get(input.inviteHash) as {
        expires_at: string;
        consumed_at: string | null;
        consumed_by_developer_id: string | null;
      } | undefined;
      if (!invite) throw new MatterhornCryptoDeveloperStoreError("developer_invite_invalid");
      const existingDeveloper = this.getDeveloperByAccount(input.developer.accountId);
      if (invite.consumed_at) {
        if (existingDeveloper && invite.consumed_by_developer_id === existingDeveloper.id) {
          this.#db.exec("COMMIT;");
          return existingDeveloper;
        }
        throw new MatterhornCryptoDeveloperStoreError("developer_invite_consumed");
      }
      if (Date.parse(invite.expires_at) <= Date.parse(input.now)) {
        throw new MatterhornCryptoDeveloperStoreError("developer_invite_expired");
      }
      if (existingDeveloper) throw new MatterhornCryptoDeveloperStoreError("developer_invite_invalid");
      statement(this.#db, `
        INSERT INTO crypto_developers(developer_id, account_id, publisher_id, display_name, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        input.developer.id,
        input.developer.accountId,
        input.developer.publisherId,
        input.developer.displayName,
        input.developer.createdAt,
      );
      const consumed = statement(this.#db, `
        UPDATE crypto_developer_invites
        SET consumed_at = ?, consumed_by_developer_id = ?
        WHERE invite_hash = ? AND consumed_at IS NULL
      `).run(input.now, input.developer.id, input.inviteHash);
      if (consumed.changes !== 1) throw new MatterhornCryptoDeveloperStoreError("developer_invite_consumed");
      this.#db.exec("COMMIT;");
      return structuredClone(input.developer);
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      if (String(error).includes("UNIQUE constraint failed: crypto_developers.publisher_id")) {
        throw new MatterhornCryptoDeveloperStoreError("developer_publisher_conflict");
      }
      throw error;
    }
  }

  getDeveloperByAccount(accountId: string): MatterhornCryptoDeveloperProfile | null {
    const row = statement(this.#db, `
      SELECT developer_id, account_id, publisher_id, display_name, created_at
      FROM crypto_developers WHERE account_id = ?
    `).get(accountId) as DeveloperRow | undefined;
    return row ? developer(row) : null;
  }

  putPublisherKey(input: MatterhornCryptoDeveloperPublisherKey): MatterhornCryptoDeveloperPublisherKey {
    const owner = this.#getDeveloperById(input.developerId);
    if (!owner || owner.publisherId !== input.publisherId) {
      throw new MatterhornCryptoDeveloperStoreError("developer_not_found");
    }
    const existing = this.getPublisherKey(input.publisherId, input.keyId);
    if (existing) {
      if (existing.developerId !== input.developerId || existing.fingerprint !== input.fingerprint) {
        throw new MatterhornCryptoDeveloperStoreError("developer_publisher_key_conflict");
      }
      return existing;
    }
    try {
      statement(this.#db, `
        INSERT INTO crypto_developer_publisher_keys(
          developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.developerId,
        input.publisherId,
        input.keyId,
        input.publicKeyPem,
        input.fingerprint,
        input.createdAt,
      );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) {
        throw new MatterhornCryptoDeveloperStoreError("developer_publisher_key_conflict");
      }
      throw error;
    }
    return structuredClone(input);
  }

  getPublisherKey(publisherId: string, keyId: string): MatterhornCryptoDeveloperPublisherKey | null {
    const row = statement(this.#db, `
      SELECT developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at
      FROM crypto_developer_publisher_keys WHERE publisher_id = ? AND key_id = ?
    `).get(publisherId, keyId) as PublisherKeyRow | undefined;
    return row ? publisherKey(row) : null;
  }

  listPublisherKeys(developerId: string): MatterhornCryptoDeveloperPublisherKey[] {
    return (statement(this.#db, `
      SELECT developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at
      FROM crypto_developer_publisher_keys WHERE developer_id = ? ORDER BY created_at ASC, key_id ASC
    `).all(developerId) as PublisherKeyRow[]).map(publisherKey);
  }

  putSubmission(input: MatterhornCryptoDeveloperSubmission): MatterhornCryptoDeveloperSubmission {
    const existing = this.getSubmission(input.appId, input.manifestRevision);
    if (existing) {
      if (existing.developerId !== input.developerId
        || existing.manifestHash !== input.manifestHash
        || existing.publisherKeyFingerprint !== input.publisherKeyFingerprint) {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_conflict");
      }
      return existing;
    }
    try {
      statement(this.#db, `
        INSERT INTO crypto_developer_submissions(
          developer_id, app_id, manifest_revision, manifest_hash, manifest_json,
          publisher_key_fingerprint, target_environment, static_report_json, state,
          created_at, updated_at, certification_requested_at, runtime_report_json,
          certification_decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.developerId,
        input.appId,
        input.manifestRevision,
        input.manifestHash,
        JSON.stringify(input.manifest),
        input.publisherKeyFingerprint,
        input.targetEnvironment,
        JSON.stringify(input.staticReport),
        input.state,
        input.createdAt,
        input.updatedAt,
        input.certificationRequestedAt,
        input.runtimeReport ? JSON.stringify(input.runtimeReport) : null,
        input.certificationDecidedAt,
      );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_conflict");
      }
      throw error;
    }
    return structuredClone(input);
  }

  requestCertification(developerId: string, appId: string, manifestRevision: string, now: string) {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.getSubmission(appId, manifestRevision);
      if (!current || current.developerId !== developerId) {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_not_found");
      }
      if (current.state === "certification_requested") {
        this.#db.exec("COMMIT;");
        return current;
      }
      if (current.state !== "static_passed") {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_not_certifiable");
      }
      const updated = statement(this.#db, `
        UPDATE crypto_developer_submissions
        SET state = 'certification_requested', updated_at = ?, certification_requested_at = ?
        WHERE app_id = ? AND manifest_revision = ? AND developer_id = ? AND state = 'static_passed'
      `).run(now, now, appId, manifestRevision, developerId);
      if (updated.changes !== 1) {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_state_conflict");
      }
      const result = this.getSubmission(appId, manifestRevision);
      if (!result) throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      this.#db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  recordCertificationOutcome(
    appId: string,
    manifestRevision: string,
    runtimeReport: MatterhornCryptoAppRuntimeCertificationReport,
    now: string,
  ): MatterhornCryptoDeveloperSubmission {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.getSubmission(appId, manifestRevision);
      if (!current) throw new MatterhornCryptoDeveloperStoreError("developer_submission_not_found");
      if (current.state === "certification_passed" || current.state === "certification_failed") {
        if (current.runtimeReport?.reportHash === runtimeReport.reportHash) {
          this.#db.exec("COMMIT;");
          return current;
        }
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_state_conflict");
      }
      if (current.state !== "certification_requested") {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_not_certifiable");
      }
      if (!verifyCryptoAppRuntimeCertificationOutcome(runtimeReport, current.manifest, current.staticReport)) {
        throw new MatterhornCryptoDeveloperStoreError("developer_runtime_report_invalid");
      }
      const updated = statement(this.#db, `
        UPDATE crypto_developer_submissions
        SET state = ?, updated_at = ?, runtime_report_json = ?, certification_decided_at = ?
        WHERE app_id = ? AND manifest_revision = ? AND state = 'certification_requested'
      `).run(
        runtimeReport.passed ? "certification_passed" : "certification_failed",
        now,
        JSON.stringify(runtimeReport),
        now,
        appId,
        manifestRevision,
      );
      if (updated.changes !== 1) {
        throw new MatterhornCryptoDeveloperStoreError("developer_submission_state_conflict");
      }
      const result = this.getSubmission(appId, manifestRevision);
      if (!result) throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      this.#db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  listSubmissions(developerId: string): MatterhornCryptoDeveloperSubmission[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_developer_submissions
      WHERE developer_id = ? ORDER BY created_at DESC, app_id ASC, manifest_revision ASC
    `).all(developerId) as SubmissionRow[]).map((row) => this.#validatedSubmission(row));
  }

  listCertificationRequests(): MatterhornCryptoDeveloperSubmission[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_developer_submissions
      WHERE state = 'certification_requested'
      ORDER BY certification_requested_at ASC, app_id ASC, manifest_revision ASC
    `).all() as SubmissionRow[]).map((row) => this.#validatedSubmission(row));
  }

  getSubmission(appId: string, manifestRevision: string): MatterhornCryptoDeveloperSubmission | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_developer_submissions WHERE app_id = ? AND manifest_revision = ?
    `).get(appId, manifestRevision) as SubmissionRow | undefined;
    return row ? this.#validatedSubmission(row) : null;
  }

  purgeAccount(accountId: string): { developers: number; keys: number; submissions: number } {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const profile = this.getDeveloperByAccount(accountId);
      if (!profile) {
        this.#db.exec("COMMIT;");
        return { developers: 0, keys: 0, submissions: 0 };
      }
      const keys = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_developer_publisher_keys WHERE developer_id = ?
      `).get(profile.id) as { count: number };
      const submissions = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_developer_submissions WHERE developer_id = ?
      `).get(profile.id) as { count: number };
      statement(this.#db, `
        UPDATE crypto_developer_invites SET consumed_by_developer_id = NULL
        WHERE consumed_by_developer_id = ?
      `).run(profile.id);
      statement(this.#db, "DELETE FROM crypto_developers WHERE developer_id = ?").run(profile.id);
      this.#db.exec("COMMIT;");
      return {
        developers: 1,
        keys: keys.count,
        submissions: submissions.count,
      };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
  }

  #getDeveloperById(developerId: string): MatterhornCryptoDeveloperProfile | null {
    const row = statement(this.#db, `
      SELECT developer_id, account_id, publisher_id, display_name, created_at
      FROM crypto_developers WHERE developer_id = ?
    `).get(developerId) as DeveloperRow | undefined;
    return row ? developer(row) : null;
  }

  #validatedSubmission(row: SubmissionRow): MatterhornCryptoDeveloperSubmission {
    const item = submission(row);
    const key = this.getPublisherKey(item.manifest.publisher.id, item.manifest.publisher.keyId);
    if (!key
      || key.developerId !== item.developerId
      || key.fingerprint !== item.publisherKeyFingerprint
      || !verifyCryptoAppManifestSignature(item.manifest, key.publicKeyPem)) {
      throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
    }
    return item;
  }

}
