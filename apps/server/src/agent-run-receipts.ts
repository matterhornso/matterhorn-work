import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  MatterhornAgentCapabilityDecision,
  MatterhornAgentPrivacyPreflightResponse,
  MatterhornAgentRunReceipt,
  MatterhornAgentToolReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

const RETENTION_DAYS = 365;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;

function dataRoot(): string {
  const override = process.env.OPENWORK_DATA_DIR?.trim();
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

export type StartAgentRunReceiptInput = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  preflight: MatterhornAgentPrivacyPreflightResponse;
  consentUsed: boolean;
  memoryReadIds?: string[];
  now?: Date;
};

export class MatterhornAgentRunReceiptStore {
  private readonly latest = new Map<string, MatterhornAgentRunReceipt>();
  private readonly previousHashes = new Map<string, string>();
  private readonly writeQueues = new Map<string, Promise<void>>();

  async start(input: StartAgentRunReceiptInput): Promise<MatterhornAgentRunReceipt> {
    const now = input.now ?? new Date();
    await this.load(input.workspaceId, now);
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
        mode: input.preflight.effectiveMode,
        dataCategories: input.preflight.detectedData.categories,
        redactionCount: input.preflight.detectedData.redactionCount,
        consent: input.consentUsed ? "single_request" : "not_required",
        dataLeavesMatterhorn: input.preflight.provider.dataLeavesMatterhorn,
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCostUsd: 0,
        toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 },
      },
      tools: [],
      memory: { readIds: [...new Set(input.memoryReadIds ?? [])].sort(), writtenIds: [] },
      capabilities: [],
      reviewedActions: [],
      integrity: { previousHash: this.previousHashes.get(input.workspaceId) ?? null, recordHash: "" },
    };
    receipt.integrity.recordHash = recordHash(receipt);
    this.latest.set(receipt.runId, receipt);
    await this.append(receipt, now);
    return receipt;
  }

  async recordTool(input: {
    runId: string;
    tool: MatterhornAgentToolReceipt;
    capabilityDecisions?: MatterhornAgentCapabilityDecision[];
    now?: Date;
  }): Promise<void> {
    const receipt = this.latest.get(input.runId);
    if (!receipt) return;
    receipt.tools = [...receipt.tools, input.tool].slice(-100);
    if (input.capabilityDecisions) receipt.capabilities = input.capabilityDecisions.slice(-100);
    await this.rehashAndAppend(receipt, input.now ?? new Date());
  }

  async addReviewedAction(input: {
    runId: string;
    intentHash: string;
    policyHash: string;
    simulationReference: string;
    publicReceipt?: string | null;
    now?: Date;
  }): Promise<void> {
    const receipt = this.latest.get(input.runId);
    if (!receipt) return;
    receipt.reviewedActions = [...receipt.reviewedActions.filter((item) => item.intentHash !== input.intentHash), {
      intentHash: input.intentHash,
      policyHash: input.policyHash,
      simulationReference: input.simulationReference,
      publicReceipt: input.publicReceipt ?? null,
    }].slice(-20);
    await this.rehashAndAppend(receipt, input.now ?? new Date());
  }

  async complete(input: {
    runId: string;
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">;
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>;
    memoryWrittenIds?: string[];
    capabilityDecisions?: MatterhornAgentCapabilityDecision[];
    now?: Date;
  }): Promise<void> {
    const receipt = this.latest.get(input.runId);
    if (!receipt) return;
    const now = input.now ?? new Date();
    receipt.status = input.status;
    receipt.completedAt = now.toISOString();
    receipt.responseDurationMs = Math.max(0, now.getTime() - Date.parse(receipt.startedAt));
    if (input.usage) {
      receipt.usage = {
        ...receipt.usage,
        inputTokens: Math.max(0, input.usage.inputTokens ?? receipt.usage.inputTokens),
        outputTokens: Math.max(0, input.usage.outputTokens ?? receipt.usage.outputTokens),
        reasoningTokens: Math.max(0, input.usage.reasoningTokens ?? receipt.usage.reasoningTokens),
        cacheReadTokens: Math.max(0, input.usage.cacheReadTokens ?? receipt.usage.cacheReadTokens),
        cacheWriteTokens: Math.max(0, input.usage.cacheWriteTokens ?? receipt.usage.cacheWriteTokens),
        estimatedCostUsd: Math.max(0, input.usage.estimatedCostUsd ?? receipt.usage.estimatedCostUsd),
      };
    }
    if (input.memoryWrittenIds) receipt.memory.writtenIds = [...new Set(input.memoryWrittenIds)].sort();
    if (input.capabilityDecisions) receipt.capabilities = input.capabilityDecisions.slice(-100);
    await this.rehashAndAppend(receipt, now);
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
      if (!Number.isFinite(timestamp) || now.getTime() - timestamp <= RETENTION_MS) continue;
      await rm(join(directory, file), { force: true });
      removed += 1;
    }
    for (const [runId, receipt] of this.latest) {
      if (receipt.workspaceId !== workspaceId) continue;
      const timestamp = Date.parse(receipt.completedAt ?? receipt.startedAt);
      if (Number.isFinite(timestamp) && now.getTime() - timestamp > RETENTION_MS) {
        this.latest.delete(runId);
      }
    }
    return removed;
  }

  private async load(workspaceId: string, now = new Date()): Promise<void> {
    if ([...this.latest.values()].some((receipt) => receipt.workspaceId === workspaceId)) return;
    const directory = agentSecurityReceiptDirectory(workspaceId);
    let files: string[];
    try {
      files = (await readdir(directory)).filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)).sort();
    } catch {
      return;
    }
    const nowMs = now.getTime();
    let expectedPreviousHash: string | null | undefined;
    let chainValid = true;
    for (const file of files) {
      const day = Date.parse(`${file.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isFinite(day) && nowMs - day > RETENTION_MS) continue;
      const text = await readFile(join(directory, file), "utf8").catch(() => "");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        if (!chainValid) break;
        try {
          const parsed: unknown = JSON.parse(line);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
          const receipt = parsed as MatterhornAgentRunReceipt;
          if (receipt.version !== "matterhorn.agent-run-receipt.v1" || receipt.workspaceId !== workspaceId) continue;
          if (!receipt.integrity || recordHash(receipt) !== receipt.integrity.recordHash) {
            chainValid = false;
            break;
          }
          if (expectedPreviousHash !== undefined && receipt.integrity.previousHash !== expectedPreviousHash) {
            chainValid = false;
            break;
          }
          // The oldest retained segment can legitimately point at an expired segment.
          expectedPreviousHash = receipt.integrity.recordHash;
          const current = this.latest.get(receipt.runId);
          if (!current || Date.parse(receipt.completedAt ?? receipt.startedAt) >= Date.parse(current.completedAt ?? current.startedAt)) {
            this.latest.set(receipt.runId, receipt);
          }
          this.previousHashes.set(workspaceId, receipt.integrity.recordHash);
        } catch {
          chainValid = false;
          break;
        }
      }
      if (!chainValid) break;
    }
  }

  private async rehashAndAppend(receipt: MatterhornAgentRunReceipt, now: Date): Promise<void> {
    await this.append(receipt, now);
  }

  private async append(receipt: MatterhornAgentRunReceipt, now: Date): Promise<void> {
    const workspaceId = receipt.workspaceId;
    // Capture content synchronously, then assign the chain link and hash inside
    // the serialized workspace writer. This prevents concurrent tool/session
    // completion events from calculating the same previous hash or persisting
    // a later mutation in an earlier queued record.
    const snapshot = structuredClone(receipt);
    const previous = this.writeQueues.get(workspaceId) ?? Promise.resolve();
    const next = previous.then(async () => {
      snapshot.integrity = {
        previousHash: this.previousHashes.get(workspaceId) ?? null,
        recordHash: "",
      };
      snapshot.integrity.recordHash = recordHash(snapshot);
      await mkdir(agentSecurityReceiptDirectory(workspaceId), { recursive: true, mode: 0o700 });
      await appendFile(receiptPath(workspaceId, now), `${canonicalJson(snapshot)}\n`, { encoding: "utf8", mode: 0o600 });
      this.previousHashes.set(workspaceId, snapshot.integrity.recordHash);
      receipt.integrity = structuredClone(snapshot.integrity);
      await this.purgeExpired(workspaceId, now);
    });
    this.writeQueues.set(workspaceId, next.catch(() => undefined));
    await next;
  }
}
