import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import { OperationalMetrics } from "./operational-metrics.js";
import type { ServerConfig } from "./types.js";

const OWNER_TOKEN = "matterhorn_metrics_owner";
const HOST_TOKEN = "matterhorn_metrics_host";
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(withWorkspace = true): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-operational-metrics-"));
  dirs.push(root);
  const port = await getFreePort();
  const config: ServerConfig = {
    host: "127.0.0.1",
    port,
    token: OWNER_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "manual", timeoutMs: 5000 },
    corsOrigins: ["loopback"],
    workspaces: withWorkspace ? [{
      id: "ws_metrics",
      name: "Metrics test",
      path: root,
      preset: "starter",
      workspaceType: "local",
    }] : [],
    authorizedRoots: withWorkspace ? [root] : [],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "json",
    logRequests: false,
    reloadWatchers: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  return `http://127.0.0.1:${server.port}`;
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("operational probes and metrics", () => {
  test("liveness and readiness are public, redacted, and hardened", async () => {
    const base = await boot();
    const live = await fetch(`${base}/health/live`);
    const ready = await fetch(`${base}/health/ready`);
    const liveBody = await live.json();
    const readyBody = await ready.json();

    expect(live.status).toBe(200);
    expect(liveBody).toMatchObject({ ok: true, status: "live" });
    expect(ready.status).toBe(200);
    expect(readyBody).toMatchObject({
      ok: true,
      status: "ready",
      checks: {
        workspaceConfigured: true,
        workspaceStorageAvailable: true,
        authConfigured: true,
      },
    });
    expect(JSON.stringify(readyBody)).not.toContain(OWNER_TOKEN);
    expect(JSON.stringify(readyBody)).not.toContain(HOST_TOKEN);
    expect(JSON.stringify(readyBody)).not.toContain(tmpdir());
    expect(ready.headers.get("cache-control")).toBe("no-store");
    expect(ready.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("readiness fails closed when no workspace is configured", async () => {
    const base = await boot(false);
    const response = await fetch(`${base}/health/ready`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: { workspaceConfigured: false },
    });
  });

  test("shadow and enforced guarded runtime fail readiness when either server-only secret is missing", async () => {
    const previous = {
      mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
      runtime: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
      capability: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
    };
    delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
    delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    try {
      for (const mode of ["shadow", "enforce"] as const) {
        process.env.MATTERHORN_GUARDED_RUNTIME_MODE = mode;
        const base = await boot();
        const response = await fetch(`${base}/health/ready`);
        const body = await response.json();
        expect(response.status).toBe(503);
        expect(body).toMatchObject({ checks: { guardedRuntimeReady: false, guardedRuntimeMode: mode } });
      }
    } finally {
      if (previous.mode === undefined) delete process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
      else process.env.MATTERHORN_GUARDED_RUNTIME_MODE = previous.mode;
      if (previous.runtime === undefined) delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
      else process.env.MATTERHORN_AGENT_RUNTIME_SECRET = previous.runtime;
      if (previous.capability === undefined) delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
      else process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = previous.capability;
    }
  });

  test("metrics require owner authentication and expose bounded labels only", async () => {
    const base = await boot();
    await fetch(`${base}/not-a-real-route`);
    const toolResponse = await fetch(`${base}/mcp/opencode`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OWNER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "metrics-tool",
        method: "tools/call",
        params: { name: "matterhorn_status", arguments: {} },
      }),
    });
    expect(toolResponse.status).toBe(200);

    const denied = await fetch(`${base}/metrics`);
    expect(denied.status).toBe(401);

    const response = await fetch(`${base}/metrics`, {
      headers: { "x-matterhorn-host-token": HOST_TOKEN },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("matterhorn_backend_ready 1");
    expect(body).toContain("matterhorn_http_requests_total");
    expect(body).toContain('route="unmatched"');
    expect(body).toContain("matterhorn_http_request_duration_seconds_bucket");
    expect(body).toContain("matterhorn_http_rate_limit_rejections_total");
    expect(body).toContain("matterhorn_provider_failures_total");
    expect(body).toContain("matterhorn_agent_tool_calls_total");
    expect(body).toContain('tool="matterhorn_status"');
    expect(body).toContain('access="system"');
    expect(body).toContain('outcome="success"');
    expect(body).toContain("matterhorn_agent_tool_duration_seconds_sum");
    expect(body).not.toContain(OWNER_TOKEN);
    expect(body).not.toContain(HOST_TOKEN);
    expect(body).not.toContain("not-a-real-route");
    expect(body).not.toContain(tmpdir());
  });

  test("guarded-runtime shadow metrics expose bounded decisions without request content", () => {
    const metrics = new OperationalMetrics();
    const body = metrics.renderPrometheus({
      ready: true,
      uptimeMs: 1_000,
      guardedRuntimeObservations: [{
        mode: "shadow",
        stage: "consume",
        decision: "would_deny",
        reason: "capability_argument_mutation",
        count: 2,
      }],
    });
    expect(body).toContain("matterhorn_guarded_capability_decisions_total");
    expect(body).toContain('mode="shadow"');
    expect(body).toContain('stage="consume"');
    expect(body).toContain('decision="would_deny"');
    expect(body).toContain('reason="capability_argument_mutation"');
    expect(body).not.toContain("private key");
    expect(body).not.toContain("walletAddress");
    expect(body).not.toContain("toolArguments");
  });
});
