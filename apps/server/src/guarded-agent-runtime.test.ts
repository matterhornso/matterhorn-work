import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const original = {
  mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
  signingSecret: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
  dataDir: process.env.OPENWORK_DATA_DIR,
  enforceAccess: process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS,
  enforceDesks: process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS,
};
let dataDir = "";

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "matterhorn-guard-runtime-"));
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-secret-that-never-enters-tool-args";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "capability-signing-secret-with-at-least-32-characters";
  process.env.OPENWORK_DATA_DIR = dataDir;
});

afterAll(async () => {
  for (const [key, value] of Object.entries({
    MATTERHORN_GUARDED_RUNTIME_MODE: original.mode,
    MATTERHORN_AGENT_RUNTIME_SECRET: original.runtimeSecret,
    MATTERHORN_CAPABILITY_SIGNING_SECRET: original.signingSecret,
    OPENWORK_DATA_DIR: original.dataDir,
    MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS: original.enforceAccess,
    MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS: original.enforceDesks,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(dataDir, { recursive: true, force: true });
});

describe("guarded agent runtime transport", () => {
  test("records selected context as counts without retaining file identifiers", async () => {
    const path = join(dataDir, "run-context-counts.db");
    const runtime = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_context_counts",
      sessionId: "ses_context_counts",
      parts: [{ type: "text", text: "Use my selected files to compare public Sui activity" }],
      providerId: "local",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      attachmentIds: ["chat-file-one", "coworker-file-one", "coworker-file-one"],
      agentFileIds: ["coworker-file-one", "coworker-file-one"],
      memoryIds: ["saved-memory-one", "saved-memory-one"],
      privacyMode: "private_workspace",
      executionMode: "work",
    });

    const receipt = await runtime.receipts.get("ws_context_counts", accepted.runId);
    expect(receipt?.context).toEqual({ chatFiles: 1, coworkerFiles: 1, savedMemories: 1 });
    expect(JSON.stringify(receipt?.context)).not.toContain("chat-file-one");
    expect(JSON.stringify(receipt?.context)).not.toContain("coworker-file-one");
    runtime.close();
  });

  test("rolls back every run record when scope persistence fails", async () => {
    const path = join(dataDir, "run-scope-startup-rollback.db");
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const runtime = new MatterhornGuardedAgentRuntime(store);
    const originalPutIfAbsent = store.putIfAbsent.bind(store);
    let failScopeWrite = true;
    Object.defineProperty(store, "putIfAbsent", {
      configurable: true,
      value: (input: Parameters<MatterhornGuardedRuntimeStateStore["putIfAbsent"]>[0]) => {
        if (failScopeWrite && input.kind === "agent_run_scope") {
          failScopeWrite = false;
          throw new Error("injected_agent_run_scope_write_failure");
        }
        return originalPutIfAbsent(input);
      },
    });
    const prompt = {
      workspaceId: "ws_scope_startup_rollback",
      sessionId: "ses_scope_startup_rollback",
      parts: [{ type: "text" as const, text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work" as const,
    };

    await expect(runtime.acceptPrompt(prompt)).rejects.toThrow("injected_agent_run_scope_write_failure");
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBeNull();
    expect(store.list("active_agent_run", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("agent_run_scope", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("run_grant", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(await runtime.receipts.list(prompt.workspaceId)).toHaveLength(0);

    Object.defineProperty(store, "putIfAbsent", { configurable: true, value: originalPutIfAbsent });
    const retried = await runtime.acceptPrompt(prompt);
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBe(retried.runId);
    runtime.close();
  });

  test("does not retain memory-only authority when grant persistence fails", async () => {
    const path = join(dataDir, "run-grant-startup-rollback.db");
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const runtime = new MatterhornGuardedAgentRuntime(store);
    const originalPut = store.put.bind(store);
    let failGrantWrite = true;
    Object.defineProperty(store, "put", {
      configurable: true,
      value: (input: Parameters<MatterhornGuardedRuntimeStateStore["put"]>[0]) => {
        if (failGrantWrite && input.kind === "run_grant") {
          failGrantWrite = false;
          throw new Error("injected_run_grant_write_failure");
        }
        return originalPut(input);
      },
    });
    const prompt = {
      workspaceId: "ws_grant_startup_rollback",
      sessionId: "ses_grant_startup_rollback",
      parts: [{ type: "text" as const, text: "Compare public Bittensor validators" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-bittensor",
      executionMode: "work" as const,
    };

    await expect(runtime.acceptPrompt(prompt)).rejects.toThrow("injected_run_grant_write_failure");
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBeNull();
    expect(store.list("active_agent_run", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("agent_run_scope", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("run_grant", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(await runtime.receipts.list(prompt.workspaceId)).toHaveLength(0);

    Object.defineProperty(store, "put", { configurable: true, value: originalPut });
    const retried = await runtime.acceptPrompt(prompt);
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBe(retried.runId);
    runtime.close();
  });

  test("revokes all authority when receipt startup cannot be indexed", async () => {
    const path = join(dataDir, "receipt-startup-rollback.db");
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const runtime = new MatterhornGuardedAgentRuntime(store);
    const originalPut = store.put.bind(store);
    let failReceiptIndexWrite = true;
    Object.defineProperty(store, "put", {
      configurable: true,
      value: (input: Parameters<MatterhornGuardedRuntimeStateStore["put"]>[0]) => {
        if (failReceiptIndexWrite && input.kind === "receipt_index") {
          failReceiptIndexWrite = false;
          throw new Error("injected_receipt_index_write_failure");
        }
        return originalPut(input);
      },
    });
    const prompt = {
      workspaceId: "ws_receipt_startup_rollback",
      sessionId: "ses_receipt_startup_rollback",
      parts: [{ type: "text" as const, text: "Read public Hyperliquid markets" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-hyperliquid",
      executionMode: "work" as const,
    };

    await expect(runtime.acceptPrompt(prompt)).rejects.toThrow("injected_receipt_index_write_failure");
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBeNull();
    expect(store.list("active_agent_run", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("agent_run_scope", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(store.list("run_grant", { workspaceId: prompt.workspaceId })).toHaveLength(0);
    expect(await runtime.receipts.list(prompt.workspaceId)).toEqual([
      expect.objectContaining({ status: "error", workspaceId: prompt.workspaceId }),
    ]);

    Object.defineProperty(store, "put", { configurable: true, value: originalPut });
    const retried = await runtime.acceptPrompt(prompt);
    expect(runtime.capabilities.activeRun(prompt.sessionId)).toBe(retried.runId);
    runtime.close();
  });

  test("rejects a restored grant when its receipt never became dispatch-ready", async () => {
    const path = join(dataDir, "restored-run-without-receipt-index.db");
    const firstStore = new MatterhornGuardedRuntimeStateStore(path);
    const first = new MatterhornGuardedAgentRuntime(firstStore);
    const prompt = {
      workspaceId: "ws_restored_orphan",
      sessionId: "ses_restored_orphan",
      parts: [{ type: "text" as const, text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work" as const,
    };
    const accepted = await first.acceptPrompt(prompt);
    expect(firstStore.delete("receipt_index", accepted.runId)).toBe(true);
    first.close();

    const secondStore = new MatterhornGuardedRuntimeStateStore(path);
    const second = new MatterhornGuardedAgentRuntime(secondStore);
    expect(second.capabilities.activeRun(prompt.sessionId)).toBe(accepted.runId);
    expect(() => second.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: prompt.workspaceId,
      sessionId: prompt.sessionId,
      callId: "call_restored_orphan",
      agentId: prompt.agentId,
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    })).toThrow("capability_run_or_tool_not_found");
    expect(secondStore.list("staged_capability", { workspaceId: prompt.workspaceId })).toHaveLength(0);

    const replacement = await second.acceptPrompt(prompt);
    expect(replacement.runId).not.toBe(accepted.runId);
    expect((await second.receipts.get(prompt.workspaceId, accepted.runId))?.status).toBe("cancelled");
    expect(second.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: replacement.runId,
      workspaceId: prompt.workspaceId,
      sessionId: prompt.sessionId,
      callId: "call_restored_replacement",
      agentId: prompt.agentId,
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"2".repeat(64)}` },
    })).toEqual(expect.objectContaining({ accepted: true, callId: "call_restored_replacement" }));
    second.close();
  });

  test("rejects a receipt index rebound to another tenant", async () => {
    const path = join(dataDir, "receipt-index-tenant-substitution.db");
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const runtime = new MatterhornGuardedAgentRuntime(store);
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_receipt_scope",
      sessionId: "ses_receipt_scope",
      parts: [{ type: "text", text: "Read public Hyperliquid markets" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-hyperliquid",
      executionMode: "work",
    });
    store.put({
      kind: "receipt_index",
      key: accepted.runId,
      workspaceId: "ws_receipt_other",
      sessionId: "ses_receipt_other",
      value: {
        runId: accepted.runId,
        workspaceId: "ws_receipt_other",
        sessionId: "ses_receipt_other",
        status: "pending",
      },
      expiresAtMs: Date.now() + 60_000,
    });

    expect(() => runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_receipt_scope",
      sessionId: "ses_receipt_scope",
      callId: "call_receipt_scope_substitution",
      agentId: "matterhorn-hyperliquid",
      toolName: "matterhorn-work_matterhorn_hyperliquid_markets",
      args: {},
    })).toThrow("capability_scope_mismatch");
    expect(store.list("staged_capability", { workspaceId: "ws_receipt_scope" })).toHaveLength(0);
    runtime.close();
  });

  test("keeps the signed capability server-side and atomically redeems a non-secret call id", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_guard",
      sessionId: "ses_guard",
      parts: [{ type: "text", text: "Compare Bittensor validators" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-bittensor",
      executionMode: "work",
    });
    expect(accepted.runId).toStartWith("agent_run_");
    const args = { message: "Compare Bittensor validators", netuid: 1 };
    const staged = runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_guard",
      sessionId: "ses_guard",
      callId: "call_guard_1",
      agentId: "matterhorn-bittensor",
      toolName: "matterhorn-work_matterhorn_bittensor_chat",
      args,
    });
    expect(staged).toEqual(expect.objectContaining({ accepted: true, callId: "call_guard_1" }));
    expect(JSON.stringify(staged)).not.toContain("capability-signing-secret");
    expect(JSON.stringify(staged)).not.toContain("runtime-secret");

    const authorized = runtime.authorizeMcpTool({
      toolName: "matterhorn_bittensor_chat",
      args: { ...args, _matterhornCallId: "call_guard_1" },
    });
    expect(authorized).toEqual(expect.objectContaining({ runId: accepted.runId, workspaceId: "ws_guard", args }));
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_bittensor_chat",
      args: { ...args, _matterhornCallId: "call_guard_1" },
    })).toThrow("unknown, expired, or replayed");
  });

  test("restores an exact staged tool call after a runtime restart", async () => {
    const path = join(dataDir, "restart-state.db");
    const first = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    const accepted = await first.acceptPrompt({
      workspaceId: "ws_restart",
      sessionId: "ses_restart",
      parts: [{ type: "text", text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    const args = { address: `0x${"3".repeat(64)}` };
    first.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_restart",
      sessionId: "ses_restart",
      callId: "call_after_restart",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args,
    });
    first.close();

    const second = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    expect(second.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, _matterhornCallId: "call_after_restart" },
    })).toEqual(expect.objectContaining({ runId: accepted.runId, workspaceId: "ws_restart" }));
    second.close();
  });

  test("restores a user-message binding when assistant binding persistence fails", async () => {
    const path = join(dataDir, "message-binding-rollback.db");
    const firstStore = new MatterhornGuardedRuntimeStateStore(path);
    const first = new MatterhornGuardedAgentRuntime(firstStore);
    const accepted = await first.acceptPrompt({
      workspaceId: "ws_binding_rollback",
      sessionId: "ses_binding_rollback",
      parts: [{ type: "text", text: "Read public Bittensor validator state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-bittensor",
      executionMode: "work",
    });
    first.bindUserMessage({
      runId: accepted.runId,
      sessionId: "ses_binding_rollback",
      messageId: "msg_binding_user",
    });
    expect(() => first.bindUserMessage({
      runId: accepted.runId,
      sessionId: "ses_binding_rollback",
      messageId: "msg_binding_user",
    })).toThrow("user message is already bound");
    expect(() => first.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_other",
      userMessageId: "msg_binding_user",
      assistantMessageId: "msg_binding_assistant_wrong_scope",
    })).toThrow("assistant message is not bound");
    const originalPutIfAbsent = firstStore.putIfAbsent.bind(firstStore);
    let failNextAssistantWrite = true;
    Object.defineProperty(firstStore, "putIfAbsent", {
      configurable: true,
      value: (putInput: Parameters<MatterhornGuardedRuntimeStateStore["putIfAbsent"]>[0]) => {
        if (failNextAssistantWrite && putInput.kind === "assistant_message_binding") {
          failNextAssistantWrite = false;
          throw new Error("injected_assistant_binding_write_failure");
        }
        return originalPutIfAbsent(putInput);
      },
    });
    try {
      expect(() => first.bindRuntimeMessage({
        runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
        sessionId: "ses_binding_rollback",
        userMessageId: "msg_binding_user",
        assistantMessageId: "msg_binding_assistant_failed",
      })).toThrow("injected_assistant_binding_write_failure");
    } finally {
      Object.defineProperty(firstStore, "putIfAbsent", { configurable: true, value: originalPutIfAbsent });
      first.close();
    }

    const second = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    expect(second.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_binding_rollback",
      userMessageId: "msg_binding_user",
      assistantMessageId: "msg_binding_assistant_retry",
    })).toEqual({ runId: accepted.runId });
    expect(() => second.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_binding_rollback",
      userMessageId: "msg_binding_user",
      assistantMessageId: "msg_binding_assistant_replay",
    })).toThrow("assistant message is not bound");
    const other = await second.acceptPrompt({
      workspaceId: "ws_binding_other",
      sessionId: "ses_binding_other",
      parts: [{ type: "text", text: "Read public Sui network state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    second.bindUserMessage({
      runId: other.runId,
      sessionId: "ses_binding_other",
      messageId: "msg_binding_other_user",
    });
    expect(() => second.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_binding_other",
      userMessageId: "msg_binding_other_user",
      assistantMessageId: "msg_binding_assistant_retry",
    })).toThrow("assistant message is already bound");
    expect(second.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_binding_other",
      userMessageId: "msg_binding_other_user",
      assistantMessageId: "msg_binding_other_assistant",
    })).toEqual({ runId: other.runId });
    second.close();
  });

  test("revokes the active grant and staged calls when a run completes", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_complete",
      sessionId: "ses_complete",
      parts: [{ type: "text", text: "Read my public Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_complete",
      sessionId: "ses_complete",
      callId: "call_complete_pending",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    });
    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      status: "success",
    });
    expect(runtime.capabilities.activeRun("ses_complete")).toBeNull();
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}`, _matterhornCallId: "call_complete_pending" },
    })).toThrow("unknown, expired, or replayed");
    expect((await runtime.receipts.get("ws_complete", accepted.runId))?.status).toBe("success");
  });

  test("revokes staged authority immediately when a bound coworker changes state", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    runtime.setCoworkerResolver(() => true);
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_coworker",
      sessionId: "ses_coworker",
      parts: [{ type: "text", text: "Read the approved Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker: {
        id: "cw_guarded",
        workspaceId: "ws_coworker",
        ownerId: "account_coworker",
        revision: 2,
        policyVersion: "coworker-policy-2",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          connectionId: "cxc_sui",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionId: "sui_account_read",
          network: "sui:testnet",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 4,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const args = {
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      actionId: "sui_account_read",
      access: "read",
      network: "sui:testnet",
      canonicalArgumentsHash: "a".repeat(64),
    };
    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_coworker",
      sessionId: "ses_coworker",
      callId: "call_coworker_pending",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args,
    });
    expect(runtime.invalidateCoworker({
      workspaceId: "ws_coworker",
      ownerId: "account_coworker",
      coworkerId: "cw_guarded",
    })).toBe(1);
    expect(runtime.capabilities.activeRun("ses_coworker")).toBeNull();
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, _matterhornCallId: "call_coworker_pending" },
    })).toThrow("unknown, expired, or replayed");
  });

  test("carries only a content-free current Polymarket jurisdiction decision through the capability", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    runtime.setCoworkerResolver(() => true);
    const nowMs = Date.now();
    const jurisdiction = {
      version: "matterhorn.edge-jurisdiction.v2" as const,
      source: "vercel_ip_country" as const,
      country: "CH",
      region: "ZH",
      observedAt: new Date(nowMs - 1_000).toISOString(),
      expiresAt: new Date(nowMs + 59_000).toISOString(),
      evidenceHash: "c".repeat(64),
    };
    const coworker = {
      id: "cw_polymarket_policy",
      workspaceId: "ws_polymarket_policy",
      ownerId: "account_polymarket_policy",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: ["matterhorn.polymarket-wallet-preview"],
      allowedActionIds: ["polymarket_preview_trade"],
      allowedNetworks: ["polygon:mainnet"],
      automaticAuthorities: ["prepare"] as Array<"prepare">,
      actionBindings: [{
        connectionId: "cxc_polymarket_policy",
        appId: "matterhorn.polymarket-wallet-preview",
        manifestRevision: "1.0.0",
        actionId: "polymarket_preview_trade",
        network: "polygon:mainnet",
        proxyToolName: "matterhorn_polymarket_preview_order",
        access: "prepare" as const,
      }],
      allowedDataLabels: ["public", "wallet_private", "untrusted_external"] as Array<
        "public" | "wallet_private" | "untrusted_external"
      >,
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 0,
      maxPrepareCallsPerFamily: 1,
    };
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_polymarket_policy",
      sessionId: "ses_polymarket_policy",
      parts: [{ type: "text", text: "Prepare a five dollar public market order for wallet review" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-polymarket",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_polymarket_preview_order": true }],
      coworker,
      jurisdiction,
    });
    const args = { marketId: "market_1", outcome: "YES", side: "buy", amountUsdc: "5" };
    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_polymarket_policy",
      sessionId: "ses_polymarket_policy",
      callId: "call_polymarket_policy",
      agentId: "matterhorn-polymarket",
      toolName: "matterhorn-work_matterhorn_polymarket_preview_order",
      args,
    });
    const authorization = runtime.authorizeMcpTool({
      toolName: "matterhorn_polymarket_preview_order",
      args: { ...args, _matterhornCallId: "call_polymarket_policy" },
    });
    expect(authorization.jurisdictionPolicy).toMatchObject({
      evidenceHash: jurisdiction.evidenceHash,
      polymarketOpenPositionAllowed: true,
    });
    const serializedAuthorization = JSON.stringify(authorization);
    expect(serializedAuthorization).not.toContain(jurisdiction.country);
    expect(serializedAuthorization).not.toContain(jurisdiction.region);
    const receipt = await runtime.receipts.get("ws_polymarket_policy", accepted.runId);
    expect(JSON.stringify(receipt)).not.toContain(jurisdiction.country);
    expect(JSON.stringify(receipt)).not.toContain(jurisdiction.region);
    runtime.close();
  });

  test("revokes staged authority immediately when an exact app connection is disconnected", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    runtime.setCoworkerResolver(() => true);
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_connection",
      sessionId: "ses_connection",
      parts: [{ type: "text", text: "Read the approved Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker: {
        id: "cw_connection",
        workspaceId: "ws_connection",
        ownerId: "account_connection",
        revision: 1,
        policyVersion: "coworker-policy-1",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          connectionId: "cxc_connection",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionId: "sui_account_read",
          network: "sui:testnet",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 4,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const args = {
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      connectionId: "cxc_connection",
      actionId: "sui_account_read",
      access: "read",
      network: "sui:testnet",
      canonicalArgumentsHash: "b".repeat(64),
    };
    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_connection",
      sessionId: "ses_connection",
      callId: "call_connection_pending",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args,
    });

    expect(runtime.invalidateConnection({
      workspaceId: "ws_other",
      connectionId: "cxc_connection",
    })).toBe(0);
    expect(runtime.invalidateConnection({
      workspaceId: "ws_connection",
      connectionId: "cxc_connection",
    })).toBe(1);
    expect(runtime.capabilities.activeRun("ses_connection")).toBeNull();
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, _matterhornCallId: "call_connection_pending" },
    })).toThrow("unknown, expired, or replayed");
  });

  test("finalizes a coworker receipt exactly before revoking its tenant binding", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    runtime.setCoworkerResolver(() => true);
    const finalized: Array<{ status: string; coworkerId: string; bindingStillActive: boolean }> = [];
    runtime.setFinalizedRunHandler(async ({ receipt, coworker }) => {
      finalized.push({
        status: receipt.status,
        coworkerId: coworker.id,
        bindingStillActive: runtime.capabilities.coworkerForRun(receipt.runId)?.id === coworker.id,
      });
    });
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_coworker_finalized",
      sessionId: "ses_coworker_finalized",
      parts: [{ type: "text", text: "Read the public Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker: {
        id: "cw_finalized",
        workspaceId: "ws_coworker_finalized",
        ownerId: "account_finalized",
        revision: 1,
        policyVersion: "coworker-policy-1",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          connectionId: "cxc_sui",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionId: "sui_account_read",
          network: "sui:testnet",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 4,
        maxPrepareCallsPerFamily: 0,
      },
    });

    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      status: "success",
      usage: { inputTokens: 21, outputTokens: 8 },
    });

    expect(finalized).toEqual([{
      status: "success",
      coworkerId: "cw_finalized",
      bindingStillActive: true,
    }]);
    expect(runtime.capabilities.coworkerForRun(accepted.runId)).toBeNull();
    expect(await runtime.retryPendingFinalizedRuns()).toEqual({ checked: 0, sealed: 0, failed: 0 });
  });

  test("retries a failed coworker evidence seal without retaining agent authority", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    runtime.setCoworkerResolver(() => true);
    const coworker = {
      id: "cw_retry",
      workspaceId: "ws_coworker_retry",
      ownerId: "account_retry",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read"],
      allowedNetworks: ["sui:testnet"],
      automaticAuthorities: ["read" as const],
      actionBindings: [{
        connectionId: "cxc_sui",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        actionId: "sui_account_read",
        network: "sui:testnet",
        proxyToolName: "matterhorn_sui_get_balance",
        access: "read" as const,
      }],
      allowedDataLabels: ["public" as const, "untrusted_external" as const],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 4,
      maxPrepareCallsPerFamily: 0,
    };
    let attempts = 0;
    runtime.setFinalizedRunHandler(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("kms_temporarily_unavailable");
    });
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_coworker_retry",
      sessionId: "ses_coworker_retry",
      parts: [{ type: "text", text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker,
    });

    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      status: "success",
    });
    expect(runtime.capabilities.coworkerForRun(accepted.runId)).toBeNull();
    expect(await runtime.retryPendingFinalizedRuns()).toEqual({ checked: 1, sealed: 1, failed: 0 });
    expect(await runtime.retryPendingFinalizedRuns()).toEqual({ checked: 0, sealed: 0, failed: 0 });
    expect(attempts).toBe(2);

    runtime.setFinalizedRunHandler(async () => { throw new Error("kms_still_unavailable"); });
    const deletionRun = await runtime.acceptPrompt({
      workspaceId: "ws_coworker_retry",
      sessionId: "ses_coworker_deletion",
      parts: [{ type: "text", text: "Read public Sui state again" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker,
    });
    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: deletionRun.runId,
      status: "success",
    });
    expect(await runtime.retryPendingFinalizedRuns()).toEqual({ checked: 1, sealed: 0, failed: 1 });
    runtime.purgeWorkspace("ws_coworker_retry");
    expect(await runtime.retryPendingFinalizedRuns()).toEqual({ checked: 0, sealed: 0, failed: 0 });
  });

  test("does not run the coworker evidence finalizer for an unbound chat", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    let calls = 0;
    runtime.setFinalizedRunHandler(async () => { calls += 1; });
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_plain_finalized",
      sessionId: "ses_plain_finalized",
      parts: [{ type: "text", text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      status: "success",
    });
    expect(calls).toBe(0);
  });

  test("does not issue one-request consent when the coworker forbids unverified providers", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    const coworker = {
      id: "cw_private",
      workspaceId: "ws_private_coworker",
      ownerId: "account_private",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read"],
      allowedNetworks: ["sui:testnet"],
      automaticAuthorities: ["read" as const],
      actionBindings: [{
        connectionId: "cxc_sui",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        actionId: "sui_account_read",
        network: "sui:testnet",
        proxyToolName: "matterhorn_sui_get_balance",
        access: "read" as const,
      }],
      allowedDataLabels: [
        "public" as const,
        "workspace_private" as const,
        "untrusted_external" as const,
      ],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 4,
      maxPrepareCallsPerFamily: 0,
    };
    const input = {
      workspaceId: "ws_private_coworker",
      sessionId: "ses_private_coworker",
      parts: [{ type: "coworker_profile", text: "Private coworker mission", label: "workspace_private" as const }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      coworker,
    };
    const preflight = runtime.preflight(input);
    expect(preflight.decision).toBe("blocked");
    expect(preflight.challenge).toBeUndefined();
    await expect(runtime.acceptPrompt({ ...input, executionMode: "work" })).rejects.toMatchObject({
      code: "coworker_provider_not_allowed",
      status: 403,
    });

    const walletInput = {
      ...input,
      parts: [{ type: "wallet_context", text: "Linked wallet state", label: "wallet_private" as const }],
    };
    const walletPreflight = runtime.preflight(walletInput);
    expect(walletPreflight.decision).toBe("blocked");
    expect(walletPreflight.challenge).toBeUndefined();
    await expect(runtime.acceptPrompt({ ...walletInput, executionMode: "work" })).rejects.toMatchObject({
      code: "coworker_data_policy_denied",
      status: 403,
    });
  });

  test("keeps capabilities off while still producing an exact provider-usage receipt", async () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "off";
    const runtime = new MatterhornGuardedAgentRuntime();
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_off",
      sessionId: "ses_off",
      parts: [{ type: "text", text: "Public crypto research" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      executionMode: "work",
    });
    expect(accepted.runId).toStartWith("agent_run_off_");
    expect(runtime.capabilities.activeRun("ses_off")).toBeNull();
    runtime.bindUserMessage({ runId: accepted.runId, sessionId: "ses_off", messageId: "msg_off_user" });
    expect(runtime.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_off",
      userMessageId: "msg_off_user",
      assistantMessageId: "msg_off_assistant",
    })).toEqual({ runId: accepted.runId });
    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      status: "success",
      usage: { inputTokens: 120, outputTokens: 25, estimatedCostUsd: 0.001 },
    });
    expect(await runtime.receipts.get("ws_off", accepted.runId)).toMatchObject({
      status: "success",
      usage: { inputTokens: 120, outputTokens: 25, estimatedCostUsd: 0.001 },
    });
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  });

  test("shadow mode observes missing capabilities without blocking the existing tool flow", () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "shadow";
    const runtime = new MatterhornGuardedAgentRuntime();
    expect(runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}`, _matterhornCallId: "unknown-shadow-call" },
    })).toEqual({
      args: { address: `0x${"1".repeat(64)}` },
      runId: null,
      callId: null,
      workspaceId: null,
      sessionId: null,
      coworker: null,
      jurisdictionPolicy: null,
    });
    expect(runtime.observationSnapshot()).toContainEqual(expect.objectContaining({
      mode: "shadow",
      stage: "consume",
      decision: "would_deny",
      reason: "unknown_or_replayed_call_id",
      count: 1,
    }));
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  });

  test("shadow keeps privacy authoritative while capability decisions stay non-blocking", async () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "shadow";
    const runtime = new MatterhornGuardedAgentRuntime();
    await expect(runtime.acceptPrompt({
      workspaceId: "ws_shadow_privacy",
      sessionId: "ses_shadow_secret",
      parts: [{ type: "text", text: "private key: never-send-this-value" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      executionMode: "work",
    })).rejects.toMatchObject({ code: "agent_privacy_blocked" });

    const privateInput = {
      workspaceId: "ws_shadow_privacy",
      sessionId: "ses_shadow_private",
      parts: [{ type: "text" as const, text: "Use the selected memory to compare validators" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      memoryIds: ["memory_private"],
      executionMode: "work" as const,
    };
    const preflight = runtime.preflight(privateInput);
    expect(preflight.decision).toBe("consent_required");
    await expect(runtime.acceptPrompt(privateInput)).rejects.toMatchObject({ code: "agent_privacy_consent_required" });
    const consent = runtime.confirmConsent({
      challengeId: preflight.challenge?.id ?? "",
      requestHash: preflight.requestHash,
      workspaceId: privateInput.workspaceId,
      sessionId: privateInput.sessionId,
    });
    const accepted = await runtime.acceptPrompt({ ...privateInput, privacyConsentToken: consent.consentToken });
    expect(accepted.consentUsed).toBe(true);
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  });

  test("shadow records a denied issue and passes the existing call without a bearer capability", () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "shadow";
    const runtime = new MatterhornGuardedAgentRuntime();
    const staged = runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: "run_missing",
      workspaceId: "ws_shadow_issue",
      sessionId: "ses_without_grant",
      callId: "call_shadow_denied",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    });
    expect(staged).toEqual(expect.objectContaining({ accepted: true, callId: "call_shadow_denied" }));
    expect(runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}`, _matterhornCallId: "call_shadow_denied" },
    }).runId).toBeNull();
    expect(runtime.observationSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "issue", decision: "would_deny", reason: "capability_run_or_tool_not_found" }),
      expect.objectContaining({ stage: "consume", decision: "bypassed", reason: "capability_run_or_tool_not_found" }),
    ]));
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  });

  test("can enforce prepare tools before reads during a fail-closed rollout", async () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS = "prepare";
    process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS = "sui";
    const runtime = new MatterhornGuardedAgentRuntime();
    const accepted = await runtime.acceptPrompt({
      workspaceId: "ws_rollout",
      sessionId: "ses_rollout",
      parts: [{ type: "text", text: "Read my public Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });

    const stagedRead = runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_rollout",
      sessionId: "ses_rollout",
      callId: "call_rollout_read",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    });
    expect(stagedRead.accepted).toBe(true);
    expect(runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}`, _matterhornCallId: "call_rollout_read" },
    }).runId).toBeNull();

    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: accepted.runId,
      workspaceId: "ws_rollout",
      sessionId: "ses_rollout",
      callId: "call_rollout_mutated",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    });
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"2".repeat(64)}`, _matterhornCallId: "call_rollout_mutated" },
    })).toThrow("no longer matches its exact tool and arguments");

    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_preview_transfer",
      args: { network: "testnet", sender: `0x${"1".repeat(64)}`, recipient: `0x${"2".repeat(64)}`, amountSui: "1" },
    })).toThrow("did not include");
    delete process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS;
    delete process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS;
  });

  test("invalid rollout selectors fail readiness instead of bypassing tools", () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS = "sui,typo-desk";
    const runtime = new MatterhornGuardedAgentRuntime();
    expect(runtime.ready()).toBe(false);
    expect(() => runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    })).toThrow("did not include");
    delete process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS;
  });

  test("requires both server-only secrets before shadow can claim readiness", () => {
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "shadow";
    const savedSigningSecret = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    expect(new MatterhornGuardedAgentRuntime().ready()).toBe(false);
    process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = savedSigningSecret;
    expect(new MatterhornGuardedAgentRuntime().ready()).toBe(true);
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  });

  test("late messages, tools and completion from an earlier prompt cannot affect the replacement run", async () => {
    const runtime = new MatterhornGuardedAgentRuntime();
    const first = await runtime.acceptPrompt({
      workspaceId: "ws_exact_run",
      sessionId: "ses_exact_run",
      parts: [{ type: "text", text: "Read public Sui state" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    runtime.bindUserMessage({ runId: first.runId, sessionId: "ses_exact_run", messageId: "msg_user_first" });
    const second = await runtime.acceptPrompt({
      workspaceId: "ws_exact_run",
      sessionId: "ses_exact_run",
      parts: [{ type: "text", text: "Read public Sui balance instead" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    runtime.bindUserMessage({ runId: second.runId, sessionId: "ses_exact_run", messageId: "msg_user_second" });

    expect(() => runtime.bindRuntimeMessage({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      sessionId: "ses_exact_run",
      userMessageId: "msg_user_first",
      assistantMessageId: "msg_assistant_late",
    })).toThrow("assistant message is not bound");
    expect(() => runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: first.runId,
      workspaceId: "ws_exact_run",
      sessionId: "ses_exact_run",
      callId: "call_late_first",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    })).toThrow("capability_run_or_tool_not_found");
    await runtime.completeRun({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      runId: first.runId,
      status: "error",
    });
    expect(runtime.capabilities.activeRun("ses_exact_run")).toBe(second.runId);
  });

  test("rejects dispatch when provider privacy terms change after authorization", async () => {
    const keys = [
      "MATTERHORN_CUDOS_TRAINING_USE",
      "MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS",
      "MATTERHORN_CUDOS_PRIVACY_POLICY_URL",
      "MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.MATTERHORN_CUDOS_TRAINING_USE = "none";
      process.env.MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS = "30";
      process.env.MATTERHORN_CUDOS_PRIVACY_POLICY_URL = "https://provider.example/privacy";
      process.env.MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT = new Date().toISOString();
      const runtime = new MatterhornGuardedAgentRuntime();
      const input = {
        workspaceId: "ws_policy_drift",
        sessionId: "ses_policy_drift",
        parts: [{ type: "text" as const, text: "Use this private workspace context" }],
        memoryIds: ["memory_policy_drift"],
        providerId: "cudos",
        modelId: "asi1-mini",
        executionMode: "work" as const,
      };
      const authorization = runtime.authorizePrompt(input);
      expect(authorization.preflight.provider.privacyStatus).toBe("verified_no_training");

      delete process.env.MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS;
      await expect(runtime.startAuthorizedPrompt(input, authorization)).rejects.toMatchObject({
        code: "agent_privacy_policy_changed",
      });
      expect(await runtime.receipts.list(input.workspaceId)).toHaveLength(0);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
