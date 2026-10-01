import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { createMatterhornMemoryVault } from "../packages/matterhorn-memory-vault/dist/index.js"

function memory(id = "mem_delete") {
  const now = "2026-09-30T00:00:00.000Z"
  return {
    id, kind: "protocol_address", scope: "workspace",
    title: "Deletion fixture", summary: "Public wallet label",
    body: { validatorName: "ERASE_THIS_MEMORY_CONTENT" }, tags: ["bittensor", "workspace:ws_delete"], links: [],
    provenance: { source: "user_confirmed", capturedAt: now, capturedBy: "user", confidence: 1,
      reasonRemembered: "Explicitly approved fixture" },
    sensitivity: "public", createdAt: now, updatedAt: now,
    canUseInChat: true, canExport: true, canDelete: true,
  }
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-memory-deletion-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const vault = createMatterhornMemoryVault(path.join(dir, "vault"))
  await vault.initialize()
  return { dir, vault }
}

test("memory filenames preserve normalized slugs for long separator runs and bounded titles", async (t) => {
  const { vault } = await fixture(t)
  const cases = [
    ["---Main / TAO---wallet!!!", "main-tao-wallet"],
    ["-".repeat(100_000), "memory"],
    ["-".repeat(100_000) + "Wallet" + "-".repeat(100_000), "wallet"],
    ["A".repeat(100), "a".repeat(80)],
    ["A".repeat(79) + "---B", "a".repeat(79) + "-"],
    ["💎 / !!!", "memory"],
  ]
  for (const [index, [title, slug]] of cases.entries()) {
    const id = `mem_slug_${index}`
    const saved = await vault.captureRecord({ ...memory(id), title })
    assert.equal(path.basename(saved.markdownPath), `${id}-${slug}.md`)
    assert.equal((await vault.getRecord(id)).title, title)
    await vault.forgetRecord(id)
    await assert.rejects(readFile(saved.markdownPath), { code: "ENOENT" })
  }
})

test("forget erases index and related suggestion content, including resolved suggestions", async (t) => {
  const { vault } = await fixture(t)
  const record = memory()
  await vault.storeSuggestions([{
    version: "matterhorn.memory.suggestion.v1", id: "suggest_delete", proposedRecord: record,
    reason: "ERASE_THIS_MEMORY_CONTENT", source: "chat_capture", confidence: 1,
    desk: "bittensor", useCase: "bittensor_wallet_label", userAction: "dismiss",
    captureMode: "user_confirmed_only", canAutoCapture: false, requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
  }])
  const saved = await vault.resolveStoredSuggestion("suggest_delete", { action: "confirm" })
  await vault.captureRecord({ ...memory("mem_keep"), title: "Keep this", body: { validatorName: "KEEP" } })
  assert.equal((await vault.forgetRecord(record.id, "ERASE_THIS_MEMORY_CONTENT")).forgotten, true)
  assert.equal(await vault.getRecord(record.id), null)
  assert.equal(await vault.getSuggestion("suggest_delete"), null)
  assert.equal((await vault.listAllRecords({ includeDeleted: true })).length, 1)
  assert.equal((await vault.getRecord("mem_keep")).body.validatorName, "KEEP")
  await assert.rejects(readFile(saved.markdownPath), { code: "ENOENT" })
  for (const file of [vault.indexPath, vault.suggestionInboxPath, vault.logPath]) {
    assert.doesNotMatch(await readFile(file, "utf8"), /ERASE_THIS_MEMORY_CONTENT|suggest_delete/)
  }
  assert.equal((await vault.forgetRecord(record.id)).forgotten, false)
})

test("forget removes legacy soft-deleted index content", async (t) => {
  const { vault } = await fixture(t)
  await vault.captureRecord(memory())
  const index = JSON.parse(await readFile(vault.indexPath, "utf8"))
  index.entries.mem_delete.deleted = true
  await writeFile(vault.indexPath, JSON.stringify(index))
  assert.equal((await vault.forgetRecord("mem_delete")).forgotten, true)
  assert.doesNotMatch(await readFile(vault.indexPath, "utf8"), /ERASE_THIS_MEMORY_CONTENT/)
})

for (const operation of ["forget", "update", "purge"]) {
  test(`${operation} rejects a tampered stored path without deleting an unrelated file`, async (t) => {
    const { dir, vault } = await fixture(t)
    await vault.captureRecord(memory())
    const outside = path.join(dir, "unrelated.md")
    await writeFile(outside, "KEEP")
    const index = JSON.parse(await readFile(vault.indexPath, "utf8"))
    index.entries.mem_delete.markdownPath = outside
    await writeFile(vault.indexPath, JSON.stringify(index))
    await assert.rejects(async () => {
      if (operation === "forget") await vault.forgetRecord("mem_delete")
      if (operation === "update") await vault.updateRecord("mem_delete", { title: "Renamed" })
      if (operation === "purge") await vault.purgeWorkspace("ws_delete")
    }, /memory.*path/i)
    assert.equal(await readFile(outside, "utf8"), "KEEP")
  })
}

test("capturing an existing id with a new title does not leave an orphaned content file", async (t) => {
  const { vault } = await fixture(t)
  const first = await vault.captureRecord(memory())
  const second = await vault.captureRecord({ ...memory(), title: "Changed title" })
  await assert.rejects(readFile(first.markdownPath), { code: "ENOENT" })
  assert.match(await readFile(second.markdownPath, "utf8"), /Changed title/)
  await vault.forgetRecord("mem_delete")
  await assert.rejects(readFile(second.markdownPath), { code: "ENOENT" })
})

