#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const memorySource = readFileSync(join(repoRoot, "packages/types/src/memory.ts"), "utf8");
const memoryDoc = readFileSync(join(repoRoot, "docs/memory/matterhorn-memory-contract.md"), "utf8");

// 1. Package exposes the memory contract test script.
assert.equal(
  pkg.scripts["test:matterhorn-memory-contract"],
  "node scripts/matterhorn-memory-contract.test.mjs",
  "package.json should expose test:matterhorn-memory-contract",
);

// 2. Core types and constants are defined.
for (const token of [
  "MatterhornMemoryRecord",
  "MatterhornMemoryScope",
  "MatterhornMemoryKind",
  "MatterhornMemorySource",
  "MatterhornMemorySensitivity",
  "MatterhornMemoryProvenance",
  "MatterhornMemoryRedactionResult",
  "MatterhornMemorySafetyPolicy",
  "MatterhornMemoryStore",
  "MatterhornMemoryContextPacket",
  "MatterhornMemorySuggestion",
  "MatterhornMemoryUsePolicy",
  "MatterhornMemoryExportManifest",
  "MatterhornMemoryDesk",
  "MatterhornMemoryDeskPolicy",
  "MatterhornMemorySuggestionStatus",
  "MatterhornMemorySuggestionAction",
  "MatterhornMemorySuggestionLifecycle",
  "MatterhornMemorySuggestionConfirmationResult",
]) {
  assert.ok(memorySource.includes(token), `memory.ts must define ${token}`);
}

for (const token of [
  "MATTERHORN_MEMORY_SCOPES",
  "MATTERHORN_MEMORY_KINDS",
  "MATTERHORN_MEMORY_SOURCES",
  "MATTERHORN_MEMORY_SENSITIVITIES",
  "DEFAULT_MATTERHORN_MEMORY_SAFETY_POLICY",
  "FORBIDDEN_MEMORY_SECRET_FIELD_NAMES",
  "FORBIDDEN_MEMORY_SECRET_PATTERNS",
  "MATTERHORN_MEMORY_CONTEXT_PACKET_VERSION",
  "MATTERHORN_MEMORY_SUGGESTION_VERSION",
  "DEFAULT_MATTERHORN_MEMORY_USE_POLICY",
  "MATTERHORN_MEMORY_EXPORT_MANIFEST_VERSION",
  "MATTERHORN_MEMORY_DESKS",
  "MATTERHORN_MEMORY_DESK_POLICY_MATRIX",
  "MATTERHORN_MEMORY_SUGGESTION_USE_CASES",
  "MATTERHORN_MEMORY_SUGGESTION_USER_ACTIONS",
  "MATTERHORN_MEMORY_SUGGESTION_STATUSES",
  "MATTERHORN_MEMORY_SUGGESTION_ACTIONS",
  "DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS",
]) {
  assert.ok(memorySource.includes(token), `memory.ts must define ${token}`);
}

// 3. Required enum-like values are present.
for (const scope of ["user", "workspace", "project", "session"]) {
  assert.ok(memorySource.includes(`"${scope}"`), `scope ${scope} must be defined`);
}

for (const kind of [
  "user_preference",
  "project_fact",
  "protocol_address",
  "watchlist",
  "receipt",
  "workflow_artifact",
  "decision",
  "client_profile",
  "connector_preference",
  "mcp_tool_preference",
]) {
  assert.ok(memorySource.includes(`"${kind}"`), `kind ${kind} must be defined`);
}

for (const source of [
  "user_confirmed",
  "chat_capture",
  "workflow_output",
  "receipt_import",
  "watch_event",
  "connector_metadata",
  "manual_entry",
]) {
  assert.ok(memorySource.includes(`"${source}"`), `source ${source} must be defined`);
}

for (const sensitivity of ["public", "private", "restricted", "forbidden_secret"]) {
  assert.ok(memorySource.includes(`"${sensitivity}"`), `sensitivity ${sensitivity} must be defined`);
}

for (const desk of [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "decentralized_services",
  "generic_workspace",
]) {
  assert.ok(memorySource.includes(`"${desk}"`), `desk ${desk} must be defined`);
}

for (const action of ["confirm", "edit", "dismiss"]) {
  assert.ok(memorySource.includes(`"${action}"`), `userAction ${action} must be defined`);
}

for (const status of ["pending", "confirmed", "edited", "dismissed", "expired", "blocked"]) {
  assert.ok(memorySource.includes(`"${status}"`), `status ${status} must be defined`);
}

for (const action of ["confirm", "edit", "dismiss"]) {
  assert.ok(memorySource.includes(`"${action}"`), `lifecycle action ${action} must be defined`);
}

for (const useCase of [
  "bittensor_wallet_label",
  "bittensor_subnet_watch_preference",
  "bittensor_validator_watch_preference",
  "bittensor_receipt_context",
  "hyperliquid_watched_market",
  "polymarket_watched_market",
  "wellness_client_preference",
  "wellness_program_format_preference",
  "wellness_offer_builder_preference",
  "mcp_tool_preference",
  "workflow_artifact_preference",
]) {
  assert.ok(memorySource.includes(`"${useCase}"`), `useCase ${useCase} must be defined`);
}

// 4. Record shape includes every required field.
for (const field of [
  "id",
  "kind",
  "scope",
  "title",
  "summary",
  "body",
  "tags",
  "links",
  "provenance",
  "sensitivity",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "canUseInChat",
  "canExport",
  "canDelete",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryRecord must include ${field}`,
  );
}

// 5. Provenance shape includes every required field.
for (const field of ["source", "sourceId", "capturedAt", "capturedBy", "confidence", "reasonRemembered"]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryProvenance must include ${field}`,
  );
}

