import { describe, expect, test } from "bun:test";
import {
  auditBittensorReadiness,
  buildBittensorExtrinsicPreviewCard,
  buildBittensorPlanCards,
  buildBittensorQuoteCard,
  buildBittensorReadinessCard,
  buildBittensorSigningHandoffCard,
  buildBittensorSidecarHealthCard,
  buildBittensorValidatorComparisonCards,
  buildBittensorWalletCard,
  buildBittensorWatchEvaluationCards,
  buildBittensorQuote,
  capabilityFromSubnet,
  compareBittensorValidators,
  checkSubtensorSidecarHealth,
  createBittensorSigningHandoff,
  createBittensorWatch,
  evaluateBittensorWatch,
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

process.env.BITTENSOR_WATCHLIST_DISABLE_PERSISTENCE = "1";

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

  test("uses configured sidecar for live-read shaped subnet, wallet, and quote data", async () => {
    const previousSidecar = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    const previousFetch = globalThis.fetch;
    process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = "http://matterhorn-sidecar.test";

    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/subnets")) {
        return json({
          source: "matterhorn-sidecar-mock",
          subnets: [{
            netuid: 77,
            name: "Image subnet",
            symbol: "SN77",
            category: "Creative AI",
            description: "Generate image and media outputs.",
            priceTao: 0.25,
            emission: 0.2,
            tempo: 360,
            source: "matterhorn-sidecar-mock",
            block: 123,
            freshness: "mock",
          }],
        });
      }
      if (url.endsWith("/subnets/77/dynamic")) {
        return json({
          netuid: 77,
          name: "Image subnet",
          symbol: "SN77",
          description: "Generate image and media outputs.",
          priceTao: 0.25,
          emission: 0.2,
          tempo: 360,
          source: "matterhorn-sidecar-mock",
          block: 124,
          freshness: "mock",
        });
      }
      if (url.endsWith("/subnets/77/metagraph")) {
        return json({
          netuid: 77,
          source: "matterhorn-sidecar-mock",
          block: 124,
          n: 1,
          totalStake: 500,
          neurons: [{
            uid: 9,
            hotkey: VALID_SS58,
            coldkey: VALID_SS58,
            stake: 500,
            trust: 0.8,
            dividends: 0.2,
            validator_permit: true,
          }],
        });
      }
      if (url.includes("/wallet/")) {
        return json({
          ss58Address: VALID_SS58,
          taoBalance: 3,
          stakedTao: 2,
          estimatedValueTao: 5,
          providerStatus: "ok",
          source: "matterhorn-sidecar-mock",
          block: 124,
          freshness: "mock",
          stakePositions: [{
            netuid: 77,
            subnetName: "Image subnet",
            validatorHotkey: VALID_SS58,
            alphaAmount: 8,
            taoValue: 2,
            slippageRisk: "low",
          }],
        });
      }
      if (url.endsWith("/extrinsics/quote")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body.netuid).toBe(77);
        return json({
          action: "stake",
          netuid: 77,
          amountTao: 1,
          priceTao: 0.25,
          idealAlpha: 4,
          expectedAlpha: 3.98,
          feeTao: 0.0001,
          slippageBps: 50,
          rateTolerance: 0.005,
          source: "matterhorn-sidecar-mock",
          block: 124,
          freshness: "mock",
          warnings: ["Mock sidecar quote."],
          requiresExternalSignature: true,
        });
      }
      return json({});
    }) as typeof fetch;

    try {
      const provider = new TaoAppBittensorProvider();
      const subnets = await provider.listSubnets();
      expect(subnets[0]?.netuid).toBe(77);
      expect(subnets[0]?.source).toBe("matterhorn-sidecar-mock");

      const detail = await provider.getSubnet(77);
      expect(detail.priceTao).toBe(0.25);
      expect(detail.metagraphSummary.block).toBe(124);
      expect(detail.topValidators[0]?.hotkey).toBe(VALID_SS58);

      const wallet = await provider.getWallet(VALID_SS58);
      expect(wallet.providerStatus).toBe("ok");
      expect(wallet.source).toBe("matterhorn-sidecar-mock");
      expect(wallet.stakePositions[0]?.netuid).toBe(77);
      expect(buildBittensorWalletCard(wallet).items.some((item) => item.label === "Source")).toBe(true);

      const quote = await provider.quoteAction({ action: "stake", netuid: 77, amountTao: "1", validatorHotkey: VALID_SS58 });
      expect(quote.priceTao).toBe(0.25);
      expect(quote.idealAlpha).toBe(4);
      expect(quote.expectedAlpha).toBe(3.98);
      expect(quote.source).toBe("matterhorn-sidecar-mock");
      expect(buildBittensorQuoteCard(quote).items.some((item) => item.label === "Ideal alpha")).toBe(true);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousSidecar === undefined) {
        delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
      } else {
        process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = previousSidecar;
      }
    }
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

