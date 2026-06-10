import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_bittensor_chat_test_token";
const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
const HOTKEY = "5FHneW46xGXgs5mUiveU4sbTyGBzmtoW4h4KYxqsdXw4nq8Z";
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const nativeFetch = globalThis.fetch;
const priorSidecar = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
const priorEnvStore = process.env.OPENWORK_ENV_STORE;
const priorTokenStore = process.env.OPENWORK_TOKEN_STORE;

function baseConfig(port: number): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: "owt_bittensor_chat_host_token",
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [],
    authorizedRoots: [],
    readOnly: false,
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installSidecarMock(base: string): void {
  process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = "http://matterhorn-route-sidecar.test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(base)) return nativeFetch(input, init);
    if (url.endsWith("/subnets")) {
      return json({
        subnets: [
          {
            netuid: 14,
            name: "Image Route Subnet",
            symbol: "SN14",
            description: "Generate image and media outputs.",
            priceTao: 0.25,
            emission: 0.2,
            tempo: 360,
            source: "route-sidecar-mock",
            block: 140,
            freshness: "fresh",
          },
        ],
      });
    }
    if (url.endsWith("/subnets/14/dynamic")) {
      return json({
        netuid: 14,
        name: "Image Route Subnet",
        symbol: "SN14",
        description: "Generate image and media outputs.",
        priceTao: 0.25,
        emission: 0.2,
        tempo: 360,
        source: "route-sidecar-mock",
        block: 141,
        freshness: "fresh",
      });
    }
    if (url.endsWith("/subnets/14/metagraph")) {
      return json({
        netuid: 14,
        n: 1,
        totalStake: 500,
        block: 141,
        neurons: [{ uid: 1, hotkey: HOTKEY, coldkey: VALID_SS58, stake: 500, trust: 0.9, dividends: 0.2 }],
      });
    }
    if (url.includes("/wallet/")) {
      return json({
        ss58Address: VALID_SS58,
        taoBalance: 4,
        estimatedValueTao: 8,
        source: "route-sidecar-mock",
        block: 141,
        freshness: "fresh",
        stakePositions: [{ netuid: 14, subnetName: "Image Route Subnet", validatorHotkey: HOTKEY, alphaAmount: 16, taoValue: 4, slippageRisk: "low" }],
      });
    }
    if (url.endsWith("/extrinsics/quote")) {
      return json({
        action: "stake",
        netuid: 14,
        amountTao: 1,
        priceTao: 0.25,
        idealAlpha: 4,
        expectedAlpha: 3.95,
        feeTao: 0.0001,
        slippageBps: 50,
        source: "route-sidecar-mock",
        block: 141,
        freshness: "fresh",
        warnings: ["Route quote mock."],
        requiresExternalSignature: true,
      });
    }
    if (url.endsWith("/extrinsics/prepare")) {
      return json({
        unsignedPayload: { chain: "bittensor", action: "stake", netuid: 14, amountTao: "1", hotkey: HOTKEY },
        feeTao: 0.0001,
        slippageBps: 50,
        expectedAlpha: 3.95,
        warnings: ["Route prepare mock."],
      });
    }
    return nativeFetch(input, init);
  }) as typeof fetch;
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "openwork-bittensor-chat-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  const server = await startServer(baseConfig(await getFreePort())) as Served;
  stops.push(() => server.stop(true));
  const base = `http://127.0.0.1:${server.port}`;
  installSidecarMock(base);
  return { base };
}

async function postExecute(base: string, body: Record<string, unknown>) {
  const res = await nativeFetch(`${base}/api/bittensor/chat/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  const payload = await res.json();
  expect(payload.success).toBe(true);
  return payload;
}

function forbiddenFieldPath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = forbiddenFieldPath(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(seed|mnemonic|privateKey|walletExport|wallet_export)/i.test(key)) return [...path, key].join(".");
    const nested = forbiddenFieldPath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  globalThis.fetch = nativeFetch;
  if (priorSidecar === undefined) {
    delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
  } else {
    process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = priorSidecar;
  }
  if (priorEnvStore === undefined) {
    delete process.env.OPENWORK_ENV_STORE;
  } else {
    process.env.OPENWORK_ENV_STORE = priorEnvStore;
  }
  if (priorTokenStore === undefined) {
    delete process.env.OPENWORK_TOKEN_STORE;
  } else {
    process.env.OPENWORK_TOKEN_STORE = priorTokenStore;
  }
});

describe("Bittensor chat execute route", () => {
  test("returns chat-ready results for the five prompt milestone", async () => {
    const { base } = await boot();

    const missingWallet = await postExecute(base, { message: "show my TAO" });
    expect(missingWallet.execution).toBe("clarification_required");
    expect(missingWallet.clarificationQuestion).toContain("SS58");

    const wallet = await postExecute(base, { message: "show my TAO", ss58Address: VALID_SS58 });
    expect(wallet.execution).toBe("answered");
    expect(wallet.cards[0]?.kind).toBe("wallet_snapshot");

    const staked = await postExecute(base, { message: "where am I staked?", ss58Address: VALID_SS58 });
    expect(staked.cards.some((card: { title?: string }) => card.title === "Stake positions")).toBe(true);

    const image = await postExecute(base, { message: "which subnet is useful for image generation?", limit: 5 });
    expect(image.cards[0]?.kind).toBe("subnet_comparison");

    const validators = await postExecute(base, { message: "compare validators on subnet 14" });
    expect(validators.cards[0]?.kind).toBe("validator_selection");

    const incompleteStake = await postExecute(base, { message: "prepare staking 1 TAO on subnet 14" });
    expect(incompleteStake.execution).toBe("clarification_required");
    expect(incompleteStake.clarificationQuestion).toContain("validator hotkey");

    const preview = await postExecute(base, {
      message: "prepare staking 1 TAO on subnet 14",
      ss58Address: VALID_SS58,
      validatorHotkey: HOTKEY,
    });
    expect(preview.execution).toBe("unsigned_preview");
    expect(preview.cards[0]?.kind).toBe("signed_action_review");
    expect(forbiddenFieldPath(preview)).toBeNull();
  });
});