test("vault directories, records, control files and export files are owner-only", async (t) => {
  const { dir, vault } = await fixture(t)
  const captured = await vault.captureRecord(memory())
  const exported = await vault.exportBundle(path.join(dir, "export"))
  if (process.platform !== "win32") {
    for (const directory of [vault.rootDir, path.join(vault.rootDir, "Protocols"), path.dirname(captured.markdownPath), exported.outputDir]) {
      assert.equal((await stat(directory)).mode & 0o777, 0o700, directory)
    }
    for (const file of [captured.markdownPath, vault.indexPath, vault.suggestionInboxPath, vault.logPath,
      exported.recordsPath, exported.manifestPath, exported.sha256Path]) {
      assert.equal((await stat(file)).mode & 0o777, 0o600, file)
    }
    await chmod(vault.indexPath, 0o666)
    await chmod(vault.rootDir, 0o755)
    await vault.initialize()
    assert.equal((await stat(vault.indexPath)).mode & 0o777, 0o600)
    assert.equal((await stat(vault.rootDir)).mode & 0o777, 0o700)
  }
})

for (const target of ["directory", "index", "record", "log"]) {
  test(`rejects a ${target} symlink without modifying its target`, async (t) => {
    const { dir, vault } = await fixture(t)
    const saved = await vault.captureRecord(memory())
    const external = path.join(dir, "external")
    const externalContent = target === "index" ? await readFile(vault.indexPath, "utf8") : "KEEP"
    await writeFile(external, externalContent)
    const link = target === "index" ? vault.indexPath : target === "log" ? vault.logPath
      : target === "record" ? saved.markdownPath : path.dirname(saved.markdownPath)
    await rm(link, { recursive: target === "directory" })
    await symlink(target === "directory" ? dir : external, link)
    await assert.rejects(() => vault.forgetRecord("mem_delete"), /memory.*path/i)
    assert.equal(await readFile(external, "utf8"), externalContent)
  })
}

test("concurrent vault instances do not lose unrelated writes or resurrect a forgotten record", async (t) => {
  const { vault } = await fixture(t)
  await vault.captureRecord(memory())
  const sibling = createMatterhornMemoryVault(vault.rootDir)
  await Promise.all([
    vault.forgetRecord("mem_delete"),
    ...Array.from({ length: 10 }, (_, index) => sibling.captureRecord(memory(`mem_keep_${index}`))),
  ])
  assert.equal(await vault.getRecord("mem_delete"), null)
  assert.equal((await vault.listAllRecords()).length, 10)
  assert.doesNotMatch(await readFile(vault.indexPath, "utf8"), /"mem_delete"/)
})

test("a failed mutation releases the queue for subsequent saves", async (t) => {
  const { vault } = await fixture(t)
  await assert.rejects(() => vault.captureRecord({ ...memory(), id: "../invalid" }), /Invalid memory record id/)
  await vault.captureRecord(memory())
  assert.equal((await vault.getRecord("mem_delete")).id, "mem_delete")
})

test("export does not chmod an existing user-selected folder", async (t) => {
  const { dir, vault } = await fixture(t)
  const output = path.join(dir, "existing-output")
  await mkdir(output)
  await chmod(output, 0o755)
  const before = (await stat(output)).mode
  await vault.exportBundle(output)
  assert.equal((await stat(output)).mode, before)
})

test("workspace purge retains its deletion inventory if log cleanup fails, then retries completely", async (t) => {
  const { vault } = await fixture(t)
  await vault.captureRecord(memory())
  await vault.captureRecord({ ...memory("mem_other"), tags: ["bittensor", "workspace:ws_other"] })
  await vault.storeSuggestions([{
    version: "matterhorn.memory.suggestion.v1", id: "suggest_purge", proposedRecord: memory("mem_proposed"),
    reason: "ERASE_THIS_MEMORY_CONTENT", source: "chat_capture", confidence: 1,
    desk: "bittensor", useCase: "bittensor_wallet_label", userAction: "dismiss",
    captureMode: "user_confirmed_only", canAutoCapture: false, requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
  }])
  const log = await readFile(vault.logPath, "utf8")
  // A real filesystem failure, restricted to this disposable fixture.
  await rm(vault.logPath)
  await mkdir(vault.logPath)
  await assert.rejects(() => vault.purgeWorkspace("ws_delete"))
  assert.ok(JSON.parse(await readFile(vault.indexPath, "utf8")).entries.mem_delete)
  assert.ok(await vault.getSuggestion("suggest_purge"))
  await rm(vault.logPath, { recursive: true })
  await writeFile(vault.logPath, log)
  assert.deepEqual(await vault.purgeWorkspace("ws_delete"), {
    workspaceId: "ws_delete", deletedRecords: 1, deletedSuggestions: 1,
  })
  assert.equal(await vault.getRecord("mem_delete"), null)
  assert.equal(await vault.getSuggestion("suggest_purge"), null)
  assert.ok(await vault.getRecord("mem_other"))
  assert.doesNotMatch(await readFile(vault.logPath, "utf8"), /mem_delete|suggest_purge/)
})
