import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const TOKEN = "test-token";
const HOST_TOKEN = "test-host-token";
const WORKSPACE_ID = "ws_test";

let priorEnv: Record<string, string | undefined> = {};
const stops: Array<() => Promise<void> | void> = [];
const dirs: string[] = [];

function baseConfig(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 5000 },
    corsOrigins: [],
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: "Test Workspace",
        path: root,
        preset: "starter",
        workspaceType: "local",
      },
    ],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "json",
    logRequests: false,
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = (server.port as number) ?? 0;
    server.stop();
    resolve(port);
  });
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-image-"));
  process.env.OPENWORK_DATA_DIR = join(dir, ".openwork-test");
  dirs.push(dir);
  const port = await getFreePort();
  const server = await startServer(baseConfig(port, dir));
  stops.push(() => server.stop());
  return { base: `http://127.0.0.1:${port}`, dir };
}

async function jsonFetch(base: string, path: string, init?: RequestInit, token?: string) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function textFetch(base: string, path: string, init?: RequestInit, token?: string) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? TOKEN}`,
      ...init?.headers,
    },
  });
  return { response, text: await response.text() };
}

function bootWalrusPublisher(payload: unknown, options?: { status?: number; delayMs?: number }) {
  const calls: Array<{
    method: string;
    url: string;
    contentType: string | null;
    authorization: string | null;
    byteLength: number;
  }> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const bytes = new Uint8Array(await request.arrayBuffer());
      calls.push({
        method: request.method,
        url: request.url,
        contentType: request.headers.get("content-type"),
        authorization: request.headers.get("authorization"),
        byteLength: bytes.byteLength,
      });
      if (options?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      return Response.json(payload, { status: options?.status ?? 200 });
    },
  });
  stops.push(() => server.stop());
  return { url: `http://127.0.0.1:${server.port}`, calls };
}

function previousPeriodIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)).toISOString();
}

function testImage(id: string, createdAt: string): MatterhornGeneratedImage {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    outputId: `out_${id}`,
    provider: "mock",
    model: "mock-image",
    prompt: `test image ${id}`,
    size: "1024x1024",
    quality: "auto",
    format: "png",
    fileName: `${id}.png`,
    relativePath: `.matterhorn-work/outputs/images/${id}.png`,
    contentType: "image/png",
    byteLength: 12,
    sha256: "0".repeat(64),
    createdAt,
    status: "generated",
    safety: { secretsRejected: false },
  };
}

function bootWalrusDiagnosticEndpoint() {
  const calls: Array<{
    method: string;
    url: string;
    byteLength: number;
    authorization: string | null;
  }> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const bytes = new Uint8Array(await request.arrayBuffer());
      calls.push({
        method: request.method,
        url: request.url,
        byteLength: bytes.byteLength,
        authorization: request.headers.get("authorization"),
      });
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method === "HEAD") return new Response(null, { status: 404 });
      return Response.json({ ok: true });
    },
  });
  stops.push(() => server.stop());
  return { url: `http://127.0.0.1:${server.port}`, calls };
}

beforeEach(() => {
  priorEnv = {
    MATTERHORN_IMAGE_PROVIDER: process.env.MATTERHORN_IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    MATTERHORN_WALRUS_PUBLISHER_URL: process.env.MATTERHORN_WALRUS_PUBLISHER_URL,
    MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN: process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN,
    MATTERHORN_WALRUS_RELAY_URL: process.env.MATTERHORN_WALRUS_RELAY_URL,
    MATTERHORN_WALRUS_STORAGE_EPOCHS: process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS,
    MATTERHORN_SUI_NETWORK: process.env.MATTERHORN_SUI_NETWORK,
    MATTERHORN_SUI_NFT_PACKAGE_ID: process.env.MATTERHORN_SUI_NFT_PACKAGE_ID,
    MATTERHORN_SUI_NFT_MODULE_NAME: process.env.MATTERHORN_SUI_NFT_MODULE_NAME,
    MATTERHORN_SUI_NFT_TYPE: process.env.MATTERHORN_SUI_NFT_TYPE,
    MATTERHORN_SUI_KIOSK_PACKAGE_ID: process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID,
    MATTERHORN_SUI_KIOSK_ID: process.env.MATTERHORN_SUI_KIOSK_ID,
    MATTERHORN_SUI_KIOSK_OWNER_CAP_ID: process.env.MATTERHORN_SUI_KIOSK_OWNER_CAP_ID,
    MATTERHORN_SUI_TRANSFER_POLICY_ID: process.env.MATTERHORN_SUI_TRANSFER_POLICY_ID,
    MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID,
    MATTERHORN_BILLING_MODE: process.env.MATTERHORN_BILLING_MODE,
    MATTERHORN_BILLING_PROVIDER: process.env.MATTERHORN_BILLING_PROVIDER,
    MATTERHORN_BILLING_CURRENT_PLAN: process.env.MATTERHORN_BILLING_CURRENT_PLAN,
    OPENWORK_DATA_DIR: process.env.OPENWORK_DATA_DIR,
  };
  process.env.MATTERHORN_IMAGE_PROVIDER = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.MATTERHORN_WALRUS_PUBLISHER_URL;
  delete process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN;
  delete process.env.MATTERHORN_WALRUS_RELAY_URL;
  delete process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS;
  delete process.env.MATTERHORN_SUI_NETWORK;
  delete process.env.MATTERHORN_SUI_NFT_PACKAGE_ID;
  delete process.env.MATTERHORN_SUI_NFT_MODULE_NAME;
  delete process.env.MATTERHORN_SUI_NFT_TYPE;
  delete process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID;
  delete process.env.MATTERHORN_SUI_KIOSK_ID;
  delete process.env.MATTERHORN_SUI_KIOSK_OWNER_CAP_ID;
  delete process.env.MATTERHORN_SUI_TRANSFER_POLICY_ID;
  delete process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID;
  delete process.env.MATTERHORN_BILLING_MODE;
  delete process.env.MATTERHORN_BILLING_PROVIDER;
  delete process.env.MATTERHORN_BILLING_CURRENT_PLAN;
  delete process.env.OPENWORK_DATA_DIR;
});

