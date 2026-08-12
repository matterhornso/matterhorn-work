import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import {
  DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
  MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
  type MatterhornMemorySuggestion,
  type MatterhornMemorySuggestionAction,
  type MatterhornMemorySuggestionLifecycle,
  type MatterhornMemorySuggestionStatus,
  type MatterhornMemorySuggestionUserAction,
  type MatterhornMemoryKind,
  type MatterhornMemoryRecord,
  applyMemorySuggestionAction,
  canMemorySuggestionBecomeSavedMemory,
  computeMemorySuggestionDismissedUntil,
  detectMemoryDeskFromRecord,
  redactForbiddenMemorySecrets,
  sanitizeMemorySuggestionForDisplay,
  validateMemorySuggestionAgainstDeskPolicy,
  validateMemorySuggestionLifecycle,
  validateMemoryRecordAgainstDeskPolicy,
  validateMemorySafety,
} from "@matterhorn-work/types/memory"

export const MATTERHORN_MEMORY_VAULT_VERSION = "matterhorn.memory.vault.v1" as const
export const MATTERHORN_MEMORY_INDEX_VERSION = "matterhorn.memory.index.v1" as const
export const MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION = "matterhorn.memory.suggestion-inbox.v1" as const
const SAFE_MEMORY_ID_PATTERN = /^[A-Za-z0-9._-]+$/

export interface MatterhornMemoryVaultOptions {
  rootDir: string
}

export interface MatterhornMemorySearchOptions {
  query?: string
  kind?: MatterhornMemoryKind
  scope?: MatterhornMemoryRecord["scope"]
  tags?: string[]
  includeDeleted?: boolean
  limit?: number
}

export interface MatterhornMemoryCaptureResult {
  record: MatterhornMemoryRecord
  markdownPath: string
}

export interface MatterhornMemoryForgetResult {
  id: string
  forgotten: boolean
  reason: string
}

export interface MatterhornMemoryWorkspacePurgeResult {
  workspaceId: string
  deletedRecords: number
  deletedSuggestions: number
}

export interface MatterhornMemoryExportResult {
  version: typeof MATTERHORN_MEMORY_VAULT_VERSION
  outputDir: string
  manifestPath: string
  recordsPath: string
  sha256Path: string
  recordCount: number
  sha256: string
}

export interface MatterhornMemorySuggestionResolveOptions {
  action?: MatterhornMemorySuggestionAction
  patch?: Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>
  reason?: string
}

export interface MatterhornMemorySuggestionResolveResult {
  suggestion: MatterhornMemorySuggestion
  saved: boolean
  dismissed: boolean
  reason: string
  record?: MatterhornMemoryRecord
  markdownPath?: string
  policyWarnings: string[]
}

export type MatterhornMemorySuggestionInboxStatus = MatterhornMemorySuggestionStatus

export interface MatterhornMemorySuggestionInboxEntry extends MatterhornMemorySuggestionLifecycle {
  version: typeof MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION
  id: string
  suggestion: MatterhornMemorySuggestion
  updatedAt: string
  resolvedAt?: string
  lastAction?: MatterhornMemorySuggestionAction
  resolutionReason?: string
  recordId?: string
  markdownPath?: string
  policyWarnings: string[]
}

export interface MatterhornMemorySuggestionListOptions {
  status?: MatterhornMemorySuggestionInboxStatus
  desk?: MatterhornMemorySuggestion["desk"]
  includeResolved?: boolean
  limit?: number
}

export interface MatterhornMemorySuggestionStoreResult {
  entries: MatterhornMemorySuggestionInboxEntry[]
  count: number
}

interface MatterhornMemoryIndexEntry {
  record: MatterhornMemoryRecord
  markdownPath: string
  deleted: boolean
}

interface MatterhornMemoryIndex {
  version: typeof MATTERHORN_MEMORY_INDEX_VERSION
  updatedAt: string
  entries: Record<string, MatterhornMemoryIndexEntry>
}

interface MatterhornMemorySuggestionInbox {
  version: typeof MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION
  updatedAt: string
  entries: Record<string, MatterhornMemorySuggestionInboxEntry>
}

