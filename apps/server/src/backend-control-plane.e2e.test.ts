import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { buildMatterhornBillingSubscription } from "./billing.js";
import { startServer } from "./server.js";
import { buildReviewedActionHandoffV2 } from "./reviewed-action-airlock.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_backend_control_plane_token";
const HOST_TOKEN = "owt_backend_control_plane_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  memoryScope: process.env.MATTERHORN_WORK_MEMORY_SCOPE,
  opencodeDb: process.env.OPENCODE_DB,
  imageProvider: process.env.MATTERHORN_IMAGE_PROVIDER,
  openAiApiKey: process.env.OPENAI_API_KEY,
  imageSize: process.env.MATTERHORN_IMAGE_SIZE,
  walrusPublisherUrl: process.env.MATTERHORN_WALRUS_PUBLISHER_URL,
  walrusPublisherBearerToken: process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN,
  walrusRelayUrl: process.env.MATTERHORN_WALRUS_RELAY_URL,
  walrusStorageEpochs: process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS,
  suiNetwork: process.env.MATTERHORN_SUI_NETWORK,
  suiNftPackageId: process.env.MATTERHORN_SUI_NFT_PACKAGE_ID,
  suiNftModuleName: process.env.MATTERHORN_SUI_NFT_MODULE_NAME,
  suiNftType: process.env.MATTERHORN_SUI_NFT_TYPE,
  suiKioskPackageId: process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID,
  suiKioskId: process.env.MATTERHORN_SUI_KIOSK_ID,
  suiKioskOwnerCapId: process.env.MATTERHORN_SUI_KIOSK_OWNER_CAP_ID,
  suiTransferPolicyId: process.env.MATTERHORN_SUI_TRANSFER_POLICY_ID,
  suiTransferPolicyPackageId: process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID,
  billingMode: process.env.MATTERHORN_BILLING_MODE,
  billingProvider: process.env.MATTERHORN_BILLING_PROVIDER,
  billingCurrentPlan: process.env.MATTERHORN_BILLING_CURRENT_PLAN,
  stripeSecretKey: process.env.MATTERHORN_STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET,
  stripePriceIdPlus: process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS,
  stripePriceIdMax: process.env.MATTERHORN_STRIPE_PRICE_ID_MAX,
  stripeTestCustomerId: process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv(key: keyof typeof priorEnv, envName: string) {
  const value = priorEnv[key];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

function baseConfig(port: number, root: string, readOnly = false, opencodeBaseUrl?: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_backend",
      name: "Backend control plane test workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
      ...(opencodeBaseUrl ? { baseUrl: opencodeBaseUrl } : {}),
    }],
    authorizedRoots: [root],
    readOnly,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function startProviderCatalogServer(payload: unknown): Promise<string> {
  const server = createHttpServer((request, response) => {
    if (request.url?.startsWith("/global/health")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version: "test" }));
      return;
    }
    if (!request.url?.startsWith("/provider")) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
  stops.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}

async function startSessionPurgeServer() {
  const deleted: string[] = [];
  const server = createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/global/health") {
      response.end(JSON.stringify({ healthy: true, version: "test" }));
      return;
    }
    if (url.pathname === "/session" && request.method === "GET") {
      response.end(JSON.stringify([
        { id: "ses_purge_1", title: "Private chat", slug: "private-chat", time: { created: 1, updated: 2 } },
      ]));
      return;
    }
    if (url.pathname === "/session/ses_purge_1" && request.method === "DELETE") {
      deleted.push("ses_purge_1");
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "not_found" }));
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
  stops.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { url: `http://127.0.0.1:${port}`, deleted };
}

async function startWalrusDiagnosticServer() {
  const calls: Array<{
    method: string;
    url: string;
    byteLength: number;
    authorization: string | null;
  }> = [];
  const server = createHttpServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const byteLength = Buffer.concat(chunks).byteLength;
      calls.push({
        method: request.method ?? "GET",
        url: request.url ?? "/",
        byteLength,
        authorization: request.headers.authorization ?? null,
      });
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "HEAD") {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
  stops.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { url: `http://127.0.0.1:${port}`, calls };
}

async function boot(options: { readOnly?: boolean; opencodeBaseUrl?: string; workspaceMemoryScope?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-backend-control-plane-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  if (options.workspaceMemoryScope) process.env.MATTERHORN_WORK_MEMORY_SCOPE = options.workspaceMemoryScope;
  else delete process.env.MATTERHORN_WORK_MEMORY_SCOPE;
  process.env.OPENCODE_DB = join(dir, "opencode.db");
  const server = await startServer(baseConfig(await getFreePort(), dir, options.readOnly ?? false, options.opencodeBaseUrl)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(
  base: string,
  path: string,
  init: RequestInit = {},
  token = TOKEN,
): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function hostFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Matterhorn-Host-Token": HOST_TOKEN,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function record(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-06T00:00:00.000Z").toISOString();
  return {
    id: "mem_backend_control_plane_tao_wallet",
    kind: "protocol_address",
    scope: "workspace",
    title: "Backend control plane TAO wallet",
    summary: "Public SS58 address label for backend control plane tests.",
    body: {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1backend",
      netuid: 14,
    },
    tags: ["bittensor", "tao", "wallet"],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.95,
      reasonRemembered: "The user confirmed this public address can be reused for TAO read workflows.",
    },
    sensitivity: "public",
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: true,
    canDelete: true,
    ...overrides,
  };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv("envStore", "OPENWORK_ENV_STORE");
  restoreEnv("openworkDataDir", "OPENWORK_DATA_DIR");
  restoreEnv("tokenStore", "OPENWORK_TOKEN_STORE");
  restoreEnv("memoryRoot", "MATTERHORN_WORK_MEMORY_ROOT");
  restoreEnv("memoryScope", "MATTERHORN_WORK_MEMORY_SCOPE");
  restoreEnv("opencodeDb", "OPENCODE_DB");
  restoreEnv("imageProvider", "MATTERHORN_IMAGE_PROVIDER");
  restoreEnv("openAiApiKey", "OPENAI_API_KEY");
  restoreEnv("imageSize", "MATTERHORN_IMAGE_SIZE");
  restoreEnv("walrusPublisherUrl", "MATTERHORN_WALRUS_PUBLISHER_URL");
  restoreEnv("walrusPublisherBearerToken", "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN");
  restoreEnv("walrusRelayUrl", "MATTERHORN_WALRUS_RELAY_URL");
  restoreEnv("walrusStorageEpochs", "MATTERHORN_WALRUS_STORAGE_EPOCHS");
  restoreEnv("suiNetwork", "MATTERHORN_SUI_NETWORK");
  restoreEnv("suiNftPackageId", "MATTERHORN_SUI_NFT_PACKAGE_ID");
  restoreEnv("suiNftModuleName", "MATTERHORN_SUI_NFT_MODULE_NAME");
  restoreEnv("suiNftType", "MATTERHORN_SUI_NFT_TYPE");
  restoreEnv("suiKioskPackageId", "MATTERHORN_SUI_KIOSK_PACKAGE_ID");
  restoreEnv("suiKioskId", "MATTERHORN_SUI_KIOSK_ID");
  restoreEnv("suiKioskOwnerCapId", "MATTERHORN_SUI_KIOSK_OWNER_CAP_ID");
  restoreEnv("suiTransferPolicyId", "MATTERHORN_SUI_TRANSFER_POLICY_ID");
  restoreEnv("suiTransferPolicyPackageId", "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID");
  restoreEnv("billingMode", "MATTERHORN_BILLING_MODE");
  restoreEnv("billingProvider", "MATTERHORN_BILLING_PROVIDER");
  restoreEnv("billingCurrentPlan", "MATTERHORN_BILLING_CURRENT_PLAN");
  restoreEnv("stripeSecretKey", "MATTERHORN_STRIPE_SECRET_KEY");
  restoreEnv("stripeWebhookSecret", "MATTERHORN_STRIPE_WEBHOOK_SECRET");
  restoreEnv("stripePriceIdPlus", "MATTERHORN_STRIPE_PRICE_ID_PLUS");
  restoreEnv("stripePriceIdMax", "MATTERHORN_STRIPE_PRICE_ID_MAX");
  restoreEnv("stripeTestCustomerId", "MATTERHORN_STRIPE_TEST_CUSTOMER_ID");
});

