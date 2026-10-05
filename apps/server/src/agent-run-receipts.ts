import { readdir, rm } from "node:fs/promises";
import { closeSync, constants, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  MatterhornAgentCapabilityDecision,
  MatterhornAgentPrivacyPreflightResponse,
  MatterhornAgentRunReceipt,
  MatterhornAgentToolReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = RETENTION_DAYS * DAY_MS;

function dataRoot(): string {
  const override = process.env.MATTERHORN_WORK_DATA_DIR?.trim() || process.env.OPENWORK_DATA_DIR?.trim();
  if (override) return override.startsWith("~/") ? join(homedir(), override.slice(2)) : override;
  return join(homedir(), ".openwork", "openwork-server");
}

function safeWorkspaceId(workspaceId: string): string {
  return workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function agentSecurityReceiptDirectory(workspaceId: string): string {
  return join(dataRoot(), "security-receipts", safeWorkspaceId(workspaceId));
}

function receiptPath(workspaceId: string, date: Date): string {
  return join(agentSecurityReceiptDirectory(workspaceId), `${dayKey(date)}.jsonl`);
}

function recordHash(receipt: MatterhornAgentRunReceipt): string {
  return sha256({
    ...receipt,
    integrity: { previousHash: receipt.integrity.previousHash, recordHash: "" },
  });
}

function fileBytes(path: string): Buffer {
  try { return readFileSync(path); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return Buffer.alloc(0);
    throw error;
  }
}

function bytesHash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

type ReceiptAppendIntent = {
  version: 1;
  writtenAt: string;
  prefixBytes: number;
  prefixHash: string;
  previousIndexHash: string;
  receipt: MatterhornAgentRunReceipt;
};

function receiptIndexValue(receipt: MatterhornAgentRunReceipt) {
  return { runId: receipt.runId, workspaceId: receipt.workspaceId, sessionId: receipt.sessionId,
    receiptId: receipt.id, status: receipt.status, recordHash: receipt.integrity.recordHash, completedAt: receipt.completedAt };
}

export type StartAgentRunReceiptInput = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  preflight: MatterhornAgentPrivacyPreflightResponse;
  consentUsed: boolean;
  memoryReadIds?: string[];
  context?: MatterhornAgentRunReceipt["context"];
  contextOptimization?: MatterhornAgentRunReceipt["contextOptimization"];
  toolCallBudget?: MatterhornAgentRunReceipt["usage"]["toolCallBudget"];
  now?: Date;
};

function boundedReceiptMetric(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) {
    throw new Error("agent_run_context_optimization_invalid");
  }
  return value;
}

function normalizeContextOptimization(
  value: MatterhornAgentRunReceipt["contextOptimization"],
): MatterhornAgentRunReceipt["contextOptimization"] {
  if (!value) return undefined;
  const compilerVersion = value.compilerVersion.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(compilerVersion)) {
    throw new Error("agent_run_context_optimization_invalid");
  }
  const normalized = {
    compilerVersion,
    systemChars: boundedReceiptMetric(value.systemChars),
    policyChars: boundedReceiptMetric(value.policyChars),
    dataChars: boundedReceiptMetric(value.dataChars),
    activeCryptoTools: boundedReceiptMetric(value.activeCryptoTools),
    availableCryptoTools: boundedReceiptMetric(value.availableCryptoTools),
    activeToolSchemaChars: boundedReceiptMetric(value.activeToolSchemaChars),
    availableToolSchemaChars: boundedReceiptMetric(value.availableToolSchemaChars),
    dataSectionsIncluded: boundedReceiptMetric(value.dataSectionsIncluded),
    dataSectionsShortened: boundedReceiptMetric(value.dataSectionsShortened),
    dataSectionsOmitted: boundedReceiptMetric(value.dataSectionsOmitted),
  };
  const contextLengthMatches = normalized.dataChars === 0
    ? normalized.systemChars === normalized.policyChars
    : normalized.systemChars === normalized.policyChars + normalized.dataChars + 2;
  if (
    !contextLengthMatches
    || normalized.activeCryptoTools > normalized.availableCryptoTools
    || normalized.activeToolSchemaChars > normalized.availableToolSchemaChars
    || normalized.dataSectionsShortened > normalized.dataSectionsIncluded
  ) {
    throw new Error("agent_run_context_optimization_invalid");
  }
  return normalized;
}

