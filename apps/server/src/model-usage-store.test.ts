import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MatterhornModelUsageStore,
  modelUsageAssistantMessages,
  resolveMatterhornModelUsageConfig,
  type MatterhornModelUsageConfig,
} from "./model-usage-store.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function store(config: Partial<MatterhornModelUsageConfig> = {}) {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-model-usage-"));
  roots.push(root);
  return new MatterhornModelUsageStore({
    path: join(root, "usage.db"),
    config: {
      enforcement: "hard",
      dailyLimit: 100_000,
      monthlyLimit: 500_000,
      globalDailyLimit: 1_000_000,
      globalMonthlyLimit: 5_000_000,
      reservationTokens: 20_000,
      modelWeights: {},
      ...config,
    },
  });
}

describe("MatterhornModelUsageStore", () => {
  test("enforces a global monthly cap across distinct subjects", async () => {
    const usage = await store({ globalDailyLimit: null, globalMonthlyLimit: 20_000 });
    const request = { workspaceId: "ws_global", sessionId: "ses_global", providerId: "cudos", modelId: "asi1-mini" };
    expect(usage.reserve({ ...request, subject: { id: "user_global_a" } }).allowed).toBe(true);
    const second = usage.reserve({ ...request, subject: { id: "user_global_b" } });
    expect(second.allowed).toBe(false);
    expect(second.status.blockReason).toBe("global_monthly_limit");
    expect(second.status.monthly.usedTokens).toBe(0);
  });

  test("a UTC day reset preserves the same month's reserved allowance", async () => {
    const usage = await store({ monthlyLimit: 20_000 });
    const createdAt = Date.UTC(2026, 8, 17, 23, 59);
    const request = {
      subject: { id: "user_midnight" }, workspaceId: "ws_midnight", sessionId: "ses_midnight",
      providerId: "cudos", modelId: "asi1-mini",
    };
    expect(usage.reserve({ ...request, now: new Date(createdAt) }).allowed).toBe(true);
    const afterMidnight = new Date(createdAt + 2 * 60_000);
    const status = usage.status(request.subject, afterMidnight);
    expect(status.daily.chargedTokens).toBe(20_000);
    expect(status.monthly.chargedTokens).toBe(20_000);
    expect(usage.reserve({ ...request, now: afterMidnight }).allowed).toBe(false);
  });

  test("keeps tool-loop reservations pending and charges every step exactly once", async () => {
    const usage = await store();
    const createdAt = Date.now();
    const scope = { subject: { id: "user_steps" }, workspaceId: "ws_steps", sessionId: "ses_steps" };
    usage.reserve({ ...scope, providerId: "cudos", modelId: "asi1-mini", now: new Date(createdAt) });
    const step = (id: string, offset: number, total: number, finish: string) => ({
      info: {
        id, parentID: "msg_user_steps", sessionID: scope.sessionId, role: "assistant",
        providerID: "cudos", modelID: "asi1-mini", finish,
        time: { created: createdAt + offset, completed: createdAt + offset + 1 },
        tokens: { total, input: total - 100, output: 100 }, cost: total / 1_000_000,
      }, parts: [],
    });
    const tool = step("msg_steps_tool", 10, 1000, "tool-calls");
    const final = step("msg_steps_final", 30, 1500, "stop");
    expect(usage.reconcile({ ...scope, messages: [tool] })).toBe(0);
    expect(usage.status(scope.subject).pendingRequests).toBe(1);
    expect(usage.status(scope.subject).monthly.chargedTokens).toBe(20_000);
    expect(usage.reconcile({ ...scope, messages: [tool, final] })).toBe(1);
    expect(usage.status(scope.subject).monthly.usedTokens).toBe(2500);
    expect(usage.status(scope.subject).models[0]?.providerCostUsd).toBe(0.0025);
    expect(usage.reconcile({ ...scope, messages: [tool, final] })).toBe(0);
    expect(usage.status(scope.subject).monthly.usedTokens).toBe(2500);
  });

  test("does not close usage on a provider stop that still contains a tool call", async () => {
    const usage = await store();
    const createdAt = Date.now();
    const scope = { subject: { id: "user_tool_stop" }, workspaceId: "ws_tool_stop", sessionId: "ses_tool_stop" };
    usage.reserve({ ...scope, providerId: "cudos", modelId: "asi1-mini", now: new Date(createdAt) });
    const info = {
      id: "msg_tool_stop", parentID: "msg_user_tool_stop", sessionID: scope.sessionId, role: "assistant",
      providerID: "cudos", modelID: "asi1-mini", finish: "stop",
      time: { created: createdAt + 10, completed: createdAt + 20 },
      tokens: { total: 1000 }, cost: 0,
    };
    const tool = { info, parts: [{ type: "tool", state: { status: "completed" } }] };
    expect(usage.reconcile({ ...scope, messages: [tool] })).toBe(0);
    expect(usage.status(scope.subject).pendingRequests).toBe(1);
    const final = { info: { ...info, id: "msg_tool_stop_final", time: { created: createdAt + 30, completed: createdAt + 40 } }, parts: [] };
    expect(usage.reconcile({ ...scope, messages: [tool, final] })).toBe(1);
    expect(usage.status(scope.subject).monthly.usedTokens).toBe(2000);
  });

  test("rejects cross-session usage and deduplicates repeated step records", async () => {
    const usage = await store();
    const createdAt = Date.now();
    const scope = { subject: { id: "user_usage_scope" }, workspaceId: "ws_usage_scope", sessionId: "ses_usage_scope" };
    usage.reserve({ ...scope, providerId: "cudos", modelId: "asi1-mini", now: new Date(createdAt) });
    const message = {
      info: {
        id: "msg_usage_scope", parentID: "msg_user_usage_scope", sessionID: scope.sessionId, role: "assistant",
        providerID: "cudos", modelID: "asi1-mini", finish: "stop",
        time: { created: createdAt + 10, completed: createdAt + 20 }, tokens: { total: 1500 }, cost: 0,
      }, parts: [],
    };
    expect(usage.reconcile({ ...scope, messages: [{ ...message, info: { ...message.info, sessionID: "other_session" } }] })).toBe(0);
    expect(usage.reconcile({ ...scope, subject: { id: "other_subject" }, messages: [message] })).toBe(0);
    expect(usage.reconcile({ ...scope, messages: [message, message] })).toBe(1);
    expect(usage.status(scope.subject).monthly.usedTokens).toBe(1500);
    usage.reserve({ ...scope, providerId: "cudos", modelId: "asi1-mini" });
    expect(usage.reconcile({ ...scope, messages: [message] })).toBe(0);
    expect(usage.status(scope.subject).pendingRequests).toBe(1);
  });

  test("defaults to off unless deployment explicitly enables enforcement", () => {
    expect(resolveMatterhornModelUsageConfig({}).enforcement).toBe("off");
    expect(resolveMatterhornModelUsageConfig({
      MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard",
    }).enforcement).toBe("hard");
    expect(resolveMatterhornModelUsageConfig({
      MATTERHORN_MODEL_USAGE_ENFORCEMENT: "typo",
    }).enforcement).toBe("hard");
  });

  test("reserves quota before a model request and blocks at the hard daily limit", async () => {
    const usage = await store({ dailyLimit: 40_000 });
    const subject = { id: "user_1" };
    expect(usage.reserve({
      subject,
      workspaceId: "ws_1",
      sessionId: "ses_1",
      providerId: "cudos",
      modelId: "asi1-mini",
    }).allowed).toBe(true);
    expect(usage.reserve({
      subject,
      workspaceId: "ws_1",
      sessionId: "ses_2",
      providerId: "cudos",
      modelId: "asi1-mini",
    }).allowed).toBe(true);

    const blocked = usage.reserve({
      subject,
      workspaceId: "ws_1",
      sessionId: "ses_3",
      providerId: "cudos",
      modelId: "asi1-mini",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.status.blockReason).toBe("daily_limit");
    expect(blocked.status.pendingRequests).toBe(2);
  });

  test("reconciles reservations from authoritative completed assistant messages", async () => {
    const usage = await store();
    const subject = { id: "user_2" };
    const createdAt = Date.now();
    usage.reserve({
      subject,
      workspaceId: "ws_2",
      sessionId: "ses_2",
      providerId: "cudos",
      modelId: "asi1-mini",
      now: new Date(createdAt),
    });

    const reconciled = usage.reconcile({
      subject,
      workspaceId: "ws_2",
      sessionId: "ses_2",
      messages: [{
        info: {
          id: "msg_assistant_1",
          sessionID: "ses_2",
          role: "assistant",
          providerID: "cudos",
          modelID: "asi1-mini",
          time: { created: createdAt + 10, completed: createdAt + 500 },
          tokens: {
            total: 1_500,
            input: 1_000,
            output: 400,
            reasoning: 100,
            cache: { read: 200, write: 50 },
          },
          cost: 0.0025,
        },
        parts: [],
      }],
    });

    expect(reconciled).toBe(1);
    const status = usage.status(subject);
    expect(status.pendingRequests).toBe(0);
    expect(status.monthly.usedTokens).toBe(1_500);
    expect(status.monthly.chargedTokens).toBe(1_500);
    expect(status.models[0]).toMatchObject({
      providerId: "cudos",
      modelId: "asi1-mini",
      requests: 1,
      rawTokens: 1_500,
      providerCostUsd: 0.0025,
    });
  });

  test("applies configured model weights to reservations and reconciled usage", async () => {
    const usage = await store({
      modelWeights: { "cudos/meta-llama/llama-3.3-70b-instruct": 2 },
    });
    const subject = { id: "user_3" };
    const createdAt = Date.now();
    usage.reserve({
      subject,
      workspaceId: "ws_3",
      sessionId: "ses_3",
      providerId: "cudos",
      modelId: "meta-llama/llama-3.3-70b-instruct",
      now: new Date(createdAt),
    });
    expect(usage.status(subject).monthly.chargedTokens).toBe(40_000);

    usage.reconcile({
      subject,
      workspaceId: "ws_3",
      sessionId: "ses_3",
      messages: [{
        info: {
          id: "msg_assistant_3",
          sessionID: "ses_3",
          role: "assistant",
          providerID: "cudos",
          modelID: "meta-llama/llama-3.3-70b-instruct",
          time: { created: createdAt + 10, completed: createdAt + 500 },
          tokens: { input: 1_000, output: 1_000, reasoning: 0, cache: { read: 0, write: 0 } },
          cost: 0,
        },
        parts: [],
      }],
    });
    expect(usage.status(subject).monthly.chargedTokens).toBe(4_000);
  });

  test("blocks a weighted reservation that would exceed the remaining allowance", async () => {
    const usage = await store({
      dailyLimit: 30_000,
      modelWeights: { "cudos/large": 2 },
    });
    const blocked = usage.reserve({
      subject: { id: "user_weighted_block" },
      workspaceId: "ws_weighted",
      sessionId: "ses_weighted",
      providerId: "cudos",
      modelId: "large",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.status.blockReason).toBe("daily_limit");
  });

  test("keeps an unreconciled reservation charged and cancels rejected dispatches", async () => {
    const usage = await store();
    const subject = { id: "user_4" };
    const reservation = usage.reserve({
      subject,
      workspaceId: "ws_4",
      sessionId: "ses_4",
      providerId: "cudos",
      modelId: "asi1-mini",
    });
    expect(reservation.allowed).toBe(true);
    if (!reservation.allowed) throw new Error("Expected reservation");
    expect(usage.status(subject).monthly.reservedTokens).toBe(20_000);
    usage.cancel(reservation.reservationId);
    expect(usage.status(subject).monthly.chargedTokens).toBe(0);
  });

  test("retains unresolved reservations after the inference window and reconciles late usage once", async () => {
    const usage = await store({ dailyLimit: 20_000 });
    const subject = { id: "user_stale_reservation" };
    const createdAt = Date.UTC(2026, 7, 10, 12, 0, 0);
    expect(usage.reserve({
      subject,
      workspaceId: "ws_stale",
      sessionId: "ses_stale",
      providerId: "cudos",
      modelId: "asi1-mini",
      now: new Date(createdAt),
    }).allowed).toBe(true);

    expect(usage.status(subject, new Date(createdAt + 14 * 60 * 1000)).pendingRequests).toBe(1);
    const retained = usage.status(subject, new Date(createdAt + 15 * 60 * 1000));
    expect(retained.pendingRequests).toBe(1);
    expect(retained.daily.chargedTokens).toBe(20_000);
    expect(usage.reserve({
      subject,
      workspaceId: "ws_stale",
      sessionId: "ses_after_release",
      providerId: "cudos",
      modelId: "asi1-mini",
      now: new Date(createdAt + 15 * 60 * 1000),
    }).allowed).toBe(false);
    const input = { subject, workspaceId: "ws_stale", sessionId: "ses_stale", messages: [{ info: {
      id: "msg_late", parentID: "msg_request", sessionID: "ses_stale", role: "assistant",
      providerID: "cudos", modelID: "asi1-mini", finish: "stop",
      time: { created: createdAt + 1, completed: createdAt + 20 * 60_000 }, tokens: { total: 2500 },
    }, parts: [] }] };
    expect(usage.reconcile(input)).toBe(1);
    expect(usage.reconcile(input)).toBe(0);
    const reconciled = usage.status(subject, new Date(createdAt + 21 * 60_000));
    expect(reconciled.pendingRequests).toBe(0);
    expect(reconciled.monthly.usedTokens).toBe(2500);
    expect(reconciled.monthly.chargedTokens).toBe(2500);
    usage.close();
  });

  test("pending holds survive restart and month rollover without leaking across subjects", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-model-usage-restart-"));
    roots.push(root);
    const path = join(root, "usage.db");
    const config = resolveMatterhornModelUsageConfig({ MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard" });
    const createdAt = Date.UTC(2026, 7, 31, 23, 59);
    const scope = { subject: { id: "restart_owner" }, workspaceId: "ws_restart", sessionId: "ses_restart" };
    const first = new MatterhornModelUsageStore({ path, config });
    const reservation = first.reserve({ ...scope, providerId: "cudos", modelId: "asi1-mini", now: new Date(createdAt) });
    first.close();
    const restored = new MatterhornModelUsageStore({ path, config });
    try {
      const later = new Date(createdAt + 24 * 60 * 60_000);
      const status = restored.status(scope.subject, later);
      expect(status.daily.reservedTokens).toBe(config.reservationTokens);
      expect(status.monthly.chargedTokens).toBe(config.reservationTokens);
      expect(status.monthly.usedTokens).toBe(0);
      expect(restored.pendingSessions(scope.subject)).toEqual([{ workspaceId: scope.workspaceId, sessionId: scope.sessionId }]);
      expect(restored.status({ id: "other_owner" }, later).monthly.chargedTokens).toBe(0);
      expect(restored.pendingSessions({ id: "other_owner" })).toEqual([]);
      const late = { ...scope, messages: [{ info: {
        id: "msg_restart_late", role: "assistant", sessionID: scope.sessionId, parentID: "msg_restart_user",
        providerID: "cudos", modelID: "asi1-mini", finish: "stop",
        time: { created: createdAt + 1, completed: later.getTime() }, tokens: { total: 2500 },
      }, parts: [] }] };
      expect(restored.reconcile({ ...late, subject: { id: "other_owner" } })).toBe(0);
      expect(restored.reconcile(late)).toBe(1);
      expect(restored.reconcile(late)).toBe(0);
      // Final usage belongs to the request's original accounting period.
      expect(restored.status(scope.subject, new Date(createdAt)).monthly.usedTokens).toBe(2500);
      expect(restored.status(scope.subject, later).monthly.chargedTokens).toBe(0);
      restored.cancel(reservation.reservationId);
      restored.cancel(reservation.reservationId);
      expect(restored.status(scope.subject, new Date(createdAt)).monthly.usedTokens).toBe(2500);
      expect(restored.status(scope.subject, later).monthly.chargedTokens).toBe(0);
      expect(restored.pendingSessions(scope.subject)).toEqual([]);
    } finally { restored.close(); }
  });

  test("normalizes only completed assistant usage records", () => {
    expect(modelUsageAssistantMessages([
      { info: { id: "user", role: "user", time: { created: 1, completed: 2 }, tokens: {} } },
      { info: { id: "pending", role: "assistant", time: { created: 1 }, tokens: {} } },
      {
        info: {
          id: "assistant",
          role: "assistant",
          providerID: "cudos",
          modelID: "asi1-mini",
          time: { created: 1, completed: 2 },
          tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 3, write: 0 } },
          cost: 0,
        },
      },
    ])).toEqual([expect.objectContaining({ id: "assistant", rawTokens: 16 })]);
  });
});
