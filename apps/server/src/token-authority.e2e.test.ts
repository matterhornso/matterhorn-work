import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { startServer } from "./server.js";
import { TokenService } from "./tokens.js";
import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { buildMatterhornBillingSubscription } from "./billing.js";
import { readAuditEntries } from "./audit.js";
import type { ServerConfig, TokenScope } from "./types.js";

const hostHeaders = { "x-matterhorn-host-token": "disposable-host-token", "content-type": "application/json" };
const stops: Array<() => void | Promise<void>> = [];
const nativeFetch = globalThis.fetch;
let root = "";
let savedEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "matterhorn-token-authority-"));
  const environment: Record<string, string> = {
    MATTERHORN_WORK_DATA_DIR: root, OPENWORK_DATA_DIR: root,
    MATTERHORN_WORK_TOKEN_STORE: join(root, "tokens.json"), OPENWORK_TOKEN_STORE: join(root, "tokens.json"),
    MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), OPENWORK_ENV_STORE: join(root, "env.json"),
    MATTERHORN_AUTH_DB: join(root, "auth.db"), MATTERHORN_WORK_RATE_LIMIT_DB: join(root, "rate-limit.db"),
    MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"), MATTERHORN_MODEL_USAGE_DB: join(root, "usage.db"),
    MATTERHORN_BILLING_ACCOUNT_PATH: join(root, "subscription.json"),
    MATTERHORN_BILLING_MODE: "phase0_mock", MATTERHORN_BILLING_PROVIDER: "mock",
    MATTERHORN_HOSTED_PUBLIC_BETA: "false", MATTERHORN_WORK_STM_ENABLED: "false",
  };
  savedEnvironment = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  globalThis.fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "127.0.0.1") throw new Error("Non-fixture network request blocked");
    return nativeFetch(input, init);
  }, { preconnect: nativeFetch.preconnect });
});

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  globalThis.fetch = nativeFetch;
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

