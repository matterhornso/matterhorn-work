/**
 * Backend security & data-policy regression tests.
 *
 * Covers:
 * - Memory write permission enforcement (viewer vs collaborator token scope)
 * - Read-only workspace blocking of memory writes
 * - Audit entry production for memory operations
 * - Security capability classification (CORS, approval mode, auth tokens, authorized roots)
 * - Data-map / evidence route non-leakage of secrets
 *
 * These tests are integration tests against a live in-process server.
 * They do NOT require a running Matterhorn Work process.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { shortId } from "./utils.js";
import { auditLogPath } from "./audit.js";
import {
  findForbiddenMemorySecretFields,
  containsForbiddenMemorySecretMaterial,
} from "@matterhorn-work/types/memory";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

// Separate token stores per test identity so we can create viewer/collab tokens.
const OWNER_TOKEN = "owt_security_owner_token";
const HOST_TOKEN = "owt_security_host_token";

const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  devLogFile: process.env.OPENWORK_DEV_LOG_FILE,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function baseConfig(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: OWNER_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "manual", timeoutMs: 5000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_security",
      name: "Security test workspace",
      path: root,
      preset: "starter",
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

// Boot a server with a dedicated token store so we can create viewer/collab tokens.
async function boot(readOnly?: boolean): Promise<{
  base: string;
  dir: string;
  ownerToken: string;
  collaboratorToken: string;
  viewerToken: string;
}>;
async function boot(readOnly: boolean, configOverrides: Partial<ServerConfig>): Promise<{
  base: string;
  dir: string;
  ownerToken: string;
  collaboratorToken: string;
  viewerToken: string;
}>;
async function boot(readOnly = false, configOverrides: Partial<ServerConfig> = {}): Promise<{
  base: string;
  dir: string;
  ownerToken: string;
  collaboratorToken: string;
  viewerToken: string;
}> {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-security-"));
  dirs.push(dir);

  const ownerTokenStore = join(dir, "owner-tokens.json");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = ownerTokenStore;
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");

  const port = await getFreePort();
  const config = {
    ...baseConfig(port, dir, readOnly),
    ...configOverrides,
  } as ServerConfig;
  const server = await startServer(config) as Served;
  stops.push(() => server.stop(true));

  const base = `http://127.0.0.1:${server.port}`;

  // Create scoped tokens via the TokenService using the owner token (OWT_TOKEN).
  // We need to create tokens through the HTTP API since we can't import TokenService
  // in the same way (token store path differs per boot).
  const ownerToken = OWNER_TOKEN; // built-in always returns "collaborator" scope

  // Create a second token store and service to create viewer/collab tokens.
  // We create them via POST /tokens using the owner token.
  const collabResp = await fetch(`${base}/tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OWNER_TOKEN}`,
      "Content-Type": "application/json",
      "x-openwork-host-token": HOST_TOKEN,
      Connection: "close",
    },
    body: JSON.stringify({ scope: "collaborator", label: "test-collab" }),
  });
  const collabData = await collabResp.json();
  const collaboratorToken = collabData.token as string;

  const viewerResp = await fetch(`${base}/tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OWNER_TOKEN}`,
      "Content-Type": "application/json",
      "x-openwork-host-token": HOST_TOKEN,
      Connection: "close",
    },
    body: JSON.stringify({ scope: "viewer", label: "test-viewer" }),
  });
  const viewerData = await viewerResp.json();
  const viewerToken = viewerData.token as string;

  return { base, dir, ownerToken, collaboratorToken, viewerToken };
}

// Fetch helper with configurable bearer token.
async function jsonFetch(
  base: string,
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Connection: "close",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

// Minimal memory record fixture.
function record(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-22T00:00:00.000Z").toISOString();
  return {
    id: overrides.id ?? `mem_sec_${shortId()}`,
    kind: "protocol_address",
    scope: "workspace",
    title: "Security test TAO wallet",
    summary: "Public SS58 address for security regression tests.",
    body: {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1SecTest",
      netuid: 14,
    },
    tags: ["security-test", "bittensor"],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.95,
      reasonRemembered: "Regression test fixture.",
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

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  if (priorEnv.envStore === undefined) delete process.env.OPENWORK_ENV_STORE;
  else process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  if (priorEnv.tokenStore === undefined) delete process.env.OPENWORK_TOKEN_STORE;
  else process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  if (priorEnv.memoryRoot === undefined) delete process.env.MATTERHORN_WORK_MEMORY_ROOT;
  else process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
  if (priorEnv.devLogFile === undefined) delete process.env.OPENWORK_DEV_LOG_FILE;
  else process.env.OPENWORK_DEV_LOG_FILE = priorEnv.devLogFile;
});

// ---------------------------------------------------------------------------
// Scope 0: Observability log safety
// ---------------------------------------------------------------------------

describe("Dev observability log safety", () => {
  test("POST /dev/log redacts bearer tokens, secret fields, and private-key-shaped text before writing JSONL", async () => {
    const { base, dir } = await boot();
    const devLogPath = join(dir, "logs", "browser-dev.jsonl");
    process.env.OPENWORK_DEV_LOG_FILE = devLogPath;
    const fakePrivateKey = "f".repeat(64);

    const response = await fetch(`${base}/dev/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify([{
        level: "error",
        message: `Authorization: Bearer super-secret-token and private key ${fakePrivateKey}`,
        url: `/session?token=super-secret-token`,
        extra: {
          token: "super-secret-token",
          nested: {
            privateKey: fakePrivateKey,
            harmless: "public context",
          },
        },
      }]),
    });

    expect(response.status).toBe(200);
    const body = readFileSync(devLogPath, "utf8");
    expect(body).toContain("[redacted]");
    expect(body).toContain("public context");
    expect(body).not.toContain("super-secret-token");
    expect(body).not.toContain(fakePrivateKey);
    expect(body).not.toContain("Bearer super");
  });

  test("POST /dev/log rejects oversized unauthenticated payloads before parsing", async () => {
    const { base, dir } = await boot();
    process.env.OPENWORK_DEV_LOG_FILE = join(dir, "logs", "browser-dev.jsonl");

    const response = await fetch(`${base}/dev/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ message: "x".repeat(140_000) }),
    });
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload).toMatchObject({
      code: "payload_too_large",
      message: "Dev log payload is too large",
    });
  });
});

// ---------------------------------------------------------------------------
// Scope A: Memory write permission tests
// ---------------------------------------------------------------------------

describe("Memory write permissions by token scope", () => {
  test("viewer token CANNOT capture a memory record", async () => {
    const { base, viewerToken } = await boot();

    const result = await jsonFetch(base, "/api/memory/capture", viewerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");
  });

  test("viewer token CANNOT create memory suggestions", async () => {
    const { base, viewerToken } = await boot();

    const result = await jsonFetch(base, "/api/memory/suggestions", viewerToken, {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1SecTest for TAO reads.",
          sourceId: "security-viewer-suggestion-test",
        },
      }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");
  });

  test("viewer token CANNOT resolve a memory suggestion (confirm)", async () => {
    const { base, ownerToken, viewerToken } = await boot();

    // First create a suggestion with the owner token so we have something to resolve.
    const created = await jsonFetch(base, "/api/memory/suggestions", ownerToken, {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember security test address for subnet 14.",
          sourceId: "security-resolve-test",
        },
      }),
    });

    const entries = (created.payload as { inbox?: { entries?: Array<{ id: string; suggestion: { proposedRecord: Record<string, unknown> } }> } }).inbox?.entries ?? [];
    const entry = entries[0];
    expect(entry).toBeTruthy();
    if (!entry) throw new Error("Expected a memory suggestion to be created");

    const result = await jsonFetch(
      base,
      `/api/memory/suggestions/${entry.id}/resolve`,
      viewerToken,
      {
        method: "POST",
        body: JSON.stringify({ action: "confirm" }),
      },
    );

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");

    await jsonFetch(base, `/api/memory/suggestions/${entry.id}/resolve`, ownerToken, {
      method: "POST",
      body: JSON.stringify({ action: "dismiss" }),
    });
  });

  test("viewer token CANNOT PATCH a memory record", async () => {
    const { base, ownerToken, viewerToken } = await boot();

    // Create a record with owner token.
    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;

    const result = await jsonFetch(base, `/api/memory/entities/${recordId}`, viewerToken, {
      method: "PATCH",
      body: JSON.stringify({ patch: { summary: "Patched by viewer" } }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");

    // Cleanup with owner.
    if (recordId) {
      await jsonFetch(base, "/api/memory/forget", ownerToken, {
        method: "POST",
        body: JSON.stringify({ id: recordId }),
      });
    }
  });

  test("viewer token CANNOT DELETE a memory record via PATCH", async () => {
    const { base, ownerToken, viewerToken } = await boot();

    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;
    expect(recordId).toBeTruthy();
    if (!recordId) throw new Error("Expected a memory record to be created");

    // DELETE through the entity route.
    const result = await jsonFetch(base, `/api/memory/entities/${recordId}`, viewerToken, {
      method: "DELETE",
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");

    // Cleanup.
    await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });
  });

  test("viewer token CANNOT forget a memory record", async () => {
    const { base, ownerToken, viewerToken } = await boot();

    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;
    expect(recordId).toBeTruthy();
    if (!recordId) throw new Error("Expected a memory record to be created");

    const result = await jsonFetch(base, "/api/memory/forget", viewerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");

    // Cleanup.
    await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });
  });

  test("viewer token CANNOT export memory", async () => {
    const { base, viewerToken } = await boot();

    const result = await jsonFetch(base, "/api/memory/export", viewerToken, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("forbidden");
  });

  test("viewer token CAN read memory (GET routes — read-only access is correct)", async () => {
    const { base, ownerToken, viewerToken } = await boot();

    // Create a record.
    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;
    expect(recordId).toBeTruthy();
    if (!recordId) throw new Error("Expected a memory record to be created");

    // Viewer CAN read.
    const search = await jsonFetch(base, "/api/memory/search?q=TAO", viewerToken);
    expect(search.response.status).toBe(200);

    const entity = await jsonFetch(base, `/api/memory/entities/${recordId}`, viewerToken);
    expect(entity.response.status).toBe(200);

    const entities = await jsonFetch(base, "/api/memory/entities", viewerToken);
    expect(entities.response.status).toBe(200);

    // Cleanup.
    await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });
  });

  test("collaborator token CAN capture a memory record", async () => {
    const { base, collaboratorToken, ownerToken } = await boot();

    const result = await jsonFetch(base, "/api/memory/capture", collaboratorToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });

    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);

    // Cleanup.
    const recordId = (result.payload as { record?: { id: string } }).record?.id;
    if (recordId) {
      await jsonFetch(base, "/api/memory/forget", ownerToken, {
        method: "POST",
        body: JSON.stringify({ id: recordId }),
      });
    }
  });

  test("collaborator token CAN create and resolve memory suggestions", async () => {
    const { base, collaboratorToken, ownerToken } = await boot();

    const created = await jsonFetch(base, "/api/memory/suggestions", collaboratorToken, {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember security collab test address 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1SecTest.",
          sourceId: "security-collab-suggestion-test",
        },
      }),
    });
    expect(created.response.status).toBe(200);

    const entries = (created.payload as { inbox?: { entries?: Array<{ id: string }> } }).inbox?.entries ?? [];
    const entry = entries[0];
    expect(entry).toBeTruthy();
    if (!entry) throw new Error("Expected a memory suggestion to be created");

    const resolved = await jsonFetch(
      base,
      `/api/memory/suggestions/${entry.id}/resolve`,
      collaboratorToken,
      {
        method: "POST",
        body: JSON.stringify({ action: "confirm" }),
      },
    );
    expect(resolved.response.status).toBe(200);
    expect(resolved.payload.saved).toBe(true);

    // Cleanup.
    const recordId = (resolved.payload as { record?: { id: string } }).record?.id;
    if (recordId) {
      await jsonFetch(base, "/api/memory/forget", ownerToken, {
        method: "POST",
        body: JSON.stringify({ id: recordId }),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Scope B: Read-only workspace blocks memory writes
// ---------------------------------------------------------------------------

describe("Read-only workspace blocks memory writes", () => {
  test("POST /api/memory/capture is blocked when server readOnly=true", async () => {
    const { base, ownerToken } = await boot(true); // readOnly=true

    const result = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("read_only");
  });

  test("POST /api/memory/suggestions is blocked when server readOnly=true", async () => {
    const { base, ownerToken } = await boot(true);

    const result = await jsonFetch(base, "/api/memory/suggestions", ownerToken, {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember this in read-only mode.",
          sourceId: "security-readonly-test",
        },
      }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("read_only");
  });

  test("POST /api/memory/suggestions/:id/resolve (confirm) is blocked when readOnly=true", async () => {
    const { base, ownerToken } = await boot(true);

    const result = await jsonFetch(base, "/api/memory/suggestions/suggestion_readonly_fake/resolve", ownerToken, {
      method: "POST",
      body: JSON.stringify({ action: "confirm" }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("read_only");
  });

  test("POST /api/memory/forget is blocked when server readOnly=true", async () => {
    const { base, ownerToken } = await boot(true);
    const result = await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: "mem_readonly_fake" }),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("read_only");
  });

  test("POST /api/memory/export is blocked when server readOnly=true", async () => {
    const { base, ownerToken } = await boot(true);

    const result = await jsonFetch(base, "/api/memory/export", ownerToken, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(result.response.status).toBe(403);
    expect(result.payload.code).toBe("read_only");
  });

  test("GET /api/memory/search is NOT blocked when server readOnly=true", async () => {
    const { base, ownerToken } = await boot(true);

    const result = await jsonFetch(base, "/api/memory/search?q=TAO", ownerToken);
    // Read operations should always work.
    expect(result.response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Scope C: Audit entries for memory operations
// ---------------------------------------------------------------------------

describe("Audit entries for memory operations", () => {
  test("POST /api/memory/capture produces an audit entry", async () => {
    const { base, ownerToken } = await boot();

    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;
    expect(recordId).toBeTruthy();
    if (!recordId) throw new Error("Expected a memory record to be created");

    const logFile = auditLogPath("ws_security");
    let auditContent = "";
    try {
      auditContent = readFileSync(logFile, "utf8");
    } catch {
      // No audit file yet — this is the gap being tested.
    }

    const auditLines = auditContent.trim().split("\n").filter(Boolean);
    const memoryLines = auditLines.filter((line) => {
      try {
        const entry = JSON.parse(line);
        return (
          entry.action?.includes("memory") ||
          entry.target?.includes("memory") ||
          entry.summary?.toLowerCase().includes("memory") ||
          entry.summary?.toLowerCase().includes("capture")
        );
      } catch {
        return false;
      }
    });

    expect(memoryLines.length).toBeGreaterThanOrEqual(1);

    // Cleanup.
    await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });
  });

  test("POST /api/memory/forget produces an audit entry", async () => {
    const { base, ownerToken } = await boot();

    // Create a record to forget.
    const captured = await jsonFetch(base, "/api/memory/capture", ownerToken, {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    const recordId = (captured.payload as { record?: { id: string } }).record?.id as string;
    expect(recordId).toBeTruthy();
    if (!recordId) throw new Error("Expected a memory record to be created");

    await jsonFetch(base, "/api/memory/forget", ownerToken, {
      method: "POST",
      body: JSON.stringify({ id: recordId }),
    });

    const logFile = auditLogPath("ws_security");
    let auditContent = "";
    try {
      auditContent = readFileSync(logFile, "utf8");
    } catch {
      // No audit file.
    }

    const auditLines = auditContent.trim().split("\n").filter(Boolean);
    const forgetLines = auditLines.filter((line) => {
      try {
        const entry = JSON.parse(line);
        return (
          entry.action?.includes("memory") ||
          entry.target?.includes(recordId) ||
          entry.summary?.toLowerCase().includes("forget") ||
          entry.summary?.toLowerCase().includes("delete")
        );
      } catch {
        return false;
      }
    });

    expect(forgetLines.length).toBeGreaterThanOrEqual(1);
  });

  test("suggestion resolve (confirm) produces an audit entry", async () => {
    const { base, ownerToken } = await boot();

    // Create and resolve a suggestion.
    const created = await jsonFetch(base, "/api/memory/suggestions", ownerToken, {
      method: "POST",
      body: JSON.stringify({
        input: {
          desk: "bittensor",
          prompt: "Remember 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1SecTest for TAO.",
          sourceId: "security-audit-suggestion-test",
        },
      }),
    });
    const entries = (created.payload as { inbox?: { entries?: Array<{ id: string }> } }).inbox?.entries ?? [];
    const entry = entries[0];
    expect(entry).toBeTruthy();
    if (!entry) throw new Error("Expected a memory suggestion to be created");

    await jsonFetch(base, `/api/memory/suggestions/${entry.id}/resolve`, ownerToken, {
      method: "POST",
      body: JSON.stringify({ action: "confirm" }),
    });

    const logFile = auditLogPath("ws_security");
    let auditContent = "";
    try {
      auditContent = readFileSync(logFile, "utf8");
    } catch {
      // No audit file.
    }

    const auditLines = auditContent.trim().split("\n").filter(Boolean);
    const suggestionLines = auditLines.filter((line) => {
      try {
        const entry_parsed = JSON.parse(line);
        return (
          entry_parsed.action?.includes("memory") ||
          entry_parsed.action?.includes("suggestion") ||
          entry_parsed.target?.includes("suggestion") ||
          entry_parsed.summary?.toLowerCase().includes("suggestion")
        );
      } catch {
        return false;
      }
    });

    expect(suggestionLines.length).toBeGreaterThanOrEqual(1);

    // Cleanup.
    const resolved = await jsonFetch(base, `/api/memory/suggestions/${entry.id}`, ownerToken);
    const recordId = (resolved.payload as { entry?: { recordId?: string } }).entry?.recordId;
    if (recordId) {
      await jsonFetch(base, "/api/memory/forget", ownerToken, {
        method: "POST",
        body: JSON.stringify({ id: recordId }),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Scope D: Security capability classification
// ---------------------------------------------------------------------------

describe("Security capability classification", () => {
  test("server applies a bounded local API request rate limit", async () => {
    const { base, ownerToken } = await boot(false, {
      requestRateLimit: { enabled: true, windowMs: 60_000, maxRequests: 4 },
    });

    const allowedReads = await Promise.all(Array.from({ length: 4 }, () =>
      jsonFetch(base, "/api/backend/capabilities", ownerToken),
    ));
    const blocked = await jsonFetch(base, "/api/backend/capabilities", ownerToken);

    expect(allowedReads.every((result) => result.response.status === 200)).toBe(true);
    expect(blocked.response.status).toBe(429);
    expect(blocked.response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(blocked.payload).toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Try again shortly.",
    });

    const writeAfterReadLimit = await fetch(`${base}/not-a-route`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(writeAfterReadLimit.status).toBe(404);
  });

  test("GET /api/backend/capabilities exists and returns shape", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities", ownerToken);
    expect(result.response.status).toBe(200);
    const caps = result.payload;
    expect(caps.success).toBe(true);
    expect(caps.version).toBe("matterhorn.backend.capabilities.v1");
    expect(caps.security.memoryWriteGuards.status).toBe("working");
    expect(caps.outputs.status).toBe("working");
    expect(caps.wallets.families.sui.status).toBe("preview");
    expect(caps.wallets.families.sui.signing).toBe("client_wallet");
  });

  test("control-plane mutations reject overlarge JSON bodies", async () => {
    const { base, collaboratorToken } = await boot();

    const result = await jsonFetch(
      base,
      "/workspace/ws_security/backend/model-selection",
      collaboratorToken,
      {
        method: "PATCH",
        body: JSON.stringify({
          providerId: "opencode",
          modelId: "big-pickle",
          padding: "x".repeat(70_000),
        }),
      },
    );

    expect(result.response.status).toBe(413);
    expect(result.payload).toMatchObject({
      code: "payload_too_large",
    });
  });

  test("MCP config mutations reject overlarge JSON bodies before approval or config writes", async () => {
    const { base, collaboratorToken } = await boot();

    const addResult = await jsonFetch(
      base,
      "/workspace/ws_security/mcp",
      collaboratorToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: "oversized-mcp",
          config: {
            type: "local",
            command: "node",
          },
          padding: "x".repeat(70_000),
        }),
      },
    );

    expect(addResult.response.status).toBe(413);
    expect(addResult.payload).toMatchObject({
      code: "payload_too_large",
    });

    const toggleResult = await jsonFetch(
      base,
      "/workspace/ws_security/mcp/oversized-mcp/enabled",
      collaboratorToken,
      {
        method: "POST",
        body: JSON.stringify({
          enabled: true,
          padding: "x".repeat(70_000),
        }),
      },
    );

    expect(toggleResult.response.status).toBe(413);
    expect(toggleResult.payload).toMatchObject({
      code: "payload_too_large",
    });
  });

  test("host control mutations reject overlarge JSON bodies", async () => {
    const { base } = await boot();

    const tokenResponse = await fetch(`${base}/tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        "Content-Type": "application/json",
        "x-openwork-host-token": HOST_TOKEN,
        Connection: "close",
      },
      body: JSON.stringify({
        scope: "viewer",
        label: "too-large",
        padding: "x".repeat(70_000),
      }),
    });
    const tokenPayload = await tokenResponse.json();

    expect(tokenResponse.status).toBe(413);
    expect(tokenPayload).toMatchObject({
      code: "payload_too_large",
    });

    const workspaceResponse = await fetch(`${base}/workspaces/local`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        "Content-Type": "application/json",
        "x-openwork-host-token": HOST_TOKEN,
        Connection: "close",
      },
      body: JSON.stringify({
        folderPath: join(tmpdir(), "matterhorn-too-large-workspace"),
        name: "Too large",
        padding: "x".repeat(70_000),
      }),
    });
    const workspacePayload = await workspaceResponse.json();

    expect(workspaceResponse.status).toBe(413);
    expect(workspacePayload).toMatchObject({
      code: "payload_too_large",
    });
  });

  test("CORS wildcard is detected from backend capabilities", async () => {
    const { base, ownerToken } = await boot(); // baseConfig sets corsOrigins: ["*"]

    const result = await jsonFetch(base, "/api/backend/capabilities", ownerToken);
    expect(result.response.status).toBe(200);
    expect(result.payload.security.cors.status).toBe("needs_setup");
    expect(result.payload.security.cors.details.origins).toEqual(["*"]);
  }, 15_000);

  test("capabilities response does not expose bearer or host tokens", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities", ownerToken);
    expect(result.response.status).toBe(200);
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(OWNER_TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).toContain("tokenSource");
    expect(serialized).toContain("hostTokenSource");
  });

  test("approval mode is correctly reported in capabilities", async () => {
    // baseConfig sets approval: { mode: "manual", timeoutMs: 5000 }
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities", ownerToken);
    expect(result.response.status).toBe(200);
    expect(result.payload.security.approvals.status).toBe("working");
    expect(result.payload.security.approvals.details.mode).toBe("manual");
  });

  test("authorized root status is reported without listing unrelated sensitive paths", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities", ownerToken);
    expect(result.response.status).toBe(200);
    expect(result.payload.security.authorizedRoots.status).toBe("working");
    expect(result.payload.security.authorizedRoots.details.count).toBe(1);
    const serialized = JSON.stringify(result.payload.security.authorizedRoots);
    expect(serialized).not.toContain(".ssh");
    expect(serialized).not.toMatch(/private[_-]?key|seed phrase|mnemonic/i);
  });

  test("GET /workspace/:id/evidence does not expose tokens or secrets", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_security/evidence", ownerToken);
    expect(result.response.status).toBe(200);

    const evidence = result.payload as { items?: unknown[] };
    const responseText = JSON.stringify(evidence);

    // Verify no secret material in the evidence response.
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /bearer\s+token/i,
      /private\s*key/i,
      /seed\s*phrase/i,
      /mnemonic/i,
      /api[_-]?secret/i,
      /0x[a-fA-F0-9]{64}/, // raw private keys
    ];

    for (const pattern of secretPatterns) {
      expect(responseText).not.toMatch(pattern);
    }
  });

  test("token list endpoint never exposes token hashes", async () => {
    const { base } = await boot();

    // List tokens as host (requires host auth).
    const result = await fetch(`${base}/tokens`, {
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        "x-openwork-host-token": HOST_TOKEN,
        Connection: "close",
      },
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await result.json();
    const tokens = Array.isArray(payload.items) ? payload.items : [];
    expect(tokens.length).toBeGreaterThanOrEqual(2);

    for (const token of tokens) {
      expect(token).not.toHaveProperty("hash");
      expect(token).not.toHaveProperty("token");
    }
  });

  test("security classification catches missing auth token gracefully", async () => {
    const { base } = await boot();

    // Request without any Authorization header.
    const response = await fetch(`${base}/api/memory/entities`, {
      headers: { Connection: "close" },
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const payload = await response.json().catch(() => ({}));
    // Should have an error code, not a 5xx.
    expect(payload).toHaveProperty("code");
  });

  test("unknown/invalid token returns 401, not 500", async () => {
    const { base } = await boot();

    const response = await fetch(`${base}/api/memory/entities`, {
      headers: { Authorization: "Bearer invalid_token_xyz", Connection: "close" },
    });

    // Should be 401 Unauthorized, not a server error.
    expect(response.status).toBe(401);
    const payload = await response.json().catch(() => ({}));
    expect(payload.code).toMatch(/unauthorized|invalid|forbidden/i);
  });
});

// ---------------------------------------------------------------------------
// Scope E: Data-map contract — what it must NOT return
// ---------------------------------------------------------------------------

describe("Data-map contract: must not leak secrets", () => {
  test("workspace backend data-map reports stores without raw token or key material", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_security/backend/data-map", ownerToken);
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.data-map.v1");
    expect(result.payload.stores.memory.scope).toBe("workspace");
    expect(result.payload.stores.notes.scope).toBe("workspace");
    expect(result.payload.policy.trainingUse).toBe("none_by_default");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(OWNER_TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toMatch(/private[_\s-]?key|seed[_\s-]?phrase|mnemonic|wallet export|bearer token/i);
  });

  test("forbidden secret field names never appear in a sanitized data-map payload", () => {
    // Pure-unit test of the forbidden field detection library.

    const dirtyBody = {
      walletName: "Main Wallet",
      privateKey: "0xdeadbeef1234567890abcdef",
      seedPhrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      apiSecret: "sk_live_abcdef1234567890",
      bearerToken: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture",
    };

    const found = findForbiddenMemorySecretFields(dirtyBody);
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain("body.privateKey");
    expect(found).toContain("body.seedPhrase");
    expect(found).toContain("body.apiSecret");
    expect(found).toContain("body.bearerToken");

    // Safe fields should NOT be flagged.
    expect(found).not.toContain("body.walletName");
    expect(found).not.toContain("body.ss58Address");
  });

  test("forbidden secret patterns are detected in string values", () => {

    const cases: Array<[string, boolean]> = [
      // SS58 address — no forbidden keywords.
      ["5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture", false],
      // Raw hex is not a secret pattern — hex private keys look like this (not auto-detected).
      ["0xdeadbeef1234567890abcdef1234567890abcdef", false],
      // Seed phrase text — matched by /seed\s*phrase/i.
      ["seed phrase wallet backup", true],
      // Mnemonic keyword — matched by /mnemonic/i.
      ["mnemonic for my hot wallet", true],
      // Private key text — matched by /private\s*key/i.
      ["PRIVATE KEY: do not share", true],
      // Bearer token keyword — matched by /bearer\s*token/i.
      ["bearer token in Authorization header", true],
    ];

    for (const [input, expectForbidden] of cases) {
      const result = containsForbiddenMemorySecretMaterial({ value: input });
      expect(result).toBe(expectForbidden);
    }
  });

  test("workspace evidence serializes to JSON without leaking raw secrets", async () => {
    const { base, ownerToken } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_security/evidence", ownerToken);
    expect(result.response.status).toBe(200);

    const payload = result.payload as { items?: unknown[] };
    const serialized = JSON.stringify(payload);

    // Any JSON stringification of workspace evidence must not contain these patterns.
    const forbiddenPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /seed[_\s]?phrase/i,
      /private[_\s]?key[_\s]?[:=]/i,
      /bearer[_\s]?token[_\s]?[:=]/i,
      /\bghp_[a-zA-Z0-9]{36}\b/,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(serialized).not.toMatch(pattern);
    }
  });
});
