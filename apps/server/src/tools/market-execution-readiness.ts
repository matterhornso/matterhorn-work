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
