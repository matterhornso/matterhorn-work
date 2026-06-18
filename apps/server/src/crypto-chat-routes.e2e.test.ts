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

const TOKEN = "owt_crypto_chat_route_test_token";
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const priorEnvStore = process.env.OPENWORK_ENV_STORE;
const priorTokenStore = process.env.OPENWORK_TOKEN_STORE;

function baseConfig(port: number): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: "owt_crypto_chat_route_host_token",
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

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-crypto-chat-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  const server = await startServer(baseConfig(await getFreePort())) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}` };
}

async function postCryptoChat(base: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/crypto/chat/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

async function getJson(base: string, path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
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
    if (/(seed|mnemonic|privateKey|apiSecret|walletExport|rawSignature|signedPayload)/i.test(key)) {
      if (child !== false && child !== null && child !== undefined) return [...path, key].join(".");
    }
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

describe("unified crypto chat execute route", () => {
  test("answers execution-readiness prompts with the no-submit shared-card contract", async () => {
    const { base } = await boot();
    const { res, payload } = await postCryptoChat(base, {
      message: "Can Matterhorn submit Hyperliquid and Polymarket orders yet?",
      venue: "auto",
    });

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.venue).toBe("auto");
    expect(payload.intent).toBe("market_execution_readiness");
    expect(payload.execution).toBe("read_only");
    expect(payload.responseText).toContain("Can submit: No");
    expect(payload.responseText).toContain("Live submission: Off");
    expect(payload.sharedCards[0]).toMatchObject({
      version: "matterhorn.crypto.shared-card.v1",
      kind: "readiness_report",
      venue: "auto",
      safety: {
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    });
    expect(payload.data.report.readyForLiveSubmission).toBe(false);
    expect(payload.data.report.safety.signsOrSubmits).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("answers execution-chain prompts through the unified chat route", async () => {
    const { base } = await boot();
    const { res, payload } = await postCryptoChat(base, {
      message: "Show the Hyperliquid and Polymarket safe execution chain from preview to receipt.",
      venue: "auto",
    });

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.venue).toBe("auto");
    expect(payload.intent).toBe("market_execution_chain");
    expect(payload.execution).toBe("read_only");
    expect(payload.responseText).toContain("Can submit: No");
    expect(payload.responseText).toContain("Live submission: Off");
    expect(payload.sharedCards[0]).toMatchObject({
      version: "matterhorn.crypto.shared-card.v1",
      kind: "readiness_report",
      venue: "auto",
      originalKind: "market_execution_chain",
      safety: {
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    });
    expect(payload.data.guide.version).toBe("matterhorn.market.execution-chain-guide.v1");
    expect(payload.data.guide.safety.acceptsSecrets).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("answers execution-step prompts through the unified chat route", async () => {
    const { base } = await boot();
    const { res, payload } = await postCryptoChat(base, {
      message: "Create a Hyperliquid external sign request for testnet. What public context is needed?",
      venue: "auto",
    });

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.intent).toBe("market_execution_step_guidance");
    expect(payload.execution).toBe("read_only");
    expect(payload.responseText).toContain("External sign request");
    expect(payload.responseText).toContain("Can submit: No");
    expect(payload.responseText).toContain("Live submission: Off");
    expect(payload.data.highlightedStep.id).toBe("external_sign_request");
    expect(payload.sharedCards[0]).toMatchObject({
      version: "matterhorn.crypto.shared-card.v1",
      kind: "readiness_report",
      originalKind: "market_execution_chain",
      safety: {
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("answers official SDK validation prompts through the unified chat route", async () => {
    const { base } = await boot();
    const { res, payload } = await postCryptoChat(base, {
      message: "How should I validate Hyperliquid and Polymarket official SDK artifacts on testnet?",
      venue: "auto",
    });

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.venue).toBe("auto");
    expect(payload.intent).toBe("market_sdk_validation");
    expect(payload.execution).toBe("read_only");
    expect(payload.responseText).toContain("Can submit: No");
    expect(payload.responseText).toContain("Live submission: Off");
    expect(payload.sharedCards[0]).toMatchObject({
      version: "matterhorn.crypto.shared-card.v1",
      kind: "readiness_report",
      venue: "auto",
      originalKind: "market_sdk_validation",
      safety: {
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    });
    expect(payload.data.guide.version).toBe("matterhorn.market.sdk-validation-guide.v1");
    expect(payload.data.guide.safety.acceptsSecrets).toBe(false);
    expect(payload.data.guide.safety.runsPrivateSdkSigning).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("serves the read-only market execution-chain API contract", async () => {
    const { base } = await boot();
    const { res, payload } = await getJson(base, "/api/crypto/market-execution-chain");

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.guide.version).toBe("matterhorn.market.execution-chain-guide.v1");
    expect(payload.guide.safety).toMatchObject({
      canSubmit: false,
      liveSubmissionEnabled: false,
      nonCustodial: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
    });
    expect(payload.cards[0]).toMatchObject({
      kind: "market_execution_chain",
      title: "Market execution chain",
    });
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("serves the read-only market SDK validation API contract", async () => {
    const { base } = await boot();
    const { res, payload } = await getJson(base, "/api/crypto/market-sdk-validation");

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.guide.version).toBe("matterhorn.market.sdk-validation-guide.v1");
    expect(payload.guide.modes).toContain("fixture");
    expect(payload.guide.modes).toContain("operator_owned_testnet");
    expect(payload.guide.networks.hyperliquid).toContain("hyperliquid-testnet");
    expect(payload.guide.networks.polymarket).toContain("polygon-amoy");
    expect(payload.guide.safety).toMatchObject({
      canSubmit: false,
      liveSubmissionEnabled: false,
      nonCustodial: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
      runsPrivateSdkSigning: false,
      callsExchanges: false,
    });
    expect(payload.cards[0]).toMatchObject({
      kind: "market_sdk_validation",
      title: "Official SDK validation",
    });
    expect(JSON.stringify(payload)).not.toContain("/orders/submit");
    expect(forbiddenFieldPath(payload)).toBeNull();
  });

  test("rejects missing messages and secret-shaped crypto chat inputs", async () => {
    const { base } = await boot();

    const missing = await postCryptoChat(base, { venue: "auto" });
    expect(missing.res.status).toBe(400);
    expect(JSON.stringify(missing.payload)).toContain("invalid_message");

    const secret = await postCryptoChat(base, {
      message: "show my Hyperliquid account",
      venue: "hyperliquid",
      apiSecret: "do-not-accept",
    });
    expect(secret.res.status).toBe(400);
    expect(JSON.stringify(secret.payload)).toContain("market_secret_rejected");
  });
});
