export function isHyperliquidExecutionEnabled(): boolean {
  const value = process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function buildMarketExecutionReadinessReport(checkedAt = new Date().toISOString()) {
  const hyperliquidExecution = isHyperliquidExecutionEnabled();
  return {
    version: "matterhorn.market.execution-readiness.v1",
    checkedAt,
    readyForLiveSubmission: true,
    status: hyperliquidExecution ? "ready" : "review",
    venues: [
      {
        venue: "hyperliquid",
        routeFamily: "hyperliquid.orders",
        executionMode: hyperliquidExecution ? "wallet_approved" : "preview_only",
        liveSubmissionEnabled: hyperliquidExecution,
        canSubmit: hyperliquidExecution,
        supportedNow: hyperliquidExecution
          ? ["read", "preview", "connected_wallet_sign", "intent_bound_live_submit", "public_receipt"]
          : ["read", "preview", "public_receipt_import"],
        blockedNow: hyperliquidExecution
          ? ["agent_auto_submit", "custodial_signing", "exchange_secret_storage", "unbound_signature_submit"]
          : ["connected_wallet_submit", "agent_auto_submit", "custodial_signing", "exchange_secret_storage"],
        missingBeforeLiveSubmit: hyperliquidExecution ? [] : ["enable deployment execution kill switch"],
      },
      {
        venue: "polymarket",
        routeFamily: "polymarket.orders",
        executionMode: "reviewed_wallet_ticket",
        liveSubmissionEnabled: true,
        canSubmit: true,
        supportedNow: [
          "read",
          "preview",
          "compliance_check",
          "eligible_eoa_buy_wallet_ticket",
          "eligible_eoa_sell_wallet_ticket",
          "exact_order_cancellation",
          "public_receipt",
        ],
        blockedNow: [
          "agent_submit",
          "automatic_submit",
          "proxy_account_wallet_ticket",
          "custodial_signing",
          "exchange_secret_storage",
          "compliance_bypass",
        ],
        missingBeforeLiveSubmit: [],
      },
    ],
    reviewedWalletTickets: {
      hyperliquid: {
        available: hyperliquidExecution,
        scope: "Exact, expiring testnet orders by default; mainnet requires typed confirmation and the deployment kill switch.",
      },
      polymarket: {
        available: true,
        scope: "Compliance-allowed EOA buy and sell orders plus exact-order cancellation on Polygon. Proxy-account and advanced flows remain unavailable.",
      },
      bittensor: {
        available: true,
        scope: "TAO transfer, stake, and unstake through an installed Bittensor extension. Advanced calls remain unavailable until separately integrated and audited.",
      },
    },
    controls: [
      { id: "preview_hash_binding", status: "pass", summary: "Every supported submission is bound to one exact, expiring reviewed intent." },
      { id: "connected_wallet_only", status: "pass", summary: "The connected wallet authorizes each supported action. Matterhorn never signs or custodies keys." },
      { id: "policy_and_simulation", status: "pass", summary: "Policy and fresh protocol checks run before wallet review; changed terms require a new ticket." },
      { id: "public_receipt_import", status: "pass", summary: "Receipt evidence is public status only and not treated as exchange submission authority." },
      { id: "route_level_kill_switch", status: "pass", summary: hyperliquidExecution ? "The deployment kill switch enables Hyperliquid execution." : "The deployment kill switch currently disables Hyperliquid execution." },
      {
        id: "live_submit_routes",
        status: hyperliquidExecution ? "pass" : "blocked",
        summary: hyperliquidExecution
          ? "Hyperliquid exposes a wallet-signed, intent-bound server submit route. Eligible Polymarket buy, sell, and cancel actions use a separate browser wallet ticket."
          : "The Hyperliquid server submit route is disabled. Eligible Polymarket buy, sell, and cancel actions still use the separate browser wallet ticket.",
      },
    ],
    nextActions: hyperliquidExecution
      ? [
          "Test a small Hyperliquid order on testnet with the connected wallet before using mainnet.",
          "Owner-test one compliance-allowed Polymarket buy, sell, and cancel cycle with a disposable wallet and minimal assets.",
          "Run pnpm test:market-execution-safety-gate before release.",
        ]
      : [
          "Enable MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED only after deployment review.",
          "Keep using Hyperliquid research and previews until connected-wallet execution is enabled.",
        ],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: true,
      canSubmit: true,
      signsOrSubmits: true,
      signs: false,
      submitsWalletAuthorizedIntents: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
    },
  } as const;
}

