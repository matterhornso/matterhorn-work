import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
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
  opencodeDb: process.env.OPENCODE_DB,
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

async function boot(options: { readOnly?: boolean; opencodeBaseUrl?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-backend-control-plane-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
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
  restoreEnv("opencodeDb", "OPENCODE_DB");
});

describe("backend control plane routes", () => {
  test("GET /api/backend/capabilities reports truthful backend status without secrets", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.capabilities.v1");
    expect(result.payload.models.defaultModel).toEqual({ providerId: "opencode", modelId: "big-pickle" });
    expect(result.payload.models.providerListSource).toBe("opencode");
    expect(result.payload.models.routing.answerPath).toBe("opencode_session_prompt_async");
    expect(result.payload.models.routing.modelListTool).toBe("opencode_provider_list");
    expect(result.payload.models.routing.userSelectable).toBe(true);
    expect(result.payload.memory.scope).toBe("machine_global");
    expect(result.payload.wallets.families.evm.status).toBe("working");
    expect(result.payload.wallets.families.bittensor.signing).toBe("external_signer");
    expect(result.payload.wallets.families.sui.status).toBe("preview");
    expect(result.payload.wallets.families.sui.directConnect).toBe(true);
    expect(result.payload.wallets.families.sui.signing).toBe("client_wallet");
    expect(result.payload.wallets.families.sui.details.recommendedPackages).toContain("@mysten/dapp-kit-react");
    expect(result.payload.wallets.families.sui.details.publicReadRoutes).toContain("/api/sui/account/:address");
    expect(result.payload.wallets.families.sui.details.publicReadRoutes).toContain("/api/sui/balance/:address");
    expect(result.payload.wallets.families.sui.details.transactionPreviewRoutes).toContain("/api/sui/transactions/preview");
    expect(result.payload.wallets.families.sui.details.receiptRoutes).toContain("/api/sui/transactions/receipt");
    expect(result.payload.wallets.families.sui.actions[0].href).toBe("https://sdk.mystenlabs.com/dapp-kit/getting-started/react");
    expect(result.payload.security.cors.status).toBe("needs_setup");
    expect(result.payload.security.memoryWriteGuards.status).toBe("working");
    expect(result.payload.settings.map((section: { section: string }) => section.section)).toContain("wallet");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Sui is not implemented yet");
  });

  test("GET /api/backend/models reports the agent answer and model-selection contract", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/models");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.models.v1");
    expect(result.payload.defaultModel).toMatchObject({
      providerId: "opencode",
      modelId: "big-pickle",
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
      sampleModels: ["claude-3-haiku", "claude-3-opus", "claude-3-sonnet"],
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toContain("Basic ");
  });

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
    expect(result.payload.checks.workspace_writable.status).toBe("working");
    expect(result.payload.features.start_chat.ready).toBe(false);
    expect(result.payload.features.start_desk_task.blockingCheckIds).toContain("opencode_connection");
    expect(result.payload.features.save_notes.ready).toBe(true);
    expect(result.payload.features.review_memory.ready).toBe(true);
    expect(result.payload.features.save_memory.ready).toBe(true);
    expect(result.payload.features.export_evidence.ready).toBe(true);
    expect(result.payload.summary.blockingChecks).toContain("opencode_connection");

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
    expect(result.payload.policy.secretsReturned).toBe(false);
    expect(result.payload.policy.hostProtected).toBe(true);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(createdViewer.payload.token);
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

  test("Sui transaction preview route returns a non-submittable wallet handoff", async () => {
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
      canSubmit: false,
      custody: false,
      liveSubmissionEnabled: false,
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

  test("GET /workspace/:id/backend/data-map returns sanitized storage locations", async () => {
    const { base, dir } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/data-map");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.data-map.v1");
    expect(result.payload.workspace.id).toBe("ws_backend");
    expect(result.payload.stores.notes.scope).toBe("workspace");
    expect(result.payload.stores.notes.paths).toContain(join(dir, "notes"));
    expect(result.payload.stores.memory.scope).toBe("machine_global");
    expect(result.payload.stores.memory.paths[0]).toBe(join(dir, "memory"));
    expect(result.payload.stores.chat.scope).toBe("opencode_runtime");
    expect(result.payload.stores.outputs.path).toBe(join(dir, "outputs"));
    expect(result.payload.stores.feedback.scope).toBe("machine_global");
    expect(result.payload.stores.feedback.path).toBe(join(dir, "openwork-data", "feedback", "ws_backend.jsonl"));
    expect(result.payload.stores.feedback.containsSecrets).toBe("redacted");
    expect(result.payload.policy.trainingUse).toBe("none_by_default");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
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
    expect(result.payload.stores.notes.export.actions[0]).toMatchObject({
      id: "notes.list",
      method: "GET",
      href: "/workspace/ws_backend/notes",
    });
    expect(result.payload.stores.notes.deletion.actions[0]).toMatchObject({
      id: "notes.delete",
      method: "DELETE",
      destructive: true,
    });
    expect(result.payload.stores.memory.export.actions[0]).toMatchObject({
      id: "memory.export",
      method: "POST",
      href: "/api/memory/export",
    });
    expect(result.payload.stores.feedback.deletion.status).toBe("unsupported");
    expect(result.payload.stores.audit.retention.mode).toBe("append_only");
    expect(result.payload.policy.trainingUse).toBe("none_by_default");
    expect(result.payload.policy.limitations.join(" ")).toContain("No bulk delete-all workspace control");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toMatch(/privateKey|seed phrase|mnemonic|wallet export|bearer token/i);
  });

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
