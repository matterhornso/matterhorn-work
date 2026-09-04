import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  type MatterhornCryptoAppConnection,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppConnectionState,
  type MatterhornCryptoAppWalletFamily,
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
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
  }
}

function connectionState(value: string): MatterhornCryptoAppConnectionState {
  if (value === "active" || value === "paused" || value === "revoked") return value;
  throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
}

function toConnection(row: ConnectionRow): MatterhornCryptoAppConnection {
  return {
    version: "matterhorn.crypto-app-connection.v1",
    id: row.connection_id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    state: connectionState(row.state),
    grantedActionIds: parseJson<string[]>(row.action_ids_json),
    grantedScopes: parseJson<string[]>(row.scopes_json),
    grantedNetworks: parseJson<string[]>(row.networks_json),
    credential: parseJson<MatterhornCryptoAppConnectionCredential>(row.credential_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function walletFamily(value: string): MatterhornCryptoAppWalletFamily {
  if (value === "evm" || value === "sui") return value;
  throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
}

function toWalletChallenge(row: WalletChallengeRow): MatterhornCryptoAppWalletChallengeRecord {
  if (row.state !== "pending" && row.state !== "consumed") {
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
    actionIds: parseJson<string[]>(row.action_ids_json),
    scopes: parseJson<string[]>(row.scopes_json),
    networks: parseJson<string[]>(row.networks_json),
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
  return {
    workspaceId: row.workspace_id,
    flowId: row.flow_id,
    accountId: row.account_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    bindingId: row.binding_id,
    stateDigest: row.state_digest,
    verifierEnvelope: row.verifier_envelope,
    actionIds: parseJson<string[]>(row.action_ids_json),
    scopes: parseJson<string[]>(row.scopes_json),
    networks: parseJson<string[]>(row.networks_json),
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
    scopes: parseJson<string[]>(row.scopes_json),
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

  constructor(readonly path = cryptoAppConnectionPath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
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
    chmodSync(path, 0o600);
  }

  create(connection: MatterhornCryptoAppConnection): void {
    try {
      statement(this.#db, `
        INSERT INTO crypto_app_connections(
          workspace_id, connection_id, app_id, manifest_revision, state,
          action_ids_json, scopes_json, networks_json, credential_json,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        connection.workspaceId,
        connection.id,
        connection.appId,
        connection.manifestRevision,
        connection.state,
        JSON.stringify(connection.grantedActionIds),
        JSON.stringify(connection.grantedScopes),
        JSON.stringify(connection.grantedNetworks),
        JSON.stringify(connection.credential),
        connection.createdBy,
        connection.createdAt,
        connection.updatedAt,
      );
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
    return row ? { walletFamily: walletFamily(row.wallet_family), addressDigest: row.address_digest } : null;
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
    return row ? toConnection(row) : null;
  }

  list(workspaceId: string): MatterhornCryptoAppConnection[] {
    return (statement(this.#db, `
      SELECT * FROM crypto_app_connections
      WHERE workspace_id = ? ORDER BY created_at ASC, connection_id ASC
    `).all(workspaceId) as ConnectionRow[]).map(toConnection);
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
        UPDATE crypto_app_connections
        SET state = ?, updated_at = ?
        WHERE workspace_id = ? AND connection_id = ? AND state = ?
        RETURNING *
      `).get(
        input.nextState,
        input.updatedAt,
        input.workspaceId,
        input.connectionId,
        input.expectedState,
      ) as ConnectionRow | undefined;
      if (row && input.nextState === "revoked") {
        statement(this.#db, `
          DELETE FROM crypto_app_oauth_tokens WHERE workspace_id = ? AND connection_id = ?
        `).run(input.workspaceId, input.connectionId);
        statement(this.#db, `
          DELETE FROM crypto_app_wallet_proofs WHERE workspace_id = ? AND connection_id = ?
        `).run(input.workspaceId, input.connectionId);
      }
      this.#db.exec("COMMIT");
      return row ? toConnection(row) : null;
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
  }

  #insertConnection(connection: MatterhornCryptoAppConnection): void {
    statement(this.#db, `
      INSERT INTO crypto_app_connections(
        workspace_id, connection_id, app_id, manifest_revision, state,
        action_ids_json, scopes_json, networks_json, credential_json,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      connection.workspaceId,
      connection.id,
      connection.appId,
      connection.manifestRevision,
      connection.state,
      JSON.stringify(connection.grantedActionIds),
      JSON.stringify(connection.grantedScopes),
      JSON.stringify(connection.grantedNetworks),
      JSON.stringify(connection.credential),
      connection.createdBy,
      connection.createdAt,
      connection.updatedAt,
    );
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
