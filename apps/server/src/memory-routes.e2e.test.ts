import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_memory_routes_token";
const HOST_TOKEN = "owt_memory_routes_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function baseConfig(port: number): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [],
    authorizedRoots: [],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-memory-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  const server = await startServer(baseConfig(await getFreePort())) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

function record(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-22T00:00:00.000Z").toISOString();
  return {
    id: "mem_route_tao_wallet",
    kind: "protocol_address",
    scope: "workspace",
    title: "Main TAO wallet",
    summary: "Public SS58 address label for TAO balance checks.",
    body: {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture",
      netuid: 14,
    },
    tags: ["bittensor", "tao", "wallet"],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.95,
      reasonRemembered: "The user confirmed this public address can be reused for TAO read workflows.",
    },
    sensitivity: "public",
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: true,
    canDelete: true,
    ...overrides,
  };
}

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    version: "matterhorn.memory.suggestion.v1",
    id: overrides.id ?? "suggestion_route_tao_wallet",
    proposedRecord: overrides.proposedRecord ?? record({
      id: "mem_route_suggestion_tao_wallet",
      title: "Suggested TAO wallet",
      summary: "Public SS58 address suggested from chat context.",
    }),
    reason: overrides.reason ?? "The user asked to reuse this public Bittensor address.",
    source: overrides.source ?? "chat_capture",
    confidence: overrides.confidence ?? 0.9,
    desk: overrides.desk ?? "bittensor",
    useCase: overrides.useCase ?? "bittensor_wallet_label",
    userAction: overrides.userAction ?? "dismiss",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    policyDecision: overrides.policyDecision,
    policyWarnings: overrides.policyWarnings,
  };
}

async function jsonFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) {
      delete process.env[key === "memoryRoot" ? "MATTERHORN_WORK_MEMORY_ROOT" : key === "envStore" ? "OPENWORK_ENV_STORE" : "OPENWORK_TOKEN_STORE"];
    }
  }
  if (priorEnv.envStore !== undefined) process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  if (priorEnv.tokenStore !== undefined) process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  if (priorEnv.memoryRoot !== undefined) process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
});