describe("compareBittensorValidators", () => {
  test("returns safe validator comparison cards for a subnet", async () => {
    const comparison = await compareBittensorValidators({ netuid: 14, strategy: "balanced", limit: 3 });
    expect(comparison.netuid).toBe(14);
    expect(comparison.warnings.join(" ")).toContain("not a recommendation");
    const cards = buildBittensorValidatorComparisonCards(comparison);
    expect(cards[0]?.kind).toBe("validator_selection");
    expect(JSON.stringify(cards)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
  });

  test("warns when requested validator hotkeys are not in the provider sample", async () => {
    const comparison = await compareBittensorValidators({ netuid: 14, hotkeys: [VALID_SS58], strategy: "safety" });
    expect(comparison.candidates).toEqual([]);
    expect(comparison.warnings.join(" ")).toContain("requested validator hotkeys");
    expect(buildBittensorValidatorComparisonCards(comparison)[0]?.tone).toBe("warning");
  });
});

describe("auditBittensorReadiness", () => {
  test("runs the Bittensor readiness gate without secret-shaped fields", async () => {
    const report = await auditBittensorReadiness();
    expect(["pass", "warning", "fail"]).toContain(report.status);
    expect(report.checks.some((check) => check.id === "chat_intents")).toBe(true);
    expect(report.checks.some((check) => check.id === "signing_safety")).toBe(true);
    const card = buildBittensorReadinessCard(report);
    expect(card.kind).toBe("readiness_report");
    expect(JSON.stringify({ report, card })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
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

  test("creates a checksumed desktop signing handoff", async () => {
    const preview = await prepareBittensorExtrinsic({
      action: "stake",
      netuid: 14,
      amountTao: "1",
      hotkey: VALID_SS58,
    });
    const handoff = createBittensorSigningHandoff(preview);
    expect(handoff.id).toContain("bt-handoff");
    expect(handoff.payloadSha256).toHaveLength(64);
    expect(handoff.suggestedFilename).toContain("bittensor-stake-subnet-14");
    expect(handoff.instructions.join(" ")).toContain("SHA-256");
    expect(buildBittensorSigningHandoffCard(handoff).kind).toBe("signing_handoff");
  });

  test("rejects handoff payloads with disallowed signing-material fields", async () => {
    const preview = await prepareBittensorExtrinsic({
      action: "stake",
      netuid: 14,
      amountTao: "1",
      hotkey: VALID_SS58,
    });
    expect(() => createBittensorSigningHandoff({
      ...preview,
      unsignedPayload: {
        ...preview.unsignedPayload,
        secretSeed: "do-not-accept",
      },
    })).toThrow("disallowed");
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

  test("evaluates watch entries into chat cards", async () => {
    const watch = createBittensorWatch({ kind: "wallet", ss58Address: VALID_SS58, label: "Watch wallet" });
    const evaluation = await evaluateBittensorWatch(watch);
    expect(evaluation.watch.id).toBe(watch.id);
    expect(["ok", "warning", "unavailable"]).toContain(evaluation.status);
    const card = buildBittensorWatchEvaluationCards([evaluation])[0];
    expect(card?.kind).toBe("watchlist");
    expect(card?.items.some((item) => item.label === "Status")).toBe(true);
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

  test("reports sanitized sidecar health when no sidecar is configured", async () => {
    const previous = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    const health = await checkSubtensorSidecarHealth();
    expect(health.status).toBe("unconfigured");
    expect(health.reachable).toBe(false);
    expect(JSON.stringify(health)).not.toContain("127.0.0.1");
    const card = buildBittensorSidecarHealthCard(health);
    expect(card.kind).toBe("signer_status");
    if (previous !== undefined) {
      process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = previous;
    }
  });
});
