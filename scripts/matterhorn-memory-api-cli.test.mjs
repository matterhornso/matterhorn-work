import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const server = await readFile("apps/server/src/server.ts", "utf8")
const cli = await readFile("apps/orchestrator/src/cli.ts", "utf8")
const docs = await readFile("docs/memory/local-vault.md", "utf8")

for (const route of [
  '"/api/memory/search"',
  '"/api/memory/entities"',
  '"/api/memory/entities/:id"',
  '"/api/memory/capture"',
  '"/api/memory/forget"',
  '"/api/memory/export"',
]) {
  assert.match(server, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing server route ${route}`)
}

assert.match(server, /createMatterhornMemoryVault\(resolveMatterhornMemoryRoot\(\)\)/)
assert.match(server, /MATTERHORN_WORK_MEMORY_ROOT/)
assert.match(server, /OPENWORK_MEMORY_ROOT/)
assert.match(server, /memory_safety_rejected/)
assert.match(server, /memoryVault\.captureRecord\(record\)/)
assert.match(server, /memoryVault\.exportBundle\(outputDir\)/)

assert.match(cli, /matterhorn-work memory search\|list\|get\|capture\|update\|forget\|export/)
assert.match(cli, /Manage explicit, user-controlled Matterhorn Memory records/)
assert.match(cli, /async function runMemory\(args: ParsedArgs\)/)
assert.match(cli, /Authorization: `Bearer \$\{token\}`/)
assert.match(cli, /\/api\/memory\/search/)
assert.match(cli, /\/api\/memory\/capture/)
assert.match(cli, /\/api\/memory\/forget/)
assert.match(cli, /\/api\/memory\/export/)
assert.match(cli, /buildMemoryRecordFromCli/)
assert.match(cli, /body-json/)
assert.match(cli, /patch-json/)

for (const forbidden of [
  "private-key",
  "seed-phrase",
  "mnemonic",
  "api-secret",
  "raw-signature",
  "signed-payload",
  "wallet-export",
  "exchange-secret",
]) {
  assert.match(cli, new RegExp(JSON.stringify(forbidden).slice(1, -1)), `CLI must reject ${forbidden}`)
}

assert.match(docs, /GET    \/api\/memory\/search/)
assert.match(docs, /matterhorn-work memory capture/)
assert.match(docs, /The CLI requires the normal local server auth flags/)
assert.match(docs, /secret-shaped nested fields are rejected before writing/)

console.log("Matterhorn memory API + CLI contract gate passed.")
