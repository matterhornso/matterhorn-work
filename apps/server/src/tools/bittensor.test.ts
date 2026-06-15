import { describe, expect, test } from "bun:test";
import {
  analyzeBittensorSubnetIntelligence,
  analyzeBittensorValidatorIntelligence,
  analyzeBittensorWalletIntelligence,
  auditBittensorReadiness,
  auditBittensorSubnetAdapterRuntimeApprovals,
  buildBittensorAdapterApprovalAuditCard,
  buildBittensorAdapterApprovalTemplateCard,
  buildBittensorAdapterCanaryOperatorPacketCard,
  buildBittensorAdapterManifestValidationCard,
  buildBittensorAdapterResultValidationCard,
  buildBittensorSubnetAdapterRuntimeApprovalTemplate,
  buildBittensorAdapterEvidenceBundleCard,
  buildBittensorAdapterEvidenceReviewCard,
  buildBittensorAdapterLaunchGateCard,
  buildBittensorAdapterMarketplaceCard,
  buildBittensorAdapterOnboardingCard,
  buildBittensorExtrinsicPreviewCard,
  buildBittensorInvocationPreviewCard,
  buildBittensorInvocationCard,
  buildBittensorPlanCards,
  buildBittensorQuoteCard,
  buildBittensorReadinessCard,
  buildBittensorReadinessOperatorCard,
  buildBittensorReadinessOperatorReport,
  buildBittensorDecisionBrief,
  buildBittensorDecisionBriefCard,
  buildBittensorWatchPolicyPreset,
  buildBittensorWatchPolicyPresetCard,
  buildBittensorSigningHandoffCard,
  buildBittensorSigningSafetyChecklist,
  buildBittensorSigningSafetyChecklistCard,
  buildBittensorSigningReceiptCard,
  buildBittensorSidecarHealthCard,
  buildBittensorStakingPlanCard,
  buildBittensorValidatorComparisonCards,
  buildBittensorValidatorIntelligenceCard,
  buildBittensorWalletCard,
  buildBittensorSubnetServiceAdapterContract,
  buildBittensorSubnetServiceAdapterContractTestFixtures,
  buildBittensorSubnetAdapterEvidenceBundle,
  buildBittensorSubnetAdapterEvidenceExport,
  buildBittensorSubnetAdapterCanaryOperatorPacket,
  buildBittensorSubnetAdapterCanaryPacketExport,
  buildBittensorSubnetAdapterConformanceExport,
  buildBittensorSubnetAdapterOperatorHandoff,
  buildBittensorSubnetAdapterPreflightPacket,
  buildBittensorSubnetAdapterPreflightPacketExport,
  buildBittensorSubnetAdapterDryRunExport,
  buildBittensorSubnetIntelligenceCard,
  buildBittensorWalletIntelligenceCard,
  buildBittensorWatchDigest,
  buildBittensorWatchEvaluationCards,
  buildBittensorQuote,
  capabilityFromSubnet,
  buildBittensorStakingPlan,
  compareBittensorValidators,
  checkBittensorSubnetAdapterLaunchGate,
  checkSubtensorSidecarHealth,
  createBittensorSigningHandoff,
  createBittensorSigningReceipt,
  createBittensorWatch,
  doctorBittensorSubnetAdapters,
  evaluateBittensorWatch,
  executeBittensorChatWorkflow,
  getConfiguredSubnetAdapter,
  getBittensorChatContext,
  getBittensorSignerStatus,
  getBittensorSubnetAdapterCanaryReviewChecklist,
  getBittensorSubnetAdapterCandidateProfiles,
  getBittensorSubnetAdapterManifestExamples,
  getBittensorSubnetAdapterSpec,
  getBittensorSubnetAdapterTemplates,
  getSubtensorSidecarStatus,
  isValidSs58Address,
  invokeBittensorSubnet,
  listBittensorSubnetAdapterMarketplace,
  planBittensorSubnetAdapterOnboarding,
  planBittensorChat,
  probeBittensorSubnetAdapterConformance,
  previewBittensorSubnetInvocation,
  prepareBittensorExtrinsic,
  parseAmountTao,
  reviewBittensorSubnetAdapterEvidence,
  runBittensorSubnetAdapterDryRun,
  runBittensorSubnetServiceAdapterContractTests,
  scoreBittensorSubnetForGoal,
  submitSignedBittensorExtrinsic,
  TaoAppBittensorProvider,
  validateBittensorSubnetServiceAdapterContract,
  validateBittensorSubnetAdapterManifest,
  validateBittensorSubnetAdapterResult,
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

async function withMockedFivePromptSidecar(run: () => Promise<void>): Promise<void> {
  const previousSidecar = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
  const previousFetch = globalThis.fetch;
  process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = "http://matterhorn-five-prompt-sidecar.test";

  const json = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/subnets")) {
      return json({
        source: "matterhorn-five-prompt-mock",
        subnets: [
          {
            netuid: 77,
            name: "Image subnet",
            symbol: "SN77",
            category: "Creative AI",
            description: "Generate image and media outputs.",
            priceTao: 0.25,
            emission: 0.2,
            tempo: 360,
            source: "matterhorn-five-prompt-mock",
            block: 777,
            freshness: "fresh",
          },
          {
            netuid: 14,
            name: "TAOHash",
            symbol: "SN14",
            category: "Compute and infrastructure",
            description: "Compute subnet.",
            priceTao: 0.5,
            emission: 0.1,
            tempo: 360,
            source: "matterhorn-five-prompt-mock",
            block: 777,
            freshness: "fresh",
          },
        ],
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
        source: "matterhorn-five-prompt-mock",
        block: 778,
        freshness: "fresh",
      });
    }
    if (url.endsWith("/subnets/77/metagraph")) {
      return json({
        netuid: 77,
        source: "matterhorn-five-prompt-mock",
        block: 778,
        n: 2,
        totalStake: 900,
        neurons: [
          {
            uid: 9,
            hotkey: VALID_SS58,
            coldkey: VALID_SS58,
            stake: 600,
            trust: 0.88,
            dividends: 0.2,
          },
          {
            uid: 10,
            hotkey: "5FHneW46xGXgs5mUiveU4sbTyGBzmtoW4h4KYxqsdXw4nq8Z",
            coldkey: VALID_SS58,
            stake: 300,
            trust: 0.7,
            dividends: 0.12,
          },
        ],
      });
    }
    if (url.includes("/wallet/")) {
      return json({
        ss58Address: VALID_SS58,
        taoBalance: 3,
        estimatedValueTao: 10,
        providerStatus: "ok",
        source: "matterhorn-five-prompt-mock",
        block: 778,
        freshness: "fresh",
        stakePositions: [
          {
            netuid: 77,
            subnetName: "Image subnet",
            validatorHotkey: VALID_SS58,
            alphaAmount: 8,
            taoValue: 2,
            slippageRisk: "low",
          },
          {
            netuid: 14,
            subnetName: "TAOHash",
            validatorHotkey: "5FHneW46xGXgs5mUiveU4sbTyGBzmtoW4h4KYxqsdXw4nq8Z",
            alphaAmount: 20,
            taoValue: 5,
            slippageRisk: "medium",
          },
        ],
      });
    }
    if (url.endsWith("/extrinsics/quote")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.action !== "transfer") expect(body.netuid).toBe(77);
      return json({
        action: body.action ?? "stake",
        netuid: body.netuid ?? null,
        amountTao: Number(body.amountTao ?? 1),
        priceTao: 0.25,
        idealAlpha: 4,
        expectedAlpha: 3.98,
        feeTao: 0.0001,
        slippageBps: 50,
        rateTolerance: 0.005,
        source: "matterhorn-five-prompt-mock",
        block: 778,
        freshness: "fresh",
        warnings: ["Mock sidecar quote."],
        requiresExternalSignature: true,
      });
    }
    if (url.endsWith("/extrinsics/prepare")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return json({
        unsignedPayload: {
          chain: "bittensor",
          network: "finney",
          action: body.action,
          netuid: body.netuid,
          amountTao: body.amountTao,
          hotkey: body.hotkey,
          destination: body.destination,
        },
        feeTao: 0.0001,
        slippageBps: 50,
        expectedAlpha: 3.98,
        warnings: ["Mock sidecar prepare."],
      });
    }
    return json({});
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSidecar === undefined) {
      delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    } else {
      process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = previousSidecar;
    }
  }
}