// 5a. Context packet shape includes every required field.
for (const field of [
  "version",
  "taskId",
  "sessionId",
  "workspaceId",
  "query",
  "records",
  "omittedRecords",
  "safetySummary",
  "visibleToUser",
  "generatedAt",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryContextPacket must include ${field}`,
  );
}

// 5b. Suggestion shape includes every required field.
for (const field of [
  "version",
  "id",
  "proposedRecord",
  "reason",
  "source",
  "confidence",
  "desk",
  "useCase",
  "userAction",
  "expiresAt",
  "captureMode",
  "canAutoCapture",
  "requiresExplicitConsent",
  "forbiddenIfSecretDetected",
  "policyDecision",
  "policyWarnings",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemorySuggestion must include ${field}`,
  );
}

// 5c. Use policy shape includes every required field.
for (const field of [
  "hiddenMemoryAllowed",
  "userVisibleMemoryChipsRequired",
  "autoCaptureAllowed",
  "secretCaptureAllowed",
  "wellnessClinicalCaptureRequiresExplicitConsent",
  "marketSubmissionMemoryAllowed",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryUsePolicy must include ${field}`,
  );
}

// 5d. Export manifest shape includes every required field.
for (const field of [
  "version",
  "exportedAt",
  "recordCount",
  "sha256",
  "includesSecrets",
  "includesRawSignatures",
  "includesSignedPayloads",
  "includesWalletExports",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryExportManifest must include ${field}`,
  );
}

// 5e. Desk policy shape includes every required field.
for (const field of [
  "desk",
  "allowedKinds",
  "defaultSensitivity",
  "canUseInChat",
  "canExport",
  "canSendToMcpApi",
  "forbiddenCases",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemoryDeskPolicy must include ${field}`,
  );
}

// 5f. Suggestion lifecycle shape includes every required field.
for (const field of [
  "suggestionId",
  "dedupeKey",
  "source",
  "kind",
  "scope",
  "sensitivity",
  "confidence",
  "reason",
  "proposedRecord",
  "createdAt",
  "expiresAt",
  "dismissedUntil",
  "dismissalWindowDays",
  "actorConfirmationRequired",
  "status",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemorySuggestionLifecycle must include ${field}`,
  );
}

// 5g. Confirmation result shape includes every required field.
for (const field of [
  "action",
  "suggestionId",
  "status",
  "memoryRecordId",
  "redaction",
  "blockedReasons",
  "provenance",
]) {
  assert.ok(
    memorySource.includes(`${field}:`) || memorySource.includes(`${field}?:`),
    `MatterhornMemorySuggestionConfirmationResult must include ${field}`,
  );
}

// 6. Safety policy forbids custodial and secret material by default.
const safetyPolicySection = memorySource.slice(memorySource.indexOf("interface MatterhornMemorySafetyPolicy"));
for (const invariant of [
  "canHoldPrivateKeys: false",
  "canHoldSeedPhrases: false",
  "canHoldApiSecrets: false",
  "canHoldRawSignatures: false",
  "canHoldSignedPayloads: false",
  "canHoldWalletExports: false",
  "canHoldBearerTokens: false",
  "canHoldExchangeSecrets: false",
  "requiresUserConfirmationForMedical: true",
  "marketLiveSubmissionEnabled: false",
  "bittensorCustodialEnabled: false",
  "wellnessOptInRequired: true",
]) {
  assert.ok(
    safetyPolicySection.includes(invariant),
    `memory safety policy must include ${invariant}`,
  );
}

// 7. Runtime validators reject forbidden secrets.
const memory = await import(join(repoRoot, "packages/types/src/memory.ts"));

function makeRecord(overrides = {}) {
  return {
    id: "mem-test",
    kind: "user_preference",
    scope: "user",
    title: "Test memory",
    summary: "Test summary",
    body: {},
    tags: [],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: new Date().toISOString(),
      capturedBy: "user",
      confidence: 1,
      reasonRemembered: "User explicitly saved this memory",
    },
    sensitivity: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canUseInChat: true,
    canExport: true,
    canDelete: true,
    ...overrides,
  };
}

assert.ok(memory.validateMemoryRecord(makeRecord()).ok, "valid record should pass validation");