function suggestionDedupeKey(suggestion: MatterhornMemorySuggestion): string {
  return [
    suggestion.desk,
    suggestion.useCase,
    suggestion.proposedRecord.kind,
    suggestion.proposedRecord.scope,
    suggestion.proposedRecord.title,
  ]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 160)
}

function buildSuggestionLifecycle(
  suggestion: MatterhornMemorySuggestion,
  status: MatterhornMemorySuggestionStatus,
  createdAt: string,
  existing?: MatterhornMemorySuggestionInboxEntry,
): MatterhornMemorySuggestionLifecycle {
  const isWellnessSuggestion = suggestion.desk === "wellness";

  return {
    suggestionId: suggestion.id,
    dedupeKey: existing?.dedupeKey ?? suggestionDedupeKey(suggestion),
    source: suggestion.source,
    kind: suggestion.proposedRecord.kind,
    scope: suggestion.proposedRecord.scope,
    sensitivity: suggestion.proposedRecord.sensitivity,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    proposedRecord: suggestion.proposedRecord,
    createdAt: existing?.createdAt ?? createdAt,
    expiresAt: existing?.expiresAt,
    dismissedUntil: existing?.dismissedUntil,
    dismissalWindowDays: existing?.dismissalWindowDays ?? DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
    actorConfirmationRequired: true,
    status,
    policyWarnings: existing?.policyWarnings,
    localOnly: existing?.localOnly ?? (isWellnessSuggestion ? true : undefined),
    nonClinical: existing?.nonClinical ?? (isWellnessSuggestion ? true : undefined),
  };
}

type MemoryLogAction =
  | "capture"
  | "update"
  | "forget"
  | "export"
  | "suggestion_store"
  | "suggestion_confirm"
  | "suggestion_edit"
  | "suggestion_dismiss"
  | "suggestion_reject"

export class MatterhornMemoryVault {
  readonly rootDir: string
  readonly indexPath: string
  readonly suggestionInboxPath: string
  readonly logPath: string

  constructor(options: MatterhornMemoryVaultOptions) {
    this.rootDir = options.rootDir
    this.indexPath = path.join(this.rootDir, "memory-index.json")
    this.suggestionInboxPath = path.join(this.rootDir, "memory-suggestions.json")
    this.logPath = path.join(this.rootDir, "memory-log.jsonl")
  }

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await Promise.all(
      [
        "People",
        "Projects",
        "Protocols/Bittensor",
        "Protocols/Hyperliquid",
        "Protocols/Polymarket",
        "Wellness",
        "Workflows",
        "Watchlists",
        "Receipts",
        "Decisions",
        "Sources",
      ].map((dir) => mkdir(path.join(this.rootDir, dir), { recursive: true })),
    )

