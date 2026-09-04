import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CANCEL_ALL_CONFIRMATION,
  POLYMARKET_CANCEL_CONFIRMATION,
  POLYMARKET_COLLATERAL_SYMBOL,
  POLYMARKET_GEOBLOCK_URL,
  POLYMARKET_LIVE_CONFIRMATION,
  assertPolymarketUserCanPlaceOrders,
  assertPolymarketPreparedOrder,
  cancelPolymarketOrders,
  checkPolymarketUserEligibility,
  normalizePolymarketOrderIds,
  submitPolymarketOrder,
  type PolymarketClobV2Runtime,
  type PolymarketPreparedOrder,
} from "../src/react-app/domains/wallet/polymarket-execution";
import type { WalletClient } from "viem";

afterEach(() => {
  vi.restoreAllMocks();
});

function geoblockResponse(payload: unknown, overrides: Partial<Response> = {}): Response {
  const raw = JSON.stringify(payload);
  return {
    ok: true,
    url: POLYMARKET_GEOBLOCK_URL,
    headers: new Headers({ "content-type": "application/json", "content-length": String(raw.length) }),
    text: async () => raw,
    ...overrides,
  } as Response;
}

function prepared(overrides: Partial<PolymarketPreparedOrder> = {}): PolymarketPreparedOrder {
  return {
    tradeSide: "BUY",
    marketId: "condition-1",
    tokenId: "123456789",
    signerAddress: "0x1111111111111111111111111111111111111111",
    marketLabel: "Will the test pass?",
    outcome: "Yes",
    amountUsdc: 5,
    amountShares: null,
    estimatedFillPrice: 0.55,
    estimatedShares: 9.09,
    estimatedProceedsUsdc: null,
    maxLossUsdc: 5,
    orderType: "FAK",
    limitPrice: 0.57,
    tickSize: "0.01",
    negativeRisk: false,
    previewSha256: "abc",
    expiresAt: "2030-01-01T00:00:00.000Z",
    compliance: { status: "allowed", reason: null },
    warnings: [],
    ...overrides,
  };
}

function clobV2Runtime(args: {
  credentials: { key: string; secret: string; passphrase: string };
  options: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  orderOptions?: Array<Record<string, unknown> | undefined>;
  orderTypes?: Array<string | undefined>;
  cancellations?: string[][];
}): PolymarketClobV2Runtime {
  return {
    chainPolygon: POLYMARKET_CHAIN_ID,
    signatureTypeEoa: 0,
    orderTypeFak: "FAK",
    sideBuy: "BUY",
    sideSell: "SELL",
    createClient: (options) => {
      args.options.push(options as unknown as Record<string, unknown>);
      return {
        createOrDeriveApiKey: async () => args.credentials,
        createAndPostMarketOrder: async (order, options, orderType) => {
          args.orders?.push(order);
          args.orderOptions?.push(options);
          args.orderTypes?.push(orderType);
          return {
            success: true,
            orderID: "order-v2",
            status: "live",
            transactionsHashes: [],
            tradeIDs: [],
            takingAmount: "9000000",
            makingAmount: "5000000",
          };
        },
        cancelAll: async () => ({ status: "cancelled" }),
        cancelOrder: async ({ orderID }) => {
          args.cancellations?.push([orderID]);
          return { status: "cancelled" };
        },
        cancelOrders: async (orderIds) => {
          args.cancellations?.push(orderIds);
          return { status: "cancelled" };
        },
      };
    },
  };
}

