import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_crypto_catalog_test_token";
const HOST_TOKEN = "owt_crypto_catalog_test_host_token";
const ENV_KEYS = [
  "MATTERHORN_CRYPTO_APP_GATEWAY_MODE",
  "MATTERHORN_CRYPTO_APP_POLICY_VERSION",
  "MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON",
  "MATTERHORN_CRYPTO_APP_REGISTRY_DB",
  "MATTERHORN_CRYPTO_APP_CONNECTION_DB",
  "MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET",
  "MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET",
  "MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON",
  "MATTERHORN_CRYPTO_APP_SECRET_HYPERLIQUID_TEST",
  "MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET",
  "MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON",
  "MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY",
  "MATTERHORN_COWORKER_MODE",
  "MATTERHORN_COWORKER_POLICY_VERSION",
  "MATTERHORN_COWORKER_DB",
  "MATTERHORN_WORK_DATA_DIR",
] as const;
const priorEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

function config(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_catalog",
      name: "Crypto app catalog acceptance workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
  } as ServerConfig;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(root: string): Promise<{ base: string; stop: () => Promise<void> }> {
  process.env.MATTERHORN_WORK_DATA_DIR = join(root, "data");
  const server = await startServer(config(await freePort(), root)) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return { base: `http://127.0.0.1:${server.port}`, stop };
}

