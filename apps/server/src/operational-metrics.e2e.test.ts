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
const originalGuardedRuntimeDb = process.env.MATTERHORN_GUARDED_RUNTIME_DB;

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
  process.env.MATTERHORN_GUARDED_RUNTIME_DB = join(root, "guarded-runtime", "state.db");
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
  if (originalGuardedRuntimeDb === undefined) delete process.env.MATTERHORN_GUARDED_RUNTIME_DB;
  else process.env.MATTERHORN_GUARDED_RUNTIME_DB = originalGuardedRuntimeDb;
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

  test("hosted readiness reports the session privacy sealing key even when guarded capabilities are off", async () => {
    const previous = {
      hosted: process.env.MATTERHORN_HOSTED_PUBLIC_BETA,
      gateway: process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED,
      mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
      runtime: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
      capability: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
    };
    process.env.MATTERHORN_HOSTED_PUBLIC_BETA = "1";
    process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "1";
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "off";
    process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-secret-at-least-32-characters";
    delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    try {
      const missingBase = await boot();
      const missing = await fetch(`${missingBase}/health/ready`);
      expect(missing.status).toBe(503);
      expect(await missing.json()).toMatchObject({
        checks: {
          guardedRuntimeMode: "off",
          guardedRuntimeReady: true,
          sessionPrivacyStateReady: false,
        },
      });

      process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "capability-secret-at-least-32-characters";
      const configuredBase = await boot();
      const configured = await fetch(`${configuredBase}/health/ready`);
      expect(await configured.json()).toMatchObject({
        checks: { sessionPrivacyStateReady: true },
      });
    } finally {
      for (const [key, value] of Object.entries({
        MATTERHORN_HOSTED_PUBLIC_BETA: previous.hosted,
        MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED: previous.gateway,
        MATTERHORN_GUARDED_RUNTIME_MODE: previous.mode,
        MATTERHORN_AGENT_RUNTIME_SECRET: previous.runtime,
        MATTERHORN_CAPABILITY_SIGNING_SECRET: previous.capability,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("shadow and enforced guarded runtime require an explicit single-instance topology", async () => {
    const previous = {
      mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
      runtime: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
      capability: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
      instances: process.env.MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT,
    };
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
    process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-secret-at-least-32-characters";
    process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "capability-secret-at-least-32-characters";
    process.env.MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT = "2";
    try {
      const base = await boot();
      const response = await fetch(`${base}/health/ready`);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ checks: { guardedRuntimeTopologyReady: false } });
    } finally {
      for (const [key, value] of Object.entries({
        MATTERHORN_GUARDED_RUNTIME_MODE: previous.mode,
        MATTERHORN_AGENT_RUNTIME_SECRET: previous.runtime,
        MATTERHORN_CAPABILITY_SIGNING_SECRET: previous.capability,
        MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT: previous.instances,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("required host backups fail readiness until a recent verified upload marker exists", async () => {
    const previous = {
      required: process.env.MATTERHORN_HOST_BACKUP_REQUIRED,
      dataRoot: process.env.MATTERHORN_WORK_DATA_DIR,
    };
    const root = mkdtempSync(join(tmpdir(), "matterhorn-backup-readiness-"));
    dirs.push(root);
    process.env.MATTERHORN_HOST_BACKUP_REQUIRED = "1";
    process.env.MATTERHORN_WORK_DATA_DIR = root;
    try {
      const base = await boot();
      const response = await fetch(`${base}/health/ready`);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ checks: { hostBackupRequired: true, hostBackupFresh: false } });
      expect(JSON.stringify(body)).not.toContain(root);
    } finally {
      if (previous.required === undefined) delete process.env.MATTERHORN_HOST_BACKUP_REQUIRED;
      else process.env.MATTERHORN_HOST_BACKUP_REQUIRED = previous.required;
      if (previous.dataRoot === undefined) delete process.env.MATTERHORN_WORK_DATA_DIR;
      else process.env.MATTERHORN_WORK_DATA_DIR = previous.dataRoot;
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
