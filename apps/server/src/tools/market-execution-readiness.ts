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
          : ["read", "preview", "external_sign_request", "redacted_artifact_validation", "public_receipt_import"],
        blockedNow: hyperliquidExecution
          ? ["agent_auto_submit", "custodial_signing", "exchange_secret_storage", "unbound_signature_submit"]
          : ["live_submit", "custodial_signing", "exchange_secret_storage"],
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
          "external_sign_request",
          "redacted_artifact_validation",
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
        scope: "Compliance-allowed EOA buy and sell orders plus exact-order cancellation on Polygon. Proxy-account and advanced flows remain external handoffs.",
      },
      bittensor: {
        available: true,
        scope: "TAO transfer, stake, and unstake through an installed Bittensor extension. Advanced calls remain unavailable until separately integrated and audited.",
      },
    },
    controls: [
      { id: "preview_hash_binding", status: "pass", summary: "Hyperliquid submission signs an exact, expiring server intent; legacy handoffs retain stable public hashes." },
      { id: "external_signer_only", status: "pass", summary: "The connected wallet signs each Hyperliquid intent. Matterhorn never signs or custodies keys." },
      { id: "redacted_artifact_validation", status: "pass", summary: "Only public/redacted signed-artifact metadata can be validated." },
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
          "Keep using read/preview/external-signer/public-receipt flows while execution is disabled.",
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
      "Polymarket proxy-account and advanced order flows remain external handoffs in this release.",
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
    title: "Legacy market evidence chain",
    summary: "Optional public/redacted evidence path for operators who finish unsupported or advanced actions outside Matterhorn.",
    safety: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      nonCustodial: true,
      externalSignerRequired: true,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
    },
    stages: [
      {
        id: "preview_handoff",
        label: "Preview / handoff",
        purpose: "Build a no-submit plan from public context.",
        commands: [
          "matterhorn-work hyperliquid handoff --asset BTC --side buy --size 0.001 --price <testnet-price> --json",
          "matterhorn-work polymarket handoff --market-id <testnet-market-id> --side yes --amount-usdc 1 --json",
        ],
        output: "Public handoff with canSubmit:false and liveSubmissionEnabled:false.",
      },
      {
        id: "external_sign_request",
        label: "External sign request",
        purpose: "Create public metadata for an operator-owned testnet signer only.",
        commands: [
          "matterhorn-work hyperliquid sign-request BTC --side buy --size 0.001 --price <testnet-price> --execution-mode testnet_external_signer --json",
          "matterhorn-work polymarket sign-request <testnet-market-id> --side yes --amount-usdc 1 --execution-mode testnet_external_signer --json",
        ],
        output: "matterhorn.market.external-sign-request.v1 with submitSignedAllowedByContract:false.",
      },
      {
        id: "redacted_artifact_validation",
        label: "Redacted artifact validation",
        purpose: "Validate public/redacted official-client metadata against the sign request hash.",
        commands: [
          "matterhorn-work hyperliquid validate-artifact --sign-request-file <public-sign-request.json> --artifact-file <redacted-artifact.json> --json",
          "matterhorn-work polymarket validate-artifact --sign-request-file <public-sign-request.json> --artifact-file <redacted-artifact.json> --json",
        ],
        output: "matterhorn.market.artifact-validation.v1 plus a public audit receipt candidate.",
      },
      {
        id: "artifact_reconciliation",
        label: "Artifact reconciliation",
        purpose: "Turn accepted public artifact validations into customer evidence.",
        commands: [
          "matterhorn-work crypto artifact-reconcile --hyperliquid-artifact-validation <hyperliquid-artifact-validation.json> --polymarket-artifact-validation <polymarket-artifact-validation.json> --strict --json",
        ],
        output: "matterhorn.market.artifact-reconciliation.v1.",
      },
      {
        id: "public_receipt_import",
        label: "Public receipt import",
        purpose: "Verify public status evidence against the original handoff.",
        commands: [
          "matterhorn-work hyperliquid receipt --handoff-file <public-handoff.json> --receipt-file <public-receipt.json> --json",
          "matterhorn-work polymarket receipt --handoff-file <public-handoff.json> --receipt-file <public-receipt.json> --json",
        ],
        output: "matterhorn.market.receipt.v1 public receipt evidence only.",
      },
    ],
    forbidden: [
      "seed phrase",
      "private key",
      "API secret",
      "raw signature",
      "signed payload",
      "wallet export",
      "live submit route",
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
    title: highlightedStep ? `Legacy evidence chain: ${highlightedStep.label}` : "Legacy evidence chain",
    summary: highlightedStep
      ? `${highlightedStep.label}: ${highlightedStep.purpose} ${highlightedStep.output}`
      : "Optional evidence chain for unsupported or advanced Hyperliquid and Polymarket actions completed outside Matterhorn.",
    tone: "info",
    source: { source: "matterhorn.execution-chain", freshness: "live" },
    items: [
      { label: "Can submit", value: "No", tone: "good" },
      { label: "Live submission", value: "Off", tone: "good" },
      { label: "External signer", value: "Required", tone: "warning" },
      { label: "Secret intake", value: "Never", tone: "good" },
      { label: "Stages", value: String(guide.stages.length), tone: "info" },
      ...(highlightedStep ? [{ label: "Focus", value: highlightedStep.label, tone: "info" }] : []),
    ],
    warnings: [
      "This is an optional external-client evidence path. Supported connected-wallet actions use the reviewed wallet ticket instead.",
      "Signed artifacts must be public/redacted metadata, never raw signatures or signed payloads.",
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