export class AgentRunReceiptIntegrityError extends Error {
  readonly code = "agent_run_receipt_integrity_failed";

  constructor(readonly workspaceId: string, readonly file: string) {
    super("Matterhorn detected a damaged or tampered security receipt chain.");
  }
}

export async function purgeAllExpiredAgentRunReceipts(
  store: MatterhornAgentRunReceiptStore,
  now = new Date(),
): Promise<{ workspaces: number; files: number }> {
  const root = join(dataRoot(), "security-receipts");
  let workspaces: string[];
  try {
    workspaces = await readdir(root);
  } catch {
    return { workspaces: 0, files: 0 };
  }
  let checked = 0;
  let files = 0;
  for (const workspaceId of workspaces.filter((entry) => /^[a-zA-Z0-9_-]{1,160}$/.test(entry))) {
    checked += 1;
    files += await store.purgeExpired(workspaceId, now);
  }
  return { workspaces: checked, files };
}

export class MatterhornAgentRunReceiptStore {
  private readonly latest = new Map<string, MatterhornAgentRunReceipt>();
  private readonly previousHashes = new Map<string, string>();
  private readonly writeQueues = new Map<string, Promise<void>>();
  private readonly receiptIndexState: MatterhornDurableAuthorizedState | null;
  private readonly appendIntentState: MatterhornDurableAuthorizedState | null;

  constructor(
    private readonly stateStore?: MatterhornGuardedRuntimeStateStore,
    authority?: MatterhornDurableStateAuthority,
  ) {
    this.receiptIndexState = stateStore && authority
      ? new MatterhornDurableAuthorizedState(
        stateStore,
        authority,
        "receipt_index",
        "agent_run_receipt_index_invalid",
      )
      : null;
    this.appendIntentState = stateStore && authority
      ? new MatterhornDurableAuthorizedState(stateStore, authority, "receipt_append_intent", "agent_run_receipt_intent_invalid")
      : null;
  }

