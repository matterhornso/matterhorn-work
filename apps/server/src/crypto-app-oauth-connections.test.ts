import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import {
  MatterhornCryptoAppOAuthConnections,
  type MatterhornCryptoAppOAuthTokenClient,
} from "./crypto-app-oauth-connections.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { MatterhornCryptoAppRegistry, canonicalCryptoAppManifestPayload } from "./crypto-app-registry.js";

const keys = generateKeyPairSync("ed25519");
const TOKEN = "access-token-never-plaintext";
const REFRESH_TOKEN = "refresh-token-never-plaintext";
const OAUTH_SECRET = "oauth-encryption-key-with-more-than-thirty-two-bytes";
const CONNECTION_INTEGRITY_SECRET = "test-connection-integrity-secret-at-least-32-bytes";

function signedManifest(): MatterhornCryptoAppManifest {
  const manifest: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "certified.exchange",
    displayName: "Certified Exchange",
    description: "Certified testnet market research.",
    manifestRevision: "1.0.0",
    publisher: { id: "publisher", keyId: "key-1", algorithm: "ed25519", signature: "pending" },
    transport: { kind: "mcp_http", endpoint: "https://api.exchange.example/v1/matterhorn" },
    authentication: {
      type: "oauth2",
      authorizationServer: "https://auth.exchange.example/",
      resource: "https://api.exchange.example/",
      audience: "matterhorn-certified-app",
      scopes: ["markets:read"],
    },
    networks: [{ protocol: "evm", chainId: "eip155:84532", environment: "testnet" }],
    actions: [{
      id: "read_markets",
      title: "Read markets",
      description: "Read testnet market data.",
      access: "read",
      risk: "informational",
      inputSchema: { type: "object", additionalProperties: false },
      outputProjectionSchema: { type: "object", additionalProperties: false },
      requiredScopes: ["markets:read"],
      requiresFreshness: true,
      freshnessMaxAgeMs: 30_000,
      timeoutMs: 10_000,
      simulationRequired: false,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: {
      privacyPolicyUrl: "https://exchange.example/privacy",
      securityContact: "security@exchange.example",
      statusUrl: null,
    },
  };
  manifest.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(manifest)),
    keys.privateKey,
  ).toString("base64url");
  return manifest;
}

function certifiedRegistry() {
  const now = () => new Date("2026-09-01T12:00:00.000Z");
  const registry = new MatterhornCryptoAppRegistry({
    publisherKeys: [{
      publisherId: "publisher",
      keyId: "key-1",
      algorithm: "ed25519",
      publicKey: keys.publicKey,
    }],
    policyVersion: "policy-1",
    now,
  });
  const manifest = signedManifest();
  registry.register(manifest);
  const report = runCryptoAppManifestConformance(manifest, {
    publisherKey: keys.publicKey,
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    now,
  });
  registry.updateCertification({
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    state: "certified_testnet",
    report,
    runtimeReport: passingCryptoAppRuntimeReportForTest(manifest, report),
  });
  return registry;
}

function config(clientSecretId?: string): NodeJS.ProcessEnv {
  const binding: Record<string, unknown> = {
    id: "EXCHANGE_OAUTH",
    appId: "certified.exchange",
    manifestRevision: "1.0.0",
    clientId: "matterhorn-public-client",
    redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
    authorizationEndpoint: "https://auth.exchange.example/authorize",
    tokenEndpoint: "https://auth.exchange.example/token",
  };
  if (clientSecretId) binding.clientSecretId = clientSecretId;
  return {
    MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY: OAUTH_SECRET,
    MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON: JSON.stringify([binding]),
  };
}

