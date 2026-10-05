import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunReceiptIntegrityError,
  MatterhornAgentRunReceiptStore,
  purgeAllExpiredAgentRunReceipts,
} from "./agent-run-receipts.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

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
  test("a missing authenticated receipt file is not silently replaced", async () => {
    const workspaceId = "ws_missing_receipt_file";
    const runId = "run_missing_receipt_file";
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "missing-receipt.db"));
    const authority = testDurableStateAuthority();
    const store = new MatterhornAgentRunReceiptStore(state, authority);
    try {
      await store.start({ workspaceId, runId, sessionId: "ses_missing", consentUsed: false,
        preflight: publicPreflight(workspaceId, "ses_missing") });
      const path = join(root, "security-receipts", workspaceId, `${new Date().toISOString().slice(0, 10)}.jsonl`);
      await rm(path);
      await expect(store.get(workspaceId, runId)).rejects.toThrow("agent_run_receipt_index_invalid");
      await expect(store.start({ workspaceId, runId: "run_new_after_loss", sessionId: "ses_missing", consentUsed: false,
        preflight: publicPreflight(workspaceId, "ses_missing") })).rejects.toThrow("agent_run_receipt_index_invalid");
      expect(state.getRecord("receipt_index", runId)).not.toBeNull();
    } finally { state.close(); authority.close(); }
  });

  test("daily retention keeps the unexpired part of a day alongside expired receipts", async () => {
    const workspaceId = "ws_receipt_retention_boundary";
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "receipt-retention.db"));
    const authority = testDurableStateAuthority();
    const store = new MatterhornAgentRunReceiptStore(state, authority);
    try {
      for (const [runId, at] of [["run_expired", "2025-04-15T11:00:00.000Z"], ["run_retained", "2025-04-15T13:00:00.000Z"]]) {
        setSystemTime(new Date(at));
        await store.start({ workspaceId, runId, sessionId: "ses_retention", consentUsed: false,
          preflight: publicPreflight(workspaceId, "ses_retention") });
      }
      setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
      expect(await store.purgeExpired(workspaceId)).toBe(0);
      expect((await store.list(workspaceId)).map(receipt => receipt.runId)).toEqual(["run_retained"]);
      setSystemTime(new Date("2026-04-16T00:00:00.000Z"));
      expect(await store.purgeExpired(workspaceId)).toBe(1);
      expect(await store.list(workspaceId)).toEqual([]);
    } finally { setSystemTime(); state.close(); authority.close(); }
  });

  for (const boundary of ["before-append", "after-append", "after-index"]) {
    test(`two processes recover an abrupt writer exit at ${boundary}`, async () => {
      const workspaceId = `ws_process_journal_${boundary}`;
      const runId = `run_process_journal_${boundary}`;
      const db = join(root, `${workspaceId}.db`);
      const state = new MatterhornGuardedRuntimeStateStore(db);
      const authority = testDurableStateAuthority();
      const store = new MatterhornAgentRunReceiptStore(state, authority);
      const runWorker = async (mode: string) => {
        const child = Bun.spawn([process.execPath, new URL("./fixtures/receipt-journal-worker.ts", import.meta.url).pathname,
          mode, db, workspaceId, runId], { env: { OPENWORK_DATA_DIR: root }, stdout: "pipe", stderr: "pipe" });
        const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
        expect(code, error).toBe(mode === "recover" ? 0 : 71);
      };
      try {
        await store.start({ workspaceId, runId, sessionId: "ses_process", consentUsed: false,
          preflight: publicPreflight(workspaceId, "ses_process") });
        await runWorker(boundary);
        expect(state.getRecord("receipt_append_intent", workspaceId)).not.toBeNull();
        await Promise.all([runWorker("recover"), runWorker("recover")]);
        expect(state.getRecord("receipt_append_intent", workspaceId)).toBeNull();
        expect(await store.get(workspaceId, runId)).toMatchObject({ status: "cancelled",
          usage: { inputTokens: 300, outputTokens: 173 } });
        const path = join(root, "security-receipts", workspaceId, `${new Date().toISOString().slice(0, 10)}.jsonl`);
        expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2);
      } finally { state.close(); authority.close(); }
    }, 15000);
  }

  for (const boundary of ["before-append", "partial-append", "partial-utf8", "after-append", "index-commit"]) {
    test(`sealed receipt intent recovers ${boundary} exactly once after reopen`, async () => {
      const workspaceId = `ws_journal_${boundary}`;
      const runId = `run_journal_${boundary}`;
      const db = join(root, `${workspaceId}.db`);
      const authority = testDurableStateAuthority();
      let state = new MatterhornGuardedRuntimeStateStore(db);
      let store = new MatterhornAgentRunReceiptStore(state, authority);
      try {
        const now = new Date();
        const path = join(root, "security-receipts", workspaceId, `${now.toISOString().slice(0, 10)}.jsonl`);
        const preflight = publicPreflight(workspaceId, "ses_journal");
        preflight.provider.name = "Synthetic provider 🚀";
        await store.start({ workspaceId, runId, sessionId: "ses_journal", consentUsed: false, preflight, now });
        const prefix = await readFile(path);
        const put = state.put.bind(state);
        const remove = state.delete.bind(state);
        state.put = (input) => {
          if (boundary !== "index-commit" && input.kind === "receipt_index") throw new Error("fixture index failure");
          return put(input);
        };
        state.delete = (kind, key) => {
          if (boundary === "index-commit" && kind === "receipt_append_intent") throw new Error("fixture index commit failure");
          return remove(kind, key);
        };
        await expect(store.complete({ runId, status: "cancelled", usage: { inputTokens: 300, outputTokens: 173 }, now }))
          .rejects.toThrow("fixture index");
        const intended = await readFile(path);
        expect(intended.length).toBeGreaterThan(prefix.length);
        expect(state.getRecord("receipt_append_intent", workspaceId)).not.toBeNull();
        // Simulate crashes before or during the append. Only bytes belonging
        // to the sealed intended suffix are eligible for automatic repair.
        if (boundary === "before-append") await writeFile(path, prefix);
        if (boundary === "partial-append") await writeFile(path, intended.subarray(0, prefix.length + 71));
        if (boundary === "partial-utf8") await writeFile(path, intended.subarray(0, intended.indexOf(Buffer.from("🚀"), prefix.length) + 1));
        state.close();
        state = new MatterhornGuardedRuntimeStateStore(db);
        store = new MatterhornAgentRunReceiptStore(state, authority);
        const recovered = await store.get(workspaceId, runId);
        expect(recovered).toMatchObject({ status: "cancelled", completedAt: now.toISOString(),
          usage: { inputTokens: 300, outputTokens: 173 } });
        expect(await readFile(path)).toEqual(intended);
        expect(state.getRecord("receipt_append_intent", workspaceId)).toBeNull();
        await store.get(workspaceId, runId);
        expect(await readFile(path)).toEqual(intended);
        await store.complete({ runId, status: "success", usage: { inputTokens: 1, outputTokens: 1 } });
        expect(await store.get(workspaceId, runId)).toMatchObject({ status: "cancelled", completedAt: recovered?.completedAt,
          usage: { inputTokens: 300, outputTokens: 173 } });
      } finally { state.close(); authority.close(); }
    });
  }

  test("a failed journal write leaves no file mutation or false terminal outcome", async () => {
    const workspaceId = "ws_journal_prepare_failure";
    const runId = "run_journal_prepare_failure";
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "journal-prepare.db"));
    const authority = testDurableStateAuthority();
    const store = new MatterhornAgentRunReceiptStore(state, authority);
    try {
      await store.start({ workspaceId, runId, sessionId: "ses_prepare", consentUsed: false,
        preflight: publicPreflight(workspaceId, "ses_prepare") });
      const path = join(root, "security-receipts", workspaceId, `${new Date().toISOString().slice(0, 10)}.jsonl`);
      const before = await readFile(path);
      const put = state.put.bind(state);
      state.put = (input) => {
        if (input.kind === "receipt_append_intent") throw new Error("fixture journal failure");
        return put(input);
      };
      await expect(store.complete({ runId, status: "cancelled" })).rejects.toThrow("fixture journal failure");
      expect(await readFile(path)).toEqual(before);
      expect(await store.get(workspaceId, runId)).toMatchObject({ status: "pending" });
      expect(state.getRecord("receipt_append_intent", workspaceId)).toBeNull();
      state.put = put;
      await store.complete({ runId, status: "success" });
      expect(await store.get(workspaceId, runId)).toMatchObject({ status: "success" });
    } finally { state.close(); authority.close(); }
  });

  for (const mutation of ["prefix", "suffix", "extra-tail", "missing-prefix", "unsealed-intent", "wrong-tenant", "missing-intent", "index"]) {
    test(`receipt recovery rejects ${mutation} without modifying the file`, async () => {
      const workspaceId = `ws_journal_tamper_${mutation}`;
      const runId = `run_journal_tamper_${mutation}`;
      const db = join(root, `${workspaceId}.db`);
      const state = new MatterhornGuardedRuntimeStateStore(db);
      const authority = testDurableStateAuthority();
      const store = new MatterhornAgentRunReceiptStore(state, authority);
      try {
        const now = new Date();
        const path = join(root, "security-receipts", workspaceId, `${now.toISOString().slice(0, 10)}.jsonl`);
        await store.start({ workspaceId, runId, sessionId: "ses_tamper", consentUsed: false,
          preflight: publicPreflight(workspaceId, "ses_tamper"), now });
        const prefix = await readFile(path);
        const originalIndex = state.getRecord("receipt_index", runId);
        const put = state.put.bind(state);
        state.put = (input) => {
          if (input.kind === "receipt_index") throw new Error("fixture index failure");
          return put(input);
        };
        await expect(store.complete({ runId, status: "success", usage: { inputTokens: 473 }, now })).rejects.toThrow("fixture index failure");
        state.put = put;
        const intended = await readFile(path);
        if (mutation === "prefix") { const changed = Buffer.from(intended); changed[1] ^= 1; await writeFile(path, changed); }
        if (mutation === "suffix") { const changed = Buffer.from(intended); changed[prefix.length + 1] ^= 1; await writeFile(path, changed); }
        if (mutation === "extra-tail") await writeFile(path, Buffer.concat([intended, Buffer.from("unexpected\n")]));
        if (mutation === "missing-prefix") await writeFile(path, intended.subarray(prefix.length));
        if (mutation === "missing-intent") state.delete("receipt_append_intent", workspaceId);
        if (mutation === "index") state.delete("receipt_index", runId);
        if (mutation === "unsealed-intent" || mutation === "wrong-tenant") {
          const record = state.getRecord("receipt_append_intent", workspaceId);
          if (!record) throw new Error("Missing fixture intent");
          state.put({ kind: record.kind, key: record.key,
            workspaceId: mutation === "wrong-tenant" ? "ws_other" : workspaceId, sessionId: record.sessionId,
            value: mutation === "unsealed-intent" ? { version: 1 } : record.value,
            expiresAtMs: record.expiresAtMs, nowMs: record.updatedAtMs });
        }
        const before = await readFile(path);
        const reloaded = new MatterhornAgentRunReceiptStore(state, authority);
        await expect(reloaded.get(workspaceId, runId)).rejects.toThrow();
        expect(await readFile(path)).toEqual(before);
        if (mutation !== "index") expect(state.getRecord("receipt_index", runId)).toEqual(originalIndex);
      } finally { state.close(); authority.close(); }
    });
  }

  test("independent receipt stores preserve concurrent terminal status and memory observations", async () => {
    const workspaceId = "ws_journal_concurrent";
    const runId = "run_journal_concurrent";
    const db = join(root, "receipt-concurrent.db");
    const firstState = new MatterhornGuardedRuntimeStateStore(db);
    const secondState = new MatterhornGuardedRuntimeStateStore(db);
    const authority = testDurableStateAuthority();
    const first = new MatterhornAgentRunReceiptStore(firstState, authority);
    const second = new MatterhornAgentRunReceiptStore(secondState, authority);
    try {
      await first.start({ workspaceId, runId, sessionId: "ses_concurrent", consentUsed: false,
        preflight: publicPreflight(workspaceId, "ses_concurrent") });
      await second.get(workspaceId, runId);
      await Promise.all([
        first.complete({ runId, status: "cancelled", usage: { inputTokens: 300 } }),
        second.complete({ runId, status: "success", usage: { outputTokens: 173 } }),
        first.recordMemoryWrite({ runId, memoryId: "memory_a" }),
        second.recordMemoryWrite({ runId, memoryId: "memory_b" }),
      ]);
      const result = await first.get(workspaceId, runId);
      expect(result).toMatchObject({ status: "cancelled", usage: { inputTokens: 300, outputTokens: 173 },
        memory: { writtenIds: ["memory_a", "memory_b"] } });
      expect(await second.get(workspaceId, runId)).toEqual(result);
    } finally { firstState.close(); secondState.close(); authority.close(); }
  });

  const terminalStatuses: Array<Parameters<MatterhornAgentRunReceiptStore["complete"]>[0]["status"]> = ["success", "partial", "cancelled", "error"];
  for (const status of terminalStatuses) {
    test(`late usage preserves ${status} outcome and completion time across reload`, async () => {
      const store = new MatterhornAgentRunReceiptStore();
      const workspaceId = `ws_receipt_late_${status}`;
      const runId = `run_receipt_late_${status}`;
      const startedAt = new Date();
      const completedAt = new Date(startedAt.getTime() + 100);
      const replayAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
      await store.start({ runId, workspaceId, sessionId: "ses_late", now: startedAt, consentUsed: false,
        preflight: publicPreflight(workspaceId, "ses_late") });
      const initial = { inputTokens: 100, outputTokens: 23, reasoningTokens: 5, cacheReadTokens: 8, cacheWriteTokens: 3, estimatedCostUsd: 0.02 };
      const increased = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value * 2]));
      await store.complete({ runId, status, now: completedAt, usage: initial });
      await store.complete({ runId, status: "success", now: replayAt, usage: increased });
      await store.complete({ runId, status: "error", now: replayAt, usage: initial });
      const expected = { status, completedAt: completedAt.toISOString(), responseDurationMs: 100, usage: increased };
      expect(await store.get(workspaceId, runId)).toMatchObject(expected);
      const reloaded = new MatterhornAgentRunReceiptStore();
      expect(await reloaded.get(workspaceId, runId)).toMatchObject(expected);
    });
  }

  test("authenticates the pending receipt index used by guarded dispatch", async () => {
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "receipt-index-authority.db"));
    const authority = testDurableStateAuthority();
    const index = new MatterhornDurableAuthorizedState(
      state,
      authority,
      "receipt_index",
      "agent_run_receipt_index_invalid",
    );
    const store = new MatterhornAgentRunReceiptStore(state, authority);
    const runId = "agent_run_11111111-1111-4111-8111-111111111111";
    try {
      await store.start({
        runId,
        workspaceId: "workspace_receipt_index",
        sessionId: "session_receipt_index",
        preflight: publicPreflight("workspace_receipt_index", "session_receipt_index"),
        consentUsed: false,
      });
      expect(index.get<{ status: string; runId: string }>(runId, Date.now()))
        .toEqual(expect.objectContaining({ status: "pending", runId }));
      const persisted = state.getRecord<unknown>("receipt_index", runId);
      if (!persisted) throw new Error("test receipt index missing");
      state.put({
        kind: persisted.kind,
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        sessionId: persisted.sessionId,
        value: { tampered: true },
        expiresAtMs: persisted.expiresAtMs,
        nowMs: persisted.updatedAtMs,
      });
      expect(() => index.get(runId, Date.now())).toThrow("agent_run_receipt_index_invalid");
    } finally {
      authority.close();
      state.close();
    }
  });

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
      context: { chatFiles: 2, coworkerFiles: 1, savedMemories: 1 },
      contextOptimization: {
        compilerVersion: "matterhorn.coworker-context-compiler.v2",
        systemChars: 2_000,
        policyChars: 700,
        dataChars: 1_298,
        activeCryptoTools: 4,
        availableCryptoTools: 20,
        activeToolSchemaChars: 1_200,
        availableToolSchemaChars: 8_000,
        dataSectionsIncluded: 3,
        dataSectionsShortened: 1,
        dataSectionsOmitted: 1,
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
    expect(items[0]?.context).toEqual({ chatFiles: 2, coworkerFiles: 1, savedMemories: 1 });
    expect(items[0]?.contextOptimization).toMatchObject({
      compilerVersion: "matterhorn.coworker-context-compiler.v2",
      activeCryptoTools: 4,
      availableCryptoTools: 20,
      dataSectionsShortened: 1,
      dataSectionsOmitted: 1,
    });
    expect(items[0]?.memory.writtenIds).toEqual(["memory_saved_from_run"]);
    expect(items[0]?.integrity.recordHash).toHaveLength(64);
    const files = await readFile(join(root, "security-receipts", "ws_receipt", `${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8");
    expect(files).not.toContain(sensitivePrompt);
    expect(files).not.toContain("attachmentIds");
    expect(files).not.toContain("agentFileIds");
    expect(files).toContain('"requestHash":"hash-only"');
    expect(files.trim().split("\n").length).toBe(3);
  });

  test("rejects contradictory or unbounded context optimization metadata", async () => {
    const store = new MatterhornAgentRunReceiptStore();
    const start = (contextOptimization: NonNullable<Parameters<typeof store.start>[0]["contextOptimization"]>) => store.start({
      runId: `run_bad_optimization_${Math.random()}`,
      workspaceId: "ws_bad_optimization",
      sessionId: "ses_bad_optimization",
      consentUsed: false,
      preflight: publicPreflight("ws_bad_optimization", "ses_bad_optimization"),
      contextOptimization,
    });
    const valid = {
      compilerVersion: "matterhorn.coworker-context-compiler.v2",
      systemChars: 2_000,
      policyChars: 700,
      dataChars: 1_298,
      activeCryptoTools: 4,
      availableCryptoTools: 20,
      activeToolSchemaChars: 1_200,
      availableToolSchemaChars: 8_000,
      dataSectionsIncluded: 3,
      dataSectionsShortened: 1,
      dataSectionsOmitted: 1,
    };
    await expect(start({ ...valid, activeCryptoTools: 21 })).rejects.toThrow("agent_run_context_optimization_invalid");
    await expect(start({ ...valid, activeToolSchemaChars: 8_001 })).rejects.toThrow("agent_run_context_optimization_invalid");
    await expect(start({ ...valid, systemChars: Number.MAX_SAFE_INTEGER })).rejects.toThrow("agent_run_context_optimization_invalid");
    await expect(start({ ...valid, compilerVersion: "bad\nversion" })).rejects.toThrow("agent_run_context_optimization_invalid");
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
