import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION,
  type MatterhornCryptoAppConnectionView,
  type MatterhornCryptoAppOAuthAuthorization,
  type MatterhornCryptoAppOAuthAuthorizationRequest,
  type MatterhornCryptoAppOAuthFlowStatus,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  type MatterhornCryptoAppOAuthFlowRecord,
  type MatterhornCryptoAppOAuthTokenRecord,
  MatterhornCryptoAppConnectionStore,
} from "./crypto-app-connection-store.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import {
  isPublicHttpsCryptoAdapterEndpoint,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";
import { createPinnedFormRequester } from "./crypto-app-https-transport.js";
import { canonicalJson } from "./guarded-runtime-crypto.js";

const CONFIG_ENV = "MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON";
const ENCRYPTION_KEY_ENV = "MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY";
const SECRET_ENV_PREFIX = "MATTERHORN_CRYPTO_APP_SECRET_";
const REFERENCE_PREFIX = "vault://crypto-app-oauth/";
const FLOW_TTL_MS = 10 * 60_000;
const REFRESH_SKEW_MS = 60_000;
const MAX_CONFIG_BYTES = 128 * 1_024;
const MAX_TOKEN_BYTES = 16 * 1_024;
const MAX_TOKEN_LIFETIME_SECONDS = 31 * 24 * 60 * 60;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_ID = /^[A-Z][A-Z0-9_]{2,63}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/;
const ENVELOPE_VERSION = "matterhorn.crypto-app-oauth-envelope.v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

type OAuthClientBinding = {
  id: string;
  appId: string;
  manifestRevision: string;
  clientId: string;
  clientSecretId: string | null;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

type OAuthTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
};

type OAuthEnvelope = {
  version: typeof ENVELOPE_VERSION;
  algorithm: typeof ENCRYPTION_ALGORITHM;
  iv: string;
  authenticationTag: string;
  ciphertext: string;
};

type ValidatedTokenResponse = OAuthTokenPayload & {
  scopes: string[];
  expiresAt: string;
};

export type MatterhornCryptoAppOAuthTokenClient = {
  exchange(input: {
    binding: OAuthClientBinding;
    clientSecret: string | null;
    code: string;
    codeVerifier: string;
    resource: string;
    audience: string;
  }): Promise<unknown>;
  refresh(input: {
    binding: OAuthClientBinding;
    clientSecret: string | null;
    refreshToken: string;
    resource: string;
    audience: string;
  }): Promise<unknown>;
};

export class MatterhornCryptoAppOAuthConnectionError extends Error {
  constructor(readonly code:
    | "oauth_connection_unavailable"
    | "oauth_connection_input_invalid"
    | "oauth_connection_authentication_mismatch"
    | "oauth_connection_binding_unavailable"
    | "oauth_flow_invalid"
    | "oauth_flow_expired"
    | "oauth_callback_invalid"
    | "oauth_token_exchange_failed"
    | "oauth_token_response_invalid"
    | "oauth_token_unavailable") {
    super(code);
    this.name = "MatterhornCryptoAppOAuthConnectionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function publicExactHttpsUrl(value: unknown, options: { callback?: boolean } = {}): string {
  if (typeof value !== "string" || value.length > 2_048 || value !== value.trim()) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  if (!isPublicHttpsCryptoAdapterEndpoint(url.href)) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".home.arpa")) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  if (options.callback && url.pathname !== "/oauth/crypto-apps/callback") {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  return url.href;
}