function fixture(options: {
  tokenClient?: MatterhornCryptoAppOAuthTokenClient;
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  let now = new Date("2026-09-01T12:00:00.000Z");
  const dbPath = options.dbPath ?? join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-oauth-")), "connections.db");
  const store = new MatterhornCryptoAppConnectionStore(dbPath, CONNECTION_INTEGRITY_SECRET);
  const connections = new MatterhornCryptoAppConnections({
    registry: certifiedRegistry(),
    store,
    now: () => now,
    id: () => "cxc_oauth_1",
  });
  const tokenClient: MatterhornCryptoAppOAuthTokenClient = options.tokenClient ?? {
    exchange: async () => ({
      access_token: TOKEN,
      refresh_token: REFRESH_TOKEN,
      token_type: "Bearer",
      expires_in: 3_600,
      scope: "markets:read",
      resource: "https://api.exchange.example/",
      audience: "matterhorn-certified-app",
    }),
    refresh: async () => ({
      access_token: "refreshed-access-token",
      refresh_token: "refreshed-refresh-token",
      token_type: "Bearer",
      expires_in: 3_600,
      scope: "markets:read",
      resource: "https://api.exchange.example/",
      audience: "matterhorn-certified-app",
    }),
  };
  const oauth = new MatterhornCryptoAppOAuthConnections({
    connections,
    store,
    env: options.env ?? config(),
    tokenClient,
    now: () => now,
    flowId: () => "cxo_flow_1",
    tokenId: () => "cxt_token_1",
  });
  return {
    connections,
    dbPath,
    oauth,
    setNow(value: string) { now = new Date(value); },
    store,
  };
}

function grant() {
  return {
    workspaceId: "ws_a",
    accountId: "account_a",
    appId: "certified.exchange",
    grantedActionIds: ["read_markets"],
    grantedScopes: ["markets:read"],
    grantedNetworks: ["eip155:84532"],
  };
}

function callback(authorizationUrl: string): { state: string; issuer: string; code: string } {
  const url = new URL(authorizationUrl);
  return {
    state: url.searchParams.get("state") ?? "",
    issuer: "https://auth.exchange.example/",
    code: "one-time-authorization-code",
  };
}

function storedBytes(path: string): string {
  return [path, `${path}-wal`, `${path}-shm`]
    .filter(existsSync)
    .map((file) => readFileSync(file).toString("latin1"))
    .join("\n");
}

describe("certified crypto app OAuth connections", () => {
  test("uses exact PKCE, issuer, audience and resource binding without persisting secrets in plaintext", async () => {
    const exchanges: Array<Parameters<MatterhornCryptoAppOAuthTokenClient["exchange"]>[0]> = [];
    const setup = fixture({
      tokenClient: {
        exchange: async (input) => {
          exchanges.push(input);
          return {
            access_token: TOKEN,
            refresh_token: REFRESH_TOKEN,
            token_type: "Bearer",
            expires_in: 3_600,
            scope: "markets:read",
            resource: input.resource,
            audience: input.audience,
          };
        },
        refresh: async () => { throw new Error("unexpected_refresh"); },
      },
    });
    const authorization = setup.oauth.issue(grant());
    const url = new URL(authorization.authorizationUrl);
    expect(url.origin).toBe("https://auth.exchange.example");
    expect(url.pathname).toBe("/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("matterhorn-public-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://matterhorn.example/oauth/crypto-apps/callback");
    expect(url.searchParams.get("scope")).toBe("markets:read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("resource")).toBe("https://api.exchange.example/");
    expect(url.searchParams.get("audience")).toBe("matterhorn-certified-app");

    const callbackInput = callback(authorization.authorizationUrl);
    const connection = await setup.oauth.complete(callbackInput);
    expect(connection).toMatchObject({
      id: "cxc_oauth_1",
      workspaceId: "ws_a",
      credential: { type: "oauth2", connected: true },
    });
    expect(JSON.stringify(connection)).not.toContain(TOKEN);
    const exchange = exchanges[0];
    if (!exchange) throw new Error("OAuth exchange was not captured.");
    expect(exchange.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(exchange.code).toBe("one-time-authorization-code");
    expect(exchange.clientSecret).toBeNull();

    const internal = setup.connections.resolveActive("ws_a", connection.id);
    expect(internal?.credential.type).toBe("oauth2");
    if (internal?.credential.type !== "oauth2") throw new Error("oauth_credential_expected");
    expect(await setup.oauth.resolveHeaders({
      workspaceId: "ws_a",
      connectionId: connection.id,
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      secretReference: internal.credential.secretReference,
    })).toEqual({ authorization: `Bearer ${TOKEN}` });
    expect(setup.oauth.status({ workspaceId: "ws_a", accountId: "account_a", flowId: authorization.flowId }))
      .toMatchObject({ status: "connected", connectionId: connection.id });
    expect(() => setup.oauth.status({ workspaceId: "ws_b", accountId: "account_b", flowId: authorization.flowId }))
      .toThrowError(expect.objectContaining({ code: "oauth_flow_invalid" }));
    expect(storedBytes(setup.dbPath)).not.toContain(TOKEN);
    expect(storedBytes(setup.dbPath)).not.toContain(REFRESH_TOKEN);
    expect(storedBytes(setup.dbPath)).not.toContain(callbackInput.state);
    expect(storedBytes(setup.dbPath)).not.toContain(exchange.codeVerifier);
    expect(storedBytes(setup.dbPath)).not.toContain(callbackInput.code);
    await expect(setup.oauth.complete(callbackInput))
      .rejects.toMatchObject({ code: "oauth_flow_invalid" });
    setup.store.close();
  });

  test("fails closed on issuer mix-up, expiry, and denied authorization", async () => {
    const mixed = fixture();
    const mixedAuthorization = mixed.oauth.issue(grant());
    await expect(mixed.oauth.complete({
      ...callback(mixedAuthorization.authorizationUrl),
      issuer: "https://attacker.example/",
    })).rejects.toMatchObject({ code: "oauth_callback_invalid" });
    expect(mixed.oauth.status({ workspaceId: "ws_a", accountId: "account_a", flowId: mixedAuthorization.flowId }))
      .toMatchObject({ status: "failed", error: "connection_failed" });
    mixed.store.close();

    const expired = fixture();
    const expiredAuthorization = expired.oauth.issue(grant());
    expired.setNow("2026-09-01T12:11:00.000Z");
    expect(expired.oauth.status({ workspaceId: "ws_a", accountId: "account_a", flowId: expiredAuthorization.flowId }).status)
      .toBe("expired");
    await expect(expired.oauth.complete(callback(expiredAuthorization.authorizationUrl)))
      .rejects.toMatchObject({ code: "oauth_flow_expired" });
    expired.store.close();

    const denied = fixture();
    const deniedAuthorization = denied.oauth.issue(grant());
    const deniedCallback = callback(deniedAuthorization.authorizationUrl);
    denied.oauth.deny(deniedCallback.state, deniedCallback.issuer);
    expect(denied.oauth.status({ workspaceId: "ws_a", accountId: "account_a", flowId: deniedAuthorization.flowId }))
      .toMatchObject({ status: "failed", error: "authorization_denied" });
    denied.store.close();
  });

  test("rejects token scope, resource, and audience substitution", async () => {
    for (const token of [
      { scope: "markets:write", resource: "https://api.exchange.example/", audience: "matterhorn-certified-app" },
      { scope: "markets:read", resource: "https://attacker.example/", audience: "matterhorn-certified-app" },
      { scope: "markets:read", resource: "https://api.exchange.example/", audience: "attacker" },
    ]) {
      const setup = fixture({
        tokenClient: {
          exchange: async () => ({
            access_token: TOKEN,
            refresh_token: REFRESH_TOKEN,
            token_type: "Bearer",
            expires_in: 3_600,
            ...token,
          }),
          refresh: async () => { throw new Error("unexpected_refresh"); },
        },
      });
      const authorization = setup.oauth.issue(grant());
      await expect(setup.oauth.complete(callback(authorization.authorizationUrl)))
        .rejects.toMatchObject({ code: "oauth_token_response_invalid" });
      expect(setup.connections.list("ws_a")).toEqual([]);
      setup.store.close();
    }
  });

  test("refreshes server-side, enforces tenant binding, and erases tokens on revoke", async () => {
    let refreshCount = 0;
    const setup = fixture({
      tokenClient: {
        exchange: async () => ({
          access_token: TOKEN,
          refresh_token: REFRESH_TOKEN,
          token_type: "Bearer",
          expires_in: 90,
          scope: "markets:read",
        }),
        refresh: async ({ refreshToken }) => {
          refreshCount += 1;
          expect(refreshToken).toBe(REFRESH_TOKEN);
          return {
            access_token: "refreshed-access-token",
            token_type: "Bearer",
            expires_in: 3_600,
            scope: "markets:read",
          };
        },
      },
    });
    const authorization = setup.oauth.issue(grant());
    const connection = await setup.oauth.complete(callback(authorization.authorizationUrl));
    const internal = setup.connections.resolveActive("ws_a", connection.id);
    if (internal?.credential.type !== "oauth2") throw new Error("oauth_credential_expected");
    setup.setNow("2026-09-01T12:00:40.000Z");
    const exact = {
      workspaceId: "ws_a",
      connectionId: connection.id,
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      secretReference: internal.credential.secretReference,
    };
    const [firstHeaders, secondHeaders] = await Promise.all([
      setup.oauth.resolveHeaders(exact),
      setup.oauth.resolveHeaders(exact),
    ]);
    expect(firstHeaders).toEqual({ authorization: "Bearer refreshed-access-token" });
    expect(secondHeaders).toEqual(firstHeaders);
    expect(refreshCount).toBe(1);
    await expect(setup.oauth.resolveHeaders({ ...exact, workspaceId: "ws_b" }))
      .rejects.toMatchObject({ code: "oauth_token_unavailable" });
    await expect(setup.oauth.resolveHeaders({ ...exact, connectionId: "cxc_other" }))
      .rejects.toMatchObject({ code: "oauth_token_unavailable" });
    setup.connections.transition("ws_a", connection.id, "revoked");
    await expect(setup.oauth.resolveHeaders(exact))
      .rejects.toMatchObject({ code: "oauth_token_unavailable" });
    setup.store.close();
  });

  test("fails closed when a configured confidential-client secret is missing or removed", async () => {
    const missing = fixture({ env: config("CONFIDENTIAL") });
    expect(() => missing.oauth.issue(grant()))
      .toThrowError(expect.objectContaining({ code: "oauth_connection_binding_unavailable" }));
    missing.store.close();

    let exchangeCount = 0;
    const env = config("CONFIDENTIAL");
    env.MATTERHORN_CRYPTO_APP_SECRET_CONFIDENTIAL = "server-only-client-secret";
    const removed = fixture({
      env,
      tokenClient: {
        exchange: async () => {
          exchangeCount += 1;
          throw new Error("must_not_exchange");
        },
        refresh: async () => { throw new Error("must_not_refresh"); },
      },
    });
    const authorization = removed.oauth.issue(grant());
    delete env.MATTERHORN_CRYPTO_APP_SECRET_CONFIDENTIAL;
    await expect(removed.oauth.complete(callback(authorization.authorizationUrl)))
      .rejects.toMatchObject({ code: "oauth_token_exchange_failed" });
    expect(exchangeCount).toBe(0);
    expect(removed.oauth.status({ workspaceId: "ws_a", accountId: "account_a", flowId: authorization.flowId }))
      .toMatchObject({ status: "failed", error: "connection_failed" });
    removed.store.close();
  });

  test("restores encrypted OAuth connections after a server restart", async () => {
    const first = fixture();
    const authorization = first.oauth.issue(grant());
    const connection = await first.oauth.complete(callback(authorization.authorizationUrl));
    const internal = first.connections.resolveActive("ws_a", connection.id);
    if (internal?.credential.type !== "oauth2") throw new Error("oauth_credential_expected");
    const secretReference = internal.credential.secretReference;
    first.store.close();

    const second = fixture({ dbPath: first.dbPath });
    expect(second.connections.list("ws_a")).toHaveLength(1);
    expect(await second.oauth.resolveHeaders({
      workspaceId: "ws_a",
      connectionId: connection.id,
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      secretReference,
    })).toEqual({ authorization: `Bearer ${TOKEN}` });
    second.store.close();
  });
});
