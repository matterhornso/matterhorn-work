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
  isTrustedEd25519PublisherKey,
  verifyCryptoAppManifestSignature,
} from "./crypto-app-signature.js";
import { canonicalJson } from "./guarded-runtime-crypto.js";
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

export type MatterhornCryptoDeveloperInviteMaintenanceResult = {
  invitesDeleted: number;
};

type DeveloperRow = {
  developer_id: string;
  account_id: string;
  publisher_id: string;
  display_name: string;
  created_at: string;
  authority_seal: string | null;
};

type InviteRow = {
  invite_hash: string;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by_developer_id: string | null;
  authority_seal: string | null;
};

type PublisherKeyRow = {
  developer_id: string;
  publisher_id: string;
  key_id: string;
  public_key_pem: string;
  fingerprint: string;
  created_at: string;
  authority_seal: string | null;
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
  authority_seal: string | null;
};

const require = createRequire(import.meta.url);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEVELOPER_ID_PATTERN = /^dev_[0-9a-f]{32}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._&'()-]{0,79}$/u;
const DEVELOPER_AUTHORITY_KEY_SALT = "matterhorn:crypto-developer-authority-key:v1";
const INVITE_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-developer-invite-authority:v1";
const PROFILE_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-developer-profile-authority:v1";
const PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-developer-publisher-key-authority:v1";
const SUBMISSION_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-developer-submission-authority:v1";
const DEVELOPER_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const DEVELOPER_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;
const MAX_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

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