function parseBinding(value: unknown): OAuthClientBinding {
  if (!isRecord(value)
    || Object.keys(value).some((key) => ![
      "id",
      "appId",
      "manifestRevision",
      "clientId",
      "clientSecretId",
      "redirectUri",
      "authorizationEndpoint",
      "tokenEndpoint",
    ].includes(key))
    || typeof value.id !== "string"
    || !SECRET_ID.test(value.id)
    || typeof value.appId !== "string"
    || !IDENTIFIER.test(value.appId)
    || typeof value.manifestRevision !== "string"
    || !IDENTIFIER.test(value.manifestRevision)
    || typeof value.clientId !== "string"
    || value.clientId.length < 1
    || value.clientId.length > 512
    || /[\u0000-\u001f\u007f]/.test(value.clientId)
    || (value.clientSecretId !== undefined
      && value.clientSecretId !== null
      && (typeof value.clientSecretId !== "string" || !SECRET_ID.test(value.clientSecretId)))) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  return {
    id: value.id,
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    clientId: value.clientId,
    clientSecretId: typeof value.clientSecretId === "string" ? value.clientSecretId : null,
    redirectUri: publicExactHttpsUrl(value.redirectUri, { callback: true }),
    authorizationEndpoint: publicExactHttpsUrl(value.authorizationEndpoint),
    tokenEndpoint: publicExactHttpsUrl(value.tokenEndpoint),
  };
}

function parseBindings(value: string | undefined): OAuthClientBinding[] {
  if (!value?.trim()) return [];
  if (Buffer.byteLength(value, "utf8") > MAX_CONFIG_BYTES) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  if (!Array.isArray(decoded) || decoded.length > 256) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  const bindings = decoded.map(parseBinding);
  const ids = new Set<string>();
  const apps = new Set<string>();
  for (const binding of bindings) {
    const appKey = `${binding.appId}\u0000${binding.manifestRevision}`;
    if (ids.has(binding.id) || apps.has(appKey)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
    }
    ids.add(binding.id);
    apps.add(appKey);
  }
  return bindings;
}

function keyFromSecret(secret: string, context: string): Buffer {
  const bytes = Buffer.from(secret, "utf8");
  if (bytes.byteLength < 32) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_unavailable");
  }
  try {
    return createHmac("sha256", bytes).update(context, "utf8").digest();
  } finally {
    bytes.fill(0);
  }
}

function safeToken(value: unknown): value is string {
  return typeof value === "string"
    && Buffer.byteLength(value, "utf8") >= 8
    && Buffer.byteLength(value, "utf8") <= MAX_TOKEN_BYTES
    && !/[\u0000-\u0020\u007f]/.test(value);
}

function exactBase64(value: unknown, expectedBytes: number | null): Buffer {
  if (typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || (expectedBytes !== null && bytes.byteLength !== expectedBytes)) {
    bytes.fill(0);
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  }
  return bytes;
}

function envelopeAad(input: {
  kind: "verifier" | "token";
  workspaceId: string;
  accountId: string;
  appId: string;
  manifestRevision: string;
  bindingId: string;
  recordId: string;
}): Buffer {
  return Buffer.from(canonicalJson({ domain: "matterhorn:crypto-app-oauth:v1", ...input }), "utf8");
}

function encryptValue(key: Buffer, aad: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(canonicalJson(value), "utf8"), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    try {
      const envelope: OAuthEnvelope = {
        version: ENVELOPE_VERSION,
        algorithm: ENCRYPTION_ALGORITHM,
        iv: iv.toString("base64"),
        authenticationTag: authenticationTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      };
      return JSON.stringify(envelope);
    } finally {
      ciphertext.fill(0);
      authenticationTag.fill(0);
    }
  } finally {
    iv.fill(0);
  }
}

