import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()
const read = (path) => readFileSync(join(repoRoot, path), "utf8")

const pkg = JSON.parse(read("package.json"))
const uiState = read("apps/app/src/react-app/shell/ui-state-store.ts")
const extensions = read("apps/app/src/app/extensions.ts")
const serverClient = read("apps/app/src/app/lib/matterhorn-server.ts")
const sessionPage = read("apps/app/src/react-app/domains/session/chat/session-page.tsx")
const sessionSurface = read("apps/app/src/react-app/domains/session/surface/session-surface.tsx")
const memoryPanel = read("apps/app/src/react-app/domains/memory/memory-panel.tsx")
const memoryPolicy = read("apps/app/src/react-app/domains/memory/memory-policy.ts")
const memoryProducer = read("apps/app/src/react-app/domains/memory/memory-suggestion-producers.ts")
const memoryStore = read("apps/app/src/react-app/domains/session/surface/memory-context-store.ts")
const memorySuggestionTool = read("apps/server/src/tools/memory-suggestions.ts")
const server = read("apps/server/src/server.ts")

assert.equal(
  pkg.scripts?.["test:matterhorn-memory-ui"],
  "node scripts/matterhorn-memory-ui.test.mjs",
  "package.json should expose test:matterhorn-memory-ui",
)

for (const expected of [
  '"memory"',
  "memoryRailActive",
  "toggleCurrentSidePanel(\"memory\")",
  "<MemoryPanel",
  "title={`${memoryInboxLabel}",
  "memorySuggestionUnreadCount",
  "refreshMemorySuggestionUnreadCount",
  "Memory inbox: no pending suggestions",
  "pending suggestions",
  "matterhorn:memory-suggestions-changed",
]) {
  assert.match(`${uiState}\n${sessionPage}`, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing shell integration: ${expected}`)
}

for (const expected of [
  'id: "matterhorn-memory"',
  "Matterhorn Memory",
  "No hidden memory",
  "/api/memory/search",
  "/api/memory/capture",
  "/api/memory/export",
  "matterhorn.memory.panel",
  "matterhorn.memory.rail",
]) {
  assert.match(extensions, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing extension manifest item: ${expected}`)
}

for (const expected of [
  "searchMemory",
  "listMemory",
  "captureMemory",
  "planMemorySuggestions",
  "createMemorySuggestions",
  "listMemorySuggestions",
  "getMemorySuggestion",
  "resolveStoredMemorySuggestion",
  "resolveMemorySuggestion",
  "forgetMemory",
  "exportMemory",
  "MatterhornMemoryRecord",
  "MatterhornMemorySuggestionInboxEntry",
  "MatterhornMemorySuggestionLifecycle",
  "MatterhornMemorySuggestionStatus",
  "MatterhornMemorySuggestionAction",
  "MatterhornMemoryExportManifest",
]) {
  assert.match(serverClient, new RegExp(expected), `missing server client memory method/type: ${expected}`)
}

for (const expected of [
  "MemoryContextStrip",
  "matterhorn:memory-context-updated",
  "matterhorn:memory-chat-handoff",
  "addMatterhornMemoryContextToResolvedText",
  "Using memories",
  "Visible to user",
  "memory.context.updated",
  "memory.chat_handoff.applied",
]) {
  assert.match(sessionSurface, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing chat memory integration: ${expected}`)
}

for (const expected of [
  "useMatterhornSessionMemoryContextStore",
  "sanitizeMemoryContextRecords",
  "findForbiddenMemorySecretFields",
  "containsForbiddenMemorySecretMaterial",
  "getMatterhornMemoryPolicyDecision",
  "hidden memory",
  "Do not infer, request, store, or reveal secrets",
  "desk policy matrix",
]) {
  assert.match(memoryStore, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory context safety: ${expected}`)
}

