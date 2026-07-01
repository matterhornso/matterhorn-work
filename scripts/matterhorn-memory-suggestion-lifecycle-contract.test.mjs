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
const memory = await import(join(repoRoot, "packages/types/src/memory.ts"));

// 1. Package exposes the dedicated lifecycle contract test.
assert.equal(
  pkg.scripts["test:matterhorn-memory-suggestion-lifecycle-contract"],
  "node scripts/matterhorn-memory-suggestion-lifecycle-contract.test.mjs",
  "package.json should expose test:matterhorn-memory-suggestion-lifecycle-contract",
);

// 2. Core lifecycle types and constants are defined.
for (const token of [
  "MatterhornMemorySuggestionStatus",
  "MatterhornMemorySuggestionAction",
  "MatterhornMemorySuggestionLifecycle",
  "MatterhornMemorySuggestionConfirmationResult",
  "MatterhornMemorySuggestionWhySuggested",
]) {
  assert.ok(memorySource.includes(token), `memory.ts must define ${token}`);
}

for (const token of [
  "MATTERHORN_MEMORY_SUGGESTION_STATUSES",
  "MATTERHORN_MEMORY_SUGGESTION_ACTIONS",
  "DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS",
  "DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS",
  "MAX_MEMORY_SUGGESTION_REASON_LENGTH",
]) {
  assert.ok(memorySource.includes(token), `memory.ts must define ${token}`);
}

for (const fn of [
  "validateMemorySuggestionLifecycle",
  "isMemorySuggestionDismissalActive",
  "computeMemorySuggestionDismissedUntil",
  "computeMemorySuggestionExpiresAt",
  "isMemorySuggestionTransitionAllowed",
  "applyMemorySuggestionAction",
  "canMemorySuggestionActionProduceMemoryRecord",
  "sanitizeMemorySuggestionLifecycleForDisplay",
  "createMemorySuggestionLifecycleFixture",
  "createWellnessMemorySuggestionLifecycleFixture",
  "createBittensorMemorySuggestionLifecycleFixture",
  "createMarketMemorySuggestionLifecycleFixture",
]) {
  assert.ok(typeof memory[fn] === "function", `memory.ts must export ${fn}`);
}

// 3. Status and action enum values are complete.
assert.deepEqual(memory.MATTERHORN_MEMORY_SUGGESTION_STATUSES, [
  "pending",
  "confirmed",
  "edited",
  "dismissed",
  "expired",
  "blocked",
]);

assert.deepEqual(memory.MATTERHORN_MEMORY_SUGGESTION_ACTIONS, [
  "confirm",
  "edit",
  "dismiss",
  "restore",
  "regenerate",
]);

// 4. Default windows match product policy.
assert.equal(
  memory.DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
  30,
  "dismissed suggestions must suppress for 30 days by default",
);
assert.equal(
  memory.DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS,
  14,
  "expired suggestions must be 14-day stale by default",
);
assert.equal(
  memory.MAX_MEMORY_SUGGESTION_REASON_LENGTH,
  240,
  "reason/whySuggested max length must be 240 characters",
);

// Helpers.
function makeBaseRecord(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "rec-test",
    kind: "user_preference",
    scope: "user",
    title: "Test preference",
    summary: "Test summary",
    body: { interest: "example" },
    tags: [],
    links: [],
    provenance: {
      source: "chat_capture",
      capturedAt: now,
      capturedBy: "agent",
      confidence: 0.9,
      reasonRemembered: "Test reason",
    },
    sensitivity: "public",
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: false,
    canDelete: true,
    ...overrides,
  };
}