async function boot(runtimeUrl?: string) {
  const config: ServerConfig = {
    host: "127.0.0.1", port: 0, token: "disposable-built-in-token", hostToken: hostHeaders["x-matterhorn-host-token"],
    approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: ["*"],
    workspaces: [{ id: "ws_tokens", name: "Disposable workspace", path: root, preset: "default", workspaceType: "local",
      ...(runtimeUrl ? { baseUrl: runtimeUrl } : {}) }],
    authorizedRoots: [root], readOnly: false, startedAt: Date.now(), tokenSource: "cli", hostTokenSource: "cli",
    logFormat: "pretty", logRequests: false, reloadWatchers: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  const base = `http://127.0.0.1:${server.port}`;
  const issue = async (scope: TokenScope, label: string) => {
    const response = await fetch(`${base}/tokens`, { method: "POST", headers: hostHeaders, body: JSON.stringify({ scope, label }) });
    expect(response.status).toBe(201);
    const token = await response.json();
    if (typeof token.id !== "string" || typeof token.token !== "string") throw new Error("Missing disposable token");
    return { id: token.id, token: token.token };
  };
  const revoke = async (id: string) => {
    expect((await fetch(`${base}/tokens/${id}`, { method: "DELETE", headers: hostHeaders })).status).toBe(200);
  };
  return { base, issue, revoke };
}

describe("team token request lifetime", () => {
  for (const surface of ["read", "create-billing-wait", "create-queue-wait", "create-result-wait", "revoke"]) {
    for (const change of ["revoked", "other-revoked", "unchanged"]) {
      test(`${surface}: ${change}`, async () => {
        const app = await boot();
        const owner = await app.issue("owner", "fixture owner");
        const other = await app.issue("owner", "unrelated owner");
        const target = await app.issue("viewer", "private token label");
        await new MatterhornBillingAccountStore({ workspaceRoot: root, workspaceId: "ws_tokens" }).save({
          version: "matterhorn.billing.account.v1", workspaceId: "ws_tokens",
          subscription: buildMatterhornBillingSubscription("max"), pendingCheckout: null,
          updatedAt: new Date().toISOString(), source: "mock_checkout",
        });
        const arrived = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const originalList = TokenService.prototype.list;
        const originalCreate = TokenService.prototype.create;
        const originalBilling = MatterhornBillingAccountStore.prototype.get;
        // Hold real storage boundaries; do not substitute authentication,
        // billing entitlement or token persistence results.
        const list = spyOn(TokenService.prototype, "list").mockImplementation(async function (this: TokenService) {
          const items = await originalList.call(this);
          if (surface === "read" || surface === "revoke") { arrived.resolve(); await release.promise; }
          return items;
        });
        const create = spyOn(TokenService.prototype, "create").mockImplementation(async function (this: TokenService, scope, options) {
          if (surface === "create-queue-wait") { arrived.resolve(); await release.promise; }
          const issued = await originalCreate.call(this, scope, options);
          if (surface === "create-result-wait") { arrived.resolve(); await release.promise; }
          return issued;
        });
        const billing = spyOn(MatterhornBillingAccountStore.prototype, "get").mockImplementation(async function (this: MatterhornBillingAccountStore) {
          const account = await originalBilling.call(this);
          if (surface === "create-billing-wait") { arrived.resolve(); await release.promise; }
          return account;
        });
        const path = "/workspace/ws_tokens/backend/team-access" + (surface === "read" ? "" : surface === "revoke" ? `/tokens/${target.id}` : "/tokens");
        const pending = fetch(`${app.base}${path}`, {
          method: surface === "read" ? "GET" : surface === "revoke" ? "DELETE" : "POST",
          headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
          ...(surface.startsWith("create") ? { body: JSON.stringify({ scope: "viewer", label: "delayed team token" }) } : {}),
        });
        try {
          await arrived.promise;
          if (change !== "unchanged") await app.revoke(change === "revoked" ? owner.id : other.id);
          release.resolve();
          const response = await pending;
          const text = await response.text();
          const listed = await (await fetch(`${app.base}/tokens`, { headers: hostHeaders })).json();
          const creationAccepted = surface.startsWith("create") && (change !== "revoked" || surface === "create-result-wait");
          expect(listed.items.some((item: { label?: string }) => item.label === "delayed team token")).toBe(creationAccepted);
          expect(listed.items.some((item: { id: string }) => item.id === target.id)).toBe(surface !== "revoke" || change === "revoked");
          const actions = (await readAuditEntries(root, "ws_tokens")).map(entry => entry.action);
          expect(actions.includes("workspace.team_token.create")).toBe(creationAccepted);
          expect(actions.includes("workspace.team_token.revoke")).toBe(surface === "revoke" && change !== "revoked");
          expect(response.status).toBe(change === "revoked" ? 401 : surface.startsWith("create") ? 201 : 200);
          if (change === "revoked") {
            expect(JSON.parse(text).code).toBe("unauthorized");
            expect(text).not.toContain("private token label");
            expect(text).not.toContain("delayed team token");
          }
        } finally {
          release.resolve();
          await pending.catch(() => undefined);
          list.mockRestore(); create.mockRestore(); billing.mockRestore();
        }
      });
    }
  }
});

describe("legacy bearer runtime lifetime", () => {
  for (const scope of ["owner", "collaborator"] satisfies TokenScope[]) {
    for (const change of ["revoked", "other-revoked", "unchanged"]) {
      test(`${scope}, delayed cancellation body: ${change}`, async () => {
        let dispatched = 0;
        const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
          if (new URL(request.url).pathname !== "/session/ses_fixture/abort") return new Response(null, { status: 404 });
          await request.text();
          dispatched++;
          return Response.json(true);
        } });
        stops.push(() => upstream.stop(true));
        const app = await boot(upstream.url.origin);
        const token = await app.issue(scope, "fixture cancellation");
        const other = await app.issue(scope, "unrelated cancellation");
        const admitted = Promise.withResolvers<void>();
        const original = TokenService.prototype.scopeForToken;
        const lookup = spyOn(TokenService.prototype, "scopeForToken").mockImplementation(async function (this: TokenService, value: string) {
          const actual = await original.call(this, value);
          if (value === token.token && actual === scope) admitted.resolve();
          return actual;
        });
        let finish = () => {};
        const pending = new Promise<{ status: number; body: string }>((resolve, reject) => {
          const request = httpRequest(`${app.base}/w/ws_tokens/opencode/session/ses_fixture/abort`, {
            method: "POST", headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", "content-length": 2 },
          }, response => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { text += chunk; });
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
            response.on("error", reject);
          });
          request.on("error", reject);
          request.setTimeout(5000, () => request.destroy(new Error("Disposable cancellation upload timed out")));
          finish = () => { finish = () => {}; request.end("}"); };
          request.write("{"); request.flushHeaders();
        });
        try {
          await admitted.promise;
          if (change !== "unchanged") await app.revoke(change === "revoked" ? token.id : other.id);
          finish();
          const result = await pending;
          expect(dispatched).toBe(change === "revoked" ? 0 : 1);
          expect(result.status).toBe(change === "revoked" ? 401 : 200);
          if (change === "revoked") expect(JSON.parse(result.body).code).toBe("unauthorized");
        } finally {
          finish(); await pending.catch(() => undefined); lookup.mockRestore();
        }
      });
    }
  }
  for (const scope of ["owner", "collaborator", "viewer"] satisfies TokenScope[]) {
    for (const change of ["revoked", "other-revoked", "unchanged"]) {
      for (const surface of ["session-read", "raw-read", "raw-stream", "session-stream"]) {
        test(`${scope}, ${surface}: ${change}`, async () => {
          const arrived = Promise.withResolvers<void>();
          const release = Promise.withResolvers<void>();
          const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === "/event") {
              let closed = false;
              return new Response(new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("data: connected\n\n"));
                  void release.promise.then(() => {
                    if (!closed) controller.enqueue(new TextEncoder().encode("data: private fixture stream\n\n"));
                  });
                },
                cancel() { closed = true; },
              }), { headers: { "content-type": "text/event-stream" } });
            }
            if (path === "/global/health") return Response.json({ healthy: true, version: "fixture" });
            if (surface === "session-stream") {
              if (path === "/session/status") return Response.json({ ses_fixture: { type: "idle" } });
              if (path === "/session/ses_fixture") return Response.json({ id: "ses_fixture", title: "private fixture conversation", slug: "fixture",
                directory: request.headers.get("x-opencode-directory"), time: { created: 1, updated: 2 } });
            }
            if (path !== "/session") return new Response(null, { status: 404 });
            arrived.resolve();
            await release.promise;
            return Response.json([{ id: "ses_fixture", title: "private fixture conversation", slug: "fixture",
              directory: request.headers.get("x-opencode-directory"), time: { created: 1, updated: 2 } }]);
          } });
          stops.push(() => upstream.stop(true));
          const app = await boot(upstream.url.origin);
          const token = await app.issue(scope, "fixture reader");
          const other = await app.issue(scope, "unrelated reader");
          const path = surface === "session-stream" ? "/workspace/ws_tokens/sessions/ses_fixture/events?maxEvents=2&heartbeatMs=1000"
            : surface === "session-read" ? "/workspace/ws_tokens/sessions"
            : `/w/ws_tokens/opencode/${surface === "raw-stream" ? "event" : "session"}`;
          const controller = new AbortController();
          const pending = fetch(`${app.base}${path}`, { headers: { authorization: `Bearer ${token.token}` }, signal: controller.signal });
          try {
            if (surface === "raw-stream" || surface === "session-stream") {
              const response = await pending;
              expect(response.status).toBe(200);
              const reader = response.body?.getReader();
              if (!reader) throw new Error("Missing fixture stream");
              try {
                const first = new TextDecoder().decode((await reader.read()).value);
                expect(first).toContain(surface === "raw-stream" ? "connected" : "session.status");
                if (change !== "unchanged") await app.revoke(change === "revoked" ? token.id : other.id);
                release.resolve();
                if (surface === "session-stream") {
                  const event = JSON.parse(first.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? "{}");
                  // A pre-revocation buffered heartbeat is not post-revocation delivery.
                  expect(Date.now() - event.observedAt).toBeLessThan(1000);
                }
                const next = await reader.read();
                if (change === "revoked") expect(next.done).toBe(true);
                else expect(new TextDecoder().decode(next.value)).toContain(surface === "raw-stream" ? "private fixture stream" : "heartbeat");
              } finally { await reader.cancel().catch(() => undefined); }
            } else {
              await arrived.promise;
              if (change !== "unchanged") await app.revoke(change === "revoked" ? token.id : other.id);
              release.resolve();
              const response = await pending;
              const text = await response.text();
              expect(response.status).toBe(change === "revoked" ? 401 : 200);
              if (change === "revoked") expect(text).not.toContain("private fixture conversation");
              else expect(text).toContain("private fixture conversation");
            }
            const reconnect = await fetch(`${app.base}${path}`, { headers: { authorization: `Bearer ${token.token}` } });
            expect(reconnect.status).toBe(change === "revoked" ? 401 : 200);
            await reconnect.body?.cancel();
          } finally {
            release.resolve(); controller.abort();
            await pending.catch(() => undefined);
          }
        });
      }
    }
  }
});
