import { describe, expect, test } from "bun:test";
import {
  buildBittensorQuote,
  isValidSs58Address,
  parseAmountTao,
  TaoAppBittensorProvider,
} from "./bittensor.js";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";

describe("isValidSs58Address", () => {
  test("accepts watch-only SS58-style public addresses", () => {
    expect(isValidSs58Address(VALID_SS58)).toBe(true);
  });

  test("rejects hex, whitespace, short, and forbidden base58 characters", () => {
    expect(isValidSs58Address("0x0000000000000000000000000000000000000000")).toBe(false);
    expect(isValidSs58Address("hello world")).toBe(false);
    expect(isValidSs58Address("5abc")).toBe(false);
    expect(isValidSs58Address("5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uO0")).toBe(false);
  });
});

describe("parseAmountTao", () => {
  test("accepts positive numeric input", () => {
    expect(parseAmountTao("1.25")).toBe(1.25);
    expect(parseAmountTao(2)).toBe(2);
  });

  test("rejects empty, zero, negative, and non-numeric input", () => {
    expect(parseAmountTao("")).toBeNull();
    expect(parseAmountTao("0")).toBeNull();
    expect(parseAmountTao("-1")).toBeNull();
    expect(parseAmountTao("seed phrase")).toBeNull();
  });
});

describe("buildBittensorQuote", () => {
  test("builds quote-only staking guidance with external signature requirement", () => {
    const quote = buildBittensorQuote(
      { action: "stake", netuid: 14, amountTao: "2", validatorHotkey: VALID_SS58 },
      {
        netuid: 14,
        name: "TAOHash",
        symbol: "SN14",
        category: "Compute and infrastructure",
        benefitSummary: "Test subnet",
        ownerColdkey: null,
        ownerHotkey: null,
        priceTao: 0.5,
        emission: null,
        tempo: null,
        updatedAt: "2026-06-09T00:00:00.000Z",
        source: "test",
      },
    );

    expect(quote.requiresExternalSignature).toBe(true);
    expect(quote.expectedAlpha).toBe(4);
    expect(quote.feeTao).toBeGreaterThan(0);
    expect(quote.warnings.join(" ")).toContain("cannot sign or broadcast");
  });

  test("warns when staking cannot estimate alpha", () => {
    const quote = buildBittensorQuote({ action: "stake", netuid: 1, amountTao: "1" });
    expect(quote.expectedAlpha).toBeNull();
    expect(quote.warnings.join(" ")).toContain("Live subnet price was unavailable");
  });
});

describe("TaoAppBittensorProvider", () => {
  test("returns provider-unavailable wallet state without TAO_APP_API_KEY", async () => {
    const previous = process.env.TAO_APP_API_KEY;
    delete process.env.TAO_APP_API_KEY;
    const provider = new TaoAppBittensorProvider();
    const wallet = await provider.getWallet(VALID_SS58);
    expect(wallet.providerStatus).toBe("provider_unavailable");
    expect(wallet.stakePositions).toEqual([]);
    expect(wallet.message).toContain("TAO_APP_API_KEY");
    if (previous !== undefined) process.env.TAO_APP_API_KEY = previous;
  });
});