function makeLifecycleEntry(overrides = {}) {
  const now = new Date().toISOString();
  return {
    suggestionId: "sugg-lifecycle-test",
    dedupeKey: "test/fixture/example",
    source: "chat_capture",
    kind: "user_preference",
    scope: "user",
    sensitivity: "public",
    confidence: 0.9,
    reason: "User mentioned an example preference",
    whySuggested: {
      summary: "User mentioned an example preference",
      sourceLabel: "Chat context",
      maxLength: memory.MAX_MEMORY_SUGGESTION_REASON_LENGTH,
    },
    visibleProvenance: {
      source: "chat_capture",
      sourceId: "msg-1",
      capturedAt: now,
      capturedBy: "agent",
      confidence: 0.9,
      reasonRemembered: "Derived from chat context",
    },
    proposedRecord: makeBaseRecord(),
    createdAt: now,
    expiresAt: memory.computeMemorySuggestionExpiresAt(now),
    dismissalWindowDays: memory.DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
    actorConfirmationRequired: true,
    status: "pending",
    localOnly: false,
    nonClinical: true,
    ...overrides,
  };
}

// 5. Valid lifecycle entry passes validation.
const validLifecycle = makeLifecycleEntry();
assert.ok(
  memory.validateMemorySuggestionLifecycle(validLifecycle).ok,
  "valid lifecycle entry should pass",
);

// 6. All statuses validate when complete.
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

// 7. Fixtures for every state are valid and safe.
for (const status of memory.MATTERHORN_MEMORY_SUGGESTION_STATUSES) {
  for (const factory of [
    () => memory.createMemorySuggestionLifecycleFixture(status),
    () => memory.createWellnessMemorySuggestionLifecycleFixture(status),
    () => memory.createBittensorMemorySuggestionLifecycleFixture(status),
    () => memory.createMarketMemorySuggestionLifecycleFixture(status),
  ]) {
    const fixture = factory();
    assert.ok(
      memory.validateMemorySuggestionLifecycle(fixture).ok,
      `fixture for ${status} should be valid`,
    );
    assert.equal(fixture.status, status, `fixture status must be ${status}`);
    assert.equal(
      fixture.actorConfirmationRequired,
      true,
      `fixture ${status} must require actor confirmation`,
    );
    assert.equal(
      memory.isForbiddenMemorySecretBody(fixture.proposedRecord.body),
      false,
      `fixture for ${status} must not contain forbidden secret material`,
    );
  }
}

// 8. Action/state transition matrix.
// pending -> confirm -> confirmed (produces memory record)
const pendingConfirm = memory.applyMemorySuggestionAction(validLifecycle, "confirm");
assert.equal(pendingConfirm.status, "confirmed", "pending + confirm -> confirmed");
assert.ok(
  memory.canMemorySuggestionActionProduceMemoryRecord(pendingConfirm),
  "pending + confirm can produce memory record",
);

// pending -> edit -> edited (produces memory record)
const pendingEdit = memory.applyMemorySuggestionAction(validLifecycle, "edit");
assert.equal(pendingEdit.status, "edited", "pending + edit -> edited");
assert.ok(
  memory.canMemorySuggestionActionProduceMemoryRecord(pendingEdit),
  "pending + edit can produce memory record",
);

// pending -> dismiss -> dismissed (no memory record)
const pendingDismiss = memory.applyMemorySuggestionAction(validLifecycle, "dismiss");
assert.equal(pendingDismiss.status, "dismissed", "pending + dismiss -> dismissed");
assert.equal(pendingDismiss.memoryRecordId, undefined, "dismissed result must not include memoryRecordId");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(pendingDismiss),
  false,
  "dismissed result must not produce memory record",
);

// Only pending can be confirmed or edited.
const confirmedEntry = makeLifecycleEntry({ status: "confirmed" });
const confirmedConfirm = memory.applyMemorySuggestionAction(confirmedEntry, "confirm");
assert.equal(confirmedConfirm.status, "blocked", "cannot confirm an already confirmed suggestion");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(confirmedConfirm),
  false,
);

