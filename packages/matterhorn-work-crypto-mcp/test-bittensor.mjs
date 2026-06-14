#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";

const subnet = {
  netuid: 14,
  name: "TAOHash",
  symbol: "SN14",
  category: "Compute and infrastructure",
  benefitSummary: "A documented subnet example useful for testing metagraph and validator views.",
  ownerColdkey: null,
  ownerHotkey: null,
  priceTao: 0.5,
  emission: 12.5,
  tempo: 360,
  updatedAt: "2026-06-09T00:00:00.000Z",
  source: "mock",
};

const detail = {
  ...subnet,
  metagraphSummary: { neurons: 128, totalStake: 1000, block: 123 },
  topValidators: [{ uid: 1, hotkey: VALID_SS58, coldkey: VALID_SS58, stake: 1000, trust: 0.9, dividends: 0.2 }],
  knownUseCases: ["Evaluate decentralized compute capacity"],
  risks: ["Quote only"],
  links: [],
};

const subnetCard = {
  kind: "subnet_comparison",
  title: "TAOHash (SN14)",
  subtitle: "Subnet 14 · Compute and infrastructure",
  summary: subnet.benefitSummary,
  items: [
    { label: "Price", value: "0.5 TAO" },
    { label: "Emission", value: "12.5" },
  ],
  warnings: [],
  data: { subnet },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets") {
    res.end(JSON.stringify({ success: true, subnets: [subnet], cards: [subnetCard] }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets/14") {
    res.end(JSON.stringify({ success: true, subnet: detail, cards: [subnetCard] }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/discover") {
    res.end(JSON.stringify({
      success: true,
      goal: "compute",
      matches: [{ subnet, score: 12, reasons: ["The goal needs compute, hosting, or infrastructure."] }],
      cards: [subnetCard],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/bittensor/wallet/")) {
    res.end(JSON.stringify({
      success: true,
      wallet: {
        ss58Address: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: "2026-06-09T00:00:00.000Z",
        message: "Mock provider unavailable",
      },
      cards: [{
        kind: "wallet_snapshot",
        title: "Bittensor wallet snapshot",
        items: [{ label: "Positions", value: "0" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/intelligence/subnet/14") {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "subnet",
        netuid: 14,
        name: "TAOHash",
        category: "Compute and infrastructure",
        score: 72,
        rating: "usable_with_caveats",
        mechanismSummary: { available: false, count: null, note: "Mechanism-specific fields are not exposed by this mock provider." },
        market: { priceTao: 0.5, emission: 12.5, tempo: 360, source: "mock", block: 123, freshness: "mock" },
        metagraph: { neurons: 128, totalStake: 1000, validatorsSampled: 1, topValidatorStakeShare: 1, concentrationRisk: "high", dataQuality: "low" },
        capability: { capabilityLevel: "adapter_required", serviceAdapter: "compute", adapterStatus: { configured: false, adapter: "compute", message: "No compute adapter configured.", requiredAuth: "unknown", costModel: "unknown" }, userBenefits: ["Inspect compute-oriented subnet context."] },
        signals: [{ label: "Provider quality", value: "Live-shaped", tone: "good", explanation: "Mock signal." }],
        warnings: ["Public-data intelligence, not financial advice."],
        nextQuestions: ["Compare validators on subnet 14."],
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "intelligence_report",
        title: "TAOHash intelligence",
        items: [{ label: "Score", value: "72/100" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/bittensor/intelligence/wallet/")) {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "wallet",
        ss58Address: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
        freeTao: null,
        stakeTotalTao: null,
        estimatedValueTao: null,
        subnetCount: 0,
        validatorCount: 0,
        largestPositionShare: null,
        concentrationRisk: "unknown",
        slippageRisk: "unknown",
        staleDataRisk: "high",
        largestPositions: [],
        signals: [{ label: "Data freshness", value: "Unavailable", tone: "danger", explanation: "Mock signal." }],
        warnings: ["Mock provider unavailable"],
        nextQuestions: ["Where am I staked?"],
        source: "mock",
        block: null,
        freshness: null,
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "intelligence_report",
        title: "Bittensor wallet intelligence",
        items: [{ label: "Subnet spread", value: "0 subnets" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/bittensor/intelligence/validator/")) {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "validator",
        netuid: 14,
        subnetName: "TAOHash",
        validatorHotkey: VALID_SS58,
        coldkey: VALID_SS58,
        uid: 1,
        score: 81,
        stake: 1000,
        trust: 0.9,
        dividends: 0.2,
        source: "mock",
        foundInSample: true,
        risk: "low",
        signals: [{ label: "Sample visibility", value: "Found", tone: "good", explanation: "Mock signal." }],
        warnings: ["Public validator intelligence, not financial advice."],
        nextQuestions: ["Monitor validator."],
        copilotActions: [{ label: "Create validator watch", prompt: `Monitor validator ${VALID_SS58} on subnet 14.`, reason: "Track visibility.", riskLevel: "low" }],
        watchSuggestions: [{ kind: "validator", label: "Validator watch", netuid: 14, ss58Address: null, validatorHotkey: VALID_SS58, threshold: 1000, reason: "Track visibility." }],
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "intelligence_report",
        title: "Validator intelligence",
        items: [{ label: "Score", value: "81/100" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/staking/plan") {
    res.end(JSON.stringify({
      success: true,
      plan: {
        kind: "staking_plan",
        goal: "compute exposure",
        totalAmountTao: 2,
        strategy: "safety",
        steps: [{ netuid: 14, subnetName: "TAOHash", validatorHotkey: VALID_SS58, amountTao: 2, strategy: "safety", expectedAlpha: 4, slippageBps: 25, source: "mock", warnings: [], rationale: "Mock plan." }],
        unsignedPreviews: [{ action: "stake", network: "finney", netuid: 14, amountTao: 2, coldkey: VALID_SS58, hotkey: VALID_SS58, destination: null, feeTao: 0.0001, slippageBps: 25, expectedAlpha: 4, unsignedPayload: { action: "stake", netuid: 14 }, signer: { mode: "desktop_handoff", available: true, canSign: false, canSubmit: false, network: "finney", address: VALID_SS58, message: "External signer required." }, warnings: ["Unsigned preview only."], consequenceSummary: "If signed, this stakes 2 TAO.", requiresExternalSignature: true }],
        assumptions: ["Mock assumption."],
        warnings: ["Unsigned preview only."],
        nextQuestions: ["Create watches for this plan."],
        copilotActions: [{ label: "Create plan watches", prompt: "Create watches for this Bittensor staking plan.", reason: "Keep plan current.", riskLevel: "low" }],
        watchSuggestions: [{ kind: "subnet", label: "Planned subnet 14", netuid: 14, ss58Address: null, validatorHotkey: null, threshold: 2, reason: "Track planned subnet." }],
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "intelligence_report",
        title: "Bittensor staking plan",
        items: [{ label: "Steps", value: "1" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/actions/quote") {
    res.end(JSON.stringify({
      success: true,
      quote: {
        action: "stake",
        netuid: 14,
        amountTao: 1,
        expectedAlpha: 2,
        feeTao: 0.0001,
        slippageBps: 25,
        warnings: ["Quote only. External signature required."],
        requiresExternalSignature: true,
      },
      cards: [{
        kind: "staking_quote",
        title: "Stake quote",
        items: [{ label: "Amount", value: "1 TAO" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/plan") {
    res.end(JSON.stringify({
      success: true,
      plan: {
        intent: "discover",
        confidence: 0.82,
        summary: "Mock Bittensor discover workflow",
        userGoal: "find compute subnets",
        netuids: [14],
        ss58Address: null,
        steps: ["Find matching subnets"],
        suggestedToolNames: ["bittensor_find_subnets_for_goal"],
        safetyNotes: ["External signer required for signed actions."],
        responseCards: ["subnet_comparison"],
        requiresClarification: false,
        clarificationQuestion: null,
      },
      cards: [{
        kind: "subnet_result",
        title: "Bittensor chat plan",
        items: [{ label: "Intent", value: "Discover" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    res.end(JSON.stringify({
      success: true,
      plan: {
        intent: "discover",
        confidence: 0.82,
        summary: "Mock Bittensor discover workflow",
        userGoal: "which subnet is useful for image generation?",
        netuids: [],
        ss58Address: null,
        steps: ["Find matching subnets"],
        suggestedToolNames: ["bittensor_chat"],
        safetyNotes: ["External signer required for signed actions."],
        responseCards: ["subnet_comparison"],
        requiresClarification: false,
        clarificationQuestion: null,
      },
      responseText: "I found 1 Bittensor subnet candidate for image generation.",
      cards: [subnetCard],
      data: { discovery: { goal: "image generation" } },
      warnings: ["External signer required for signed actions."],
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
      context: {
        id: "bt-chat-mockcontext",
        ss58Address: null,
        netuid: 14,
        amountTao: null,
        validatorHotkey: null,
        coldkey: null,
        recipient: null,
        destination: null,
        lastIntent: "discover",
        lastExecution: "answered",
        updatedAt: "2026-06-09T00:00:00.000Z",
        warnings: [],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    res.end(JSON.stringify({
      success: true,
      capabilities: [{
        netuid: 14,
        name: "TAOHash",
        category: "Compute and infrastructure",
        utilitySummary: subnet.benefitSummary,
        capabilityLevel: "adapter_required",
        userBenefits: ["Inspect compute-oriented subnet context."],
        examplePrompts: ["Explain subnet 14."],
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"],
        serviceAdapter: "compute",
        requiredAuth: "unknown",
        costModel: "unknown",
        requestSchema: {},
        resultSchema: {},
        dataFreshness: { source: "mock", block: null, freshness: null, updatedAt: "2026-06-09T00:00:00.000Z", liveReadReady: true },
        adapterStatus: { configured: false, adapter: "compute", message: "No compute adapter configured.", requiredAuth: "unknown", costModel: "unknown" },
        safetyNotes: ["External signer required."],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities/14") {
    res.end(JSON.stringify({
      success: true,
      capability: {
        netuid: 14,
        name: "TAOHash",
        category: "Compute and infrastructure",
        utilitySummary: subnet.benefitSummary,
        capabilityLevel: "adapter_required",
        userBenefits: ["Inspect compute-oriented subnet context."],
        examplePrompts: ["Explain subnet 14."],
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"],
        serviceAdapter: "compute",
        requiredAuth: "unknown",
        costModel: "unknown",
        requestSchema: {},
        resultSchema: {},
        dataFreshness: { source: "mock", block: null, freshness: null, updatedAt: "2026-06-09T00:00:00.000Z", liveReadReady: true },
        adapterStatus: { configured: false, adapter: "compute", message: "No compute adapter configured.", requiredAuth: "unknown", costModel: "unknown" },
        safetyNotes: ["External signer required."],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/sidecar/status") {
    res.end(JSON.stringify({
      success: true,
      sidecar: {
        configured: false,
        network: "finney",
        canRead: false,
        canPrepare: false,
        canSubmit: false,
        message: "Mock sidecar disabled",
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/sidecar/health") {
    res.end(JSON.stringify({
      success: true,
      health: {
        configured: false,
        network: "finney",
        canRead: false,
        canPrepare: false,
        canSubmit: false,
        reachable: false,
        status: "unconfigured",
        latencyMs: null,
        checkedAt: "2026-06-09T00:00:00.000Z",
        message: "Mock sidecar disabled",
      },
      cards: [{
        kind: "signer_status",
        title: "Subtensor sidecar health",
        items: [{ label: "Reachable", value: "No" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    res.end(JSON.stringify({
      success: true,
      report: {
        status: "warning",
        checkedAt: "2026-06-09T00:00:00.000Z",
        checks: [
          { id: "chat_intents", label: "Chat intent planner", status: "pass", summary: "Core Bittensor chat intents classify." },
          { id: "sidecar_status", label: "Subtensor sidecar status", status: "warning", summary: "Sidecar not configured." },
        ],
        blockers: [],
        warnings: ["Subtensor sidecar status: Sidecar not configured."],
        nextActions: ["Configure a Subtensor sidecar for live-chain checks."],
      },
      cards: [{
        kind: "readiness_report",
        title: "Bittensor readiness audit",
        items: [{ label: "Warnings", value: "1" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/adapters/doctor") {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "bittensor_subnet_adapter_doctor",
        status: "pass",
        checkedAt: "2026-06-09T00:00:00.000Z",
        rawConfigured: true,
        rawEntryCount: 1,
        readyCount: 1,
        warningCount: 0,
        blockedCount: 0,
        entries: [{
          index: 0,
          status: "ready",
          netuid: 14,
          name: "Mock compute adapter",
          serviceAdapter: "compute",
          requiredAuth: "none",
          costModel: "free_read",
          timeoutMs: 20000,
          endpoint: { configured: true, mode: "mock", origin: "mock://compute", host: "compute", allowed: true, reason: "Mock adapter endpoint is enabled." },
          auth: { required: "none", envConfigured: false, credentialPresent: null, message: "Adapter does not require credentials." },
          contractValidation: { ok: true, errors: [], warnings: [] },
          serviceCallReady: true,
          errors: [],
          warnings: [],
          safetyNotes: ["Mock adapter only."],
        }],
        errors: [],
        warnings: [],
        nextActions: ["Run preview-confirm-invoke smoke tests."],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/adapters/templates") {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "bittensor_subnet_adapter_template_report",
        generatedAt: "2026-06-09T00:00:00.000Z",
        templates: [{
          kind: "bittensor_subnet_adapter_config_template",
          adapter: url.searchParams.get("adapter") || "data_search",
          name: "HTTPS data-search subnet adapter",
          description: "Template for a reviewed HTTPS adapter.",
          recommendedFor: ["data search"],
          config: {
            netuid: Number(url.searchParams.get("netuid") || 14),
            name: "HTTPS data-search subnet adapter",
            serviceAdapter: "data_search",
            endpoint: "https://adapter.example.com/bittensor/data-search/invoke",
            requiredAuth: "api_key",
            costModel: "provider_priced",
            authEnv: "BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN",
            timeoutMs: 20000,
            safetyNotes: ["No credential values in config."],
          },
          env: {
            adaptersJson: "[{\"netuid\":14}]",
            endpointAllowlist: "adapter.example.com",
            credentialEnv: "BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN",
            credentialValue: "<set-outside-matterhorn>",
          },
          requestSchema: { type: "object" },
          resultSchema: { type: "object" },
          preflightSteps: ["Run bittensor_preview_subnet_invocation before invoking."],
          safetyNotes: ["Never send wallet key material to adapters."],
        }],
        warnings: [],
        nextActions: ["Run the adapter doctor."],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/adapters/conformance") {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "bittensor_subnet_adapter_conformance",
        status: "pass",
        checkedAt: "2026-06-09T00:00:00.000Z",
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        cases: [{
          name: "Mock compute adapter",
          netuid: Number(url.searchParams.get("netuid") || 14),
          adapter: "compute",
          mode: "mock",
          status: "pass",
          metadataEndpoint: { configured: true, mode: "mock", origin: "mock://compute", host: "compute", allowed: true, reason: "Mock metadata endpoint is enabled." },
          metadata: {
            version: "matterhorn.bittensor.adapter.v1",
            netuid: Number(url.searchParams.get("netuid") || 14),
            serviceAdapter: "compute",
            supportedIntents: ["service_call"],
            safeModeRequired: true,
            requestHashRequired: true,
            maxResponseBytes: 256000,
            healthStatus: "ok",
          },
          checks: [{ id: "no_user_task", label: "No user task sent", status: "pass", summary: "No user task text was sent." }],
          errors: [],
          warnings: [],
        }],
        warnings: [],
        nextActions: ["Run preview-confirm-invoke smoke tests."],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/adapters/dry-run") {
    res.end(JSON.stringify({
      success: true,
      report: {
        kind: "bittensor_subnet_adapter_dry_run",
        status: "pass",
        checkedAt: "2026-06-09T00:00:00.000Z",
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        cases: [{
          name: "Mock compute adapter",
          netuid: 14,
          adapter: "compute",
          mode: "mock",
          status: "pass",
          requestSha256: "a".repeat(64),
          previewSupported: true,
          missingHashRejected: true,
          mismatchedHashRejected: true,
          invocationSupported: true,
          redactionPassed: true,
          errors: [],
          warnings: [],
        }],
        warnings: [],
        nextActions: ["Use the same assertions for real adapter integration PRs."],
      },
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/prepare") {
    res.end(JSON.stringify({
      success: true,
      preview: {
        action: "stake",
        network: "finney",
        netuid: 14,
        amountTao: 1,
        coldkey: null,
        hotkey: null,
        destination: null,
        feeTao: 0.0001,
        slippageBps: 25,
        expectedAlpha: 2,
        unsignedPayload: { action: "stake", netuid: 14, amountTao: 1 },
        signer: { mode: "desktop_handoff", available: true, canSign: false, canSubmit: false, network: "finney", address: null, message: "Mock signer" },
        warnings: ["External signature required."],
        consequenceSummary: "If signed, this stakes 1 TAO.",
        requiresExternalSignature: true,
      },
      cards: [{
        kind: "signed_action_review",
        title: "Stake review",
        items: [{ label: "Amount", value: "1 TAO" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/handoff") {
    res.end(JSON.stringify({
      success: true,
      handoff: {
        id: "bt-handoff-mock",
        action: "stake",
        network: "finney",
        netuid: 14,
        payload: { action: "stake", netuid: 14, amountTao: 1 },
        payloadJson: "{\"action\":\"stake\",\"amountTao\":1,\"netuid\":14}",
        payloadSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        suggestedFilename: "bittensor-stake-subnet-14-0123456789.json",
        signerMode: "desktop_handoff",
        createdAt: "2026-06-09T00:00:00.000Z",
        expiresAt: "2026-06-09T00:10:00.000Z",
        instructions: ["Review the payload checksum."],
        warnings: ["External signature required."],
        consequenceSummary: "If signed, this stakes 1 TAO.",
      },
      cards: [{
        kind: "signing_handoff",
        title: "External signing handoff",
        items: [{ label: "Payload SHA-256", value: "0123456789abcdef0123" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/submit") {
    res.end(JSON.stringify({
      success: true,
      result: { status: "sidecar_unavailable", txHash: null, blockHash: null, message: "Mock sidecar unavailable", explorerUrl: null },
      cards: [{
        kind: "signed_action_review",
        title: "Bittensor action not submitted",
        items: [{ label: "Status", value: "Sidecar Unavailable" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/preview") {
    const requestSha256 = "a".repeat(64);
    res.end(JSON.stringify({
      success: true,
      preview: {
        netuid: 14,
        subnetName: "TAOHash",
        intent: "service_call",
        adapter: "compute",
        supported: false,
        configured: false,
        requiredAuth: "unknown",
        costModel: "unknown",
        request: { netuid: 14, intent: "service_call", task: "mock task", ss58Address: null },
        requestJson: "{\"intent\":\"service_call\",\"netuid\":14,\"ss58Address\":null,\"task\":\"mock task\"}",
        requestSha256,
        confirmationPrompt: `Confirm Bittensor subnet 14 service call with request SHA-256 ${requestSha256}.`,
        requestSchema: {},
        resultSchema: {},
        safetyNotes: ["Universal support covers explanation, monitoring, and staking guidance."],
        warnings: ["No configured compute service adapter is ready for this subnet."],
        consequenceSummary: "Matterhorn cannot call TAOHash's direct service yet because no supported adapter is configured.",
        requiresConfirmation: true,
      },
      cards: [{
        kind: "unsupported_adapter",
        title: "Subnet 14 adapter unavailable",
        items: [{ label: "Request SHA-256", value: requestSha256 }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    res.end(JSON.stringify({
      success: true,
      invocation: { netuid: 14, intent: "metagraph", adapter: "universal", supported: true, result: { metagraphSummary: detail.metagraphSummary }, message: "Mock invocation", warnings: [] },
      cards: [{
        kind: "subnet_result",
        title: "Subnet 14 result",
        items: [{ label: "Supported", value: "Yes" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/validators/compare") {
    res.end(JSON.stringify({
      success: true,
      comparison: {
        netuid: 14,
        subnetName: "TAOHash",
        strategy: "balanced",
        candidates: [{
          netuid: 14,
          subnetName: "TAOHash",
          uid: 1,
          hotkey: VALID_SS58,
          coldkey: VALID_SS58,
          stake: 1000,
          trust: 0.9,
          dividends: 0.2,
          score: 100,
          reasons: ["Stake sample: 1,000.", "Trust sample: 0.9.", "Dividend sample: 0.2."],
          warnings: ["Informational only."],
          source: "mock",
        }],
        warnings: ["Informational only."],
        source: "mock",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "validator_selection",
        title: "Validator candidate 1",
        items: [{ label: "Hotkey", value: "5Grw..." }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    res.end(JSON.stringify({
      success: true,
      watch: { id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" },
      watches: [],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Netuid", value: "14" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    res.end(JSON.stringify({
      success: true,
      watches: [{ id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" }],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Netuid", value: "14" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/check") {
    res.end(JSON.stringify({
      success: true,
      evaluations: [{
        watch: { id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" },
        status: "ok",
        summary: "TAOHash metadata is available from mock.",
        observedValue: 128,
        threshold: null,
        source: "mock",
        checkedAt: "2026-06-09T00:00:00.000Z",
      }],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Status", value: "Ok" }],
      }],
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: "not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn("node", [mcpPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MATTERHORN_SERVER_URL: `http://127.0.0.1:${port}` },
});

let buffer = "";
let stderr = "";
child.stdout.on("data", (data) => { buffer += data; });
child.stderr.on("data", (data) => { stderr += data; });

function ask(msg) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      child.off("exit", onExit);
    };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`MCP child exited with code ${code}\n${stderr.trim()}`));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for ${msg.method}\n${stderr.trim()}`));
    }, 5000);
    const interval = setInterval(() => {
      const lines = buffer.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === msg.id) {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(response);
            return;
          }
        } catch {}
      }
    }, 25);
    child.once("exit", onExit);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

try {
  await ask({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const tools = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = tools.result.tools.map((tool) => tool.name);
  for (const name of [
    "bittensor_list_subnets",
    "bittensor_explain_subnet",
    "bittensor_compare_subnets",
    "bittensor_get_wallet_positions",
    "bittensor_analyze_subnet",
    "bittensor_analyze_wallet",
    "bittensor_analyze_validator",
    "bittensor_build_staking_plan",
    "bittensor_prepare_action",
    "bittensor_plan_from_chat",
    "bittensor_chat",
    "bittensor_find_subnets_for_goal",
    "bittensor_get_subnet_capabilities",
    "bittensor_get_sidecar_status",
    "bittensor_get_sidecar_health",
    "bittensor_readiness_audit",
    "bittensor_doctor_subnet_adapters",
    "bittensor_get_subnet_adapter_templates",
    "bittensor_probe_subnet_adapter_conformance",
    "bittensor_dry_run_subnet_adapters",
    "bittensor_prepare_extrinsic",
    "bittensor_create_signing_handoff",
    "bittensor_submit_signed_extrinsic",
    "bittensor_preview_subnet_invocation",
    "bittensor_invoke_subnet",
    "bittensor_compare_validators",
    "bittensor_create_watch",
    "bittensor_list_watches",
    "bittensor_check_watches",
  ]) {
    assert.ok(names.includes(name), `${name} should be registered`);
  }
  const bittensorSchemas = tools.result.tools.filter((tool) => tool.name.startsWith("bittensor_"));
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(bittensorSchemas)), false);
  const descriptionFor = (name) => tools.result.tools.find((tool) => tool.name === name)?.description || "";
  assert.match(descriptionFor("bittensor_chat"), /Default first tool/i);
  assert.match(descriptionFor("bittensor_get_subnet_capabilities"), /before previewing or invoking/i);
  assert.match(descriptionFor("bittensor_doctor_subnet_adapters"), /without exposing token values or auth env names/i);
  assert.match(descriptionFor("bittensor_get_subnet_adapter_templates"), /Never returns credential values/i);
  assert.match(descriptionFor("bittensor_probe_subnet_adapter_conformance"), /without sending user task text/i);
  assert.match(descriptionFor("bittensor_dry_run_subnet_adapters"), /Non-mock adapters are skipped/i);
  assert.match(descriptionFor("bittensor_preview_subnet_invocation"), /First inspect bittensor_get_subnet_capabilities/i);
  assert.match(descriptionFor("bittensor_invoke_subnet"), /capability inspection, preview, explicit confirmation/i);

  const list = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "bittensor_list_subnets", arguments: { query: "hash" } } });
  assert.equal(JSON.parse(list.result.content[0].text).subnets.length, 1);
  assert.equal(JSON.parse(list.result.content[0].text).cards[0].kind, "subnet_comparison");

  const explain = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "bittensor_explain_subnet", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(explain.result.content[0].text).subnet.netuid, 14);

  const compare = await ask({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "bittensor_compare_subnets", arguments: { netuids: [14] } } });
  assert.equal(JSON.parse(compare.result.content[0].text).comparison.length, 1);

  const wallet = await ask({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "bittensor_get_wallet_positions", arguments: { ss58Address: VALID_SS58 } } });
  assert.equal(JSON.parse(wallet.result.content[0].text).wallet.providerStatus, "provider_unavailable");

  const subnetIntel = await ask({ jsonrpc: "2.0", id: 23, method: "tools/call", params: { name: "bittensor_analyze_subnet", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(subnetIntel.result.content[0].text).report.score, 72);
  assert.equal(JSON.parse(subnetIntel.result.content[0].text).cards[0].kind, "intelligence_report");

  const walletIntel = await ask({ jsonrpc: "2.0", id: 24, method: "tools/call", params: { name: "bittensor_analyze_wallet", arguments: { ss58Address: VALID_SS58 } } });
  assert.equal(JSON.parse(walletIntel.result.content[0].text).report.kind, "wallet");
  assert.equal(JSON.parse(walletIntel.result.content[0].text).cards[0].kind, "intelligence_report");

  const validatorIntel = await ask({ jsonrpc: "2.0", id: 25, method: "tools/call", params: { name: "bittensor_analyze_validator", arguments: { netuid: 14, validatorHotkey: VALID_SS58 } } });
  assert.equal(JSON.parse(validatorIntel.result.content[0].text).report.kind, "validator");
  assert.equal(JSON.parse(validatorIntel.result.content[0].text).cards[0].kind, "intelligence_report");

  const stakingPlan = await ask({ jsonrpc: "2.0", id: 26, method: "tools/call", params: { name: "bittensor_build_staking_plan", arguments: { message: "Build a safety staking plan for compute exposure.", amountTao: "2", ss58Address: VALID_SS58, strategy: "safety" } } });
  assert.equal(JSON.parse(stakingPlan.result.content[0].text).plan.kind, "staking_plan");
  assert.equal(JSON.parse(stakingPlan.result.content[0].text).cards[0].kind, "intelligence_report");

  const quote = await ask({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "bittensor_prepare_action", arguments: { action: "stake", netuid: 14, amountTao: "1" } } });
  assert.equal(JSON.parse(quote.result.content[0].text).quote.requiresExternalSignature, true);
  assert.equal(JSON.parse(quote.result.content[0].text).cards[0].kind, "staking_quote");

  const plan = await ask({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "bittensor_plan_from_chat", arguments: { message: "Find compute subnets" } } });
  assert.equal(JSON.parse(plan.result.content[0].text).plan.intent, "discover");

  const chat = await ask({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "bittensor_chat", arguments: { message: "which subnet is useful for image generation?", limit: 5 } } });
  const chatPayload = JSON.parse(chat.result.content[0].text);
  assert.equal(chatPayload.execution, "answered");
  assert.equal(chatPayload.cards[0].kind, "subnet_comparison");
  assert.equal(chatPayload.context.id, "bt-chat-mockcontext");
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(chatPayload)), false);

  const find = await ask({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "bittensor_find_subnets_for_goal", arguments: { goal: "compute", limit: 3 } } });
  assert.equal(JSON.parse(find.result.content[0].text).subnets.length, 1);
  assert.equal(JSON.parse(find.result.content[0].text).matches[0].score, 12);

  const capabilities = await ask({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "bittensor_get_subnet_capabilities", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(capabilities.result.content[0].text).capability.netuid, 14);

  const sidecar = await ask({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "bittensor_get_sidecar_status", arguments: {} } });
  assert.equal(JSON.parse(sidecar.result.content[0].text).sidecar.configured, false);

  const sidecarHealth = await ask({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "bittensor_get_sidecar_health", arguments: {} } });
  assert.equal(JSON.parse(sidecarHealth.result.content[0].text).health.status, "unconfigured");
  assert.equal(JSON.parse(sidecarHealth.result.content[0].text).cards[0].kind, "signer_status");

  const readiness = await ask({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "bittensor_readiness_audit", arguments: {} } });
  assert.equal(JSON.parse(readiness.result.content[0].text).report.status, "warning");
  assert.equal(JSON.parse(readiness.result.content[0].text).cards[0].kind, "readiness_report");

  const adapterDoctor = await ask({ jsonrpc: "2.0", id: 28, method: "tools/call", params: { name: "bittensor_doctor_subnet_adapters", arguments: {} } });
  const adapterDoctorPayload = JSON.parse(adapterDoctor.result.content[0].text);
  assert.equal(adapterDoctorPayload.success, true);
  assert.equal(adapterDoctorPayload.report.kind, "bittensor_subnet_adapter_doctor");
  assert.equal(adapterDoctorPayload.report.readyCount, 1);
  assert.doesNotMatch(JSON.stringify(adapterDoctorPayload), /seed|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token/i);

  const adapterTemplates = await ask({ jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: "bittensor_get_subnet_adapter_templates", arguments: { adapter: "data_search", netuid: 14 } } });
  const adapterTemplatePayload = JSON.parse(adapterTemplates.result.content[0].text);
  assert.equal(adapterTemplatePayload.success, true);
  assert.equal(adapterTemplatePayload.report.kind, "bittensor_subnet_adapter_template_report");
  assert.equal(adapterTemplatePayload.report.templates[0].config.netuid, 14);
  assert.equal(adapterTemplatePayload.report.templates[0].env.credentialValue, "<set-outside-matterhorn>");
  assert.doesNotMatch(JSON.stringify(adapterTemplatePayload), /seed|mnemonic|privateKey|wallet export|super-secret-token-value/i);

  const adapterConformance = await ask({ jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "bittensor_probe_subnet_adapter_conformance", arguments: { netuid: 14 } } });
  const adapterConformancePayload = JSON.parse(adapterConformance.result.content[0].text);
  assert.equal(adapterConformancePayload.success, true);
  assert.equal(adapterConformancePayload.report.kind, "bittensor_subnet_adapter_conformance");
  assert.equal(adapterConformancePayload.report.passed, 1);
  assert.equal(adapterConformancePayload.report.cases[0].metadata.requestHashRequired, true);
  assert.doesNotMatch(JSON.stringify(adapterConformancePayload), /seed|mnemonic|privateKey|wallet export|super-secret-token-value/i);

  const adapterDryRun = await ask({ jsonrpc: "2.0", id: 29, method: "tools/call", params: { name: "bittensor_dry_run_subnet_adapters", arguments: { netuid: 14, task: "dry run task" } } });
  const adapterDryRunPayload = JSON.parse(adapterDryRun.result.content[0].text);
  assert.equal(adapterDryRunPayload.success, true);
  assert.equal(adapterDryRunPayload.report.kind, "bittensor_subnet_adapter_dry_run");
  assert.equal(adapterDryRunPayload.report.passed, 1);
  assert.equal(adapterDryRunPayload.report.cases[0].missingHashRejected, true);
  assert.equal(adapterDryRunPayload.report.cases[0].mismatchedHashRejected, true);
  assert.doesNotMatch(JSON.stringify(adapterDryRunPayload), /seed|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token/i);

  const preview = await ask({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "bittensor_prepare_extrinsic", arguments: { action: "stake", netuid: 14, amountTao: "1" } } });
  const previewPayload = JSON.parse(preview.result.content[0].text);
  assert.equal(previewPayload.preview.requiresExternalSignature, true);
  assert.equal(previewPayload.cards[0].kind, "signed_action_review");

  const handoff = await ask({ jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "bittensor_create_signing_handoff", arguments: { preview: previewPayload.preview } } });
  assert.equal(JSON.parse(handoff.result.content[0].text).handoff.payloadSha256.length, 64);
  assert.equal(JSON.parse(handoff.result.content[0].text).cards[0].kind, "signing_handoff");

  const submit = await ask({ jsonrpc: "2.0", id: 16, method: "tools/call", params: { name: "bittensor_submit_signed_extrinsic", arguments: { preview: { action: "stake" }, signature: "0x1234567890abcdef" } } });
  assert.equal(JSON.parse(submit.result.content[0].text).result.status, "sidecar_unavailable");

  const subnetPreview = await ask({ jsonrpc: "2.0", id: 27, method: "tools/call", params: { name: "bittensor_preview_subnet_invocation", arguments: { netuid: 14, intent: "service_call", task: "mock task" } } });
  const subnetPreviewPayload = JSON.parse(subnetPreview.result.content[0].text);
  assert.equal(subnetPreviewPayload.preview.requestSha256.length, 64);
  assert.equal(subnetPreviewPayload.preview.requiresConfirmation, true);
  assert.equal(subnetPreviewPayload.cards[0].kind, "unsupported_adapter");
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(subnetPreviewPayload)), false);

  const invoke = await ask({ jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "bittensor_invoke_subnet", arguments: { netuid: 14, intent: "metagraph", previewRequestSha256: subnetPreviewPayload.preview.requestSha256 } } });
  assert.equal(JSON.parse(invoke.result.content[0].text).invocation.supported, true);
  assert.equal(JSON.parse(invoke.result.content[0].text).cards[0].kind, "subnet_result");

  const validators = await ask({ jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "bittensor_compare_validators", arguments: { netuid: 14, strategy: "balanced" } } });
  assert.equal(JSON.parse(validators.result.content[0].text).comparison.candidates.length, 1);
  assert.equal(JSON.parse(validators.result.content[0].text).cards[0].kind, "validator_selection");

  const watch = await ask({ jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "bittensor_create_watch", arguments: { kind: "subnet", netuid: 14, label: "Watch subnet 14" } } });
  assert.equal(JSON.parse(watch.result.content[0].text).watch.netuid, 14);

  const watchlist = await ask({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "bittensor_list_watches", arguments: {} } });
  assert.equal(JSON.parse(watchlist.result.content[0].text).watches.length, 1);

  const checkedWatches = await ask({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "bittensor_check_watches", arguments: {} } });
  assert.equal(JSON.parse(checkedWatches.result.content[0].text).evaluations[0].status, "ok");
  assert.equal(JSON.parse(checkedWatches.result.content[0].text).cards[0].kind, "watchlist");

  console.log("All Bittensor MCP smoke tests passed.");
} finally {
  child.kill();
  server.close();
}
