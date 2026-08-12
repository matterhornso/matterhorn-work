import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  MATTERHORN_MEMORY_VAULT_VERSION,
  createMatterhornMemoryVault,
} from "../packages/matterhorn-memory-vault/dist/index.js"

const now = new Date("2026-06-22T00:00:00.000Z").toISOString()

function record(overrides = {}) {
  return {
    id: overrides.id ?? "mem_test_bittensor_wallet",
    kind: overrides.kind ?? "protocol_address",
    scope: overrides.scope ?? "workspace",
    title: overrides.title ?? "Main TAO wallet",
    summary: overrides.summary ?? "Public SS58 address label for TAO balance checks.",
    body: overrides.body ?? {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repoFixtureOnly",
      netuid: 14,
      validatorName: "Fixture validator",
    },
    tags: overrides.tags ?? ["bittensor", "tao", "wallet"],
    links: overrides.links ?? [],
    provenance: overrides.provenance ?? {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.95,
      reasonRemembered: "The user confirmed this public address can be reused for TAO read workflows.",
    },
    sensitivity: overrides.sensitivity ?? "public",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    canUseInChat: overrides.canUseInChat ?? true,
    canExport: overrides.canExport ?? true,
    canDelete: overrides.canDelete ?? true,
  }
}

function suggestion(overrides = {}) {
  const proposedRecord = overrides.proposedRecord ?? record({
    id: "mem_suggestion_tao_wallet",
    title: "Remember TAO wallet label",
    summary: "Public SS58 address label suggested from chat context.",
  })
  return {
    version: "matterhorn.memory.suggestion.v1",
    id: overrides.id ?? "suggestion_tao_wallet_label",
    proposedRecord,
    reason: overrides.reason ?? "The user repeatedly asked to use this public TAO address for Bittensor reads.",
    source: overrides.source ?? "chat_capture",
    confidence: overrides.confidence ?? 0.88,
    desk: overrides.desk ?? "bittensor",
    useCase: overrides.useCase ?? "bittensor_wallet_label",
    userAction: overrides.userAction ?? "dismiss",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    policyDecision: overrides.policyDecision,
    policyWarnings: overrides.policyWarnings,
  }
}

const rootDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-memory-vault-"))
const exportDir = path.join(rootDir, "export")
const vault = createMatterhornMemoryVault(rootDir)

