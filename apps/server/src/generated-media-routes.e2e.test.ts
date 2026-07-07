import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

function bootWalrusPublisher(payload: unknown) {
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
      return Response.json(payload);
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
});

describe("Generated media Sui NFT setup previews", () => {
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

  test("storage upload stores a failed state when the Walrus publisher rejects the blob", async () => {
    const publisher = bootWalrusPublisher({ message: "publisher rejected blob" });
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = publisher.url;
    process.env.MATTERHORN_WALRUS_RELAY_URL = "https://relay.example.test";
    const { base } = await boot();
    const draft = await createDraft(base);

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/storage/upload`, {
      method: "POST",
    });

    expect(result.response.status).toBe(502);
    expect(result.payload.code).toBe("walrus_invalid_response");
    const refreshed = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}`);
    expect(refreshed.payload.draft.storage.status).toBe("failed");
    expect(refreshed.payload.draft.storage.error).toContain("stored blob");
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
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0xmintpackage";
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

  test("mint preview blocks until the draft has a public image URI", async () => {
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0xmintpackage";
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
    process.env.MATTERHORN_SUI_NFT_PACKAGE_ID = "0xmintpackage";
    process.env.MATTERHORN_SUI_NFT_MODULE_NAME = "matterhorn_media";
    const { base } = await boot();
    const draft = await createDraft(base);
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
    expect(result.payload.handoff.packageId).toBe("0xmintpackage");
    expect(result.payload.handoff.moduleName).toBe("matterhorn_media");
    expect(result.payload.handoff.functionName).toBe("mint");
    expect(result.payload.handoff.storageUrl).toBe("https://relay.example.test/v1/blobs/blob_test_123");
    expect(result.payload.handoff.steps.length).toBeGreaterThan(0);
    expect(result.payload.transactionPlan.kind).toBe("sui_move_call");
    expect(result.payload.transactionPlan.custody).toBe(false);
    expect(result.payload.transactionPlan.canSubmit).toBe(false);
    expect(result.payload.transactionPlan.requiresWalletStandard).toBe(true);
    expect(result.payload.transactionPlan.sdkHints.importPath).toBe("@mysten/sui/transactions");
    expect(result.payload.transactionPlan.moveCalls[0].target).toBe("0xmintpackage::matterhorn_media::mint");
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
  });

  test("listing preview requires both Kiosk and TransferPolicy config", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0xkiosk";
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
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0xkiosk";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0xpolicy";
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

  test("listing preview requires minted object and user-owned Kiosk inputs", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0xkiosk";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0xpolicy";
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

  test("listing preview returns a Sui Kiosk transaction plan when config and user inputs exist", async () => {
    process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID = "0xkioskpackage";
    process.env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID = "0xpolicypackage";
    const { base } = await boot();
    const draft = await createDraft(base);
    await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xdigest",
        objectId: "0xnftobject",
        network: "sui-testnet",
        packageId: "0xmintpackage",
      }),
    });

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        nftType: "0xmintpackage::matterhorn_media::MatterhornNFT",
        kioskId: "0xuserkiosk",
        kioskOwnerCapId: "0xownercap",
        transferPolicyId: "0xtransferpolicy",
        priceMist: "1000",
        sender: "0xsender",
      }),
    });

    expect(result.response.status).toBe(200);
    expect(result.payload.custody).toBe(false);
    expect(result.payload.canSubmit).toBe(false);
    expect(result.payload.handoff.marketplace).toBe("sui_kiosk");
    expect(result.payload.handoff.kioskPackageId).toBe("0xkioskpackage");
    expect(result.payload.handoff.transferPolicyPackageId).toBe("0xpolicypackage");
    expect(result.payload.handoff.priceMist).toBe("1000");
    expect(result.payload.handoff.objectId).toBe("0xnftobject");
    expect(result.payload.handoff.steps.length).toBeGreaterThan(0);
    expect(result.payload.transactionPlan.kind).toBe("sui_kiosk_listing");
    expect(result.payload.transactionPlan.marketplace).toBe("sui_kiosk");
    expect(result.payload.transactionPlan.nftObjectId).toBe("0xnftobject");
    expect(result.payload.transactionPlan.nftType).toBe("0xmintpackage::matterhorn_media::MatterhornNFT");
    expect(result.payload.transactionPlan.kioskId).toBe("0xuserkiosk");
    expect(result.payload.transactionPlan.kioskOwnerCapId).toBe("0xownercap");
    expect(result.payload.transactionPlan.transferPolicyId).toBe("0xtransferpolicy");
    expect(result.payload.transactionPlan.sdkHints.packageName).toBe("@mysten/kiosk");
    expect(result.payload.draft.listing.kioskId).toBe("0xuserkiosk");
    expect(result.payload.draft.listing.kioskOwnerCapId).toBe("0xownercap");
    expect(result.payload.draft.listing.transferPolicyId).toBe("0xtransferpolicy");
    expect(result.payload.draft.listing.itemType).toBe("0xmintpackage::matterhorn_media::MatterhornNFT");
  });

  test("mint and listing receipts appear in project evidence and data ledger", async () => {
    const { base, dir } = await boot();
    const draft = await createDraft(base);
    const mintReceiptPath = `.matterhorn-work/outputs/nft-receipts/${draft.id}/mint-receipt.json`;
    const listingReceiptPath = `.matterhorn-work/outputs/nft-receipts/${draft.id}/listing-receipt.json`;

    const mintReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xmintdigest",
        objectId: "0xmintedobject",
        network: "sui-testnet",
        packageId: "0xmintpackage",
      }),
    });
    expect(mintReceipt.response.status).toBe(200);

    const listingReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xlistingdigest",
        objectId: "0xmintedobject",
        network: "sui-testnet",
        kioskId: "0xuserkiosk",
        transferPolicyId: "0xtransferpolicy",
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
      transactionDigest: "0xmintdigest",
      objectId: "0xmintedobject",
      packageId: "0xmintpackage",
      custody: false,
      containsSignatureMaterial: false,
    });
    const listingReceiptFile = JSON.parse(readFileSync(join(dir, listingReceiptPath), "utf8"));
    expect(listingReceiptFile).toMatchObject({
      version: "matterhorn.nft-receipt.v1",
      kind: "listing",
      draftId: draft.id,
      network: "sui-testnet",
      transactionDigest: "0xlistingdigest",
      objectId: "0xmintedobject",
      kioskId: "0xuserkiosk",
      transferPolicyId: "0xtransferpolicy",
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
        nftTransactionDigest: "0xmintdigest",
        nftObjectId: "0xmintedobject",
        nftPackageId: "0xmintpackage",
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
        nftTransactionDigest: "0xlistingdigest",
        nftObjectId: "0xmintedobject",
        nftKioskId: "0xuserkiosk",
        nftTransferPolicyId: "0xtransferpolicy",
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
        nftTransactionDigest: "0xmintdigest",
        nftObjectId: "0xmintedobject",
        containsSignatureMaterial: false,
      }),
    }));
    expect(nftLedger.payload.items).toContainEqual(expect.objectContaining({
      eventType: "nft.listed",
      outputPath: listingReceiptPath,
      metadata: expect.objectContaining({
        nftTransactionDigest: "0xlistingdigest",
        nftObjectId: "0xmintedobject",
        nftKioskId: "0xuserkiosk",
        nftTransferPolicyId: "0xtransferpolicy",
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
        transactionDigest: "0xwrongnetwork",
        objectId: "0xmintedobject",
        network: "sui-mainnet",
      }),
    });
    expect(wrongNetwork.response.status).toBe(400);
    expect(wrongNetwork.payload.code).toBe("nft_receipt_network_mismatch");

    const mintReceipt = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xmintdigest",
        objectId: "0xmintedobject",
        network: "sui-testnet",
      }),
    });
    expect(mintReceipt.response.status).toBe(200);

    const wrongObject = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/nft-drafts/${draft.id}/listing/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xwrongobject",
        objectId: "0xotherobject",
        network: "sui-testnet",
      }),
    });
    expect(wrongObject.response.status).toBe(400);
    expect(wrongObject.payload.code).toBe("nft_receipt_object_mismatch");
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