    try {
      await readFile(this.indexPath, "utf8")
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
      await this.writeIndex(emptyIndex())
    }
    try {
      await readFile(this.suggestionInboxPath, "utf8")
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
      await this.writeSuggestionInbox(emptySuggestionInbox())
    }
  }

  close(): void {
    // The portable vault keeps no open handles.
  }

  async captureRecord(record: MatterhornMemoryRecord): Promise<MatterhornMemoryCaptureResult> {
    await this.initialize()
    this.assertSafe(record)

    const markdownPath = this.markdownPathForRecord(record)
    await mkdir(path.dirname(markdownPath), { recursive: true })
    await writeFile(markdownPath, renderMemoryMarkdown(record), "utf8")

    const index = await this.readIndex()
    index.entries[record.id] = { record, markdownPath, deleted: false }
    await this.writeIndex(index)
    await this.appendLog("capture", record.id, { markdownPath })
    return { record, markdownPath }
  }

  async resolveSuggestion(
    suggestion: MatterhornMemorySuggestion,
    options: MatterhornMemorySuggestionResolveOptions = {},
  ): Promise<MatterhornMemorySuggestionResolveResult> {
    await this.initialize()
    const resolved = sanitizeMemorySuggestionForDisplay(applySuggestionResolution(suggestion, options))
    const warnings = resolved.policyWarnings ?? []

    if (resolved.userAction === "dismiss") {
      await this.appendLog("suggestion_dismiss", resolved.id, {
        reason: options.reason ?? "User dismissed this memory suggestion.",
        useCase: resolved.useCase,
        desk: resolved.desk,
      })
      return {
        suggestion: resolved,
        saved: false,
        dismissed: true,
        reason: options.reason ?? "Suggestion dismissed. No memory was written.",
        policyWarnings: warnings,
      }
    }

    const validation = validateMemorySuggestionAgainstDeskPolicy(resolved)
    if (!validation.ok || !canMemorySuggestionBecomeSavedMemory(resolved)) {
      await this.appendLog("suggestion_reject", resolved.id, {
        reason: validation.errors.join("; ") || "Suggestion cannot become saved memory.",
        useCase: resolved.useCase,
        desk: resolved.desk,
      })
      throw new Error(`Memory suggestion cannot be saved: ${validation.errors.join("; ") || "explicit confirmation and safe policy approval are required"}`)
    }

    const captured = await this.captureRecord(resolved.proposedRecord)
    return {
      suggestion: resolved,
      saved: true,
      dismissed: false,
      reason: options.reason ?? "User confirmed this memory suggestion.",
      record: captured.record,
      markdownPath: captured.markdownPath,
      policyWarnings: warnings,
    }
  }

  async storeSuggestions(suggestions: MatterhornMemorySuggestion[]): Promise<MatterhornMemorySuggestionStoreResult> {
    await this.initialize()
    const inbox = await this.readSuggestionInbox()
    const now = new Date().toISOString()
    const entries: MatterhornMemorySuggestionInboxEntry[] = []

    for (const suggestion of suggestions) {
      const sanitized = sanitizeMemorySuggestionForDisplay(suggestion)
      const validation = validateMemorySuggestionAgainstDeskPolicy(sanitized)
      const canSave = validation.ok && sanitized.policyDecision !== "reject"
      const existing = inbox.entries[sanitized.id]
      const existingDismissalExpired =
        existing?.status === "dismissed" &&
        typeof existing.dismissedUntil === "string" &&
        existing.dismissedUntil <= now
      const status: MatterhornMemorySuggestionInboxStatus = canSave
        ? existingDismissalExpired
          ? "expired"
          : existing?.status ?? "pending"
        : "blocked"
      const policyWarnings = [
        ...(sanitized.policyWarnings ?? []),
        ...validation.errors,
      ]
      const lifecycle = buildSuggestionLifecycle(sanitized, status, now, existing)
      const lifecycleValidation = validateMemorySuggestionLifecycle({
        ...lifecycle,
        policyWarnings,
      })
      const entry: MatterhornMemorySuggestionInboxEntry = {
        version: MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION,
        id: sanitized.id,
        suggestion: sanitized,
        ...lifecycle,
        status: lifecycleValidation.ok ? status : "blocked",
        updatedAt: now,
        resolvedAt: existing?.resolvedAt,
        lastAction: existing?.lastAction,
        resolutionReason: lifecycleValidation.ok && canSave
          ? existing?.resolutionReason
          : [...validation.errors, ...lifecycleValidation.errors].join("; ") || "Suggestion is blocked by memory policy.",
        recordId: existing?.recordId,
        markdownPath: existing?.markdownPath,
        policyWarnings: [...policyWarnings, ...lifecycleValidation.errors],
      }
      inbox.entries[entry.id] = entry
      entries.push(entry)
      await this.appendLog(entry.status === "blocked" ? "suggestion_reject" : "suggestion_store", entry.id, {
        status: entry.status,
        useCase: sanitized.useCase,
        desk: sanitized.desk,
      })
    }

    await this.writeSuggestionInbox(inbox)
    return { entries, count: entries.length }
  }

  async listSuggestions(options: MatterhornMemorySuggestionListOptions = {}): Promise<MatterhornMemorySuggestionInboxEntry[]> {
    await this.initialize()
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
    return Object.values((await this.readSuggestionInbox()).entries)
      .filter((entry) => options.status ? entry.status === options.status : true)
      .filter((entry) => options.desk ? entry.suggestion.desk === options.desk : true)
      .filter((entry) => options.includeResolved ? true : entry.status === "pending" || entry.status === "blocked")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
  }

  async listAllSuggestions(options: Omit<MatterhornMemorySuggestionListOptions, "limit"> = {}): Promise<MatterhornMemorySuggestionInboxEntry[]> {
    await this.initialize()
    return Object.values((await this.readSuggestionInbox()).entries)
      .filter((entry) => options.status ? entry.status === options.status : true)
      .filter((entry) => options.desk ? entry.suggestion.desk === options.desk : true)
      .filter((entry) => options.includeResolved ? true : entry.status === "pending" || entry.status === "blocked")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getSuggestion(id: string): Promise<MatterhornMemorySuggestionInboxEntry | null> {
    await this.initialize()
    return (await this.readSuggestionInbox()).entries[id] ?? null
  }

  async resolveStoredSuggestion(
    id: string,
    options: MatterhornMemorySuggestionResolveOptions = {},
  ): Promise<MatterhornMemorySuggestionResolveResult & { entry: MatterhornMemorySuggestionInboxEntry }> {
    await this.initialize()
    const inbox = await this.readSuggestionInbox()
    const existing = inbox.entries[id]
    if (!existing) {
      throw new Error(`Memory suggestion not found: ${id}`)
    }
    if (existing.status !== "pending") {
      throw new Error(`Memory suggestion is not pending: ${id}`)
    }

    try {
      const result = await this.resolveSuggestion(existing.suggestion, options)
      const action = options.action ?? existing.suggestion.userAction
      const now = new Date().toISOString()
      const actionResult = applyMemorySuggestionAction(existing, action, {
        memoryRecordId: result.record?.id,
        now,
        dismissalWindowDays: existing.dismissalWindowDays,
      })
      if (!result.dismissed && actionResult.blockedReasons.length) {
        throw new Error(`Memory suggestion lifecycle rejected action: ${actionResult.blockedReasons.join("; ")}`)
      }
      const entry: MatterhornMemorySuggestionInboxEntry = {
        ...existing,
        suggestion: result.suggestion,
        status: actionResult.status,
        updatedAt: now,
        resolvedAt: now,
        lastAction: action,
        resolutionReason: result.reason,
        recordId: actionResult.memoryRecordId ?? result.record?.id,
        markdownPath: result.markdownPath,
        dismissedUntil: result.dismissed
          ? computeMemorySuggestionDismissedUntil(now, existing.dismissalWindowDays)
          : undefined,
        policyWarnings: [...result.policyWarnings, ...actionResult.blockedReasons],
      }
      inbox.entries[id] = entry
      await this.writeSuggestionInbox(inbox)
      await this.appendLog(action === "dismiss" ? "suggestion_dismiss" : action === "edit" ? "suggestion_edit" : "suggestion_confirm", id, {
        status: entry.status,
        recordId: result.record?.id,
      })
      return { ...result, entry }
    } catch (error) {
      const now = new Date().toISOString()
      const entry: MatterhornMemorySuggestionInboxEntry = {
        ...existing,
        status: "blocked",
        updatedAt: now,
        resolvedAt: now,
        lastAction: options.action ?? existing.suggestion.userAction,
        resolutionReason: error instanceof Error ? error.message : String(error),
        policyWarnings: [
          ...(existing.policyWarnings ?? []),
          error instanceof Error ? error.message : String(error),
        ],
      }
      inbox.entries[id] = entry
      await this.writeSuggestionInbox(inbox)
      throw error
    }
  }

  async getRecord(id: string): Promise<MatterhornMemoryRecord | null> {
    await this.initialize()
    assertSafeMemoryId(id)
    const entry = (await this.readIndex()).entries[id]
    return entry && !entry.deleted ? entry.record : null
  }

  async listRecords(options: Omit<MatterhornMemorySearchOptions, "query"> = {}): Promise<MatterhornMemoryRecord[]> {
    return this.searchRecords(options)
  }

  async listAllRecords(options: Omit<MatterhornMemorySearchOptions, "query" | "limit"> = {}): Promise<MatterhornMemoryRecord[]> {
    await this.initialize()
    return Object.values((await this.readIndex()).entries)
      .filter((entry) => (options.includeDeleted ? true : !entry.deleted))
      .map((entry) => entry.record)
      .filter((record) => (options.kind ? record.kind === options.kind : true))
      .filter((record) => (options.scope ? record.scope === options.scope : true))
      .filter((record) => {
        if (!options.tags?.length) return true
        const recordTags = new Set(record.tags.map((tag) => tag.toLowerCase()))
        return options.tags.every((tag) => recordTags.has(tag.toLowerCase()))
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async searchRecords(options: MatterhornMemorySearchOptions = {}): Promise<MatterhornMemoryRecord[]> {
    await this.initialize()
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
    const query = options.query?.trim().toLowerCase()
    const tokens = query?.split(/\s+/).filter(Boolean) ?? []
    const records = (await this.listAllRecords({
      kind: options.kind,
      scope: options.scope,
      tags: options.tags,
      includeDeleted: options.includeDeleted,
    }))
      .filter((record) => {
        if (!tokens.length) return true
        const haystack = [
          record.title,
          record.summary,
          record.kind,
          record.scope,
          record.sensitivity,
          record.tags.join(" "),
          JSON.stringify(record.body),
          record.provenance.reasonRemembered,
        ]
          .join(" ")
          .toLowerCase()
        return tokens.every((token) => haystack.includes(token))
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return records.slice(0, limit)
  }

  async updateRecord(
    id: string,
    patch: Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>,
  ): Promise<MatterhornMemoryRecord> {
    await this.initialize()
    assertSafeMemoryId(id)
    const index = await this.readIndex()
    const existing = index.entries[id]
    if (!existing || existing.deleted) {
      throw new Error(`Memory record not found: ${id}`)
    }

    const next: MatterhornMemoryRecord = {
      ...existing.record,
      ...patch,
      id: existing.record.id,
      createdAt: existing.record.createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
      body: patch.body ?? existing.record.body,
      links: patch.links ?? existing.record.links,
      tags: patch.tags ?? existing.record.tags,
      provenance: patch.provenance ?? existing.record.provenance,
    }
    this.assertSafe(next)

    const markdownPath = this.markdownPathForRecord(next)
    if (markdownPath !== existing.markdownPath) {
      await rm(existing.markdownPath, { force: true })
    }
    await mkdir(path.dirname(markdownPath), { recursive: true })
    await writeFile(markdownPath, renderMemoryMarkdown(next), "utf8")
    index.entries[id] = { record: next, markdownPath, deleted: false }
    await this.writeIndex(index)
    await this.appendLog("update", id, { markdownPath })
    return next
  }

  async forgetRecord(id: string, reason = "User requested deletion."): Promise<MatterhornMemoryForgetResult> {
    await this.initialize()
    assertSafeMemoryId(id)
    const index = await this.readIndex()
    const entry = index.entries[id]
    if (!entry) {
      return { id, forgotten: false, reason: "Memory record was not found." }
    }

    await rm(entry.markdownPath, { force: true })
    entry.deleted = true
    await this.writeIndex(index)
    await this.appendLog("forget", id, { reason })
    return { id, forgotten: true, reason }
  }

  async purgeWorkspace(workspaceId: string): Promise<MatterhornMemoryWorkspacePurgeResult> {
    await this.initialize()
    if (!SAFE_MEMORY_ID_PATTERN.test(workspaceId)) {
      throw new Error("Workspace id contains unsupported characters.")
    }
    const workspaceTag = `workspace:${workspaceId}`.toLowerCase()
    const index = await this.readIndex()
    const inbox = await this.readSuggestionInbox()
    const recordIds = Object.values(index.entries)
      .filter((entry) => entry.record.tags.some((tag) => tag.toLowerCase() === workspaceTag))
      .map((entry) => entry.record.id)
    const suggestionIds = Object.values(inbox.entries)
      .filter((entry) => entry.suggestion.proposedRecord.tags.some((tag) => tag.toLowerCase() === workspaceTag))
      .map((entry) => entry.id)
    const deletedIds = new Set([...recordIds, ...suggestionIds])

    for (const recordId of recordIds) {
      const entry = index.entries[recordId]
      if (entry) await rm(entry.markdownPath, { force: true })
      delete index.entries[recordId]
    }
    for (const suggestionId of suggestionIds) {
      delete inbox.entries[suggestionId]
    }
    await this.writeIndex(index)
    await this.writeSuggestionInbox(inbox)

    try {
      const lines = (await readFile(this.logPath, "utf8")).split("\n")
      const retained = lines.filter((line) => {
        if (!line.trim()) return false
        try {
          const parsed = JSON.parse(line) as { id?: unknown }
          return typeof parsed.id !== "string" || !deletedIds.has(parsed.id)
        } catch {
          return true
        }
      })
      await writeFile(this.logPath, retained.length ? `${retained.join("\n")}\n` : "", "utf8")
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }

    return {
      workspaceId,
      deletedRecords: recordIds.length,
      deletedSuggestions: suggestionIds.length,
    }
  }

  async exportBundle(outputDir: string): Promise<MatterhornMemoryExportResult> {
    await this.initialize()
    await mkdir(outputDir, { recursive: true })
    const records = (await this.listAllRecords()).filter((record) => recordCanExportByDeskPolicy(record))
    const manifest = {
      version: MATTERHORN_MEMORY_VAULT_VERSION,
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      safety: {
        publicOrUserApprovedOnly: true,
        includesSecrets: false,
        includesRawSignatures: false,
        includesSignedPayloads: false,
        includesWalletExports: false,
      },
    }

    const manifestPath = path.join(outputDir, "matterhorn-memory-export-manifest.json")
    const recordsPath = path.join(outputDir, "matterhorn-memory-records.json")
    const sha256Path = path.join(outputDir, "matterhorn-memory-export.sha256")

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    await writeFile(recordsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8")
    const sha256 = sha256Hex(await readFile(recordsPath, "utf8"))
    await writeFile(sha256Path, `${sha256}  matterhorn-memory-records.json\n`, "utf8")
    await this.appendLog("export", "memory-export", { outputDir, recordCount: records.length, sha256 })

    return {
      version: MATTERHORN_MEMORY_VAULT_VERSION,
      outputDir,
      manifestPath,
      recordsPath,
      sha256Path,
      recordCount: records.length,
      sha256,
    }
  }

  private assertSafe(record: MatterhornMemoryRecord): void {
    assertSafeMemoryId(record.id)
    const redaction = redactForbiddenMemorySecrets(record)
    if (redaction.redacted) {
      throw new Error(redaction.reason)
    }
    const validation = validateMemorySafety(record)
    if (!validation.ok) {
      throw new Error(`Memory record failed safety validation: ${validation.errors.join("; ")}`)
    }
    if (record.sensitivity === "forbidden_secret") {
      throw new Error("forbidden_secret records cannot be written to the Matterhorn memory vault")
    }
    assertMemoryDeskPolicy(record)
  }

  private markdownPathForRecord(record: MatterhornMemoryRecord): string {
    assertSafeMemoryId(record.id)
    return path.join(this.rootDir, folderForRecord(record), `${record.id}-${slugify(record.title)}.md`)
  }

  private async readIndex(): Promise<MatterhornMemoryIndex> {
    let raw: string
    try {
      raw = await readFile(this.indexPath, "utf8")
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw new Error(`Could not read Matterhorn memory index: ${formatError(error)}`)
      }
      return emptyIndex()
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Could not read Matterhorn memory index: JSON is corrupt. ${formatError(error)}`)
    }

    if (!isPlainObject(parsed)) {
      throw new Error("Could not read Matterhorn memory index: expected a JSON object.")
    }
    const index = parsed as unknown as MatterhornMemoryIndex
    if (index.version !== MATTERHORN_MEMORY_INDEX_VERSION) {
      throw new Error(`Could not read Matterhorn memory index: unsupported version ${String(index.version)}`)
    }
    if (!isPlainObject(index.entries)) {
      throw new Error("Could not read Matterhorn memory index: entries must be a JSON object.")
    }
    for (const [id, entry] of Object.entries(index.entries)) {
      assertSafeMemoryId(id)
      if (!isPlainObject(entry) || !isPlainObject(entry.record)) {
        throw new Error(`Could not read Matterhorn memory index: malformed entry ${id}.`)
      }
      assertSafeMemoryId(entry.record.id)
    }
    return index
  }

  private async writeIndex(index: MatterhornMemoryIndex): Promise<void> {
    index.updatedAt = new Date().toISOString()
    await writeJsonAtomic(this.indexPath, index)
  }

  private async readSuggestionInbox(): Promise<MatterhornMemorySuggestionInbox> {
    let raw: string
    try {
      raw = await readFile(this.suggestionInboxPath, "utf8")
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw new Error(`Could not read Matterhorn memory suggestion inbox: ${formatError(error)}`)
      }
      return emptySuggestionInbox()
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Could not read Matterhorn memory suggestion inbox: JSON is corrupt. ${formatError(error)}`)
    }

    if (!isPlainObject(parsed)) {
      throw new Error("Could not read Matterhorn memory suggestion inbox: expected a JSON object.")
    }
    const inbox = parsed as unknown as MatterhornMemorySuggestionInbox
    if (inbox.version !== MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION) {
      throw new Error(`Could not read Matterhorn memory suggestion inbox: unsupported version ${String(inbox.version)}`)
    }
    if (!isPlainObject(inbox.entries)) {
      throw new Error("Could not read Matterhorn memory suggestion inbox: entries must be a JSON object.")
    }
    return inbox
  }

  private async writeSuggestionInbox(inbox: MatterhornMemorySuggestionInbox): Promise<void> {
    inbox.updatedAt = new Date().toISOString()
    await writeJsonAtomic(this.suggestionInboxPath, inbox)
  }

  private async appendLog(action: MemoryLogAction, id: string, details: Record<string, unknown>): Promise<void> {
    await writeFile(
      this.logPath,
      `${JSON.stringify({
        version: MATTERHORN_MEMORY_VAULT_VERSION,
        action,
        id,
        at: new Date().toISOString(),
        details,
      })}\n`,
      { encoding: "utf8", flag: "a" },
    )
  }
}

function applySuggestionResolution(
  suggestion: MatterhornMemorySuggestion,
  options: MatterhornMemorySuggestionResolveOptions,
): MatterhornMemorySuggestion {
  const userAction = coerceSuggestionUserAction(options.action, suggestion.userAction)
  const patch = options.patch
  if (!patch) {
    return { ...suggestion, userAction }
  }

  const {
    id: _ignoredId,
    createdAt: _ignoredCreatedAt,
    ...safePatch
  } = patch as Partial<MatterhornMemoryRecord> & { id?: string; createdAt?: string }

  return {
    ...suggestion,
    userAction,
    proposedRecord: {
      ...suggestion.proposedRecord,
      ...safePatch,
      id: suggestion.proposedRecord.id,
      createdAt: suggestion.proposedRecord.createdAt,
      updatedAt: safePatch.updatedAt ?? new Date().toISOString(),
      body: safePatch.body ?? suggestion.proposedRecord.body,
      links: safePatch.links ?? suggestion.proposedRecord.links,
      tags: safePatch.tags ?? suggestion.proposedRecord.tags,
      provenance: safePatch.provenance ?? suggestion.proposedRecord.provenance,
    },
  }
}

function coerceSuggestionUserAction(
  action: MatterhornMemorySuggestionAction | undefined,
  fallback: MatterhornMemorySuggestionUserAction,
): MatterhornMemorySuggestionUserAction {
  if (action === "confirm" || action === "edit" || action === "dismiss") {
    return action
  }
  return fallback
}

function assertMemoryDeskPolicy(record: MatterhornMemoryRecord): void {
  const desk = detectMemoryDeskFromRecord(record)
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk]
  const validation = validateMemoryRecordAgainstDeskPolicy(record, desk)
  if (!validation.ok) {
    throw new Error(`Memory record failed desk policy validation: ${validation.errors.join("; ")}`)
  }
  if (record.canUseInChat && !policy.canUseInChat) {
    throw new Error(`Memory record enables chat use but ${desk} policy forbids chat use`)
  }
  if (record.canExport && !policy.canExport) {
    throw new Error(`Memory record enables export but ${desk} policy forbids export`)
  }
}

function recordCanExportByDeskPolicy(record: MatterhornMemoryRecord): boolean {
  const desk = detectMemoryDeskFromRecord(record)
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk]
  const validation = validateMemoryRecordAgainstDeskPolicy(record, desk)
  return record.canExport && policy.canExport && validation.ok && record.sensitivity !== "forbidden_secret"
}

export function createMatterhornMemoryVault(rootDir: string): MatterhornMemoryVault {
  return new MatterhornMemoryVault({ rootDir })
}

export function renderMemoryMarkdown(record: MatterhornMemoryRecord): string {
  const frontmatter = {
    id: record.id,
    kind: record.kind,
    scope: record.scope,
    sensitivity: record.sensitivity,
    source: record.provenance.source,
    confidence: record.provenance.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    tags: record.tags,
    canUseInChat: record.canUseInChat,
    canExport: record.canExport,
    canDelete: record.canDelete,
  }

  return [
    "---",
    toYaml(frontmatter),
    "---",
    "",
    `# ${record.title}`,
    "",
    record.summary,
    "",
    "## Why Remembered",
    "",
    record.provenance.reasonRemembered,
    "",
    "## Body",
    "",
    "```json",
    JSON.stringify(record.body, null, 2),
    "```",
    "",
    "## Links",
    "",
    ...(record.links.length
      ? record.links.map((link) => `- [${link.title ?? link.rel}](${link.href})`)
      : ["- None"]),
    "",
  ].join("\n")
}

function emptyIndex(): MatterhornMemoryIndex {
  return {
    version: MATTERHORN_MEMORY_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  }
}

function emptySuggestionInbox(): MatterhornMemorySuggestionInbox {
  return {
    version: MATTERHORN_MEMORY_SUGGESTION_INBOX_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  }
}

function assertSafeMemoryId(id: string): void {
  if (
    typeof id !== "string" ||
    !id ||
    id === "." ||
    id === ".." ||
    !SAFE_MEMORY_ID_PATTERN.test(id)
  ) {
    throw new Error("Invalid memory record id. Use only letters, numbers, periods, underscores, and dashes.")
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await rename(tempPath, filePath)
}

function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function folderForRecord(record: MatterhornMemoryRecord): string {
  const tags = record.tags.map((tag) => tag.toLowerCase())
  if (tags.includes("bittensor")) return "Protocols/Bittensor"
  if (tags.includes("hyperliquid")) return "Protocols/Hyperliquid"
  if (tags.includes("polymarket")) return "Protocols/Polymarket"
  if (tags.includes("wellness") || tags.includes("longevity") || record.kind === "client_profile") return "Longevity"

  switch (record.kind) {
    case "watchlist":
      return "Watchlists"
    case "receipt":
      return "Receipts"
    case "workflow_artifact":
      return "Workflows"
    case "decision":
      return "Decisions"
    case "connector_preference":
    case "mcp_tool_preference":
      return "Sources"
    default:
      return "Projects"
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return slug || "memory"
}

function toYaml(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, item]) => {
      if (Array.isArray(item)) {
        if (item.length === 0) return `${key}: []`
        return [`${key}:`, ...item.map((entry) => `  - ${String(entry)}`)].join("\n")
      }
      if (typeof item === "string") {
        return `${key}: ${JSON.stringify(item)}`
      }
      return `${key}: ${String(item)}`
    })
    .join("\n")
}