const forbiddenBodies = [
  { seedPhrase: "abandon abandon abandon" },
  { privateKey: "0x1234567890abcdef" },
  { mnemonic: "word word word word word word word word word word word word" },
  { apiSecret: "sk-abc123" },
  { rawSignature: "0xdeadbeef" },
  { signedPayload: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
  { signedOrder: "0xsignedorder" },
  { walletExport: "{\"version\":3}" },
  { secretKey: "shh" },
  { bearerToken: "Bearer abc123" },
  { exchangeSecret: "exchange-secret-value" },
  { nested: { private_key: "0xabc" } },
  { note: "my seed phrase is abandon abandon abandon" },
  { note: "sk-abcdefghijklmnopqrstuvwxyz1234567890" },
  { note: "MY_SERVICE_API_KEY=supersecretvalue" },
];

for (const body of forbiddenBodies) {
  const result = memory.validateMemoryRecord(makeRecord({ body }));
  assert.equal(
    result.ok,
    false,
    `expected rejection for forbidden body: ${JSON.stringify(body)}`,
  );
}

// 8. Bittensor memory is public-address / external-signer only.
const validBittensor = makeRecord({
  kind: "protocol_address",
  tags: ["bittensor"],
  body: {
    ss58Address: "5abc123...",
    coldkey: "my-coldkey-name",
    hotkey: "5xyz789...",
    netuid: 1,
  },
});
assert.ok(
  memory.validateBittensorMemoryIsNonCustodial(validBittensor).ok,
  "valid Bittensor memory should pass",
);

const custodialBittensor = makeRecord({
  kind: "protocol_address",
  tags: ["bittensor"],
  body: { ss58Address: "5abc...", privateKey: "0x123" },
});
assert.equal(
  memory.validateBittensorMemoryIsNonCustodial(custodialBittensor).ok,
  false,
  "Bittensor memory containing private key must be rejected",
);

// 9. Market memories cannot enable live submission.
const validMarket = makeRecord({
  kind: "watchlist",
  tags: ["hyperliquid"],
  body: { symbol: "BTC" },
});
assert.ok(
  memory.validateMarketMemoryDoesNotEnableLiveSubmission(validMarket).ok,
  "valid market memory should pass",
);

const liveSubmissionMarket = makeRecord({
  kind: "decision",
  tags: ["polymarket"],
  body: { canSubmit: true, liveSubmissionEnabled: true },
});
assert.equal(
  memory.validateMarketMemoryDoesNotEnableLiveSubmission(liveSubmissionMarket).ok,
  false,
  "market memory enabling live submission must be rejected",
);

// 10. Wellness memories are educational and opt-in only.
const validWellness = makeRecord({
  kind: "user_preference",
  tags: ["wellness", "opt-in"],
  sensitivity: "restricted",
  body: { interest: "sleep education" },
  provenance: {
    source: "user_confirmed",
    capturedAt: new Date().toISOString(),
    capturedBy: "user",
    confidence: 1,
    reasonRemembered: "User opted into wellness education",
  },
});
assert.ok(
  memory.validateWellnessMemoryIsEducationalAndOptIn(validWellness).ok,
  "valid wellness memory should pass",
);

const clinicalWithoutConsent = makeRecord({
  kind: "user_preference",
  tags: ["wellness", "clinical"],
  body: { diagnosis: "example" },
  provenance: {
    source: "chat_capture",
    capturedAt: new Date().toISOString(),
    capturedBy: "agent",
    confidence: 0.5,
    reasonRemembered: "Captured in chat",
  },
});
assert.equal(
  memory.validateWellnessMemoryIsEducationalAndOptIn(clinicalWithoutConsent).ok,
  false,
  "clinical memory without user_confirmed provenance must be rejected",
);

const guaranteedOutcomeWithoutOptIn = makeRecord({
  kind: "user_preference",
  tags: ["wellness"],
  body: { plan: "guaranteed outcome protocol" },
  provenance: {
    source: "chat_capture",
    capturedAt: new Date().toISOString(),
    capturedBy: "agent",
    confidence: 0.5,
    reasonRemembered: "Captured in chat",
  },
});
assert.equal(
  memory.validateWellnessMemoryIsEducationalAndOptIn(guaranteedOutcomeWithoutOptIn).ok,
  false,
  "wellness memory with guaranteed outcome without opt-in must be rejected",
);

// 11. Context packets must be visible to user and contain only safe records.
const validContextPacket = {
  version: "matterhorn.memory.context-packet.v1",
  taskId: "task-1",
  sessionId: "session-1",
  workspaceId: "ws-1",
  query: "show my TAO wallet",
  records: [validBittensor, validMarket],
  omittedRecords: 0,
  safetySummary: "Only public, non-custodial memories included.",
  visibleToUser: true,
  generatedAt: new Date().toISOString(),
};
assert.ok(
  memory.validateMemoryContextPacket(validContextPacket).ok,
  "valid context packet should pass",
);

const hiddenContextPacket = {
  ...validContextPacket,
  visibleToUser: false,
};
assert.equal(
  memory.validateMemoryContextPacket(hiddenContextPacket).ok,
  false,
  "context packet must be visible to user",
);

const unsafeContextPacket = {
  ...validContextPacket,
  records: [custodialBittensor],
};
assert.equal(
  memory.validateMemoryContextPacket(unsafeContextPacket).ok,
  false,
  "context packet must reject unsafe records",
);

// 12. Memory suggestions cannot auto-capture and require explicit consent.
function makeSuggestion(overrides = {}) {
  return {
    version: "matterhorn.memory.suggestion.v1",
    id: "sugg-test",
    proposedRecord: validBittensor,
    reason: "User mentioned this address for TAO lookups",
    source: "chat_capture",
    confidence: 0.9,
    desk: "bittensor",
    useCase: "bittensor_wallet_label",
    userAction: "confirm",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    ...overrides,
  };
}

const validSuggestion = makeSuggestion();
assert.ok(
  memory.validateMemorySuggestion(validSuggestion).ok,
  "valid suggestion should pass",
);

const autoCaptureSuggestion = makeSuggestion({ canAutoCapture: true });
assert.equal(
  memory.validateMemorySuggestion(autoCaptureSuggestion).ok,
  false,
  "suggestion must not allow auto-capture",
);

const secretSuggestion = makeSuggestion({ proposedRecord: custodialBittensor });
assert.equal(
  memory.validateMemorySuggestion(secretSuggestion).ok,
  false,
  "suggestion containing secret material must be rejected",
);

for (const body of [
  { seedPhrase: "abandon abandon" },
  { privateKey: "0x123" },
  { mnemonic: "word word word" },
  { apiSecret: "sk-abc" },
  { rawSignature: "0xdeadbeef" },
  { signedPayload: "payload" },
  { walletExport: "export" },
]) {
  const suggestion = makeSuggestion({ proposedRecord: makeRecord({ body }) });
  assert.equal(
    memory.validateMemorySuggestion(suggestion).ok,
    false,
    `suggestion with forbidden body ${JSON.stringify(body)} must be rejected`,
  );
}

// 12a. Suggestions never become saved memory without explicit confirm/edit action.
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "dismiss" })),
  false,
  "dismissed suggestion must not become saved memory",
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "confirm" })),
  true,
  "confirmed suggestion may become saved memory",
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "edit" })),
  true,
  "edited suggestion may become saved memory",
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "confirm", canAutoCapture: true })),
  false,
  "auto-capturing suggestion must not become saved memory",
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "confirm", proposedRecord: custodialBittensor })),
  false,
  "secret suggestion must not become saved memory",
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(makeSuggestion({ userAction: "confirm", policyDecision: "reject" })),
  false,
  "rejected-policy suggestion must not become saved memory",
);