function decryptValue(key: Buffer, aad: Buffer, encoded: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).some((keyName) => ![
      "version", "algorithm", "iv", "authenticationTag", "ciphertext",
    ].includes(keyName))
    || parsed.version !== ENVELOPE_VERSION
    || parsed.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  }
  const iv = exactBase64(parsed.iv, 12);
  const tag = exactBase64(parsed.authenticationTag, 16);
  const ciphertext = exactBase64(parsed.ciphertext, null);
  try {
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch (error) {
    if (error instanceof MatterhornCryptoAppOAuthConnectionError) throw error;
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  } finally {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

function stringArrayEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseTokenResponse(value: unknown, input: {
  requestedScopes: string[];
  resource: string;
  audience: string;
  now: Date;
  previousRefreshToken?: string | null;
}): ValidatedTokenResponse {
  if (!isRecord(value)
    || Object.keys(value).some((keyName) => ![
      "access_token", "refresh_token", "token_type", "expires_in", "scope", "resource", "audience",
    ].includes(keyName))
    || value.token_type !== "Bearer"
    || !safeToken(value.access_token)
    || (value.refresh_token !== undefined && !safeToken(value.refresh_token))
    || !Number.isSafeInteger(value.expires_in)
    || Number(value.expires_in) < 1
    || Number(value.expires_in) > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_response_invalid");
  }
  const returnedScopes = value.scope === undefined
    ? [...input.requestedScopes]
    : typeof value.scope === "string"
      ? value.scope.split(" ").filter(Boolean)
      : [];
  if (!stringArrayEqual([...new Set(returnedScopes)].sort(), [...input.requestedScopes].sort())) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_response_invalid");
  }
  if ((value.resource !== undefined && value.resource !== input.resource)
    || (value.audience !== undefined
      && value.audience !== input.audience
      && !(Array.isArray(value.audience)
        && value.audience.length === 1
        && value.audience[0] === input.audience))) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_response_invalid");
  }
  return {
    accessToken: value.access_token,
    refreshToken: typeof value.refresh_token === "string"
      ? value.refresh_token
      : input.previousRefreshToken ?? null,
    scopes: [...input.requestedScopes],
    expiresAt: new Date(input.now.getTime() + Number(value.expires_in) * 1_000).toISOString(),
  };
}

function verifierPayload(value: unknown): string {
  if (!isRecord(value)
    || Object.keys(value).some((keyName) => keyName !== "codeVerifier")
    || typeof value.codeVerifier !== "string"
    || !/^[A-Za-z0-9_-]{43,128}$/.test(value.codeVerifier)) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
  }
  return value.codeVerifier;
}