describe("Matterhorn memory API routes", () => {
  test("plans Bittensor and Wellness suggestions without writing memory", async () => {
    const { base } = await boot();

    const planned = await jsonFetch(base, "/api/memory/suggestions/plan", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Show TAO for 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture and compare validators on subnet 14.",
          sourceId: "memory-route-test",
        },
      }),
    });
    expect(planned.response.status).toBe(200);
    expect(planned.payload.success).toBe(true);
    expect(planned.payload.writesMemory).toBe(false);
    expect(planned.payload.safety.captureMode).toBe("user_confirmed_only");
    expect(planned.payload.safety.canAutoCapture).toBe(false);
    expect(planned.payload.count).toBeGreaterThanOrEqual(2);
    expect(planned.payload.suggestions.map((item: { useCase: string }) => item.useCase)).toContain("bittensor_wallet_label");
    expect(planned.payload.suggestions.map((item: { useCase: string }) => item.useCase)).toContain("bittensor_subnet_watch_preference");

    const safetyBoilerplate = await jsonFetch(base, "/api/memory/suggestions/plan", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Use Bittensor chat for 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture. Do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
        },
      }),
    });
    expect(safetyBoilerplate.response.status).toBe(200);
    expect(safetyBoilerplate.payload.count).toBeGreaterThanOrEqual(1);

    const beforeConfirm = await jsonFetch(base, "/api/memory/search?tags=bittensor&limit=5");
    expect(beforeConfirm.response.status).toBe(200);
    expect(beforeConfirm.payload.count).toBe(0);

    const confirmed = await jsonFetch(base, "/api/memory/suggestions/resolve", {
      method: "POST",
      body: JSON.stringify({ suggestion: planned.payload.suggestions[0], action: "confirm" }),
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload.saved).toBe(true);

    const afterConfirm = await jsonFetch(base, "/api/memory/search?tags=bittensor&limit=5");
    expect(afterConfirm.response.status).toBe(200);
    expect(afterConfirm.payload.count).toBe(1);

    const wellness = await jsonFetch(base, "/api/memory/suggestions/plan", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "wellness",
          prompt: "Create a safe trainer onboarding workflow for a new client.",
          templateId: "wellness_creator_workflow",
        },
      }),
    });
    expect(wellness.response.status).toBe(200);
    expect(wellness.payload.writesMemory).toBe(false);
    expect(wellness.payload.count).toBe(1);
    expect(wellness.payload.suggestions[0].desk).toBe("wellness");
    expect(wellness.payload.suggestions[0].proposedRecord.sensitivity).toBe("restricted");
    expect(wellness.payload.suggestions[0].canAutoCapture).toBe(false);
  });

  test("rejects secret-shaped suggestion planning input", async () => {
    const { base } = await boot();

    const rejected = await jsonFetch(base, "/api/memory/suggestions/plan", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "remember my seed phrase alpha beta gamma delta",
        },
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("memory_suggestion_secret_rejected");
  });

  test("stores and resolves pending memory suggestions through the inbox", async () => {
    const { base } = await boot();

    const created = await jsonFetch(base, "/api/memory/suggestions", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture for TAO reads and subnet 14.",
          sourceId: "memory-inbox-test",
        },
      }),
    });
    expect(created.response.status).toBe(200);
    expect(created.payload.success).toBe(true);
    expect(created.payload.writesMemory).toBe(false);
    expect(created.payload.inbox.count).toBeGreaterThanOrEqual(2);
    expect(created.payload.inbox.entries.every((entry: { status: string }) => entry.status === "pending")).toBe(true);
    expect(created.payload.inbox.entries.every((entry: {
      actorConfirmationRequired: boolean;
      dismissalWindowDays: number;
      suggestionId: string;
      dedupeKey: string;
    }) => (
      entry.actorConfirmationRequired === true &&
      entry.dismissalWindowDays === 30 &&
      typeof entry.suggestionId === "string" &&
      entry.suggestionId.length > 0 &&
      typeof entry.dedupeKey === "string" &&
      entry.dedupeKey.length > 0
    ))).toBe(true);

    const beforeResolve = await jsonFetch(base, "/api/memory/search?tags=bittensor&limit=5");
    expect(beforeResolve.response.status).toBe(200);
    expect(beforeResolve.payload.count).toBe(0);

    const pending = await jsonFetch(base, "/api/memory/suggestions?status=pending&desk=bittensor&limit=10");
    expect(pending.response.status).toBe(200);
    expect(pending.payload.count).toBeGreaterThanOrEqual(2);
    const walletEntry = pending.payload.entries.find((entry: { suggestion: { useCase: string } }) => entry.suggestion.useCase === "bittensor_wallet_label");
    expect(walletEntry).toBeTruthy();
    expect(walletEntry.suggestion.canAutoCapture).toBe(false);
    expect(walletEntry.suggestion.requiresExplicitConsent).toBe(true);

    const fetched = await jsonFetch(base, `/api/memory/suggestions/${walletEntry.id}`);
    expect(fetched.response.status).toBe(200);
    expect(fetched.payload.entry.id).toBe(walletEntry.id);
    expect(fetched.payload.entry.suggestionId).toBe(walletEntry.id);
    expect(fetched.payload.entry.actorConfirmationRequired).toBe(true);
    expect(fetched.payload.entry.kind).toBe(fetched.payload.entry.suggestion.proposedRecord.kind);
    expect(fetched.payload.entry.scope).toBe(fetched.payload.entry.suggestion.proposedRecord.scope);
    expect(fetched.payload.entry.sensitivity).toBe(fetched.payload.entry.suggestion.proposedRecord.sensitivity);

    const confirmed = await jsonFetch(base, `/api/memory/suggestions/${walletEntry.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        action: "edit",
        patch: { title: "Edited TAO wallet memory" },
        reason: "User confirmed from the visible suggestion inbox.",
      }),
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload.saved).toBe(true);
    expect(confirmed.payload.entry.status).toBe("edited");
    expect(confirmed.payload.entry.lastAction).toBe("edit");
    expect(confirmed.payload.entry.resolutionReason).toBe("User confirmed from the visible suggestion inbox.");
    expect(confirmed.payload.record.title).toBe("Edited TAO wallet memory");

    const afterResolve = await jsonFetch(base, "/api/memory/search?tags=bittensor&limit=5");
    expect(afterResolve.response.status).toBe(200);
    expect(afterResolve.payload.count).toBe(1);

    const resolvedVisible = await jsonFetch(base, `/api/memory/suggestions/${walletEntry.id}`);
    expect(resolvedVisible.response.status).toBe(200);
    expect(resolvedVisible.payload.entry.status).toBe("edited");
    expect(resolvedVisible.payload.entry.recordId).toBe(confirmed.payload.record.id);

    const dismissCreated = await jsonFetch(base, "/api/memory/suggestions", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "wellness",
          prompt: "Remember that this trainer workflow should stay educational and weekly.",
          templateId: "wellness_creator_workflow",
        },
      }),
    });
    expect(dismissCreated.response.status).toBe(200);
    const wellnessEntry = dismissCreated.payload.inbox.entries[0];
    expect(wellnessEntry.suggestion.proposedRecord.sensitivity).toBe("restricted");
    expect(wellnessEntry.suggestion.proposedRecord.canExport).toBe(false);

    const dismissed = await jsonFetch(base, `/api/memory/suggestions/${wellnessEntry.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action: "dismiss", reason: "User does not want this remembered." }),
    });
    expect(dismissed.response.status).toBe(200);
    expect(dismissed.payload.saved).toBe(false);
    expect(dismissed.payload.dismissed).toBe(true);
    expect(dismissed.payload.entry.status).toBe("dismissed");
    expect(dismissed.payload.entry.dismissedUntil).toBeTruthy();
    expect(dismissed.payload.entry.lastAction).toBe("dismiss");
    expect(dismissed.payload.entry.resolutionReason).toBe("User does not want this remembered.");
  });

  test("capture, search, update, export, and forget records", async () => {
    const { base, dir } = await boot();

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    expect(captured.response.status).toBe(200);
    expect(captured.payload.success).toBe(true);
    expect(captured.payload.record.id).toBe("mem_route_tao_wallet");
    expect(captured.payload.markdownPath).toContain("Protocols/Bittensor");

    const marketCapture = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_hyperliquid_watch",
          kind: "watchlist",
          title: "Hyperliquid BTC watch",
          summary: "Watch BTC funding and price movement without enabling execution.",
          body: { market: "BTC", watch: "funding and price movement" },
          tags: ["hyperliquid", "watchlist"],
          canExport: false,
        }),
      }),
    });
    expect(marketCapture.response.status).toBe(200);

    const search = await jsonFetch(base, "/api/memory/search?q=TAO&tags=bittensor&limit=5");
    expect(search.response.status).toBe(200);
    expect(search.payload.count).toBe(1);
    expect(search.payload.records[0].title).toBe("Main TAO wallet");

    const marketSearch = await jsonFetch(base, "/api/memory/search?tags=hyperliquid&limit=5");
    expect(marketSearch.response.status).toBe(200);
    expect(marketSearch.payload.count).toBe(1);

    const dismissedSuggestion = await jsonFetch(base, "/api/memory/suggestions/resolve", {
      method: "POST",
      body: JSON.stringify({ suggestion: suggestion(), action: "dismiss" }),
    });
    expect(dismissedSuggestion.response.status).toBe(200);
    expect(dismissedSuggestion.payload.saved).toBe(false);
    expect(dismissedSuggestion.payload.dismissed).toBe(true);

    const dismissedGet = await jsonFetch(base, "/api/memory/entities/mem_route_suggestion_tao_wallet");
    expect(dismissedGet.response.status).toBe(404);

    const confirmedSuggestion = await jsonFetch(base, "/api/memory/suggestions/resolve", {
      method: "POST",
      body: JSON.stringify({ suggestion: suggestion({ userAction: "confirm" }), action: "confirm" }),
    });
    expect(confirmedSuggestion.response.status).toBe(200);
    expect(confirmedSuggestion.payload.saved).toBe(true);
    expect(confirmedSuggestion.payload.record.id).toBe("mem_route_suggestion_tao_wallet");

    const marketMcpSearch = await jsonFetch(base, "/api/memory/search?tags=hyperliquid&surface=mcp&limit=5");
    expect(marketMcpSearch.response.status).toBe(200);
    expect(marketMcpSearch.payload.count).toBe(0);

    const marketMcpGet = await jsonFetch(base, "/api/memory/entities/mem_route_hyperliquid_watch?surface=mcp");
    expect(marketMcpGet.response.status).toBe(403);
    expect(marketMcpGet.payload.code).toBe("memory_policy_blocks_mcp_api");

    const fetched = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet");
    expect(fetched.response.status).toBe(200);
    expect(fetched.payload.record.body.netuid).toBe(14);

    const updated = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet", {
      method: "PATCH",
      body: JSON.stringify({ patch: { summary: "Updated public TAO wallet label." } }),
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.record.summary).toContain("Updated");

    const exported = await jsonFetch(base, "/api/memory/export", {
      method: "POST",
      body: JSON.stringify({ outputDir: join(dir, "memory-export") }),
    });
    expect(exported.response.status).toBe(200);
    expect(exported.payload.export.recordCount).toBe(2);
    expect(exported.payload.export.sha256).toHaveLength(64);

    const forgotten = await jsonFetch(base, "/api/memory/forget", {
      method: "POST",
      body: JSON.stringify({ id: "mem_route_tao_wallet", reason: "test cleanup" }),
    });
    expect(forgotten.response.status).toBe(200);
    expect(forgotten.payload.forgotten).toBe(true);

    const afterForget = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet");
    expect(afterForget.response.status).toBe(404);
  });

  test("rejects forbidden secret material before writing", async () => {
    const { base } = await boot();
    const rejected = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_secret_rejected",
          body: { privateKey: "0xabc" },
        }),
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("memory_safety_rejected");

    const rejectedSuggestion = await jsonFetch(base, "/api/memory/suggestions/resolve", {
      method: "POST",
      body: JSON.stringify({
        suggestion: suggestion({
          id: "suggestion_route_secret_rejected",
          userAction: "confirm",
          proposedRecord: record({
            id: "mem_route_secret_suggestion_rejected",
            body: { privateKey: "0xabc" },
          }),
        }),
        action: "confirm",
      }),
    });
    expect(rejectedSuggestion.response.status).toBe(400);
    expect(rejectedSuggestion.payload.code).toBe("memory_safety_rejected");
  });

  test("rejects records that violate desk policy flags", async () => {
    const { base } = await boot();
    const rejected = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_market_export_rejected",
          kind: "watchlist",
          title: "Hyperliquid export violation",
          summary: "This market memory tries to enable export.",
          body: { market: "BTC" },
          tags: ["hyperliquid"],
          canExport: true,
        }),
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("memory_safety_rejected");
  });
});
