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
