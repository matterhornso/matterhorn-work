import { describe, expect, test } from "bun:test";
import {
  HyperliquidInfoProvider,
  executeHyperliquidChatWorkflow,
  extractHyperliquidOrderInput,
  findForbiddenHyperliquidCredentialInput,
  isValidHyperliquidAddress,
  planHyperliquidChat,
  prepareHyperliquidOrderPreview,
  type HyperliquidProvider,
} from "./hyperliquid.js";

const ADDRESS = "0x0000000000000000000000000000000000000001";

function mockFetcher() {
  return async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    let payload: unknown;
    if (body.type === "meta") {
      payload = {
        universe: [
          { name: "BTC", szDecimals: 5, maxLeverage: 50 },
          { name: "ETH", szDecimals: 4, maxLeverage: 50 },
        ],
      };
    } else if (body.type === "allMids") {
      payload = { BTC: "65000", ETH: "3500" };
    } else if (body.type === "clearinghouseState") {
      payload = {
        marginSummary: { accountValue: "1000" },
        crossMarginSummary: { accountValue: "1000" },
        withdrawable: "500",
        assetPositions: [{ position: { coin: "BTC", szi: "0.1" } }],
      };
    } else if (body.type === "openOrders") {
      payload = [{ coin: "BTC", oid: 1 }];
    } else if (body.type === "l2Book") {
      payload = {
        levels: [
          [{ px: "64999", sz: "1.2" }],
          [{ px: "65001", sz: "0.8" }],
        ],
      };
    } else {
      payload = {};
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return payload;
      },
      async text() {
        return JSON.stringify(payload);
      },
    };
  };
}

function provider(): HyperliquidProvider {
  return new HyperliquidInfoProvider({ infoUrl: "https://example.test/info", fetcher: mockFetcher() as never });
}

describe("Hyperliquid read/preview safety", () => {
  test("validates public account addresses only", () => {
    expect(isValidHyperliquidAddress(ADDRESS)).toBe(true);
    expect(isValidHyperliquidAddress("0x123")).toBe(false);
    expect(isValidHyperliquidAddress("seed phrase")).toBe(false);
  });

  test("rejects credential-shaped payload keys", () => {
    expect(findForbiddenHyperliquidCredentialInput({ nested: { apiSecret: "nope" } })).toBe("nested.apiSecret");
    expect(findForbiddenHyperliquidCredentialInput({ address: ADDRESS })).toBeNull();
  });

  test("classifies ordinary chat intents", () => {
    expect(planHyperliquidChat({ message: "show my Hyperliquid account" })).toBe("account");
    expect(planHyperliquidChat({ message: "show BTC orderbook" })).toBe("orderbook");
    expect(planHyperliquidChat({ message: "preview buying 0.1 BTC at 65000" })).toBe("order_preview");
    expect(planHyperliquidChat({ message: "list markets" })).toBe("discover");
  });

  test("extracts order preview fields from natural language", () => {
    const input = extractHyperliquidOrderInput({ message: "preview buying 0.1 BTC at 65000" });
    expect(input.asset).toBe("BTC");
    expect(input.side).toBe("buy");
    expect(input.size).toBe(0.1);
    expect(input.price).toBe(65000);
  });

  test("lists markets with live-shaped source labels", async () => {
    const markets = await provider().listMarkets(1);
    expect(markets).toHaveLength(1);
    expect(markets[0]?.asset).toBe("BTC");
    expect(markets[0]?.markPx).toBe(65000);
    expect(markets[0]?.source.source).toBe("hyperliquid.info");
  });

  test("reads account state without signing material", async () => {
    const result = await executeHyperliquidChatWorkflow({ message: "show my positions", address: ADDRESS }, { provider: provider() });
    expect(result.execution).toBe("read_only");
    expect(result.cards[0]?.kind).toBe("hyperliquid_account_snapshot");
    expect(JSON.stringify(result)).not.toMatch(/private|secret|mnemonic|seed/i);
  });

  test("asks one clarification for missing account address", async () => {
    const result = await executeHyperliquidChatWorkflow({ message: "show my Hyperliquid account" }, { provider: provider() });
    expect(result.requiresClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("account address");
  });

  test("builds a non-submittable order preview", async () => {
    const preview = await prepareHyperliquidOrderPreview({ asset: "BTC", side: "buy", size: 0.1, price: 65000 }, provider());
    expect(preview.version).toBe("matterhorn.market.action-preview.v1");
    expect(preview.venue).toBe("hyperliquid");
    expect(preview.canSubmit).toBe(false);
    expect(preview.previewSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.signerPolicy).toBe("api_wallet_required");
    expect(preview.warnings.join(" ")).toContain("does not submit");
  });

  test("chat preview never accepts API secrets", async () => {
    const result = await executeHyperliquidChatWorkflow(
      { message: "preview buy 0.1 BTC", asset: "BTC", side: "buy", size: 0.1, apiSecret: "bad" } as never,
      { provider: provider() },
    );
    expect(result.execution).toBe("unsupported");
    expect(result.warnings.join(" ")).toContain("apiSecret");
  });
});
