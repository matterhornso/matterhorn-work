import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  MATTERHORN_CRYPTO_APP_CONNECTION_VERSION,
  type MatterhornCryptoAppConnection,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppConnectionState,
  type MatterhornCryptoAppWalletFamily,
} from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson } from "./guarded-runtime-crypto.js";
import { isPublicHttpsCryptoAdapterEndpoint } from "./crypto-app-egress.js";

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

type ConnectionRow = {
  connection_id: string;
  workspace_id: string;
  app_id: string;
  manifest_revision: string;
  state: string;
  action_ids_json: string;
  scopes_json: string;
  networks_json: string;
  credential_json: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  authority_seal: string | null;
};

type WalletChallengeRow = {
  workspace_id: string;
  challenge_id: string;
  account_id: string;
  app_id: string;
  manifest_revision: string;
  wallet_family: string;
  address_digest: string;
  action_ids_json: string;
  scopes_json: string;
  networks_json: string;
  issued_at: string;
  expires_at: string;
  state: string;
  consumed_at: string | null;
};

type WalletProofRow = {
  wallet_connection_id: string;
  wallet_family: string;
  address_digest: string;
};

type OAuthFlowRow = {
  workspace_id: string;
  flow_id: string;
  account_id: string;
  app_id: string;
  manifest_revision: string;
  binding_id: string;
  state_digest: string;
  verifier_envelope: string;
  action_ids_json: string;
  scopes_json: string;
  networks_json: string;
  issuer: string;
  resource: string;
  audience: string;
  redirect_uri: string;
  issued_at: string;
  expires_at: string;
  state: string;
  error_code: string | null;
  connection_id: string | null;
  consumed_at: string | null;
};

type OAuthTokenRow = {
  workspace_id: string;
  oauth_token_id: string;
  connection_id: string;
  account_id: string;
  app_id: string;
  manifest_revision: string;
  binding_id: string;
  resource: string;
  audience: string;
  token_envelope: string;
  scopes_json: string;
  expires_at: string;
  refreshable: number;
  created_at: string;
  updated_at: string;
};

export type MatterhornCryptoAppWalletChallengeRecord = {
  workspaceId: string;
  challengeId: string;
  accountId: string;
  appId: string;
  manifestRevision: string;
  walletFamily: MatterhornCryptoAppWalletFamily;
  addressDigest: string;
  actionIds: string[];
  scopes: string[];
  networks: string[];
  issuedAt: string;
  expiresAt: string;
  state: "pending" | "consumed";
  consumedAt: string | null;
};

export type MatterhornCryptoAppOAuthFlowRecord = {
  workspaceId: string;
  flowId: string;
  accountId: string;
  appId: string;
  manifestRevision: string;
  bindingId: string;
  stateDigest: string;
  verifierEnvelope: string;
  actionIds: string[];
  scopes: string[];
  networks: string[];
  issuer: string;
  resource: string;
  audience: string;
  redirectUri: string;
  issuedAt: string;
  expiresAt: string;
  state: "pending" | "consumed" | "failed";
  errorCode: "authorization_denied" | "connection_failed" | null;
  connectionId: string | null;
  consumedAt: string | null;
};

export type MatterhornCryptoAppOAuthTokenRecord = {
  workspaceId: string;
  oauthTokenId: string;
  connectionId: string;
  accountId: string;
  appId: string;
  manifestRevision: string;
  bindingId: string;
  resource: string;
  audience: string;
  tokenEnvelope: string;
  scopes: string[];
  expiresAt: string;
  refreshable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MatterhornCryptoAppConnectionMaintenanceResult = {
  walletChallengesDeleted: number;
  oauthFlowsDeleted: number;
  oauthVerifiersCleared: number;
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
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 32 * 1_024) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function safeIdentifier(value: unknown, maxLength = 256): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/.test(value);
}