for (const expected of [
  "MATTERHORN_MEMORY_DESK_POLICY_MATRIX",
  "detectMemoryDeskFromRecord",
  "validateMemoryRecordAgainstDeskPolicy",
  "canUseInChat",
  "canExport",
  "canSendToMcpApi",
  "applyMatterhornMemoryDeskPolicyDefaults",
]) {
  assert.match(memoryPolicy, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory policy helper: ${expected}`)
}

for (const expected of [
  "buildMatterhornMemorySuggestions",
  "dispatchMatterhornMemorySuggestions",
  "bittensor_wallet_label",
  "bittensor_subnet_watch_preference",
  "hyperliquid_watched_market",
  "polymarket_watched_market",
  "buildHyperliquidSuggestions",
  "buildPolymarketSuggestions",
  "previewOnly: true",
  "externalSignerRequired: true",
  "wellness_client_preference",
  "user_confirmed_only",
  "canAutoCapture: false",
  "requiresExplicitConsent: true",
  "forbiddenIfSecretDetected: true",
  "containsForbiddenMemorySecretMaterial",
  "validateMemorySuggestionAgainstDeskPolicy",
  "matterhorn:memory-suggestions-updated",
]) {
  assert.match(memoryProducer, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory suggestion producer contract: ${expected}`)
}

for (const expected of [
  "planMatterhornMemorySuggestions",
  "hasForbiddenMatterhornMemorySuggestionInput",
  "writesMemory: false",
  "rejectedSecretInput",
  "bittensor_wallet_label",
  "wellness_client_preference",
  "validateMemorySuggestionAgainstDeskPolicy",
]) {
  assert.match(memorySuggestionTool, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing server memory suggestion planner contract: ${expected}`)
}

for (const expected of [
  "/api/memory/suggestions/plan",
  "memory_suggestion_secret_rejected",
  "planMatterhornMemorySuggestions",
  "status must be pending, confirmed, edited, dismissed, expired, or blocked",
]) {
  assert.match(server, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory suggestion planning route: ${expected}`)
}

for (const expected of [
  "dispatchMatterhornMemorySuggestions",
  "bittensor-chat-handoff",
  "wellness-rail-launcher",
]) {
  assert.match(`${sessionSurface}\n${sessionPage}`, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory producer wiring: ${expected}`)
}

for (const expected of [
  "Remember this",
  "Suggestion inbox",
  "nothing is saved unless you confirm",
  "visible Memory suggestion",
  "resolveStoredMemorySuggestion",
  "listMemorySuggestions",
  "matterhorn.memory.suggestion-inbox.v1",
  "actorConfirmationRequired",
  "dismissalWindowDays",
  "suggestionId",
  "dedupeKey",
  "resolutionReason",
  "suggestionStatusMeta",
  "SUGGESTION_INBOX_FILTERS",
  "suggestionStatusFilter",
  "filteredSuggestionEntries",
  "Memory inbox lifecycle summary",
  "Memory inbox filters",
  "Needs review",
  "Saved history",
  "Not saved",
  "Loading suggestion inbox",
  "No suggestions match this filter",
  "No suggestions yet",
  "New suggestion",
  "Edited + saved",
  "Remembered",
  "Dismissed",
  "Expired",
  "Blocked",
  "Lifecycle state",
  "Available actions:",
  "Confirm, edit, or dismiss.",
  "Dismiss from view only",
  "read-only lifecycle history",
  "Why suggested",
  "Trigger:",
  "Boundary:",
  "Source:",
  "dismissal window:",
  "suggestionDeskReason",
  "read/preview/watch context only",
  "Edit before saving",
  "Save edited memory",
  "No hidden save",
  "canActOnSuggestion",
  "showActiveSuggestionActions",
  "shouldHideSuggestionContent",
  "Blocked suggestion content hidden",
  "Matterhorn hides the proposed title, body, source, and Why suggested details",
  "No title, body, source, confidence detail, or trigger text is rendered",
  "This suggestion is stale and cannot be saved",
  "Dismiss from view",
  "Policy protected",
  "Content redacted",
  "edited cards are already saved",
  "flex flex-wrap gap-2",
  "Remember visible Memory suggestion",
  "Edit visible Memory suggestion before saving",
  "Dismiss visible Memory suggestion",
  "matterhorn:memory-suggestions-updated",
  "matterhorn:memory-suggestion",
  "matterhorn:memory-suggestions-changed",
  "resolveMemorySuggestion",
  "I confirm this is safe to remember",
  "This looks like secret material",
  "Use in chat",
  "Forget",
  "Export evidence",
  "No hidden memory",
  "Desk policy",
  "MCP/API",
  "Wellness becomes restricted by default",
  "market memories cannot be exported or shared with MCP/API",
  "seed phrases",
  "private keys",
  "raw signatures",
  "signed payloads",
  "wallet exports",
]) {
  assert.match(memoryPanel, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing memory panel copy/safety: ${expected}`)
}