describe("backend control plane routes", () => {
  test("GET /api/backend/capabilities reports truthful backend status without secrets", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.capabilities.v1");
    expect(result.payload.models.status).toBe("needs_setup");
    expect(result.payload.models.label).toBe("Model catalog unavailable");
    expect(result.payload.models.defaultModel).toEqual({ providerId: "opencode", modelId: "mimo-v2.5-free" });
    expect(result.payload.models.providerListSource).toBe("opencode");
    expect(result.payload.models.routing.answerPath).toBe("opencode_session_prompt_async");
    expect(result.payload.models.routing.modelListTool).toBe("opencode_provider_list");
    expect(result.payload.models.routing.userSelectable).toBe(true);
    expect(result.payload.models.details).toMatchObject({
      opencodeConfigured: false,
      configuredWorkspaceCount: 0,
      requiredFor: ["start_chat", "start_desk_task"],
    });
    expect(result.payload.models.actions).toContainEqual({
      id: "settings.models.connect-local-engine",
      label: "Open Models",
      kind: "route",
      href: "/settings/ai",
    });
    expect(result.payload.providers.status).toBe("needs_setup");
    expect(result.payload.outputs).toMatchObject({
      status: "working",
      details: { readable: true, writable: true },
    });
    expect(result.payload.providers.details).toMatchObject({
      opencodeConfigured: false,
      configuredWorkspaceCount: 0,
      source: "opencode_provider_list",
    });
    expect(result.payload.memory.scope).toBe("machine_global");
    expect(result.payload.wallets.families.evm.status).toBe("working");
    expect(result.payload.wallets.families.bittensor.status).toBe("preview");
    expect(result.payload.wallets.families.bittensor.signing).toBe("external_signer");
    expect(result.payload.wallets.families.bittensor.details).toMatchObject({
      dataMode: "curated_fallback",
      liveProviderConfigured: false,
      providerSetup: "BITTENSOR_SUBTENSOR_SIDECAR_URL",
    });
    expect(result.payload.wallets.families.sui.status).toBe("preview");
    expect(result.payload.wallets.families.sui.directConnect).toBe(true);
    expect(result.payload.wallets.families.sui.signing).toBe("client_wallet");
    expect(result.payload.wallets.families.sui.runtimeSupport.web).toMatchObject({
      status: "preview",
      label: "Web wallet-standard connect",
      directConnect: true,
      publicRead: true,
      custody: false,
      signing: "client_wallet",
    });
    expect(result.payload.wallets.families.sui.runtimeSupport.desktop).toMatchObject({
      status: "preview",
      label: "Desktop external handoff",
      directConnect: false,
      publicRead: true,
      custody: false,
      signing: "external_signer",
    });
    expect(result.payload.wallets.families.evm.runtimeSupport.desktop).toMatchObject({
      status: "preview",
      directConnect: false,
      signing: "external_signer",
    });
    expect(result.payload.wallets.families.bittensor.runtimeSupport.electron).toMatchObject({
      status: "preview",
      directConnect: false,
      signing: "external_signer",
    });
    expect(result.payload.wallets.families.sui.details.recommendedPackages).toContain("@mysten/dapp-kit-react");
    expect(result.payload.wallets.families.sui.details.publicReadRoutes).toContain("/api/sui/account/:address");
    expect(result.payload.wallets.families.sui.details.publicReadRoutes).toContain("/api/sui/balance/:address");
    expect(result.payload.wallets.families.sui.details.transactionPreviewRoutes).toContain("/api/sui/transactions/preview");
    expect(result.payload.wallets.families.sui.details.receiptRoutes).toContain("/api/sui/transactions/receipt");
    expect(result.payload.wallets.families.sui.actions[0].href).toBe("https://sdk.mystenlabs.com/dapp-kit/getting-started/react");
    expect(result.payload.security.cors.status).toBe("needs_setup");
    expect(result.payload.security.memoryWriteGuards.status).toBe("working");
    expect(result.payload.settings.map((section: { section: string }) => section.section)).toContain("wallet");
    expect(result.payload.settings.find((section: { section: string }) => section.section === "models")?.status).toBe("needs_setup");
    expect(result.payload.settings.find((section: { section: string }) => section.section === "providers")?.status).toBe("needs_setup");
    expect(result.payload.settings.find((section: { section: string }) => section.section === "wallet")).toMatchObject({
      route: "/settings/wallet",
      workspaceScoped: true,
      desktopOnly: false,
      backendDependencies: expect.arrayContaining(["/api/backend/capabilities", "/workspace/:id/sui/transactions/preview"]),
      primaryAction: {
        id: "settings.wallet.open",
        kind: "route",
        href: "/settings/wallet",
      },
    });
    expect(result.payload.settings.find((section: { section: string }) => section.section === "mcp")).toMatchObject({
      route: "/settings/extensions/mcp",
      workspaceScoped: true,
      backendDependencies: expect.arrayContaining(["/mcp/*", "/extensions/*"]),
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Sui is not implemented yet");
  });

  test("GET /api/backend/capabilities reports outputs as read-only preview when writes are disabled", async () => {
    const { base } = await boot({ readOnly: true });
    const result = await jsonFetch(base, "/api/backend/capabilities");

    expect(result.response.status).toBe(200);
    expect(result.payload.outputs).toMatchObject({
      status: "preview",
      details: { readable: true, writable: false },
    });
  });

  test("GET /api/backend/capabilities reports model routing as working when OpenCode is configured", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [{ id: "opencode", name: "OpenCode", models: { "big-pickle": { name: "Big Pickle" } } }],
      default: { opencode: "big-pickle" },
      connected: ["opencode"],
    });
    const { base } = await boot({ opencodeBaseUrl });

    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.models.status).toBe("working");
    expect(result.payload.models.label).toBe("Model catalog service");
    expect(result.payload.models.details).toMatchObject({
      opencodeConfigured: true,
      configuredWorkspaceCount: 1,
      requiredFor: ["start_chat", "start_desk_task"],
    });
    expect(result.payload.models.actions).toBeUndefined();
    expect(result.payload.providers.status).toBe("working");
    expect(result.payload.providers.details).toMatchObject({
      opencodeConfigured: true,
      configuredWorkspaceCount: 1,
      source: "opencode_provider_list",
    });
    expect(result.payload.providers.actions).toBeUndefined();
    expect(result.payload.settings.find((section: { section: string }) => section.section === "models")?.status).toBe("working");
    expect(result.payload.settings.find((section: { section: string }) => section.section === "providers")?.status).toBe("working");
  });

  test("GET /api/backend/models reports the agent answer and model-selection contract", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/models");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.models.v1");
    expect(result.payload.defaultModel).toMatchObject({
      providerId: "opencode",
      modelId: "mimo-v2.5-free",
      source: "server_default",
    });
    expect(result.payload.routing.answerPath.transport).toBe("opencode_session_prompt_async");
    expect(result.payload.routing.answerPath.requestModelField).toBe("model.providerID_modelID");
    expect(result.payload.routing.selection.userSelectable).toBe(true);
    expect(result.payload.routing.selection.preferenceStore).toBe("local_preferences");
    expect(result.payload.routing.selection.serverPersisted).toBe(false);
    expect(result.payload.routing.registry.source).toBe("opencode_provider_list");
    expect(result.payload.routing.registry.serverOwned).toBe(false);
    expect(result.payload.routing.registry.clientTool).toBe("opencode_client_provider_list");
    expect(result.payload.routing.registry.cloudProviderImport).toBe(true);
    expect(result.payload.catalog).toMatchObject({
      source: "opencode_provider_list",
      serverFetched: false,
      providerCount: 0,
      connectedProviderCount: 0,
      modelCount: 0,
      providers: [],
    });
    expect(result.payload.privacy.trainingUse).toBe("none_by_default");
    expect(result.payload.privacy.feedbackUse).toBe("eval_routing_product_quality_only");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("GET /api/backend/capabilities reports invalid image and NFT publishing setup", async () => {
    process.env.MATTERHORN_IMAGE_PROVIDER = "banana";
    process.env.MATTERHORN_IMAGE_SIZE = "2048x2048";
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = "notaurl";
    process.env.MATTERHORN_WALRUS_RELAY_URL = "ipfs://not-http";
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "-1";
    process.env.MATTERHORN_SUI_NETWORK = "devnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0x1234";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.imageGeneration.status).toBe("error");
    expect(result.payload.imageGeneration.description).toContain("MATTERHORN_IMAGE_PROVIDER");
    expect(result.payload.walrusStorage.status).toBe("error");
    expect(result.payload.walrusStorage.details.validationIssues).toEqual([
      expect.objectContaining({ field: "MATTERHORN_WALRUS_PUBLISHER_URL" }),
      expect.objectContaining({ field: "MATTERHORN_WALRUS_RELAY_URL" }),
      expect.objectContaining({ field: "MATTERHORN_WALRUS_STORAGE_EPOCHS" }),
    ]);
    expect(result.payload.nftMinting.status).toBe("error");
    expect(result.payload.nftMarketplaceListing.status).toBe("error");
    expect(result.payload.nftMinting.details.validationIssues).toEqual([
      expect.objectContaining({ field: "MATTERHORN_SUI_NETWORK" }),
    ]);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("GET /workspace/:id/backend/models reports a sanitized workspace provider catalog state", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/models");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.models.v1");
    expect(result.payload.catalog).toMatchObject({
      status: "needs_setup",
      source: "opencode_provider_list",
      serverFetched: false,
      providerCount: 0,
      connectedProviderCount: 0,
      modelCount: 0,
      connectedProviderIds: [],
      defaultModels: {},
      providers: [],
      errorCode: "opencode_unconfigured",
    });
    expect(result.payload.catalog.description).not.toContain("owt_");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("GET /workspace/:id/backend/models normalizes a live provider catalog", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          source: "config",
          models: {
            "big-pickle": { name: "Big Pickle" },
          },
        },
        {
          id: "anthropic",
          name: "Anthropic",
          source: "api",
          models: {
            "claude-3-haiku": { name: "Claude 3 Haiku" },
            "claude-3-opus": { name: "Claude 3 Opus" },
            "claude-3-sonnet": { name: "Claude 3 Sonnet" },
          },
        },
      ],
      default: {
        anthropic: "claude-3-sonnet",
        opencode: "big-pickle",
      },
      connected: ["anthropic"],
    });
    const { base } = await boot({ opencodeBaseUrl });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/models");
    expect(result.response.status).toBe(200);
    expect(result.payload.catalog).toMatchObject({
      status: "working",
      source: "opencode_provider_list",
      serverFetched: true,
      providerCount: 2,
      connectedProviderCount: 1,
      modelCount: 4,
      connectedProviderIds: ["anthropic"],
      defaultModels: {
        anthropic: "claude-3-sonnet",
        opencode: "big-pickle",
      },
    });
    expect(result.payload.catalog.providers).toContainEqual({
      id: "anthropic",
      name: "Anthropic",
      source: "api",
      connected: true,
      modelCount: 3,
      modelIds: ["claude-3-haiku", "claude-3-opus", "claude-3-sonnet"],
      sampleModels: ["claude-3-haiku", "claude-3-opus", "claude-3-sonnet"],
    });
    expect(result.payload.defaultModel).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-3-sonnet",
      source: "server_default",
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
  });

  test("GET /workspace/:id/backend/models keeps a catalog-only model from looking ready or being saved", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [{
        id: "opencode",
        name: "OpenCode",
        source: "config",
        models: {
          "big-pickle": { name: "Big Pickle" },
          "mimo-v2.5-free": { name: "MiMo V2.5 Free" },
        },
      }],
      default: { opencode: "big-pickle" },
      connected: ["opencode"],
    });
    const { base } = await boot({ opencodeBaseUrl });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/models");
    expect(result.response.status).toBe(200);
    expect(result.payload.defaultModel).toMatchObject({
      providerId: "opencode",
      modelId: "mimo-v2.5-free",
      source: "server_default",
    });
    expect(result.payload.routing.answerPath.status).toBe("needs_setup");

    const rejected = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "opencode", modelId: "mimo-v2.5-free" }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("invalid_model_selection");
  });

  test("workspace model selection persists, clears, audits, and enforces write guards", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [{
        id: "openai",
        name: "OpenAI",
        source: "api",
        models: {
          "gpt-4.1": { name: "GPT 4.1" },
          "gpt-4.1-mini": { name: "GPT 4.1 Mini" },
        },
      }],
      default: { openai: "gpt-4.1-mini" },
      connected: ["openai"],
    });
    const { base, dir } = await boot({ opencodeBaseUrl });

    const initial = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection");
    expect(initial.response.status).toBe(200);
    expect(initial.payload.version).toBe("matterhorn.backend.model-selection.v1");
    expect(initial.payload.selection).toBe(null);
    expect(initial.payload.effectiveModel).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      source: "server_default",
    });
    expect(initial.payload.storage.path).toBe(join(dir, ".matterhorn-work", "models", "selection.json"));
    expect(initial.payload.storage.containsSecrets).toBe(false);

    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Model viewer" }),
    });
    const deniedViewer = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1" }),
    }, viewer.payload.token);
    expect(deniedViewer.response.status).toBe(403);

    const invalid = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "seed phrase should not be here" }),
    });
    expect(invalid.response.status).toBe(400);

    const invalidVariant = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1", variant: "bearer token should not be here" }),
    });
    expect(invalidVariant.response.status).toBe(400);

    const unknownModel = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "not-in-provider-list" }),
    });
    expect(unknownModel.response.status).toBe(400);
    expect(unknownModel.payload.code).toBe("invalid_model_selection");

    const saved = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1", variant: "high" }),
    });
    expect(saved.response.status).toBe(200);
    expect(saved.payload.selection).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1",
      variant: "high",
      source: "server_workspace_preference",
    });
    expect(saved.payload.effectiveModel).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1",
      source: "server_workspace_preference",
      variant: "high",
    });
    expect(saved.payload.policy).toMatchObject({
      storesCredentials: false,
      userSelectable: true,
      feedbackTrainingUse: "none_by_default",
    });

    const models = await jsonFetch(base, "/workspace/ws_backend/backend/models");
    expect(models.payload.defaultModel).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1",
      source: "server_workspace_preference",
      variant: "high",
    });
    expect(models.payload.routing.selection.preferenceStore).toBe("server");
    expect(models.payload.routing.selection.serverPersisted).toBe(true);

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=10");
    expect(audit.payload.items).toContainEqual(expect.objectContaining({
      action: "workspace.model_selection.update",
      target: "openai/gpt-4.1",
    }));

    const reset = await jsonFetch(base, "/workspace/ws_backend/backend/model-selection", { method: "DELETE" });
    expect(reset.response.status).toBe(200);
    expect(reset.payload.selection).toBe(null);
    expect(reset.payload.effectiveModel).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      source: "server_default",
    });

    const readOnly = await boot({ readOnly: true, opencodeBaseUrl });
    const deniedReadOnly = await jsonFetch(readOnly.base, "/workspace/ws_backend/backend/model-selection", {
      method: "PATCH",
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1" }),
    });
    expect(deniedReadOnly.response.status).toBe(403);

    const serialized = JSON.stringify({ initial: initial.payload, saved: saved.payload, reset: reset.payload });
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toMatch(/privateKey|seed phrase|mnemonic|wallet export|bearer token/i);
  }, 15_000);

  test("GET /workspace/:id/backend/readiness reports workspace action blockers", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/readiness");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.readiness.v1");
    expect(result.payload.workspace).toMatchObject({
      id: "ws_backend",
      name: "Backend control plane test workspace",
      type: "local",
      preset: "default",
    });
    expect(result.payload.checks.opencode_connection.status).toBe("needs_setup");
    expect(result.payload.checks.opencode_connection.description).toContain("no local agent engine URL is attached");
    expect(result.payload.checks.opencode_connection.details).toMatchObject({
      baseUrlConfigured: false,
      reachable: false,
      probeStatus: "not_configured",
      directoryConfigured: true,
      managedEngineSupported: true,
      setupCommands: [
        "OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local",
        "MATTERHORN_LOCAL_OPENCODE_URL=http://127.0.0.1:<port> pnpm dev:matterhorn-local",
      ],
    });
    expect(result.payload.checks.workspace_writable.status).toBe("working");
    expect(result.payload.features.start_chat.ready).toBe(false);
    expect(result.payload.features.start_desk_task.blockingCheckIds).toContain("opencode_connection");
    expect(result.payload.features.save_notes.ready).toBe(true);
    expect(result.payload.features.review_memory.ready).toBe(true);
    expect(result.payload.features.save_memory.ready).toBe(true);
    expect(result.payload.features.export_evidence.ready).toBe(true);
    expect(result.payload.summary.blockingChecks).toContain("opencode_connection");
    expect(result.payload.summary.recommendedActions).toContainEqual(expect.objectContaining({
      actionId: "connect-local-engine",
      kind: "connect_local_engine",
      label: "Connect the local agent engine",
      severity: "blocking",
      surface: "terminal",
      command: "OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local",
      checkIds: ["opencode_connection"],
      featureIds: ["start_chat", "start_desk_task"],
      href: "settings:ai",
    }));

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
  });

  test("GET /workspace/:id/backend/readiness blocks chat when a configured engine is unreachable", async () => {
    const unavailablePort = await getFreePort();
    const { base } = await boot({ opencodeBaseUrl: `http://127.0.0.1:${unavailablePort}` });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/readiness");
    expect(result.response.status).toBe(200);
    expect(result.payload.checks.opencode_connection).toMatchObject({
      status: "error",
      label: "Agent engine unavailable",
      details: {
        baseUrlConfigured: true,
        reachable: false,
        probeStatus: "unavailable",
        probeTimeoutMs: 1_500,
      },
    });
    expect(result.payload.checks.opencode_connection.description).toContain("did not answer");
    expect(result.payload.features.start_chat.ready).toBe(false);
    expect(result.payload.features.start_desk_task.ready).toBe(false);
    expect(result.payload.summary.recommendedActions).toContainEqual(expect.objectContaining({
      actionId: "connect-local-engine",
      label: "Restart or reconnect the agent engine",
      href: "settings:ai",
    }));

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(`127.0.0.1:${unavailablePort}`);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("GET /workspace/:id/backend/control-plane composes sanitized backend contracts", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/control-plane");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.control-plane.v1");
    expect(result.payload.workspace).toMatchObject({
      id: "ws_backend",
      name: "Backend control plane test workspace",
      type: "local",
      preset: "default",
    });
    expect(result.payload.versions).toEqual({
      capabilities: "matterhorn.backend.capabilities.v1",
      models: "matterhorn.backend.models.v1",
      readiness: "matterhorn.backend.readiness.v1",
      dataMap: "matterhorn.backend.data-map.v1",
      dataControls: "matterhorn.backend.data-controls.v1",
      dataPolicy: "matterhorn.backend.data-policy.v1",
    });
    expect(result.payload.summary).toMatchObject({
      status: "needs_setup",
      capabilitiesStatus: "needs_setup",
      modelCatalogStatus: "needs_setup",
      readinessStatus: "needs_setup",
      readyFeatures: 4,
      totalFeatures: 6,
      connectedProviders: 0,
      totalProviders: 0,
      totalModels: 0,
    });
    expect(result.payload.summary.blockingChecks).toContain("opencode_connection");
    expect(result.payload.readiness.summary.recommendedActions[0]).toMatchObject({
      actionId: "connect-local-engine",
      label: "Connect the local agent engine",
      surface: "terminal",
      command: "OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local",
    });
    expect(result.payload.summary.exportableStores).toBeGreaterThan(0);
    expect(result.payload.summary.deletableStores).toBeGreaterThan(0);
    expect(result.payload.capabilities.security.memoryWriteGuards.status).toBe("working");
    expect(result.payload.models.catalog.errorCode).toBe("opencode_unconfigured");
    expect(result.payload.readiness.features.start_desk_task.ready).toBe(false);
    expect(result.payload.dataMap.stores.notes.scope).toBe("workspace");
    expect(result.payload.dataPolicy.policy).toMatchObject({
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
      secretsReturned: false,
    });
    expect(result.payload.dataMap.stores.walletEvidence.details.ledgerRoute).toBe("/workspace/ws_backend/data-ledger?kind=wallet");
    expect(result.payload.dataMap.stores.walletEvidence.containsSecrets).toBe("redacted");
    expect(result.payload.dataControls.stores.feedback.privacy.trainingUse).toBe("eval_routing_product_quality_only");
    expect(result.payload.privacy).toEqual({
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
      feedbackCollectionEnabled: true,
      secretsReturned: false,
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
    expect(serialized).not.toContain("Authorization");
  });

  test("workspace control plane reports workspace-local memory mode through capabilities", async () => {
    const { base, dir } = await boot();
    const workspaceMemoryRoot = join(dir, ".matterhorn-work", "memory");

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/control-plane");
    expect(result.response.status).toBe(200);
    expect(result.payload.dataMap.stores.memory.scope).toBe("workspace");
    expect(result.payload.dataMap.stores.memory.details.mode).toBe("workspace_local_vault");
    expect(result.payload.capabilities.memory.scope).toBe("workspace");
    expect(result.payload.capabilities.memory.rootPath).toBe(workspaceMemoryRoot);
    expect(result.payload.capabilities.memory.description).toContain(".matterhorn-work/memory");
    expect(result.payload.capabilities.memory.details.workspaceStorage).toMatchObject({
      scope: "workspace",
      mode: "workspace_local_vault",
      isolation: "workspace_local_vault",
      workspaceNamespaceTag: "workspace:ws_backend",
    });
    expect(result.payload.capabilities.storage.stores.memory.scope).toBe("workspace");
    expect(result.payload.capabilities.storage.stores.memory.paths[0]).toBe(workspaceMemoryRoot);
  });

  test("workspace memory can opt into the tagged global machine vault", async () => {
    const { base, dir } = await boot({ workspaceMemoryScope: "global" });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/control-plane");
    expect(result.response.status).toBe(200);
    expect(result.payload.dataMap.stores.memory.scope).toBe("machine_global");
    expect(result.payload.dataMap.stores.memory.details.mode).toBe("tagged_global_vault");
    expect(result.payload.dataMap.stores.memory.details.isolation).toBe("tagged_records_in_machine_vault");
    expect(result.payload.capabilities.memory.scope).toBe("machine_global");
    expect(result.payload.capabilities.memory.rootPath).toBe(join(dir, "memory"));
    expect(result.payload.capabilities.storage.stores.memory.paths[0]).toBe(join(dir, "memory"));
  });

  test("GET /workspace/:id/backend/support-report returns a redacted diagnostic artifact", async () => {
    const { base } = await boot();

    const feedback = await jsonFetch(base, "/workspace/ws_backend/feedback", {
      method: "POST",
      body: JSON.stringify({
        kind: "comment",
        target: { sourceType: "settings", sourceId: "backend-support" },
        comment: "Support should see policy status, not bearer token owt_should_not_leak.",
      }),
    });
    expect(feedback.response.status).toBe(201);

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/support-report");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.support-report.v1");
    expect(result.payload.filename).toMatch(/^matterhorn-backend-support-ws_backend-/);
    expect(result.payload.workspace.id).toBe("ws_backend");
    expect(result.payload.controlPlane.version).toBe("matterhorn.backend.control-plane.v1");
    expect(result.payload.controlPlane.summary.totalFeatures).toBeGreaterThan(0);
    expect(result.payload.controlPlane.privacy.secretsReturned).toBe(false);
    expect(result.payload.controlPlane.capabilities).toBeUndefined();
    expect(result.payload.controlPlane.models).toBeUndefined();
    expect(result.payload.controlPlane.dataMap).toBeUndefined();
    expect(result.payload.wallets.families.sui.signing).toBe("client_wallet");
    expect(result.payload.wallets.families.bittensor.signing).toBe("external_signer");
    expect(result.payload.teams.localTokenSharing.status).toBe("working");
    expect(result.payload.teams.cloudTeams.status).toBe("needs_setup");
    expect(result.payload.teamAccess.sharingMode).toMatchObject({
      current: "local_tokens",
      label: "Local token sharing",
      sameInterface: true,
      durableCloudTeams: false,
      requiresReachableLocalServer: true,
      cloudTeamsStatus: "needs_setup",
    });
    expect(result.payload.teamAccess.scopeCapabilities.viewer).toMatchObject({
      scope: "viewer",
      canReadWorkspace: true,
      canWriteWorkspace: false,
      canManageLocalTokens: false,
    });
    expect(result.payload.teamAccess.scopeCapabilities.collaborator).toMatchObject({
      scope: "collaborator",
      canReadWorkspace: true,
      canWriteWorkspace: true,
      canManageLocalTokens: false,
    });
    expect(result.payload.teamAccess.policy).toMatchObject({
      secretsReturned: false,
      hostProtected: false,
      fullTokenListRequiresHost: true,
    });
    expect(result.payload.teamAccess.localAccess.tokenCount).toBeGreaterThanOrEqual(1);
    expect(result.payload.teamAccess.localAccess.tokens).toBeUndefined();
    expect(result.payload.security.memoryWriteGuards.status).toBe("working");
    expect(result.payload.readiness.version).toBe("matterhorn.backend.readiness.v1");
    expect(result.payload.readiness.summary.recommendedActions).toContainEqual(expect.objectContaining({
      actionId: "connect-local-engine",
      kind: "connect_local_engine",
      label: "Connect the local agent engine",
      surface: "terminal",
      command: "OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local",
    }));
    expect(result.payload.readiness.features.start_desk_task.ready).toBe(false);
    expect(result.payload.models.defaultModel).toMatchObject({
      providerId: "opencode",
      modelId: "mimo-v2.5-free",
    });
    expect(result.payload.models.routing.answerPath.transport).toBe("opencode_session_prompt_async");
    expect(result.payload.models.routing.selection.preferenceStore).toBe("local_preferences");
    expect(result.payload.models.catalog.source).toBe("opencode_provider_list");
    expect(result.payload.models.catalog.providerCount).toBe(0);
    expect(result.payload.models.catalog.providers).toEqual([]);
    expect(result.payload.dataPolicy.dataMap.version).toBe("matterhorn.backend.data-map.v1");
    expect(result.payload.dataPolicy.dataMap.stores.memory.details.workspaceNamespaceTag).toBe("workspace:ws_backend");
    expect(result.payload.dataPolicy.dataMap.stores.feedback.retention).toBe("user_controlled");
    expect(result.payload.dataPolicy.dataMap.stores.walletEvidence.exportable).toBe(true);
    expect(result.payload.dataPolicy.controls.version).toBe("matterhorn.backend.data-controls.v1");
    expect(result.payload.dataPolicy.controls.summary.userControlledStores).toBeGreaterThan(0);
    expect(result.payload.dataPolicy.controls.policy.trainingUse).toBe("none_by_default");
    expect(result.payload.dataLedger.version).toBe("matterhorn.project-data-ledger.v1");
    expect(result.payload.dataLedger.summary.feedback).toBeGreaterThanOrEqual(1);
    expect(result.payload.dataLedger.export.href).toBe("/workspace/ws_backend/data-ledger/export");
    expect(result.payload.dataLedger.export.manifest.backendContext.included).toBe(true);
    expect(result.payload.generatedMedia.diagnostics).toMatchObject({
      success: true,
      workspaceId: "ws_backend",
      safety: {
        custody: false,
        canSubmit: false,
        walletSigning: "client_wallet",
        publicWritesDuringDiagnostics: false,
        storesSecrets: false,
      },
    });
    expect(result.payload.generatedMedia.diagnostics.productionSmokePlan.publicWritesOnlyAfterUserAction).toBe(true);
    expect(result.payload.billing).toMatchObject({
      capability: {
        status: "preview",
        isLivePaymentsEnabled: false,
      },
      status: {
        success: true,
        status: {
          mode: "phase0_mock",
          provider: "mock",
          isLivePaymentsEnabled: false,
          subscription: {
            planId: "free",
          },
        },
      },
      diagnostics: {
        mode: "phase0_mock",
        provider: "mock",
        currentPlanId: "free",
        workspacePlanId: "free",
        livePaymentsEnabled: false,
        readyForTestCheckout: false,
        readyForWebhooks: false,
        pendingCheckout: null,
        safety: {
          liveCharges: false,
          rawCardDataHandled: false,
          secretsReturned: false,
          providerWritesDuringDiagnostics: false,
        },
      },
    });
    expect(result.payload.billing.diagnostics.usage.generatedImages.limit).toBe(10);
    expect(result.payload.billing.diagnostics.checks.map((check: { id: string }) => check.id)).toEqual([
      "mock_mode",
      "live_payments_disabled",
    ]);
    expect(result.payload.privacy).toEqual({
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
      feedbackCollectionEnabled: true,
      secretsReturned: false,
    });
    expect(result.payload.warnings.join(" ")).toContain("do not include raw chat transcripts");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_SECRET_KEY");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_WEBHOOK_SECRET");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_PRICE_ID_PLUS");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_PRICE_ID_MAX");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_TEST_CUSTOMER_ID");
    expect(serialized).not.toContain("owt_should_not_leak");
  });

  test("backend support report includes Stripe test billing readiness without provider writes or secrets", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "plus";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_support_report_billing";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_support_report_billing";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_support_report";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_support_report";
    process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID = "cus_support_report_billing";
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/support-report");
    expect(result.response.status).toBe(200);
    expect(result.payload.billing).toMatchObject({
      capability: {
        status: "working",
        provider: "stripe",
        mode: "phase1_stripe_test",
        isLivePaymentsEnabled: false,
        checkoutSupported: true,
        portalSupported: true,
      },
      status: {
        success: true,
        status: {
          mode: "phase1_stripe_test",
          provider: "stripe",
          isLivePaymentsEnabled: false,
          subscription: {
            planId: "plus",
          },
          setup: {
            readyForTestCheckout: true,
            readyForWebhooks: true,
          },
        },
      },
      diagnostics: {
        mode: "phase1_stripe_test",
        provider: "stripe",
        currentPlanId: "plus",
        workspacePlanId: "plus",
        livePaymentsEnabled: false,
        checkoutSupported: true,
        portalSupported: true,
        readyForTestCheckout: true,
        readyForWebhooks: true,
        pendingCheckout: null,
        safety: {
          liveCharges: false,
          rawCardDataHandled: false,
          secretsReturned: false,
          providerWritesDuringDiagnostics: false,
        },
      },
    });
    expect(result.payload.billing.diagnostics.recommendedActions).toEqual([]);
    expect(result.payload.billing.diagnostics.checks.map((check: { id: string; status: string }) => `${check.id}:${check.status}`)).toEqual([
      "stripe_secret_key:working",
      "stripe_webhook_secret:working",
      "stripe_plus_price:working",
      "stripe_max_price:working",
      "stripe_test_customer:working",
      "live_payments_disabled:working",
    ]);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain("sk_test_support_report_billing");
    expect(serialized).not.toContain("whsec_support_report_billing");
    expect(serialized).not.toContain("price_plus_support_report");
    expect(serialized).not.toContain("price_max_support_report");
    expect(serialized).not.toContain("cus_support_report_billing");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_SECRET_KEY");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_WEBHOOK_SECRET");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_PRICE_ID_PLUS");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_PRICE_ID_MAX");
    expect(serialized).not.toContain("MATTERHORN_STRIPE_TEST_CUSTOMER_ID");
    expect(serialized).not.toContain("Authorization");
  });

  test("backend support report treats expired Stripe test checkouts as no longer pending", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_expired_checkout_support_report";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_expired_checkout_support_report";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_expired_checkout";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_expired_checkout";
    const { base, dir } = await boot();

    await new MatterhornBillingAccountStore({
      workspaceRoot: dir,
      workspaceId: "ws_backend",
    }).save({
      version: "matterhorn.billing.account.v1",
      workspaceId: "ws_backend",
      subscription: buildMatterhornBillingSubscription("free"),
      pendingCheckout: {
        planId: "plus",
        interval: "month",
        provider: "stripe",
        mode: "stripe_test",
        providerSessionId: "cs_expired_should_not_surface",
        createdAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-01T00:30:00.000Z",
      },
      updatedAt: "2026-07-01T00:00:00.000Z",
      source: "stripe_test_checkout",
    });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/support-report");
    expect(result.response.status).toBe(200);
    expect(result.payload.billing.status.status.pendingCheckout ?? null).toBeNull();
    expect(result.payload.billing.status.status.accountLinkage).toMatchObject({
      source: "stripe_test_checkout",
      label: "Stripe test checkout expired",
      pendingCheckout: false,
    });
    expect(result.payload.billing.diagnostics.pendingCheckout).toBeNull();
    expect(JSON.stringify(result.payload)).not.toContain("cs_expired_should_not_surface");
  });

  test("backend support report keeps local generated-media probes out of production readiness", async () => {
    const walrus = await startWalrusDiagnosticServer();
    process.env.MATTERHORN_IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-support-report-generated-media";
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN = "secret-support-report-walrus-token";
    process.env.MATTERHORN_WALRUS_RELAY_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "3";
    process.env.MATTERHORN_SUI_NETWORK = "sui-testnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = `0x${"1".repeat(64)}`;
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "matterhorn_nft";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = `0x${"2".repeat(64)}`;
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = `0x${"3".repeat(64)}`;
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/support-report");
    expect(result.response.status).toBe(200);
    expect(result.payload.generatedMedia.diagnostics.status).toBe("pass");
    expect(result.payload.generatedMedia.diagnostics.checks.map((check: { id: string }) => check.id)).toEqual([
      "image_provider",
      "walrus_storage",
      "sui_nft_minting",
      "sui_marketplace_listing",
      "non_custody_safety",
    ]);
    expect(result.payload.generatedMedia.diagnostics.productionSmokePlan).toMatchObject({
      mode: "needs_setup",
      canRunEndToEnd: false,
      publicWritesOnlyAfterUserAction: true,
    });
    expect(result.payload.generatedMedia.diagnostics.productionSmokePlan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ envVar: "MATTERHORN_WALRUS_PUBLISHER_URL", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_WALRUS_RELAY_URL", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID", status: "invalid" }),
      expect.objectContaining({ envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID", status: "invalid" }),
    ]));
    expect(result.payload.generatedMedia.diagnostics.productionSmokePlan.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "safe_diagnostics",
        status: "ready",
        writeScope: "none",
        requiresPublicWrite: false,
      }),
      expect.objectContaining({
        id: "walrus_public_upload",
        status: "blocked",
        writeScope: "public_storage",
        requiresPublicWrite: true,
      }),
      expect.objectContaining({
        id: "sui_wallet_mint",
        status: "blocked",
        writeScope: "wallet_signed_transaction",
        requiresWallet: true,
      }),
      expect.objectContaining({
        id: "sui_kiosk_listing",
        status: "blocked",
        writeScope: "wallet_signed_transaction",
        requiresWallet: true,
      }),
    ]));
    expect(walrus.calls.map((call) => call.method).sort()).toEqual(["HEAD", "OPTIONS"]);
    expect(walrus.calls.some((call) => call.method === "PUT" || call.method === "POST")).toBe(false);
    expect(walrus.calls.every((call) => call.byteLength === 0)).toBe(true);
    expect(walrus.calls.find((call) => call.method === "OPTIONS")?.authorization).toBe("Bearer secret-support-report-walrus-token");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain("sk-test-support-report-generated-media");
    expect(serialized).not.toContain("secret-support-report-walrus-token");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN");
  });

  test("backend support report includes sanitized model provider samples", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [
        {
          id: "anthropic",
          name: "Anthropic",
          source: "api",
          models: {
            "claude-3-haiku": { name: "Claude 3 Haiku" },
            "claude-3-opus": { name: "Claude 3 Opus" },
            "claude-3-sonnet": { name: "Claude 3 Sonnet" },
          },
        },
      ],
      default: {
        anthropic: "claude-3-sonnet",
      },
      connected: ["anthropic"],
    });
    const { base } = await boot({ opencodeBaseUrl });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/support-report");
    expect(result.response.status).toBe(200);
    expect(result.payload.models.catalog.defaultModels).toEqual({
      anthropic: "claude-3-sonnet",
    });
    expect(result.payload.models.catalog.providers).toEqual([{
      id: "anthropic",
      name: "Anthropic",
      source: "api",
      connected: true,
      modelCount: 3,
      sampleModels: ["claude-3-haiku", "claude-3-opus", "claude-3-sonnet"],
    }]);
    expect(result.payload.models.catalog.providers[0].modelIds).toBeUndefined();

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
    expect(serialized).not.toContain("Authorization");
  });

  test("GET /workspace/:id/backend/control-plane includes live model catalog counts", async () => {
    const opencodeBaseUrl = await startProviderCatalogServer({
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          source: "config",
          models: {
            "big-pickle": { name: "Big Pickle" },
          },
        },
        {
          id: "openai",
          name: "OpenAI",
          source: "api",
          models: {
            "gpt-4.1": { name: "GPT-4.1" },
            "gpt-4.1-mini": { name: "GPT-4.1 mini" },
          },
        },
      ],
      default: {
        openai: "gpt-4.1-mini",
        opencode: "big-pickle",
      },
      connected: ["openai"],
    });
    const { base } = await boot({ opencodeBaseUrl });

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/control-plane");
    expect(result.response.status).toBe(200);
    expect(result.payload.summary).toMatchObject({
      modelCatalogStatus: "working",
      readinessStatus: "working",
      connectedProviders: 1,
      totalProviders: 2,
      totalModels: 3,
      readyFeatures: 6,
      totalFeatures: 6,
    });
    expect(result.payload.summary.blockingChecks).toEqual([]);
    expect(result.payload.readiness.summary.recommendedActions).toEqual([]);
    expect(result.payload.models.catalog.providers).toContainEqual({
      id: "openai",
      name: "OpenAI",
      source: "api",
      connected: true,
      modelCount: 2,
      modelIds: ["gpt-4.1", "gpt-4.1-mini"],
      sampleModels: ["gpt-4.1", "gpt-4.1-mini"],
    });
    expect(result.payload.models.defaultModel).toMatchObject({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      source: "server_default",
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
  });

  test("GET /workspace/:id/backend/team-access reports sanitized local access status", async () => {
    const { base } = await boot();

    const createdViewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Review-only teammate" }),
    });
    expect(createdViewer.response.status).toBe(201);

    const denied = await jsonFetch(base, "/workspace/ws_backend/backend/team-access");
    expect(denied.response.status).toBe(401);

    const summary = await jsonFetch(base, "/workspace/ws_backend/backend/team-access/summary");
    expect(summary.response.status).toBe(200);
    expect(summary.payload.version).toBe("matterhorn.backend.team-access.v1");
    expect(summary.payload.localAccess.byScope.viewer).toBe(1);
    expect(summary.payload.sharingMode).toMatchObject({
      current: "local_tokens",
      label: "Local token sharing",
      sameInterface: true,
      durableCloudTeams: false,
      requiresReachableLocalServer: true,
      cloudTeamsStatus: "needs_setup",
    });
    expect(summary.payload.connection).toMatchObject({
      serverUrl: base,
      reachableFromOtherDevices: false,
      connectSurface: "connect_custom_remote",
      tokenFieldLabel: "Access token",
    });
    expect(summary.payload.connection.instructions.join(" ")).toContain("Connect custom remote");
    expect(summary.payload.scopeCapabilities.viewer.canWriteWorkspace).toBe(false);
    expect(summary.payload.scopeCapabilities.collaborator.canWriteWorkspace).toBe(true);
    expect(summary.payload.policy).toMatchObject({
      secretsReturned: false,
      hostProtected: false,
      fullTokenListRequiresHost: true,
    });
    expect(JSON.stringify(summary.payload)).not.toContain(createdViewer.payload.token);
    expect(JSON.stringify(summary.payload)).not.toContain("Review-only teammate");

    const result = await hostFetch(base, "/workspace/ws_backend/backend/team-access");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.team-access.v1");
    expect(result.payload.localAccess.scopes).toEqual(["owner", "collaborator", "viewer"]);
    expect(result.payload.localAccess.byScope.collaborator).toBeGreaterThanOrEqual(1);
    expect(result.payload.localAccess.byScope.viewer).toBe(1);
    expect(result.payload.localAccess.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "built-in-client-token", scope: "collaborator", source: "built_in_client_token" }),
        expect.objectContaining({ scope: "viewer", label: "Review-only teammate", source: "token_store" }),
      ]),
    );
    expect(result.payload.cloudTeams.status).toBe("needs_setup");
    expect(result.payload.connection.serverUrl).toBe(base);
    expect(result.payload.connection.reachableFromOtherDevices).toBe(false);
    expect(result.payload.sharingMode.limitations.join(" ")).toContain("not durable cloud org membership");
    expect(result.payload.scopeCapabilities.owner.canManageLocalTokens).toBe(true);
    expect(result.payload.policy.secretsReturned).toBe(false);
    expect(result.payload.policy.hostProtected).toBe(true);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(createdViewer.payload.token);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("hash");
  });

  test("workspace team-token routes create one-time local access tokens and audit revokes", async () => {
    const { base, dir } = await boot();

    const invalidOwner = await hostFetch(base, "/workspace/ws_backend/backend/team-access/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "owner", label: "Owner invite" }),
    });
    expect(invalidOwner.response.status).toBe(400);
    expect(invalidOwner.payload.code).toBe("invalid_scope");

    const blockedOnFree = await hostFetch(base, "/workspace/ws_backend/backend/team-access/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only reviewer" }),
    });
    expect(blockedOnFree.response.status).toBe(429);
    expect(blockedOnFree.payload.code).toBe("billing_entitlement_limit_reached");
    expect(blockedOnFree.payload.details).toMatchObject({
      entitlementKey: "team_members",
      currentPlanId: "free",
      used: 1,
      limit: 1,
    });

    await new MatterhornBillingAccountStore({ workspaceRoot: dir, workspaceId: "ws_backend" }).save({
      version: "matterhorn.billing.account.v1",
      workspaceId: "ws_backend",
      subscription: buildMatterhornBillingSubscription("max"),
      pendingCheckout: null,
      updatedAt: new Date().toISOString(),
      source: "stripe_test_webhook",
    });

    const created = await hostFetch(base, "/workspace/ws_backend/backend/team-access/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only reviewer" }),
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.success).toBe(true);
    expect(created.payload.version).toBe("matterhorn.backend.team-access.v1");
    expect(created.payload.token).toMatchObject({
      scope: "viewer",
      label: "Read-only reviewer",
      source: "token_store",
    });
    expect(created.payload.token.token).toMatch(/^owt_/);
    expect(created.payload.connection).toMatchObject({
      serverUrl: base,
      connectSurface: "connect_custom_remote",
      authScheme: "bearer_token",
    });
    expect(created.payload.policy).toMatchObject({
      secretsReturned: "one_time_token",
      hostProtected: true,
      auditLogged: true,
      allowedScopes: ["collaborator", "viewer"],
    });

    const statusAfterCreate = await hostFetch(base, "/workspace/ws_backend/backend/team-access");
    expect(statusAfterCreate.response.status).toBe(200);
    expect(statusAfterCreate.payload.localAccess.byScope.viewer).toBe(1);
    expect(statusAfterCreate.payload.localAccess.tokens).toContainEqual(
      expect.objectContaining({
        id: created.payload.token.id,
        scope: "viewer",
        label: "Read-only reviewer",
        source: "token_store",
      }),
    );
    expect(JSON.stringify(statusAfterCreate.payload)).not.toContain(created.payload.token.token);

    const billingStatus = await jsonFetch(base, "/workspace/ws_backend/billing/status");
    expect(billingStatus.response.status).toBe(200);
    expect(billingStatus.payload.status.subscription.planId).toBe("max");
    expect(billingStatus.payload.status.usage.teamMembers).toMatchObject({ used: 2, limit: 10 });

    const revoke = await hostFetch(base, `/workspace/ws_backend/backend/team-access/tokens/${created.payload.token.id}`, {
      method: "DELETE",
    });
    expect(revoke.response.status).toBe(200);
    expect(revoke.payload.success).toBe(true);
    expect(revoke.payload.revoked).toMatchObject({
      id: created.payload.token.id,
      scope: "viewer",
      label: "Read-only reviewer",
    });
    expect(revoke.payload.policy).toMatchObject({
      secretsReturned: false,
      hostProtected: true,
      auditLogged: true,
    });

    const statusAfterRevoke = await hostFetch(base, "/workspace/ws_backend/backend/team-access");
    expect(statusAfterRevoke.payload.localAccess.tokens).not.toContainEqual(
      expect.objectContaining({ id: created.payload.token.id }),
    );

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=20");
    const actions = audit.payload.items.map((item: { action: string }) => item.action);
    expect(actions).toContain("workspace.team_token.create");
    expect(actions).toContain("workspace.team_token.revoke");

    const serialized = JSON.stringify({ created, revoke, statusAfterCreate, statusAfterRevoke, audit });
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("hash");
  });

  test("Sui public read routes reject invalid public input before provider calls", async () => {
    const { base } = await boot();

    const invalidNetwork = await jsonFetch(base, "/api/sui/account/0x2?network=devnet");
    expect(invalidNetwork.response.status).toBe(400);
    expect(invalidNetwork.payload.code).toBe("invalid_sui_network");

    const invalidAddress = await jsonFetch(base, "/api/sui/balance/not-a-sui-address");
    expect(invalidAddress.response.status).toBe(400);
    expect(invalidAddress.payload.code).toBe("invalid_sui_address");

    const secretAddress = encodeURIComponent("seed phrase: fake words for signing");
    const rejectedSecret = await jsonFetch(base, `/api/sui/account/${secretAddress}`);
    expect(rejectedSecret.response.status).toBe(400);
    expect(rejectedSecret.payload.code).toBe("sui_secret_rejected");
  });

  test("Sui transaction preview route returns a connected-wallet transaction review", async () => {
    const { base } = await boot();

    const preview = await jsonFetch(base, "/api/sui/transactions/preview", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        sender: "0x2",
        recipient: "0x3",
        amountMist: "1000000000",
      }),
    });

    expect(preview.response.status).toBe(200);
    expect(preview.payload.success).toBe(true);
    expect(preview.payload.preview).toMatchObject({
      version: "matterhorn.sui.transaction-preview.v1",
      family: "sui",
      kind: "transfer_sui",
      amountMist: "1000000000",
      canSubmit: true,
      custody: false,
      liveSubmissionEnabled: true,
      signerPolicy: "client_wallet_required",
    });
    expect(preview.payload.preview.previewSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.payload.cards[0].kind).toBe("sui_transaction_preview");
    expect(JSON.stringify(preview.payload)).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|raw signature|signed payload/i);
  });

  test("Sui receipt route accepts only public transaction metadata", async () => {
    const { base } = await boot();

    const receipt = await jsonFetch(base, "/api/sui/transactions/receipt", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        previewSha256: "a".repeat(64),
        transactionDigest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
        status: "success",
      }),
    });

    expect(receipt.response.status).toBe(200);
    expect(receipt.payload.success).toBe(true);
    expect(receipt.payload.receipt).toMatchObject({
      version: "matterhorn.sui.transaction-receipt.v1",
      family: "sui",
      status: "success",
      custody: false,
      containsSignatureMaterial: false,
      verification: {
        kind: "public_receipt_metadata",
        digestPresent: true,
        previewLinked: true,
        liveSubmissionByMatterhorn: false,
      },
    });
    expect(receipt.payload.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.payload.cards[0].kind).toBe("sui_transaction_receipt");
    expect(JSON.stringify(receipt.payload)).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|raw signature|signed payload/i);

    const rejected = await jsonFetch(base, "/api/sui/transactions/receipt", {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
        rawSignature: "nope",
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("sui_secret_rejected");
  });

  test("workspace Sui preview and receipt routes save evidence into the project ledger", async () => {
    const { base, dir } = await boot();

    const preview = await jsonFetch(base, "/workspace/ws_backend/sui/transactions/preview", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sui wallet evidence",
        payload: {
          network: "testnet",
          sender: "0x2",
          recipient: "0x3",
          amountSui: "1",
          memo: "workspace evidence test",
        },
      }),
    });
    expect(preview.response.status).toBe(201);
    expect(preview.payload.success).toBe(true);
    expect(preview.payload.evidence).toMatchObject({
      workspaceId: "ws_backend",
      sessionSlug: "sui_wallet_evidence",
      source: "task_events",
    });
    expect(preview.payload.preview).toMatchObject({
      canSubmit: true,
      liveSubmissionEnabled: true,
      signerPolicy: "client_wallet_required",
    });
    expect(existsSync(join(dir, preview.payload.evidence.outputPath))).toBe(true);

    const reviewedAction = buildReviewedActionHandoffV2({
      handoff: {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation: "transfer_sui",
          network: "testnet",
          sender: "0x2",
          recipient: "0x3",
          amount: "1",
          coinType: null,
          objectId: null,
          transfers: [],
        },
      },
      runId: "run_sui_wallet_evidence",
      simulation: { reference: preview.payload.preview.previewSha256 },
    });
    const validation = await jsonFetch(base, "/workspace/ws_backend/reviewed-actions/validate", {
      method: "POST",
      body: JSON.stringify({
        handoff: reviewedAction,
        currentDraft: {
          version: "matterhorn.reviewed-action-handoff.v1",
          protocol: "sui",
          source: "agent-card",
          draft: reviewedAction.draft,
        },
      }),
    });
    expect(validation.response.status).toBe(200);
    expect(validation.payload).toMatchObject({ success: true, valid: true, issues: [] });

    const mismatchedReceipt = await jsonFetch(base, "/workspace/ws_backend/sui/transactions/receipt", {
      method: "POST",
      body: JSON.stringify({
        reviewedAction,
        receiptIntentHash: "f".repeat(64),
        payload: {
          network: "testnet",
          previewSha256: preview.payload.preview.previewSha256,
          transactionDigest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
          status: "success",
          sender: "0x2",
          recipient: "0x3",
          amountSui: "1",
        },
      }),
    });
    expect(mismatchedReceipt.response.status).toBe(409);
    expect(mismatchedReceipt.payload.code).toBe("reviewed_action_receipt_intent_mismatch");

    const receipt = await jsonFetch(base, "/workspace/ws_backend/sui/transactions/receipt", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sui wallet evidence",
        reviewedAction,
        receiptIntentHash: reviewedAction.intentHash,
        payload: {
          network: "testnet",
          previewSha256: preview.payload.preview.previewSha256,
          transactionDigest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
          status: "success",
          sender: "0x2",
          recipient: "0x3",
          amountSui: "1",
        },
      }),
    });
    expect(receipt.response.status).toBe(201);
    expect(receipt.payload.success).toBe(true);
    expect(receipt.payload.receipt.containsSignatureMaterial).toBe(false);
    expect(existsSync(join(dir, receipt.payload.evidence.outputPath))).toBe(true);

    const ledger = await jsonFetch(base, "/workspace/ws_backend/data-ledger?desk=sui&kind=output&limit=20");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.success).toBe(true);
    expect(ledger.payload.summary.outputs).toBeGreaterThanOrEqual(2);
    const outputPaths = ledger.payload.items.map((item: { outputPath?: string }) => item.outputPath);
    expect(outputPaths).toContain(preview.payload.evidence.outputPath);
    expect(outputPaths).toContain(receipt.payload.evidence.outputPath);
    expect(ledger.payload.items.every((item: { desk?: string }) => item.desk === "sui")).toBe(true);

    const walletLedger = await jsonFetch(base, "/workspace/ws_backend/data-ledger?kind=wallet&limit=20");
    expect(walletLedger.response.status).toBe(200);
    expect(walletLedger.payload.summary.wallets).toBe(2);
    expect(walletLedger.payload.items.every((item: { kind: string }) => item.kind === "wallet")).toBe(true);
    expect(walletLedger.payload.items.map((item: { title: string }) => item.title)).toEqual(
      expect.arrayContaining(["Sui preview saved", "Sui receipt saved"]),
    );
    expect(walletLedger.payload.items.every((item: { href?: string }) => item.href === "/workspace/ws_backend/settings/wallet")).toBe(true);

    const serializedItems = JSON.stringify(ledger.payload.items);
    expect(serializedItems).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|raw signature|signed payload/i);
    const serialized = JSON.stringify(ledger.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("workspace wallet safety events are write-guarded and exported through the project ledger", async () => {
    const { base } = await boot();

    const event = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "chain_mismatch",
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000001",
        valueUSD: 12.345,
        riskLevel: "high",
        reason: "Blocked because the connected wallet was on Base mainnet.",
        sessionId: "ses_wallet_safety",
        review: {
          reviewed: {
            chainId: 84532,
            to: "0x0000000000000000000000000000000000000001",
            value: "1000000000000000",
            valueUSD: 12.345,
            dataSelector: "0xa9059cbb",
            displayValue: "0.001 ETH (~$12.35)",
            proposedBy: "wallet_test",
          },
          submitted: null,
        },
      }),
    });
    expect(event.response.status).toBe(200);
    expect(event.payload).toMatchObject({
      success: true,
      event: {
        safetyAction: "chain_mismatch",
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000001",
        valueUSD: 12.35,
        riskLevel: "high",
        review: {
          reviewed: {
            chainId: 84532,
            valueUSD: 12.35,
            dataSelector: "0xa9059cbb",
            proposedBy: "wallet_test",
          },
          submitted: null,
        },
      },
    });

    const ledger = await jsonFetch(base, "/workspace/ws_backend/data-ledger?kind=wallet&limit=20");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.summary.wallets).toBeGreaterThanOrEqual(1);
    expect(ledger.payload.items).toContainEqual(expect.objectContaining({
      kind: "wallet",
      source: "audit",
      title: "Wallet chain mismatch blocked",
      summary: "Blocked because the connected wallet was on Base mainnet.",
      eventType: "workspace.wallet.safety_event",
      href: "/workspace/ws_backend/settings/wallet",
      metadata: expect.objectContaining({
        safetyAction: "chain_mismatch",
        chainId: 84532,
        riskLevel: "high",
        valueUSD: 12.35,
        reviewedChainId: 84532,
        reviewedValueUSD: 12.35,
        reviewedDataSelector: "0xa9059cbb",
        reviewedProposedBy: "wallet_test",
        submittedChainId: null,
      }),
    }));

    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Wallet safety viewer" }),
    });
    expect(viewer.response.status).toBe(201);
    const viewerWrite = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "tx_rejected",
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000001",
        reason: "Viewer attempted write.",
      }),
    }, viewer.payload.token);
    expect(viewerWrite.response.status).toBe(403);

    const secret = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "tx_rejected",
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000001",
        reason: "Use this seed phrase to sign: never never never.",
      }),
    });
    expect(secret.response.status).toBe(400);
    expect(secret.payload.code).toBe("wallet_safety_secret_rejected");

    const readOnly = await boot({ readOnly: true });
    const blocked = await jsonFetch(readOnly.base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "tx_rejected",
        chainId: 84532,
        to: "0x0000000000000000000000000000000000000001",
        reason: "Read-only attempted write.",
      }),
    });
    expect(blocked.response.status).toBe(403);
  });

  test("workspace wallet safety events reject mismatched reviewed and submitted receipt details", async () => {
    const { base } = await boot();
    const reviewedTo = "0x0000000000000000000000000000000000000001";
    const otherTo = "0x0000000000000000000000000000000000000002";
    const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const approvedWithoutSubmitted = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "tx_approved",
        chainId: 84532,
        to: reviewedTo,
        valueUSD: 12.35,
        riskLevel: "medium",
        reason: "Approved without a submitted receipt.",
        txHash,
        review: {
          reviewed: {
            chainId: 84532,
            to: reviewedTo,
            value: "1000000000000000",
            valueUSD: 12.35,
            dataSelector: null,
            displayValue: "0.001 ETH",
            proposedBy: "wallet_test",
          },
          submitted: null,
        },
      }),
    });
    expect(approvedWithoutSubmitted.response.status).toBe(400);
    expect(approvedWithoutSubmitted.payload.code).toBe("wallet_safety_review_mismatch");

    const submittedMismatch = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "tx_approved",
        chainId: 84532,
        to: reviewedTo,
        valueUSD: 12.35,
        riskLevel: "medium",
        reason: "Approved with mismatched submitted receipt.",
        txHash,
        review: {
          reviewed: {
            chainId: 84532,
            to: reviewedTo,
            value: "1000000000000000",
            valueUSD: 12.35,
            dataSelector: "0xa9059cbb",
            displayValue: "0.001 ETH",
            proposedBy: "wallet_test",
          },
          submitted: {
            chainId: 84532,
            to: otherTo,
            value: "1000000000000000",
            dataSelector: "0xa9059cbb",
            txHash,
          },
        },
      }),
    });
    expect(submittedMismatch.response.status).toBe(400);
    expect(submittedMismatch.payload.code).toBe("wallet_safety_review_mismatch");

    const blockedWithSubmitted = await jsonFetch(base, "/workspace/ws_backend/wallet/safety-events", {
      method: "POST",
      body: JSON.stringify({
        action: "chain_mismatch",
        chainId: 84532,
        to: reviewedTo,
        valueUSD: 12.35,
        riskLevel: "high",
        reason: "Blocked but attempted to include submitted details.",
        review: {
          reviewed: {
            chainId: 84532,
            to: reviewedTo,
            value: "1000000000000000",
            valueUSD: 12.35,
            dataSelector: null,
            displayValue: "0.001 ETH",
            proposedBy: "wallet_test",
          },
          submitted: {
            chainId: 84532,
            to: reviewedTo,
            value: "1000000000000000",
            dataSelector: null,
            txHash,
          },
        },
      }),
    });
    expect(blockedWithSubmitted.response.status).toBe(400);
    expect(blockedWithSubmitted.payload.code).toBe("wallet_safety_review_mismatch");
  });

  test("GET /workspace/:id/backend/data-map returns sanitized storage locations", async () => {
    const { base, dir } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/data-map");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.data-map.v1");
    expect(result.payload.workspace.id).toBe("ws_backend");
    expect(result.payload.stores.notes.scope).toBe("workspace");
    expect(result.payload.stores.notes.paths).toContain(join(dir, "notes"));
    expect(result.payload.stores.memory.scope).toBe("workspace");
    expect(result.payload.stores.memory.paths[0]).toBe(join(dir, ".matterhorn-work", "memory"));
    expect(result.payload.stores.memory.details.workspaceNamespaceTag).toBe("workspace:ws_backend");
    expect(result.payload.stores.memory.details.workspaceRoutes).toContain("/workspace/ws_backend/memory/capture");
    expect(result.payload.stores.memory.details.isolation).toBe("workspace_local_vault");
    expect(result.payload.stores.memory.details.globalFallbackPath).toBe(join(dir, "memory"));
    expect(result.payload.stores.chat.scope).toBe("opencode_runtime");
    expect(result.payload.stores.chat.details).toMatchObject({
      fullTranscriptExport: false,
      metadataLedgerExport: true,
      ledgerRoute: "/workspace/ws_backend/data-ledger?kind=chat",
      transcriptStore: "opencode_runtime",
    });
    expect(result.payload.stores.modelPreferences.scope).toBe("workspace");
    expect(result.payload.stores.modelPreferences.path).toBe(join(dir, ".matterhorn-work", "models", "selection.json"));
    expect(result.payload.stores.modelPreferences.containsSecrets).toBe("never");
    expect(result.payload.stores.billing.scope).toBe("workspace");
    expect(result.payload.stores.billing.path).toBe(join(dir, ".matterhorn-work", "billing", "subscription.json"));
    expect(result.payload.stores.billing.containsSecrets).toBe("never");
    expect(result.payload.stores.billing.retention).toBe("user_controlled");
    expect(result.payload.stores.billing.details.statusRoute).toBe("/workspace/ws_backend/billing/status");
    expect(result.payload.stores.billing.details.livePaymentsEnabled).toBe(false);
    expect(result.payload.stores.dataPolicy.scope).toBe("workspace");
    expect(result.payload.stores.dataPolicy.path).toBe(join(dir, ".matterhorn-work", "privacy", "data-policy.json"));
    expect(result.payload.stores.dataPolicy.containsSecrets).toBe("never");
    expect(result.payload.stores.dataPolicy.details.feedbackUse).toBe("eval_routing_product_quality_only");
    expect(result.payload.stores.outputs.path).toBe(join(dir, "outputs"));
    expect(result.payload.stores.feedback.scope).toBe("machine_global");
    expect(result.payload.stores.feedback.path).toBe(join(dir, "openwork-data", "feedback", "ws_backend.jsonl"));
    expect(result.payload.stores.feedback.containsSecrets).toBe("redacted");
    expect(result.payload.stores.feedback.retention).toBe("user_controlled");
    expect(result.payload.stores.feedback.deletable).toBe(true);
    expect(result.payload.policy.trainingUse).toBe("none_by_default");
    expect(result.payload.policy.feedbackUse).toBe("eval_routing_product_quality_only");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("OpenCode");
    expect(serialized).toContain("workspace engine store");
    expect(serialized).not.toMatch(/privateKey|seed phrase|mnemonic|wallet export/i);
  });

  test("GET /workspace/:id/backend/data-controls reports export and deletion controls without secrets", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/data-controls");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.data-controls.v1");
    expect(result.payload.workspace.id).toBe("ws_backend");
    expect(result.payload.summary.totalStores).toBeGreaterThanOrEqual(8);
    expect(result.payload.summary.appendOnlyStores).toBeGreaterThanOrEqual(3);
    expect(result.payload.stores.chat.export.actions).toContainEqual(expect.objectContaining({
      id: "chat.open-session",
      kind: "app_route",
      href: "/workspace/ws_backend/session",
    }));
    expect(result.payload.stores.chat.export.actions).toContainEqual(expect.objectContaining({
      id: "chat.ledger-metadata",
      kind: "api_route",
      method: "GET",
      href: "/workspace/ws_backend/data-ledger?kind=chat",
      description: expect.stringContaining("workspace engine store"),
    }));
    expect(result.payload.stores.notes.export.actions).toContainEqual(expect.objectContaining({
      id: "notes.open-app",
      kind: "app_route",
      href: "/workspace/ws_backend/session?panel=notes",
    }));
    expect(result.payload.stores.notes.export.actions).toContainEqual(expect.objectContaining({
      id: "notes.list",
      method: "GET",
      href: "/workspace/ws_backend/notes",
    }));
    expect(result.payload.stores.notes.deletion.actions[0]).toMatchObject({
      id: "notes.delete",
      method: "DELETE",
      destructive: true,
    });
    expect(result.payload.stores.memory.export.actions).toContainEqual(expect.objectContaining({
      id: "memory.open-review",
      kind: "app_route",
      href: "/workspace/ws_backend/session?panel=memory",
    }));
    expect(result.payload.stores.memory.export.actions).toContainEqual(expect.objectContaining({
      id: "memory.export",
      method: "POST",
      href: "/api/memory/export",
    }));
    expect(result.payload.stores.memory.export.actions).toContainEqual(expect.objectContaining({
      id: "memory.workspace-list",
      method: "GET",
      href: "/workspace/ws_backend/memory/entities",
    }));
    expect(result.payload.stores.memory.export.actions).toContainEqual(expect.objectContaining({
      id: "memory.workspace-export",
      method: "POST",
      href: "/workspace/ws_backend/memory/export",
    }));
    expect(result.payload.stores.memory.deletion.actions).toContainEqual(expect.objectContaining({
      id: "memory.workspace-delete",
      method: "DELETE",
      href: "/workspace/ws_backend/memory/entities/:memoryId",
      destructive: true,
    }));
    expect(result.payload.stores.outputs.deletion.status).toBe("working");
    expect(result.payload.stores.outputs.export.actions).toContainEqual(expect.objectContaining({
      id: "outputs.open-history",
      kind: "app_route",
      href: "/workspace/ws_backend/history?kind=output",
    }));
    expect(result.payload.stores.outputs.deletion.actions[0]).toMatchObject({
      id: "outputs.delete-file",
      method: "DELETE",
      href: "/workspace/ws_backend/outputs?path=:outputPath",
      destructive: true,
    });
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.open-history",
      kind: "app_route",
      href: "/workspace/ws_backend/history?kind=image",
    }));
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.history",
      method: "GET",
      href: "/workspace/ws_backend/generated-media/history",
    }));
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.images",
      method: "GET",
      href: "/workspace/ws_backend/images",
    }));
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.nft-drafts",
      method: "GET",
      href: "/workspace/ws_backend/nft-drafts",
    }));
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.image-ledger",
      method: "GET",
      href: "/workspace/ws_backend/data-ledger?kind=image",
    }));
    expect(result.payload.stores.imageOutputs.export.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.nft-ledger",
      method: "GET",
      href: "/workspace/ws_backend/data-ledger?kind=nft",
    }));
    expect(result.payload.stores.imageOutputs.deletion.status).toBe("working");
    expect(result.payload.stores.imageOutputs.deletion.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.delete-image",
      method: "DELETE",
      href: "/workspace/ws_backend/images/:imageId",
      destructive: true,
    }));
    expect(result.payload.stores.imageOutputs.deletion.actions).toContainEqual(expect.objectContaining({
      id: "generated-media.delete-nft-draft",
      method: "DELETE",
      href: "/workspace/ws_backend/nft-drafts/:draftId",
      destructive: true,
    }));
    expect(result.payload.stores.modelPreferences.export.actions).toContainEqual(expect.objectContaining({
      id: "model-preference.open-settings",
      kind: "app_route",
      href: "/workspace/ws_backend/settings/ai",
    }));
    expect(result.payload.stores.modelPreferences.export.actions).toContainEqual(expect.objectContaining({
      id: "model-preference.read",
      method: "GET",
      href: "/workspace/ws_backend/backend/model-selection",
    }));
    expect(result.payload.stores.modelPreferences.deletion.actions[0]).toMatchObject({
      id: "model-preference.clear",
      method: "DELETE",
      destructive: true,
    });
    expect(result.payload.stores.billing.export.actions).toContainEqual(expect.objectContaining({
      id: "billing.open-settings",
      kind: "app_route",
      href: "/workspace/ws_backend/settings/billing",
    }));
    expect(result.payload.stores.billing.export.actions).toContainEqual(expect.objectContaining({
      id: "billing.status",
      method: "GET",
      href: "/workspace/ws_backend/billing/status",
    }));
    expect(result.payload.stores.billing.deletion.status).toBe("working");
    expect(result.payload.stores.billing.deletion.actions[0]).toMatchObject({
      id: "billing.clear-subscription",
      method: "DELETE",
      href: "/workspace/ws_backend/billing/subscription",
      destructive: true,
    });
    expect(result.payload.stores.dataPolicy.export.actions).toContainEqual(expect.objectContaining({
      id: "data-policy.open-settings",
      kind: "app_route",
      href: "/workspace/ws_backend/settings/overview#data-policy",
    }));
    expect(result.payload.stores.dataPolicy.export.actions).toContainEqual(expect.objectContaining({
      id: "data-policy.read",
      method: "GET",
      href: "/workspace/ws_backend/backend/data-policy",
    }));
    expect(result.payload.stores.dataPolicy.deletion.actions[0]).toMatchObject({
      id: "data-policy.reset-feedback",
      method: "PATCH",
      href: "/workspace/ws_backend/backend/data-policy",
    });
    expect(result.payload.stores.feedback.retention.mode).toBe("user_controlled");
    expect(result.payload.stores.feedback.deletion.status).toBe("working");
    expect(result.payload.stores.feedback.export.actions).toContainEqual(expect.objectContaining({
      id: "feedback.open-review",
      kind: "app_route",
      href: "/workspace/ws_backend/settings/overview#feedback",
    }));
    expect(result.payload.stores.feedback.deletion.actions[0]).toMatchObject({
      id: "feedback.delete",
      method: "DELETE",
      destructive: true,
    });
    expect(result.payload.stores.walletEvidence.export.status).toBe("working");
    expect(result.payload.stores.walletEvidence.export.actions).toContainEqual(expect.objectContaining({
      id: "wallet-evidence.open-wallet",
      kind: "app_route",
      href: "/workspace/ws_backend/settings/wallet",
    }));
    expect(result.payload.stores.walletEvidence.export.actions).toContainEqual(expect.objectContaining({
      id: "wallet-evidence.ledger",
      method: "GET",
      href: "/workspace/ws_backend/data-ledger?kind=wallet",
    }));
    expect(result.payload.stores.walletEvidence.deletion.status).toBe("unsupported");
    expect(result.payload.stores.audit.retention.mode).toBe("append_only");
    expect(result.payload.stores.audit.export.actions).toContainEqual(expect.objectContaining({
      id: "audit.open-history",
      kind: "app_route",
      href: "/workspace/ws_backend/history?kind=audit",
    }));
    expect(result.payload.stores.taskEvents.export.actions).toContainEqual(expect.objectContaining({
      id: "taskEvents.open-history",
      kind: "app_route",
      href: "/workspace/ws_backend/history?kind=task",
    }));
    expect(result.payload.stores.workflowRuns.export.actions).toContainEqual(expect.objectContaining({
      id: "workflowRuns.open-history",
      kind: "app_route",
      href: "/workspace/ws_backend/history?kind=task",
    }));
    expect(result.payload.policy.retention.mode).toBe("accountability_default");
    expect(result.payload.policy.retention.stores).toEqual(["securityReceipts"]);
    expect(result.payload.policy.retention.exportRoute).toBe("/workspace/ws_backend/agent-run-receipts");
    expect(result.payload.policy.retention.windowDays).toBe(365);
    expect(result.payload.policy.retention.purgeSupported).toBe(true);
    expect(result.payload.policy.trainingUse).toBe("none_by_default");
    expect(result.payload.policy.feedbackUse).toBe("eval_routing_product_quality_only");
    expect(result.payload.policy.limitations.join(" ")).toContain("Legacy audit, task event, and workflow run files remain outside the 365-day security-receipt window");
    expect(JSON.stringify(result.payload)).not.toContain("local build");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toMatch(/privateKey|seed phrase|mnemonic|wallet export|bearer token/i);
  });

  test("workspace data policy persists feedback preference, blocks feedback writes, and audits updates", async () => {
    const { base, dir } = await boot();

    const initial = await jsonFetch(base, "/workspace/ws_backend/backend/data-policy");
    expect(initial.response.status).toBe(200);
    expect(initial.payload.policy).toMatchObject({
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
      secretsReturned: false,
    });
    expect(initial.payload.policy.appendOnlyRetention).toMatchObject({
      mode: "accountability_default",
      stores: ["securityReceipts"],
      exportRoute: "/workspace/ws_backend/agent-run-receipts",
      summary: expect.stringContaining("Minimal guarded-agent security receipts"),
      windowDays: 365,
      windowLabel: "Automatically expires after 365 days",
      purgeSupported: true,
      configurable: false,
    });
    expect(JSON.stringify(initial.payload)).not.toContain("local build");
    expect(initial.payload.controls.modelTraining).toMatchObject({
      status: "unsupported",
      configurable: false,
      rlTraining: false,
    });
    expect(initial.payload.controls.feedback.enabled).toBe(true);
    expect(initial.payload.controls.retention).toMatchObject({
      status: "working",
      mode: "accountability_default",
      purgeSupported: true,
    });
    expect(initial.payload.storage.path).toBe(join(dir, ".matterhorn-work", "privacy", "data-policy.json"));

    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Policy viewer" }),
    });
    const deniedViewer = await jsonFetch(base, "/workspace/ws_backend/backend/data-policy", {
      method: "PATCH",
      body: JSON.stringify({ feedbackUse: "disabled" }),
    }, viewer.payload.token);
    expect(deniedViewer.response.status).toBe(403);

    const invalid = await jsonFetch(base, "/workspace/ws_backend/backend/data-policy", {
      method: "PATCH",
      body: JSON.stringify({ feedbackUse: "model_training" }),
    });
    expect(invalid.response.status).toBe(400);

    const disabled = await jsonFetch(base, "/workspace/ws_backend/backend/data-policy", {
      method: "PATCH",
      body: JSON.stringify({ feedbackUse: "disabled" }),
    });
    expect(disabled.response.status).toBe(200);
    expect(disabled.payload.policy.feedbackUse).toBe("disabled");
    expect(disabled.payload.controls.feedback.enabled).toBe(false);
    expect(disabled.payload.storage.exists).toBe(true);
    expect(existsSync(join(dir, ".matterhorn-work", "privacy", "data-policy.json"))).toBe(true);

    const blockedFeedback = await jsonFetch(base, "/workspace/ws_backend/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "comment", comment: "Should not be saved while disabled." }),
    });
    expect(blockedFeedback.response.status).toBe(403);
    expect(blockedFeedback.payload.code).toBe("feedback_disabled");

    const dataMap = await jsonFetch(base, "/workspace/ws_backend/backend/data-map");
    expect(dataMap.payload.policy.feedbackUse).toBe("disabled");
    expect(dataMap.payload.policy.retention.mode).toBe("accountability_default");
    expect(dataMap.payload.stores.dataPolicy.details.feedbackUse).toBe("disabled");
    const controls = await jsonFetch(base, "/workspace/ws_backend/backend/data-controls");
    expect(controls.payload.policy.feedbackUse).toBe("disabled");
    expect(controls.payload.policy.retention.exportRoute).toBe("/workspace/ws_backend/agent-run-receipts");
    expect(controls.payload.stores.feedback.privacy.trainingUse).toBe("disabled");
    const controlPlane = await jsonFetch(base, "/workspace/ws_backend/backend/control-plane");
    expect(controlPlane.payload.privacy.feedbackUse).toBe("disabled");
    expect(controlPlane.payload.privacy.feedbackCollectionEnabled).toBe(false);
    const ledger = await jsonFetch(base, "/workspace/ws_backend/data-ledger?source=feedback");
    expect(ledger.payload.policy.feedbackUse).toBe("disabled");

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=10");
    expect(audit.payload.items).toContainEqual(expect.objectContaining({
      action: "workspace.data_policy.update",
      target: join(dir, ".matterhorn-work", "privacy", "data-policy.json"),
    }));

    const readOnly = await boot({ readOnly: true });
    const deniedReadOnly = await jsonFetch(readOnly.base, "/workspace/ws_backend/backend/data-policy", {
      method: "PATCH",
      body: JSON.stringify({ feedbackUse: "disabled" }),
    });
    expect(deniedReadOnly.response.status).toBe(403);
  }, 15_000);

  test("workspace output delete removes one safe output file and audits the action", async () => {
    const { base, dir } = await boot();
    const outputDir = join(dir, "outputs", "bittensor", "session-a");
    mkdirSync(outputDir, { recursive: true });
    const outputFile = join(outputDir, "report.md");
    writeFileSync(outputFile, "# Report\n", "utf8");

    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Output viewer" }),
    });
    const deniedViewer = await jsonFetch(base, "/workspace/ws_backend/outputs?path=outputs/bittensor/session-a/report.md", {
      method: "DELETE",
    }, viewer.payload.token);
    expect(deniedViewer.response.status).toBe(403);

    const deniedOutside = await jsonFetch(base, "/workspace/ws_backend/outputs?path=notes/index.json", {
      method: "DELETE",
    });
    expect(deniedOutside.response.status).toBe(400);

    const deniedDirectory = await jsonFetch(base, "/workspace/ws_backend/outputs?path=outputs/bittensor/session-a", {
      method: "DELETE",
    });
    expect(deniedDirectory.response.status).toBe(400);

    const deleted = await jsonFetch(base, "/workspace/ws_backend/outputs?path=outputs/bittensor/session-a/report.md", {
      method: "DELETE",
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload).toMatchObject({
      success: true,
      deleted: {
        path: "outputs/bittensor/session-a/report.md",
      },
    });
    expect(existsSync(outputFile)).toBe(false);

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=10");
    expect(audit.payload.items).toContainEqual(expect.objectContaining({
      action: "workspace.output.delete",
      target: "outputs/bittensor/session-a/report.md",
    }));
    const ledger = await jsonFetch(base, "/workspace/ws_backend/data-ledger?kind=output&limit=10");
    expect(ledger.payload.items).toContainEqual(expect.objectContaining({
      title: "Output deleted",
      outputPath: "outputs/bittensor/session-a/report.md",
      eventType: "workspace.output.delete",
    }));
    const evidence = await jsonFetch(base, "/workspace/ws_backend/evidence?source=task_events&limit=10");
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "task.output_deleted",
      title: "Output deleted",
      outputPath: "outputs/bittensor/session-a/report.md",
    }));
    expect(evidence.payload.summary.outputs).toBe(0);

    const readOnly = await boot({ readOnly: true });
    const deniedReadOnly = await jsonFetch(readOnly.base, "/workspace/ws_backend/outputs?path=outputs/bittensor/session-a/report.md", {
      method: "DELETE",
    });
    expect(deniedReadOnly.response.status).toBe(403);
  }, 15_000);

  test("memory write routes require collaborator scope and audit successful writes", async () => {
    const { base } = await boot();
    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only tester" }),
    });
    expect(viewer.response.status).toBe(201);

    const denied = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record({ id: "mem_backend_denied" }) }),
    }, viewer.payload.token);
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("forbidden");

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record() }),
    });
    expect(captured.response.status).toBe(200);
    expect(captured.payload.success).toBe(true);

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=5");
    expect(audit.response.status).toBe(200);
    expect(audit.payload.items.map((item: { action: string }) => item.action)).toContain("memory.capture");
  });

  test("owner-confirmed workspace purge removes user content but retains minimal security records", async () => {
    const opencode = await startSessionPurgeServer();
    const { base, dir } = await boot({ opencodeBaseUrl: opencode.url });
    const owner = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "owner", label: "Workspace purge owner" }),
    });
    expect(owner.response.status).toBe(201);
    const outputFile = join(dir, "outputs", "bittensor", "private-report.md");
    mkdirSync(join(dir, "outputs", "bittensor"), { recursive: true });
    writeFileSync(outputFile, "private output content", "utf8");

    const note = await jsonFetch(base, "/workspace/ws_backend/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Private note", body: "private note content" }),
    });
    expect(note.response.status).toBe(201);
    const memory = await jsonFetch(base, "/workspace/ws_backend/memory/capture", {
      method: "POST",
      body: JSON.stringify({ record: record({ id: "mem_workspace_purge" }) }),
    });
    expect(memory.response.status).toBe(201);

    const unconfirmed = await jsonFetch(base, "/workspace/ws_backend/user-content/purge", {
      method: "POST",
      body: JSON.stringify({ confirm: "purge:wrong-workspace" }),
    }, owner.payload.token);
    expect(unconfirmed.response.status).toBe(400);
    expect(existsSync(outputFile)).toBe(true);

    const purged = await jsonFetch(base, "/workspace/ws_backend/user-content/purge", {
      method: "POST",
      body: JSON.stringify({ confirm: "purge:ws_backend" }),
    }, owner.payload.token);
    expect(purged.response.status).toBe(200);
    expect(purged.payload).toMatchObject({
      success: true,
      deleted: { chats: 1, memoryRecords: 1 },
      retained: { store: "securityReceipts", containsRawUserContent: false, windowDays: 365 },
    });
    expect(opencode.deleted).toEqual(["ses_purge_1"]);
    expect(existsSync(join(dir, "outputs"))).toBe(false);
    expect(existsSync(join(dir, "notes"))).toBe(false);
    expect(existsSync(join(dir, ".matterhorn-work", "memory"))).toBe(false);
    expect(existsSync(join(dir, "openwork-data", "security-receipts", "ws_backend", "legacy"))).toBe(true);
  });

  test("memory writes are blocked when the server is read-only", async () => {
    const { base } = await boot({ readOnly: true });

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record({ id: "mem_backend_read_only" }) }),
    });
    expect(captured.response.status).toBe(403);
    expect(captured.payload.code).toBe("read_only");
  });
});
