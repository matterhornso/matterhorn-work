// Disposable subprocess fixture: never point this at user data.
import { MatterhornAgentRunReceiptStore } from "../agent-run-receipts.js";
import { testDurableStateAuthority } from "../durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "../guarded-runtime-state-store.js";

const [mode, db, workspaceId, runId] = process.argv.slice(2);
if (!mode || !db || !workspaceId?.startsWith("ws_process_journal_") || !runId?.startsWith("run_process_journal_")) {
  throw new Error("Invalid disposable receipt fixture");
}
const state = new MatterhornGuardedRuntimeStateStore(db);
const authority = testDurableStateAuthority();
const store = new MatterhornAgentRunReceiptStore(state, authority);
try {
  await store.get(workspaceId, runId);
  if (mode === "recover") process.exitCode = 0;
  else {
    const transaction = state.transaction.bind(state);
    const put = state.put.bind(state);
    const remove = state.delete.bind(state);
    state.transaction = (callback) => {
      const result = transaction(callback);
      if (mode === "before-append" && state.getRecord("receipt_append_intent", workspaceId)) process.exit(71);
      return result;
    };
    state.put = (input) => {
      if (mode === "after-append" && input.kind === "receipt_index") process.exit(71);
      return put(input);
    };
    state.delete = (kind, key) => {
      if (mode === "after-index" && kind === "receipt_append_intent") process.exit(71);
      return remove(kind, key);
    };
    await store.complete({ runId, status: "cancelled", usage: { inputTokens: 300, outputTokens: 173 } });
    throw new Error("Crash boundary was not reached");
  }
} finally { state.close(); authority.close(); }