// 12b. Suggestions respect desk policy.
const bittensorWalletLabelSuggestion = makeSuggestion({
  desk: "bittensor",
  useCase: "bittensor_wallet_label",
  proposedRecord: validBittensor,
});
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorWalletLabelSuggestion).ok,
  "valid Bittensor wallet label suggestion should pass desk policy",
);

const bittensorSecretSuggestion = makeSuggestion({
  desk: "bittensor",
  useCase: "bittensor_wallet_label",
  proposedRecord: custodialBittensor,
});
assert.equal(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorSecretSuggestion).ok,
  false,
  "Bittensor suggestion with secret material must fail desk policy",
);

const hyperliquidMarketSuggestion = makeSuggestion({
  desk: "hyperliquid",
  useCase: "hyperliquid_watched_market",
  proposedRecord: validMarket,
});
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(hyperliquidMarketSuggestion).ok,
  "valid Hyperliquid market suggestion should pass desk policy",
);

const hyperliquidLiveSubmissionSuggestion = makeSuggestion({
  desk: "hyperliquid",
  useCase: "hyperliquid_watched_market",
  proposedRecord: liveSubmissionMarket,
});
assert.equal(
  memory.validateMemorySuggestionAgainstDeskPolicy(hyperliquidLiveSubmissionSuggestion).ok,
  false,
  "Hyperliquid suggestion enabling live submission must fail desk policy",
);

const wellnessPreferenceSuggestion = makeSuggestion({
  desk: "wellness",
  useCase: "wellness_client_preference",
  proposedRecord: validWellness,
});
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessPreferenceSuggestion).ok,
  "valid wellness preference suggestion should pass desk policy",
);

const wellnessClinicalSuggestion = makeSuggestion({
  desk: "wellness",
  useCase: "wellness_client_preference",
  proposedRecord: clinicalWithoutConsent,
});
assert.equal(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessClinicalSuggestion).ok,
  false,
  "wellness suggestion with clinical record must fail desk policy",
);

// 12c. Display sanitizer removes forbidden secret-shaped material.
const sanitized = memory.sanitizeMemorySuggestionForDisplay(secretSuggestion);
assert.equal(
  sanitized.proposedRecord.body.__redacted,
  true,
  "sanitizer must redact body containing secret material",
);
assert.ok(
  sanitized.policyWarnings.some((w) => w.includes("secret")),
  "sanitizer must add a policy warning",
);
assert.equal(
  sanitized.policyDecision,
  "reject",
  "sanitizer must set policyDecision to reject",
);

const cleanSuggestion = makeSuggestion();
const unchangedSanitized = memory.sanitizeMemorySuggestionForDisplay(cleanSuggestion);
assert.equal(
  unchangedSanitized.proposedRecord.body.ss58Address,
  validBittensor.body.ss58Address,
  "sanitizer must not alter clean suggestions",
);

// 13. Use policies cannot enable hidden memory, auto-capture, or secret capture.
const validUsePolicy = {
  hiddenMemoryAllowed: false,
  userVisibleMemoryChipsRequired: true,
  autoCaptureAllowed: false,
  secretCaptureAllowed: false,
  wellnessClinicalCaptureRequiresExplicitConsent: true,
  marketSubmissionMemoryAllowed: false,
};
assert.ok(
  memory.validateMemoryUsePolicy(validUsePolicy).ok,
  "valid use policy should pass",
);

const hiddenMemoryPolicy = {
  ...validUsePolicy,
  hiddenMemoryAllowed: true,
};
assert.equal(
  memory.validateMemoryUsePolicy(hiddenMemoryPolicy).ok,
  false,
  "use policy must not allow hidden memory",
);

const autoCapturePolicy = {
  ...validUsePolicy,
  autoCaptureAllowed: true,
};
assert.equal(
  memory.validateMemoryUsePolicy(autoCapturePolicy).ok,
  false,
  "use policy must not allow auto-capture",
);

const secretCapturePolicy = {
  ...validUsePolicy,
  secretCaptureAllowed: true,
};
assert.equal(
  memory.validateMemoryUsePolicy(secretCapturePolicy).ok,
  false,
  "use policy must not allow secret capture",
);

const marketSubmissionPolicy = {
  ...validUsePolicy,
  marketSubmissionMemoryAllowed: true,
};
assert.equal(
  memory.validateMemoryUsePolicy(marketSubmissionPolicy).ok,
  false,
  "use policy must not allow market submission memory",
);

// 14. Export manifests cannot claim secrets, signatures, payloads, or wallet exports.
const validExportManifest = {
  version: "matterhorn.memory.export-manifest.v1",
  exportedAt: new Date().toISOString(),
  recordCount: 2,
  sha256: "abc123...",
  includesSecrets: false,
  includesRawSignatures: false,
  includesSignedPayloads: false,
  includesWalletExports: false,
};
assert.ok(
  memory.validateMemoryExportManifest(validExportManifest).ok,
  "valid export manifest should pass",
);