const editedEntry = makeLifecycleEntry({ status: "edited" });
const editedEdit = memory.applyMemorySuggestionAction(editedEntry, "edit");
assert.equal(editedEdit.status, "blocked", "cannot edit an already edited suggestion");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(editedEdit),
  false,
);

// Expired suggestions cannot create records; regenerate returns to pending.
const expiredEntry = makeLifecycleEntry({
  status: "expired",
  expiresAt: new Date(Date.now() - 1).toISOString(),
});
const expiredConfirm = memory.applyMemorySuggestionAction(expiredEntry, "confirm");
assert.equal(expiredConfirm.status, "blocked", "expired + confirm must be blocked");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(expiredConfirm),
  false,
  "expired suggestion must not produce memory record",
);

const expiredRegenerate = memory.applyMemorySuggestionAction(expiredEntry, "regenerate");
assert.equal(expiredRegenerate.status, "pending", "expired + regenerate -> pending");
assert.equal(
  expiredRegenerate.memoryRecordId,
  undefined,
  "regenerated result must not include memoryRecordId",
);

// Dismissed suggestions cannot be confirmed while active; restore works after window.
const now = new Date().toISOString();
const dismissedUntil = memory.computeMemorySuggestionDismissedUntil(now, 7);
const dismissedDuringWindow = makeLifecycleEntry({
  status: "dismissed",
  dismissedUntil,
});
const dismissedConfirm = memory.applyMemorySuggestionAction(dismissedDuringWindow, "confirm");
assert.equal(dismissedConfirm.status, "blocked", "dismissed + confirm during window must be blocked");
assert.equal(
  memory.canMemorySuggestionActionProduceMemoryRecord(dismissedConfirm),
  false,
  "dismissed suggestion must not produce memory record while active",
);

const dismissedRestoreDuringWindow = memory.applyMemorySuggestionAction(dismissedDuringWindow, "restore");
assert.equal(
  dismissedRestoreDuringWindow.status,
  "blocked",
  "dismissed + restore during active window must be blocked",
);

const pastDismissedUntil = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
const expiredDismissal = makeLifecycleEntry({
  status: "dismissed",
  dismissedUntil: pastDismissedUntil,
});
const restored = memory.applyMemorySuggestionAction(expiredDismissal, "restore");
assert.equal(restored.status, "pending", "dismissed + restore after window -> pending");
assert.equal(
  restored.memoryRecordId,
  undefined,
  "restored result must not include memoryRecordId",
);

// 9. Dismissal window helpers.
assert.equal(
  memory.isMemorySuggestionDismissalActive(dismissedDuringWindow, now),
  true,
  "dismissal should be active immediately after dismiss",
);
assert.equal(
  memory.isMemorySuggestionDismissalActive(expiredDismissal),
  false,
  "dismissal should be inactive after the window expires",
);

// 10. Expiration helper computes 14-day default.
const expiresAt = memory.computeMemorySuggestionExpiresAt(now);
const expectedExpires = new Date(now);
expectedExpires.setUTCDate(expectedExpires.getUTCDate() + memory.DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS);
assert.equal(
  new Date(expiresAt).toISOString(),
  expectedExpires.toISOString(),
  "computeMemorySuggestionExpiresAt must default to 14 days",
);