function safeOpaque(value: unknown, maxLength = 32 * 1_024, allowEmpty = false): value is string {
  return typeof value === "string"
    && (allowEmpty || value.length > 0)
    && Buffer.byteLength(value, "utf8") <= maxLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function exactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function stringList(value: string, options: { allowEmpty?: boolean } = {}): string[] {
  const parsed = parseJson<unknown>(value);
  if (!Array.isArray(parsed)
    || parsed.length > 64
    || (!options.allowEmpty && parsed.length === 0)
    || parsed.some((entry) => !safeIdentifier(entry, 160))
    || new Set(parsed).size !== parsed.length) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return parsed as string[];
}

function storedCredential(value: string): MatterhornCryptoAppConnectionCredential {
  const parsed = parseJson<unknown>(value);
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  if (parsed.type === "none" && exactKeys(parsed, ["type"])) return { type: "none" };
  if ((parsed.type === "oauth2" || parsed.type === "api_key_vault")
    && exactKeys(parsed, ["type", "secretReference"])
    && typeof parsed.secretReference === "string"
    && /^vault:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{2,255}$/.test(parsed.secretReference)
    && parsed.secretReference.replace(/^vault:\/\//, "").split("/")
      .every((segment) => segment.length > 0 && segment !== "." && segment !== "..")) {
    return { type: parsed.type, secretReference: parsed.secretReference };
  }
  if (parsed.type === "wallet_connection"
    && exactKeys(parsed, ["type", "walletConnectionId"])
    && typeof parsed.walletConnectionId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/.test(parsed.walletConnectionId)) {
    return { type: "wallet_connection", walletConnectionId: parsed.walletConnectionId };
  }
  throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
}

function publicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048 || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    const canonicalRootWithoutSlash = url.pathname === "/" && !url.search && !url.hash
      ? url.origin
      : null;
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && isPublicHttpsCryptoAdapterEndpoint(value)
      && (url.href === value || canonicalRootWithoutSlash === value);
  } catch {
    return false;
  }
}

function connectionState(value: string): MatterhornCryptoAppConnectionState {
  if (value === "active" || value === "paused" || value === "revoked") return value;
  throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
}

const CONNECTION_AUTHORITY_KEY_SALT = "matterhorn:crypto-app-connection-authority-key:v1";
const CONNECTION_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-app-connection-authority:v1";
const CONNECTION_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const CONNECTION_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;

function connectionAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < CONNECTION_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    CONNECTION_AUTHORITY_KEY_SALT,
    CONNECTION_AUTHORITY_AAD_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function connectionAuthorityAad(connection: MatterhornCryptoAppConnection): Buffer {
  return Buffer.from(canonicalJson({
    domain: CONNECTION_AUTHORITY_AAD_DOMAIN,
    version: connection.version,
    id: connection.id,
    workspaceId: connection.workspaceId,
    appId: connection.appId,
    manifestRevision: connection.manifestRevision,
    state: connection.state,
    grantedActionIds: connection.grantedActionIds,
    grantedScopes: connection.grantedScopes,
    grantedNetworks: connection.grantedNetworks,
    credential: connection.credential,
    createdBy: connection.createdBy,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }), "utf8");
}

function sealConnectionAuthority(
  connection: MatterhornCryptoAppConnection,
  key: Buffer,
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const aad = connectionAuthorityAad(connection);
  cipher.setAAD(aad);
  cipher.final();
  const tag = cipher.getAuthTag();
  const seal = `${nonce.toString("base64url")}.${tag.toString("base64url")}`;
  aad.fill(0);
  nonce.fill(0);
  tag.fill(0);
  return seal;
}