const secretsExportManifest = {
  ...validExportManifest,
  includesSecrets: true,
};
assert.equal(
  memory.validateMemoryExportManifest(secretsExportManifest).ok,
  false,
  "export manifest must not claim to include secrets",
);

const signaturesExportManifest = {
  ...validExportManifest,
  includesRawSignatures: true,
};
assert.equal(
  memory.validateMemoryExportManifest(signaturesExportManifest).ok,
  false,
  "export manifest must not claim to include raw signatures",
);

const payloadsExportManifest = {
  ...validExportManifest,
  includesSignedPayloads: true,
};
assert.equal(
  memory.validateMemoryExportManifest(payloadsExportManifest).ok,
  false,
  "export manifest must not claim to include signed payloads",
);

const walletExportsManifest = {
  ...validExportManifest,
  includesWalletExports: true,
};
assert.equal(
  memory.validateMemoryExportManifest(walletExportsManifest).ok,
  false,
  "export manifest must not claim to include wallet exports",
);

// 15. Combined safety gate catches all violations.
assert.equal(memory.validateMemorySafety(custodialBittensor).ok, false);
assert.equal(memory.validateMemorySafety(liveSubmissionMarket).ok, false);
assert.equal(memory.validateMemorySafety(clinicalWithoutConsent).ok, false);
assert.equal(memory.validateMemorySafety(guaranteedOutcomeWithoutOptIn).ok, false);
assert.ok(memory.validateMemorySafety(validBittensor).ok);
assert.ok(memory.validateMemorySafety(validMarket).ok);
assert.ok(memory.validateMemorySafety(validWellness).ok);

// 16. Desk policy matrix enforces per-desk rules.
for (const desk of memory.MATTERHORN_MEMORY_DESKS) {
  const policy = memory.MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  assert.ok(policy, `policy matrix must define ${desk}`);
  assert.ok(memory.validateMemoryDeskPolicy(policy).ok, `${desk} policy must be valid`);
}

// Policy booleans match desk semantics.
const bittensorPolicy = memory.MATTERHORN_MEMORY_DESK_POLICY_MATRIX.bittensor;
assert.equal(bittensorPolicy.canUseInChat, true, "bittensor memory may be used in chat");
assert.equal(bittensorPolicy.canExport, true, "bittensor memory may be exported");
assert.equal(bittensorPolicy.canSendToMcpApi, true, "bittensor memory may be sent to MCP/API tools");

for (const desk of ["hyperliquid", "polymarket", "wellness", "decentralized_services", "generic_workspace"]) {
  const policy = memory.MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  assert.equal(policy.canExport, false, `${desk} memory must not be exportable`);
  assert.equal(policy.canSendToMcpApi, false, `${desk} memory must not be sent to MCP/API tools`);
}

assert.ok(
  memory.validateMemoryRecordAgainstDeskPolicy(validBittensor, "bittensor").ok,
  "valid Bittensor record should match bittensor desk policy",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(custodialBittensor, "bittensor").ok,
  false,
  "bittensor desk must reject custodial record",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "workflow_artifact", tags: ["bittensor"] }),
    "bittensor",
  ).ok,
  false,
  "bittensor desk must reject disallowed kind",
);

assert.ok(
  memory.validateMemoryRecordAgainstDeskPolicy(validMarket, "hyperliquid").ok,
  "valid market record should match hyperliquid desk policy",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(liveSubmissionMarket, "polymarket").ok,
  false,
  "polymarket desk must reject live submission memory",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "protocol_address", tags: ["hyperliquid"] }),
    "hyperliquid",
  ).ok,
  false,
  "hyperliquid desk must reject protocol_address kind",
);

assert.ok(
  memory.validateMemoryRecordAgainstDeskPolicy(validWellness, "wellness").ok,
  "valid wellness record should match wellness desk policy",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(clinicalWithoutConsent, "wellness").ok,
  false,
  "wellness desk must reject clinical record without consent",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "watchlist", tags: ["wellness", "opt-in"], sensitivity: "public" }),
    "wellness",
  ).ok,
  false,
  "wellness desk must reject less restrictive sensitivity than default",
);

assert.ok(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "project_fact", tags: ["decentralized_services"], sensitivity: "private" }),
    "decentralized_services",
  ).ok,
  "valid decentralized_services record should match desk policy",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "protocol_address", tags: ["decentralized_services"], sensitivity: "private" }),
    "decentralized_services",
  ).ok,
  false,
  "decentralized_services desk must reject disallowed kind",
);

assert.ok(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "project_fact", tags: ["workspace"], sensitivity: "private" }),
    "generic_workspace",
  ).ok,
  "valid generic_workspace record should match desk policy",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "user_preference", tags: ["bittensor"], sensitivity: "private" }),
    "generic_workspace",
  ).ok,
  false,
  "generic_workspace desk must reject silently included protocol data",
);
assert.equal(
  memory.validateMemoryRecordAgainstDeskPolicy(
    makeRecord({ kind: "user_preference", tags: ["clinical"], sensitivity: "private" }),
    "generic_workspace",
  ).ok,
  false,
  "generic_workspace desk must reject silently included medical data",
);