// 11. Secret-shaped suggestions are blocked and redacted.
const secretBody = { privateKey: "0x1234567890abcdef" };
const secretLifecycle = makeLifecycleEntry({
  proposedRecord: makeBaseRecord({ body: secretBody }),
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

// 12. Blocked suggestions never reveal forbidden content when sanitized for display.
const sanitized = memory.sanitizeMemorySuggestionLifecycleForDisplay(secretLifecycle);
assert.equal(sanitized.status, "blocked", "sanitizer must mark secret-shaped lifecycle as blocked");
assert.equal(sanitized.proposedRecord.body.__redacted, true, "sanitizer must redact body");
assert.ok(
  sanitized.policyWarnings.some((w) => w.includes("secret")),
  "sanitizer must add a policy warning",
);

// 13. Reason max-length enforcement.
const longReason = "a".repeat(memory.MAX_MEMORY_SUGGESTION_REASON_LENGTH + 1);
const longReasonLifecycle = makeLifecycleEntry({ reason: longReason });
const longReasonResult = memory.validateMemorySuggestionLifecycle(longReasonLifecycle);
assert.equal(longReasonResult.ok, false, "reason exceeding max length must be rejected");
assert.ok(
  longReasonResult.errors.some((e) => e.includes("reason") && e.includes("240")),
  "reason error must mention max length",
);

const oversizedWhySuggested = makeLifecycleEntry({
  whySuggested: {
    summary: "a".repeat(memory.MAX_MEMORY_SUGGESTION_REASON_LENGTH + 1),
    sourceLabel: "Chat",
    maxLength: memory.MAX_MEMORY_SUGGESTION_REASON_LENGTH,
  },
});
const oversizedWhyResult = memory.validateMemorySuggestionLifecycle(oversizedWhySuggested);
assert.equal(oversizedWhyResult.ok, false, "whySuggested.summary exceeding maxLength must be rejected");

// 14. Wellness suggestions require local-only and non-clinical boundaries.
const wellnessLifecycle = memory.createWellnessMemorySuggestionLifecycleFixture("pending");
assert.equal(
  wellnessLifecycle.localOnly,
  true,
  "wellness lifecycle fixture must be localOnly",
);
assert.equal(
  wellnessLifecycle.nonClinical,
  true,
  "wellness lifecycle fixture must be nonClinical",
);
assert.ok(
  memory.validateMemorySuggestionLifecycle(wellnessLifecycle).ok,
  "wellness lifecycle with localOnly/nonClinical should pass",
);

const wellnessMissingBoundaries = makeLifecycleEntry({
  proposedRecord: makeBaseRecord({
    tags: ["wellness", "opt-in"],
    sensitivity: "restricted",
  }),
  sensitivity: "restricted",
  localOnly: false,
  nonClinical: false,
});
const wellnessBoundaryResult = memory.validateMemorySuggestionLifecycle(wellnessMissingBoundaries);
assert.equal(wellnessBoundaryResult.ok, false, "wellness suggestion missing boundaries must be rejected");
assert.ok(
  wellnessBoundaryResult.errors.some((e) => e.includes("localOnly")),
  "wellness boundary error must mention localOnly",
);
assert.ok(
  wellnessBoundaryResult.errors.some((e) => e.includes("nonClinical")),
  "wellness boundary error must mention nonClinical",
);

// 15. Safety invariants: no hidden saves, no auto-capture, no secret capture.
assert.equal(
  validLifecycle.actorConfirmationRequired,
  true,
  "lifecycle must require actor confirmation",
);

// 16. Docs/handoff exists and mentions integration points.
const handoff = readFileSync(
  join(repoRoot, "docs/handoffs/kimi-memory-suggestion-lifecycle-contract.md"),
  "utf8",
);
const handoffLower = handoff.toLowerCase();
for (const phrase of [
  "memory suggestion",
  "lifecycle",
  "pending",
  "confirmed",
  "edited",
  "dismissed",
  "expired",
  "blocked",
  "confirm",
  "edit",
  "dismiss",
  "restore",
  "regenerate",
  "whySuggested",
  "visibleProvenance",
  "localOnly",
  "nonClinical",
  "MAX_MEMORY_SUGGESTION_REASON_LENGTH",
  "DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS",
  "DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS",
  "no hidden memory",
  "no auto-capture",
  "no secret",
  "blocked",
  "wellness",
  "downstream",
  "codex",
  "minimax",
]) {
  assert.ok(handoffLower.includes(phrase.toLowerCase()), `handoff must mention "${phrase}"`);
}

console.log("Matterhorn Memory Suggestion Lifecycle contract tests passed.");
