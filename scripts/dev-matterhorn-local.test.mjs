#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const script = readFileSync("scripts/dev-matterhorn-local.mjs", "utf8");

assert.ok(
  script.includes('"--cors", "loopback"'),
  "dev:matterhorn-local should start the Matterhorn server with loopback CORS",
);
assert.equal(
  script.includes('"--cors", "*"'),
  false,
  "dev:matterhorn-local must not force wildcard CORS",
);
assert.ok(
  script.includes("VITE_MATTERHORN_WORK_URL"),
  "dev:matterhorn-local should still wire the local app to the Matterhorn server",
);
assert.ok(
  script.includes('"apps", "app"') && script.includes('"node_modules", ".bin"') && script.includes("existsSync(viteBin)"),
  "dev:matterhorn-local should prefer the installed app Vite binary before invoking pnpm",
);
assert.ok(
  script.includes('command: "npx"'),
  "dev:matterhorn-local should keep a pnpm fallback when the local Vite binary is unavailable",
);
assert.ok(
  script.includes("OpenCode engine: not connected. Chats and desk tasks will show Needs setup."),
  "dev:matterhorn-local should explain that chat and desk execution need OpenCode",
);
assert.ok(
  script.includes("MATTERHORN_LOCAL_OPENCODE_URL=http://127.0.0.1:<port> pnpm dev:matterhorn-local"),
  "dev:matterhorn-local should show the explicit external OpenCode URL setup path",
);
assert.ok(
  script.includes("OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local"),
  "dev:matterhorn-local should show the managed sidecar setup path",
);
assert.ok(
  script.includes("MATTERHORN_LOCAL_SERVER_CONFIG") && script.includes('"--config", serverConfigPath'),
  "dev:matterhorn-local should support a durable multi-workspace server config",
);
assert.ok(
  script.includes("/backend/control-plane") &&
    script.includes('summary?.readinessStatus === "working"') &&
    script.includes('!blockingChecks.includes("opencode_connection")'),
  "dev:matterhorn-local should wait for the workspace engine control plane before starting the app",
);
assert.ok(
  script.indexOf("Waiting for workspace agent engine readiness...") < script.indexOf("const app = appCommand(appPort)"),
  "dev:matterhorn-local should finish the engine warmup before launching Vite",
);
assert.ok(
  script.includes("requestTimeoutMs: 20_000"),
  "dev:matterhorn-local should allow the first cold control-plane request to finish",
);

const help = spawnSync(process.execPath, ["scripts/dev-matterhorn-local.mjs", "--help"], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 5_000,
});
assert.equal(help.status, 0, help.stderr || "dev:matterhorn-local --help should exit successfully");
assert.match(help.stdout, /MATTERHORN_LOCAL_SERVER_CONFIG/);
assert.doesNotMatch(help.stdout, /Starting Matterhorn Work local stack/);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts?.["test:dev-matterhorn-local"],
  "node scripts/dev-matterhorn-local.test.mjs",
  "package.json should expose the dev:matterhorn-local contract gate",
);

console.log("Matterhorn local dev launcher gate passed.");
