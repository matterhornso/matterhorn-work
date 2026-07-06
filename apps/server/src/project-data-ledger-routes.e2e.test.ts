import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import { recordAudit } from "./audit.js";
import { recordTaskEvent } from "./task-events.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_project_data_ledger_routes_token";
const HOST_TOKEN = "owt_project_data_ledger_routes_host_token";
const SECRET_HEX = "f".repeat(64);
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  opencodeDb: process.env.OPENCODE_DB,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv(key: keyof typeof priorEnv, envName: string) {
  const value = priorEnv[key];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

function baseConfig(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_ledger",
      name: "Project data ledger test workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly,
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

async function boot(options: { readOnly?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-project-data-ledger-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  process.env.OPENCODE_DB = join(dir, "opencode.db");
  const server = await startServer(baseConfig(await getFreePort(), dir, options.readOnly ?? false)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(
  base: string,
  path: string,
  init: RequestInit = {},
  token = TOKEN,
): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function hostFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Matterhorn-Host-Token": HOST_TOKEN,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv("envStore", "OPENWORK_ENV_STORE");
  restoreEnv("openworkDataDir", "OPENWORK_DATA_DIR");
  restoreEnv("tokenStore", "OPENWORK_TOKEN_STORE");
  restoreEnv("memoryRoot", "MATTERHORN_WORK_MEMORY_ROOT");
  restoreEnv("opencodeDb", "OPENCODE_DB");
});

describe("project data ledger routes", () => {
  test("GET /workspace/:id/data-ledger unifies project evidence, audit, and feedback with redaction", async () => {
    const { base, dir } = await boot();

    const createdNote = await jsonFetch(base, "/workspace/ws_ledger/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Ledger note",
        body: "Capture the output receipt in the project evidence trail.",
        desk: "bittensor",
        sessionId: "sess_ledger",
        outputPath: "outputs/bittensor/sess_ledger/receipt.md",
        source: "manual",
      }),
    });
    expect(createdNote.response.status).toBe(201);

    const feedback = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({
        kind: "comment",
        target: {
          sourceType: "task",
          sourceId: "task_ledger",
          href: "/workspace/ws_ledger/session",
        },
        comment: `Helpful response, but never log Bearer supersecret123 or private key ${SECRET_HEX}.`,
      }),
    });
    expect(feedback.response.status).toBe(201);
    expect(feedback.payload.feedback.trainingUse).toBe("eval_routing_product_quality_only");
    expect(feedback.payload.feedback.redactionApplied).toBe(true);

    await recordAudit(dir, {
      id: "audit_session_created",
      workspaceId: "ws_ledger",
      actor: { type: "remote", scope: "collaborator" },
      action: "session.create",
      target: "ses_ledger_chat",
      summary: "Created chat session",
      timestamp: Date.now() - 2_000,
    });
    await recordAudit(dir, {
      id: "audit_session_prompt",
      workspaceId: "ws_ledger",
      actor: { type: "remote", scope: "collaborator" },
      action: "session.prompt",
      target: "ses_ledger_chat",
      summary: `Submitted prompt to chat session without exporting private key ${SECRET_HEX}.`,
      timestamp: Date.now() - 1_000,
    });

    const ledger = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?limit=50");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.success).toBe(true);
    expect(ledger.payload.version).toBe("matterhorn.project-data-ledger.v1");
    expect(ledger.payload.policy.trainingUse).toBe("none_by_default");
    expect(ledger.payload.policy.feedbackUse).toBe("eval_routing_product_quality_only");
    expect(ledger.payload.summary.notes).toBeGreaterThanOrEqual(1);
    expect(ledger.payload.summary.audits).toBeGreaterThanOrEqual(1);
    expect(ledger.payload.summary.feedback).toBe(1);
    expect(ledger.payload.summary.chats).toBe(2);
    expect(ledger.payload.summary.redacted).toBeGreaterThanOrEqual(1);

    const kinds = ledger.payload.items.map((item: { kind: string }) => item.kind);
    expect(kinds).toContain("note");
    expect(kinds).toContain("audit");
    expect(kinds).toContain("feedback");
    expect(kinds).toContain("chat");
    const feedbackEntry = ledger.payload.items.find((item: { kind: string }) => item.kind === "feedback");
    expect(feedbackEntry).toBeTruthy();
    expect(feedbackEntry.metadata.feedbackId).toBe(feedback.payload.feedback.id);
    expect(feedbackEntry.metadata.feedbackKind).toBe("comment");
    expect(feedbackEntry.metadata.targetSourceType).toBe("task");
    expect(feedbackEntry.metadata.targetSourceId).toBe("task_ledger");
    const chatEntry = ledger.payload.items.find((item: { kind: string; eventType?: string }) => item.kind === "chat" && item.eventType === "session.prompt");
    expect(chatEntry).toMatchObject({
      title: "Chat prompt submitted",
      sessionId: "ses_ledger_chat",
      href: "/workspace/ws_ledger/session/ses_ledger_chat",
      containsSecrets: "redacted",
      redactionApplied: true,
    });

    const serialized = JSON.stringify(ledger.payload);
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("supersecret123");
    expect(serialized).not.toContain(SECRET_HEX);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);

    const chatLedger = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=chat&limit=20");
    expect(chatLedger.response.status).toBe(200);
    expect(chatLedger.payload.summary.chats).toBe(2);
    expect(chatLedger.payload.items.every((item: { kind: string }) => item.kind === "chat")).toBe(true);

    const dataMap = await jsonFetch(base, "/workspace/ws_ledger/backend/data-map");
    expect(dataMap.response.status).toBe(200);
    expect(dataMap.payload.stores.feedback.status).toBe("working");
    expect(dataMap.payload.stores.feedback.path).toBe(join(dir, "openwork-data", "feedback", "ws_ledger.jsonl"));
    expect(dataMap.payload.stores.feedback.containsSecrets).toBe("redacted");
    expect(dataMap.payload.stores.feedback.retention).toBe("user_controlled");
    expect(dataMap.payload.stores.feedback.deletable).toBe(true);

    const dataControls = await jsonFetch(base, "/workspace/ws_ledger/backend/data-controls");
    expect(dataControls.response.status).toBe(200);
    expect(dataControls.payload.version).toBe("matterhorn.backend.data-controls.v1");
    expect(dataControls.payload.stores.feedback.export.actions[0].href).toBe("/workspace/ws_ledger/data-ledger?source=feedback");
    expect(dataControls.payload.stores.feedback.deletion.status).toBe("working");
    expect(dataControls.payload.stores.feedback.deletion.actions[0].href).toBe("/workspace/:workspaceId/feedback/:feedbackId");
    expect(dataControls.payload.stores.feedback.deletion.actions).toContainEqual(
      expect.objectContaining({
        id: "feedback.delete-all",
        method: "DELETE",
        href: "/workspace/ws_ledger/feedback",
        destructive: true,
      }),
    );
    expect(dataControls.payload.stores.walletEvidence.export.status).toBe("working");
    expect(dataControls.payload.stores.walletEvidence.export.actions[0].href).toBe("/workspace/ws_ledger/data-ledger?kind=wallet");
    expect(dataControls.payload.stores.walletEvidence.deletion.status).toBe("unsupported");
    expect(dataControls.payload.stores.taskEvents.retention.mode).toBe("append_only");
  });

  test("GET /workspace/:id/data-ledger/export returns a redacted export manifest", async () => {
    const { base } = await boot();

    await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({
        kind: "bug",
        target: { sourceType: "task", sourceId: "task_export" },
        comment: `Export this feedback but redact private key ${SECRET_HEX}.`,
      }),
    });

    const result = await jsonFetch(base, "/workspace/ws_ledger/data-ledger/export?source=feedback&limit=50");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.project-data-ledger-export.v1");
    expect(result.payload.filename).toMatch(/^matterhorn-project-ledger-ws_ledger-/);
    expect(result.payload.manifest.workspaceId).toBe("ws_ledger");
    expect(result.payload.manifest.itemCount).toBe(1);
    expect(result.payload.manifest.filters.source).toBe("feedback");
    expect(result.payload.manifest.filters.limit).toBe(50);
    expect(result.payload.manifest.includes).toEqual(["feedback"]);
    expect(result.payload.manifest.backendContext.included).toBe(true);
    expect(result.payload.manifest.backendContext.version).toBe("matterhorn.backend.control-plane.v1");
    expect(result.payload.manifest.trainingUse).toBe("none_by_default");
    expect(result.payload.manifest.feedbackUse).toBe("eval_routing_product_quality_only");
    expect(result.payload.backend.controlPlane.version).toBe("matterhorn.backend.control-plane.v1");
    expect(result.payload.backend.controlPlane.summary.totalFeatures).toBeGreaterThan(0);
    expect(result.payload.backend.controlPlane.privacy.secretsReturned).toBe(false);
    expect(result.payload.backend.controlPlane.capabilities).toBeUndefined();
    expect(result.payload.backend.controlPlane.models).toBeUndefined();
    expect(result.payload.backend.controlPlane.dataMap).toBeUndefined();
    expect(result.payload.warnings.join(" ")).toContain("redacted");
    expect(result.payload.warnings.join(" ")).toContain("sanitized control-plane summary");
    expect(result.payload.ledger.items.every((item: { source: string }) => item.source === "feedback")).toBe(true);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain(SECRET_HEX);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("data-ledger source and kind filters are explicit", async () => {
    const { base } = await boot();

    await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    });

    const bySource = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback");
    expect(bySource.response.status).toBe(200);
    expect(bySource.payload.items.length).toBe(1);
    expect(bySource.payload.items.every((item: { source: string }) => item.source === "feedback")).toBe(true);

    const byKind = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=feedback");
    expect(byKind.response.status).toBe(200);
    expect(byKind.payload.items.length).toBe(1);
    expect(byKind.payload.items.every((item: { kind: string }) => item.kind === "feedback")).toBe(true);
  });

  test("feedback entries can be deleted with collaborator scope and remain audited", async () => {
    const { base } = await boot();

    const created = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({
        kind: "comment",
        target: { sourceType: "settings", sourceId: "feedback-delete" },
        comment: "Remove this feedback after export review.",
      }),
    });
    expect(created.response.status).toBe(201);

    const beforeDelete = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback&limit=20");
    expect(beforeDelete.payload.summary.feedback).toBe(1);
    expect(beforeDelete.payload.items[0].metadata.feedbackId).toBe(created.payload.feedback.id);
    expect(beforeDelete.payload.items[0].deletable).toBe(true);
    expect(beforeDelete.payload.items[0].retention).toBe("user_controlled");

    const deleted = await jsonFetch(base, `/workspace/ws_ledger/feedback/${created.payload.feedback.id}`, {
      method: "DELETE",
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.success).toBe(true);
    expect(deleted.payload.deleted.id).toBe(created.payload.feedback.id);

    const afterDelete = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback&limit=20");
    expect(afterDelete.payload.summary.feedback).toBe(0);
    expect(afterDelete.payload.items).toEqual([]);

    const audit = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=audit&limit=20");
    expect(audit.payload.items.map((item: { eventType: string }) => item.eventType)).toContain("workspace.feedback.delete");

    const secondDelete = await jsonFetch(base, `/workspace/ws_ledger/feedback/${created.payload.feedback.id}`, {
      method: "DELETE",
    });
    expect(secondDelete.response.status).toBe(404);
    expect(secondDelete.payload.code).toBe("feedback_not_found");
  });

  test("workspace memory review actions appear in the memory ledger filter", async () => {
    const { base } = await boot();

    const created = await jsonFetch(base, "/workspace/ws_ledger/memory/suggestions", {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture for TAO reads and subnet 14.",
          sourceId: "ledger-memory-review-test",
        },
      }),
    });
    expect(created.response.status).toBe(200);
    const entry = created.payload.inbox.entries[0];

    const resolved = await jsonFetch(base, `/workspace/ws_ledger/memory/suggestions/${encodeURIComponent(entry.id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        action: "confirm",
        reason: "User confirmed this memory review item.",
      }),
    });
    expect(resolved.response.status).toBe(200);
    expect(resolved.payload.saved).toBe(true);

    const memoryLedger = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=memory_suggestion&limit=20");
    expect(memoryLedger.response.status).toBe(200);
    expect(memoryLedger.payload.summary.memorySuggestions).toBeGreaterThanOrEqual(2);
    expect(memoryLedger.payload.items.every((item: { kind: string }) => item.kind === "memory_suggestion")).toBe(true);
    const memoryAuditItems = memoryLedger.payload.items.filter((item: { source: string }) => item.source === "audit");
    expect(memoryAuditItems.map((item: { title: string }) => item.title)).toEqual(
      expect.arrayContaining(["Memory review created", "Memory review updated"]),
    );
    expect(memoryAuditItems.map((item: { eventType: string }) => item.eventType)).toEqual(
      expect.arrayContaining(["memory.suggestions.create", "memory.suggestion.resolve"]),
    );
    expect(memoryAuditItems.every((item: { href?: string }) => item.href === "/workspace/ws_ledger/session?panel=memory")).toBe(true);
    expect(memoryAuditItems.every((item: { trainingUse: string }) => item.trainingUse === "none")).toBe(true);
    expect(memoryAuditItems.every((item: { metadata: { auditAction: string } }) => item.metadata.auditAction.startsWith("memory."))).toBe(true);
  });

  test("team access token changes appear as redacted access ledger rows", async () => {
    const { base } = await boot();

    const created = await hostFetch(base, "/workspace/ws_ledger/backend/team-access/tokens", {
      method: "POST",
      body: JSON.stringify({
        scope: "viewer",
        label: `Grant reviewer access without leaking Bearer ${SECRET_HEX}`,
      }),
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.token.token).toMatch(/^owt_/);

    const revoked = await hostFetch(base, `/workspace/ws_ledger/backend/team-access/tokens/${created.payload.token.id}`, {
      method: "DELETE",
    });
    expect(revoked.response.status).toBe(200);

    const accessLedger = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=team_access&limit=20");
    expect(accessLedger.response.status).toBe(200);
    expect(accessLedger.payload.summary.teamAccess).toBe(2);
    expect(accessLedger.payload.items.every((item: { kind: string }) => item.kind === "team_access")).toBe(true);
    expect(accessLedger.payload.items.map((item: { title: string }) => item.title)).toEqual(
      expect.arrayContaining(["Team access token created", "Team access token revoked"]),
    );
    expect(accessLedger.payload.items.every((item: { source: string }) => item.source === "audit")).toBe(true);
    expect(accessLedger.payload.items.every((item: { href?: string }) => item.href === "/workspace/ws_ledger/settings/overview")).toBe(true);
    expect(accessLedger.payload.items.every((item: { trainingUse: string }) => item.trainingUse === "none")).toBe(true);
    expect(accessLedger.payload.items.every((item: { metadata: { auditAction: string } }) => item.metadata.auditAction.startsWith("workspace.team_token."))).toBe(true);

    const serialized = JSON.stringify(accessLedger.payload);
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain(SECRET_HEX);
    expect(serialized).not.toContain(created.payload.token.token);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("data-ledger can filter run history by desk, session, task, and time window", async () => {
    const { base } = await boot();
    const firstRunAt = Date.parse("2026-07-06T08:00:00.000Z");
    const secondRunAt = Date.parse("2026-07-06T10:00:00.000Z");

    await recordTaskEvent({
      id: "evt_bittensor_started",
      workspaceId: "ws_ledger",
      taskId: "task_bittensor_balance",
      type: "workflow_started",
      timestamp: firstRunAt,
      summary: "Bittensor task started",
      detail: "bittensor;sess_bittensor_balance",
    });
    await recordTaskEvent({
      id: "evt_bittensor_output",
      workspaceId: "ws_ledger",
      taskId: "task_bittensor_balance",
      type: "artifact_saved",
      timestamp: firstRunAt + 60_000,
      summary: "Bittensor output saved",
      detail: "bittensor;sess_bittensor_balance",
      artifactPath: "outputs/bittensor/sess_bittensor_balance/receipt.md",
    });
    await recordTaskEvent({
      id: "evt_sui_started",
      workspaceId: "ws_ledger",
      taskId: "task_sui_preview",
      type: "workflow_started",
      timestamp: secondRunAt,
      summary: "Sui task started",
      detail: "sui;sess_sui_preview",
    });

    const byDesk = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?desk=bittensor&limit=20");
    expect(byDesk.response.status).toBe(200);
    expect(byDesk.payload.items.length).toBeGreaterThanOrEqual(2);
    expect(byDesk.payload.items.every((item: { desk?: string }) => item.desk === "bittensor")).toBe(true);

    const bySession = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?sessionId=sess_bittensor_balance&limit=20");
    expect(bySession.response.status).toBe(200);
    expect(bySession.payload.items.length).toBeGreaterThanOrEqual(2);
    expect(bySession.payload.items.every((item: { sessionSlug?: string }) => item.sessionSlug === "sess_bittensor_balance")).toBe(true);

    const byTask = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?taskId=task_sui_preview&limit=20");
    expect(byTask.response.status).toBe(200);
    expect(byTask.payload.items.map((item: { taskId?: string }) => item.taskId)).toEqual(["task_sui_preview"]);

    const byWindow = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?from=2026-07-06T09:30:00.000Z&to=2026-07-06T10:30:00.000Z&limit=20");
    expect(byWindow.response.status).toBe(200);
    expect(byWindow.payload.items.map((item: { taskId?: string }) => item.taskId)).toEqual(["task_sui_preview"]);
  });

  test("data-ledger rejects unknown filters", async () => {
    const { base } = await boot();

    const source = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=private_keys");
    expect(source.response.status).toBe(400);
    expect(source.payload.code).toBe("invalid_project_data_ledger_source");

    const kind = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=seed_phrase");
    expect(kind.response.status).toBe(400);
    expect(kind.payload.code).toBe("invalid_project_data_ledger_kind");

    const time = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?from=tomorrow-ish");
    expect(time.response.status).toBe(400);
    expect(time.payload.code).toBe("invalid_project_data_ledger_time");
  });

  test("feedback writes require collaborator scope", async () => {
    const { base } = await boot();
    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only feedback tester" }),
    });
    expect(viewer.response.status).toBe(201);

    const created = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "comment", comment: "Owner feedback for delete guard." }),
    });
    expect(created.response.status).toBe(201);

    const denied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    }, viewer.payload.token);
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("forbidden");

    const deleteDenied = await jsonFetch(base, `/workspace/ws_ledger/feedback/${created.payload.feedback.id}`, {
      method: "DELETE",
    }, viewer.payload.token);
    expect(deleteDenied.response.status).toBe(403);
    expect(deleteDenied.payload.code).toBe("forbidden");

    const deleteAllDenied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "DELETE",
    }, viewer.payload.token);
    expect(deleteAllDenied.response.status).toBe(403);
    expect(deleteAllDenied.payload.code).toBe("forbidden");
  });

  test("DELETE /workspace/:id/feedback clears user feedback and audits the control", async () => {
    const { base } = await boot();

    const first = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "comment", comment: "Delete this feedback batch." }),
    });
    const second = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "bug", comment: "Delete this too." }),
    });
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);

    const before = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback&limit=20");
    expect(before.payload.summary.feedback).toBe(2);

    const deleted = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "DELETE",
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload).toEqual({ success: true, deletedCount: 2 });

    const after = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback&limit=20");
    expect(after.response.status).toBe(200);
    expect(after.payload.summary.feedback).toBe(0);
    expect(after.payload.items).toEqual([]);

    const audit = await jsonFetch(base, "/workspace/ws_ledger/audit?limit=20");
    const actions = audit.payload.items.map((item: { action: string }) => item.action);
    expect(actions).toContain("workspace.feedback.delete_all");
  });

  test("feedback writes are blocked when server is read-only", async () => {
    const { base } = await boot({ readOnly: true });

    const denied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    });
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("read_only");

    const deleteDenied = await jsonFetch(base, "/workspace/ws_ledger/feedback/fb_missing", {
      method: "DELETE",
    });
    expect(deleteDenied.response.status).toBe(403);
    expect(deleteDenied.payload.code).toBe("read_only");

    const deleteAllDenied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "DELETE",
    });
    expect(deleteAllDenied.response.status).toBe(403);
    expect(deleteAllDenied.payload.code).toBe("read_only");
  });
});