export function buildMarketExecutionReadinessCard(report = buildMarketExecutionReadinessReport()) {
  const hyperliquid = report.venues.find((venue) => venue.venue === "hyperliquid");
  const hyperliquidEnabled = hyperliquid?.canSubmit === true;
  return {
    kind: "market_execution_readiness",
    title: "Market execution readiness",
    summary: hyperliquidEnabled
      ? "Agents prepare drafts only. Hyperliquid and eligible Polymarket buy, sell, and cancel actions continue through separate connected-wallet tickets."
      : "Hyperliquid execution is disabled by the deployment kill switch. Eligible Polymarket buy, sell, and cancel actions can still use a separate connected-wallet ticket.",
    tone: hyperliquidEnabled ? "good" : "warning",
    source: { source: "matterhorn.execution-readiness", freshness: "live" },
    items: [
      { label: "Hyperliquid", value: hyperliquidEnabled ? "Wallet-approved execution" : "Execution disabled", tone: hyperliquidEnabled ? "good" : "warning" },
      { label: "Polymarket", value: "Buy · sell · cancel", tone: "good" },
      { label: "Agent submission", value: "No", tone: "good" },
      { label: "Automatic execution", value: "Off", tone: "good" },
      { label: "Secrets accepted", value: "No", tone: "good" },
    ],
    warnings: [
      "Every order requires exact-term review and connected-wallet authorization. Agents and watches cannot submit orders.",
      "Polymarket proxy-account and advanced order flows remain unavailable in this release.",
    ],
    data: { report },
  } as const;
}

export function buildMarketExecutionReadinessResponse(checkedAt = new Date().toISOString()) {
  const report = buildMarketExecutionReadinessReport(checkedAt);
  return {
    success: true,
    report,
    cards: [buildMarketExecutionReadinessCard(report)],
  } as const;
}

export function buildMarketExecutionChainGuide() {
  return {
    success: true,
    version: "matterhorn.market.execution-chain-guide.v1",
    title: "Connected-wallet transaction path",
    summary: "The agent drafts exact terms; deterministic checks and a separate connected-wallet ticket control every supported submission.",
    safety: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      nonCustodial: true,
      connectedWalletRequired: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
    },
    stages: [
      {
        id: "agent_draft",
        label: "Agent draft",
        purpose: "Turn the request into exact proposed terms without submission authority.",
        commands: [],
        output: "A non-submitting draft that clearly identifies the venue, action, amount, limits, and unresolved inputs.",
      },
      {
        id: "policy_and_simulation",
        label: "Safety checks",
        purpose: "Apply workspace limits, compliance, network checks, and a fresh protocol simulation.",
        commands: [],
        output: "A hash-bound reviewed action or a clear block. Any material change requires regeneration.",
      },
      {
        id: "wallet_review",
        label: "Wallet review",
        purpose: "Show the exact action, risks, expiry, network, signer, fees, and simulation before approval.",
        commands: [],
        output: "A short-lived ticket that cannot be edited after review.",
      },
      {
        id: "wallet_submission",
        label: "Wallet authorization",
        purpose: "Let the connected wallet authorize the unchanged reviewed action.",
        commands: [],
        output: "The wallet either rejects the ticket or submits the exact supported action. Agents and watches cannot do this.",
      },
      {
        id: "receipt_reconciliation",
        label: "Receipt",
        purpose: "Match public protocol evidence back to the reviewed intent hash.",
        commands: [],
        output: "A public status receipt that never contains secrets, signatures, or raw wallet material.",
      },
    ],
    forbidden: [
      "seed phrase",
      "private key",
      "API secret",
      "raw signature",
      "signed payload",
      "wallet export",
      "agent or watch submission",
    ],
  } as const;
}