afterEach(async () => {
  for (const stop of stops.reverse()) await stop();
  stops.length = 0;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Generated media routes", () => {
  test("GET /workspace/:id/generated-media/diagnostics reports safe setup warnings without writing", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/diagnostics`);

    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.status).toBe("warning");
    expect(result.payload.safety).toMatchObject({
      custody: false,
      canSubmit: false,
      publicWritesDuringDiagnostics: false,
      storesSecrets: false,
    });
    expect(result.payload.checks.map((check: { id: string }) => check.id)).toEqual([
      "image_provider",
      "walrus_storage",
      "sui_nft_minting",
      "sui_marketplace_listing",
      "non_custody_safety",
    ]);
    expect(result.payload.checks.find((check: { id: string }) => check.id === "image_provider")?.status).toBe("pass");
    expect(result.payload.checks.find((check: { id: string }) => check.id === "walrus_storage")?.status).toBe("warning");
    expect(result.payload.productionSmokePlan).toMatchObject({
      mode: "needs_setup",
      canRunEndToEnd: false,
      publicWritesOnlyAfterUserAction: true,
    });
    expect(result.payload.productionSmokePlan.stages.find((stage: { id: string }) => stage.id === "chat_image_generation")).toMatchObject({
      status: "ready",
      writeScope: "workspace_output",
      requiresPublicWrite: false,
    });
    expect(result.payload.productionSmokePlan.blockers.some((blocker: { envVar?: string }) => blocker.envVar === "OPENAI_API_KEY")).toBe(true);
  });

  test("GET /workspace/:id/generated-media/diagnostics checks fake Walrus and Sui config without upload", async () => {
    const walrus = bootWalrusDiagnosticEndpoint();
    process.env.MATTERHORN_IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-generated-media-diagnostics";
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN = "secret-smoke-token";
    process.env.MATTERHORN_WALRUS_RELAY_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "3";
    process.env.MATTERHORN_SUI_NETWORK = "sui-testnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = `0x${"1".repeat(64)}`;
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "matterhorn_nft";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = `0x${"2".repeat(64)}`;
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = `0x${"3".repeat(64)}`;

    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/diagnostics`);

    expect(result.response.status).toBe(200);
    expect(result.payload.status).toBe("pass");
    const checksById = Object.fromEntries(result.payload.checks.map((check: { id: string; status: string }) => [check.id, check.status]));
    expect(checksById).toMatchObject({
      image_provider: "pass",
      walrus_storage: "pass",
      sui_nft_minting: "pass",
      sui_marketplace_listing: "pass",
      non_custody_safety: "pass",
    });
    expect(result.payload.productionSmokePlan).toMatchObject({
      mode: "production_candidate",
      canRunEndToEnd: true,
      publicWritesOnlyAfterUserAction: true,
      blockers: [],
    });
    expect(result.payload.productionSmokePlan.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "walrus_public_upload", status: "manual", writeScope: "public_storage", requiresPublicWrite: true }),
      expect.objectContaining({ id: "sui_wallet_mint", status: "manual", writeScope: "wallet_signed_transaction", requiresWallet: true }),
      expect.objectContaining({ id: "sui_kiosk_listing", status: "manual", writeScope: "wallet_signed_transaction", requiresWallet: true }),
    ]));
    expect(walrus.calls.map((call) => call.method).sort()).toEqual(["HEAD", "OPTIONS"]);
    expect(walrus.calls.some((call) => call.method === "PUT")).toBe(false);
    expect(walrus.calls.every((call) => call.byteLength === 0)).toBe(true);
    expect(walrus.calls.find((call) => call.method === "OPTIONS")?.authorization).toBe("Bearer secret-smoke-token");
  });

  test("GET /workspace/:id/generated-media/diagnostics/report returns markdown without secret values or public writes", async () => {
    const walrus = bootWalrusDiagnosticEndpoint();
    process.env.MATTERHORN_IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-generated-media-report-secret";
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN = "secret-generated-media-report-token";
    process.env.MATTERHORN_WALRUS_RELAY_URL = walrus.url;
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "3";
    process.env.MATTERHORN_SUI_NETWORK = "sui-testnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = `0x${"1".repeat(64)}`;
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "matterhorn_nft";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = `0x${"2".repeat(64)}`;
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = `0x${"3".repeat(64)}`;

    const { base } = await boot();
    const result = await textFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/diagnostics/report`);

    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("content-type")).toContain("text/markdown");
    expect(result.response.headers.get("content-disposition")).toContain("matterhorn-generated-media-readiness-ws_test-");
    expect(result.text).toContain("# Matterhorn Generated Media Readiness");
    expect(result.text).toContain("No public writes were performed.");
    expect(result.text).toContain("## Production Stages");
    expect(result.text).toContain("Walrus storage");
    expect(result.text).toContain("Sign Sui mint transaction");
    expect(result.text).not.toContain("sk-test-generated-media-report-secret");
    expect(result.text).not.toContain("secret-generated-media-report-token");
    expect(result.text).not.toContain("Authorization");
    expect(result.text).not.toContain("Bearer");
    expect(walrus.calls.map((call) => call.method).sort()).toEqual(["HEAD", "OPTIONS"]);
    expect(walrus.calls.some((call) => call.method === "PUT" || call.method === "POST")).toBe(false);
    expect(walrus.calls.every((call) => call.byteLength === 0)).toBe(true);
  });

  test("GET /workspace/:id/generated-media/diagnostics fails invalid configured Sui ids", async () => {
    process.env.MATTERHORN_SUI_NETWORK = "sui-testnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "not-a-sui-object";

    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/diagnostics`);

    expect(result.response.status).toBe(200);
    expect(result.payload.status).toBe("fail");
    const mintCheck = result.payload.checks.find((check: { id: string }) => check.id === "sui_nft_minting");
    expect(mintCheck.status).toBe("fail");
    expect(mintCheck.summary).toContain("valid Sui object id");
  });

  test("POST /workspace/:id/images/generate creates a mock image", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a tiny robot" }),
    });
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.image.provider).toBe("mock");
    expect(result.payload.image.prompt).toBe("a tiny robot");
    expect(result.payload.image.relativePath).toMatch(/\.matterhorn-work\/outputs\/images\/img_/);
  });

  test("POST /workspace/:id/images/generate reports invalid provider setup as setup failure", async () => {
    process.env.MATTERHORN_IMAGE_PROVIDER = "not-a-provider";
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a tiny robot" }),
    });
    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("image_provider_invalid_config");
    expect(result.payload.message).toContain("MATTERHORN_IMAGE_PROVIDER");
  });

  test("GET /workspace/:id/images/:imageId/file returns renderable PNG bytes", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a tiny robot" }),
    });
    const imageId = generated.payload.image.id;
    const response = await fetch(`${base}/workspace/${WORKSPACE_ID}/images/${imageId}/file`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(100);
  });

  test("GET /workspace/:id/images lists generated images", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat" }),
    });
    expect(generated.response.status).toBe(200);
    const list = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images`);
    expect(list.response.status).toBe(200);
    expect(list.payload.images.length).toBe(1);
  });

  test("DELETE /workspace/:id/images/:imageId removes a local generated image", async () => {
    const { base, dir } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a tiny studio landscape" }),
    });
    const imageId = generated.payload.image.id;
    const imagePath = join(dir, generated.payload.image.relativePath);
    const metadataPath = join(dir, ".matterhorn-work", "outputs", "images", `${imageId}.metadata.json`);
    expect(existsSync(imagePath)).toBe(true);
    expect(existsSync(metadataPath)).toBe(true);

    const deleted = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}`, {
      method: "DELETE",
    });

    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.success).toBe(true);
    expect(deleted.payload.deleted.id).toBe(imageId);
    expect(existsSync(imagePath)).toBe(false);
    expect(existsSync(metadataPath)).toBe(false);
    const list = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images`);
    expect(list.payload.images).toHaveLength(0);
  });

  test("GET /workspace/:id/generated-media/history joins images with NFT draft state", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat in a mountain studio" }),
    });
    const imageId = generated.payload.image.id;
    const draftResult = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Mountain Cat" }),
    });
    expect(draftResult.response.status).toBe(200);

    const history = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/history`);

    expect(history.response.status).toBe(200);
    expect(history.payload.success).toBe(true);
    expect(history.payload.counts).toMatchObject({
      images: 1,
      drafts: 1,
      minted: 0,
      listed: 0,
    });
    expect(history.payload.items).toHaveLength(1);
    expect(history.payload.items[0]).toMatchObject({
      id: imageId,
      workspaceId: WORKSPACE_ID,
      status: "draft",
      image: {
        id: imageId,
        prompt: "a cat in a mountain studio",
      },
      latestDraft: {
        title: "Mountain Cat",
        status: "draft",
      },
    });
    expect(history.payload.items[0].drafts).toHaveLength(1);
  });

  test("POST /workspace/:id/images/:imageId/nft-draft creates a draft", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat" }),
    });
    const imageId = generated.payload.image.id;
    const draftResult = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Test NFT" }),
    });
    expect(draftResult.response.status).toBe(200);
    expect(draftResult.payload.draft.title).toBe("Test NFT");
    expect(draftResult.payload.draft.status).toBe("draft");
    expect(draftResult.payload.draft.storage.status).toBe("local_only");
  });

  test("DELETE NFT draft removes a local draft and unblocks image deletion", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a local NFT draft image" }),
    });
    const imageId = generated.payload.image.id;
    const draftResult = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Local draft" }),
    });
    const draftId = draftResult.payload.draft.id;

    const blockedImageDelete = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}`, {
      method: "DELETE",
    });
    expect(blockedImageDelete.response.status).toBe(409);
    expect(blockedImageDelete.payload.code).toBe("image_has_nft_drafts");

    const deletedDraft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draftId}`, {
      method: "DELETE",
    });
    expect(deletedDraft.response.status).toBe(200);
    expect(deletedDraft.payload.deleted.id).toBe(draftId);

    const drafts = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts`);
    expect(drafts.payload.drafts).toHaveLength(0);
    const deletedImage = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}`, {
      method: "DELETE",
    });
    expect(deletedImage.response.status).toBe(200);
  });

  test("DELETE refuses NFT drafts with public storage state", async () => {
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "max";
    const publisher = bootWalrusPublisher({
      newlyCreated: {
        blobObject: {
          id: "0xpublicblobobject",
          blobId: "blob_public_delete_guard",
          storage: { endEpoch: 42 },
        },
      },
    });
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = publisher.url;
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test/base";
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a public storage NFT draft image" }),
    });
    const imageId = generated.payload.image.id;
    const draftResult = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Public draft" }),
    });
    const draftId = draftResult.payload.draft.id;
    const uploaded = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draftId}/storage/upload`, {
      method: "POST",
    });
    expect(uploaded.response.status).toBe(200);

    const deletedDraft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draftId}`, {
      method: "DELETE",
    });
    expect(deletedDraft.response.status).toBe(409);
    expect(deletedDraft.payload.code).toBe("nft_draft_public_state_retained");
    expect(deletedDraft.payload.details.storageStatus).toBe("uploaded");

    const deletedImage = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}`, {
      method: "DELETE",
    });
    expect(deletedImage.response.status).toBe(409);
    expect(deletedImage.payload.details.publicDraftCount).toBe(1);
  });

  test("GET image list and history redact stale secret-shaped prompt metadata", async () => {
    const { base, dir } = await boot();
    const imageDir = join(dir, ".matterhorn-work", "outputs", "images");
    mkdirSync(imageDir, { recursive: true });
    writeFileSync(join(imageDir, "img_legacy_secret.metadata.json"), JSON.stringify({
      id: "img_legacy_secret",
      workspaceId: WORKSPACE_ID,
      outputId: "out_legacy_secret",
      provider: "mock",
      model: "mock-image-1",
      prompt: "make a poster with sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      size: "1024x1024",
      quality: "auto",
      format: "png",
      fileName: "img_legacy_secret.png",
      relativePath: ".matterhorn-work/outputs/images/img_legacy_secret.png",
      contentType: "image/png",
      byteLength: 100,
      sha256: "a".repeat(64),
      createdAt: "2026-07-07T00:00:00.000Z",
      status: "generated",
      safety: { secretsRejected: false },
    }, null, 2));

    const list = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images`);
    expect(list.response.status).toBe(200);
    expect(JSON.stringify(list.payload)).not.toContain("sk-proj-");
    expect(list.payload.images[0].prompt).toBe("[redacted: secret-shaped input detected]");
    expect(list.payload.images[0].promptRedacted).toBe(true);
    expect(list.payload.images[0].safety.secretsRejected).toBe(true);

    const history = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/history`);
    expect(history.response.status).toBe(200);
    expect(JSON.stringify(history.payload)).not.toContain("sk-proj-");
    expect(history.payload.items[0].image.prompt).toBe("[redacted: secret-shaped input detected]");
    expect(history.payload.items[0].image.promptRedacted).toBe(true);
  });

  test("GET NFT draft list detail and history redact stale secret-shaped metadata", async () => {
    const { base, dir } = await boot();
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const imageDir = join(dir, ".matterhorn-work", "outputs", "images");
    const draftDir = join(dir, ".matterhorn-work", "outputs", "nft-drafts");
    mkdirSync(imageDir, { recursive: true });
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(imageDir, "img_legacy_draft_secret.metadata.json"), JSON.stringify({
      id: "img_legacy_draft_secret",
      workspaceId: WORKSPACE_ID,
      outputId: "out_legacy_draft_secret",
      provider: "mock",
      model: "mock-image-1",
      prompt: "a safe image prompt",
      size: "1024x1024",
      quality: "auto",
      format: "png",
      fileName: "img_legacy_draft_secret.png",
      relativePath: ".matterhorn-work/outputs/images/img_legacy_draft_secret.png",
      contentType: "image/png",
      byteLength: 100,
      sha256: "b".repeat(64),
      createdAt: "2026-07-07T00:00:00.000Z",
      status: "generated",
      safety: { secretsRejected: false },
    }, null, 2));
    writeFileSync(join(draftDir, "nft_legacy_secret.json"), JSON.stringify({
      id: "nft_legacy_secret",
      workspaceId: WORKSPACE_ID,
      imageId: "img_legacy_draft_secret",
      status: "draft",
      title: `contains ${secret}`,
      description: "contains seed phrase material",
      creatorAddress: secret,
      network: "sui-testnet",
      metadata: {
        name: `name ${secret}`,
        description: "metadata includes seed phrase material",
        imageUrl: `https://example.test/${secret}`,
        attributes: [
          { trait_type: "private key", value: secret },
          { trait_type: "safe_number", value: 7 },
        ],
        license: `license ${secret}`,
        usageNote: "my seed phrase is abandon ability able",
      },
      storage: {
        provider: "local",
        status: "failed",
        error: `upload failed with ${secret}`,
      },
      mint: {
        status: "failed",
        error: "mint saw seed phrase material",
      },
      listing: {
        status: "failed",
        error: `listing saw ${secret}`,
      },
      privateKey: secret,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:01:00.000Z",
    }, null, 2));

    const list = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts`);
    expect(list.response.status).toBe(200);
    expect(JSON.stringify(list.payload)).not.toContain("sk-proj-");
    expect(JSON.stringify(list.payload)).not.toContain("seed phrase");
    expect(JSON.stringify(list.payload)).not.toContain("privateKey");
    expect(list.payload.drafts[0].title).toBe("[redacted: secret-shaped input detected]");
    expect(list.payload.drafts[0].metadata.attributes[0].value).toBe("[redacted: secret-shaped input detected]");
    expect(list.payload.drafts[0].storage.error).toBe("[redacted: secret-shaped input detected]");
    expect(list.payload.drafts[0].metadata.attributes[1].value).toBe(7);

    const detail = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/nft_legacy_secret`);
    expect(detail.response.status).toBe(200);
    expect(JSON.stringify(detail.payload)).not.toContain("sk-proj-");
    expect(JSON.stringify(detail.payload)).not.toContain("seed phrase");
    expect(detail.payload.draft.metadata.usageNote).toBe("[redacted: secret-shaped input detected]");

    const history = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/generated-media/history`);
    expect(history.response.status).toBe(200);
    expect(JSON.stringify(history.payload)).not.toContain("sk-proj-");
    expect(JSON.stringify(history.payload)).not.toContain("seed phrase");
    expect(history.payload.counts.drafts).toBe(1);
    expect(history.payload.items[0].latestDraft.title).toBe("[redacted: secret-shaped input detected]");
    expect(history.payload.items[0].drafts[0].metadata.name).toBe("[redacted: secret-shaped input detected]");
  });
});

describe("Generated media billing entitlements", () => {
  async function createDraft(base: string) {
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a billing-gated workspace image" }),
    });
    const imageId = generated.payload.image.id;
    const draft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Billing gated NFT", listingPriceMist: "1000" }),
    });
    return { image: generated.payload.image, draft: draft.payload.draft };
  }

  test("Free plan allows local image generation until the included allowance is reached", async () => {
    const { base } = await boot();

    for (let index = 0; index < 10; index += 1) {
      const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
        method: "POST",
        body: JSON.stringify({ prompt: `free allowance image ${index}` }),
      });
      expect(generated.response.status).toBe(200);
      expect(generated.payload.success).toBe(true);
    }

    const blocked = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "one image over the free allowance" }),
    });

    expect(blocked.response.status).toBe(429);
    expect(blocked.payload.code).toBe("billing_entitlement_limit_reached");
    expect(blocked.payload.details).toMatchObject({
      entitlementKey: "image_generation",
      currentPlanId: "free",
      used: 10,
      limit: 10,
      reason: "limit_reached",
    });
  });

  test("Free plan image allowance counts only the current billing period", async () => {
    const { base, dir } = await boot();
    const store = new MatterhornGeneratedImageStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID });
    for (let index = 0; index < 10; index += 1) {
      await store.save(testImage(`previous_period_${index}`, previousPeriodIso()));
    }

    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "first image in this billing period" }),
    });
    expect(generated.response.status).toBe(200);
    expect(generated.payload.success).toBe(true);

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.usage.generatedImages).toMatchObject({
      used: 1,
      limit: 10,
    });
    expect(status.payload.status.usage.generatedImages.resetsAt).toEqual(expect.any(String));
  });

  test("workspace checkout plan raises image allowance without changing global billing env", async () => {
    const { base } = await boot();

    for (let index = 0; index < 10; index += 1) {
      const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
        method: "POST",
        body: JSON.stringify({ prompt: `workspace checkout allowance image ${index}` }),
      });
      expect(generated.response.status).toBe(200);
    }

    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(checkout.response.status).toBe(200);

    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "allowed by workspace plus checkout" }),
    });
    expect(generated.response.status).toBe(200);
    expect(generated.payload.success).toBe(true);
  });

  test("Free plan keeps local NFT drafts but blocks public NFT and Walrus preparation", async () => {
    const publisher = bootWalrusPublisher({ newlyCreated: { blobObject: { blobId: "should_not_upload" } } });
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = publisher.url;
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0x1234";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base } = await boot();
    const { draft } = await createDraft(base);

    const storagePrepare = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });
    expect(storagePrepare.response.status).toBe(402);
    expect(storagePrepare.payload.code).toBe("billing_entitlement_required");
    expect(storagePrepare.payload.details).toMatchObject({
      entitlementKey: "walrus_storage",
      currentPlanId: "free",
      requiredPlanIds: ["max"],
      reason: "not_included",
    });

    const storageUpload = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/upload`, {
      method: "POST",
    });
    expect(storageUpload.response.status).toBe(402);
    expect(storageUpload.payload.details.entitlementKey).toBe("walrus_storage");
    expect(publisher.calls).toHaveLength(0);

    const mintPreview = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });
    expect(mintPreview.response.status).toBe(402);
    expect(mintPreview.payload.details).toMatchObject({
      entitlementKey: "nft_mint_preview",
      currentPlanId: "free",
      requiredPlanIds: ["plus", "max"],
      reason: "not_included",
    });

    const listingPreview = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        objectId: "0xabc",
        nftType: "0x1234::matterhorn_media::MatterhornNFT",
        kioskId: "0x4568",
        kioskOwnerCapId: "0x4569",
        transferPolicyId: "0x8911",
        priceMist: "1000",
      }),
    });
    expect(listingPreview.response.status).toBe(402);
    expect(listingPreview.payload.details).toMatchObject({
      entitlementKey: "nft_marketplace_listing",
      currentPlanId: "free",
      requiredPlanIds: ["max"],
      reason: "not_included",
    });
  });

  test("Plus plan allows mint preview checks but keeps Walrus and marketplace actions on Max", async () => {
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "plus";
    const { base } = await boot();
    const { draft } = await createDraft(base);

    const mintPreview = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });
    expect(mintPreview.response.status).toBe(503);
    expect(mintPreview.payload.code).toBe("sui_nft_package_needs_setup");

    const storagePrepare = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });
    expect(storagePrepare.response.status).toBe(402);
    expect(storagePrepare.payload.details).toMatchObject({
      entitlementKey: "walrus_storage",
      currentPlanId: "plus",
      requiredPlanIds: ["max"],
    });

    const listingPreview = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
    });
    expect(listingPreview.response.status).toBe(402);
    expect(listingPreview.payload.details).toMatchObject({
      entitlementKey: "nft_marketplace_listing",
      currentPlanId: "plus",
      requiredPlanIds: ["max"],
    });
  });

  test("workspace checkout Plus unlocks mint preview checks without global billing env", async () => {
    const { base } = await boot();
    const { draft } = await createDraft(base);

    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(checkout.response.status).toBe(200);

    const mintPreview = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });
    expect(mintPreview.response.status).toBe(503);
    expect(mintPreview.payload.code).toBe("sui_nft_package_needs_setup");

    const storagePrepare = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });
    expect(storagePrepare.response.status).toBe(402);
    expect(storagePrepare.payload.details).toMatchObject({
      entitlementKey: "walrus_storage",
      currentPlanId: "plus",
      requiredPlanIds: ["max"],
    });
  });
});

