import { describe, expect, test } from "bun:test";
import {
  buildBittensorExtrinsicPreviewCard,
  buildBittensorPlanCards,
  buildBittensorQuoteCard,
  buildBittensorWalletCard,
  buildBittensorQuote,
  capabilityFromSubnet,
  createBittensorWatch,
  getConfiguredSubnetAdapter,
  getBittensorSignerStatus,
  getSubtensorSidecarStatus,
  isValidSs58Address,
  planBittensorChat,
  prepareBittensorExtrinsic,
  parseAmountTao,
  scoreBittensorSubnetForGoal,
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

describe("planBittensorChat", () => {
  test("classifies beginner education requests", () => {
    const plan = planBittensorChat({ message: "I'm new to Bittensor, explain coldkeys and hotkeys" });
    expect(plan.intent).toBe("learn");
    expect(plan.safetyNotes.join(" ")).toContain("never asks");
  });

  test("classifies subnet discovery requests and extracts netuids", () => {
    const plan = planBittensorChat({ message: "Compare subnet 14 with SN1 for compute" });
    expect(plan.intent).toBe("discover");
    expect(plan.netuids).toEqual([14, 1]);
    expect(plan.responseCards).toContain("subnet_comparison");
  });

  test("asks for wallet address when wallet intent is missing SS58", () => {
    const plan = planBittensorChat({ message: "Show me my TAO wallet" });
    expect(plan.intent).toBe("wallet");
    expect(plan.requiresClarification).toBe(true);
    expect(plan.clarificationQuestion).toContain("SS58");
  });
});

describe("Bittensor chat cards", () => {
  test("builds plan cards that preserve safety context", () => {
    const plan = planBittensorChat({ message: "Stake 1 TAO to subnet 14" });
    const cards = buildBittensorPlanCards(plan);
    expect(cards[0]?.kind).toBe("subnet_result");
    expect(cards[0]?.warnings?.join(" ")).toContain("external signer");
  });

  test("builds wallet and quote cards for chat rendering", () => {
    const walletCard = buildBittensorWalletCard({
      ss58Address: VALID_SS58,
      taoBalance: 2,
      stakePositions: [{
        netuid: 14,
        subnetName: "TAOHash",
        validatorHotkey: VALID_SS58,
        alphaAmount: 4,
        taoValue: 2,
        slippageRisk: "low",
      }],
      estimatedValueTao: 4,
      providerStatus: "ok",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    expect(walletCard.kind).toBe("wallet_snapshot");
    expect(walletCard.items.some((item) => item.label === "Free TAO")).toBe(true);

    const quoteCard = buildBittensorQuoteCard(buildBittensorQuote({ action: "stake", netuid: 14, amountTao: "1" }));
    expect(quoteCard.kind).toBe("staking_quote");
    expect(quoteCard.actions?.[0]?.kind).toBe("send_to_chat");
  });
});

describe("capabilityFromSubnet", () => {
  test("creates a universal capability manifest without requiring auth for read flows", () => {
    const capability = capabilityFromSubnet({
      netuid: 14,
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute and infrastructure",
      benefitSummary: "Compute subnet",
      ownerColdkey: null,
      ownerHotkey: null,
      priceTao: null,
      emission: null,
      tempo: null,
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "test",
    });
    expect(capability.netuid).toBe(14);
    expect(capability.supportedChatIntents).toContain("subnet_use");
    expect(capability.serviceAdapter).toBe("compute");
  });

  test("reflects configured service adapters without exposing auth values", () => {
    const previous = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
      netuid: 14,
      name: "Mock compute adapter",
      serviceAdapter: "compute",
      endpoint: "http://127.0.0.1:4040/invoke",
      requiredAuth: "api_key",
      authEnv: "BITTENSOR_MOCK_ADAPTER_TOKEN",
      costModel: "provider_priced",
      safetyNotes: ["Mock adapter safety note."],
    }]);

    const adapter = getConfiguredSubnetAdapter(14);
    const capability = capabilityFromSubnet({
      netuid: 14,
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute and infrastructure",
      benefitSummary: "Compute subnet",
      ownerColdkey: null,
      ownerHotkey: null,
      priceTao: null,
      emission: null,
      tempo: null,
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "test",
    });

    expect(adapter?.name).toBe("Mock compute adapter");
    expect(capability.requiredAuth).toBe("api_key");
    expect(capability.costModel).toBe("provider_priced");
    expect(JSON.stringify(capability)).not.toContain("BITTENSOR_MOCK_ADAPTER_TOKEN");

    if (previous === undefined) {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    } else {
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previous;
    }
  });
});

describe("scoreBittensorSubnetForGoal", () => {
  test("scores subnet categories from ordinary user goals", () => {
    const creative = scoreBittensorSubnetForGoal({
      netuid: 22,
      name: "Creative subnet",
      symbol: "SN22",
      category: "Creative AI",
      benefitSummary: "Generate images and media outputs.",
      ownerColdkey: null,
      ownerHotkey: null,
      priceTao: null,
      emission: 1,
      tempo: null,
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "test",
    }, "which subnet helps with image generation?");
    const compute = scoreBittensorSubnetForGoal({
      netuid: 14,
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute and infrastructure",
      benefitSummary: "Compute subnet",
      ownerColdkey: null,
      ownerHotkey: null,
      priceTao: null,
      emission: 1,
      tempo: null,
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "test",
    }, "which subnet helps with image generation?");
    expect(creative.score).toBeGreaterThan(compute.score);
    expect(creative.reasons.join(" ")).toContain("creative");
  });
});

describe("prepareBittensorExtrinsic", () => {
  test("builds unsigned external-signer preview", async () => {
    const preview = await prepareBittensorExtrinsic({
      action: "stake",
      netuid: 14,
      amountTao: "1",
      hotkey: VALID_SS58,
    });
    expect(preview.requiresExternalSignature).toBe(true);
    expect(preview.action).toBe("stake");
    expect(preview.unsignedPayload.action).toBe("stake");
    expect(preview.signer.canSign).toBe(false);
    expect(preview.warnings.join(" ")).toContain("external");
    expect(buildBittensorExtrinsicPreviewCard(preview).actions?.[0]?.kind).toBe("sign_externally");
  });
});

describe("signer and watch helpers", () => {
  test("reports non-custodial signer status", () => {
    const signer = getBittensorSignerStatus(VALID_SS58);
    expect(signer.available).toBe(true);
    expect(signer.canSign).toBe(false);
    expect(signer.address).toBe(VALID_SS58);
  });

  test("creates watchlist entries without secret fields", () => {
    const watch = createBittensorWatch({ kind: "subnet", netuid: 14, label: "Watch subnet 14" });
    expect(watch.id).toContain("bt-watch");
    expect(watch.netuid).toBe(14);
    expect(JSON.stringify(watch)).not.toMatch(/seed|private|mnemonic/i);
  });

  test("reports sidecar mode from configuration without exposing endpoint details", () => {
    const previous = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = "http://127.0.0.1:9944";
    const status = getSubtensorSidecarStatus();
    expect(status.configured).toBe(true);
    expect(status.canRead).toBe(true);
    expect(JSON.stringify(status)).not.toContain("127.0.0.1");
    if (previous === undefined) {
      delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    } else {
      process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = previous;
    }
  });
});
