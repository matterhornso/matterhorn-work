import { afterAll, beforeAll, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeRunCompletion, type AgentRunCompletionBinding } from "./agent-run-completion-recovery.js";
import { MatterhornGuardedAgentRuntime, type GuardedPromptInput } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const binding: AgentRunCompletionBinding = { runId: "agent_run_00000000-0000-4000-8000-000000000000",
  workspaceId: "ws_recovery", sessionId: "ses_recovery", messageId: "msg_parent",
  providerId: "ollama", modelId: "fixture", acceptedAtMs: 1000 };

function history(at = 1000): Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }> {
  return [
    { info: { id: "msg_parent", role: "user", sessionID: "ses_recovery", time: { created: at },
      model: { providerID: "ollama", modelID: "fixture" } }, parts: [] },
    { info: { id: "msg_answer", role: "assistant", sessionID: "ses_recovery", parentID: "msg_parent",
      providerID: "ollama", modelID: "fixture", time: { created: at, completed: at }, finish: "stop",
      tokens: { input: 300, output: 173, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0 }, parts: [] },
  ];
}

test("native recovery returns only terminal status and cumulative content-free usage", () => {
  const messages = history();
  const tool = structuredClone(messages[1]);
  tool.info.id = "msg_tool";
  tool.info.finish = "tool-calls";
  tool.info.tokens = { input: 100, output: 23, reasoning: 0, cache: { read: 0, write: 0 } };
  tool.parts = [{ type: "tool", messageID: "msg_tool", sessionID: "ses_recovery", state: { status: "completed" } }];
  messages.splice(1, 0, tool);
  expect(nativeRunCompletion(binding, messages, 2000)).toEqual({ status: "success", usage: {
    inputTokens: 400, outputTokens: 196, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0,
  } });
});

test("native recovery rejects absent identities, incomplete envelopes and aggregate overflow", () => {
  expect(nativeRunCompletion({ ...binding, messageId: null }, history(), 2000)).toBeNull();
  for (const messages of [null, {}, [], [{ info: {} }], new Array(10_001).fill(null)]) {
    expect(nativeRunCompletion(binding, messages, 2000)).toBeNull();
  }
  const messages = history();
  const first = structuredClone(messages[1]);
  first.info.id = "msg_first"; first.info.finish = "tool-calls";
  first.info.tokens = { input: Number.MAX_SAFE_INTEGER, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
  messages.splice(1, 0, first);
  expect(nativeRunCompletion(binding, messages, 2000)).toBeNull();
});

const invalidHistory: Array<{ name: string; mutate: (messages: ReturnType<typeof history>) => void }> = [
  { name: "missing parent", mutate: m => { m.shift(); } },
  { name: "wrong parent role", mutate: m => { m[0].info.role = "assistant"; } },
  { name: "old parent", mutate: m => { m[0].info.time = { created: 999 }; } },
  { name: "answer before parent", mutate: m => { m[0].info.time = { created: 1001 }; } },
  { name: "wrong parent model", mutate: m => { m[0].info.model = { providerID: "ollama", modelID: "other" }; } },
  { name: "wrong parent provider", mutate: m => { m[0].info.model = { providerID: "other", modelID: "fixture" }; } },
  { name: "wrong parent identity", mutate: m => { m[1].info.parentID = "other"; } },
  { name: "wrong session", mutate: m => { m[1].info.sessionID = "ses_other"; } },
  { name: "wrong model", mutate: m => { m[1].info.modelID = "other"; } },
  { name: "wrong provider", mutate: m => { m[1].info.providerID = "other"; } },
  { name: "duplicate assistant", mutate: m => { m.push(structuredClone(m[1])); } },
  { name: "duplicate parent", mutate: m => { m.push(structuredClone(m[0])); } },
  { name: "out of order", mutate: m => { m.reverse(); } },
  { name: "incomplete", mutate: m => { m[1].info.time = { created: 1000 }; } },
  { name: "clock reversed", mutate: m => { m[1].info.time = { created: 1001, completed: 1000 }; } },
  { name: "future result", mutate: m => { m[1].info.time = { created: 1000, completed: 2001 }; } },
  { name: "fractional time", mutate: m => { m[1].info.time = { created: 1000, completed: 1000.5 }; } },
  { name: "unknown finish", mutate: m => { m[1].info.finish = "unknown"; } },
  { name: "tool continuation", mutate: m => { m[1].info.finish = "tool-calls"; } },
  { name: "unsupported finish", mutate: m => { m[1].info.finish = "something-new"; } },
  { name: "malformed error", mutate: m => { m[1].info.error = "oops"; } },
  { name: "missing tokens", mutate: m => { delete m[1].info.tokens; } },
  { name: "negative tokens", mutate: m => { m[1].info.tokens = { input: -1, output: 173, reasoning: 0, cache: { read: 0, write: 0 } }; } },
  { name: "fractional tokens", mutate: m => { m[1].info.tokens = { input: 0.5, output: 173, reasoning: 0, cache: { read: 0, write: 0 } }; } },
  { name: "invalid cost", mutate: m => { m[1].info.cost = Number.NaN; } },
  { name: "negative cost", mutate: m => { m[1].info.cost = -0.1; } },
  { name: "running tool", mutate: m => { m[1].parts = [{ type: "tool", messageID: "msg_answer", sessionID: "ses_recovery", state: { status: "running" } }]; } },
  { name: "wrong part identity", mutate: m => { m[1].parts = [{ type: "text", messageID: "other", sessionID: "ses_recovery" }]; } },
  { name: "two terminal steps", mutate: m => { const second = structuredClone(m[1]); second.info.id = "msg_second"; m.push(second); } },
];
for (const { name, mutate } of invalidHistory) {
  test(`native recovery leaves ${name} unresolved`, () => {
    const messages = history();
    mutate(messages);
    expect(nativeRunCompletion(binding, messages, 2000)).toBeNull();
  });
}
const finishes: Array<[string, "success" | "partial"]> = [["stop", "success"], ["length", "partial"], ["content-filter", "partial"]];
for (const [finish, status] of finishes) {
  test(`native recovery maps ${finish} without inventing success`, () => {
    const messages = history(); messages[1].info.finish = finish;
    expect(nativeRunCompletion(binding, messages, 2000)?.status).toBe(status);
  });
}
const errors: Array<[string, "cancelled" | "error"]> = [["MessageAbortedError", "cancelled"], ["UnknownError", "error"]];
for (const [name, status] of errors) {
  test(`native recovery preserves ${name}`, () => {
    const messages = history(); delete messages[1].info.finish; messages[1].info.error = { name };
    expect(nativeRunCompletion(binding, messages, 2000)?.status).toBe(status);
  });
}

const saved = { mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  secret: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET, data: process.env.OPENWORK_DATA_DIR };
let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "matterhorn-completion-recovery-"));
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "synthetic-completion-recovery-authority-not-a-real-secret";
  process.env.OPENWORK_DATA_DIR = root;
});
afterAll(async () => {
  for (const [name, value] of Object.entries({ MATTERHORN_GUARDED_RUNTIME_MODE: saved.mode,
    MATTERHORN_CAPABILITY_SIGNING_SECRET: saved.secret, OPENWORK_DATA_DIR: saved.data })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  await rm(root, { recursive: true, force: true });
});

for (const scenario of ["restart", "expired-execution", "cancelled", "replacement", "index-failure", "purged", "deleted", "unsealed", "transplanted", "expired", "no-binding", "wrong-session", "wrong-workspace", "binding-write-failure", "purge-before-commit", "delete-before-commit"]) {
  test(`durable completion recovery: ${scenario}`, async () => {
    const path = join(root, `${scenario}.db`);
    let state = new MatterhornGuardedRuntimeStateStore(path);
    let runtime = new MatterhornGuardedAgentRuntime(state);
    const scope = { workspaceId: `ws_${scenario}`, sessionId: "ses_recovery" };
    try {
      const prompt: GuardedPromptInput = { ...scope, providerId: "ollama", modelId: "fixture", executionMode: "work",
        parts: [{ type: "text", text: "Synthetic local question" }] };
      const accepted = await runtime.acceptPrompt(prompt);
      if (scenario === "binding-write-failure") {
        const put = state.put.bind(state);
        state.put = input => {
          if (input.kind === "run_completion_binding") throw new Error("Synthetic binding failure");
          return put(input);
        };
        expect(() => runtime.bindUserMessage({ runId: accepted.runId, sessionId: scope.sessionId, messageId: "msg_parent" })).toThrow("Synthetic binding failure");
        expect(state.getRecord("user_message_binding", "msg_parent")).toBeNull();
        expect(runtime.pendingCompletionSessions()).toEqual([]);
        return;
      }
      runtime.bindUserMessage({ runId: accepted.runId, sessionId: scope.sessionId, messageId: "msg_parent" });
      const record = state.getRecord("run_completion_binding", accepted.runId);
      if (!record) throw new Error("Missing test completion identity");
      expect(runtime.pendingCompletionSessions()).toEqual([scope]);
      const messages = history(record.updatedAtMs);
      if (scenario === "expired-execution") setSystemTime(new Date(Date.now() + 6 * 60 * 60 * 1000 + 1));
      let replacementId: string | undefined;
      if (scenario === "cancelled") await runtime.cancelSessionRun(scope);
      if (scenario === "replacement") {
        const next = await runtime.acceptPrompt(prompt); replacementId = next.runId;
        runtime.bindUserMessage({ runId: next.runId, sessionId: scope.sessionId, messageId: "msg_new" });
      }
      if (scenario === "purged") runtime.purgeWorkspace(scope.workspaceId);
      if (scenario === "deleted") runtime.beginWorkspaceDeletion(scope.workspaceId);
      if (scenario === "no-binding") state.delete("run_completion_binding", accepted.runId);
      if (["unsealed", "transplanted", "expired"].includes(scenario)) {
        state.put({ kind: record.kind, key: record.key, workspaceId: record.workspaceId,
          sessionId: scenario === "transplanted" ? "ses_other" : record.sessionId,
          value: scenario === "unsealed" ? binding : record.value,
          expiresAtMs: scenario === "expired" ? 1 : record.expiresAtMs, nowMs: record.updatedAtMs });
      }
      runtime.close();
      state = new MatterhornGuardedRuntimeStateStore(path);
      runtime = new MatterhornGuardedAgentRuntime(state);
      const request = { ...scope, messages,
        ...(scenario === "wrong-session" ? { sessionId: "ses_other" } : {}),
        ...(scenario === "wrong-workspace" ? { workspaceId: "ws_other" } : {}) };
      const put = state.put.bind(state);
      if (scenario === "purge-before-commit" || scenario === "delete-before-commit") {
        const complete = runtime.receipts.complete.bind(runtime.receipts);
        runtime.receipts.complete = async input => {
          if (scenario === "purge-before-commit") runtime.purgeWorkspace(scope.workspaceId);
          else runtime.beginWorkspaceDeletion(scope.workspaceId);
          return complete(input);
        };
        await expect(runtime.recoverSessionCompletions(request)).rejects.toThrow("agent_run_completion_binding_unavailable");
        expect((await runtime.receipts.get(scope.workspaceId, accepted.runId))?.status).toBe("pending");
        return;
      }
      if (scenario === "index-failure") {
        state.put = input => {
          if (input.kind === "receipt_index") throw new Error("Synthetic index failure");
          return put(input);
        };
        await expect(runtime.recoverSessionCompletions(request)).rejects.toThrow("Synthetic index failure");
        expect(runtime.capabilities.activeRun(scope.sessionId)).toBeNull();
        runtime.close();
        state = new MatterhornGuardedRuntimeStateStore(path);
        runtime = new MatterhornGuardedAgentRuntime(state);
      }
      if (scenario === "unsealed" || scenario === "transplanted") {
        await expect(runtime.recoverSessionCompletions(request)).rejects.toThrow();
      } else {
        const allowed = ["restart", "expired-execution", "cancelled", "replacement", "index-failure"].includes(scenario);
        await runtime.recoverSessionCompletions(request);
        const receipt = await runtime.receipts.get(scope.workspaceId, accepted.runId);
        expect(receipt?.status).toBe(allowed ? (scenario === "cancelled" || scenario === "replacement" ? "cancelled" : "success") : "pending");
        if (allowed) {
          expect(receipt?.usage).toMatchObject({ inputTokens: 300, outputTokens: 173 });
          expect(runtime.capabilities.activeRun(scope.sessionId)).toBe(replacementId ?? null);
          expect(await runtime.recoverSessionCompletions(request)).toBe(0);
          expect(await runtime.receipts.get(scope.workspaceId, accepted.runId)).toEqual(receipt);
          expect(runtime.pendingCompletionSessions()).toEqual(replacementId ? [scope] : []);
        }
      }
    } finally { runtime.close(); setSystemTime(); }
  });
}