async function request(
  base: string,
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    authenticated?: boolean;
    hostToken?: boolean;
  } = {},
) {
  const headers = new Headers();
  if (options.hostToken) headers.set("x-matterhorn-host-token", HOST_TOKEN);
  else if (options.authenticated !== false) headers.set("Authorization", `Bearer ${TOKEN}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json().catch(() => null) as any };
}

function configureCatalog(root: string) {
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const registryPath = join(root, "registry.db");
  process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = "shadow";
  process.env.MATTERHORN_CRYPTO_APP_POLICY_VERSION = "policy-1";
  process.env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = JSON.stringify([{
    publisherId: "matterhorn",
    keyId: "publisher-1",
    algorithm: "ed25519",
    publicKeyPem,
  }]);
  process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB = registryPath;
  process.env.MATTERHORN_CRYPTO_APP_CONNECTION_DB = join(root, "connections.db");
  process.env.MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET =
    "catalog-route-connection-integrity-secret-at-least-32-bytes";
  process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET =
    "catalog-route-operational-integrity-secret-at-least-32-bytes";
  process.env.MATTERHORN_COWORKER_MODE = "internal";
  process.env.MATTERHORN_COWORKER_POLICY_VERSION = "coworker-policy-1";
  process.env.MATTERHORN_COWORKER_DB = join(root, "coworkers.db");
  const manifests = buildMatterhornFirstPartyTestnetManifests({
    publisherId: "matterhorn",
    publisherKeyId: "publisher-1",
    sign: (payload) => sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
    suiTestnetEndpoint: "https://sui-certification.internal.example/v1",
    hyperliquidTestnetEndpoint: "https://hyperliquid-certification.internal.example/v1",
    privacyPolicyUrl: "https://matterhorn.so/privacy",
    statusUrl: "https://status.matterhorn.so",
    securityContact: "private-security@matterhorn.so",
  });
  const authenticatedManifest = manifests.find((manifest) => manifest.appId === "matterhorn.hyperliquid-testnet");
  if (!authenticatedManifest) throw new Error("Hyperliquid test manifest is required.");
  authenticatedManifest.authentication = { type: "api_key_vault", scopes: [] };
  for (const action of authenticatedManifest.actions) delete action.cachePolicy;
  authenticatedManifest.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(authenticatedManifest)),
    keys.privateKey,
  ).toString("base64url");
  process.env.MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON = JSON.stringify([{
    id: "HYPERLIQUID_TEST",
    appId: authenticatedManifest.appId,
    manifestRevision: authenticatedManifest.manifestRevision,
    header: "x-api-key",
    scheme: "raw",
  }]);
  process.env.MATTERHORN_CRYPTO_APP_SECRET_HYPERLIQUID_TEST = "server-managed-test-secret";
  const walletManifest = manifests.find((manifest) => manifest.appId === "matterhorn.sui-testnet");
  if (!walletManifest) throw new Error("Sui test manifest is required.");
  walletManifest.authentication = { type: "wallet_connection", scopes: [] };
  walletManifest.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(walletManifest)),
    keys.privateKey,
  ).toString("base64url");
  process.env.MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET = "wallet-proof-route-secret-with-at-least-32-characters";
  const oauthManifest = structuredClone(authenticatedManifest);
  oauthManifest.appId = "matterhorn.oauth-testnet";
  oauthManifest.displayName = "OAuth Testnet";
  oauthManifest.authentication = {
    type: "oauth2",
    authorizationServer: "https://auth.oauth-testnet.example/",
    resource: "https://api.oauth-testnet.example/",
    audience: "matterhorn-testnet",
    scopes: [],
  };
  oauthManifest.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(oauthManifest)),
    keys.privateKey,
  ).toString("base64url");
  manifests.push(oauthManifest);
  process.env.MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY = "route-oauth-encryption-secret-with-at-least-32-characters";
  process.env.MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON = JSON.stringify([{
    id: "ROUTE_OAUTH",
    appId: oauthManifest.appId,
    manifestRevision: oauthManifest.manifestRevision,
    clientId: "matterhorn-route-client",
    redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
    authorizationEndpoint: "https://auth.oauth-testnet.example/authorize",
    tokenEndpoint: "https://auth.oauth-testnet.example/token",
  }]);
  return { manifests };
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) rmSync(roots.pop()!, { force: true, recursive: true });
  for (const key of ENV_KEYS) {
    const value = priorEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("crypto app catalog HTTP boundary", () => {
  test("is authenticated, fail-closed, redacted and workspace scoped", async () => {
    const offRoot = mkdtempSync(join(tmpdir(), "matterhorn-crypto-catalog-off-"));
    roots.push(offRoot);
    process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = "off";
    const off = await boot(offRoot);
    expect((await request(off.base, "/crypto-apps", { authenticated: false })).response.status).toBe(401);
    const disabled = await request(off.base, "/crypto-apps");
    expect(disabled.response.status).toBe(503);
    expect(disabled.payload.code).toBe("crypto_app_gateway_disabled");
    await off.stop();

    const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-catalog-routes-"));
    roots.push(root);
    const { manifests } = configureCatalog(root);
    const server = await boot(root);
    const suiManifest = manifests.find((manifest) => manifest.appId === "matterhorn.sui-testnet")!;
    const clientPromotion = await request(server.base, "/operator/crypto-apps/manifests", {
      body: { manifest: suiManifest, targetEnvironment: "testnet" },
    });
    expect(clientPromotion.response.status).toBe(401);
    for (const [index, manifest] of manifests.entries()) {
      const registered = await request(server.base, "/operator/crypto-apps/manifests", {
        body: { manifest, targetEnvironment: "testnet" },
        hostToken: true,
      });
      expect(registered.response.status).toBe(201);
      expect(registered.payload.entry.certification.state).toBe("pending");
      expect(registered.payload.staticReport.passed).toBe(true);
      const runtimeReport = passingCryptoAppRuntimeReportForTest(manifest, registered.payload.staticReport);
      if (index === 0) {
        const tamperedPromotion = await request(
          server.base,
          `/operator/crypto-apps/${manifest.appId}/${manifest.manifestRevision}/certification`,
          {
            body: {
              state: "certified_testnet",
              report: registered.payload.staticReport,
              runtimeReport: { ...runtimeReport, reportHash: "0".repeat(64) },
            },
            hostToken: true,
          },
        );
        expect(tamperedPromotion.response.status).toBe(400);
        expect(tamperedPromotion.payload.code).toBe("certification_metadata_invalid");
      }
      const promoted = await request(
        server.base,
        `/operator/crypto-apps/${manifest.appId}/${manifest.manifestRevision}/certification`,
        {
          body: {
            state: "certified_testnet",
            report: registered.payload.staticReport,
            runtimeReport,
          },
          hostToken: true,
        },
      );
      expect(promoted.response.status).toBe(200);
      expect(promoted.payload.entry.certification.state).toBe("certified_testnet");
    }
    const listed = await request(server.base, "/crypto-apps?environment=testnet");
    expect(listed.response.status).toBe(200);
    expect(listed.response.headers.get("cache-control")).toBe("no-store");
    expect(listed.payload.apps).toHaveLength(3);
    const serialized = JSON.stringify(listed.payload);
    expect(serialized).not.toContain("certification.internal.example");
    expect(serialized).not.toContain("publisher-1");
    expect(serialized).not.toContain("private-security@matterhorn.so");

    const invalidFilter = await request(server.base, "/crypto-apps?access=submit");
    expect(invalidFilter.response.status).toBe(400);
    expect(invalidFilter.payload.code).toBe("crypto_app_catalog_query_invalid");

    const sui = listed.payload.apps.find((app: any) => app.appId === "matterhorn.sui-testnet");
    const injectedCredential = await request(server.base, "/workspace/ws_catalog/crypto-app-connections", {
      body: {
        appId: sui.appId,
        grantedActionIds: sui.actions.map((action: any) => action.id),
        grantedScopes: [],
        grantedNetworks: ["sui:testnet"],
        secretReference: "vault://browser/forbidden",
      },
    });
    expect(injectedCredential.response.status).toBe(400);
    expect(JSON.stringify(injectedCredential.payload)).not.toContain("vault://browser/forbidden");

    const hyperliquid = listed.payload.apps.find((app: { appId: string }) => (
      app.appId === "matterhorn.hyperliquid-testnet"
    ));
    if (!hyperliquid) throw new Error("Expected authenticated test app.");
    const managedConnection = await request(server.base, "/workspace/ws_catalog/crypto-app-connections", {
      body: {
        appId: hyperliquid.appId,
        grantedActionIds: hyperliquid.actions.map((action: { id: string }) => action.id),
        grantedScopes: [],
        grantedNetworks: ["hyperliquid:testnet"],
      },
    });
    expect(managedConnection.response.status).toBe(201);
    expect(managedConnection.payload.connection).toMatchObject({
      workspaceId: "ws_catalog",
      appId: "matterhorn.hyperliquid-testnet",
      state: "active",
      credential: { type: "api_key_vault", connected: true },
    });
    expect(JSON.stringify(managedConnection.payload)).not.toContain("HYPERLIQUID_TEST");
    expect(JSON.stringify(managedConnection.payload)).not.toContain("server-managed-test-secret");
    expect(JSON.stringify(managedConnection.payload)).not.toContain("vault://");
    delete process.env.MATTERHORN_CRYPTO_APP_SECRET_HYPERLIQUID_TEST;
    const unavailableManagedConnection = await request(
      server.base,
      "/workspace/ws_catalog/crypto-app-connections",
      {
        body: {
          appId: hyperliquid.appId,
          grantedActionIds: hyperliquid.actions.map((action: { id: string }) => action.id),
          grantedScopes: [],
          grantedNetworks: ["hyperliquid:testnet"],
        },
      },
    );
    expect(unavailableManagedConnection.response.status).toBe(503);
    expect(unavailableManagedConnection.payload.code).toBe("crypto_app_managed_credential_unavailable");
    expect(JSON.stringify(unavailableManagedConnection.payload)).not.toContain("HYPERLIQUID_TEST");
    process.env.MATTERHORN_CRYPTO_APP_SECRET_HYPERLIQUID_TEST = "server-managed-test-secret";

    const oauthApp = listed.payload.apps.find((app: { appId: string }) => (
      app.appId === "matterhorn.oauth-testnet"
    ));
    if (!oauthApp) throw new Error("Expected OAuth test app.");
    const directOAuthConnection = await request(server.base, "/workspace/ws_catalog/crypto-app-connections", {
      body: {
        appId: oauthApp.appId,
        grantedActionIds: oauthApp.actions.map((action: { id: string }) => action.id),
        grantedScopes: [],
        grantedNetworks: ["hyperliquid:testnet"],
      },
    });
    expect(directOAuthConnection.response.status).toBe(409);
    expect(directOAuthConnection.payload.code).toBe("crypto_app_connection_flow_required");
    const oauthAuthorization = await request(
      server.base,
      "/workspace/ws_catalog/crypto-app-connections/oauth/authorize",
      {
        body: {
          appId: oauthApp.appId,
          grantedActionIds: oauthApp.actions.map((action: { id: string }) => action.id),
          grantedScopes: [],
          grantedNetworks: ["hyperliquid:testnet"],
        },
      },
    );
    expect(oauthAuthorization.response.status).toBe(201);
    expect(oauthAuthorization.response.headers.get("cache-control")).toBe("no-store");
    const oauthUrl = new URL(oauthAuthorization.payload.authorization.authorizationUrl);
    expect(oauthUrl.origin).toBe("https://auth.oauth-testnet.example");
    expect(oauthUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(oauthUrl.searchParams.get("resource")).toBe("https://api.oauth-testnet.example/");
    expect(oauthUrl.searchParams.get("audience")).toBe("matterhorn-testnet");
    expect(JSON.stringify(oauthAuthorization.payload)).not.toContain("route-oauth-encryption-secret");
    const oauthFlowId = oauthAuthorization.payload.authorization.flowId as string;
    const pendingOAuth = await request(
      server.base,
      `/workspace/ws_catalog/crypto-app-connections/oauth/${oauthFlowId}`,
    );
    expect(pendingOAuth.payload.status).toMatchObject({ status: "pending", connectionId: null });
    const state = oauthUrl.searchParams.get("state");
    if (!state) throw new Error("OAuth state missing.");
    const deniedOAuth = await fetch(
      `${server.base}/oauth/crypto-apps/callback?${new URLSearchParams({
        state,
        iss: "https://auth.oauth-testnet.example/",
        error: "access_denied",
        error_description: "sensitive provider detail must not be reflected",
      })}`,
    );
    expect(deniedOAuth.status).toBe(400);
    expect(deniedOAuth.headers.get("cache-control")).toBe("no-store");
    expect(deniedOAuth.headers.get("content-security-policy")).toContain("default-src 'none'");
    const deniedHtml = await deniedOAuth.text();
    expect(deniedHtml).toContain("App not connected");
    expect(deniedHtml).not.toContain("sensitive provider detail");
    expect((await request(
      server.base,
      `/workspace/ws_catalog/crypto-app-connections/oauth/${oauthFlowId}`,
    )).payload.status).toMatchObject({ status: "failed", error: "authorization_denied" });
    expect((await fetch(
      `${server.base}/oauth/crypto-apps/callback?${new URLSearchParams({
        state,
        iss: "https://auth.oauth-testnet.example/",
        error: "access_denied",
      })}`,
    )).status).toBe(400);

    const directWalletConnection = await request(server.base, "/workspace/ws_catalog/crypto-app-connections", {
      body: {
        appId: sui.appId,
        grantedActionIds: sui.actions.map((action: any) => action.id),
        grantedScopes: [],
        grantedNetworks: ["sui:testnet"],
      },
    });
    expect(directWalletConnection.response.status).toBe(409);
    expect(directWalletConnection.payload.code).toBe("crypto_app_connection_flow_required");

    const suiWallet = Ed25519Keypair.generate();
    const suiAddress = suiWallet.getPublicKey().toSuiAddress();
    const challengeResponse = await request(
      server.base,
      "/workspace/ws_catalog/crypto-app-connections/wallet/challenges",
      {
        body: {
          appId: sui.appId,
          grantedActionIds: sui.actions.map((action: any) => action.id),
          grantedScopes: [],
          grantedNetworks: ["sui:testnet"],
          walletFamily: "sui",
          walletAddress: suiAddress,
        },
      },
    );
    expect(challengeResponse.response.status).toBe(201);
    expect(challengeResponse.payload.challenge).toMatchObject({
      walletFamily: "sui",
      notice: "proves_wallet_control_only",
    });
    expect(challengeResponse.payload.challenge.message).toContain("does not authorize spending");
    const signedChallenge = await suiWallet.signPersonalMessage(
      new TextEncoder().encode(challengeResponse.payload.challenge.message),
    );
    const created = await request(
      server.base,
      `/workspace/ws_catalog/crypto-app-connections/wallet/challenges/${challengeResponse.payload.challenge.challengeId}/confirm`,
      {
        body: {
          walletAddress: suiAddress,
          signature: signedChallenge.signature,
        },
      },
    );
    expect(created.response.status).toBe(201);
    expect(created.payload.connection).toMatchObject({
      workspaceId: "ws_catalog",
      appId: "matterhorn.sui-testnet",
      state: "active",
      credential: { type: "wallet_connection", connected: true },
    });
    expect(JSON.stringify(created.payload)).not.toContain("createdBy");
    expect(JSON.stringify(created.payload)).not.toContain(suiAddress);
    expect(JSON.stringify(created.payload)).not.toContain(signedChallenge.signature);
    const replay = await request(
      server.base,
      `/workspace/ws_catalog/crypto-app-connections/wallet/challenges/${challengeResponse.payload.challenge.challengeId}/confirm`,
      { body: { walletAddress: suiAddress, signature: signedChallenge.signature } },
    );
    expect(replay.response.status).toBe(409);
    expect(replay.payload.code).toBe("wallet_challenge_invalid");

    const connectionId = created.payload.connection.id as string;
    const createdCoworker = await request(server.base, "/workspace/ws_catalog/coworkers/from-template", {
      body: { templateId: "risk_monitor", name: "Sui connection monitor" },
    });
    expect(createdCoworker.response.status).toBe(201);
    const coworkerId = createdCoworker.payload.coworker.id as string;
    const resources = await request(server.base, `/workspace/ws_catalog/coworkers/${coworkerId}/resources`, {
      method: "PUT",
      body: {
        expectedRevision: 0,
        profileRevision: 1,
        agentFileIds: [],
        memoryIds: [],
        connectionIds: [connectionId],
      },
    });
    expect(resources.response.status).toBe(200);
    const createdWatch = await request(server.base, `/workspace/ws_catalog/coworkers/${coworkerId}/watches`, {
      body: {
        profileRevision: 1,
        connectionId,
        name: "Sui balance change",
        appId: "matterhorn.sui-testnet",
        actionId: "sui_account_read",
        network: "sui:testnet",
        parameters: { address: suiAddress },
        schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
        budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
        conditions: [{ id: "balance_changed", metric: "totalBalance", operator: "changed", value: null }],
      },
    });
    expect(createdWatch.response.status).toBe(201);
    const otherWorkspace = await request(server.base, "/workspace/ws_other/crypto-app-connections");
    expect(otherWorkspace.response.status).toBe(404);
    const paused = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "PATCH",
      body: { state: "paused" },
    });
    expect(paused.payload.connection.state).toBe("paused");
    const watchesAfterDisconnect = await request(
      server.base,
      `/workspace/ws_catalog/coworkers/${coworkerId}/watches`,
    );
    expect(watchesAfterDisconnect.payload.watches).toEqual([
      expect.objectContaining({
        id: createdWatch.payload.watch.id,
        revision: 2,
        state: "paused",
        pauseReason: "app_disconnected",
      }),
    ]);
    const pausedAgain = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "PATCH",
      body: { state: "paused" },
    });
    expect(pausedAgain.response.status).toBe(200);
    expect(pausedAgain.payload.connection.state).toBe("paused");
    const revoked = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "DELETE",
    });
    expect(revoked.payload.connection.state).toBe("revoked");
    const revokedAgain = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "DELETE",
    });
    expect(revokedAgain.response.status).toBe(200);
    expect(revokedAgain.payload.connection.state).toBe("revoked");

    const suspended = await request(
      server.base,
      `/operator/crypto-apps/${suiManifest.appId}/${suiManifest.manifestRevision}/certification`,
      {
        body: { state: "suspended", reason: "operator runtime health circuit opened" },
        hostToken: true,
      },
    );
    expect(suspended.response.status).toBe(200);
    const afterSuspension = await request(server.base, "/crypto-apps");
    expect(afterSuspension.payload.apps.map((app: any) => app.appId))
      .toEqual(["matterhorn.hyperliquid-testnet", "matterhorn.oauth-testnet"]);
    const connectionsAfterSuspension = await request(
      server.base,
      "/workspace/ws_catalog/crypto-app-connections",
    );
    const suspendedConnection = connectionsAfterSuspension.payload.connections.find((connection: { appId: string }) => (
      connection.appId === suiManifest.appId
    ));
    expect(suspendedConnection?.availability)
      .toBe("certification_unavailable");

    await server.stop();
    const restarted = await boot(root);
    const connectionsAfterRestart = await request(
      restarted.base,
      "/workspace/ws_catalog/crypto-app-connections",
    );
    const restoredManagedConnection = connectionsAfterRestart.payload.connections.find((connection: { appId: string }) => (
      connection.appId === "matterhorn.hyperliquid-testnet"
    ));
    expect(restoredManagedConnection).toMatchObject({
      id: managedConnection.payload.connection.id,
      credential: { type: "api_key_vault", connected: true },
      state: "active",
    });
    expect(JSON.stringify(connectionsAfterRestart.payload)).not.toContain("server-managed-test-secret");
    expect(JSON.stringify(connectionsAfterRestart.payload)).not.toContain("vault://");
  });
});
