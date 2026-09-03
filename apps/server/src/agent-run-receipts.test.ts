import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunReceiptIntegrityError,
  MatterhornAgentRunReceiptStore,
  purgeAllExpiredAgentRunReceipts,
} from "./agent-run-receipts.js";

let root = "";
const originalDataDir = process.env.OPENWORK_DATA_DIR;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "matterhorn-guard-receipts-"));
  process.env.OPENWORK_DATA_DIR = root;
});

afterAll(async () => {
  if (originalDataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
});

function publicPreflight(workspaceId: string, sessionId: string) {
  return {
    version: "matterhorn.agent-privacy-preflight.v1" as const,
    requestHash: `hash-${workspaceId}-${sessionId}`,
    workspaceId,
    sessionId,
    requestedMode: "public_research" as const,
    effectiveMode: "public_research" as const,
    decision: "allow" as const,
    provider: {
      id: "cudos",
      name: "ASI:Cloud",
      modelId: "asi1-mini",
      privacyStatus: "unverified" as const,
      trainingUse: "unknown" as const,
      retentionDays: null,
      policyUrl: null,
      dataLeavesMatterhorn: true,
    },
    detectedData: { labels: ["public" as const], categories: [], redactionCount: 0 },
    reason: "public research",
  };
}

describe("guarded agent run receipts", () => {
  test("stores only bounded security metadata in a hash chain", async () => {
    const store = new MatterhornAgentRunReceiptStore();
    const sensitivePrompt = "do-not-store-this-prompt";
    await store.start({
      runId: "run_receipt_1",
      workspaceId: "ws_receipt",
      sessionId: "ses_receipt",
      consentUsed: false,
      preflight: {
        version: "matterhorn.agent-privacy-preflight.v1",
        requestHash: "hash-only",
        workspaceId: "ws_receipt",
        sessionId: "ses_receipt",
        requestedMode: "public_research",
        effectiveMode: "public_research",
        decision: "allow",
        provider: {
          id: "cudos",
          name: "ASI:Cloud",
          modelId: "asi1-mini",
          privacyStatus: "unverified",
          trainingUse: "unknown",
          retentionDays: null,
          policyUrl: null,
          dataLeavesMatterhorn: true,
        },
        detectedData: { labels: ["public"], categories: [], redactionCount: 0 },
        reason: sensitivePrompt,
      },
    });
    await store.complete({
      runId: "run_receipt_1",
      status: "success",
      usage: { inputTokens: 120, outputTokens: 30, estimatedCostUsd: 0.001 },
    });
    await store.recordMemoryWrite({ runId: "run_receipt_1", memoryId: "memory_saved_from_run" });
    const items = await store.list("ws_receipt");
    expect(items).toHaveLength(1);
    expect(items[0]?.usage.inputTokens).toBe(120);
    expect(items[0]?.provider).toMatchObject({ name: "ASI:Cloud", policyUrl: null });
    expect(items[0]?.privacy.requestHash).toBe("hash-only");
    expect(items[0]?.memory.writtenIds).toEqual(["memory_saved_from_run"]);
    expect(items[0]?.integrity.recordHash).toHaveLength(64);
    const files = await readFile(join(root, "security-receipts", "ws_receipt", `${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8");
    expect(files).not.toContain(sensitivePrompt);
    expect(files).toContain('"requestHash":"hash-only"');
    expect(files.trim().split("\n").length).toBe(3);
  });

  test("continues a persisted chain and rejects a tampered tail", async () => {
    const workspaceId = "ws_persisted_chain";
    const preflight = {
      version: "matterhorn.agent-privacy-preflight.v1" as const,
      requestHash: "hash-first",
      workspaceId,
      sessionId: "ses_chain",
      requestedMode: "public_research" as const,
      effectiveMode: "public_research" as const,
      decision: "allow" as const,
      provider: {
        id: "cudos",
        name: "ASI:Cloud",
        modelId: "asi1-mini",
        privacyStatus: "unverified" as const,
        trainingUse: "unknown" as const,
        retentionDays: null,
        policyUrl: null,
        dataLeavesMatterhorn: true,
      },
      detectedData: { labels: ["public" as const], categories: [], redactionCount: 0 },
      reason: "public research",
    };
    const first = new MatterhornAgentRunReceiptStore();
    await first.start({
      runId: "run_first",
      workspaceId,
      sessionId: "ses_chain",
      consentUsed: false,
      preflight,
    });
    const day = new Date().toISOString().slice(0, 10);
    const path = join(root, "security-receipts", workspaceId, `${day}.jsonl`);
    const firstRecord = JSON.parse((await readFile(path, "utf8")).trim());

    const second = new MatterhornAgentRunReceiptStore();
    await second.start({
      runId: "run_second",
      workspaceId,
      sessionId: "ses_chain",
      consentUsed: false,
      preflight: { ...preflight, requestHash: "hash-second" },
    });
    const records = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(records[1].integrity.previousHash).toBe(records[0].integrity.recordHash);

    const tampered = structuredClone(records[1]);
    tampered.usage.inputTokens = 999_999;
    await writeFile(path, `${JSON.stringify(records[0])}\n${JSON.stringify(tampered)}\n`, "utf8");
    const reloaded = new MatterhornAgentRunReceiptStore();
    await expect(reloaded.list(workspaceId)).rejects.toBeInstanceOf(AgentRunReceiptIntegrityError);
  });

  test("reconciles a public wallet receipt onto one intent without crossing workspaces", async () => {
    const store = new MatterhornAgentRunReceiptStore();
    await store.start({
      runId: "run_wallet_receipt",
      workspaceId: "ws_wallet_receipt",
      sessionId: "ses_wallet_receipt",
      consentUsed: false,
      preflight: publicPreflight("ws_wallet_receipt", "ses_wallet_receipt"),
    });
    await store.addReviewedAction({
      runId: "run_wallet_receipt",
      intentHash: "intent_hash",
      policyHash: "policy_hash",
      simulationReference: "simulation_reference",
    });
    await store.addReviewedAction({
      runId: "run_wallet_receipt",
      intentHash: "intent_hash",
      policyHash: "policy_hash",
      simulationReference: "simulation_reference",
      publicReceipt: "chain:transaction_digest",
    });

    const receipt = await store.get("ws_wallet_receipt", "run_wallet_receipt");
    expect(receipt?.reviewedActions).toEqual([{
      intentHash: "intent_hash",
      policyHash: "policy_hash",
      simulationReference: "simulation_reference",
      publicReceipt: "chain:transaction_digest",
    }]);
    expect(await store.get("ws_other", "run_wallet_receipt")).toBeNull();
  });

  test("serializes racing tool and completion records into one valid chain", async () => {
    const workspaceId = "ws_receipt_race";
    const runId = "run_receipt_race";
    const store = new MatterhornAgentRunReceiptStore();
    await store.start({
      runId,
      workspaceId,
      sessionId: "ses_receipt_race",
      consentUsed: false,
      preflight: {
        version: "matterhorn.agent-privacy-preflight.v1",
        requestHash: "race-hash",
        workspaceId,
        sessionId: "ses_receipt_race",
        requestedMode: "public_research",
        effectiveMode: "public_research",
        decision: "allow",
        provider: {
          id: "cudos",
          name: "ASI:Cloud",
          modelId: "asi1-mini",
          privacyStatus: "unverified",
          trainingUse: "unknown",
          retentionDays: null,
          policyUrl: null,
          dataLeavesMatterhorn: true,
        },
        detectedData: { labels: ["public"], categories: [], redactionCount: 0 },
        reason: "public research",
      },
    });
    await Promise.all([
      store.recordTool({
        runId,
        tool: {
          name: "matterhorn_sui_get_balance",
          access: "read",
          outcome: "success",
          latencyMs: 12,
          source: "sui-rpc",
          freshness: "checkpoint:100",
          trust: "untrusted_external",
        },
      }),
      store.complete({ runId, status: "success", usage: { inputTokens: 20, outputTokens: 5 } }),
    ]);

    const reloaded = new MatterhornAgentRunReceiptStore();
    const [receipt] = await reloaded.list(workspaceId);
    expect(receipt?.status).toBe("success");
    expect(receipt?.tools.map((tool) => tool.name)).toContain("matterhorn_sui_get_balance");
    expect(receipt?.usage.inputTokens).toBe(20);
  });

  test("expires old receipt files and in-memory records after 365 days", async () => {
    const workspaceId = "ws_receipt_expiry";
    const store = new MatterhornAgentRunReceiptStore();
    const startedAt = new Date("2025-01-01T00:00:00.000Z");
    await store.start({
      runId: "run_expired",
      workspaceId,
      sessionId: "ses_expired",
      consentUsed: false,
      now: startedAt,
      preflight: {
        version: "matterhorn.agent-privacy-preflight.v1",
        requestHash: "expiry-hash",
        workspaceId,
        sessionId: "ses_expired",
        requestedMode: "public_research",
        effectiveMode: "public_research",
        decision: "allow",
        provider: {
          id: "cudos",
          name: "ASI:Cloud",
          modelId: "asi1-mini",
          privacyStatus: "unverified",
          trainingUse: "unknown",
          retentionDays: null,
          policyUrl: null,
          dataLeavesMatterhorn: true,
        },
        detectedData: { labels: ["public"], categories: [], redactionCount: 0 },
        reason: "public research",
      },
    });
    expect(await store.purgeExpired(workspaceId, new Date("2026-08-18T00:00:00.000Z"))).toBe(1);
    expect(await store.list(workspaceId)).toEqual([]);
  });

  test("scheduled expiry scans dormant workspace receipt directories", async () => {
    const workspaceId = "ws_receipt_scheduled_expiry";
    const store = new MatterhornAgentRunReceiptStore();
    await store.start({
      runId: "run_scheduled_expired",
      workspaceId,
      sessionId: "ses_scheduled_expired",
      consentUsed: false,
      now: new Date("2025-01-01T00:00:00.000Z"),
      preflight: {
        version: "matterhorn.agent-privacy-preflight.v1",
        requestHash: "scheduled-expiry-hash",
        workspaceId,
        sessionId: "ses_scheduled_expired",
        requestedMode: "public_research",
        effectiveMode: "public_research",
        decision: "allow",
        provider: {
          id: "cudos",
          name: "ASI:Cloud",
          modelId: "asi1-mini",
          privacyStatus: "unverified",
          trainingUse: "unknown",
          retentionDays: null,
          policyUrl: null,
          dataLeavesMatterhorn: true,
        },
        detectedData: { labels: ["public"], categories: [], redactionCount: 0 },
        reason: "public research",
      },
    });
    const result = await purgeAllExpiredAgentRunReceipts(store, new Date("2026-08-18T00:00:00.000Z"));
    expect(result.workspaces).toBeGreaterThan(0);
    expect(result.files).toBeGreaterThan(0);
  });
});