function boundedText(value: unknown, maximumBytes: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && Buffer.byteLength(value, "utf8") <= maximumBytes
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function exactTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function developerAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < DEVELOPER_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new MatterhornCryptoDeveloperStoreError("developer_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    DEVELOPER_AUTHORITY_KEY_SALT,
    SUBMISSION_AUTHORITY_AAD_DOMAIN,
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
  if (!seal || !DEVELOPER_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
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

function contentDigest(value: string | null): string | null {
  return value === null ? null : createHash("sha256").update(value, "utf8").digest("hex");
}

function inviteAuthorityValue(row: InviteRow) {
  if (!HASH_PATTERN.test(row.invite_hash)
    || !exactTimestamp(row.created_at)
    || !exactTimestamp(row.expires_at)
    || Date.parse(row.expires_at) <= Date.parse(row.created_at)
    || Date.parse(row.expires_at) - Date.parse(row.created_at) > MAX_INVITE_TTL_MS
    || (row.consumed_at !== null && (!exactTimestamp(row.consumed_at)
      || Date.parse(row.consumed_at) < Date.parse(row.created_at)
      || Date.parse(row.consumed_at) > Date.parse(row.expires_at)))
    || (row.consumed_by_developer_id !== null && !DEVELOPER_ID_PATTERN.test(row.consumed_by_developer_id))
    || (row.consumed_at === null && row.consumed_by_developer_id !== null)) {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  return {
    inviteHash: row.invite_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    consumedByDeveloperId: row.consumed_by_developer_id,
  };
}

function developerAuthorityValue(row: DeveloperRow): MatterhornCryptoDeveloperProfile {
  if (!DEVELOPER_ID_PATTERN.test(row.developer_id)
    || !boundedText(row.account_id, 200)
    || !IDENTIFIER_PATTERN.test(row.publisher_id)
    || !DISPLAY_NAME_PATTERN.test(row.display_name)
    || !exactTimestamp(row.created_at)) {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  return {
    id: row.developer_id,
    accountId: row.account_id,
    publisherId: row.publisher_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function publisherKeyAuthorityValue(row: PublisherKeyRow): MatterhornCryptoDeveloperPublisherKey {
  if (!DEVELOPER_ID_PATTERN.test(row.developer_id)
    || !IDENTIFIER_PATTERN.test(row.publisher_id)
    || !IDENTIFIER_PATTERN.test(row.key_id)
    || Buffer.byteLength(row.public_key_pem, "utf8") > 4_096
    || !isTrustedEd25519PublisherKey(row.public_key_pem)
    || cryptoAppPublisherKeyFingerprint(row.public_key_pem) !== row.fingerprint
    || !HASH_PATTERN.test(row.fingerprint)
    || !exactTimestamp(row.created_at)) {
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

function verifiedAuthority<T>(domain: string, value: T, seal: string | null, key: Buffer): T {
  if (!authoritySealValid(domain, value, seal, key)) {
    throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
  }
  return value;
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
  if (!DEVELOPER_ID_PATTERN.test(row.developer_id)
    || !IDENTIFIER_PATTERN.test(row.app_id)
    || !IDENTIFIER_PATTERN.test(row.manifest_revision)
    || validateMatterhornCryptoAppManifest(manifest).length > 0
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
    || !HASH_PATTERN.test(row.manifest_hash)
    || !HASH_PATTERN.test(row.publisher_key_fingerprint)
    || !stateConsistent
    || !exactTimestamp(row.created_at)
    || !exactTimestamp(row.updated_at)
    || Date.parse(row.updated_at) < Date.parse(row.created_at)
    || (row.certification_requested_at !== null && (!exactTimestamp(row.certification_requested_at)
      || Date.parse(row.certification_requested_at) < Date.parse(row.created_at)
      || Date.parse(row.certification_requested_at) > Date.parse(row.updated_at)))
    || (row.certification_decided_at !== null && (!exactTimestamp(row.certification_decided_at)
      || Date.parse(row.certification_decided_at) < Date.parse(row.created_at)
      || Date.parse(row.certification_decided_at) > Date.parse(row.updated_at)))) {
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

function submissionAuthorityValue(row: SubmissionRow) {
  submission(row);
  return {
    developerId: row.developer_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    manifestHash: row.manifest_hash,
    manifestJsonHash: contentDigest(row.manifest_json),
    publisherKeyFingerprint: row.publisher_key_fingerprint,
    targetEnvironment: row.target_environment,
    staticReportJsonHash: contentDigest(row.static_report_json),
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    certificationRequestedAt: row.certification_requested_at,
    runtimeReportJsonHash: contentDigest(row.runtime_report_json),
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
  readonly #authorityKey: Buffer;

  constructor(
    readonly path = cryptoAppDeveloperPortalPath(),
    integritySecret = process.env.MATTERHORN_CRYPTO_APP_DEVELOPER_INTEGRITY_SECRET ?? "",
  ) {
    this.#authorityKey = developerAuthorityKey(integritySecret);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    try {
      this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
      this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_developer_invites (
        invite_hash TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT,
        consumed_by_developer_id TEXT,
        authority_seal TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crypto_developers (
        developer_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        publisher_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        authority_seal TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crypto_developer_publisher_keys (
        developer_id TEXT NOT NULL,
        publisher_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        public_key_pem TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        authority_seal TEXT NOT NULL,
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
        authority_seal TEXT NOT NULL,
        PRIMARY KEY (app_id, manifest_revision),
        FOREIGN KEY (developer_id) REFERENCES crypto_developers(developer_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS crypto_developer_submission_owner_idx
        ON crypto_developer_submissions(developer_id, created_at);
      CREATE INDEX IF NOT EXISTS crypto_developer_certification_queue_idx
        ON crypto_developer_submissions(state, updated_at);
      `);
      const columns = (table: string) => new Set(
        (statement(this.#db, `PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
          .map((column) => column.name),
      );
      const inviteColumns = columns("crypto_developer_invites");
      const developerColumns = columns("crypto_developers");
      const publisherKeyColumns = columns("crypto_developer_publisher_keys");
      const submissionColumns = columns("crypto_developer_submissions");
      if (!submissionColumns.has("runtime_report_json")) {
        this.#db.exec("ALTER TABLE crypto_developer_submissions ADD COLUMN runtime_report_json TEXT;");
      }
      if (!submissionColumns.has("certification_decided_at")) {
        this.#db.exec("ALTER TABLE crypto_developer_submissions ADD COLUMN certification_decided_at TEXT;");
      }
      const legacyInvites = !inviteColumns.has("authority_seal");
      const legacyDevelopers = !developerColumns.has("authority_seal");
      const legacyPublisherKeys = !publisherKeyColumns.has("authority_seal");
      const legacySubmissions = !submissionColumns.has("authority_seal");
      if (legacyInvites) this.#db.exec("ALTER TABLE crypto_developer_invites ADD COLUMN authority_seal TEXT;");
      if (legacyDevelopers) this.#db.exec("ALTER TABLE crypto_developers ADD COLUMN authority_seal TEXT;");
      if (legacyPublisherKeys) this.#db.exec("ALTER TABLE crypto_developer_publisher_keys ADD COLUMN authority_seal TEXT;");
      if (legacySubmissions) this.#db.exec("ALTER TABLE crypto_developer_submissions ADD COLUMN authority_seal TEXT;");
      if (legacyInvites) this.#backfillInviteAuthoritySeals();
      if (legacyDevelopers) this.#backfillDeveloperAuthoritySeals();
      if (legacyPublisherKeys) this.#backfillPublisherKeyAuthoritySeals();
      if (legacySubmissions) this.#backfillSubmissionAuthoritySeals();
      this.#verifyRestoredState();
      this.#db.exec(`
        CREATE TRIGGER IF NOT EXISTS crypto_developer_invite_seal_insert
        BEFORE INSERT ON crypto_developer_invites
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_invite_seal_update
        BEFORE UPDATE ON crypto_developer_invites
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
          OR NEW.authority_seal = OLD.authority_seal
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_profile_seal_insert
        BEFORE INSERT ON crypto_developers
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_profile_seal_update
        BEFORE UPDATE ON crypto_developers
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
          OR NEW.authority_seal = OLD.authority_seal
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_key_seal_insert
        BEFORE INSERT ON crypto_developer_publisher_keys
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_key_seal_update
        BEFORE UPDATE ON crypto_developer_publisher_keys
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
          OR NEW.authority_seal = OLD.authority_seal
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_submission_seal_insert
        BEFORE INSERT ON crypto_developer_submissions
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
        CREATE TRIGGER IF NOT EXISTS crypto_developer_submission_seal_update
        BEFORE UPDATE ON crypto_developer_submissions
        WHEN NEW.authority_seal IS NULL OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
          OR NEW.authority_seal = OLD.authority_seal
        BEGIN SELECT RAISE(ABORT, 'developer_store_corrupt'); END;
      `);
      chmodSync(path, 0o600);
    } catch (error) {
      this.#db.close();
      this.#authorityKey.fill(0);
      throw error;
    }
  }

  issueInvite(inviteHash: string, expiresAt: string, createdAt: string): void {
    const row: InviteRow = {
      invite_hash: inviteHash,
      expires_at: expiresAt,
      created_at: createdAt,
      consumed_at: null,
      consumed_by_developer_id: null,
      authority_seal: null,
    };
    const value = inviteAuthorityValue(row);
    statement(this.#db, `
      INSERT INTO crypto_developer_invites(invite_hash, expires_at, created_at, authority_seal)
      VALUES (?, ?, ?, ?)
    `).run(inviteHash, expiresAt, createdAt, sealAuthority(INVITE_AUTHORITY_AAD_DOMAIN, value, this.#authorityKey));
  }

  consumeInvite(input: {
    inviteHash: string;
    now: string;
    developer: MatterhornCryptoDeveloperProfile;
  }): MatterhornCryptoDeveloperProfile {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const invite = statement(this.#db, `
        SELECT *
        FROM crypto_developer_invites WHERE invite_hash = ?
      `).get(input.inviteHash) as InviteRow | undefined;
      if (!invite) throw new MatterhornCryptoDeveloperStoreError("developer_invite_invalid");
      verifiedAuthority(
        INVITE_AUTHORITY_AAD_DOMAIN,
        inviteAuthorityValue(invite),
        invite.authority_seal,
        this.#authorityKey,
      );
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
      const developerRow: DeveloperRow = {
        developer_id: input.developer.id,
        account_id: input.developer.accountId,
        publisher_id: input.developer.publisherId,
        display_name: input.developer.displayName,
        created_at: input.developer.createdAt,
        authority_seal: null,
      };
      const developerValue = developerAuthorityValue(developerRow);
      statement(this.#db, `
        INSERT INTO crypto_developers(developer_id, account_id, publisher_id, display_name, created_at, authority_seal)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.developer.id,
        input.developer.accountId,
        input.developer.publisherId,
        input.developer.displayName,
        input.developer.createdAt,
        sealAuthority(PROFILE_AUTHORITY_AAD_DOMAIN, developerValue, this.#authorityKey),
      );
      const consumedRow: InviteRow = {
        ...invite,
        consumed_at: input.now,
        consumed_by_developer_id: input.developer.id,
      };
      const consumedValue = inviteAuthorityValue(consumedRow);
      const consumed = statement(this.#db, `
        UPDATE crypto_developer_invites
        SET consumed_at = ?, consumed_by_developer_id = ?, authority_seal = ?
        WHERE invite_hash = ? AND consumed_at IS NULL AND authority_seal = ?
      `).run(
        input.now,
        input.developer.id,
        sealAuthority(INVITE_AUTHORITY_AAD_DOMAIN, consumedValue, this.#authorityKey),
        input.inviteHash,
        invite.authority_seal,
      );
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
      SELECT developer_id, account_id, publisher_id, display_name, created_at, authority_seal
      FROM crypto_developers WHERE account_id = ?
    `).get(accountId) as DeveloperRow | undefined;
    return row ? verifiedAuthority(
      PROFILE_AUTHORITY_AAD_DOMAIN,
      developerAuthorityValue(row),
      row.authority_seal,
      this.#authorityKey,
    ) : null;
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
    const row: PublisherKeyRow = {
      developer_id: input.developerId,
      publisher_id: input.publisherId,
      key_id: input.keyId,
      public_key_pem: input.publicKeyPem,
      fingerprint: input.fingerprint,
      created_at: input.createdAt,
      authority_seal: null,
    };
    const value = publisherKeyAuthorityValue(row);
    try {
      statement(this.#db, `
        INSERT INTO crypto_developer_publisher_keys(
          developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at, authority_seal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.developerId,
        input.publisherId,
        input.keyId,
        input.publicKeyPem,
        input.fingerprint,
        input.createdAt,
        sealAuthority(PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN, value, this.#authorityKey),
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
      SELECT developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at, authority_seal
      FROM crypto_developer_publisher_keys WHERE publisher_id = ? AND key_id = ?
    `).get(publisherId, keyId) as PublisherKeyRow | undefined;
    return row ? verifiedAuthority(
      PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN,
      publisherKeyAuthorityValue(row),
      row.authority_seal,
      this.#authorityKey,
    ) : null;
  }

  listPublisherKeys(developerId: string): MatterhornCryptoDeveloperPublisherKey[] {
    return (statement(this.#db, `
      SELECT developer_id, publisher_id, key_id, public_key_pem, fingerprint, created_at, authority_seal
      FROM crypto_developer_publisher_keys WHERE developer_id = ? ORDER BY created_at ASC, key_id ASC
    `).all(developerId) as PublisherKeyRow[]).map((row) => verifiedAuthority(
      PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN,
      publisherKeyAuthorityValue(row),
      row.authority_seal,
      this.#authorityKey,
    ));
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
    const row: SubmissionRow = {
      developer_id: input.developerId,
      app_id: input.appId,
      manifest_revision: input.manifestRevision,
      manifest_hash: input.manifestHash,
      manifest_json: JSON.stringify(input.manifest),
      publisher_key_fingerprint: input.publisherKeyFingerprint,
      target_environment: input.targetEnvironment,
      static_report_json: JSON.stringify(input.staticReport),
      state: input.state,
      created_at: input.createdAt,
      updated_at: input.updatedAt,
      certification_requested_at: input.certificationRequestedAt,
      runtime_report_json: input.runtimeReport ? JSON.stringify(input.runtimeReport) : null,
      certification_decided_at: input.certificationDecidedAt,
      authority_seal: null,
    };
    const value = submissionAuthorityValue(row);
    try {
      statement(this.#db, `
        INSERT INTO crypto_developer_submissions(
          developer_id, app_id, manifest_revision, manifest_hash, manifest_json,
          publisher_key_fingerprint, target_environment, static_report_json, state,
          created_at, updated_at, certification_requested_at, runtime_report_json,
          certification_decided_at, authority_seal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.developer_id,
        row.app_id,
        row.manifest_revision,
        row.manifest_hash,
        row.manifest_json,
        row.publisher_key_fingerprint,
        row.target_environment,
        row.static_report_json,
        row.state,
        row.created_at,
        row.updated_at,
        row.certification_requested_at,
        row.runtime_report_json,
        row.certification_decided_at,
        sealAuthority(SUBMISSION_AUTHORITY_AAD_DOMAIN, value, this.#authorityKey),
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
      const currentRow = statement(this.#db, `
        SELECT * FROM crypto_developer_submissions WHERE app_id = ? AND manifest_revision = ?
      `).get(appId, manifestRevision) as SubmissionRow | undefined;
      const current = currentRow ? this.#validatedSubmission(currentRow) : null;
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
      const nextRow: SubmissionRow = {
        ...currentRow!,
        state: "certification_requested",
        updated_at: now,
        certification_requested_at: now,
      };
      const nextValue = submissionAuthorityValue(nextRow);
      const updated = statement(this.#db, `
        UPDATE crypto_developer_submissions
        SET state = 'certification_requested', updated_at = ?, certification_requested_at = ?, authority_seal = ?
        WHERE app_id = ? AND manifest_revision = ? AND developer_id = ? AND state = 'static_passed'
          AND authority_seal = ?
      `).run(
        now,
        now,
        sealAuthority(SUBMISSION_AUTHORITY_AAD_DOMAIN, nextValue, this.#authorityKey),
        appId,
        manifestRevision,
        developerId,
        currentRow!.authority_seal,
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

  recordCertificationOutcome(
    appId: string,
    manifestRevision: string,
    runtimeReport: MatterhornCryptoAppRuntimeCertificationReport,
    now: string,
  ): MatterhornCryptoDeveloperSubmission {
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const currentRow = statement(this.#db, `
        SELECT * FROM crypto_developer_submissions WHERE app_id = ? AND manifest_revision = ?
      `).get(appId, manifestRevision) as SubmissionRow | undefined;
      const current = currentRow ? this.#validatedSubmission(currentRow) : null;
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
      const runtimeReportJson = JSON.stringify(runtimeReport);
      const nextRow: SubmissionRow = {
        ...currentRow!,
        state: runtimeReport.passed ? "certification_passed" : "certification_failed",
        updated_at: now,
        runtime_report_json: runtimeReportJson,
        certification_decided_at: now,
      };
      const nextValue = submissionAuthorityValue(nextRow);
      const updated = statement(this.#db, `
        UPDATE crypto_developer_submissions
        SET state = ?, updated_at = ?, runtime_report_json = ?, certification_decided_at = ?, authority_seal = ?
        WHERE app_id = ? AND manifest_revision = ? AND state = 'certification_requested'
          AND authority_seal = ?
      `).run(
        nextRow.state,
        now,
        runtimeReportJson,
        now,
        sealAuthority(SUBMISSION_AUTHORITY_AAD_DOMAIN, nextValue, this.#authorityKey),
        appId,
        manifestRevision,
        currentRow!.authority_seal,
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
      this.listPublisherKeys(profile.id);
      this.listSubmissions(profile.id);
      const keys = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_developer_publisher_keys WHERE developer_id = ?
      `).get(profile.id) as { count: number };
      const submissions = statement(this.#db, `
        SELECT COUNT(*) AS count FROM crypto_developer_submissions WHERE developer_id = ?
      `).get(profile.id) as { count: number };
      const invites = statement(this.#db, `
        SELECT * FROM crypto_developer_invites WHERE consumed_by_developer_id = ?
      `).all(profile.id) as InviteRow[];
      for (const invite of invites) {
        verifiedAuthority(
          INVITE_AUTHORITY_AAD_DOMAIN,
          inviteAuthorityValue(invite),
          invite.authority_seal,
          this.#authorityKey,
        );
        const unlinked: InviteRow = { ...invite, consumed_by_developer_id: null };
        const updated = statement(this.#db, `
          UPDATE crypto_developer_invites SET consumed_by_developer_id = NULL, authority_seal = ?
          WHERE invite_hash = ? AND consumed_by_developer_id = ? AND authority_seal = ?
        `).run(
          sealAuthority(INVITE_AUTHORITY_AAD_DOMAIN, inviteAuthorityValue(unlinked), this.#authorityKey),
          invite.invite_hash,
          profile.id,
          invite.authority_seal,
        ).changes ?? 0;
        if (updated !== 1) throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
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

  pruneInviteMetadata(before: string): MatterhornCryptoDeveloperInviteMaintenanceResult {
    if (!exactTimestamp(before)) throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const rows = statement(this.#db, `
        SELECT * FROM crypto_developer_invites
        WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
          OR (consumed_at IS NULL AND expires_at < ?)
      `).all(before, before) as InviteRow[];
      let invitesDeleted = 0;
      for (const row of rows) {
        verifiedAuthority(
          INVITE_AUTHORITY_AAD_DOMAIN,
          inviteAuthorityValue(row),
          row.authority_seal,
          this.#authorityKey,
        );
        invitesDeleted += statement(this.#db, `
          DELETE FROM crypto_developer_invites
          WHERE invite_hash = ? AND authority_seal = ?
        `).run(row.invite_hash, row.authority_seal).changes ?? 0;
      }
      if (invitesDeleted !== rows.length) {
        throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
      this.#db.exec("COMMIT;");
      return { invitesDeleted };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
    this.#authorityKey.fill(0);
  }

  #getDeveloperById(developerId: string): MatterhornCryptoDeveloperProfile | null {
    const row = statement(this.#db, `
      SELECT developer_id, account_id, publisher_id, display_name, created_at, authority_seal
      FROM crypto_developers WHERE developer_id = ?
    `).get(developerId) as DeveloperRow | undefined;
    return row ? verifiedAuthority(
      PROFILE_AUTHORITY_AAD_DOMAIN,
      developerAuthorityValue(row),
      row.authority_seal,
      this.#authorityKey,
    ) : null;
  }

  #validatedSubmission(row: SubmissionRow): MatterhornCryptoDeveloperSubmission {
    verifiedAuthority(
      SUBMISSION_AUTHORITY_AAD_DOMAIN,
      submissionAuthorityValue(row),
      row.authority_seal,
      this.#authorityKey,
    );
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

  #verifyRestoredState(): void {
    const developers = new Map<string, MatterhornCryptoDeveloperProfile>();
    for (const row of statement(this.#db, "SELECT * FROM crypto_developers").all() as DeveloperRow[]) {
      const profile = verifiedAuthority(
        PROFILE_AUTHORITY_AAD_DOMAIN,
        developerAuthorityValue(row),
        row.authority_seal,
        this.#authorityKey,
      );
      developers.set(profile.id, profile);
    }
    for (const row of statement(this.#db, "SELECT * FROM crypto_developer_invites").all() as InviteRow[]) {
      const invite = verifiedAuthority(
        INVITE_AUTHORITY_AAD_DOMAIN,
        inviteAuthorityValue(row),
        row.authority_seal,
        this.#authorityKey,
      );
      if (invite.consumedByDeveloperId !== null && !developers.has(invite.consumedByDeveloperId)) {
        throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
    }
    for (const row of statement(this.#db, "SELECT * FROM crypto_developer_publisher_keys").all() as PublisherKeyRow[]) {
      const key = verifiedAuthority(
        PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN,
        publisherKeyAuthorityValue(row),
        row.authority_seal,
        this.#authorityKey,
      );
      const owner = developers.get(key.developerId);
      if (!owner || owner.publisherId !== key.publisherId) {
        throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
    }
    for (const row of statement(this.#db, "SELECT * FROM crypto_developer_submissions").all() as SubmissionRow[]) {
      const item = this.#validatedSubmission(row);
      const owner = developers.get(item.developerId);
      if (!owner || owner.publisherId !== item.manifest.publisher.id) {
        throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
    }
  }

  #backfillInviteAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_developer_invites WHERE authority_seal IS NULL")
      .all() as InviteRow[];
    this.#backfillAuthorityRows(rows, (row) => {
      const changed = statement(this.#db, `
        UPDATE crypto_developer_invites SET authority_seal = ?
        WHERE invite_hash = ? AND authority_seal IS NULL
      `).run(
        sealAuthority(INVITE_AUTHORITY_AAD_DOMAIN, inviteAuthorityValue(row), this.#authorityKey),
        row.invite_hash,
      ).changes ?? 0;
      return changed;
    });
  }

  #backfillDeveloperAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_developers WHERE authority_seal IS NULL")
      .all() as DeveloperRow[];
    this.#backfillAuthorityRows(rows, (row) => {
      const changed = statement(this.#db, `
        UPDATE crypto_developers SET authority_seal = ?
        WHERE developer_id = ? AND authority_seal IS NULL
      `).run(
        sealAuthority(PROFILE_AUTHORITY_AAD_DOMAIN, developerAuthorityValue(row), this.#authorityKey),
        row.developer_id,
      ).changes ?? 0;
      return changed;
    });
  }

  #backfillPublisherKeyAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_developer_publisher_keys WHERE authority_seal IS NULL")
      .all() as PublisherKeyRow[];
    this.#backfillAuthorityRows(rows, (row) => {
      const changed = statement(this.#db, `
        UPDATE crypto_developer_publisher_keys SET authority_seal = ?
        WHERE publisher_id = ? AND key_id = ? AND authority_seal IS NULL
      `).run(
        sealAuthority(PUBLISHER_KEY_AUTHORITY_AAD_DOMAIN, publisherKeyAuthorityValue(row), this.#authorityKey),
        row.publisher_id,
        row.key_id,
      ).changes ?? 0;
      return changed;
    });
  }

  #backfillSubmissionAuthoritySeals(): void {
    const rows = statement(this.#db, "SELECT * FROM crypto_developer_submissions WHERE authority_seal IS NULL")
      .all() as SubmissionRow[];
    this.#backfillAuthorityRows(rows, (row) => {
      const changed = statement(this.#db, `
        UPDATE crypto_developer_submissions SET authority_seal = ?
        WHERE app_id = ? AND manifest_revision = ? AND authority_seal IS NULL
      `).run(
        sealAuthority(SUBMISSION_AUTHORITY_AAD_DOMAIN, submissionAuthorityValue(row), this.#authorityKey),
        row.app_id,
        row.manifest_revision,
      ).changes ?? 0;
      return changed;
    });
  }

  #backfillAuthorityRows<T>(rows: T[], update: (row: T) => number): void {
    if (rows.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      for (const row of rows) {
        if (update(row) !== 1) throw new MatterhornCryptoDeveloperStoreError("developer_store_corrupt");
      }
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

}