// 17. Memory Producers V1 fixtures and per-producer safety.
const wellnessClientPreference = memory.createWellnessMemorySuggestion(
  "wellness_client_preference",
  "sugg-wellness-client-1",
  "Preferred coaching format",
  { format: "async text", timezone: "UTC" },
  "User prefers async text coaching",
);
assert.ok(
  memory.validateMemorySuggestion(wellnessClientPreference).ok,
  "wellness client preference suggestion should be valid",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessClientPreference).ok,
  "wellness client preference suggestion should pass desk policy",
);
assert.equal(
  wellnessClientPreference.proposedRecord.sensitivity,
  "restricted",
  "wellness suggestion default sensitivity must be restricted",
);
assert.ok(
  wellnessClientPreference.proposedRecord.tags.includes("opt-in"),
  "wellness suggestion must be opt-in",
);

const wellnessProgramFormat = memory.createWellnessMemorySuggestion(
  "wellness_program_format_preference",
  "sugg-wellness-program-1",
  "Program format preference",
  { format: "education-first", clinical: false },
  "User prefers education-first wellness content",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessProgramFormat).ok,
  "wellness program format suggestion should pass desk policy",
);

const wellnessOfferBuilder = memory.createWellnessMemorySuggestion(
  "wellness_offer_builder_preference",
  "sugg-wellness-offer-1",
  "Offer builder preference",
  { offerType: "sleep hygiene guide" },
  "User selected an offer preference",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessOfferBuilder).ok,
  "wellness offer builder suggestion should pass desk policy",
);

const wellnessWorkflowArtifact = memory.createWellnessMemorySuggestion(
  "workflow_artifact_preference",
  "sugg-wellness-artifact-1",
  "Wellness worksheet preference",
  { artifactId: "sleep-worksheet-1" },
  "User referenced a wellness worksheet",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessWorkflowArtifact).ok,
  "wellness workflow artifact suggestion should pass desk policy",
);

const bittensorWalletLabel = memory.createBittensorMemorySuggestion(
  "bittensor_wallet_label",
  "sugg-bittensor-wallet-1",
  "TAO wallet label",
  { ss58Address: "5abc...", coldkey: "my-coldkey", hotkey: "5xyz..." },
  "User labeled a TAO wallet",
);
assert.ok(
  memory.validateMemorySuggestion(bittensorWalletLabel).ok,
  "bittensor wallet label suggestion should be valid",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorWalletLabel).ok,
  "bittensor wallet label suggestion should pass desk policy",
);
assert.equal(
  bittensorWalletLabel.proposedRecord.sensitivity,
  "public",
  "bittensor suggestion default sensitivity must be public",
);
assert.ok(
  bittensorWalletLabel.proposedRecord.tags.includes("bittensor"),
  "bittensor suggestion must be tagged bittensor",
);

const bittensorWatchedSubnet = memory.createBittensorMemorySuggestion(
  "bittensor_subnet_watch_preference",
  "sugg-bittensor-subnet-1",
  "Watched subnet",
  { netuid: 1, subnetName: "Root" },
  "User wants to watch subnet 1",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorWatchedSubnet).ok,
  "bittensor subnet watch suggestion should pass desk policy",
);

const bittensorValidatorWatch = memory.createBittensorMemorySuggestion(
  "bittensor_validator_watch_preference",
  "sugg-bittensor-validator-1",
  "Validator watch preference",
  { validatorName: "My Validator", ss58Address: "5val..." },
  "User wants to follow a validator",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorValidatorWatch).ok,
  "bittensor validator watch suggestion should pass desk policy",
);

const bittensorReceiptContext = memory.createBittensorMemorySuggestion(
  "bittensor_receipt_context",
  "sugg-bittensor-receipt-1",
  "TAO receipt context",
  { txHash: "0xabc...", netuid: 1, status: "success" },
  "User shared a TAO receipt",
);
assert.ok(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorReceiptContext).ok,
  "bittensor receipt context suggestion should pass desk policy",
);

// Producer suggestions reject forbidden material.
for (const body of [
  { seedPhrase: "abandon abandon" },
  { privateKey: "0x123" },
  { mnemonic: "word word word" },
  { apiSecret: "sk-abc" },
  { rawSignature: "0xdeadbeef" },
  { signedPayload: "payload" },
  { walletExport: "export" },
]) {
  const badBittensor = memory.createBittensorMemorySuggestion(
    "bittensor_wallet_label",
    "sugg-bad",
    "Bad suggestion",
    body,
    "Contains secret material",
  );
  assert.equal(
    memory.validateMemorySuggestion(badBittensor).ok,
    false,
    `bittensor suggestion with ${JSON.stringify(body)} must be rejected`,
  );

  const badWellness = memory.createWellnessMemorySuggestion(
    "wellness_client_preference",
    "sugg-bad",
    "Bad suggestion",
    body,
    "Contains secret material",
  );
  assert.equal(
    memory.validateMemorySuggestion(badWellness).ok,
    false,
    `wellness suggestion with ${JSON.stringify(body)} must be rejected`,
  );
}

// Producer suggestions never auto-capture and require explicit confirm/edit.
const unconfirmedBittensor = memory.createBittensorMemorySuggestion(
  "bittensor_wallet_label",
  "sugg-unconfirmed",
  "Unconfirmed wallet label",
  { ss58Address: "5abc..." },
  "User mentioned a wallet",
  { userAction: "dismiss" },
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(unconfirmedBittensor),
  false,
  "dismissed bittensor suggestion must not become saved memory",
);

const unconfirmedWellness = memory.createWellnessMemorySuggestion(
  "wellness_client_preference",
  "sugg-unconfirmed",
  "Unconfirmed preference",
  { format: "async text" },
  "User mentioned a preference",
  { userAction: "dismiss" },
);
assert.equal(
  memory.canMemorySuggestionBecomeSavedMemory(unconfirmedWellness),
  false,
  "dismissed wellness suggestion must not become saved memory",
);