for (const forbidden of [
  "Edit -> Save -> Confirm",
  "Edit → Save → Confirm",
  "then still confirm",
  "only Confirm",
]) {
  assert.doesNotMatch(memoryPanel, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `conflicting Memory lifecycle copy found: ${forbidden}`)
}

for (const forbidden of [
  "autoCaptureAllowed: true",
  "hiddenMemoryAllowed: true",
  "canHoldPrivateKeys: true",
  "canHoldSeedPhrases: true",
  "canAutoCapture: true",
  "writesMemory: true",
]) {
  assert.doesNotMatch(`${memoryPanel}\n${memoryStore}\n${extensions}\n${memoryProducer}\n${memorySuggestionTool}`, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `forbidden unsafe memory claim found: ${forbidden}`)
}

// ---------------------------------------------------------------------------
// UI state matrix: each of the 6 lifecycle states renders correctly.
// ---------------------------------------------------------------------------
// State 1 — pending: actionable (confirm / edit / dismiss)
for (const marker of [
  'status === "pending"',
  "Confirm",
  "Edit before saving",
  "Dismiss",
  "Needs review",
  "actorConfirmationRequired",
]) {
  assert.match(memoryPanel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `pending state missing: ${marker}`)
}
// pending: no "Saved" badge (it is NOT saved yet)
assert.doesNotMatch(memoryPanel, /pending.*Saved|Saved.*pending/, "pending state must not display a Saved badge")

// State 2 — edited: already saved, read-only actions
for (const marker of [
  'status === "edited"',
  "edited cards are already saved",
  "read-only lifecycle history",
]) {
  assert.match(memoryPanel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `edited state missing: ${marker}`)
}

// State 3 — confirmed: saved, read-only
for (const marker of [
  'status === "confirmed"',
  "Remembered",
  "read-only lifecycle history",
]) {
  assert.match(memoryPanel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `confirmed state missing: ${marker}`)
}

// State 4 — dismissed: no Confirm button (falls through to read-only)
assert.match(memoryPanel, /status === "dismissed"/)
assert.match(memoryPanel, /Dismiss from view only/)
// dismissed never satisfies canActOnSuggestion (only pending does)
assert.match(memoryPanel, /return "Available actions: none\. This card is read-only lifecycle history\."/)

// State 5 — expired: dismiss-from-view only, stale notice
for (const marker of [
  'status === "expired"',
  "stale",
  "Dismiss from view",
  "dismissalWindowDays",
]) {
  assert.match(memoryPanel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `expired state missing: ${marker}`)
}

// State 6 — blocked: policy-protected, content redacted
for (const marker of [
  'status === "blocked"',
  "Policy protected",
  "Content redacted",
  "shouldHideSuggestionContent",
]) {
  assert.match(memoryPanel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `blocked state missing: ${marker}`)
}
// blocked: suggestionDeskReason is rendered (but title/body are hidden)
assert.match(memoryPanel, /suggestionDeskReason/)

console.log("Matterhorn Memory production UI gate passed.")
