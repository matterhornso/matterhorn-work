import { mkdtempSync, rmSync } from "node:fs";
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

beforeEach(() => {
  priorEnv = {
    MATTERHORN_IMAGE_PROVIDER: process.env.MATTERHORN_IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    MATTERHORN_WALRUS_PUBLISHER_URL: process.env.MATTERHORN_WALRUS_PUBLISHER_URL,
    MATTERHORN_WALRUS_RELAY_URL: process.env.MATTERHORN_WALRUS_RELAY_URL,
    MATTERHORN_SUI_NFT_PACKAGE_ID: process.env.MATTERHORN_SUI_NFT_PACKAGE_ID,
    MATTERHORN_SUI_KIOSK_PACKAGE_ID: process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID,
  };
  process.env.MATTERHORN_IMAGE_PROVIDER = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.MATTERHORN_WALRUS_PUBLISHER_URL;
  delete process.env.MATTERHORN_WALRUS_RELAY_URL;
  delete process.env.MATTERHORN_SUI_NFT_PACKAGE_ID;
  delete process.env.MATTERHORN_SUI_KIOSK_PACKAGE_ID;
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
    expect(draftResult.payload.draft.storage.status).toBe("local_only");
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