function tokenPayload(value: unknown): OAuthTokenPayload {
  if (!isRecord(value)
    || Object.keys(value).some((keyName) => keyName !== "accessToken" && keyName !== "refreshToken")
    || !safeToken(value.accessToken)
    || (value.refreshToken !== null && !safeToken(value.refreshToken))) {
    throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

function defaultTokenClient(): MatterhornCryptoAppOAuthTokenClient {
  const requestForm = createPinnedFormRequester();
  const request = async (binding: OAuthClientBinding, body: URLSearchParams): Promise<unknown> => {
    const resolved = await resolvePublicCryptoAdapterEndpoint(binding.tokenEndpoint);
    const response = await requestForm({
      endpoint: resolved.endpoint,
      approvedAddresses: resolved.approvedAddresses,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.value;
  };
  const common = (
    binding: OAuthClientBinding,
    clientSecret: string | null,
    resource: string,
    audience: string,
  ): URLSearchParams => {
    const body = new URLSearchParams({
      client_id: binding.clientId,
      resource,
      audience,
    });
    if (clientSecret) body.set("client_secret", clientSecret);
    return body;
  };
  return {
    exchange: async (input) => {
      const body = common(input.binding, input.clientSecret, input.resource, input.audience);
      body.set("grant_type", "authorization_code");
      body.set("code", input.code);
      body.set("redirect_uri", input.binding.redirectUri);
      body.set("code_verifier", input.codeVerifier);
      return request(input.binding, body);
    },
    refresh: async (input) => {
      const body = common(input.binding, input.clientSecret, input.resource, input.audience);
      body.set("grant_type", "refresh_token");
      body.set("refresh_token", input.refreshToken);
      return request(input.binding, body);
    },
  };
}

type OAuthConnectionOptions = {
  connections: MatterhornCryptoAppConnections;
  store: MatterhornCryptoAppConnectionStore;
  env?: NodeJS.ProcessEnv;
  tokenClient?: MatterhornCryptoAppOAuthTokenClient;
  now?: () => Date;
  flowId?: () => string;
  tokenId?: () => string;
};

/**
 * Server-owned OAuth boundary for certified crypto apps. Browsers receive only
 * an authorization URL and opaque flow id; codes, PKCE verifiers, client
 * secrets, access tokens, and refresh tokens never enter account responses,
 * model context, adapter output, receipts, or browser storage.
 */
export class MatterhornCryptoAppOAuthConnections {
  readonly #connections: MatterhornCryptoAppConnections;
  readonly #store: MatterhornCryptoAppConnectionStore;
  readonly #env: NodeJS.ProcessEnv;
  readonly #bindings: OAuthClientBinding[];
  readonly #tokenClient: MatterhornCryptoAppOAuthTokenClient;
  readonly #stateKey: Buffer;
  readonly #encryptionKey: Buffer;
  readonly #now: () => Date;
  readonly #flowId: () => string;
  readonly #tokenId: () => string;
  readonly #refreshes = new Map<string, Promise<Record<string, string>>>();

  constructor(options: OAuthConnectionOptions) {
    this.#connections = options.connections;
    this.#store = options.store;
    this.#env = options.env ?? process.env;
    this.#bindings = parseBindings(this.#env[CONFIG_ENV]);
    const secret = this.#env[ENCRYPTION_KEY_ENV] ?? "";
    this.#stateKey = keyFromSecret(secret, "matterhorn.crypto-app-oauth-state.v1");
    this.#encryptionKey = keyFromSecret(secret, "matterhorn.crypto-app-oauth-encryption.v1");
    this.#tokenClient = options.tokenClient ?? defaultTokenClient();
    this.#now = options.now ?? (() => new Date());
    this.#flowId = options.flowId ?? (() => `cxo_${randomUUID()}`);
    this.#tokenId = options.tokenId ?? (() => `cxt_${randomUUID()}`);
  }

  configuredBindings(): number {
    return this.#bindings.length;
  }

  issue(input: MatterhornCryptoAppOAuthAuthorizationRequest & {
    workspaceId: string;
    accountId: string;
  }): MatterhornCryptoAppOAuthAuthorization {
    const grant = this.#connections.validateGrant({
      workspaceId: input.workspaceId,
      createdBy: input.accountId,
      appId: input.appId,
      grantedActionIds: input.grantedActionIds,
      grantedScopes: input.grantedScopes,
      grantedNetworks: input.grantedNetworks,
    });
    if (grant.authentication.type !== "oauth2") {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_authentication_mismatch");
    }
    const binding = this.#binding(input.appId, grant.manifestRevision);
    this.#assertBindingMatches(binding, grant.authentication.authorizationServer);
    this.#clientSecret(binding);
    const now = this.#now();
    const flowId = this.#flowId();
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    const flow: MatterhornCryptoAppOAuthFlowRecord = {
      workspaceId: input.workspaceId,
      flowId,
      accountId: input.accountId,
      appId: input.appId,
      manifestRevision: grant.manifestRevision,
      bindingId: binding.id,
      stateDigest: this.#stateDigest(state),
      verifierEnvelope: "",
      actionIds: [...input.grantedActionIds],
      scopes: [...input.grantedScopes],
      networks: [...input.grantedNetworks],
      issuer: grant.authentication.authorizationServer,
      resource: grant.authentication.resource,
      audience: grant.authentication.audience,
      redirectUri: binding.redirectUri,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + FLOW_TTL_MS).toISOString(),
      state: "pending",
      errorCode: null,
      connectionId: null,
      consumedAt: null,
    };
    const verifierAad = envelopeAad({
      kind: "verifier",
      workspaceId: flow.workspaceId,
      accountId: flow.accountId,
      appId: flow.appId,
      manifestRevision: flow.manifestRevision,
      bindingId: flow.bindingId,
      recordId: flow.flowId,
    });
    try {
      flow.verifierEnvelope = encryptValue(this.#encryptionKey, verifierAad, { codeVerifier });
    } finally {
      verifierAad.fill(0);
    }
    this.#store.createOAuthFlow(flow);
    const authorizationUrl = new URL(binding.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", binding.clientId);
    authorizationUrl.searchParams.set("redirect_uri", binding.redirectUri);
    authorizationUrl.searchParams.set("scope", input.grantedScopes.join(" "));
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("resource", grant.authentication.resource);
    authorizationUrl.searchParams.set("audience", grant.authentication.audience);
    return {
      version: MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION,
      flowId,
      authorizationUrl: authorizationUrl.href,
      expiresAt: flow.expiresAt,
      notice: "connects_selected_app_only",
    };
  }

  status(input: {
    workspaceId: string;
    accountId: string;
    flowId: string;
  }): MatterhornCryptoAppOAuthFlowStatus {
    if (!OPAQUE_ID.test(input.flowId)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_input_invalid");
    }
    const flow = this.#store.getOAuthFlow(input.workspaceId, input.accountId, input.flowId);
    if (!flow) throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
    const expired = flow.state === "pending" && Date.parse(flow.expiresAt) <= this.#now().getTime();
    return {
      version: MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION,
      flowId: flow.flowId,
      status: expired ? "expired" : flow.state === "consumed" ? "connected" : flow.state,
      connectionId: flow.connectionId,
      error: flow.errorCode,
      expiresAt: flow.expiresAt,
    };
  }

  deny(state: string, issuer: string): void {
    const stateDigest = this.#stateDigestFromInput(state);
    const flow = this.#store.getOAuthFlowByStateDigest(stateDigest);
    if (!flow || flow.state !== "pending") {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
    }
    const now = this.#now();
    if (Date.parse(flow.expiresAt) <= now.getTime()) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_expired");
    }
    if (issuer !== flow.issuer) {
      this.#fail(flow, "connection_failed", now);
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_callback_invalid");
    }
    if (!this.#store.failOAuthFlow({
      stateDigest,
      errorCode: "authorization_denied",
      consumedAt: now.toISOString(),
    })) throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
  }

  async complete(input: { state: string; code: string; issuer: string }): Promise<MatterhornCryptoAppConnectionView> {
    const stateDigest = this.#stateDigestFromInput(input.state);
    const flow = this.#store.getOAuthFlowByStateDigest(stateDigest);
    if (!flow || flow.state !== "pending") {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
    }
    const now = this.#now();
    if (Date.parse(flow.expiresAt) <= now.getTime()) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_expired");
    }
    if (typeof input.code !== "string"
      || input.code.length < 1
      || input.code.length > 8_192
      || /[\u0000-\u0020\u007f]/.test(input.code)
      || input.issuer !== flow.issuer) {
      this.#fail(flow, "connection_failed", now);
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_callback_invalid");
    }
    const binding = this.#binding(flow.appId, flow.manifestRevision);
    if (binding.id !== flow.bindingId || binding.redirectUri !== flow.redirectUri) {
      this.#fail(flow, "connection_failed", now);
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_flow_invalid");
    }
    this.#assertBindingMatches(binding, flow.issuer);
    const verifierAad = envelopeAad({
      kind: "verifier",
      workspaceId: flow.workspaceId,
      accountId: flow.accountId,
      appId: flow.appId,
      manifestRevision: flow.manifestRevision,
      bindingId: flow.bindingId,
      recordId: flow.flowId,
    });
    let codeVerifier: string;
    try {
      codeVerifier = verifierPayload(decryptValue(this.#encryptionKey, verifierAad, flow.verifierEnvelope));
    } finally {
      verifierAad.fill(0);
    }
    let rawToken: unknown;
    try {
      rawToken = await this.#tokenClient.exchange({
        binding,
        clientSecret: this.#clientSecret(binding),
        code: input.code,
        codeVerifier,
        resource: flow.resource,
        audience: flow.audience,
      });
    } catch {
      this.#fail(flow, "connection_failed", now);
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_exchange_failed");
    }
    let token: ValidatedTokenResponse;
    try {
      token = parseTokenResponse(rawToken, {
        requestedScopes: flow.scopes,
        resource: flow.resource,
        audience: flow.audience,
        now,
      });
    } catch (error) {
      this.#fail(flow, "connection_failed", now);
      throw error;
    }
    const oauthTokenId = this.#tokenId();
    const tokenAad = envelopeAad({
      kind: "token",
      workspaceId: flow.workspaceId,
      accountId: flow.accountId,
      appId: flow.appId,
      manifestRevision: flow.manifestRevision,
      bindingId: flow.bindingId,
      recordId: oauthTokenId,
    });
    let tokenEnvelope: string;
    try {
      tokenEnvelope = encryptValue(this.#encryptionKey, tokenAad, {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
      });
    } finally {
      tokenAad.fill(0);
    }
    const tokenRecord: Omit<MatterhornCryptoAppOAuthTokenRecord, "connectionId"> = {
      workspaceId: flow.workspaceId,
      oauthTokenId,
      accountId: flow.accountId,
      appId: flow.appId,
      manifestRevision: flow.manifestRevision,
      bindingId: flow.bindingId,
      resource: flow.resource,
      audience: flow.audience,
      tokenEnvelope,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
      refreshable: token.refreshToken !== null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    try {
      return this.#connections.createFromOAuth({
        workspaceId: flow.workspaceId,
        createdBy: flow.accountId,
        appId: flow.appId,
        grantedActionIds: flow.actionIds,
        grantedScopes: flow.scopes,
        grantedNetworks: flow.networks,
        credential: { type: "oauth2", secretReference: `${REFERENCE_PREFIX}${oauthTokenId}` },
        flow,
        token: tokenRecord,
      });
    } catch (error) {
      this.#fail(flow, "connection_failed", now);
      throw error;
    }
  }

  async validateCredential(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    secretReference: string;
  }): Promise<void> {
    this.#resolveTokenRecord(input);
  }

  async resolveHeaders(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    secretReference: string;
  }): Promise<Record<string, string>> {
    const record = this.#resolveTokenRecord(input);
    const payload = this.#decryptToken(record);
    const now = this.#now();
    if (Date.parse(record.expiresAt) > now.getTime() + REFRESH_SKEW_MS) {
      return { authorization: `Bearer ${payload.accessToken}` };
    }
    const pending = this.#refreshes.get(record.oauthTokenId);
    if (pending) return pending;
    const refresh = this.#refreshHeaders(record, payload, now);
    this.#refreshes.set(record.oauthTokenId, refresh);
    try {
      return await refresh;
    } finally {
      if (this.#refreshes.get(record.oauthTokenId) === refresh) {
        this.#refreshes.delete(record.oauthTokenId);
      }
    }
  }

  async #refreshHeaders(
    record: MatterhornCryptoAppOAuthTokenRecord,
    payload: OAuthTokenPayload,
    now: Date,
  ): Promise<Record<string, string>> {
    if (!payload.refreshToken) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    }
    const binding = this.#binding(record.appId, record.manifestRevision);
    if (binding.id !== record.bindingId) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    }
    let refreshed: ValidatedTokenResponse;
    try {
      const value = await this.#tokenClient.refresh({
        binding,
        clientSecret: this.#clientSecret(binding),
        refreshToken: payload.refreshToken,
        resource: record.resource,
        audience: record.audience,
      });
      refreshed = parseTokenResponse(value, {
        requestedScopes: record.scopes,
        resource: record.resource,
        audience: record.audience,
        now,
        previousRefreshToken: payload.refreshToken,
      });
    } catch {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    }
    const tokenAad = this.#tokenAad(record);
    try {
      const tokenEnvelope = encryptValue(this.#encryptionKey, tokenAad, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
      });
      const updated = this.#store.updateOAuthToken({
        workspaceId: record.workspaceId,
        connectionId: record.connectionId,
        oauthTokenId: record.oauthTokenId,
        appId: record.appId,
        manifestRevision: record.manifestRevision,
        tokenEnvelope,
        scopes: refreshed.scopes,
        expiresAt: refreshed.expiresAt,
        refreshable: refreshed.refreshToken !== null,
        updatedAt: now.toISOString(),
      });
      if (!updated) throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
      return { authorization: `Bearer ${refreshed.accessToken}` };
    } finally {
      tokenAad.fill(0);
    }
  }

  #resolveTokenRecord(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    secretReference: string;
  }): MatterhornCryptoAppOAuthTokenRecord {
    if (!input.secretReference.startsWith(REFERENCE_PREFIX)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    }
    const oauthTokenId = input.secretReference.slice(REFERENCE_PREFIX.length);
    if (!OPAQUE_ID.test(oauthTokenId)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    }
    const record = this.#store.resolveOAuthToken({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      oauthTokenId,
      appId: input.appId,
      manifestRevision: input.manifestRevision,
    });
    if (!record) throw new MatterhornCryptoAppOAuthConnectionError("oauth_token_unavailable");
    return record;
  }

  #decryptToken(record: MatterhornCryptoAppOAuthTokenRecord): OAuthTokenPayload {
    const aad = this.#tokenAad(record);
    try {
      return tokenPayload(decryptValue(this.#encryptionKey, aad, record.tokenEnvelope));
    } finally {
      aad.fill(0);
    }
  }

  #tokenAad(record: MatterhornCryptoAppOAuthTokenRecord): Buffer {
    return envelopeAad({
      kind: "token",
      workspaceId: record.workspaceId,
      accountId: record.accountId,
      appId: record.appId,
      manifestRevision: record.manifestRevision,
      bindingId: record.bindingId,
      recordId: record.oauthTokenId,
    });
  }

  #binding(appId: string, manifestRevision: string): OAuthClientBinding {
    const binding = this.#bindings.find((candidate) => (
      candidate.appId === appId && candidate.manifestRevision === manifestRevision
    ));
    if (!binding) throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_binding_unavailable");
    return binding;
  }

  #assertBindingMatches(binding: OAuthClientBinding, issuer: string): void {
    const expected = new URL(issuer);
    const authorizationEndpoint = new URL(binding.authorizationEndpoint);
    const tokenEndpoint = new URL(binding.tokenEndpoint);
    if (expected.protocol !== "https:"
      || expected.username
      || expected.password
      || expected.search
      || expected.hash
      || authorizationEndpoint.origin !== expected.origin
      || tokenEndpoint.origin !== expected.origin) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_binding_unavailable");
    }
  }

  #clientSecret(binding: OAuthClientBinding): string | null {
    if (!binding.clientSecretId) return null;
    const value = this.#env[`${SECRET_ENV_PREFIX}${binding.clientSecretId}`];
    if (!value || Buffer.byteLength(value, "utf8") < 8 || Buffer.byteLength(value, "utf8") > MAX_TOKEN_BYTES
      || /[\r\n\0]/.test(value)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_connection_binding_unavailable");
    }
    return value;
  }

  #stateDigestFromInput(state: string): string {
    if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
      throw new MatterhornCryptoAppOAuthConnectionError("oauth_callback_invalid");
    }
    return this.#stateDigest(state);
  }

  #stateDigest(state: string): string {
    return createHmac("sha256", this.#stateKey).update(state, "ascii").digest("hex");
  }

  #fail(
    flow: MatterhornCryptoAppOAuthFlowRecord,
    errorCode: "authorization_denied" | "connection_failed",
    now: Date,
  ): void {
    this.#store.failOAuthFlow({ stateDigest: flow.stateDigest, errorCode, consumedAt: now.toISOString() });
  }

}