function connectionAuthoritySealValid(
  connection: MatterhornCryptoAppConnection,
  seal: string | null,
  key: Buffer,
): boolean {
  if (!seal || !CONNECTION_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const [encodedNonce, encodedTag] = seal.split(".");
  const nonce = Buffer.from(encodedNonce!, "base64url");
  const tag = Buffer.from(encodedTag!, "base64url");
  const aad = connectionAuthorityAad(connection);
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

const CONNECTION_KEYS = [
  "version",
  "id",
  "workspaceId",
  "appId",
  "manifestRevision",
  "state",
  "grantedActionIds",
  "grantedScopes",
  "grantedNetworks",
  "credential",
  "createdBy",
  "createdAt",
  "updatedAt",
] as const;

function connectionRow(connection: MatterhornCryptoAppConnection, authorityKey: Buffer): ConnectionRow {
  if (!isRecord(connection)
    || !exactKeys(connection, CONNECTION_KEYS)
    || connection.version !== MATTERHORN_CRYPTO_APP_CONNECTION_VERSION) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  const row: ConnectionRow = {
    connection_id: connection.id,
    workspace_id: connection.workspaceId,
    app_id: connection.appId,
    manifest_revision: connection.manifestRevision,
    state: connection.state,
    action_ids_json: JSON.stringify(connection.grantedActionIds),
    scopes_json: JSON.stringify(connection.grantedScopes),
    networks_json: JSON.stringify(connection.grantedNetworks),
    credential_json: JSON.stringify(connection.credential),
    created_by: connection.createdBy,
    created_at: connection.createdAt,
    updated_at: connection.updatedAt,
    authority_seal: sealConnectionAuthority(connection, authorityKey),
  };
  toConnection(row, authorityKey);
  return row;
}

function connectionValue(row: ConnectionRow): MatterhornCryptoAppConnection {
  if (!safeIdentifier(row.connection_id)
    || !safeIdentifier(row.workspace_id)
    || !safeIdentifier(row.app_id, 128)
    || !safeIdentifier(row.manifest_revision, 160)
    || !safeIdentifier(row.created_by)
    || !exactIsoTimestamp(row.created_at)
    || !exactIsoTimestamp(row.updated_at)
    || row.updated_at < row.created_at) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return {
    version: "matterhorn.crypto-app-connection.v1",
    id: row.connection_id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    state: connectionState(row.state),
    grantedActionIds: stringList(row.action_ids_json),
    grantedScopes: stringList(row.scopes_json, { allowEmpty: true }),
    grantedNetworks: stringList(row.networks_json),
    credential: storedCredential(row.credential_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toConnection(row: ConnectionRow, authorityKey: Buffer): MatterhornCryptoAppConnection {
  const connection = connectionValue(row);
  if (!connectionAuthoritySealValid(connection, row.authority_seal, authorityKey)) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return connection;
}

function walletFamily(value: string): MatterhornCryptoAppWalletFamily {
  if (value === "evm" || value === "sui") return value;
  throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
}

function toWalletChallenge(row: WalletChallengeRow): MatterhornCryptoAppWalletChallengeRecord {
  if (row.state !== "pending" && row.state !== "consumed") {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  if (!safeIdentifier(row.workspace_id)
    || !safeIdentifier(row.challenge_id)
    || !safeIdentifier(row.account_id)
    || !safeIdentifier(row.app_id, 128)
    || !safeIdentifier(row.manifest_revision, 160)
    || !digest(row.address_digest)
    || !exactIsoTimestamp(row.issued_at)
    || !exactIsoTimestamp(row.expires_at)
    || row.expires_at <= row.issued_at
    || (row.state === "pending" && row.consumed_at !== null)
    || (row.state === "consumed" && (!exactIsoTimestamp(row.consumed_at)
      || row.consumed_at < row.issued_at
      || row.consumed_at >= row.expires_at))) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return {
    workspaceId: row.workspace_id,
    challengeId: row.challenge_id,
    accountId: row.account_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    walletFamily: walletFamily(row.wallet_family),
    addressDigest: row.address_digest,
    actionIds: stringList(row.action_ids_json),
    scopes: stringList(row.scopes_json, { allowEmpty: true }),
    networks: stringList(row.networks_json),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    state: row.state,
    consumedAt: row.consumed_at,
  };
}

function toOAuthFlow(row: OAuthFlowRow): MatterhornCryptoAppOAuthFlowRecord {
  if (row.state !== "pending" && row.state !== "consumed" && row.state !== "failed") {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  if (row.error_code !== null
    && row.error_code !== "authorization_denied"
    && row.error_code !== "connection_failed") {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  const consumedAtValid = exactIsoTimestamp(row.consumed_at)
    && row.consumed_at >= row.issued_at
    && row.consumed_at < row.expires_at;
  const stateFieldsValid = row.state === "pending"
    ? row.error_code === null && row.connection_id === null && row.consumed_at === null
    : row.state === "failed"
      ? row.error_code !== null && row.connection_id === null && consumedAtValid
      : row.error_code === null && safeIdentifier(row.connection_id) && consumedAtValid;
  if (!safeIdentifier(row.workspace_id)
    || !safeIdentifier(row.flow_id)
    || !safeIdentifier(row.account_id)
    || !safeIdentifier(row.app_id, 128)
    || !safeIdentifier(row.manifest_revision, 160)
    || !safeIdentifier(row.binding_id, 128)
    || !digest(row.state_digest)
    || !safeOpaque(row.verifier_envelope, 32 * 1_024, true)
    || !publicHttpsUrl(row.issuer)
    || !publicHttpsUrl(row.resource)
    || !safeIdentifier(row.audience, 512)
    || !publicHttpsUrl(row.redirect_uri)
    || !exactIsoTimestamp(row.issued_at)
    || !exactIsoTimestamp(row.expires_at)
    || row.expires_at <= row.issued_at
    || !stateFieldsValid) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return {
    workspaceId: row.workspace_id,
    flowId: row.flow_id,
    accountId: row.account_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    bindingId: row.binding_id,
    stateDigest: row.state_digest,
    verifierEnvelope: row.verifier_envelope,
    actionIds: stringList(row.action_ids_json),
    scopes: stringList(row.scopes_json, { allowEmpty: true }),
    networks: stringList(row.networks_json),
    issuer: row.issuer,
    resource: row.resource,
    audience: row.audience,
    redirectUri: row.redirect_uri,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    state: row.state,
    errorCode: row.error_code,
    connectionId: row.connection_id,
    consumedAt: row.consumed_at,
  };
}

function toOAuthToken(row: OAuthTokenRow): MatterhornCryptoAppOAuthTokenRecord {
  if (row.refreshable !== 0 && row.refreshable !== 1) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  if (!safeIdentifier(row.workspace_id)
    || !safeIdentifier(row.oauth_token_id)
    || !safeIdentifier(row.connection_id)
    || !safeIdentifier(row.account_id)
    || !safeIdentifier(row.app_id, 128)
    || !safeIdentifier(row.manifest_revision, 160)
    || !safeIdentifier(row.binding_id, 128)
    || !publicHttpsUrl(row.resource)
    || !safeIdentifier(row.audience, 512)
    || !safeOpaque(row.token_envelope, 64 * 1_024)
    || !exactIsoTimestamp(row.expires_at)
    || !exactIsoTimestamp(row.created_at)
    || !exactIsoTimestamp(row.updated_at)
    || row.expires_at <= row.created_at
    || row.expires_at <= row.updated_at
    || row.updated_at < row.created_at) {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
  return {
    workspaceId: row.workspace_id,
    oauthTokenId: row.oauth_token_id,
    connectionId: row.connection_id,
    accountId: row.account_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    bindingId: row.binding_id,
    resource: row.resource,
    audience: row.audience,
    tokenEnvelope: row.token_envelope,
    scopes: stringList(row.scopes_json, { allowEmpty: true }),
    expiresAt: row.expires_at,
    refreshable: row.refreshable === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MatterhornCryptoAppConnectionStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoAppConnectionStoreError";
  }
}

export function cryptoAppConnectionPath(): string {
  const explicit = process.env.MATTERHORN_CRYPTO_APP_CONNECTION_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "crypto-apps", "connections.db");
}

export class MatterhornCryptoAppConnectionStore {
  readonly #db: SqliteDatabase;
  readonly #authorityKey: Buffer;

  constructor(
    readonly path = cryptoAppConnectionPath(),
    integritySecret = process.env.MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET ?? "",
  ) {
    this.#authorityKey = connectionAuthorityKey(integritySecret);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    try {
      this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
      this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_app_connections (
        workspace_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        state TEXT NOT NULL,
        action_ids_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        networks_json TEXT NOT NULL,
        credential_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        authority_seal TEXT NOT NULL,
        PRIMARY KEY (workspace_id, connection_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_connections_workspace_idx
        ON crypto_app_connections(workspace_id, state, app_id, updated_at);
      CREATE TABLE IF NOT EXISTS crypto_app_wallet_challenges (
        workspace_id TEXT NOT NULL,
        challenge_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        wallet_family TEXT NOT NULL,
        address_digest TEXT NOT NULL,
        action_ids_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        networks_json TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        state TEXT NOT NULL,
        consumed_at TEXT,
        PRIMARY KEY (workspace_id, challenge_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_wallet_challenges_expiry_idx
        ON crypto_app_wallet_challenges(state, expires_at);
      CREATE TABLE IF NOT EXISTS crypto_app_wallet_proofs (
        workspace_id TEXT NOT NULL,
        wallet_connection_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        wallet_family TEXT NOT NULL,
        address_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, wallet_connection_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_wallet_proofs_binding_idx
        ON crypto_app_wallet_proofs(workspace_id, app_id, manifest_revision);
      CREATE TABLE IF NOT EXISTS crypto_app_oauth_flows (
        workspace_id TEXT NOT NULL,
        flow_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        binding_id TEXT NOT NULL,
        state_digest TEXT NOT NULL UNIQUE,
        verifier_envelope TEXT NOT NULL,
        action_ids_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        networks_json TEXT NOT NULL,
        issuer TEXT NOT NULL,
        resource TEXT NOT NULL,
        audience TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        state TEXT NOT NULL,
        error_code TEXT,
        connection_id TEXT,
        consumed_at TEXT,
        PRIMARY KEY (workspace_id, flow_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_oauth_flows_account_idx
        ON crypto_app_oauth_flows(workspace_id, account_id, expires_at);
      CREATE TABLE IF NOT EXISTS crypto_app_oauth_tokens (
        workspace_id TEXT NOT NULL,
        oauth_token_id TEXT NOT NULL PRIMARY KEY,
        connection_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        binding_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        audience TEXT NOT NULL,
        token_envelope TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        refreshable INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, connection_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_oauth_tokens_binding_idx
        ON crypto_app_oauth_tokens(workspace_id, app_id, manifest_revision);
    `);
      const connectionColumns = statement(this.#db, "PRAGMA table_info(crypto_app_connections)")
        .all() as Array<{ name?: unknown }>;
      const legacyConnectionTable = !connectionColumns.some((column) => column.name === "authority_seal");
      if (legacyConnectionTable) {
        this.#db.exec("ALTER TABLE crypto_app_connections ADD COLUMN authority_seal TEXT;");
        this.#backfillConnectionAuthoritySeals();
      }
      for (const row of statement(this.#db, "SELECT * FROM crypto_app_connections").all() as ConnectionRow[]) {
        toConnection(row, this.#authorityKey);
      }
      this.#db.exec(`
        CREATE TRIGGER IF NOT EXISTS crypto_app_connections_authority_seal_insert
        BEFORE INSERT ON crypto_app_connections
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_connection_state_corrupt');
        END;
        CREATE TRIGGER IF NOT EXISTS crypto_app_connections_authority_seal_update
        BEFORE UPDATE OF authority_seal ON crypto_app_connections
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_connection_state_corrupt');
        END;
      `);
      chmodSync(path, 0o600);
    } catch (error) {
      this.#db.close();
      this.#authorityKey.fill(0);
      throw error;
    }
  }

  create(connection: MatterhornCryptoAppConnection): void {
    try {
      this.#insertConnection(connection);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) {
        throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_conflict");
      }
      throw error;
    }
  }

  createWalletChallenge(challenge: MatterhornCryptoAppWalletChallengeRecord): void {
    try {
      statement(this.#db, `
        INSERT INTO crypto_app_wallet_challenges(
          workspace_id, challenge_id, account_id, app_id, manifest_revision,
          wallet_family, address_digest, action_ids_json, scopes_json,
          networks_json, issued_at, expires_at, state, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        challenge.workspaceId,
        challenge.challengeId,
        challenge.accountId,
        challenge.appId,
        challenge.manifestRevision,
        challenge.walletFamily,
        challenge.addressDigest,
        JSON.stringify(challenge.actionIds),
        JSON.stringify(challenge.scopes),
        JSON.stringify(challenge.networks),
        challenge.issuedAt,
        challenge.expiresAt,
        challenge.state,
        challenge.consumedAt,
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) {
        throw new MatterhornCryptoAppConnectionStoreError("crypto_app_wallet_challenge_conflict");
      }
      throw error;
    }
  }

  getWalletChallenge(
    workspaceId: string,
    accountId: string,
    challengeId: string,
  ): MatterhornCryptoAppWalletChallengeRecord | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_wallet_challenges
      WHERE workspace_id = ? AND account_id = ? AND challenge_id = ? LIMIT 1
    `).get(workspaceId, accountId, challengeId) as WalletChallengeRow | undefined;
    return row ? toWalletChallenge(row) : null;
  }

  finalizeWalletChallenge(input: {
    workspaceId: string;
    challengeId: string;
    accountId: string;
    appId: string;
    manifestRevision: string;
    walletFamily: MatterhornCryptoAppWalletFamily;
    addressDigest: string;
    actionIds: string[];
    scopes: string[];
    networks: string[];
    expiresAt: string;
    proofId: string;
    connection: MatterhornCryptoAppConnection;
    consumedAt: string;
  }): boolean {
    if (input.connection.workspaceId !== input.workspaceId
      || input.connection.createdBy !== input.accountId
      || input.connection.appId !== input.appId
      || input.connection.manifestRevision !== input.manifestRevision
      || input.connection.credential.type !== "wallet_connection"
      || input.connection.credential.walletConnectionId !== input.proofId) {
      throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
    }
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = statement(this.#db, `
        SELECT * FROM crypto_app_wallet_challenges
        WHERE workspace_id = ? AND account_id = ? AND challenge_id = ? LIMIT 1
      `).get(input.workspaceId, input.accountId, input.challengeId) as WalletChallengeRow | undefined;
      if (!row) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      const challenge = toWalletChallenge(row);
      const exact = challenge.state === "pending"
        && challenge.appId === input.appId
        && challenge.manifestRevision === input.manifestRevision
        && challenge.walletFamily === input.walletFamily
        && challenge.addressDigest === input.addressDigest
        && challenge.expiresAt === input.expiresAt
        && challenge.expiresAt > input.consumedAt
        && JSON.stringify(challenge.actionIds) === JSON.stringify(input.actionIds)
        && JSON.stringify(challenge.scopes) === JSON.stringify(input.scopes)
        && JSON.stringify(challenge.networks) === JSON.stringify(input.networks);
      if (!exact) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      const consumed = statement(this.#db, `
        UPDATE crypto_app_wallet_challenges
        SET state = 'consumed', consumed_at = ?
        WHERE workspace_id = ? AND account_id = ? AND challenge_id = ? AND state = 'pending'
      `).run(input.consumedAt, input.workspaceId, input.accountId, input.challengeId).changes ?? 0;
      if (consumed !== 1) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      statement(this.#db, `
        INSERT INTO crypto_app_wallet_proofs(
          workspace_id, wallet_connection_id, connection_id, account_id, app_id,
          manifest_revision, wallet_family, address_digest, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.workspaceId,
        input.proofId,
        input.connection.id,
        input.accountId,
        input.appId,
        input.manifestRevision,
        input.walletFamily,
        input.addressDigest,
        input.consumedAt,
      );
      this.#insertConnection(input.connection);
      this.#db.exec("COMMIT");
      return true;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  resolveWalletProof(input: {
    workspaceId: string;
    walletConnectionId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
  }): { walletFamily: MatterhornCryptoAppWalletFamily; addressDigest: string } | null {
    const row = statement(this.#db, `
      SELECT wallet_connection_id, wallet_family, address_digest
      FROM crypto_app_wallet_proofs
      WHERE workspace_id = ? AND wallet_connection_id = ?
        AND connection_id = ? AND app_id = ? AND manifest_revision = ? LIMIT 1
    `).get(
      input.workspaceId,
      input.walletConnectionId,
      input.connectionId,
      input.appId,
      input.manifestRevision,
    ) as WalletProofRow | undefined;
    if (!row) return null;
    if (!safeIdentifier(row.wallet_connection_id) || !digest(row.address_digest)) {
      throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
    }
    return { walletFamily: walletFamily(row.wallet_family), addressDigest: row.address_digest };
  }

  createOAuthFlow(flow: MatterhornCryptoAppOAuthFlowRecord): void {
    try {
      statement(this.#db, `
        INSERT INTO crypto_app_oauth_flows(
          workspace_id, flow_id, account_id, app_id, manifest_revision,
          binding_id, state_digest, verifier_envelope, action_ids_json,
          scopes_json, networks_json, issuer, resource, audience, redirect_uri,
          issued_at, expires_at, state, error_code, connection_id, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        flow.workspaceId,
        flow.flowId,
        flow.accountId,
        flow.appId,
        flow.manifestRevision,
        flow.bindingId,
        flow.stateDigest,
        flow.verifierEnvelope,
        JSON.stringify(flow.actionIds),
        JSON.stringify(flow.scopes),
        JSON.stringify(flow.networks),
        flow.issuer,
        flow.resource,
        flow.audience,
        flow.redirectUri,
        flow.issuedAt,
        flow.expiresAt,
        flow.state,
        flow.errorCode,
        flow.connectionId,
        flow.consumedAt,
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) {
        throw new MatterhornCryptoAppConnectionStoreError("crypto_app_oauth_flow_conflict");
      }
      throw error;
    }
  }

  getOAuthFlowByStateDigest(stateDigest: string): MatterhornCryptoAppOAuthFlowRecord | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_oauth_flows WHERE state_digest = ? LIMIT 1
    `).get(stateDigest) as OAuthFlowRow | undefined;
    return row ? toOAuthFlow(row) : null;
  }

  getOAuthFlow(
    workspaceId: string,
    accountId: string,
    flowId: string,
  ): MatterhornCryptoAppOAuthFlowRecord | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_oauth_flows
      WHERE workspace_id = ? AND account_id = ? AND flow_id = ? LIMIT 1
    `).get(workspaceId, accountId, flowId) as OAuthFlowRow | undefined;
    return row ? toOAuthFlow(row) : null;
  }

  failOAuthFlow(input: {
    stateDigest: string;
    errorCode: "authorization_denied" | "connection_failed";
    consumedAt: string;
  }): boolean {
    return (statement(this.#db, `
      UPDATE crypto_app_oauth_flows
      SET state = 'failed', error_code = ?, consumed_at = ?, verifier_envelope = ''
      WHERE state_digest = ? AND state = 'pending'
    `).run(input.errorCode, input.consumedAt, input.stateDigest).changes ?? 0) === 1;
  }

  finalizeOAuthFlow(input: {
    flow: MatterhornCryptoAppOAuthFlowRecord;
    token: MatterhornCryptoAppOAuthTokenRecord;
    connection: MatterhornCryptoAppConnection;
    consumedAt: string;
  }): boolean {
    if (input.connection.workspaceId !== input.flow.workspaceId
      || input.connection.createdBy !== input.flow.accountId
      || input.connection.appId !== input.flow.appId
      || input.connection.manifestRevision !== input.flow.manifestRevision
      || input.connection.id !== input.token.connectionId
      || input.connection.credential.type !== "oauth2"
      || input.connection.credential.secretReference !== `vault://crypto-app-oauth/${input.token.oauthTokenId}`
      || input.token.workspaceId !== input.flow.workspaceId
      || input.token.accountId !== input.flow.accountId
      || input.token.appId !== input.flow.appId
      || input.token.manifestRevision !== input.flow.manifestRevision
      || input.token.bindingId !== input.flow.bindingId
      || input.token.resource !== input.flow.resource
      || input.token.audience !== input.flow.audience) {
      throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
    }
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = statement(this.#db, `
        SELECT * FROM crypto_app_oauth_flows WHERE state_digest = ? LIMIT 1
      `).get(input.flow.stateDigest) as OAuthFlowRow | undefined;
      if (!row) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      const current = toOAuthFlow(row);
      const exact = current.state === "pending"
        && current.workspaceId === input.flow.workspaceId
        && current.flowId === input.flow.flowId
        && current.accountId === input.flow.accountId
        && current.appId === input.flow.appId
        && current.manifestRevision === input.flow.manifestRevision
        && current.bindingId === input.flow.bindingId
        && current.verifierEnvelope === input.flow.verifierEnvelope
        && current.expiresAt === input.flow.expiresAt
        && current.expiresAt > input.consumedAt
        && current.issuer === input.flow.issuer
        && current.resource === input.flow.resource
        && current.audience === input.flow.audience
        && current.redirectUri === input.flow.redirectUri
        && JSON.stringify(current.actionIds) === JSON.stringify(input.flow.actionIds)
        && JSON.stringify(current.scopes) === JSON.stringify(input.flow.scopes)
        && JSON.stringify(current.networks) === JSON.stringify(input.flow.networks);
      if (!exact) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      const consumed = statement(this.#db, `
        UPDATE crypto_app_oauth_flows
        SET state = 'consumed', connection_id = ?, consumed_at = ?, verifier_envelope = ''
        WHERE state_digest = ? AND state = 'pending'
      `).run(input.connection.id, input.consumedAt, input.flow.stateDigest).changes ?? 0;
      if (consumed !== 1) {
        this.#db.exec("ROLLBACK");
        return false;
      }
      this.#insertOAuthToken(input.token);
      this.#insertConnection(input.connection);
      this.#db.exec("COMMIT");
      return true;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  resolveOAuthToken(input: {
    workspaceId: string;
    connectionId: string;
    oauthTokenId: string;
    appId: string;
    manifestRevision: string;
  }): MatterhornCryptoAppOAuthTokenRecord | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_oauth_tokens
      WHERE workspace_id = ? AND connection_id = ? AND oauth_token_id = ?
        AND app_id = ? AND manifest_revision = ? LIMIT 1
    `).get(
      input.workspaceId,
      input.connectionId,
      input.oauthTokenId,
      input.appId,
      input.manifestRevision,
    ) as OAuthTokenRow | undefined;
    return row ? toOAuthToken(row) : null;
  }

  updateOAuthToken(input: {
    workspaceId: string;
    connectionId: string;
    oauthTokenId: string;
    appId: string;
    manifestRevision: string;
    tokenEnvelope: string;
    scopes: string[];
    expiresAt: string;
    refreshable: boolean;
    updatedAt: string;
  }): boolean {
    return (statement(this.#db, `
      UPDATE crypto_app_oauth_tokens
      SET token_envelope = ?, scopes_json = ?, expires_at = ?, refreshable = ?, updated_at = ?
      WHERE workspace_id = ? AND connection_id = ? AND oauth_token_id = ?
        AND app_id = ? AND manifest_revision = ?
    `).run(
      input.tokenEnvelope,
      JSON.stringify(input.scopes),
      input.expiresAt,
      input.refreshable ? 1 : 0,
      input.updatedAt,
      input.workspaceId,
      input.connectionId,
      input.oauthTokenId,
      input.appId,
      input.manifestRevision,
    ).changes ?? 0) === 1;
  }

  get(workspaceId: string, connectionId: string): MatterhornCryptoAppConnection | null {
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_connections
      WHERE workspace_id = ? AND connection_id = ? LIMIT 1
    `).get(workspaceId, connectionId) as ConnectionRow | undefined;
    return row ? toConnection(row, this.#authorityKey) : null;
  }

  list(workspaceId: string): MatterhornCryptoAppConnection[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_app_connections
      WHERE workspace_id = ? ORDER BY created_at ASC, connection_id ASC
    `).all(workspaceId) as ConnectionRow[]).map((row) => toConnection(row, this.#authorityKey));
  }

  transition(input: {
    workspaceId: string;
    connectionId: string;
    expectedState: MatterhornCryptoAppConnectionState;
    nextState: MatterhornCryptoAppConnectionState;
    updatedAt: string;
  }): MatterhornCryptoAppConnection | null {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = statement(this.#db, `
        SELECT * FROM crypto_app_connections
        WHERE workspace_id = ? AND connection_id = ? AND state = ? LIMIT 1
      `).get(
        input.workspaceId,
        input.connectionId,
        input.expectedState,
      ) as ConnectionRow | undefined;
      if (!row) {
        this.#db.exec("COMMIT");
        return null;
      }
      const current = toConnection(row, this.#authorityKey);
      const next: MatterhornCryptoAppConnection = {
        ...current,
        state: input.nextState,
        updatedAt: input.updatedAt,
      };
      if (!exactIsoTimestamp(input.updatedAt) || input.updatedAt < current.updatedAt) {
        throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
      }
      const nextRow = connectionRow(next, this.#authorityKey);
      const changed = statement(this.#db, `
        UPDATE crypto_app_connections
        SET state = ?, updated_at = ?, authority_seal = ?
        WHERE workspace_id = ? AND connection_id = ? AND state = ?
      `).run(
        input.nextState,
        input.updatedAt,
        nextRow.authority_seal,
        input.workspaceId,
        input.connectionId,
        input.expectedState,
      ).changes ?? 0;
      if (changed !== 1) {
        this.#db.exec("ROLLBACK");
        return null;
      }
      if (input.nextState === "revoked") {
        statement(this.#db, `
          DELETE FROM crypto_app_oauth_tokens WHERE workspace_id = ? AND connection_id = ?
        `).run(input.workspaceId, input.connectionId);
        statement(this.#db, `
          DELETE FROM crypto_app_wallet_proofs WHERE workspace_id = ? AND connection_id = ?
        `).run(input.workspaceId, input.connectionId);
      }
      this.#db.exec("COMMIT");
      return next;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  purgeWorkspace(workspaceId: string): number {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      statement(this.#db, "DELETE FROM crypto_app_oauth_flows WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_app_oauth_tokens WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_app_wallet_challenges WHERE workspace_id = ?").run(workspaceId);
      statement(this.#db, "DELETE FROM crypto_app_wallet_proofs WHERE workspace_id = ?").run(workspaceId);
      const changes = statement(this.#db, "DELETE FROM crypto_app_connections WHERE workspace_id = ?")
        .run(workspaceId).changes ?? 0;
      this.#db.exec("COMMIT");
      return changes;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  pruneSetupMetadata(input: {
    now: string;
    deleteBefore: string;
  }): MatterhornCryptoAppConnectionMaintenanceResult {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const walletChallengesDeleted = statement(this.#db, `
        DELETE FROM crypto_app_wallet_challenges
        WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
          OR (consumed_at IS NULL AND expires_at < ?)
      `).run(input.deleteBefore, input.deleteBefore).changes ?? 0;
      const oauthFlowsDeleted = statement(this.#db, `
        DELETE FROM crypto_app_oauth_flows
        WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
          OR (consumed_at IS NULL AND expires_at < ?)
      `).run(input.deleteBefore, input.deleteBefore).changes ?? 0;
      const oauthVerifiersCleared = statement(this.#db, `
        UPDATE crypto_app_oauth_flows
        SET verifier_envelope = ''
        WHERE state = 'pending' AND expires_at <= ? AND verifier_envelope <> ''
      `).run(input.now).changes ?? 0;
      this.#db.exec("COMMIT");
      return { walletChallengesDeleted, oauthFlowsDeleted, oauthVerifiersCleared };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#db.close();
    this.#authorityKey.fill(0);
  }

  #insertConnection(connection: MatterhornCryptoAppConnection): void {
    const row = connectionRow(connection, this.#authorityKey);
    statement(this.#db, `
      INSERT INTO crypto_app_connections(
        workspace_id, connection_id, app_id, manifest_revision, state,
        action_ids_json, scopes_json, networks_json, credential_json,
        created_by, created_at, updated_at, authority_seal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.workspace_id,
      row.connection_id,
      row.app_id,
      row.manifest_revision,
      row.state,
      row.action_ids_json,
      row.scopes_json,
      row.networks_json,
      row.credential_json,
      row.created_by,
      row.created_at,
      row.updated_at,
      row.authority_seal,
    );
  }

  #backfillConnectionAuthoritySeals(): void {
    const rows = statement(this.#db, `
      SELECT * FROM crypto_app_connections WHERE authority_seal IS NULL
    `).all() as ConnectionRow[];
    if (rows.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const connection = connectionValue(row);
        const changed = statement(this.#db, `
          UPDATE crypto_app_connections SET authority_seal = ?
          WHERE workspace_id = ? AND connection_id = ? AND authority_seal IS NULL
        `).run(
          sealConnectionAuthority(connection, this.#authorityKey),
          connection.workspaceId,
          connection.id,
        ).changes ?? 0;
        if (changed !== 1) {
          throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
        }
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  #insertOAuthToken(token: MatterhornCryptoAppOAuthTokenRecord): void {
    statement(this.#db, `
      INSERT INTO crypto_app_oauth_tokens(
        workspace_id, oauth_token_id, connection_id, account_id, app_id,
        manifest_revision, binding_id, resource, audience, token_envelope,
        scopes_json, expires_at, refreshable, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token.workspaceId,
      token.oauthTokenId,
      token.connectionId,
      token.accountId,
      token.appId,
      token.manifestRevision,
      token.bindingId,
      token.resource,
      token.audience,
      token.tokenEnvelope,
      JSON.stringify(token.scopes),
      token.expiresAt,
      token.refreshable ? 1 : 0,
      token.createdAt,
      token.updatedAt,
    );
  }
}
