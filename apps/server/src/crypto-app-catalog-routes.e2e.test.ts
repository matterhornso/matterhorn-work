import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppRegistryStore } from "./crypto-app-registry-store.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";
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
  options: { method?: string; body?: Record<string, unknown>; authenticated?: boolean } = {},
) {
  const headers = new Headers();
  if (options.authenticated !== false) headers.set("Authorization", `Bearer ${TOKEN}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json().catch(() => null) as any };
}

function seedCertifiedCatalog(root: string): void {
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
  const store = new MatterhornCryptoAppRegistryStore(registryPath);
  const registry = new MatterhornCryptoAppRegistry({
    publisherKeys: [{
      publisherId: "matterhorn",
      keyId: "publisher-1",
      algorithm: "ed25519",
      publicKey: keys.publicKey,
    }],
    policyVersion: "policy-1",
    store,
  });
  for (const manifest of manifests) {
    registry.register(manifest);
    const report = runCryptoAppManifestConformance(manifest, {
      publisherKey: keys.publicKey,
      policyVersion: "policy-1",
      targetEnvironment: "testnet",
    });
    registry.updateCertification({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "certified_testnet",
      report,
      runtimeReport: passingCryptoAppRuntimeReportForTest(manifest, report),
    });
  }
  store.close();
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
    seedCertifiedCatalog(root);
    const server = await boot(root);
    const listed = await request(server.base, "/crypto-apps?environment=testnet");
    expect(listed.response.status).toBe(200);
    expect(listed.response.headers.get("cache-control")).toBe("no-store");
    expect(listed.payload.apps).toHaveLength(2);
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

    const created = await request(server.base, "/workspace/ws_catalog/crypto-app-connections", {
      body: {
        appId: sui.appId,
        grantedActionIds: sui.actions.map((action: any) => action.id),
        grantedScopes: [],
        grantedNetworks: ["sui:testnet"],
      },
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.connection).toMatchObject({
      workspaceId: "ws_catalog",
      appId: "matterhorn.sui-testnet",
      state: "active",
      credential: { type: "none", connected: true },
    });
    expect(JSON.stringify(created.payload)).not.toContain("createdBy");

    const connectionId = created.payload.connection.id as string;
    const otherWorkspace = await request(server.base, "/workspace/ws_other/crypto-app-connections");
    expect(otherWorkspace.response.status).toBe(404);
    const paused = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "PATCH",
      body: { state: "paused" },
    });
    expect(paused.payload.connection.state).toBe("paused");
    const revoked = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "DELETE",
    });
    expect(revoked.payload.connection.state).toBe("revoked");
    const revokedAgain = await request(server.base, `/workspace/ws_catalog/crypto-app-connections/${connectionId}`, {
      method: "DELETE",
    });
    expect(revokedAgain.response.status).toBe(200);
    expect(revokedAgain.payload.connection.state).toBe("revoked");
  });
});
