export function buildMarketExecutionReadinessReport(checkedAt = new Date().toISOString()) {
  return {
    version: "matterhorn.market.execution-readiness.v1",
    checkedAt,
    readyForLiveSubmission: false,
    status: "disabled",
    venues: [
      {
        venue: "hyperliquid",
        routeFamily: "hyperliquid.orders",
        supportedNow: ["read", "preview", "external_sign_request", "redacted_artifact_validation", "public_receipt_import"],
        blockedNow: ["live_submit", "custodial_signing", "exchange_secret_storage"],
        missingBeforeLiveSubmit: [
          "independent security review",
          "external signer UX approval",
          "testnet signed-artifact evidence",
          "operator kill-switch rehearsal",
        ],
      },
      {
        venue: "polymarket",
        routeFamily: "polymarket.orders",
        supportedNow: ["read", "preview", "compliance_check", "external_sign_request", "redacted_artifact_validation", "public_receipt_import"],
        blockedNow: ["live_submit", "custodial_signing", "exchange_secret_storage", "compliance_bypass"],
        missingBeforeLiveSubmit: [
          "independent security review",
          "jurisdiction/compliance review",
          "external signer UX approval",
          "testnet signed-artifact evidence",
          "operator kill-switch rehearsal",
        ],
      },
    ],
    controls: [
      { id: "preview_hash_binding", status: "pass", summary: "Action previews and handoffs carry stable hashes before any external signing step." },
      { id: "external_signer_only", status: "pass", summary: "Matterhorn creates public sign-request packets but does not sign or custody keys." },
      { id: "redacted_artifact_validation", status: "pass", summary: "Only public/redacted signed-artifact metadata can be validated." },
      { id: "public_receipt_import", status: "pass", summary: "Receipt evidence is public status only and not treated as exchange submission authority." },
      { id: "route_level_kill_switch", status: "blocked", summary: "Live submit routes do not exist and must remain blocked until a separate security review." },
      { id: "live_submit_routes", status: "blocked", summary: "No Hyperliquid or Polymarket live submit route is exposed." },
    ],
    nextActions: [
      "Keep using read/preview/external-signer/public-receipt flows for Hyperliquid and Polymarket.",
      "Validate official-client signed-artifact evidence on operator-owned testnets without sending secrets to Matterhorn.",
      "Run pnpm test:market-execution-safety-gate before any future execution-contract PR.",
    ],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      canSubmit: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
      acceptsRawSignatures: false,
      acceptsSignedPayloads: false,
    },
  } as const;
}

export function buildMarketExecutionReadinessCard(report = buildMarketExecutionReadinessReport()) {
  return {
    kind: "market_execution_readiness",
    title: "Market execution readiness",
    summary: "Hyperliquid and Polymarket are read/preview/external-signer only. Live submission is disabled until a separate security review.",
    tone: "warning",
    source: { source: "matterhorn.execution-readiness", freshness: "live" },
    items: [
      { label: "Hyperliquid", value: "Execution disabled", tone: "warning" },
      { label: "Polymarket", value: "Execution disabled", tone: "warning" },
      { label: "Can submit", value: "No", tone: "good" },
      { label: "Live submission", value: "Off", tone: "good" },
      { label: "Secrets accepted", value: "No", tone: "good" },
    ],
    warnings: ["This is a readiness contract, not execution permission."],
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
    title: "Matterhorn market execution chain",
    summary: "Preview-only, testnet-external-signer, public/redacted evidence path for Hyperliquid and Polymarket.",
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
    title: highlightedStep ? `Market execution chain: ${highlightedStep.label}` : "Market execution chain",
    summary: highlightedStep
      ? `${highlightedStep.label}: ${highlightedStep.purpose} ${highlightedStep.output}`
      : "Safe chain for Hyperliquid and Polymarket: preview, external sign request, redacted artifact validation, artifact reconciliation, then public receipt import.",
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
      "This explains the safe operator path only; it does not create a live submit route.",
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
