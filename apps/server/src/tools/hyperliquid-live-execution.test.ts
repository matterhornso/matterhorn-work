import { describe, expect, test } from "bun:test";

import { privateKeyToAccount } from "viem/accounts";

import {
  HyperliquidExecutionIntentStore,
  hashHyperliquidAction,
} from "./hyperliquid-live-execution.js";
import { isHyperliquidExecutionEnabled } from "./market-execution-readiness.js";

const ACCOUNT = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const OTHER_ACCOUNT = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const OWNER_A = "test-owner-a";
const OWNER_B = "test-owner-b";

function createFetcher() {
  const exchangeBodies: unknown[] = [];
  const fetcher = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (body.type === "meta") {
      return Response.json({ universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40 }] });
    }
    if (body.type === "allMids") return Response.json({ BTC: "65000" });
    exchangeBodies.push(body);
    return Response.json({ status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 123 } }] } } });
  }) as typeof fetch;
  return { fetcher, exchangeBodies };
}

describe("HyperliquidExecutionIntentStore", () => {
  test("keeps live execution disabled unless the deployment switch is explicitly enabled", () => {
    const previousValue = process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED;
    try {
      delete process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED;
      expect(isHyperliquidExecutionEnabled()).toBe(false);

      process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED = "false";
      expect(isHyperliquidExecutionEnabled()).toBe(false);

      process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED = "1";
      expect(isHyperliquidExecutionEnabled()).toBe(true);

      process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED = " TRUE ";
      expect(isHyperliquidExecutionEnabled()).toBe(true);
    } finally {
      if (previousValue === undefined) {
        delete process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED;
      } else {
        process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED = previousValue;
      }
    }
  });

  test("builds a short-lived testnet intent and submits only the matching wallet signature", async () => {
    const { fetcher, exchangeBodies } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    const intent = await store.create({
      network: "testnet",
      signerAddress: ACCOUNT.address,
      asset: "btc",
      side: "buy",
      size: 0.001,
      orderType: "market",
      slippageBps: 100,
      reduceOnly: false,
    }, OWNER_A);

    expect(intent.asset).toBe("BTC");
    expect(intent.orderPrice).toBe(65650);
    expect(intent.estimatedNotionalUsdc).toBe(65);
    expect(intent.typedData.message.source).toBe("b");
    expect(intent.confirmation.required).toBe(false);

    const signature = await ACCOUNT.signTypedData(intent.typedData);
    const receipt = await store.submit({
      intentId: intent.intentId,
      signerAddress: ACCOUNT.address,
      signature,
    }, OWNER_A);
    expect(receipt.status).toBe("submitted");
    expect(receipt.signatureStored).toBe(false);
    expect(exchangeBodies).toHaveLength(1);
    expect(exchangeBodies[0]).toMatchObject({
      nonce: intent.nonce,
      action: {
        type: "order",
        orders: [{ a: 0, b: true, p: "65650", s: "0.001", r: false, t: { limit: { tif: "Ioc" } } }],
      },
    });

    const idempotentReceipt = await store.submit({
      intentId: intent.intentId,
      signerAddress: ACCOUNT.address,
      signature,
    }, OWNER_A);
    expect(idempotentReceipt).toEqual(receipt);
    expect(exchangeBodies).toHaveLength(1);
  });

  test("rejects a signature from a different wallet", async () => {
    const { fetcher } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    const intent = await store.create({
      network: "testnet",
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "sell",
      size: 0.001,
      orderType: "limit",
      limitPrice: 66_000,
    }, OWNER_A);
    const signature = await OTHER_ACCOUNT.signTypedData(intent.typedData);
    await expect(store.submit({
      intentId: intent.intentId,
      signerAddress: ACCOUNT.address,
      signature,
    }, OWNER_A)).rejects.toThrow("Wallet signature does not authorize this exact order intent");
  });

  test("requires the explicit phrase for mainnet", async () => {
    const { fetcher } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    const intent = await store.create({
      network: "mainnet",
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "buy",
      size: 0.001,
      orderType: "market",
    }, OWNER_A);
    const signature = await ACCOUNT.signTypedData(intent.typedData);
    await expect(store.submit({ intentId: intent.intentId, signerAddress: ACCOUNT.address, signature }, OWNER_A)).rejects.toThrow("SUBMIT LIVE ORDER");
  });

  test("rejects oversized orders before creating a signable intent", async () => {
    const { fetcher } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    await expect(store.create({
      network: "mainnet",
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "buy",
      size: 1,
      orderType: "market",
    }, OWNER_A)).rejects.toThrow("exceeds the Matterhorn limit");
  });

  test("binds an intent to the session that prepared it", async () => {
    const { fetcher, exchangeBodies } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    const intent = await store.create({
      network: "testnet",
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "buy",
      size: 0.001,
      orderType: "market",
    }, OWNER_A);
    const signature = await ACCOUNT.signTypedData(intent.typedData);

    await expect(store.submit({
      intentId: intent.intentId,
      signerAddress: ACCOUNT.address,
      signature,
    }, OWNER_B)).rejects.toThrow("different signed-in session");
    expect(exchangeBodies).toHaveLength(0);

    await expect(store.submit({
      intentId: intent.intentId,
      signerAddress: ACCOUNT.address,
      signature,
    }, OWNER_A)).resolves.toMatchObject({ status: "submitted" });
    expect(exchangeBodies).toHaveLength(1);
  });

  test("makes same-tick intent nonces unique and limits pending tickets per session", async () => {
    const { fetcher } = createFetcher();
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => 1_750_000_000_000 });
    const input = {
      network: "testnet" as const,
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "buy" as const,
      size: 0.001,
      orderType: "market" as const,
    };
    const first = await store.create(input, OWNER_A);
    const second = await store.create(input, OWNER_A);
    expect(second.nonce).toBeGreaterThan(first.nonce);
    expect(second.typedData.message.connectionId).not.toBe(first.typedData.message.connectionId);

    await store.create(input, OWNER_A);
    await store.create(input, OWNER_A);
    await store.create(input, OWNER_A);
    await expect(store.create(input, OWNER_A)).rejects.toThrow("Too many pending order confirmations");
  });

  test("bounds the short-lived order-review queue across authenticated sessions", async () => {
    const { fetcher } = createFetcher();
    let now = 1_750_000_000_000;
    const store = new HyperliquidExecutionIntentStore({ fetcher, now: () => now });
    const input = {
      network: "testnet" as const,
      signerAddress: ACCOUNT.address,
      asset: "BTC",
      side: "buy" as const,
      size: 0.001,
      orderType: "market" as const,
    };

    for (let index = 0; index < 250; index += 1) {
      await store.create(input, `test-owner-${index}`);
    }
    await expect(store.create(input, "test-owner-overflow")).rejects.toThrow("order-review queue is temporarily full");

    now += 90_001;
    await expect(store.create(input, "test-owner-after-expiry")).resolves.toMatchObject({ asset: "BTC" });
  });

  test("hashes action, nonce, and vault marker deterministically", () => {
    const action = {
      type: "order",
      orders: [{ a: 0, b: true, p: "65000", s: "0.001", r: false, t: { limit: { tif: "Gtc" } } }],
      grouping: "na",
    };
    expect(hashHyperliquidAction(action, 1_750_000_000_000)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashHyperliquidAction(action, 1_750_000_000_000)).not.toBe(hashHyperliquidAction(action, 1_750_000_000_001));
    expect(hashHyperliquidAction(action, 1_750_000_000_000, null, 1_750_000_090_000))
      .not.toBe(hashHyperliquidAction(action, 1_750_000_000_000, null, 1_750_000_090_001));
  });
});
