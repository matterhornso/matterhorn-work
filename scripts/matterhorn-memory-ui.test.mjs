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
const memoryStore = read("apps/app/src/react-app/domains/session/surface/memory-context-store.ts")

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
  "title=\"Memory: review remembered context",
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
  "forgetMemory",
  "exportMemory",
  "MatterhornMemoryRecord",
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
  "Remember this",
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
  "autoCaptureAllowed: true",
  "hiddenMemoryAllowed: true",
  "canHoldPrivateKeys: true",
  "canHoldSeedPhrases: true",
]) {
  assert.doesNotMatch(`${memoryPanel}\n${memoryStore}\n${extensions}`, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `forbidden unsafe memory claim found: ${forbidden}`)
}

console.log("Matterhorn Memory production UI gate passed.")