// Producer suggestions enforce desk policy defaults.
const bittensorWithPrivateKey = memory.createBittensorMemorySuggestion(
  "bittensor_wallet_label",
  "sugg-custodial",
  "Custodial wallet label",
  { ss58Address: "5abc...", privateKey: "0x123" },
  "User shared wallet details",
);
assert.equal(
  memory.validateMemorySuggestionAgainstDeskPolicy(bittensorWithPrivateKey).ok,
  false,
  "bittensor producer suggestion with private key must fail desk policy",
);

const wellnessClinical = memory.createWellnessMemorySuggestion(
  "wellness_client_preference",
  "sugg-clinical",
  "Clinical preference",
  { diagnosis: "example" },
  "User mentioned a diagnosis",
);
assert.equal(
  memory.validateMemorySuggestionAgainstDeskPolicy(wellnessClinical).ok,
  false,
  "wellness producer suggestion with clinical data must fail desk policy",
);

// 19. Memory Suggestion Inbox V1 lifecycle contract.
function makeLifecycleEntry(overrides = {}) {
  return {
    suggestionId: "sugg-lifecycle-1",
    dedupeKey: "wellness/format/education-first",
    source: "chat_capture",
    kind: "user_preference",
    scope: "user",
    sensitivity: "restricted",
    confidence: 0.9,
    reason: "User prefers education-first wellness content",
    proposedRecord: validWellness,
    createdAt: new Date().toISOString(),
    dismissalWindowDays: 30,
    actorConfirmationRequired: true,
    status: "pending",
    ...overrides,
  };
}

const validLifecycle = makeLifecycleEntry();
assert.ok(
  memory.validateMemorySuggestionLifecycle(validLifecycle).ok,
  "valid lifecycle entry should pass",
);

// Lifecycle statuses and actions are defined.
for (const status of memory.MATTERHORN_MEMORY_SUGGESTION_STATUSES) {
  const entry = makeLifecycleEntry({ status });
  if (status === "dismissed") {
    entry.dismissedUntil = memory.computeMemorySuggestionDismissedUntil(entry.createdAt);
  }
  assert.ok(
    memory.validateMemorySuggestionLifecycle(entry).ok,
    `lifecycle entry with status ${status} should be valid when complete`,
  );
}

for (const action of memory.MATTERHORN_MEMORY_SUGGESTION_ACTIONS) {
  assert.ok(typeof action === "string", `action ${action} must be a string`);
}

// Confirm and edit produce memory records; dismiss does not.
const confirmResult = memory.applyMemorySuggestionAction(validLifecycle, "confirm");
assert.equal(confirmResult.action, "confirm");
assert.equal(confirmResult.status, "confirmed");
assert.ok(confirmResult.memoryRecordId, "confirm result should include memoryRecordId");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(confirmResult),
  true,
  "confirm result should be able to produce memory record",
);

const editResult = memory.applyMemorySuggestionAction(validLifecycle, "edit");
assert.equal(editResult.status, "edited");
assert.ok(editResult.memoryRecordId);
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(editResult),
  true,
  "edit result should be able to produce memory record",
);

const dismissResult = memory.applyMemorySuggestionAction(validLifecycle, "dismiss");
assert.equal(dismissResult.status, "dismissed");
assert.equal(dismissResult.memoryRecordId, undefined, "dismiss result must not include memoryRecordId");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(dismissResult),
  false,
  "dismiss result must not produce memory record",
);

// Suggestions never become memory without explicit confirm or edit.
const dismissedEntry = makeLifecycleEntry({
  status: "dismissed",
  dismissedUntil: memory.computeMemorySuggestionDismissedUntil(new Date().toISOString()),
});
const reconfirmDismissed = memory.applyMemorySuggestionAction(dismissedEntry, "confirm");
assert.equal(reconfirmDismissed.status, "confirmed", "confirm can transition from dismissed");
assert.ok(
  memory.canMemorySuggestionActionProduceMemoryRecord(reconfirmDismissed),
  "explicit confirm on dismissed entry may still produce memory record",
);

// Dismissed suggestions do not reappear during the dismissal window.
const now = new Date().toISOString();
const dismissedUntil = memory.computeMemorySuggestionDismissedUntil(now, 7);
const dismissedDuringWindow = makeLifecycleEntry({
  status: "dismissed",
  dismissedUntil,
});
assert.equal(
  memory.isMemorySuggestionDismissalActive(dismissedDuringWindow, now),
  true,
  "dismissal should be active immediately after dismiss",
);

const pastDismissedUntil = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
const expiredDismissal = makeLifecycleEntry({
  status: "dismissed",
  dismissedUntil: pastDismissedUntil,
});
assert.equal(
  memory.isMemorySuggestionDismissalActive(expiredDismissal),
  false,
  "dismissal should be inactive after the window expires",
);

// Secret-shaped suggestions are blocked/redacted.
const secretLifecycle = makeLifecycleEntry({
  proposedRecord: custodialBittensor,
  sensitivity: "forbidden_secret",
});
const secretResult = memory.applyMemorySuggestionAction(secretLifecycle, "confirm");
assert.equal(secretResult.status, "blocked", "secret suggestion must be blocked on confirm");
assert.equal(secretResult.redaction, true, "secret result must be marked redacted");
assert.ok(
  secretResult.blockedReasons.some((r) => r.includes("secret")),
  "secret result must include a blocked reason mentioning secret",
);
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(secretResult),
  false,
  "secret suggestion must not produce memory record",
);