describe("Generated media Sui NFT setup previews", () => {
  beforeEach(() => {
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "max";
  });

  async function createDraft(base: string) {
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a mountain workspace" }),
    });
    const imageId = generated.payload.image.id;
    const draft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({ title: "Matterhorn NFT", listingPriceMist: "1000" }),
    });
    return draft.payload.draft;
  }

  test("storage prepare reports exact missing Walrus setup", async () => {
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("walrus_needs_setup");
    expect(result.payload.details.custody).toBe(false);
    expect(result.payload.details.canSubmit).toBe(false);
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "walrus_publisher",
        status: "missing",
        envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "walrus_relay",
        status: "missing",
        envVar: "MATTERHORN_WALRUS_RELAY_URL",
      }),
    );
  });

  test("storage prepare reports invalid Walrus setup distinctly from missing setup", async () => {
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = "ftp://publisher.example.test";
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test";
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "0";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("walrus_invalid_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "walrus_publisher",
        status: "invalid",
        envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "walrus_storage_epochs",
        status: "invalid",
        envVar: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
      }),
    );
  });

  test("storage prepare marks a draft ready for Walrus upload handoff when endpoints exist", async () => {
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = "https://publisher.example.test";
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/prepare`, {
      method: "POST",
    });

    expect(result.response.status).toBe(200);
    expect(result.payload.draft.status).toBe("storage_ready");
    expect(result.payload.draft.storage.provider).toBe("walrus");
    expect(result.payload.draft.storage.status).toBe("ready_to_upload");
  });

  test("storage upload sends image bytes to a Walrus publisher and stores public blob metadata", async () => {
    const publisher = bootWalrusPublisher({
      newlyCreated: {
        blobObject: {
          id: "0xblobobject",
          blobId: "blob_test_123",
          storage: { endEpoch: 42 },
        },
      },
    });
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = publisher.url;
    process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN = "walrus-test-token";
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test/base";
    process.env.MATTERHORN_WALRUS_STORAGE_EPOCHS = "3";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/upload`, {
      method: "POST",
    });

    expect(result.response.status).toBe(200);
    expect(publisher.calls.length).toBe(1);
    expect(publisher.calls[0].method).toBe("PUT");
    expect(new URL(publisher.calls[0].url).pathname).toBe("/v1/blobs");
    expect(new URL(publisher.calls[0].url).searchParams.get("epochs")).toBe("3");
    expect(publisher.calls[0].contentType).toBe("image/png");
    expect(publisher.calls[0].authorization).toBe("Bearer walrus-test-token");
    expect(publisher.calls[0].byteLength).toBeGreaterThan(100);
    expect(result.payload.draft.status).toBe("storage_ready");
    expect(result.payload.draft.storage.provider).toBe("walrus");
    expect(result.payload.draft.storage.status).toBe("uploaded");
    expect(result.payload.draft.storage.blobId).toBe("blob_test_123");
    expect(result.payload.draft.storage.objectId).toBe("0xblobobject");
    expect(result.payload.draft.storage.endEpoch).toBe(42);
    expect(result.payload.draft.storage.url).toBe("https://relay.example.test/base/v1/blobs/blob_test_123");
    expect(result.payload.draft.metadata.imageUrl).toBe("https://relay.example.test/base/v1/blobs/blob_test_123");
  });

  test("storage upload stores redacted failed state and project evidence when the Walrus publisher rejects the blob", async () => {
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const publisher = bootWalrusPublisher({ message: `publisher rejected ${secret}` }, { status: 500 });
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = publisher.url;
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/upload`, {
      method: "POST",
    });

    expect(result.response.status).toBe(500);
    expect(result.payload.code).toBe("walrus_upload_failed");
    expect(JSON.stringify(result.payload)).not.toContain(secret);
    const refreshed = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}`);
    expect(refreshed.payload.draft.storage.status).toBe("failed");
    expect(refreshed.payload.draft.storage.error).toBe("[redacted: secret-shaped input detected]");

    const evidence = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/evidence?source=task_events&limit=20`);
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "task.failed",
      title: "NFT media upload failed",
      desk: "nft",
      sessionSlug: draft.id,
      taskId: `nft_storage_${draft.id}`,
      metadata: expect.objectContaining({
        nftOutputKind: "walrus_upload_failed",
        nftNetwork: "sui-testnet",
        walrusErrorCode: "walrus_upload_failed",
        walrusStatus: 500,
        custody: false,
        containsSignatureMaterial: false,
      }),
    }));
    expect(JSON.stringify(evidence.payload)).not.toContain(secret);
  });

  test("mint preview reports missing Sui NFT package setup", async () => {
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_nft_package_needs_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_nft_package",
        status: "missing",
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      }),
    );
  });

  test("mint preview reports invalid Sui network before preparing a transaction plan", async () => {
    process.env.MATTERHORN_SUI_NETWORK = "sui-devnet";
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0x1234";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_nft_invalid_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_network",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NETWORK",
      }),
    );
  });

  test("mint preview rejects invalid configured Sui NFT package and module before preparing a transaction plan", async () => {
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "not-a-sui-object";
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "not-a-module-name";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_nft_invalid_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_nft_package",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_nft_module",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
      }),
    );
  });

  test("mint preview blocks until the draft has a public image URI", async () => {
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0x1234";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(409);
    expect(result.payload.code).toBe("sui_nft_public_storage_required");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_public_image_uri",
        status: "missing",
      }),
    );
  });

  test("mint preview returns a wallet transaction plan when package config and public media exist", async () => {
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0x1234";
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "matterhorn_media";
    const { base, dir } = await boot();
    const draft = await createDraft(base);
    const mintPreviewPath = `.matterhorn-work/outputs/nft-previews/${draft.id}/mint-preview.json`;
    await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        metadata: { imageUrl: "https://relay.example.test/v1/blobs/blob_test_123" },
      }),
    });

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(200);
    expect(result.payload.custody).toBe(false);
    expect(result.payload.canSubmit).toBe(false);
    expect(result.payload.handoff.kind).toBe("sui_wallet_standard");
    expect(result.payload.handoff.packageId).toBe("0x1234");
    expect(result.payload.handoff.moduleName).toBe("matterhorn_media");
    expect(result.payload.handoff.functionName).toBe("mint");
    expect(result.payload.handoff.storageUrl).toBe("https://relay.example.test/v1/blobs/blob_test_123");
    expect(result.payload.handoff.steps.length).toBeGreaterThan(0);
    expect(result.payload.transactionPlan.kind).toBe("sui_move_call");
    expect(result.payload.transactionPlan.custody).toBe(false);
    expect(result.payload.transactionPlan.canSubmit).toBe(false);
    expect(result.payload.transactionPlan.requiresWalletStandard).toBe(true);
    expect(result.payload.transactionPlan.sdkHints.importPath).toBe("@mysten/sui/transactions");
    expect(result.payload.transactionPlan.moveCalls[0].target).toBe("0x1234::matterhorn_media::mint");
    expect(result.payload.transactionPlan.moveCalls[0].arguments).toContainEqual(
      expect.objectContaining({
        label: "image_url",
        kind: "pure",
        type: "string",
        value: "https://relay.example.test/v1/blobs/blob_test_123",
      }),
    );
    expect(result.payload.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_nft_package",
        status: "configured",
      }),
    );
    expect(result.payload.draft.status).toBe("mint_preview_ready");

    const previewFile = JSON.parse(readFileSync(join(dir, mintPreviewPath), "utf8"));
    expect(previewFile).toMatchObject({
      version: "matterhorn.nft-preview.v1",
      kind: "mint_preview",
      draftId: draft.id,
      imageId: draft.imageId,
      network: "sui-testnet",
      custody: false,
      canSubmit: false,
      containsSignatureMaterial: false,
      transactionPlan: {
        kind: "sui_move_call",
        custody: false,
        canSubmit: false,
      },
    });
    expect(JSON.stringify(previewFile)).not.toContain("rawSignature");
    expect(JSON.stringify(previewFile)).not.toContain("privateKey");

    const evidence = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/evidence?source=task_events&limit=20`);
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "task.output_saved",
      title: `Sui NFT mint preview: mint-preview.json`,
      desk: "nft",
      sessionSlug: draft.id,
      taskId: `nft_mint_preview_${draft.id}`,
      outputPath: mintPreviewPath,
      artifactPaths: [mintPreviewPath],
      metadata: expect.objectContaining({
        nftOutputKind: "mint_preview",
        nftNetwork: "sui-testnet",
        nftPackageId: "0x1234",
        custody: false,
        containsSignatureMaterial: false,
      }),
    }));

    const nftLedger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=nft&limit=20`);
    expect(nftLedger.response.status).toBe(200);
    expect(nftLedger.payload.items).toContainEqual(expect.objectContaining({
      kind: "nft",
      eventType: "task.output_saved",
      outputPath: mintPreviewPath,
      metadata: expect.objectContaining({
        nftOutputKind: "mint_preview",
        containsSignatureMaterial: false,
      }),
    }));
  });

  test("listing preview requires both Kiosk and TransferPolicy config", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_kiosk_package_needs_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_transfer_policy",
        status: "missing",
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      }),
    );
  });

  test("listing preview reports invalid Sui network before preparing a marketplace plan", async () => {
    process.env.MATTERHORN_SUI_NETWORK = "sui-devnet";
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_kiosk_invalid_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_network",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NETWORK",
      }),
    );
  });

  test("listing preview rejects invalid configured Sui Kiosk and TransferPolicy package ids", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "not-a-kiosk-package";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "not-a-policy-package";
    process.env.MATTERHORN_SUI_NFT_TYPE = "not-a-full-type";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(503);
    expect(result.payload.code).toBe("sui_kiosk_invalid_setup");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_kiosk_package",
        status: "invalid",
        envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_transfer_policy",
        status: "invalid",
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_nft_type",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_TYPE",
      }),
    );
  });

  test("listing preview requires minted object and user-owned Kiosk inputs", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
    });

    expect(result.response.status).toBe(409);
    expect(result.payload.code).toBe("sui_kiosk_listing_inputs_required");
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_minted_object",
        status: "missing",
      }),
    );
    expect(result.payload.details.setupRequirements).toContainEqual(
      expect.objectContaining({
        key: "sui_kiosk_owner_cap",
        status: "missing",
      }),
    );
  });

  test("listing preview rejects invalid public Sui object ids, type strings, and prices", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base } = await boot();
    const draft = await createDraft(base);

    const badObject = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        objectId: "not-a-sui-object",
        nftType: "0x1234::matterhorn_media::MatterhornNFT",
        kioskId: "0x4568",
        kioskOwnerCapId: "0x4569",
        transferPolicyId: "0x8911",
        priceMist: "1000",
      }),
    });
    expect(badObject.response.status).toBe(400);
    expect(badObject.payload.code).toBe("nft_sui_public_id_invalid");

    const badType = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        objectId: "0xabc",
        nftType: "not-a-full-type",
        kioskId: "0x4568",
        kioskOwnerCapId: "0x4569",
        transferPolicyId: "0x8911",
        priceMist: "1000",
      }),
    });
    expect(badType.response.status).toBe(400);
    expect(badType.payload.code).toBe("nft_sui_move_type_invalid");

    const badPrice = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        objectId: "0xabc",
        nftType: "0x1234::matterhorn_media::MatterhornNFT",
        kioskId: "0x4568",
        kioskOwnerCapId: "0x4569",
        transferPolicyId: "0x8911",
        priceMist: "0",
      }),
    });
    expect(badPrice.response.status).toBe(400);
    expect(badPrice.payload.code).toBe("nft_listing_price_invalid");
  });

  test("listing preview returns a Sui Kiosk transaction plan when config and user inputs exist", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0x4567";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0x8910";
    const { base, dir } = await boot();
    const draft = await createDraft(base);
    const listingPreviewPath = `.matterhorn-work/outputs/nft-previews/${draft.id}/listing-preview.json`;
    await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        objectId: "0xabc",
        network: "sui-testnet",
        packageId: "0x1234",
      }),
    });

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        nftType: "0x1234::matterhorn_media::MatterhornNFT",
        kioskId: "0x4568",
        kioskOwnerCapId: "0x4569",
        transferPolicyId: "0x8911",
        priceMist: "1000",
        sender: "0x9999",
      }),
    });

    expect(result.response.status).toBe(200);
    expect(result.payload.custody).toBe(false);
    expect(result.payload.canSubmit).toBe(false);
    expect(result.payload.handoff.marketplace).toBe("sui_kiosk");
    expect(result.payload.handoff.kioskPackageId).toBe("0x4567");
    expect(result.payload.handoff.transferPolicyPackageId).toBe("0x8910");
    expect(result.payload.handoff.priceMist).toBe("1000");
    expect(result.payload.handoff.objectId).toBe("0xabc");
    expect(result.payload.handoff.steps.length).toBeGreaterThan(0);
    expect(result.payload.transactionPlan.kind).toBe("sui_kiosk_listing");
    expect(result.payload.transactionPlan.marketplace).toBe("sui_kiosk");
    expect(result.payload.transactionPlan.nftObjectId).toBe("0xabc");
    expect(result.payload.transactionPlan.nftType).toBe("0x1234::matterhorn_media::MatterhornNFT");
    expect(result.payload.transactionPlan.kioskId).toBe("0x4568");
    expect(result.payload.transactionPlan.kioskOwnerCapId).toBe("0x4569");
    expect(result.payload.transactionPlan.transferPolicyId).toBe("0x8911");
    expect(result.payload.transactionPlan.sdkHints.packageName).toBe("@mysten/kiosk");
    expect(result.payload.draft.listing.kioskId).toBe("0x4568");
    expect(result.payload.draft.listing.kioskOwnerCapId).toBe("0x4569");
    expect(result.payload.draft.listing.transferPolicyId).toBe("0x8911");
    expect(result.payload.draft.listing.itemType).toBe("0x1234::matterhorn_media::MatterhornNFT");

    const previewFile = JSON.parse(readFileSync(join(dir, listingPreviewPath), "utf8"));
    expect(previewFile).toMatchObject({
      version: "matterhorn.nft-preview.v1",
      kind: "listing_preview",
      draftId: draft.id,
      imageId: draft.imageId,
      network: "sui-testnet",
      custody: false,
      canSubmit: false,
      containsSignatureMaterial: false,
      transactionPlan: {
        kind: "sui_kiosk_listing",
        marketplace: "sui_kiosk",
        nftObjectId: "0xabc",
        kioskId: "0x4568",
        transferPolicyId: "0x8911",
      },
    });
    expect(JSON.stringify(previewFile)).not.toContain("rawSignature");
    expect(JSON.stringify(previewFile)).not.toContain("privateKey");

    const evidence = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/evidence?source=task_events&limit=20`);
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "task.output_saved",
      title: `Sui Kiosk listing preview: listing-preview.json`,
      desk: "nft",
      sessionSlug: draft.id,
      taskId: `nft_listing_preview_${draft.id}`,
      outputPath: listingPreviewPath,
      artifactPaths: [listingPreviewPath],
      metadata: expect.objectContaining({
        nftOutputKind: "listing_preview",
        nftNetwork: "sui-testnet",
        nftObjectId: "0xabc",
        nftKioskId: "0x4568",
        nftTransferPolicyId: "0x8911",
        custody: false,
        containsSignatureMaterial: false,
      }),
    }));

    const nftLedger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=nft&limit=20`);
    expect(nftLedger.response.status).toBe(200);
    expect(nftLedger.payload.items).toContainEqual(expect.objectContaining({
      kind: "nft",
      eventType: "task.output_saved",
      outputPath: listingPreviewPath,
      metadata: expect.objectContaining({
        nftOutputKind: "listing_preview",
        nftObjectId: "0xabc",
        containsSignatureMaterial: false,
      }),
    }));
  });

  test("mint and listing receipts appear in project evidence and data ledger", async () => {
    const { base, dir } = await boot();
    const draft = await createDraft(base);
    const mintReceiptPath = `.matterhorn-work/outputs/nft-receipts/${draft.id}/mint-receipt.json`;
    const listingReceiptPath = `.matterhorn-work/outputs/nft-receipts/${draft.id}/listing-receipt.json`;

    const mintReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        objectId: "0xabcd",
        network: "sui-testnet",
        packageId: "0x1234",
      }),
    });
    expect(mintReceipt.response.status).toBe(200);

    const listingReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "bcdefabcdefabcdefabcdefabcdefabcdefa",
        objectId: "0xabcd",
        network: "sui-testnet",
        kioskId: "0x4568",
        transferPolicyId: "0x8911",
      }),
    });
    expect(listingReceipt.response.status).toBe(200);

    const mintReceiptFile = JSON.parse(readFileSync(join(dir, mintReceiptPath), "utf8"));
    expect(mintReceiptFile).toMatchObject({
      version: "matterhorn.nft-receipt.v1",
      kind: "mint",
      draftId: draft.id,
      imageId: draft.imageId,
      network: "sui-testnet",
      transactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
      objectId: "0xabcd",
      packageId: "0x1234",
      custody: false,
      containsSignatureMaterial: false,
    });
    const listingReceiptFile = JSON.parse(readFileSync(join(dir, listingReceiptPath), "utf8"));
    expect(listingReceiptFile).toMatchObject({
      version: "matterhorn.nft-receipt.v1",
      kind: "listing",
      draftId: draft.id,
      network: "sui-testnet",
      transactionDigest: "bcdefabcdefabcdefabcdefabcdefabcdefa",
      objectId: "0xabcd",
      kioskId: "0x4568",
      transferPolicyId: "0x8911",
      custody: false,
      containsSignatureMaterial: false,
    });
    expect(JSON.stringify([mintReceiptFile, listingReceiptFile])).not.toContain("signature");

    const evidence = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/evidence?source=task_events&limit=20`);
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload.summary.nfts).toBe(2);
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "nft.minted",
      title: "NFT minted",
      desk: "nft",
      sessionSlug: draft.id,
      taskId: `nft_mint_${draft.id}`,
      outputPath: mintReceiptPath,
      artifactPaths: [mintReceiptPath],
      metadata: expect.objectContaining({
        nftReceiptKind: "mint",
        nftNetwork: "sui-testnet",
        nftTransactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        nftObjectId: "0xabcd",
        nftPackageId: "0x1234",
        containsSignatureMaterial: false,
      }),
    }));
    expect(evidence.payload.items).toContainEqual(expect.objectContaining({
      type: "nft.listed",
      title: "NFT listed",
      desk: "nft",
      sessionSlug: draft.id,
      taskId: `nft_listing_${draft.id}`,
      outputPath: listingReceiptPath,
      artifactPaths: [listingReceiptPath],
      metadata: expect.objectContaining({
        nftReceiptKind: "listing",
        nftNetwork: "sui-testnet",
        nftTransactionDigest: "bcdefabcdefabcdefabcdefabcdefabcdefa",
        nftObjectId: "0xabcd",
        nftKioskId: "0x4568",
        nftTransferPolicyId: "0x8911",
        containsSignatureMaterial: false,
      }),
    }));

    const nftLedger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=nft&limit=20`);
    expect(nftLedger.response.status).toBe(200);
    expect(nftLedger.payload.summary.nfts).toBe(2);
    expect(nftLedger.payload.items.map((item: { eventType?: string }) => item.eventType)).toEqual([
      "nft.listed",
      "nft.minted",
    ]);
    expect(nftLedger.payload.items).toContainEqual(expect.objectContaining({
      eventType: "nft.minted",
      outputPath: mintReceiptPath,
      metadata: expect.objectContaining({
        nftTransactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        nftObjectId: "0xabcd",
        containsSignatureMaterial: false,
      }),
    }));
    expect(nftLedger.payload.items).toContainEqual(expect.objectContaining({
      eventType: "nft.listed",
      outputPath: listingReceiptPath,
      metadata: expect.objectContaining({
        nftTransactionDigest: "bcdefabcdefabcdefabcdefabcdefabcdefa",
        nftObjectId: "0xabcd",
        nftKioskId: "0x4568",
        nftTransferPolicyId: "0x8911",
        containsSignatureMaterial: false,
      }),
    }));
    expect(nftLedger.payload.items.every((item: { source: string; kind: string; containsSecrets: string; trainingUse: string }) =>
      item.source === "project_evidence" &&
      item.kind === "nft" &&
      item.containsSecrets === "never" &&
      item.trainingUse === "none",
    )).toBe(true);

    const imageLedger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=image&limit=20`);
    expect(imageLedger.response.status).toBe(200);
    expect(imageLedger.payload.summary.images).toBe(1);
    expect(imageLedger.payload.items).toContainEqual(expect.objectContaining({
      kind: "image",
      eventType: "image.generated",
    }));
  });

  test("NFT receipts must match the draft network and recorded minted object", async () => {
    const { base } = await boot();
    const draft = await createDraft(base);

    const wrongNetwork = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "cdefabcdefabcdefabcdefabcdefabcdefab",
        objectId: "0xabcd",
        network: "sui-mainnet",
      }),
    });
    expect(wrongNetwork.response.status).toBe(400);
    expect(wrongNetwork.payload.code).toBe("nft_receipt_network_mismatch");

    const mintReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        objectId: "0xabcd",
        network: "sui-testnet",
      }),
    });
    expect(mintReceipt.response.status).toBe(200);

    const wrongObject = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "defabcdefabcdefabcdefabcdefabcdefabc",
        objectId: "0xabce",
        network: "sui-testnet",
      }),
    });
    expect(wrongObject.response.status).toBe(400);
    expect(wrongObject.payload.code).toBe("nft_receipt_object_mismatch");
  });

  test("NFT receipts reject invalid transaction digests and public object ids", async () => {
    const { base } = await boot();
    const draft = await createDraft(base);

    const badDigest = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "not-a-sui-digest",
        objectId: "0xabcd",
        network: "sui-testnet",
      }),
    });
    expect(badDigest.response.status).toBe(400);
    expect(badDigest.payload.code).toBe("nft_receipt_digest_invalid");

    const badObject = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "abcdefabcdefabcdefabcdefabcdefabcdef",
        objectId: "not-a-sui-object",
        network: "sui-testnet",
      }),
    });
    expect(badObject.response.status).toBe(400);
    expect(badObject.payload.code).toBe("nft_sui_public_id_invalid");
  });
});

