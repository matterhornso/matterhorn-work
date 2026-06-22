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
const memory = await import(join(repoRoot, "packages/types/dist/index.js"));

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

// 11. Combined safety gate catches all violations.
assert.equal(memory.validateMemorySafety(custodialBittensor).ok, false);
assert.equal(memory.validateMemorySafety(liveSubmissionMarket).ok, false);
assert.equal(memory.validateMemorySafety(clinicalWithoutConsent).ok, false);
assert.equal(memory.validateMemorySafety(guaranteedOutcomeWithoutOptIn).ok, false);
assert.ok(memory.validateMemorySafety(validBittensor).ok);
assert.ok(memory.validateMemorySafety(validMarket).ok);
assert.ok(memory.validateMemorySafety(validWellness).ok);

// 12. Docs cover the contract, safety invariants, and ownership.
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
  "forbidden_secret",
  "canHoldPrivateKeys: false",
  "canHoldBearerTokens: false",
  "canHoldExchangeSecrets: false",
  "marketLiveSubmissionEnabled: false",
  "bittensorCustodialEnabled: false",
  "wellnessOptInRequired: true",
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
]) {
  assert.ok(
    memoryDocLower.includes(phrase.toLowerCase()),
    `memory contract doc must mention "${phrase}"`,
  );
}

console.log("Matterhorn Memory contract tests passed.");