// Wellness lifecycle defaults to restricted/local/opt-in.
const wellnessLifecycle = makeLifecycleEntry({
  dedupeKey: "wellness/client/format",
  proposedRecord: validWellness,
  sensitivity: "restricted",
});
assert.equal(wellnessLifecycle.sensitivity, "restricted", "wellness lifecycle sensitivity must be restricted");
assert.ok(
  wellnessLifecycle.proposedRecord.tags.includes("opt-in"),
  "wellness lifecycle record must be opt-in",
);

// Market lifecycle suggestions cannot enable live submission.
const marketLifecycle = makeLifecycleEntry({
  suggestionId: "sugg-market-1",
  dedupeKey: "hyperliquid/watch/btc",
  kind: "watchlist",
  sensitivity: "public",
  proposedRecord: validMarket,
});
const marketConfirm = memory.applyMemorySuggestionAction(marketLifecycle, "confirm");
assert.equal(marketConfirm.status, "confirmed", "valid market lifecycle should confirm");

const liveMarketLifecycle = makeLifecycleEntry({
  suggestionId: "sugg-market-bad",
  dedupeKey: "hyperliquid/live/btc",
  kind: "decision",
  sensitivity: "public",
  proposedRecord: liveSubmissionMarket,
});
const liveMarketResult = memory.applyMemorySuggestionAction(liveMarketLifecycle, "confirm");
assert.equal(liveMarketResult.status, "blocked", "market lifecycle enabling live submission must be blocked");

// Bittensor lifecycle stays public-address / external-signer only.
const bittensorLifecycle = makeLifecycleEntry({
  suggestionId: "sugg-bittensor-1",
  dedupeKey: "bittensor/wallet/tao",
  kind: "protocol_address",
  sensitivity: "public",
  proposedRecord: validBittensor,
});
const bittensorConfirm = memory.applyMemorySuggestionAction(bittensorLifecycle, "confirm");
assert.equal(bittensorConfirm.status, "confirmed", "valid bittensor lifecycle should confirm");

const bittensorCustodialLifecycle = makeLifecycleEntry({
  suggestionId: "sugg-bittensor-bad",
  dedupeKey: "bittensor/wallet/custodial",
  kind: "protocol_address",
  sensitivity: "public",
  proposedRecord: custodialBittensor,
});
const bittensorCustodialResult = memory.applyMemorySuggestionAction(bittensorCustodialLifecycle, "confirm");
assert.equal(bittensorCustodialResult.status, "blocked", "custodial bittensor lifecycle must be blocked");

// 20. Docs cover the contract, safety invariants, and ownership.
const memoryDocLower = memoryDoc.toLowerCase();
for (const phrase of [
  "Matterhorn Memory",
  "MatterhornMemoryRecord",
  "MatterhornMemoryScope",
  "MatterhornMemoryKind",
  "MatterhornMemorySource",
  "MatterhornMemorySensitivity",
  "MatterhornMemoryProvenance",
  "MatterhornMemoryRedactionResult",
  "MatterhornMemoryContextPacket",
  "MatterhornMemorySuggestion",
  "MatterhornMemoryUsePolicy",
  "MatterhornMemoryExportManifest",
  "MatterhornMemoryDesk",
  "MatterhornMemoryDeskPolicy",
  "MATTERHORN_MEMORY_DESK_POLICY_MATRIX",
  "forbidden_secret",
  "canHoldPrivateKeys: false",
  "canHoldBearerTokens: false",
  "canHoldExchangeSecrets: false",
  "marketLiveSubmissionEnabled: false",
  "bittensorCustodialEnabled: false",
  "wellnessOptInRequired: true",
  "hiddenMemoryAllowed: false",
  "autoCaptureAllowed: false",
  "userVisibleMemoryChipsRequired: true",
  "includesSecrets: false",
  "seed phrases",
  "private keys",
  "API secrets",
  "raw signatures",
  "signed payloads",
  "wallet exports",
  "bearer tokens",
  "exchange secrets",
  "medical",
  "opt-in",
  "SS58",
  "external signer",
  "context packet",
  "memory suggestion",
  "policy matrix",
  "desk policy",
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "decentralized_services",
  "generic_workspace",
  "canUseInChat",
  "canSendToMcpApi",
  "forbiddenCases",
  "bittensor_wallet_label",
  "bittensor_validator_watch_preference",
  "bittensor_receipt_context",
  "hyperliquid_watched_market",
  "wellness_client_preference",
  "wellness_program_format_preference",
  "wellness_offer_builder_preference",
  "userAction",
  "createWellnessMemorySuggestion",
  "createBittensorMemorySuggestion",
  "Memory Producers V1",
  "sanitizeMemorySuggestionForDisplay",
  "canMemorySuggestionBecomeSavedMemory",
  "validateMemorySuggestionAgainstDeskPolicy",
  "MatterhornMemorySuggestionStatus",
  "MatterhornMemorySuggestionAction",
  "MatterhornMemorySuggestionLifecycle",
  "MatterhornMemorySuggestionConfirmationResult",
  "validateMemorySuggestionLifecycle",
  "applyMemorySuggestionAction",
  "isMemorySuggestionDismissalActive",
  "canMemorySuggestionActionProduceMemoryRecord",
  "dismissedUntil",
  "dismissalWindowDays",
  "actorConfirmationRequired",
  "blockedReasons",
  "Memory Suggestion Inbox V1",
  "edited",
]) {
  assert.ok(
    memoryDocLower.includes(phrase.toLowerCase()),
    `memory contract doc must mention "${phrase}"`,
  );
}

console.log("Matterhorn Memory contract tests passed.");