describe("Generated media security", () => {
  test("rejects prompt containing an API key shape", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "use sk-abcdefghijklmnopqrstuvwxyz1234567890" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("image_prompt_secret_rejected");
  });

  test("rejects modern OpenAI project key shaped prompts", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "use sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("image_prompt_secret_rejected");
  });

  test("rejects seed phrase shaped prompt", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "my seed phrase: abandon ability able" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("image_prompt_secret_rejected");
  });

  test("NFT draft creation rejects nested wallet secrets", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat" }),
    });
    const imageId = generated.payload.image.id;
    const draft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({
        title: "Leaky draft",
        metadata: { usageNote: "my seed phrase is abandon ability able" },
      }),
    });
    expect(draft.response.status).toBe(400);
    expect(draft.payload.code).toBe("generated_media_sensitive_input_rejected");
  });

  test("NFT mint receipt rejects raw signature input", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat" }),
    });
    const imageId = generated.payload.image.id;
    const draft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const receipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.payload.draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "dig",
        objectId: "obj",
        network: "sui-testnet",
        privateKey: "0xdeadbeef",
      }),
    });
    expect(receipt.response.status).toBe(400);
    expect(receipt.payload.code).toBe("generated_media_sensitive_input_rejected");
  });

  test("NFT listing receipt rejects signature payloads", async () => {
    const { base } = await boot();
    const generated = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: "a cat" }),
    });
    const imageId = generated.payload.image.id;
    const draft = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/images/${imageId}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const receipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.payload.draft.id}/listing/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "dig",
        objectId: "obj",
        network: "sui-testnet",
        rawSignature: "serialized-wallet-signature",
      }),
    });
    expect(receipt.response.status).toBe(400);
    expect(receipt.payload.code).toBe("generated_media_sensitive_input_rejected");
  });
});