describe("executeBittensorChatWorkflow", () => {
  test("answers arbitrary Bittensor learning prompts", async () => {
    const result = await executeBittensorChatWorkflow({ message: "explain coldkeys, hotkeys, alpha, and Dynamic TAO like I am new" });
    expect(result.execution).toBe("answered");
    expect(result.plan.intent).toBe("learn");
    expect(result.cards[0]?.title).toBe("Bittensor explainer");
    expect(result.cards[0]?.items.some((item) => item.label === "Alpha")).toBe(true);
  });

  test("explains any named subnet through the chat executor", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "explain subnet 77 and how it benefits my work" });
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("subnet_result");
      expect(result.responseText).toContain("Image subnet");
    });
  });

  test("asks one clarification question for show my TAO without SS58", async () => {
    const result = await executeBittensorChatWorkflow({ message: "show my TAO" });
    expect(result.execution).toBe("clarification_required");
    expect(result.requiresClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("SS58");
    expect(result.cards[0]?.kind).toBe("subnet_result");
  });

  test("answers show my TAO with a wallet snapshot card", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "show my TAO", ss58Address: VALID_SS58 });
      expect(result.execution).toBe("answered");
      expect(result.plan.intent).toBe("wallet");
      expect(result.cards[0]?.kind).toBe("wallet_snapshot");
      expect(result.responseText).toContain("3");
      expect(result.context?.ss58Address).toBe(VALID_SS58);
      expect(result.context?.id).toContain("bt-chat");
      expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
    });
  });

  test("reuses public chat context for follow-up wallet prompts", async () => {
    await withMockedFivePromptSidecar(async () => {
      const first = await executeBittensorChatWorkflow({ message: "show my TAO", ss58Address: VALID_SS58 });
      const contextId = first.context?.id ?? "";
      expect(getBittensorChatContext(contextId)?.ss58Address).toBe(VALID_SS58);

      const followUp = await executeBittensorChatWorkflow({ message: "where am I staked?", contextId });
      expect(followUp.execution).toBe("answered");
      expect(followUp.cards.some((card) => card.title === "Stake positions")).toBe(true);
      expect(followUp.context?.id).toBe(contextId);
      expect(followUp.context?.lastIntent).toBe("wallet");
    });
  });

  test("answers where am I staked with sorted stake-position context", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "where am I staked?", ss58Address: VALID_SS58 });
      const stakeCard = result.cards.find((card) => card.title === "Stake positions");
      const positions = stakeCard?.data?.positions as Array<{ netuid: number }> | undefined;
      expect(result.execution).toBe("answered");
      expect(stakeCard?.kind).toBe("wallet_snapshot");
      expect(positions?.[0]?.netuid).toBe(14);
    });
  });

  test("answers subnet intelligence prompts with explainable public-data reports", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "analyze risk on subnet 77" });
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("intelligence_report");
      const intelligence = result.data.intelligence as { score?: number; copilotActions?: unknown[]; watchSuggestions?: unknown[] };
      expect(intelligence.score).toBeGreaterThan(0);
      expect(intelligence.copilotActions?.length).toBeGreaterThan(0);
      expect(intelligence.watchSuggestions?.length).toBeGreaterThan(0);
      expect(result.cards[0]?.actions?.[0]?.payload?.prompt).toContain("Compare validators");
      expect(result.responseText).toContain("public Bittensor data");
      expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
    });
  });

  test("answers wallet intelligence prompts with concentration and freshness context", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "analyze my TAO portfolio risk", ss58Address: VALID_SS58 });
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("intelligence_report");
      const intelligence = result.data.intelligence as { subnetCount?: number; validatorExposure?: unknown[]; copilotActions?: unknown[]; watchSuggestions?: unknown[] };
      expect(intelligence.subnetCount).toBe(2);
      expect(intelligence.validatorExposure?.length).toBeGreaterThan(0);
      expect(intelligence.copilotActions?.length).toBeGreaterThan(0);
      expect(intelligence.watchSuggestions?.length).toBeGreaterThan(0);
      expect(result.cards[0]?.actions?.some((action) => String(action.payload?.prompt ?? "").includes("Where am I staked"))).toBe(true);
      expect(result.warnings.join(" ")).toContain("watch-only");
    });
  });

  test("discovers image-generation subnets with comparison cards", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "which subnet is useful for image generation?" });
      expect(result.execution).toBe("answered");
      expect(result.plan.intent).toBe("discover");
      expect(result.cards[0]?.kind).toBe("subnet_comparison");
      expect(result.cards[0]?.title).toContain("Image");
    });
  });

  test("discovers arbitrary subnet goals without special-casing the prompt", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "find Bittensor subnets for decentralized media workflows", limit: 3 });
      expect(result.execution).toBe("answered");
      expect(result.plan.intent).toBe("discover");
      expect(result.cards[0]?.kind).toBe("subnet_comparison");
    });
  });

  test("previews configured subnet service adapters before chat invocation", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousToken = process.env.BITTENSOR_IMAGE_ADAPTER_TOKEN;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      const previousFetch = globalThis.fetch;
      process.env.BITTENSOR_IMAGE_ADAPTER_TOKEN = "adapter-token";
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock image adapter",
        serviceAdapter: "creative_media",
        endpoint: "https://adapter.invalid/invoke",
        requiredAuth: "api_key",
        authEnv: "BITTENSOR_IMAGE_ADAPTER_TOKEN",
        costModel: "provider_priced",
        safetyNotes: ["Mock image adapter safety note."],
      }]);
      let adapterCalls = 0;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith("https://adapter.invalid")) {
          adapterCalls += 1;
          throw new Error("adapter should not be called during preview");
        }
        return previousFetch(input, init);
      }) as typeof fetch;

      try {
        const result = await executeBittensorChatWorkflow({ message: "use subnet 77 to generate an image" });
        const preview = result.data.preview as { supported?: boolean; requiredAuth?: string; costModel?: string; requestSha256?: string; confirmationPrompt?: string } | undefined;
        const nextStep = result.data.nextStep as { type?: string; prompt?: string; invokeArgs?: { netuid?: number; previewRequestSha256?: string } } | undefined;
        expect(result.execution).toBe("unsigned_preview");
        expect(preview?.supported).toBe(true);
        expect(preview?.requiredAuth).toBe("api_key");
        expect(preview?.costModel).toBe("provider_priced");
        expect(preview?.requestSha256).toHaveLength(64);
        expect(preview?.confirmationPrompt).toContain(preview?.requestSha256 ?? "missing");
        expect(result.responseText).toContain("confirm the exact request SHA-256");
        expect(nextStep?.type).toBe("confirm_subnet_invocation");
        expect(nextStep?.prompt).toContain(preview?.requestSha256 ?? "missing");
        expect(nextStep?.invokeArgs?.netuid).toBe(77);
        expect(nextStep?.invokeArgs?.previewRequestSha256).toBe(preview?.requestSha256);
        expect(result.cards[0]?.kind).toBe("subnet_result");
        expect(result.cards[0]?.title).toContain("service review");
        expect(result.cards[0]?.actions?.[0]?.label).toBe("Confirm service call");
        expect((result.cards[0]?.actions?.[0]?.payload as { invokeArgs?: { previewRequestSha256?: string } } | undefined)?.invokeArgs?.previewRequestSha256).toBe(preview?.requestSha256);
        expect(result.cards[0]?.items.some((item) => item.label === "Request SHA-256")).toBe(true);
        expect(adapterCalls).toBe(0);
        expect(JSON.stringify(result)).not.toContain("BITTENSOR_IMAGE_ADAPTER_TOKEN");
        expect(JSON.stringify(result)).not.toContain("adapter-token");
      } finally {
        globalThis.fetch = previousFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousToken === undefined) {
          delete process.env.BITTENSOR_IMAGE_ADAPTER_TOKEN;
        } else {
          process.env.BITTENSOR_IMAGE_ADAPTER_TOKEN = previousToken;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
      }
    });
  });

  test("returns structured fallback guidance when subnet service adapter is unsupported", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      try {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        const result = await executeBittensorChatWorkflow({ message: "use subnet 77 to generate an image" });
        const preview = result.data.preview as { supported?: boolean } | undefined;
        const nextStep = result.data.nextStep as { type?: string; fallbackIntents?: string[] } | undefined;
        expect(result.execution).toBe("unsupported");
        expect(preview?.supported).toBe(false);
        expect(result.responseText).toContain("I can still explain, compare, monitor");
        expect(nextStep?.type).toBe("unsupported_adapter");
        expect(nextStep?.fallbackIntents).toContain("explain");
        expect(result.cards[0]?.kind).toBe("unsupported_adapter");
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
      }
    });
  });

  test("blocks non-allowlisted HTTPS adapters before previewed chat invocation can call fetch", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousFetch = globalThis.fetch;
      let adapterCalls = 0;
      try {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Blocked HTTPS adapter",
          serviceAdapter: "inference",
          endpoint: "https://adapter.invalid/invoke",
          requiredAuth: "none",
          costModel: "provider_priced",
          safetyNotes: ["Blocked adapter safety note."],
        }]);
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).startsWith("https://adapter.invalid")) {
            adapterCalls += 1;
            throw new Error("adapter should not be called when not allowlisted");
          }
          return previousFetch(input, init);
        }) as typeof fetch;
        const result = await executeBittensorChatWorkflow({ message: "use subnet 77 for inference" });
        const preview = result.data.preview as { supported?: boolean; warnings?: string[] } | undefined;
        expect(result.execution).toBe("unsupported");
        expect(preview?.supported).toBe(false);
        expect(result.warnings.join(" ")).toContain("BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST");
        expect(adapterCalls).toBe(0);
      } finally {
        globalThis.fetch = previousFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
      }
    });
  });

  test("blocks real HTTPS adapters by default even when endpoint is allowlisted", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      try {
        delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Reviewed HTTPS adapter",
          serviceAdapter: "inference",
          endpoint: "https://adapter.invalid/invoke",
          requiredAuth: "none",
          costModel: "provider_priced",
          safetyNotes: ["HTTPS adapter safety note."],
        }]);
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task: "Use this adapter.",
          ss58Address: VALID_SS58,
        });
        expect(preview.supported).toBe(false);
        expect(preview.warnings.join(" ")).toContain("BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1");
        expect(preview.consequenceSummary).toContain("will not invoke");
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
      }
    });
  });

  test("requires exact request approval before real HTTPS adapter invocation", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      const previousApprovals = process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
      const previousFetch = globalThis.fetch;
      let adapterCalls = 0;
      try {
        process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
        delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Reviewed HTTPS adapter",
          serviceAdapter: "inference",
          endpoint: "https://adapter.invalid/invoke",
          requiredAuth: "none",
          costModel: "provider_priced",
          safetyNotes: ["HTTPS adapter safety note."],
        }]);
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).startsWith("https://adapter.invalid")) {
            adapterCalls += 1;
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          return previousFetch(input, init);
        }) as typeof fetch;
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task: "Use this adapter.",
          ss58Address: VALID_SS58,
        });
        expect(preview.supported).toBe(true);
        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task: "Use this adapter.",
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        expect(invocation.supported).toBe(false);
        expect(invocation.warnings.join(" ")).toContain("BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON");
        expect(adapterCalls).toBe(0);
      } finally {
        globalThis.fetch = previousFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
        if (previousApprovals === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = previousApprovals;
        }
      }
    });
  });

  test("audits real adapter request approvals without exposing full hashes", () => {
    const previousApprovals = process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
    try {
      process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = JSON.stringify([
        {
          netuid: 77,
          serviceAdapter: "data_search",
          requestSha256: "a".repeat(64),
          approvedBy: "operator",
          approvedAt: "2026-06-09T00:00:00.000Z",
          expiresAt: "2999-01-01T00:00:00.000Z",
          reason: "Reviewed canary fixture.",
        },
        { netuid: 18, serviceAdapter: "inference", requestSha256: "too-short" },
      ]);
      const report = auditBittensorSubnetAdapterRuntimeApprovals();
      expect(report.kind).toBe("bittensor_subnet_adapter_runtime_approval_audit");
      expect(report.status).toBe("warning");
      expect(report.activeCount).toBe(1);
      expect(report.invalidCount).toBe(1);
      expect(report.entries[0]?.requestSha256Prefix).toBe("a".repeat(12));
      const card = buildBittensorAdapterApprovalAuditCard(report);
      expect(card.kind).toBe("adapter_approval_audit");
      expect(card.items.find((item) => item.label === "Active approvals")?.value).toBe("1");
      expect(card.actions?.[0]?.payload?.prompt).toContain("Review active");
      expect(JSON.stringify(report)).not.toContain("a".repeat(64));
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
    } finally {
      if (previousApprovals === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = previousApprovals;
      }
    }
  });

  test("builds short-lived real adapter approval templates without invoking services", () => {
    const template = buildBittensorSubnetAdapterRuntimeApprovalTemplate({
      netuid: 77,
      serviceAdapter: "data_search",
      requestSha256: "B".repeat(64),
      approvedBy: "operator",
      reason: "Reviewed canary fixture and rollback owner.",
      ttlMinutes: 15,
    });
    expect(template.kind).toBe("bittensor_subnet_adapter_runtime_approval_template");
    expect(template.approval.netuid).toBe(77);
    expect(template.approval.serviceAdapter).toBe("data_search");
    expect(template.approval.requestSha256).toBe("b".repeat(64));
    expect(template.env.key).toBe("BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON");
    expect(JSON.parse(template.env.value)[0].requestSha256).toBe("b".repeat(64));
    expect(template.warnings.join(" ")).toContain("does not invoke");
    expect(template.nextActions.join(" ")).toContain("BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1");
    const card = buildBittensorAdapterApprovalTemplateCard(template);
    expect(card.kind).toBe("adapter_approval_template");
    expect(card.items.find((item) => item.label === "Request SHA-256")?.value).toBe(`${"b".repeat(12)}...`);
    expect(card.actions?.[0]?.kind).toBe("copy_payload");
    expect(card.actions?.[1]?.payload?.prompt).toContain("Audit Bittensor");
    expect(JSON.stringify(template)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
    expect(JSON.stringify(card)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
  });

  test("rejects approval templates for universal adapters and malformed hashes", () => {
    expect(() => buildBittensorSubnetAdapterRuntimeApprovalTemplate({
      netuid: 77,
      serviceAdapter: "universal",
      requestSha256: "b".repeat(64),
    })).toThrow("serviceAdapter must be a direct subnet adapter kind");
    expect(() => buildBittensorSubnetAdapterRuntimeApprovalTemplate({
      netuid: 77,
      serviceAdapter: "unsupported",
      requestSha256: "b".repeat(64),
    })).toThrow("serviceAdapter must be a direct subnet adapter kind");
    expect(() => buildBittensorSubnetAdapterRuntimeApprovalTemplate({
      netuid: 77,
      serviceAdapter: "data_search",
      requestSha256: "too-short",
    })).toThrow("requestSha256 must be a 64-character SHA-256 hex string");
  });

  test("runs the mock data-search adapter through preview, confirmation hash, and invocation", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      const task = "Search for public Bittensor subnet documentation patterns.";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock data search adapter",
        serviceAdapter: "data_search",
        endpoint: "mock://data-search",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock data search adapter safety note."],
      }]);

      try {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        const disabledPreview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        expect(disabledPreview.supported).toBe(false);
        expect(disabledPreview.adapterContract.endpointConfigured).toBe(false);

        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        expect(preview.supported).toBe(true);
        expect(preview.adapter).toBe("data_search");
        expect(preview.requiredAuth).toBe("none");
        expect(preview.costModel).toBe("free_read");
        expect(preview.adapterContract.endpointConfigured).toBe(true);
        expect(preview.contractValidation.ok).toBe(true);

        const missingReview = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        expect(missingReview.supported).toBe(false);
        expect(missingReview.message).toContain("reviewed request SHA-256");

        const mismatchedReview = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
          reviewedRequestSha256: "0".repeat(64),
        });
        expect(mismatchedReview.supported).toBe(false);
        expect(mismatchedReview.warnings.join(" ")).toContain("does not match");

        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        const output = invocation.result.output as {
          ok?: boolean;
          mode?: string;
          adapterKind?: string;
          requestSha256?: string;
          output?: {
            results?: Array<{ title?: string; source?: string }>;
          };
          usage?: { units?: number | null; label?: string | null } | null;
          costEstimate?: { amount?: number | null; currency?: string | null; model?: string } | null;
        } | undefined;
        expect(invocation.supported).toBe(true);
        expect(invocation.adapter).toBe("data_search");
        expect(invocation.result.requestSha256).toBe(preview.requestSha256);
        expect(output?.ok).toBe(true);
        expect(output?.mode).toBe("mock");
        expect(output?.adapterKind).toBe("data_search");
        expect(output?.requestSha256).toBe(preview.requestSha256);
        expect(output?.output?.results?.[0]?.source).toBe("matterhorn-mock-subnet-adapter");
        expect(output?.usage?.label).toBe("mock_request");
        expect(output?.costEstimate?.amount).toBe(0);
        expect(output?.costEstimate?.currency).toBe("TAO");
        expect(JSON.stringify({ preview, invocation })).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|adapter-token|BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("normalizes mocked HTTP adapter responses through the adapter runner envelope", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      const previousApprovals = process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
      const sidecarFetch = globalThis.fetch;
      const task = "Search for subnet service adapter examples.";
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "HTTP data search adapter",
        serviceAdapter: "data_search",
        endpoint: "https://adapter.invalid/invoke",
        requiredAuth: "none",
        costModel: "provider_priced",
        safetyNotes: ["HTTP adapter safety note."],
      }]);
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://adapter.invalid")) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          expect(body.requestSha256).toHaveLength(64);
          return new Response(JSON.stringify({
            ok: true,
            message: "HTTP adapter fixture response.",
            result: { answer: "fixture" },
            warnings: ["HTTP fixture warning."],
            usage: { units: 2, label: "fixture_units" },
            costEstimate: { amount: 0.01, currency: "TAO", model: "provider_priced" },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return sidecarFetch(input, init);
      }) as typeof fetch;

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = JSON.stringify([{
          netuid: 77,
          serviceAdapter: "data_search",
          requestSha256: preview.requestSha256,
          approvedBy: "test",
          approvedAt: "2026-06-09T00:00:00.000Z",
        }]);
        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        const output = invocation.result.output as {
          ok?: boolean;
          mode?: string;
          message?: string;
          output?: { result?: { answer?: string } };
          warnings?: string[];
          usage?: { units?: number | null; label?: string | null } | null;
          costEstimate?: { amount?: number | null; currency?: string | null; model?: string | null } | null;
        } | undefined;
        expect(invocation.supported).toBe(true);
        expect(output?.mode).toBe("http");
        expect(output?.message).toBe("HTTP adapter fixture response.");
        expect(output?.output?.result?.answer).toBe("fixture");
        expect(output?.warnings?.[0]).toBe("HTTP fixture warning.");
        expect(output?.usage?.units).toBe(2);
        expect(output?.costEstimate?.model).toBe("provider_priced");
        expect(JSON.stringify({ preview, invocation })).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
      } finally {
        globalThis.fetch = sidecarFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
        if (previousApprovals === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = previousApprovals;
        }
      }
    });
  });

  test("fails closed when HTTP adapter responses exceed the configured size limit", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousLimit = process.env.BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      const previousApprovals = process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
      const sidecarFetch = globalThis.fetch;
      const task = "Return an oversized adapter response.";
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES = "8192";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "HTTP oversized adapter",
        serviceAdapter: "data_search",
        endpoint: "https://adapter.invalid/invoke",
        requiredAuth: "none",
        costModel: "provider_priced",
        safetyNotes: ["HTTP adapter safety note."],
      }]);
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://adapter.invalid")) {
          return new Response(JSON.stringify({
            ok: true,
            message: "oversized",
            result: { text: "x".repeat(20_000) },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return sidecarFetch(input, init);
      }) as typeof fetch;

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = JSON.stringify([{
          netuid: 77,
          serviceAdapter: "data_search",
          requestSha256: preview.requestSha256,
          approvedBy: "test",
          approvedAt: "2026-06-09T00:00:00.000Z",
        }]);
        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        const output = invocation.result.output as { ok?: boolean; message?: string; warnings?: string[] } | undefined;
        expect(preview.supported).toBe(true);
        expect(invocation.supported).toBe(false);
        expect(output?.ok).toBe(false);
        expect(output?.message).toContain("size limit");
        expect(output?.warnings?.join(" ")).toContain("size limit");
      } finally {
        globalThis.fetch = sidecarFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousLimit === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES = previousLimit;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
        if (previousApprovals === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = previousApprovals;
        }
      }
    });
  });

  test("runs the mock inference adapter through the same reviewed-hash runner path", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      const task = "Answer this Bittensor subnet question in one sentence.";
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock inference adapter",
        serviceAdapter: "inference",
        endpoint: "mock://inference",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock inference adapter safety note."],
      }]);

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
        });
        expect(preview.supported).toBe(true);
        expect(preview.adapter).toBe("inference");
        expect(preview.adapterContract.supportedIntents).toContain("service_call");

        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task,
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        const output = invocation.result.output as {
          ok?: boolean;
          mode?: string;
          adapterKind?: string;
          output?: { completion?: string; model?: string };
          usage?: { units?: number | null; label?: string | null } | null;
          costEstimate?: { amount?: number | null; currency?: string | null } | null;
        } | undefined;
        expect(invocation.supported).toBe(true);
        expect(invocation.adapter).toBe("inference");
        expect(output?.ok).toBe(true);
        expect(output?.mode).toBe("mock");
        expect(output?.adapterKind).toBe("inference");
        expect(output?.output?.completion).toContain("Mock inference response");
        expect(output?.output?.model).toBe("matterhorn-mock-inference-v0");
        expect(output?.usage?.label).toBe("mock_tokens");
        expect(output?.costEstimate?.amount).toBe(0);
        const card = buildBittensorInvocationCard(invocation);
        expect(card.kind).toBe("subnet_result");
        expect(card.summary).toContain("Mock inference response");
        expect(card.items.some((item) => item.label === "Adapter mode" && item.value === "Mock")).toBe(true);
        expect(card.items.some((item) => item.label === "Request SHA-256")).toBe(true);
        expect(card.items.some((item) => item.label === "Output" && item.value.includes("Mock inference response"))).toBe(true);
        expect(card.items.some((item) => item.label === "Usage" && item.value.includes("mock_tokens"))).toBe(true);
        expect(card.items.some((item) => item.label === "Cost" && item.value.includes("TAO"))).toBe(true);
        expect(JSON.stringify({ preview, invocation })).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("refuses subnet adapter invocation when the reviewed hash belongs to different task text", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock inference adapter",
        serviceAdapter: "inference",
        endpoint: "mock://inference",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock inference adapter safety note."],
      }]);

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task: "Original reviewed prompt.",
          ss58Address: VALID_SS58,
        });
        const tampered = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task: "Changed prompt after review.",
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        expect(tampered.supported).toBe(false);
        expect(tampered.message).toContain("reviewed request SHA-256");
        expect(tampered.result.receivedRequestSha256).toBe(preview.requestSha256);
        expect(tampered.result.expectedRequestSha256).not.toBe(preview.requestSha256);
        expect(JSON.stringify(tampered)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("fails closed for unsupported mock adapter endpoints after review", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Unsupported mock adapter",
        serviceAdapter: "inference",
        endpoint: "mock://unsupported",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Unsupported mock adapter safety note."],
      }]);

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task: "Try unsupported mock adapter.",
          ss58Address: VALID_SS58,
        });
        expect(preview.supported).toBe(true);
        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task: "Try unsupported mock adapter.",
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        const output = invocation.result.output as { ok?: boolean; mode?: string; message?: string } | undefined;
        expect(invocation.supported).toBe(false);
        expect(output?.ok).toBe(false);
        expect(output?.mode).toBe("mock");
        expect(output?.message).toContain("Unsupported mock subnet service adapter endpoint");
        expect(invocation.warnings.join(" ")).toContain("Unsupported mock adapter safety note");
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("uses HTTP adapter auth without exposing auth env names or token values", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousToken = process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
      const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      const previousApprovals = process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
      const sidecarFetch = globalThis.fetch;
      process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = "adapter-token";
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "HTTP inference adapter",
        serviceAdapter: "inference",
        endpoint: "https://adapter.invalid/invoke",
        requiredAuth: "api_key",
        authEnv: "BITTENSOR_HTTP_ADAPTER_TOKEN",
        costModel: "provider_priced",
        safetyNotes: ["HTTP inference adapter safety note."],
      }]);
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://adapter.invalid")) {
          const headers = init?.headers as Headers | Record<string, string> | undefined;
          const authorization = headers instanceof Headers ? headers.get("Authorization") : headers?.Authorization;
          expect(authorization).toBe("Bearer adapter-token");
          return new Response(JSON.stringify({
            ok: true,
            message: "HTTP auth fixture response.",
            result: { answer: "authorized" },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return sidecarFetch(input, init);
      }) as typeof fetch;

      try {
        const preview = await previewBittensorSubnetInvocation(77, {
          intent: "service_call",
          task: "Use HTTP auth adapter safely.",
          ss58Address: VALID_SS58,
        });
        process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = JSON.stringify([{
          netuid: 77,
          serviceAdapter: "inference",
          requestSha256: preview.requestSha256,
          approvedBy: "test",
          approvedAt: "2026-06-09T00:00:00.000Z",
        }]);
        const invocation = await invokeBittensorSubnet(77, {
          intent: "service_call",
          task: "Use HTTP auth adapter safely.",
          ss58Address: VALID_SS58,
          reviewedRequestSha256: preview.requestSha256,
        });
        expect(invocation.supported).toBe(true);
        const serialized = JSON.stringify({ preview, invocation });
        expect(serialized).not.toContain("adapter-token");
        expect(serialized).not.toContain("BITTENSOR_HTTP_ADAPTER_TOKEN");
        expect(serialized).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
      } finally {
        globalThis.fetch = sidecarFetch;
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousToken === undefined) {
          delete process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
        } else {
          process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = previousToken;
        }
        if (previousAllowlist === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
        }
        if (previousReal === undefined) {
          delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
        }
        if (previousApprovals === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON = previousApprovals;
        }
      }
    });
  });

  test("reports adapter doctor warning when no subnet service adapters are configured", () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    try {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const report = doctorBittensorSubnetAdapters();
      expect(report.kind).toBe("bittensor_subnet_adapter_doctor");
      expect(report.status).toBe("warning");
      expect(report.rawConfigured).toBe(false);
      expect(report.entries).toHaveLength(0);
      expect(report.warnings.join(" ")).toContain("No subnet service adapters are configured");
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
    }
  });

  test("lists subnet adapter marketplace status without invoking services or leaking credentials", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousToken = process.env.BITTENSOR_FIXTURE_ADAPTER_TOKEN;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_FIXTURE_ADAPTER_TOKEN = "super-secret-token-value";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 14,
        name: "Mock compute",
        serviceAdapter: "compute",
        endpoint: "mock://compute",
        requiredAuth: "api_key",
        costModel: "provider_priced",
        timeoutMs: 1000,
        authEnv: "BITTENSOR_FIXTURE_ADAPTER_TOKEN",
        safetyNotes: ["Use public task text only."],
      }]);
      const marketplace = await listBittensorSubnetAdapterMarketplace({ adapter: "compute", netuid: 14, limit: 3 });
      expect(marketplace.kind).toBe("bittensor_subnet_adapter_marketplace");
      expect(marketplace.entries[0]?.status).toBe("mock_ready");
      expect(marketplace.summary.mockReady).toBeGreaterThan(0);
      expect(marketplace.warnings.join(" ")).toContain("does not authorize real subnet service execution");
      const card = buildBittensorAdapterMarketplaceCard(marketplace);
      expect(card.kind).toBe("adapter_marketplace");
      expect(card.actions?.[0]?.payload?.prompt).toContain("operator handoff");
      expect(JSON.stringify({ marketplace, card })).not.toMatch(/super-secret-token-value|BITTENSOR_FIXTURE_ADAPTER_TOKEN|privateKey|seed phrase|mnemonic/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousToken === undefined) {
        delete process.env.BITTENSOR_FIXTURE_ADAPTER_TOKEN;
      } else {
        process.env.BITTENSOR_FIXTURE_ADAPTER_TOKEN = previousToken;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("returns the machine-readable subnet adapter spec without credential values", () => {
    const spec = getBittensorSubnetAdapterSpec();
    expect(spec.kind).toBe("bittensor_subnet_adapter_spec");
    expect(spec.version).toBe("matterhorn.bittensor.adapter.v1");
    expect(spec.supportedServiceAdapters).toContain("data_search");
    expect(spec.invocationContract.previewRequired).toBe(true);
    expect(spec.invocationContract.exactRequestHashRequired).toBe(true);
    expect(spec.invocationContract.missingHashBehavior).toBe("reject");
    expect(spec.forbiddenFields).toContain("privateKey");
    expect(spec.responseLimits.defaultMaxBytes).toBeGreaterThan(0);
    expect(JSON.stringify(spec)).not.toMatch(/super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}|credentialValue=/i);
  });

  test("validates safe subnet adapter manifests without invoking services", () => {
    const validation = validateBittensorSubnetAdapterManifest({
      version: "matterhorn.bittensor.adapter.v1",
      name: "Example data search adapter",
      netuid: 18,
      serviceAdapter: "data_search",
      supportedIntents: ["explain", "metagraph", "service_call"],
      safeModeRequired: true,
      requestHashRequired: true,
      maxResponseBytes: 64_000,
      healthStatus: "ok",
      requiredAuth: "api_key",
      costModel: "provider_priced",
      endpointConfigured: true,
      requestSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          previewRequestSha256: { type: "string" },
        },
      },
      resultSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          results: { type: "array", items: { type: "object" } },
        },
      },
      privacy: {
        sendsTaskText: true,
        sendsSs58Address: false,
        sendsWalletData: false,
        sendsKeyMaterial: false,
      },
      safetyNotes: ["No wallet data, key material, host token, or credential values are accepted."],
    });
    expect(validation.kind).toBe("bittensor_subnet_adapter_manifest_validation");
    expect(validation.status).toBe("pass");
    expect(validation.serviceCallReady).toBe(true);
    expect(validation.errors).toHaveLength(0);
    const card = buildBittensorAdapterManifestValidationCard(validation);
    expect(card.kind).toBe("adapter_manifest_validation");
    expect(card.tone).toBe("good");
    expect(card.items.find((item) => item.label === "Service call")?.value).toBe("Ready");
    expect(JSON.stringify(validation)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
  });

  test("blocks unsafe subnet adapter manifests before conformance or invocation", () => {
    const validation = validateBittensorSubnetAdapterManifest({
      version: "matterhorn.bittensor.adapter.v1",
      netuid: 18,
      serviceAdapter: "data_search",
      supportedIntents: ["service_call"],
      safeModeRequired: true,
      requestHashRequired: true,
      maxResponseBytes: 64_000,
      healthStatus: "ok",
      endpointConfigured: true,
      requestSchema: {
        type: "object",
        properties: {
          privateKey: { type: "string" },
        },
      },
      resultSchema: { type: "object" },
      privacy: {
        sendsWalletData: false,
        sendsKeyMaterial: false,
      },
      safetyNotes: ["Unsafe fixture should be blocked."],
    });
    expect(validation.status).toBe("fail");
    expect(validation.serviceCallReady).toBe(false);
    expect(validation.errors.join(" ")).toContain("secret-shaped field");
    const card = buildBittensorAdapterManifestValidationCard(validation);
    expect(card.tone).toBe("danger");
    expect(card.items.find((item) => item.label === "Service call")?.value).toBe("Blocked");
  });

  test("returns self-validating adapter manifest examples for safe onboarding", () => {
    const report = getBittensorSubnetAdapterManifestExamples({ adapter: "inference", netuid: 4 });
    expect(report.kind).toBe("bittensor_subnet_adapter_manifest_examples");
    expect(report.examples).toHaveLength(1);
    expect(report.examples[0]?.adapter).toBe("inference");
    expect(report.examples[0]?.netuid).toBe(4);
    expect(report.examples[0]?.validation.status).toBe("pass");
    expect(report.examples[0]?.validation.serviceCallReady).toBe(true);
    const card = buildBittensorAdapterManifestValidationCard(report.examples[0]!.validation);
    expect(card.kind).toBe("adapter_manifest_validation");
    expect(card.tone).toBe("good");
    expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}|credentialValue/i);
  });

  test("validates safe adapter result envelopes before canary review", () => {
    const validation = validateBittensorSubnetAdapterResult({
      mode: "mock",
      requestSha256: "c".repeat(64),
      output: "Here is a bounded adapter result.",
      warnings: [],
      usage: { inputTokens: 12, outputTokens: 8 },
      costEstimate: { amount: 0, currency: "TAO" },
    });
    expect(validation.kind).toBe("bittensor_subnet_adapter_result_validation");
    expect(validation.status).toBe("pass");
    expect(validation.summary.requestSha256Prefix).toBe("c".repeat(12));
    expect(validation.summary.outputPresent).toBe(true);
    const card = buildBittensorAdapterResultValidationCard(validation);
    expect(card.kind).toBe("adapter_result_validation");
    expect(card.tone).toBe("good");
    expect(card.items.find((item) => item.label === "Output")?.value).toBe("Present");
  });

  test("blocks adapter result envelopes that leak secret-shaped fields or values", () => {
    const validation = validateBittensorSubnetAdapterResult({
      mode: "https",
      requestSha256: "c".repeat(64),
      output: "-----BEGIN PRIVATE KEY-----",
      warnings: [],
      privateKey: "do-not-return",
    });
    expect(validation.status).toBe("fail");
    expect(validation.errors.join(" ")).toContain("secret-shaped field");
    expect(validation.errors.join(" ")).toContain("secret-shaped value");
    const card = buildBittensorAdapterResultValidationCard(validation);
    expect(card.tone).toBe("danger");
  });

  test("builds adapter preflight packets from manifest and result samples", () => {
    const manifest = getBittensorSubnetAdapterManifestExamples({ adapter: "data_search", netuid: 18 }).examples[0]!.manifest;
    const packet = buildBittensorSubnetAdapterPreflightPacket({
      manifest,
      result: {
        mode: "mock",
        requestSha256: "d".repeat(64),
        output: "Bounded preflight output.",
        warnings: [],
      },
    });
    expect(packet.kind).toBe("bittensor_subnet_adapter_preflight_packet");
    expect(packet.status).toBe("pass");
    expect(packet.readyForConformance).toBe(true);
    expect(packet.readyForCanaryEvidence).toBe(true);
    expect(packet.manifestValidation.status).toBe("pass");
    expect(packet.resultValidation?.status).toBe("pass");
    expect(JSON.stringify(packet)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}|credentialValue/i);
  });

  test("exports preflight packets as redacted markdown without raw payloads", () => {
    const manifest = getBittensorSubnetAdapterManifestExamples({ adapter: "data_search", netuid: 18 }).examples[0]!.manifest;
    const preflightExport = buildBittensorSubnetAdapterPreflightPacketExport({
      manifest,
      result: {
        mode: "mock",
        requestSha256: "d".repeat(64),
        output: "Bounded preflight output.",
        warnings: [],
      },
    });
    expect(preflightExport.kind).toBe("bittensor_subnet_adapter_preflight_packet_export");
    expect(preflightExport.markdown).toContain("Bittensor Adapter Preflight Packet");
    expect(preflightExport.markdown).toContain("Raw manifest and result payloads are intentionally omitted");
    expect(preflightExport.markdown).not.toContain("Bounded preflight output");
    expect(JSON.stringify(preflightExport)).not.toMatch(/privateKey|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}|credentialValue/i);
  });

  test("returns real adapter onboarding templates without credential values", () => {
    const previousToken = process.env.BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN;
    try {
      process.env.BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN = "super-secret-token-value";
      const report = getBittensorSubnetAdapterTemplates({ adapter: "data_search", netuid: 18 });
      expect(report.kind).toBe("bittensor_subnet_adapter_template_report");
      expect(report.templates).toHaveLength(1);
      const template = report.templates[0];
      expect(template?.adapter).toBe("data_search");
      expect(template?.config.netuid).toBe(18);
      expect(template?.env.credentialEnv).toBe("BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN");
      expect(template?.env.credentialValue).toBe("<set-outside-matterhorn>");
      expect(template?.preflightSteps.join(" ")).toContain("bittensor_preview_subnet_invocation");
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("super-secret-token-value");
      expect(serialized).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      if (previousToken === undefined) {
        delete process.env.BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN;
      } else {
        process.env.BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN = previousToken;
      }
    }
  });

  test("returns no-execution adapter candidate profiles with canary contracts", () => {
    const report = getBittensorSubnetAdapterCandidateProfiles({ adapter: "data_search", netuid: 18 });
    expect(report.kind).toBe("bittensor_subnet_adapter_candidate_profile_report");
    expect(report.profiles).toHaveLength(1);
    expect(report.profiles[0]?.adapter).toBe("data_search");
    expect(report.profiles[0]?.netuid).toBe(18);
    expect(report.profiles[0]?.noExecutionCanary.kind).toBe("matterhorn.bittensor.adapter.no_execution_canary.v1");
    expect(report.profiles[0]?.noExecutionCanary.expectedMetadata.requestHashRequired).toBe(true);
    expect(report.profiles[0]?.requiredMatterhornGates.join(" ")).toContain("bittensor_probe_subnet_adapter_conformance");
    expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
  });

  test("returns a manual canary review checklist without invoking adapters", () => {
    const checklist = getBittensorSubnetAdapterCanaryReviewChecklist({ adapter: "data_search", netuid: 18 });
    expect(checklist.kind).toBe("bittensor_subnet_adapter_canary_review");
    expect(checklist.candidateProfile?.adapter).toBe("data_search");
    expect(checklist.fixtureTask).toContain("Canary fixture");
    expect(checklist.reviewItems.find((item) => item.id === "preview_hash")?.blockerIfMissing).toBe(true);
    expect(checklist.stopConditions.join(" ")).toContain("Stop if metadata conformance does not pass");
    expect(checklist.allowedNextActions.join(" ")).toContain("exact request SHA-256");
    expect(JSON.stringify(checklist)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
  });

  test("builds adapter evidence bundle for review without authorizing execution", async () => {
    const bundle = await buildBittensorSubnetAdapterEvidenceBundle({ adapter: "data_search", netuid: 18 });
    expect(bundle.kind).toBe("bittensor_subnet_adapter_evidence_bundle");
    expect(bundle.onboarding.kind).toBe("bittensor_subnet_adapter_onboarding_plan");
    expect(bundle.launchGate.kind).toBe("bittensor_subnet_adapter_launch_gate");
    expect(bundle.preflight.kind).toBe("bittensor_subnet_adapter_preflight_packet");
    expect(bundle.preflight.readyForConformance).toBe(true);
    expect(bundle.preflight.readyForCanaryEvidence).toBe(true);
    expect(bundle.canaryReview.kind).toBe("bittensor_subnet_adapter_canary_review");
    expect(bundle.requiredArtifacts.map((artifact) => artifact.id)).toContain("preflight_packet");
    expect(bundle.requiredArtifacts.map((artifact) => artifact.id)).toContain("operator_approval");
    expect(bundle.exportWarnings.join(" ")).toContain("does not authorize real subnet service execution");
    const card = buildBittensorAdapterEvidenceBundleCard(bundle);
    expect(card.kind).toBe("adapter_evidence_bundle");
    expect(card.items.find((item) => item.label === "Preflight")?.value).toBe("Pass");
    expect(card.items.find((item) => item.label === "Required artifacts")?.value).toBe(String(bundle.requiredArtifacts.length));
    expect(card.actions?.[0]?.payload?.prompt).toContain("evidence bundle");
    expect(JSON.stringify(bundle)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
  });

  test("exports adapter evidence as redacted review markdown", async () => {
    const evidenceExport = await buildBittensorSubnetAdapterEvidenceExport({ adapter: "data_search", netuid: 18 });
    expect(evidenceExport.kind).toBe("bittensor_subnet_adapter_evidence_export");
    expect(evidenceExport.summary.requiredArtifactCount).toBeGreaterThan(0);
    expect(evidenceExport.summary.launchGateStatus).toBe("blocked");
    expect(evidenceExport.summary.preflightStatus).toBe("pass");
    expect(evidenceExport.summary.readyForConformance).toBe(true);
    expect(evidenceExport.summary.readyForCanaryEvidence).toBe(true);
    expect(evidenceExport.markdown).toContain("# Bittensor Subnet Adapter Evidence Export");
    expect(evidenceExport.markdown).toContain("Launch gate:");
    expect(evidenceExport.markdown).toContain("Preflight:");
    expect(evidenceExport.markdown).toContain("Preflight ready for canary evidence: yes");
    expect(evidenceExport.markdown).toContain("This export is evidence for review only");
    expect(evidenceExport.markdown).toContain("request SHA-256 confirmation");
    expect(evidenceExport.markdown).not.toContain("Evidence bundle preflight sample output");
    expect(evidenceExport.warnings.join(" ")).toContain("does not authorize real subnet service execution");
    expect(JSON.stringify(evidenceExport)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
  });

  test("reviews adapter evidence without authorizing invocation", async () => {
    const review = await reviewBittensorSubnetAdapterEvidence({ adapter: "data_search", netuid: 18 });
    expect(review.kind).toBe("bittensor_subnet_adapter_evidence_review");
    expect(review.status).toBe("blocked");
    expect(review.launchGateStatus).toBe("blocked");
    expect(review.requiredArtifactCount).toBeGreaterThan(0);
    expect(review.missingRequiredArtifactCount).toBeGreaterThan(0);
    expect(review.blockedReasons.join(" ")).toContain("Adapter doctor");
    expect(review.nextPrompt).toContain("unblock");
    expect(review.allowedNextActions.join(" ")).toContain("Do not invoke any subnet adapter");
    const card = buildBittensorAdapterEvidenceReviewCard(review);
    expect(card.kind).toBe("adapter_evidence_review");
    expect(card.tone).toBe("danger");
    expect(card.items.find((item) => item.label === "Missing required")?.value).toBe(String(review.missingRequiredArtifactCount));
    expect(card.actions?.[0]?.payload?.prompt).toContain("unblock");
    expect(JSON.stringify(review)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
  });

  test("builds blocked canary operator packets without approval templates", async () => {
    const packet = await buildBittensorSubnetAdapterCanaryOperatorPacket({
      adapter: "data_search",
      netuid: 77,
      requestSha256: "b".repeat(64),
    });
    expect(packet.kind).toBe("bittensor_subnet_adapter_canary_operator_packet");
    expect(packet.status).toBe("blocked");
    expect(packet.approvalTemplate).toBeNull();
    expect(packet.warnings.join(" ")).toContain("Evidence review is blocked");
    const card = buildBittensorAdapterCanaryOperatorPacketCard(packet);
    expect(card.kind).toBe("adapter_canary_packet");
    expect(card.actions?.some((action) => action.kind === "copy_payload")).toBe(false);
    expect(JSON.stringify(packet)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
    expect(JSON.stringify(card)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
  });

  test("builds approval-ready canary packets only after real adapter manual review gates", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
    const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
    const previousFetch = globalThis.fetch;
    const calls: string[] = [];
    try {
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Reviewed HTTPS adapter",
        serviceAdapter: "data_search",
        endpoint: "https://adapter.invalid/invoke",
        metadataEndpoint: "https://adapter.invalid/.well-known/matterhorn-bittensor-adapter.json",
        requiredAuth: "none",
        costModel: "provider_priced",
        safetyNotes: ["HTTPS adapter safety note."],
      }]);
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${String(init?.method ?? "GET")} ${String(input)}`);
        if (String(input).startsWith("https://adapter.invalid/.well-known")) {
          return Promise.resolve(new Response(JSON.stringify({
            version: "matterhorn.bittensor.adapter.v1",
            netuid: 77,
            serviceAdapter: "data_search",
            supportedIntents: ["service_call"],
            safeModeRequired: true,
            requestHashRequired: true,
            maxResponseBytes: 256000,
            healthStatus: "ok",
            privacy: { sendsWalletData: false, sendsKeyMaterial: false },
          }), { status: 200 }));
        }
        return previousFetch(input, init);
      }) as typeof fetch;
      const packet = await buildBittensorSubnetAdapterCanaryOperatorPacket({
        adapter: "data_search",
        netuid: 77,
        requestSha256: "c".repeat(64),
        ttlMinutes: 15,
      });
      const canaryPacketExport = await buildBittensorSubnetAdapterCanaryPacketExport({
        adapter: "data_search",
        netuid: 77,
        requestSha256: "c".repeat(64),
        ttlMinutes: 15,
      });
      expect(packet.status).toBe("approval_template_ready");
      expect(packet.approvalTemplate?.approval.requestSha256).toBe("c".repeat(64));
      expect(packet.evidenceReview.status).toBe("manual_real_canary_review_required");
      expect(canaryPacketExport.kind).toBe("bittensor_subnet_adapter_canary_packet_export");
      expect(canaryPacketExport.status).toBe("approval_template_ready");
      expect(canaryPacketExport.markdown).toContain("Full env value intentionally omitted");
      expect(canaryPacketExport.markdown).not.toContain("BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON=");
      expect(canaryPacketExport.markdown).not.toContain("c".repeat(64));
      expect(calls.every((call) => call.includes(".well-known"))).toBe(true);
      const card = buildBittensorAdapterCanaryOperatorPacketCard(packet);
      expect(card.kind).toBe("adapter_canary_packet");
      expect(card.actions?.[0]?.kind).toBe("copy_payload");
      expect(JSON.stringify(packet)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
      expect(JSON.stringify(card)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
      expect(JSON.stringify(canaryPacketExport)).not.toMatch(/super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}|BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON=/i);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousAllowlist === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
      }
      if (previousReal === undefined) {
        delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
      }
    }
  });

  test("builds one safe adapter onboarding plan before real execution", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    try {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const plan = await planBittensorSubnetAdapterOnboarding({ adapter: "data_search", netuid: 18 });
      expect(plan.kind).toBe("bittensor_subnet_adapter_onboarding_plan");
      expect(plan.status).toBe("needs_configuration");
      expect(plan.requested.adapter).toBe("data_search");
      expect(plan.candidateProfiles.profiles[0]?.noExecutionCanary.expectedMetadata.requestHashRequired).toBe(true);
      expect(plan.templates.templates[0]?.config.netuid).toBe(18);
      expect(plan.doctor.rawConfigured).toBe(false);
      expect(plan.gates.map((gate) => gate.id)).toContain("metadata_conformance");
      expect(plan.gates.find((gate) => gate.id === "service_execution")?.status).toBe("not_configured");
      expect(plan.nextActions.join(" ")).toContain("do not invoke real services yet");
      expect(JSON.stringify(plan)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
      const card = buildBittensorAdapterOnboardingCard(plan);
      expect(card.kind).toBe("adapter_onboarding");
      expect(card.items.find((item) => item.label === "Not configured")?.value).toBe("3");
      expect(card.actions?.[0]?.payload?.prompt).toContain("without enabling real execution");
      expect(JSON.stringify(card)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
    }
  });

  test("blocks adapter launch gate before configuration", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    try {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const report = await checkBittensorSubnetAdapterLaunchGate({ adapter: "data_search", netuid: 18 });
      expect(report.kind).toBe("bittensor_subnet_adapter_launch_gate");
      expect(report.status).toBe("blocked");
      expect(report.readyMockCount).toBe(0);
      expect(report.readyRealCount).toBe(0);
      expect(report.requirements.find((requirement) => requirement.id === "user_confirmation")?.status).toBe("manual_review");
      const card = buildBittensorAdapterLaunchGateCard(report);
      expect(card.kind).toBe("adapter_launch_gate");
      expect(card.tone).toBe("danger");
      expect(card.actions?.[0]?.payload?.prompt).toContain("unblock");
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
    }
  });

  test("marks launch gate mock-ready without enabling real adapters", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 18,
        name: "Mock data-search adapter",
        serviceAdapter: "data_search",
        endpoint: "mock://data-search",
        metadataEndpoint: "mock://data-search/metadata",
        requiredAuth: "none",
        costModel: "free_read",
        timeoutMs: 5000,
        safetyNotes: ["Mock adapter for launch rehearsal only."],
      }]);
      const report = await checkBittensorSubnetAdapterLaunchGate({ adapter: "data_search", netuid: 18 });
      expect(report.status).toBe("mock_ready");
      expect(report.readyMockCount).toBe(1);
      expect(report.readyRealCount).toBe(0);
      expect(report.requirements.find((requirement) => requirement.id === "real_adapter_review")?.status).toBe("not_configured");
      expect(report.nextActions.join(" ")).toContain("mock adapter dry-run");
      const card = buildBittensorAdapterLaunchGateCard(report);
      expect(card.kind).toBe("adapter_launch_gate");
      expect(card.tone).toBe("good");
      expect(card.actions?.[0]?.payload?.prompt).toContain("mock adapter dry-run");
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|super-secret-token-value/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("probes mock adapter conformance without user task execution", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock data-search adapter",
        serviceAdapter: "data_search",
        endpoint: "mock://data-search",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock adapter safety note."],
      }]);
      const report = await probeBittensorSubnetAdapterConformance({ netuid: 77 });
      expect(report.kind).toBe("bittensor_subnet_adapter_conformance");
      expect(report.status).toBe("pass");
      expect(report.passed).toBe(1);
      expect(report.cases[0]?.metadata?.requestHashRequired).toBe(true);
      expect(report.cases[0]?.checks.some((check) => check.id === "no_user_task" && check.status === "pass")).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("exports adapter conformance evidence without endpoints or raw metadata", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock data-search adapter",
        serviceAdapter: "data_search",
        endpoint: "mock://data-search",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock adapter safety note."],
      }]);
      const conformanceExport = await buildBittensorSubnetAdapterConformanceExport({ netuid: 77 });
      expect(conformanceExport.kind).toBe("bittensor_subnet_adapter_conformance_export");
      expect(conformanceExport.status).toBe("pass");
      expect(conformanceExport.summary.passed).toBe(1);
      expect(conformanceExport.markdown).toContain("Bittensor Adapter Conformance Export");
      expect(conformanceExport.markdown).toContain("No user task sent");
      expect(conformanceExport.markdown).toContain("Metadata request hash required: yes");
      expect(conformanceExport.markdown).not.toContain("mock://data-search");
      expect(conformanceExport.warnings.join(" ")).toMatch(/do(?:es)? not authorize real subnet service execution/i);
      expect(JSON.stringify(conformanceExport)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token|Bearer [A-Za-z0-9._-]{8,}/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("builds one redacted adapter operator handoff from evidence, conformance, and dry-run exports", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      try {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Mock data-search adapter",
          serviceAdapter: "data_search",
          endpoint: "mock://data-search",
          requiredAuth: "none",
          costModel: "free_read",
          safetyNotes: ["Mock adapter safety note."],
        }]);
        const handoff = await buildBittensorSubnetAdapterOperatorHandoff({
          adapter: "data_search",
          netuid: 77,
          task: "Operator handoff task with private context that must not appear.",
          ss58Address: VALID_SS58,
        });
        expect(handoff.kind).toBe("bittensor_subnet_adapter_operator_handoff");
        expect(handoff.status).toBe("mock_rehearsal_ready");
        expect(handoff.evidenceReview.status).toBe("mock_dry_run_ready");
        expect(handoff.conformanceExport.status).toBe("pass");
        expect(handoff.dryRunExport.status).toBe("pass");
        expect(handoff.markdown).toContain("Bittensor Adapter Operator Handoff");
        expect(handoff.markdown).toContain("Evidence review: mock_dry_run_ready");
        expect(handoff.markdown).toContain("Conformance: pass");
        expect(handoff.markdown).toContain("Dry-run: pass");
        expect(handoff.markdown).not.toContain("private context");
        expect(handoff.markdown).not.toContain("mock://data-search");
        expect(handoff.warnings.join(" ")).toMatch(/does not authorize real subnet service execution/i);
        expect(JSON.stringify(handoff)).not.toMatch(/privateKey|ADAPTER_TOKEN|adapter-token|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("routes ordinary adapter handoff chat prompts to the operator handoff packet", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      try {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Mock data-search adapter",
          serviceAdapter: "data_search",
          endpoint: "mock://data-search",
          requiredAuth: "none",
          costModel: "free_read",
          safetyNotes: ["Mock adapter safety note."],
        }]);
        const result = await executeBittensorChatWorkflow({
          message: "Build a data search adapter operator handoff packet for subnet 77.",
          netuid: 77,
        });
        expect(result.execution).toBe("answered");
        expect(result.responseText).toContain("adapter handoff");
        expect(result.cards[0]?.kind).toBe("adapter_operator_handoff");
        expect(result.data.handoff).toBeTruthy();
        expect(JSON.stringify(result)).not.toMatch(/privateKey|ADAPTER_TOKEN|adapter-token|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("routes ordinary adapter marketplace chat prompts to the marketplace card", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 14,
        name: "Mock compute",
        serviceAdapter: "compute",
        endpoint: "mock://compute",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Use public task text only."],
      }]);
      const result = await executeBittensorChatWorkflow({
        message: "Which Bittensor subnet service adapters can Matterhorn call directly for compute?",
      });
      expect(result.execution).toBe("answered");
      expect(result.responseText).toContain("adapter marketplace");
      expect(result.cards[0]?.kind).toBe("adapter_marketplace");
      expect((result.data.marketplace as { kind?: string } | undefined)?.kind).toBe("bittensor_subnet_adapter_marketplace");
      expect(JSON.stringify(result)).not.toMatch(/privateKey|ADAPTER_TOKEN|adapter-token|super-secret-token-value|Bearer [A-Za-z0-9._-]{8,}/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("probes HTTPS adapter metadata conformance without sending request bodies or credentials", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
    const previousToken = process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
    const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
    const nativeFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    try {
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = "super-secret-token-value";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "HTTP data search adapter",
        serviceAdapter: "data_search",
        endpoint: "https://adapter.invalid/invoke",
        metadataEndpoint: "https://adapter.invalid/.well-known/matterhorn-bittensor-adapter.json",
        requiredAuth: "api_key",
        authEnv: "BITTENSOR_HTTP_ADAPTER_TOKEN",
        costModel: "provider_priced",
        safetyNotes: ["HTTP adapter safety note."],
      }]);
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        expect(init?.method).toBe("GET");
        expect(init?.body).toBeUndefined();
        expect(JSON.stringify(init?.headers ?? {})).not.toContain("super-secret-token-value");
        if (url === "https://adapter.invalid/.well-known/matterhorn-bittensor-adapter.json") {
          return new Response(JSON.stringify({
            version: "matterhorn.bittensor.adapter.v1",
            netuid: 77,
            serviceAdapter: "data_search",
            supportedIntents: ["service_call"],
            safeModeRequired: true,
            requestHashRequired: true,
            maxResponseBytes: 64_000,
            privacy: {
              sendsTaskText: true,
              sendsSs58Address: true,
              sendsWalletData: false,
              sendsKeyMaterial: false,
            },
            requestSchema: { type: "object", properties: { task: { type: "string" } } },
            resultSchema: { type: "object", properties: { result: { type: "object" } } },
            health: { status: "ok" },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return nativeFetch(input, init);
      }) as typeof fetch;
      const report = await probeBittensorSubnetAdapterConformance({ netuid: 77 });
      expect(report.status).toBe("pass");
      expect(report.cases[0]?.mode).toBe("https");
      expect(report.cases[0]?.metadata?.healthStatus).toBe("ok");
      expect(report.cases[0]?.checks.every((check) => check.status === "pass")).toBe(true);
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(report)).not.toContain("super-secret-token-value");
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      globalThis.fetch = nativeFetch;
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousAllowlist === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
      }
      if (previousToken === undefined) {
        delete process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
      } else {
        process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = previousToken;
      }
      if (previousReal === undefined) {
        delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
      }
    }
  });

  test("marks enabled mock subnet adapters as ready without exposing secret-shaped fields", () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Mock data-search adapter",
        serviceAdapter: "data_search",
        endpoint: "mock://data-search",
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Mock adapter safety note."],
      }]);
      const report = doctorBittensorSubnetAdapters();
      expect(report.status).toBe("pass");
      expect(report.readyCount).toBe(1);
      expect(report.entries[0]?.status).toBe("ready");
      expect(report.entries[0]?.endpoint.mode).toBe("mock");
      expect(report.entries[0]?.serviceCallReady).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousMock === undefined) {
        delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
      }
    }
  });

  test("blocks unsafe subnet adapter schemas and non-allowlisted HTTPS endpoints", () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
    try {
      delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "Unsafe inference adapter",
        serviceAdapter: "inference",
        endpoint: "https://adapter.invalid/invoke?token=do-not-return",
        requiredAuth: "none",
        costModel: "provider_priced",
        requestSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            privateKey: { type: "string" },
          },
        },
        safetyNotes: ["Unsafe adapter should be blocked."],
      }]);
      const report = doctorBittensorSubnetAdapters();
      expect(report.status).toBe("fail");
      expect(report.blockedCount).toBe(1);
      expect(report.entries[0]?.endpoint.origin).toBe("https://adapter.invalid");
      expect(report.entries[0]?.endpoint.allowed).toBe(false);
      expect(report.entries[0]?.errors.join(" ")).toContain("Request schema contains a secret-shaped field");
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("do-not-return");
      expect(serialized).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousAllowlist === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
      }
    }
  });

  test("validates HTTPS adapter allowlist and auth readiness without returning env names or token values", () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousAllowlist = process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
    const previousToken = process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
    const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
    try {
      process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = "adapter.invalid";
      process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = "adapter-token";
      process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
        netuid: 77,
        name: "HTTPS inference adapter",
        serviceAdapter: "inference",
        endpoint: "https://adapter.invalid/invoke",
        requiredAuth: "api_key",
        authEnv: "BITTENSOR_HTTP_ADAPTER_TOKEN",
        costModel: "provider_priced",
        safetyNotes: ["HTTPS adapter safety note."],
      }]);
      const report = doctorBittensorSubnetAdapters();
      expect(report.status).toBe("pass");
      expect(report.readyCount).toBe(1);
      expect(report.entries[0]?.endpoint.allowed).toBe(true);
      expect(report.entries[0]?.auth.envConfigured).toBe(true);
      expect(report.entries[0]?.auth.credentialPresent).toBe(true);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("BITTENSOR_HTTP_ADAPTER_TOKEN");
      expect(serialized).not.toContain("adapter-token");
      expect(serialized).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export/i);
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
      if (previousAllowlist === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST = previousAllowlist;
      }
      if (previousToken === undefined) {
        delete process.env.BITTENSOR_HTTP_ADAPTER_TOKEN;
      } else {
        process.env.BITTENSOR_HTTP_ADAPTER_TOKEN = previousToken;
      }
      if (previousReal === undefined) {
        delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
      }
    }
  });

  test("returns a warning dry-run report when no mock adapters are configured", async () => {
    const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    try {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const report = await runBittensorSubnetAdapterDryRun();
      expect(report.kind).toBe("bittensor_subnet_adapter_dry_run");
      expect(report.status).toBe("warning");
      expect(report.total).toBe(0);
      expect(report.warnings.join(" ")).toContain("No configured subnet adapters matched");
    } finally {
      if (previousAdapters === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
      }
    }
  });

  test("runs mock subnet adapters through preview, hash gates, invocation, and redaction checks", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      try {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Mock inference adapter",
          serviceAdapter: "inference",
          endpoint: "mock://inference",
          requiredAuth: "none",
          costModel: "free_read",
          safetyNotes: ["Mock inference adapter safety note."],
        }]);
        const report = await runBittensorSubnetAdapterDryRun({
          netuid: 77,
          task: "Dry-run the mock inference adapter.",
          ss58Address: VALID_SS58,
        });
        expect(report.status).toBe("pass");
        expect(report.passed).toBe(1);
        expect(report.failed).toBe(0);
        expect(report.skipped).toBe(0);
        const runCase = report.cases[0];
        expect(runCase?.status).toBe("pass");
        expect(runCase?.previewSupported).toBe(true);
        expect(runCase?.missingHashRejected).toBe(true);
        expect(runCase?.mismatchedHashRejected).toBe(true);
        expect(runCase?.invocationSupported).toBe(true);
        expect(runCase?.redactionPassed).toBe(true);
        expect(runCase?.requestSha256).toHaveLength(64);
        expect(JSON.stringify(report)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("exports mock subnet adapter dry-run evidence without raw task or full hashes", async () => {
    await withMockedFivePromptSidecar(async () => {
      const previousAdapters = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      const previousMock = process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
      try {
        process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = "1";
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = JSON.stringify([{
          netuid: 77,
          name: "Mock inference adapter",
          serviceAdapter: "inference",
          endpoint: "mock://inference",
          requiredAuth: "none",
          costModel: "free_read",
          safetyNotes: ["Mock inference adapter safety note."],
        }]);
        const dryRunExport = await buildBittensorSubnetAdapterDryRunExport({
          netuid: 77,
          task: "Dry-run task with private context that must not appear in markdown.",
          ss58Address: VALID_SS58,
        });
        expect(dryRunExport.kind).toBe("bittensor_subnet_adapter_dry_run_export");
        expect(dryRunExport.status).toBe("pass");
        expect(dryRunExport.summary.passed).toBe(1);
        expect(dryRunExport.markdown).toContain("Bittensor Mock Adapter Dry-Run Export");
        expect(dryRunExport.markdown).toContain("Missing hash rejected: yes");
        expect(dryRunExport.markdown).toContain("Mismatched hash rejected: yes");
        expect(dryRunExport.markdown).toContain("Confirmed invocation supported: yes");
        expect(dryRunExport.markdown).not.toContain("private context");
        expect(dryRunExport.markdown).not.toMatch(/[a-f0-9]{64}/i);
        expect(dryRunExport.warnings.join(" ")).toMatch(/do(?:es)? not authorize real subnet service execution/i);
        expect(JSON.stringify(dryRunExport)).not.toMatch(/seed phrase|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token|Bearer [A-Za-z0-9._-]{8,}/i);
      } finally {
        if (previousAdapters === undefined) {
          delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
        } else {
          process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previousAdapters;
        }
        if (previousMock === undefined) {
          delete process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS;
        } else {
          process.env.BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS = previousMock;
        }
      }
    });
  });

  test("compares validators on a requested subnet", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "compare validators on subnet 77", limit: 6 });
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("validator_selection");
      expect(result.responseText).toContain("subnet 77");
    });
  });

  test("creates monitoring watches from ordinary chat prompts", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "monitor subnet 77 emissions" });
      expect(result.execution).toBe("answered");
      expect(result.plan.intent).toBe("monitor");
      expect(result.cards[0]?.kind).toBe("watchlist");
      expect(result.responseText).toContain("subnet 77");
    });
  });

  test("creates actionable watches from riskiest wallet exposure", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({
        message: "create watches for my riskiest Bittensor positions",
        ss58Address: VALID_SS58,
      });
      const watches = result.data.watches as Array<{ kind: string; validatorHotkey?: string | null }> | undefined;
      expect(result.execution).toBe("answered");
      expect(result.cards.some((card) => card.kind === "watchlist")).toBe(true);
      expect(watches?.length).toBeGreaterThan(0);
      expect(watches?.some((watch) => watch.kind === "validator" && Boolean(watch.validatorHotkey && isValidSs58Address(watch.validatorHotkey)))).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
    });
  });

  test("checks configured watches with actionable alert prompts", async () => {
    await withMockedFivePromptSidecar(async () => {
      createBittensorWatch({
        kind: "slippage",
        netuid: 77,
        label: "Slippage alert",
        threshold: 0.1,
        reason: "Test alert prompt",
      });
      const result = await executeBittensorChatWorkflow({ message: "check my Bittensor alerts" });
      const evaluations = result.data.evaluations as Array<{
        actionPrompt?: string | null;
        alertKey?: string;
        copilotActions?: Array<{ label?: string; prompt?: string; riskLevel?: string }>;
        notificationIntent?: string;
        shouldNotify?: boolean;
        status: string;
      }> | undefined;
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("watchlist");
      expect(evaluations?.some((evaluation) => evaluation.status === "warning" && evaluation.actionPrompt)).toBe(true);
      expect(evaluations?.some((evaluation) => evaluation.status === "warning" && evaluation.shouldNotify === true)).toBe(true);
      expect(evaluations?.some((evaluation) => evaluation.alertKey?.includes("slippage"))).toBe(true);
      expect(evaluations?.some((evaluation) => evaluation.notificationIntent === "review_slippage")).toBe(true);
      expect(evaluations?.some((evaluation) => evaluation.copilotActions?.some((action) => action.label === "Prepare fresh preview"))).toBe(true);
      const alertCard = result.cards.find((card) =>
        card.actions?.some((action) => String(action.payload?.prompt ?? "").includes("fresh unsigned Bittensor staking preview")),
      );
      expect(alertCard?.items.some((item) => item.label === "Next actions")).toBe(true);
      expect(alertCard?.items.some((item) => item.label === "Intent" && item.value === "review_slippage")).toBe(true);
      expect(alertCard?.actions?.some((action) => String(action.payload?.alertKey ?? "").includes("slippage"))).toBe(true);
      expect(alertCard?.actions?.some((action) => action.payload?.notificationIntent === "review_slippage")).toBe(true);
    });
  });

  test("deep dives a validator hotkey on a subnet", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({
        message: `deep dive validator ${VALID_SS58} on subnet 77`,
      });
      const intelligence = result.data.intelligence as { kind?: string; foundInSample?: boolean; watchSuggestions?: unknown[] } | undefined;
      expect(result.execution).toBe("answered");
      expect(result.cards[0]?.kind).toBe("intelligence_report");
      expect(intelligence?.kind).toBe("validator");
      expect(intelligence?.foundInSample).toBe(true);
      expect(intelligence?.watchSuggestions?.length).toBeGreaterThan(0);
    });
  });

  test("builds an advanced unsigned staking allocation plan", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({
        message: "I have 10 TAO. Build a low-risk Bittensor staking plan for image generation.",
        ss58Address: VALID_SS58,
        strategy: "safety",
      });
      const stakingPlan = result.data.stakingPlan as { kind?: string; steps?: unknown[]; unsignedPreviews?: unknown[] } | undefined;
      expect(result.execution).toBe("unsigned_preview");
      expect(result.cards[0]?.kind).toBe("intelligence_report");
      expect(stakingPlan?.kind).toBe("staking_plan");
      expect(stakingPlan?.steps?.length).toBeGreaterThan(0);
      expect(stakingPlan?.unsignedPreviews?.length).toBeGreaterThan(0);
    });
  });

  test("clarifies staking preview when validator hotkey is missing", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "prepare staking 1 TAO on subnet 77" });
      expect(result.execution).toBe("clarification_required");
      expect(result.clarificationQuestion).toContain("validator hotkey");
      expect(result.cards[0]?.kind).toBe("validator_selection");
    });
  });

  test("returns unsigned staking preview when required context exists", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({
        message: "prepare staking 1 TAO on subnet 77",
        ss58Address: VALID_SS58,
        validatorHotkey: VALID_SS58,
      });
      expect(result.execution).toBe("unsigned_preview");
      expect(result.cards[0]?.kind).toBe("signed_action_review");
      expect(result.responseText).toContain("external signing");
      expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
    });
  });

  test("uses previous public netuid context for follow-up staking previews", async () => {
    await withMockedFivePromptSidecar(async () => {
      const validators = await executeBittensorChatWorkflow({ message: "compare validators on subnet 77" });
      expect(validators.context?.netuid).toBe(77);

      const result = await executeBittensorChatWorkflow({
        message: "prepare staking 1 TAO",
        contextId: validators.context?.id,
        ss58Address: VALID_SS58,
        validatorHotkey: VALID_SS58,
      });
      expect(result.execution).toBe("unsigned_preview");
      expect((result.data.preview as { netuid?: number }).netuid).toBe(77);
      expect(result.context?.netuid).toBe(77);
    });
  });

  test("does not store unexpected inline context fields", async () => {
    const result = await executeBittensorChatWorkflow({
      message: "show my TAO",
      context: {
        id: "bt-chat-inlinecontext",
        ss58Address: VALID_SS58,
        seedPhrase: "do-not-store",
      } as unknown as Parameters<typeof executeBittensorChatWorkflow>[0]["context"],
    });
    expect(result.context?.ss58Address).toBe(VALID_SS58);
    expect("seedPhrase" in (result.context as Record<string, unknown>)).toBe(false);
  });

  test("clarifies unstake previews instead of guessing validator context", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({ message: "unstake 0.5 TAO from subnet 77" });
      expect(result.execution).toBe("clarification_required");
      expect(result.clarificationQuestion).toContain("validator hotkey");
    });
  });

  test("returns unsigned transfer previews when recipient context exists", async () => {
    await withMockedFivePromptSidecar(async () => {
      const result = await executeBittensorChatWorkflow({
        message: "transfer 1 TAO safely",
        ss58Address: VALID_SS58,
        recipient: "5FHneW46xGXgs5mUiveU4sbTyGBzmtoW4h4KYxqsdXw4nq8Z",
      });
      expect(result.execution).toBe("unsigned_preview");
      expect(result.cards[0]?.kind).toBe("signed_action_review");
      expect((result.data.preview as { action?: string; destination?: string }).action).toBe("transfer");
    });
  });
});

describe("Bittensor intelligence reports", () => {
  test("builds subnet intelligence from public metagraph and capability data", async () => {
    await withMockedFivePromptSidecar(async () => {
      const report = await analyzeBittensorSubnetIntelligence(77);
      expect(report.kind).toBe("subnet");
      expect(report.netuid).toBe(77);
      expect(report.score).toBeGreaterThan(50);
      expect(report.metagraph.validatorsSampled).toBe(2);
      expect(report.signals.some((signal) => signal.label === "Validator concentration")).toBe(true);
      expect(report.warnings.join(" ")).toContain("not financial advice");
      const card = buildBittensorSubnetIntelligenceCard(report);
      expect(card.kind).toBe("intelligence_report");
      expect(card.items.some((item) => item.label === "Score")).toBe(true);
    });
  });

  test("builds wallet intelligence from watch-only wallet positions", async () => {
    await withMockedFivePromptSidecar(async () => {
      const report = await analyzeBittensorWalletIntelligence(VALID_SS58);
      expect(report.kind).toBe("wallet");
      expect(report.subnetCount).toBe(2);
      expect(report.validatorCount).toBe(2);
      expect(report.largestPositionShare).toBeGreaterThan(0.7);
      expect(report.concentrationRisk).toBe("high");
      expect(report.warnings.join(" ")).toContain("watch-only");
      const card = buildBittensorWalletIntelligenceCard(report);
      expect(card.kind).toBe("intelligence_report");
      expect(card.items.some((item) => item.label === "Largest position")).toBe(true);
    });
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
  test("creates a Phase 3/4 capability manifest with benefits, examples, and adapter readiness", () => {
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
    expect(capability.capabilityLevel).toBe("adapter_required");
    expect(capability.userBenefits.length).toBeGreaterThan(1);
    expect(capability.examplePrompts.join(" ")).toContain("subnet 14");
    expect(capability.adapterStatus.configured).toBe(false);
    expect(capability.dataFreshness.source).toBe("test");
    expect(capability.adapterContract.version).toBe("matterhorn.bittensor.adapter.v1");
    expect(capability.adapterContract.endpointConfigured).toBe(false);
    expect(capability.adapterContract.privacy.sendsKeyMaterial).toBe(false);
    expect(capability.adapterContract.unsupportedBehavior.status).toBe("adapter_missing");
    expect(validateBittensorSubnetServiceAdapterContract(capability.adapterContract).ok).toBe(true);
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
    expect(capability.capabilityLevel).toBe("adapter_ready");
    expect(capability.adapterStatus.configured).toBe(true);
    expect(capability.adapterStatus.message).toContain("Mock compute adapter");
    expect(capability.requiredAuth).toBe("api_key");
    expect(capability.costModel).toBe("provider_priced");
    expect(capability.adapterContract.endpointConfigured).toBe(true);
    expect(capability.adapterContract.supportedIntents).toContain("service_call");
    expect(capability.adapterContract.privacy.sendsWalletData).toBe(false);
    expect(validateBittensorSubnetServiceAdapterContract(capability.adapterContract).ok).toBe(true);
    expect(JSON.stringify(capability)).not.toContain("BITTENSOR_MOCK_ADAPTER_TOKEN");

    if (previous === undefined) {
      delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    } else {
      process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previous;
    }
  });

  test("builds subnet invocation preview cards without calling adapters", async () => {
    const preview = await previewBittensorSubnetInvocation(14, {
      intent: "service_call",
      task: "Use this subnet for a compute task.",
      ss58Address: VALID_SS58,
    });
    expect(preview.netuid).toBe(14);
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.request.ss58Address).toBe(VALID_SS58);
    expect(preview.requestJson).toContain("service_call");
    expect(preview.requestSha256).toHaveLength(64);
    expect(preview.confirmationPrompt).toContain(preview.requestSha256);
    expect(preview.contractValidation.ok).toBe(true);
    expect(preview.adapterContract.endpointConfigured).toBe(false);
    expect(preview.warnings.join(" ")).toContain("Matterhorn can still explain");
    const card = buildBittensorInvocationPreviewCard(preview);
    expect(["subnet_result", "unsupported_adapter"]).toContain(card.kind);
    expect(card.items.some((item) => item.label === "Cost model")).toBe(true);
    expect(card.items.some((item) => item.label === "Contract")).toBe(true);
  });

  test("marks configured service adapter previews as supported only after contract validation", async () => {
    const previous = process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
    const previousLocal = process.env.BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS;
    const previousReal = process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
    const previousToken = process.env.BITTENSOR_MOCK_ADAPTER_TOKEN;
    process.env.BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS = "1";
    process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = "1";
    process.env.BITTENSOR_MOCK_ADAPTER_TOKEN = "mock-token";
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

    try {
      const preview = await previewBittensorSubnetInvocation(14, {
        intent: "service_call",
        task: "Use this subnet for a compute task.",
        ss58Address: VALID_SS58,
      });
      expect(preview.supported).toBe(true);
      expect(preview.configured).toBe(true);
      expect(preview.contractValidation.ok).toBe(true);
      expect(preview.adapterContract.endpointConfigured).toBe(true);
      expect(preview.adapterContract.supportedIntents).toContain("service_call");
      expect(preview.warnings.join(" ")).toContain("Review this adapter request");
      expect(JSON.stringify(preview)).not.toContain("BITTENSOR_MOCK_ADAPTER_TOKEN");
    } finally {
      if (previous === undefined) {
        delete process.env.BITTENSOR_SUBNET_ADAPTERS_JSON;
      } else {
        process.env.BITTENSOR_SUBNET_ADAPTERS_JSON = previous;
      }
      if (previousLocal === undefined) {
        delete process.env.BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS = previousLocal;
      }
      if (previousReal === undefined) {
        delete process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS;
      } else {
        process.env.BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS = previousReal;
      }
      if (previousToken === undefined) {
        delete process.env.BITTENSOR_MOCK_ADAPTER_TOKEN;
      } else {
        process.env.BITTENSOR_MOCK_ADAPTER_TOKEN = previousToken;
      }
    }
  });

  test("returns unsupported behavior for service invocation when the adapter contract is not ready", async () => {
    const invocation = await invokeBittensorSubnet(14, {
      intent: "service_call",
      task: "Run this compute task without a configured adapter.",
      ss58Address: VALID_SS58,
    });
    expect(invocation.supported).toBe(false);
    expect(invocation.adapterContract?.endpointConfigured).toBe(false);
    expect(invocation.contractValidation?.ok).toBe(true);
    expect(invocation.message).toContain("will not invoke");
    expect(invocation.warnings.join(" ")).toContain("Adapter contract declares endpointConfigured=false");
  });

  test("rejects unsafe adapter contracts with secret-shaped schemas", () => {
    const contract = buildBittensorSubnetServiceAdapterContract({
      netuid: 14,
      adapter: "compute",
      capabilityLevel: "adapter_required",
      adapterStatus: {
        configured: false,
        adapter: "compute",
        message: "No compute adapter configured.",
        requiredAuth: "api_key",
        costModel: "provider_priced",
      },
      configuredAdapter: null,
      requestSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          privateKey: { type: "string" },
        },
      },
      resultSchema: { type: "object", properties: { message: { type: "string" } } },
      safetyNotes: ["Never send secrets to subnet service adapters."],
    });
    const validation = validateBittensorSubnetServiceAdapterContract(contract);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(" ")).toContain("Request schema contains a secret-shaped field");
  });

  test("runs subnet adapter contract fixtures with sanitized results", () => {
    const report = runBittensorSubnetServiceAdapterContractTests(buildBittensorSubnetServiceAdapterContractTestFixtures());
    expect(report.kind).toBe("subnet_adapter_contract_test_report");
    expect(report.total).toBe(3);
    expect(report.failed).toBe(0);
    expect(report.results.some((result) => result.name === "configured safe service adapter" && result.serviceCallReady)).toBe(true);
    expect(report.results.some((result) => result.name === "missing adapter falls back to explain and monitor" && result.unsupportedStatus === "adapter_missing")).toBe(true);
    expect(report.results.some((result) => result.name === "unsafe schema is rejected" && result.actualOk === false)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/BITTENSOR_FIXTURE_ADAPTER_TOKEN|privateKey|seed phrase|mnemonic/i);
  });

  test("reports adapter contract expectation mismatches without exposing raw schemas", () => {
    const fixture = buildBittensorSubnetServiceAdapterContractTestFixtures()[1];
    const report = runBittensorSubnetServiceAdapterContractTests([{
      ...fixture,
      expectedServiceCallReady: true,
    }]);
    expect(report.failed).toBe(1);
    expect(report.warnings.join(" ")).toContain("Adapter contract test failed");
    expect(report.results[0]?.warnings.join(" ")).toContain("Expected serviceCallReady=true");
    expect(JSON.stringify(report)).not.toMatch(/BITTENSOR_FIXTURE_ADAPTER_TOKEN|privateKey|seed phrase|mnemonic/i);
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

describe("Bittensor advanced copilot engines", () => {
  test("builds validator intelligence cards without secrets", async () => {
    const report = await analyzeBittensorValidatorIntelligence({ netuid: 14, validatorHotkey: VALID_SS58 });
    expect(report.kind).toBe("validator");
    expect(report.validatorHotkey).toBe(VALID_SS58);
    expect(report.watchSuggestions[0]?.kind).toBe("validator");
    const card = buildBittensorValidatorIntelligenceCard(report);
    expect(card.kind).toBe("intelligence_report");
    expect(card.actions?.some((action) => String(action.payload?.prompt ?? "").includes("Monitor validator"))).toBe(true);
    expect(JSON.stringify({ report, card })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
  });

  test("builds unsigned staking plan cards", async () => {
    const plan = await buildBittensorStakingPlan({
      message: "I have 2 TAO. Build a safety staking plan for compute exposure.",
      amountTao: "2",
      coldkey: VALID_SS58,
      strategy: "safety",
      limit: 2,
    });
    expect(plan.kind).toBe("staking_plan");
    expect(plan.totalAmountTao).toBe(2);
    expect(plan.unsignedPreviews.every((preview) => preview.requiresExternalSignature)).toBe(true);
    const card = buildBittensorStakingPlanCard(plan);
    expect(card.kind).toBe("intelligence_report");
    expect(JSON.stringify({ plan, card })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
  });

  test("builds wallet decision briefs without custody fields", async () => {
    const brief = await buildBittensorDecisionBrief({
      message: "What should I do next with my TAO?",
      ss58Address: VALID_SS58,
      amountTao: "1",
    });
    expect(brief.kind).toBe("decision_brief");
    expect(brief.focus).toBe("wallet");
    expect(brief.options.some((option) => option.label === "Create risk watches")).toBe(true);
    expect(brief.options.some((option) => option.requiresExternalSignature)).toBe(true);
    const card = buildBittensorDecisionBriefCard(brief);
    expect(card.kind).toBe("intelligence_report");
    expect(card.actions?.some((action) => action.label === "Create risk watches")).toBe(true);
    expect(JSON.stringify({ brief, card })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
  });

  test("routes subnet decision prompts through Bittensor chat", async () => {
    const result = await executeBittensorChatWorkflow({
      message: "What should I do next with Bittensor subnet 14?",
      netuid: 14,
      strategy: "safety",
    });
    expect(result.execution).toBe("answered");
    expect(result.cards[0]?.kind).toBe("intelligence_report");
    expect((result.data.decision as { focus?: string })?.focus).toBe("subnet");
    expect(result.cards[0]?.actions?.some((action) => String(action.payload?.prompt ?? "").includes("Compare validators on subnet 14"))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
  });

  test("clarifies personalized decision prompts when SS58 context is missing", async () => {
    const result = await executeBittensorChatWorkflow({ message: "What should I do next with my TAO?" });
    expect(result.execution).toBe("clarification_required");
    expect(result.clarificationQuestion).toContain("SS58 coldkey public address");
  });

  test("builds wallet watch-policy presets without custody fields", async () => {
    const policy = await buildBittensorWatchPolicyPreset({
      message: "Set up Bittensor guardrails for my TAO wallet.",
      ss58Address: VALID_SS58,
    });
    expect(policy.kind).toBe("watch_policy");
    expect(policy.scope).toBe("wallet");
    expect(policy.rules.length).toBeGreaterThan(0);
    expect(policy.copilotActions.some((action) => action.label === "Create recommended watches")).toBe(true);
    const card = buildBittensorWatchPolicyPresetCard(policy);
    expect(card.kind).toBe("intelligence_report");
    expect(card.actions?.some((action) => action.label === "Create recommended watches")).toBe(true);
    expect(JSON.stringify({ policy, card })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
  });

  test("routes watch-policy prompts through Bittensor chat", async () => {
    const result = await executeBittensorChatWorkflow({
      message: "Create a Bittensor watch policy for subnet 14.",
      netuid: 14,
    });
    expect(result.execution).toBe("answered");
    expect(result.cards[0]?.kind).toBe("intelligence_report");
    expect((result.data.watchPolicy as { scope?: string })?.scope).toBe("subnet");
    expect(result.cards[0]?.actions?.some((action) => String(action.payload?.prompt ?? "").includes("Create watches for Bittensor subnet 14"))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
  });

  test("clarifies personalized watch-policy prompts when SS58 context is missing", async () => {
    const result = await executeBittensorChatWorkflow({ message: "Set up Bittensor alerts for my wallet." });
    expect(result.execution).toBe("clarification_required");
    expect(result.clarificationQuestion).toContain("SS58 coldkey public address");
  });
});

describe("auditBittensorReadiness", () => {
  test("runs the Bittensor readiness gate without secret-shaped fields", async () => {
    const report = await auditBittensorReadiness();
    expect(["pass", "warning", "fail"]).toContain(report.status);
    expect(report.checks.some((check) => check.id === "chat_intents")).toBe(true);
    expect(report.checks.some((check) => check.id === "chat_context")).toBe(true);
    expect(report.checks.some((check) => check.id === "live_read_freshness")).toBe(true);
    const capabilityCheck = report.checks.find((check) => check.id === "capabilities");
    expect(capabilityCheck).toBeDefined();
    expect(capabilityCheck?.summary).toContain("schemas");
    expect((capabilityCheck?.details as { missingServiceMarketplaceNetuids?: number[] })?.missingServiceMarketplaceNetuids).toEqual([]);
    expect(report.checks.some((check) => check.id === "subnet_adapter_conformance")).toBe(true);
    expect(report.checks.some((check) => check.id === "subnet_adapter_preflight")).toBe(true);
    expect(report.checks.some((check) => check.id === "subnet_adapter_marketplace")).toBe(true);
    const handoffCheck = report.checks.find((check) => check.id === "subnet_adapter_operator_handoff");
    expect(handoffCheck).toBeDefined();
    expect(handoffCheck?.status).not.toBe("fail");
    expect(report.checks.some((check) => check.id === "signing_safety")).toBe(true);
    const card = buildBittensorReadinessCard(report);
    expect(card.kind).toBe("readiness_report");
    const operatorReport = buildBittensorReadinessOperatorReport(report);
    expect(operatorReport.kind).toBe("readiness_operator_report");
    expect(operatorReport.operatorPrompts.length).toBeGreaterThan(0);
    const operatorCard = buildBittensorReadinessOperatorCard(operatorReport);
    expect(operatorCard.kind).toBe("readiness_report");
    expect(operatorCard.actions?.some((action) => action.kind === "send_to_chat")).toBe(true);
    expect(JSON.stringify({ report, card, operatorReport, operatorCard })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
  });

  test("routes readiness prompts through Bittensor chat", async () => {
    const result = await executeBittensorChatWorkflow({ message: "Run a Bittensor readiness operator report." });
    expect(result.execution).toBe("answered");
    expect(result.cards[0]?.kind).toBe("readiness_report");
    expect((result.data.operatorReport as { kind?: string })?.kind).toBe("readiness_operator_report");
    expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
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
    const checklist = buildBittensorSigningSafetyChecklist(preview);
    expect(["pass", "warning"]).toContain(checklist.status);
    expect(checklist.checks.some((check) => check.label === "External signature" && check.status === "pass")).toBe(true);
    expect(checklist.checks.some((check) => check.label === "No key material" && check.status === "pass")).toBe(true);
    expect(buildBittensorSigningSafetyChecklistCard(checklist).kind).toBe("signed_action_review");
    expect(JSON.stringify(checklist)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
  });

  test("adds signing safety checklist to direct unsigned preview chat responses", async () => {
    const result = await executeBittensorChatWorkflow({
      message: `Prepare staking 1 TAO on subnet 14 to validator ${VALID_SS58}.`,
      netuid: 14,
      validatorHotkey: VALID_SS58,
    });
    expect(result.execution).toBe("unsigned_preview");
    expect(result.cards.some((card) => card.title === "External signing safety checklist")).toBe(true);
    expect((result.data.signingSafety as { kind?: string })?.kind).toBe("signing_safety_checklist");
    expect(JSON.stringify(result)).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase|suri/i);
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

  test("creates no-secret signing receipts for handoff and submission follow-through", async () => {
    const previous = process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    const preview = await prepareBittensorExtrinsic({
      action: "stake",
      netuid: 14,
      amountTao: "1",
      hotkey: VALID_SS58,
    });
    const handoff = createBittensorSigningHandoff(preview);
    const awaitingReceipt = createBittensorSigningReceipt({ preview, handoff });
    expect(awaitingReceipt.status).toBe("awaiting_signature");
    expect(awaitingReceipt.payloadSha256).toBe(handoff.payloadSha256);
    expect(awaitingReceipt.signatureSha256).toBeNull();
    expect(awaitingReceipt.nextActions.join(" ")).toContain("Sign externally");
    expect(buildBittensorSigningReceiptCard(awaitingReceipt).kind).toBe("signed_action_review");

    const signature = "0x".padEnd(130, "a");
    const result = await submitSignedBittensorExtrinsic({ preview, signature, signerAddress: VALID_SS58 });
    const receipt = createBittensorSigningReceipt({ preview, result, signature, signerAddress: VALID_SS58 });
    expect(result.status).toBe("sidecar_unavailable");
    expect(receipt.status).toBe("sidecar_unavailable");
    expect(receipt.signatureSha256).toHaveLength(64);
    expect(JSON.stringify(receipt)).not.toContain(signature);
    expect(receipt.signerAddress).toBe(VALID_SS58);
    expect(receipt.nextActions.join(" ")).toContain("Subtensor sidecar");
    expect(JSON.stringify({ awaitingReceipt, receipt })).not.toMatch(/secretSeed|privateKey|mnemonicPhrase|seedPhrase/i);
    if (previous === undefined) {
      delete process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL;
    } else {
      process.env.BITTENSOR_SUBTENSOR_SIDECAR_URL = previous;
    }
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
    expect(evaluation.alertKey).toContain("wallet");
    expect(evaluation.notificationIntent).toBe(evaluation.status === "ok" ? "none" : "review_wallet");
    expect(evaluation.copilotActions?.length).toBeGreaterThan(0);
    expect(evaluation.copilotActions?.some((action) => action.label === "Explain wallet exposure")).toBe(true);
    expect(evaluation.shouldNotify).toBe(evaluation.status !== "ok");
    const card = buildBittensorWatchEvaluationCards([evaluation])[0];
    expect(card?.kind).toBe("watchlist");
    expect(card?.items.some((item) => item.label === "Status")).toBe(true);
    expect(card?.items.some((item) => item.label === "Notify")).toBe(true);
    expect(card?.items.some((item) => item.label === "Intent")).toBe(true);
    expect(card?.actions?.some((action) => String(action.payload?.alertKey ?? "").includes("wallet"))).toBe(true);
  });

  test("builds bounded watch alert digests with notification intents", async () => {
    const watch = createBittensorWatch({ kind: "slippage", netuid: 77, threshold: 0.1, label: "Watch slippage" });
    const evaluation = await evaluateBittensorWatch(watch);
    const digest = buildBittensorWatchDigest([evaluation], { maxAlerts: 1, includeOk: true });
    expect(digest.total).toBe(1);
    expect(digest.alerts.length).toBe(1);
    expect(digest.alerts[0]?.alertKey).toContain("slippage");
    expect(digest.alerts[0]?.notificationIntent).toBe(evaluation.status === "ok" ? "none" : "review_slippage");
    expect(digest.alerts[0]?.prompt).toBeTruthy();
    expect(JSON.stringify(digest)).not.toMatch(/seed|mnemonic|privateKey|wallet export/i);
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