try {
  await vault.initialize()
  await stat(path.join(rootDir, "memory-index.json"))

  const captured = await vault.captureRecord(record())
  assert.equal(captured.record.id, "mem_test_bittensor_wallet")
  assert.match(captured.markdownPath, /Protocols\/Bittensor/)

  const markdown = await readFile(captured.markdownPath, "utf8")
  assert.match(markdown, /# Main TAO wallet/)
  assert.match(markdown, /## Why Remembered/)
  assert.match(markdown, /```json/)

  const fetched = await vault.getRecord("mem_test_bittensor_wallet")
  assert.equal(fetched?.title, "Main TAO wallet")

  const searchByTao = await vault.searchRecords({ query: "TAO", limit: 10 })
  assert.equal(searchByTao.length, 1)
  assert.equal(searchByTao[0]?.id, "mem_test_bittensor_wallet")

  const searchByTag = await vault.searchRecords({ tags: ["bittensor"], limit: 10 })
  assert.equal(searchByTag.length, 1)

  await assert.rejects(
    () =>
      vault.captureRecord(
        record({
          id: "../escape",
        }),
      ),
    /Invalid memory record id/,
  )

  const dismissedSuggestion = await vault.resolveSuggestion(suggestion(), { action: "dismiss" })
  assert.equal(dismissedSuggestion.saved, false)
  assert.equal(dismissedSuggestion.dismissed, true)
  assert.equal(await vault.getRecord("mem_suggestion_tao_wallet"), null)

  const confirmedSuggestion = await vault.resolveSuggestion(suggestion({ userAction: "confirm" }), { action: "confirm" })
  assert.equal(confirmedSuggestion.saved, true)
  assert.equal(confirmedSuggestion.dismissed, false)
  assert.equal(confirmedSuggestion.record?.id, "mem_suggestion_tao_wallet")
  assert.equal((await vault.searchRecords({ query: "suggested", limit: 10 })).length, 1)

  const updated = await vault.updateRecord("mem_test_bittensor_wallet", {
    summary: "Updated public SS58 label for read-only TAO workflows.",
  })
  assert.match(updated.summary, /Updated/)

  await assert.rejects(
    () =>
      vault.captureRecord(
        record({
          id: "mem_secret_rejected",
          body: {
            privateKey: "0xabc",
          },
        }),
      ),
    /forbidden secret material/i,
  )

  await assert.rejects(
    () =>
      vault.captureRecord(
        record({
          id: "mem_market_submit_rejected",
          title: "Hyperliquid unsafe memory",
          tags: ["hyperliquid"],
          body: {
            submitOrder: true,
          },
        }),
      ),
    /live submission|submitorder/i,
  )

  await assert.rejects(
    () =>
      vault.resolveSuggestion(
        suggestion({
          id: "suggestion_secret_rejected",
          userAction: "confirm",
          proposedRecord: record({
            id: "mem_secret_suggestion_rejected",
            body: { privateKey: "0xabc" },
          }),
        }),
        { action: "confirm" },
      ),
    /cannot be saved|forbidden secret/i,
  )

  await vault.captureRecord(record({
    id: "mem_workspace_purge",
    title: "Workspace deletion record",
    tags: ["bittensor", "workspace:ws_account_deleted"],
  }))
  await vault.storeSuggestions([suggestion({
    id: "suggestion_workspace_purge",
    proposedRecord: record({
      id: "mem_workspace_purge_suggestion",
      title: "Workspace deletion suggestion",
      tags: ["bittensor", "workspace:ws_account_deleted"],
    }),
  })])
  const workspacePurge = await vault.purgeWorkspace("ws_account_deleted")
  assert.equal(workspacePurge.deletedRecords, 1)
  assert.equal(workspacePurge.deletedSuggestions, 1)
  assert.equal(await vault.getRecord("mem_workspace_purge"), null)
  assert.equal(await vault.getSuggestion("suggestion_workspace_purge"), null)
  const purgedIndex = await readFile(path.join(rootDir, "memory-index.json"), "utf8")
  const purgedInbox = await readFile(path.join(rootDir, "memory-suggestions.json"), "utf8")
  const purgedLog = await readFile(path.join(rootDir, "memory-log.jsonl"), "utf8")
  assert.doesNotMatch(purgedIndex, /mem_workspace_purge/)
  assert.doesNotMatch(purgedInbox, /suggestion_workspace_purge/)
  assert.doesNotMatch(purgedLog, /mem_workspace_purge|suggestion_workspace_purge/)

  const exported = await vault.exportBundle(exportDir)
  assert.equal(exported.version, MATTERHORN_MEMORY_VAULT_VERSION)
  assert.equal(exported.recordCount, 2)
  assert.equal(exported.sha256.length, 64)
  assert.match(await readFile(exported.sha256Path, "utf8"), /matterhorn-memory-records\.json/)

  const forgotten = await vault.forgetRecord("mem_test_bittensor_wallet", "test forget")
  assert.equal(forgotten.forgotten, true)
  assert.equal(await vault.getRecord("mem_test_bittensor_wallet"), null)
  const forgottenSuggestion = await vault.forgetRecord("mem_suggestion_tao_wallet", "test suggestion forget")
  assert.equal(forgottenSuggestion.forgotten, true)
  assert.equal(await vault.getRecord("mem_suggestion_tao_wallet"), null)
  assert.equal((await vault.searchRecords({ query: "TAO", limit: 10 })).length, 0)

  const log = await readFile(path.join(rootDir, "memory-log.jsonl"), "utf8")
  assert.match(log, /"action":"capture"/)
  assert.match(log, /"action":"suggestion_dismiss"/)
  assert.match(log, /"action":"suggestion_reject"/)
  assert.match(log, /"action":"update"/)
  assert.match(log, /"action":"export"/)
  assert.match(log, /"action":"forget"/)

  console.log("Matterhorn memory vault smoke gate passed.")
} finally {
  vault.close()
  await rm(rootDir, { recursive: true, force: true })
}

const bulkRootDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-memory-vault-bulk-"))
const bulkExportDir = path.join(bulkRootDir, "export")
const bulkVault = createMatterhornMemoryVault(bulkRootDir)

try {
  for (let index = 0; index < 505; index += 1) {
    await bulkVault.captureRecord(
      record({
        id: `mem_bulk_${String(index).padStart(3, "0")}`,
        title: `Bulk export memory ${index}`,
        summary: `Bulk export memory ${index} should not be omitted by list pagination.`,
        body: {
          ss58Address: `5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1bulk${index}`,
          netuid: 14,
        },
      }),
    )
  }
  const exported = await bulkVault.exportBundle(bulkExportDir)
  assert.equal(exported.recordCount, 505)
} finally {
  bulkVault.close()
  await rm(bulkRootDir, { recursive: true, force: true })
}

const corruptRootDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-memory-vault-corrupt-"))
const corruptVault = createMatterhornMemoryVault(corruptRootDir)

try {
  await corruptVault.initialize()
  const indexPath = path.join(corruptRootDir, "memory-index.json")
  await writeFile(indexPath, "{ not valid json", "utf8")
  await assert.rejects(() => corruptVault.listRecords(), /Could not read Matterhorn memory index/)
  assert.equal(await readFile(indexPath, "utf8"), "{ not valid json")
} finally {
  corruptVault.close()
  await rm(corruptRootDir, { recursive: true, force: true })
}