export function buildMarketExecutionChainCard(
  guide = buildMarketExecutionChainGuide(),
  highlightedStepId: string | null = null,
) {
  const highlightedStep = highlightedStepId
    ? guide.stages.find((stage) => stage.id === highlightedStepId) ?? null
    : null;
  return {
    kind: "market_execution_chain",
    title: highlightedStep ? `Transaction path: ${highlightedStep.label}` : "Connected-wallet transaction path",
    summary: highlightedStep
      ? `${highlightedStep.label}: ${highlightedStep.purpose} ${highlightedStep.output}`
      : "Supported Hyperliquid and Polymarket actions move from an agent draft into deterministic checks and a separate connected-wallet ticket.",
    tone: "info",
    source: { source: "matterhorn.execution-chain", freshness: "live" },
    items: [
      { label: "Can submit", value: "No", tone: "good" },
      { label: "Live submission", value: "Off", tone: "good" },
      { label: "Connected wallet", value: "Required", tone: "warning" },
      { label: "Secret intake", value: "Never", tone: "good" },
      { label: "Stages", value: String(guide.stages.length), tone: "info" },
      ...(highlightedStep ? [{ label: "Focus", value: highlightedStep.label, tone: "info" }] : []),
    ],
    warnings: [
      "The agent can draft and explain, but it cannot approve or submit a transaction.",
      "Changing any reviewed term invalidates the ticket and requires fresh checks.",
    ],
    data: { guide, highlightedStep },
  } as const;
}

export function buildMarketExecutionChainResponse() {
  const guide = buildMarketExecutionChainGuide();
  return {
    success: true,
    guide,
    cards: [buildMarketExecutionChainCard(guide)],
  } as const;
}

export function buildMarketSdkValidationGuide() {
  return {
    success: true,
    version: "matterhorn.market.sdk-validation-guide.v1",
    title: "Official SDK validation",
    summary: "Public/redacted fixture or operator-owned testnet validation for Hyperliquid and Polymarket signing templates.",
    modes: ["fixture", "operator_owned_fixture", "operator_owned_testnet"],
    networks: {
      hyperliquid: ["fixture", "hyperliquid-testnet"],
      polymarket: ["fixture", "polygon-amoy"],
    },
    commands: {
      doctor: "matterhorn-work crypto sdk-doctor --strict --json",
      fixtureValidation: "matterhorn-work crypto sdk-validate-public --mode fixture --input-dir qa-fixtures/market-official-sdk --output-dir /tmp/matterhorn-market-sdk-public-validation --strict --json",
      operatorOwnedTestnetValidation: "matterhorn-work crypto sdk-validate-public --mode operator_owned_testnet --input-dir /tmp/operator-public-artifacts --output-dir /tmp/matterhorn-market-sdk-public-validation --hyperliquid-network hyperliquid-testnet --hyperliquid-package-version <hyperliquid-python-sdk-version> --polymarket-network polygon-amoy --polymarket-chain-id 80002 --polymarket-exchange-address <public-amoy-exchange-address> --polymarket-package-version <clob-client-version> --strict --json",
      operatorLoop: "matterhorn-work crypto sdk-loop --mode fixture --output-dir /tmp/matterhorn-market-sdk-loop --strict --json",
    },
    outputs: [
      "matterhorn-market-sdk-evidence.json",
      "matterhorn-market-sdk-public-validation.json",
      "matterhorn-market-sdk-public-validation.md",
      "matterhorn-market-sdk-public-validation.sha256",
      "matterhorn-market-sdk-run-manifest.json",
    ],
    safety: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      nonCustodial: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
      runsPrivateSdkSigning: false,
      computesFinalSignatures: false,
      callsExchanges: false,
    },
    forbidden: [
      "seed phrase",
      "private key",
      "API secret",
      "raw signature",
      "signed payload",
      "wallet export",
      "mainnet validation",
      "live submit route",
    ],
  } as const;
}

export function buildMarketSdkValidationCard(guide = buildMarketSdkValidationGuide()) {
  return {
    kind: "market_sdk_validation",
    title: "Official SDK validation",
    summary: "Validate Hyperliquid and Polymarket signing templates with public/redacted fixture or operator-owned testnet evidence only.",
    tone: "info",
    source: { source: "matterhorn.sdk-validation", freshness: "live" },
    items: [
      { label: "Hyperliquid", value: "Testnet evidence", tone: "info" },
      { label: "Polymarket", value: "Polygon Amoy evidence", tone: "info" },
      { label: "Can submit", value: "No", tone: "good" },
      { label: "Live submission", value: "Off", tone: "good" },
      { label: "Secret intake", value: "Never", tone: "good" },
    ],
    warnings: [
      "Official SDK validation is public/redacted evidence only.",
      "Matterhorn does not run private SDK signing, compute final signatures, call exchanges, or submit orders.",
    ],
    data: { guide },
  } as const;
}

export function buildMarketSdkValidationResponse() {
  const guide = buildMarketSdkValidationGuide();
  return {
    success: true,
    guide,
    cards: [buildMarketSdkValidationCard(guide)],
  } as const;
}
