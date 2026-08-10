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

  test("releases abandoned reservations after the bounded inference window", async () => {
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
    const released = usage.status(subject, new Date(createdAt + 15 * 60 * 1000));
    expect(released.pendingRequests).toBe(0);
    expect(released.daily.chargedTokens).toBe(0);
    expect(usage.reserve({
      subject,
      workspaceId: "ws_stale",
      sessionId: "ses_after_release",
      providerId: "cudos",
      modelId: "asi1-mini",
      now: new Date(createdAt + 15 * 60 * 1000),
    }).allowed).toBe(true);
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