describe("Polymarket reviewed execution", () => {
  it("checks eligibility from the user's browser without credentials or referrer data", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(geoblockResponse({
      blocked: false,
      ip: "203.0.113.7",
      country: "CH",
      region: "ZH",
    }));
    const result = await checkPolymarketUserEligibility();
    expect(result).toEqual({ status: "allowed", country: "CH", region: "ZH" });
    expect(JSON.stringify(result)).not.toContain("203.0.113.7");
    expect(fetcher).toHaveBeenCalledWith(POLYMARKET_GEOBLOCK_URL, expect.objectContaining({
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    }));
  });

  it("fails closed when the user's location is blocked or cannot be verified", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher.mockResolvedValueOnce(geoblockResponse({
      blocked: true,
      ip: "203.0.113.8",
      country: "US",
      region: "NY",
    }));
    await expect(assertPolymarketUserCanPlaceOrders()).rejects.toThrow("unavailable from your current location");

    fetcher.mockResolvedValueOnce(geoblockResponse({
      blocked: false,
      ip: "203.0.113.8",
      country: "US",
      region: "NY",
    }, { url: "https://example.com/api/geoblock" }));
    await expect(assertPolymarketUserCanPlaceOrders()).rejects.toThrow("could not verify your location directly");
  });

  it("rejects malformed or oversized eligibility responses without retaining the reported IP", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher.mockResolvedValueOnce(geoblockResponse({
      blocked: false,
      ip: "203.0.113.9",
      country: "Switzerland",
      region: "ZH",
    }));
    await expect(checkPolymarketUserEligibility()).rejects.toThrow("could not verify your location directly");

    fetcher.mockResolvedValueOnce(geoblockResponse({
      blocked: false,
      ip: "203.0.113.9",
      country: "CH",
      region: "ZH",
    }, { headers: new Headers({ "content-type": "application/json", "content-length": "2049" }) }));
    await expect(checkPolymarketUserEligibility()).rejects.toThrow("could not verify your location directly");
  });

  it("accepts an unexpired, compliance-allowed exact order", () => {
    expect(() => assertPolymarketPreparedOrder(prepared(), Date.parse("2029-01-01"))).not.toThrow();
  });

  it("blocks compliance-restricted orders", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({
      compliance: { status: "blocked", reason: "Region blocked" },
    }), Date.parse("2029-01-01"))).toThrow("Region blocked");
  });

  it("blocks expired reviews", () => {
    expect(() => assertPolymarketPreparedOrder(prepared(), Date.parse("2031-01-01"))).toThrow("expired");
  });

  it("blocks invalid expiration timestamps", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({ expiresAt: "not-a-date" }))).toThrow("expired");
  });

  it("blocks non-finite amounts and changed maximum loss", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({ amountUsdc: Number.NaN }))).toThrow("positive");
    expect(() => assertPolymarketPreparedOrder(prepared({ maxLossUsdc: 4 }))).toThrow("no longer matches");
  });

  it("blocks missing or mutated exact CLOB execution terms", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({ limitPrice: 1 }))).toThrow("exact CLOB");
    expect(() => assertPolymarketPreparedOrder(prepared({ tickSize: "1" }))).toThrow("exact CLOB");
    expect(() => assertPolymarketPreparedOrder(prepared({ tokenId: "token-yes" }))).toThrow("missing its market");
  });

  it("validates exact share quantity for sell orders", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({
      tradeSide: "SELL",
      amountUsdc: null,
      amountShares: 4.5,
      maxLossUsdc: null,
      estimatedProceedsUsdc: 2.2,
    }), Date.parse("2029-01-01"))).not.toThrow();
    expect(() => assertPolymarketPreparedOrder(prepared({
      tradeSide: "SELL",
      amountUsdc: null,
      amountShares: 0,
      maxLossUsdc: null,
    }), Date.parse("2029-01-01"))).toThrow("share quantity");
  });

  it("normalizes and bounds exact cancellation order IDs", () => {
    expect(normalizePolymarketOrderIds("order_123, order_456\norder_123")).toEqual(["order_123", "order_456"]);
    expect(() => normalizePolymarketOrderIds(" ")).toThrow("at least one");
    expect(() => normalizePolymarketOrderIds("bad id!")).toThrow("invalid");
  });

  it("blocks submission before loading the exchange client when no wallet is connected", async () => {
    await expect(submitPolymarketOrder({
      walletClient: { account: undefined, chain: { id: POLYMARKET_CHAIN_ID } } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("Connect an EVM wallet");
  });

  it("blocks submission before loading the exchange client on the wrong chain", async () => {
    await expect(submitPolymarketOrder({
      walletClient: { account: { address: "0x1111111111111111111111111111111111111111" }, chain: { id: 1 } } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("Switch the connected wallet to Polygon");
  });

  it("blocks a connected wallet that differs from the hash-bound signer", async () => {
    await expect(submitPolymarketOrder({
      walletClient: {
        account: { address: "0x2222222222222222222222222222222222222222" },
        chain: { id: POLYMARKET_CHAIN_ID },
      } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("exact wallet");
  });

  it("rechecks the user's current location immediately before loading the exchange client", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(geoblockResponse({
      blocked: true,
      ip: "203.0.113.10",
      country: "US",
      region: "NY",
    }));
    await expect(submitPolymarketOrder({
      walletClient: {
        account: { address: "0x1111111111111111111111111111111111111111" },
        chain: { id: POLYMARKET_CHAIN_ID },
      } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("unavailable from your current location");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses the official CLOB V2 client with explicit EOA and funder bindings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(geoblockResponse({
      blocked: false,
      ip: "203.0.113.11",
      country: "CH",
      region: "ZH",
    }));
    const credentials = { key: "temporary-key", secret: "temporary-secret", passphrase: "temporary-passphrase" };
    const options: Array<Record<string, unknown>> = [];
    const orders: Array<Record<string, unknown>> = [];
    const orderOptions: Array<Record<string, unknown> | undefined> = [];
    const orderTypes: Array<string | undefined> = [];
    const walletClient = {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: POLYMARKET_CHAIN_ID },
    } as unknown as WalletClient;

    const receipt = await submitPolymarketOrder(
      { walletClient, order: prepared() },
      async () => clobV2Runtime({ credentials, options, orders, orderOptions, orderTypes }),
    );

    expect(receipt.orderId).toBe("order-v2");
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      host: "https://clob.polymarket.com",
      chain: POLYMARKET_CHAIN_ID,
      signer: walletClient,
      signatureType: 0,
      funderAddress: walletClient.account?.address,
      throwOnError: true,
    });
    expect(options[0]).not.toHaveProperty("creds");
    expect(options[1]).toHaveProperty("creds", credentials);
    expect(orders).toEqual([{
      tokenID: "123456789",
      amount: 5,
      side: "BUY",
      price: 0.57,
    }]);
    expect(orderOptions).toEqual([{ version: 2, tickSize: "0.01", negRisk: false }]);
    expect(orderTypes).toEqual(["FAK"]);
    expect(credentials).toEqual({ key: "", secret: "", passphrase: "" });
  });

  it("uses the same V2 account binding for close-only cancellation without geoblock", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const credentials = { key: "temporary-key", secret: "temporary-secret", passphrase: "temporary-passphrase" };
    const options: Array<Record<string, unknown>> = [];
    const cancellations: string[][] = [];
    const walletClient = {
      account: { address: "0x2222222222222222222222222222222222222222" },
      chain: { id: POLYMARKET_CHAIN_ID },
    } as unknown as WalletClient;

    const receipt = await cancelPolymarketOrders(
      { walletClient, orderIds: ["order_123"] },
      async () => clobV2Runtime({ credentials, options, cancellations }),
    );

    expect(receipt.status).toBe("cancelled");
    expect(cancellations).toEqual([["order_123"]]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(options[1]).toMatchObject({
      signatureType: 0,
      funderAddress: walletClient.account?.address,
      creds: credentials,
    });
    expect(credentials).toEqual({ key: "", secret: "", passphrase: "" });
  });

  it("checks the user's browser location before asking Matterhorn to prepare new-order terms", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
      "utf8",
    );
    const prepareOrderStart = source.indexOf("const prepareOrder = useCallback");
    const prepareOrder = source.slice(
      prepareOrderStart,
      source.indexOf("const signAndSubmit = useCallback", prepareOrderStart),
    );
    expect(prepareOrder).toContain('if (tradeAction !== "CANCEL")');
    expect(prepareOrder).toContain("await assertPolymarketUserCanPlaceOrders()");
    expect(prepareOrder.indexOf("await assertPolymarketUserCanPlaceOrders()"))
      .toBeLessThan(prepareOrder.indexOf("fetchMatterhornApiJson<PolymarketSellPreviewResponse>"));
  });

  it("uses an explicit live-order confirmation phrase", () => {
    expect(POLYMARKET_LIVE_CONFIRMATION).toBe("SUBMIT POLYMARKET ORDER");
    expect(POLYMARKET_CANCEL_CONFIRMATION).toBe("CANCEL POLYMARKET ORDERS");
    expect(POLYMARKET_CANCEL_ALL_CONFIRMATION).toBe("CANCEL ALL POLYMARKET ORDERS");
    expect(POLYMARKET_COLLATERAL_SYMBOL).toBe("pUSD");
  });
});