  async start(input: StartAgentRunReceiptInput): Promise<MatterhornAgentRunReceipt> {
    const now = input.now ?? new Date();
    const receipt: MatterhornAgentRunReceipt = {
      version: "matterhorn.agent-run-receipt.v1",
      id: `run_receipt_${input.runId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      runId: input.runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      status: "pending",
      startedAt: now.toISOString(),
      completedAt: null,
      responseDurationMs: null,
      provider: {
        id: input.preflight.provider.id,
        name: input.preflight.provider.name,
        modelId: input.preflight.provider.modelId,
        privacyStatus: input.preflight.provider.privacyStatus,
        trainingUse: input.preflight.provider.trainingUse,
        retentionDays: input.preflight.provider.retentionDays,
        policyUrl: input.preflight.provider.policyUrl,
      },
      privacy: {
        requestHash: input.preflight.requestHash,
        mode: input.preflight.effectiveMode,
        dataCategories: input.preflight.detectedData.categories,
        redactionCount: input.preflight.detectedData.redactionCount,
        consent: input.consentUsed ? "single_request" : "not_required",
        dataLeavesMatterhorn: input.preflight.provider.dataLeavesMatterhorn,
      },
      ...(input.context ? {
        context: {
          chatFiles: Math.max(0, Math.floor(input.context.chatFiles)),
          coworkerFiles: Math.max(0, Math.floor(input.context.coworkerFiles)),
          savedMemories: Math.max(0, Math.floor(input.context.savedMemories)),
        },
      } : {}),
      ...(input.contextOptimization ? {
        contextOptimization: normalizeContextOptimization(input.contextOptimization),
      } : {}),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCostUsd: 0,
        toolCallBudget: input.toolCallBudget
          ? { ...input.toolCallBudget, submits: 0 }
          : { reads: 12, preparesPerFamily: 1, submits: 0 },
      },
      tools: [],
      memory: { readIds: [...new Set(input.memoryReadIds ?? [])].sort(), writtenIds: [] },
      capabilities: [],
      reviewedActions: [],
      integrity: { previousHash: this.previousHashes.get(input.workspaceId) ?? null, recordHash: "" },
    };
    await this.write(input.workspaceId, () => {
      if (this.latest.has(receipt.runId)) throw new Error("agent_run_receipt_already_exists");
      return receipt;
    }, now);
    return structuredClone(receipt);
  }

  async recordTool(input: {
    runId: string;
    tool: MatterhornAgentToolReceipt;
    capabilityDecisions?: MatterhornAgentCapabilityDecision[];
    now?: Date;
  }): Promise<void> {
    await this.mutate(input.runId, (receipt) => {
      receipt.tools = [...receipt.tools, input.tool].slice(-100);
      if (input.capabilityDecisions) receipt.capabilities = input.capabilityDecisions.slice(-100);
    }, input.now ?? new Date());
  }

  async addReviewedAction(input: {
    runId: string;
    intentHash: string;
    policyHash: string;
    simulationReference: string;
    publicReceipt?: string | null;
    now?: Date;
  }): Promise<void> {
    await this.mutate(input.runId, (receipt) => {
      receipt.reviewedActions = [...receipt.reviewedActions.filter((item) => item.intentHash !== input.intentHash), {
        intentHash: input.intentHash,
        policyHash: input.policyHash,
        simulationReference: input.simulationReference,
        publicReceipt: input.publicReceipt ?? null,
      }].slice(-20);
    }, input.now ?? new Date());
  }

  async recordMemoryWrite(input: { runId: string; memoryId: string; now?: Date }): Promise<void> {
    await this.mutate(input.runId, (receipt) => {
      receipt.memory.writtenIds = [...new Set([...receipt.memory.writtenIds, input.memoryId])].sort();
    }, input.now ?? new Date());
  }

  async complete(input: {
    runId: string;
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">;
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>;
    memoryWrittenIds?: string[];
    capabilityDecisions?: MatterhornAgentCapabilityDecision[];
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    await this.mutate(input.runId, (receipt) => {
      // The first terminal outcome closes execution. A delayed usage report is
      // not a new run or permission to turn a cancelled/error run into success.
      if (receipt.status === "pending") {
        receipt.status = input.status;
        receipt.completedAt = now.toISOString();
        receipt.responseDurationMs = Math.max(0, now.getTime() - Date.parse(receipt.startedAt));
      }
      if (input.usage) {
        // Runtime reports are cumulative snapshots without revision ordering.
        // Accept later observed usage, but never subtract on an older replay.
        receipt.usage = {
          ...receipt.usage,
          inputTokens: Math.max(receipt.usage.inputTokens, input.usage.inputTokens ?? 0),
          outputTokens: Math.max(receipt.usage.outputTokens, input.usage.outputTokens ?? 0),
          reasoningTokens: Math.max(receipt.usage.reasoningTokens, input.usage.reasoningTokens ?? 0),
          cacheReadTokens: Math.max(receipt.usage.cacheReadTokens, input.usage.cacheReadTokens ?? 0),
          cacheWriteTokens: Math.max(receipt.usage.cacheWriteTokens, input.usage.cacheWriteTokens ?? 0),
          estimatedCostUsd: Math.max(receipt.usage.estimatedCostUsd, input.usage.estimatedCostUsd ?? 0),
        };
      }
      if (input.memoryWrittenIds) receipt.memory.writtenIds = [...new Set(input.memoryWrittenIds)].sort();
      if (input.capabilityDecisions) receipt.capabilities = input.capabilityDecisions.slice(-100);
    }, now);
  }

  async get(workspaceId: string, runId: string): Promise<MatterhornAgentRunReceipt | null> {
    await this.load(workspaceId);
    const receipt = this.latest.get(runId);
    return receipt?.workspaceId === workspaceId ? structuredClone(receipt) : null;
  }

  async list(workspaceId: string, input: { sessionId?: string; limit?: number } = {}): Promise<MatterhornAgentRunReceipt[]> {
    await this.load(workspaceId);
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    return [...this.latest.values()]
      .filter((receipt) => receipt.workspaceId === workspaceId && (!input.sessionId || receipt.sessionId === input.sessionId))
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
      .slice(0, limit)
      .map((receipt) => structuredClone(receipt));
  }

  async purgeExpired(workspaceId: string, now = new Date()): Promise<number> {
    this.stateStore?.deleteExpired(now.getTime());
    const directory = agentSecurityReceiptDirectory(workspaceId);
    let files: string[];
    try {
      files = await readdir(directory);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const file of files) {
      const match = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file);
      if (!match) continue;
      const timestamp = Date.parse(`${match[1]}T00:00:00.000Z`);
      if (!Number.isFinite(timestamp) || now.getTime() - (timestamp + DAY_MS) < RETENTION_MS) continue;
      await rm(join(directory, file), { force: true });
      removed += 1;
    }
    for (const [runId, receipt] of this.latest) {
      if (receipt.workspaceId !== workspaceId) continue;
      const timestamp = Date.parse(receipt.completedAt ?? receipt.startedAt);
      if (Number.isFinite(timestamp) && now.getTime() - timestamp > RETENTION_MS) {
        this.latest.delete(runId);
        if (this.receiptIndexState) this.receiptIndexState.delete(runId);
        else this.stateStore?.delete("receipt_index", runId);
      }
    }
    return removed;
  }

  private async load(workspaceId: string, now = new Date()): Promise<void> {
    await this.writeQueues.get(workspaceId);
    this.transaction(() => {
      this.recoverAppend(workspaceId, now);
      this.loadFiles(workspaceId, now);
    });
  }

  private loadFiles(workspaceId: string, now: Date): void {
    const directory = agentSecurityReceiptDirectory(workspaceId);
    let files: string[];
    try {
      files = readdirSync(directory).filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)).sort();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      files = [];
    }
    const loaded = new Map<string, MatterhornAgentRunReceipt>();
    const nowMs = now.getTime();
    let expectedPreviousHash: string | null | undefined;
    for (const file of files) {
      const day = Date.parse(`${file.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isFinite(day) && nowMs - (day + DAY_MS) >= RETENTION_MS) continue;
      const text = readFileSync(join(directory, file), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new AgentRunReceiptIntegrityError(workspaceId, file);
          }
          const receipt = parsed as MatterhornAgentRunReceipt;
          if (receipt.version !== "matterhorn.agent-run-receipt.v1" || receipt.workspaceId !== workspaceId) {
            throw new AgentRunReceiptIntegrityError(workspaceId, file);
          }
          if (!receipt.integrity || recordHash(receipt) !== receipt.integrity.recordHash) {
            throw new AgentRunReceiptIntegrityError(workspaceId, file);
          }
          if (expectedPreviousHash !== undefined && receipt.integrity.previousHash !== expectedPreviousHash) {
            throw new AgentRunReceiptIntegrityError(workspaceId, file);
          }
          // The oldest retained segment can legitimately point at an expired segment.
          expectedPreviousHash = receipt.integrity.recordHash;
          const current = loaded.get(receipt.runId);
          if (!current || Date.parse(receipt.completedAt ?? receipt.startedAt) >= Date.parse(current.completedAt ?? current.startedAt)) {
            loaded.set(receipt.runId, receipt);
          }
        } catch (error) {
          if (error instanceof AgentRunReceiptIntegrityError) throw error;
          throw new AgentRunReceiptIntegrityError(workspaceId, file);
        }
      }
    }
    for (const [runId, receipt] of loaded) {
      if (nowMs - Date.parse(receipt.completedAt ?? receipt.startedAt) >= RETENTION_MS) {
        loaded.delete(runId);
        continue;
      }
      const index = this.receiptIndexState?.getRecord<unknown>(runId, nowMs);
      if (this.receiptIndexState && (!index || index.workspaceId !== workspaceId || index.sessionId !== receipt.sessionId
        || canonicalJson(index.value) !== canonicalJson(receiptIndexValue(receipt)))) {
        throw new Error("agent_run_receipt_index_invalid");
      }
    }
    if (this.receiptIndexState) {
      for (const record of this.receiptIndexState.listRecords({ workspaceId, nowMs })) {
        if (!loaded.has(record.key)) throw new Error("agent_run_receipt_index_invalid");
      }
    }
    for (const [runId, receipt] of this.latest) {
      if (receipt.workspaceId === workspaceId) this.latest.delete(runId);
    }
    for (const [runId, receipt] of loaded) this.latest.set(runId, receipt);
    if (expectedPreviousHash) this.previousHashes.set(workspaceId, expectedPreviousHash);
    else this.previousHashes.delete(workspaceId);
  }

  private transaction<T>(callback: () => T): T {
    return this.stateStore ? this.stateStore.transaction(callback) : callback();
  }

  private async mutate(runId: string, update: (receipt: MatterhornAgentRunReceipt) => void, now: Date): Promise<void> {
    const workspaceId = this.latest.get(runId)?.workspaceId;
    if (!workspaceId) return;
    await this.write(workspaceId, () => {
      const current = this.latest.get(runId);
      if (!current || current.workspaceId !== workspaceId) throw new Error("agent_run_receipt_unavailable");
      const receipt = structuredClone(current);
      update(receipt);
      return receipt;
    }, now);
  }

  private async write(workspaceId: string, prepare: () => MatterhornAgentRunReceipt, now: Date): Promise<void> {
    const previous = this.writeQueues.get(workspaceId) ?? Promise.resolve();
    const next = previous.then(async () => {
      // The journal commits before file IO. SQLite also serializes separate
      // receipt-store instances sharing this database; never await inside it.
      const snapshot = this.transaction(() => {
        this.recoverAppend(workspaceId, now);
        this.loadFiles(workspaceId, now);
        const snapshot = prepare();
        const prior = this.latest.get(snapshot.runId);
        const index = this.receiptIndexState?.getRecord<{ recordHash: string }>(snapshot.runId, now.getTime()) ?? null;
        if (this.receiptIndexState && (prior?.integrity.recordHash ?? null) !== (index?.value.recordHash ?? null)) {
          throw new Error("agent_run_receipt_index_invalid");
        }
        snapshot.integrity = { previousHash: this.previousHashes.get(workspaceId) ?? null, recordHash: "" };
        snapshot.integrity.recordHash = recordHash(snapshot);
        const prefix = fileBytes(receiptPath(workspaceId, now));
        if (prefix.length && prefix.at(-1) !== 10) throw new AgentRunReceiptIntegrityError(workspaceId, dayKey(now));
        const intent: ReceiptAppendIntent = { version: 1, writtenAt: now.toISOString(), prefixBytes: prefix.length,
          prefixHash: bytesHash(prefix), previousIndexHash: sha256(index), receipt: snapshot };
        if (this.appendIntentState) {
          this.appendIntentState.put({ key: workspaceId, workspaceId, sessionId: snapshot.sessionId,
            value: intent, expiresAtMs: now.getTime() + RETENTION_MS, nowMs: now.getTime() });
        } else {
          this.finishAppend(intent);
        }
        return snapshot;
      });
      // Retain only the identity needed for a caller's error-finalization path.
      // Every mutation/read reloads authenticated disk state before using it.
      this.latest.set(snapshot.runId, snapshot);
      this.transaction(() => this.recoverAppend(workspaceId, now));
      this.loadFiles(workspaceId, now);
      await this.purgeExpired(workspaceId, now);
    });
    this.writeQueues.set(workspaceId, next.catch(() => undefined));
    await next;
  }

  private recoverAppend(workspaceId: string, now: Date): void {
    const record = this.appendIntentState?.getRecord<ReceiptAppendIntent>(workspaceId, now.getTime());
    if (!record) return;
    const intent = record.value;
    const receipt = intent?.receipt;
    if (!intent || intent.version !== 1 || Object.keys(intent).sort().join(",") !== "prefixBytes,prefixHash,previousIndexHash,receipt,version,writtenAt"
      || typeof intent.writtenAt !== "string" || Date.parse(intent.writtenAt) !== record.updatedAtMs
      || new Date(record.updatedAtMs).toISOString() !== intent.writtenAt
      || record.workspaceId !== workspaceId || record.key !== workspaceId
      || record.expiresAtMs !== record.updatedAtMs + RETENTION_MS
      || !Number.isSafeInteger(intent.prefixBytes) || intent.prefixBytes < 0
      || !/^[a-f0-9]{64}$/.test(intent.prefixHash) || !/^[a-f0-9]{64}$/.test(intent.previousIndexHash)
      || !receipt || receipt.version !== "matterhorn.agent-run-receipt.v1"
      || receipt.workspaceId !== workspaceId || receipt.sessionId !== record.sessionId
      || typeof receipt.runId !== "string" || !receipt.runId
      || receipt.id !== `run_receipt_${receipt.runId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
      || !receipt.integrity || receipt.integrity.recordHash !== recordHash(receipt)) {
      throw new Error("agent_run_receipt_intent_invalid");
    }
    const index = this.receiptIndexState?.getRecord<unknown>(receipt.runId, now.getTime()) ?? null;
    if (sha256(index) !== intent.previousIndexHash) throw new Error("agent_run_receipt_intent_invalid");
    this.finishAppend(intent);
    this.appendIntentState?.delete(workspaceId);
  }

  private finishAppend(intent: ReceiptAppendIntent): void {
    const snapshot = intent.receipt;
    const now = new Date(intent.writtenAt);
    const directory = agentSecurityReceiptDirectory(snapshot.workspaceId);
    const path = receiptPath(snapshot.workspaceId, now);
    const bytes = fileBytes(path);
    const line = Buffer.from(`${canonicalJson(snapshot)}\n`);
    const suffix = bytes.subarray(intent.prefixBytes);
    if (bytes.length < intent.prefixBytes || bytesHash(bytes.subarray(0, intent.prefixBytes)) !== intent.prefixHash
      || suffix.length > line.length || !suffix.equals(line.subarray(0, suffix.length))) {
      throw new AgentRunReceiptIntegrityError(snapshot.workspaceId, path);
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      let offset = suffix.length;
      while (offset < line.length) {
        const written = writeSync(fd, line, offset, line.length - offset);
        if (!written) throw new Error("agent_run_receipt_write_incomplete");
        offset += written;
      }
      fsyncSync(fd);
    } finally { closeSync(fd); }
    const directoryFd = openSync(directory, constants.O_RDONLY);
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    const index = { key: snapshot.runId, workspaceId: snapshot.workspaceId, sessionId: snapshot.sessionId,
      value: receiptIndexValue(snapshot),
      expiresAtMs: Date.parse(snapshot.completedAt ?? snapshot.startedAt) + RETENTION_MS, nowMs: now.getTime() };
    if (this.receiptIndexState) this.receiptIndexState.put(index);
    else this.stateStore?.put({ kind: "receipt_index", ...index });
  }
}
