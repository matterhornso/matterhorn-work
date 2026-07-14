import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import { sanitizeTransactionSimulationError } from "./tools/transaction-simulation.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const OWNER_TOKEN = "owt_simulation_owner_token";
const HOST_TOKEN = "owt_simulation_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv() {
  for (const [key, value] of Object.entries({
    OPENWORK_ENV_STORE: priorEnv.envStore,
    OPENWORK_TOKEN_STORE: priorEnv.tokenStore,
    MATTERHORN_WORK_MEMORY_ROOT: priorEnv.memoryRoot,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function baseConfig(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: OWNER_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "manual", timeoutMs: 5000 },
    corsOrigins: ["loopback"],
    workspaces: [{
      id: "ws_simulation",
      name: "Simulation test workspace",
      path: root,
      preset: "starter",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
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

async function bootSimulationServer(): Promise<{ base: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-simulation-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");

  const port = await getFreePort();
  const server = await startServer(baseConfig(port, dir)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function postSimulation(base: string, body: Record<string, unknown>) {
  return fetch(`${base}/workspace/ws_simulation/wallet/simulate-transaction`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OWNER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv();
});

describe("transaction simulation safety", () => {
  test("keeps unsupported chain errors specific", () => {
    expect(sanitizeTransactionSimulationError(new Error("Unsupported chainId: 999"))).toBe("Unsupported chainId: 999");
  });

  test("normalizes common provider failures into user-facing copy", () => {
    expect(sanitizeTransactionSimulationError(new Error("execution reverted: ERC20: transfer amount exceeds balance"))).toBe(
      "Simulation failed: the transaction would revert.",
    );
    expect(sanitizeTransactionSimulationError(new Error("network timeout while fetching RPC provider"))).toBe(
      "Simulation failed: RPC provider unavailable.",
    );
    expect(sanitizeTransactionSimulationError(new Error("insufficient funds for gas * price + value"))).toBe(
      "Simulation failed: insufficient funds for gas or value.",
    );
  });

  test("does not leak raw request bodies, bearer tokens, private keys, or library internals", () => {
    const privateKey = `0x${"a".repeat(64)}`;
    const raw = [
      "HTTP request failed at viem@2.50.4",
      "Authorization: Bearer super-secret-token",
      `private_key=${privateKey}`,
      `body={\"rawTransaction\":\"0x${"b".repeat(160)}\"}`,
    ].join("\n");

    const message = sanitizeTransactionSimulationError(new Error(raw), "Simulation failed before approval.");

    expect(message).toBe("Simulation failed before approval.");
    expect(message).not.toContain("super-secret-token");
    expect(message).not.toContain(privateKey);
    expect(message).not.toContain("viem@");
    expect(message).not.toContain("rawTransaction");
  });

  test("truncates safe unknown messages", () => {
    const longSafeMessage = `Provider refused the transaction: ${"x".repeat(400)}`;
    const message = sanitizeTransactionSimulationError(new Error(longSafeMessage));

    expect(message.length).toBeLessThanOrEqual(220);
    expect(message.endsWith("...")).toBe(true);
  });

  test("workspace route returns sanitized unavailable state for unsupported chains", async () => {
    const { base } = await bootSimulationServer();
    const response = await postSimulation(base, {
      chainId: 999999,
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0",
      data: "0x",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.simulation.status).toBe("unavailable");
    expect(body.simulation.error).toBe("Unsupported chainId: 999999");
    expect(body.simulation.to).toBe("0x0000000000000000000000000000000000000002");
  });

  test("workspace route rejects secret-shaped simulation payloads", async () => {
    const { base } = await bootSimulationServer();
    const response = await postSimulation(base, {
      chainId: 84532,
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0",
      data: "0x",
      privateKey: `0x${"a".repeat(64)}`,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("wallet_simulation_secret_rejected");
    expect(body.message).not.toContain("aaaaaaaa");
  });
});
