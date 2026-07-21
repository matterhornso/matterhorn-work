#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = "scripts/production-cors-readiness.mjs";
const managedEnv = [
  "MATTERHORN_WORK_CORS_ORIGINS",
  "OPENWORK_CORS_ORIGINS",
];

function run(args, env = {}) {
  return new Promise((resolve) => {
    const nextEnv = { ...process.env, ...env };
    for (const key of managedEnv) {
      if (!(key in env)) delete nextEnv[key];
    }
    const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"], env: nextEnv });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts["smoke:production-cors-readiness"],
  "node scripts/production-cors-readiness.mjs --require-production",
);
assert.equal(
  packageJson.scripts["test:production-cors-readiness"],
  "node scripts/production-cors-readiness.test.mjs",
);

const source = readFileSync(scriptPath, "utf8");
for (const required of [
  "matterhorn.production-cors-readiness.v1",
  "--require-production",
  "apps/server/src/config.ts",
  "scripts/dev-matterhorn-local.mjs",
  "scripts/dev-headless-web.ts",
  "scripts/dev-generated-media-smoke.mjs",
  "MATTERHORN_WORK_CORS_ORIGINS",
  "OPENWORK_CORS_ORIGINS",
  "Wildcard CORS",
]) {
  assert.ok(source.includes(required), `production CORS readiness script missing ${required}`);
}

const serverConfig = readFileSync("apps/server/src/config.ts", "utf8");
assert.match(serverConfig, /\?\?\s*\["loopback"\]/, "server config should default to loopback CORS");

const localDev = readFileSync("scripts/dev-matterhorn-local.mjs", "utf8");
assert.match(localDev, /"--cors",\s*"loopback"/, "dev:matterhorn-local should pass --cors loopback");
assert.ok(!/"--cors",\s*"\*"/.test(localDev), "dev:matterhorn-local must not pass wildcard CORS");

const headlessWebDev = readFileSync("scripts/dev-headless-web.ts", "utf8");
assert.match(headlessWebDev, /"--cors",\s*"loopback"/, "dev:headless-web should pass --cors loopback");
assert.ok(!/"--cors",\s*"\*"/.test(headlessWebDev), "dev:headless-web must not pass wildcard CORS");

const generatedMediaDev = readFileSync("scripts/dev-generated-media-smoke.mjs", "utf8");
assert.match(generatedMediaDev, /"--cors",\s*"loopback"/, "generated media smoke should pass --cors loopback");
assert.ok(!/"--cors",\s*"\*"/.test(generatedMediaDev), "generated media smoke must not pass wildcard CORS");

{
  const result = await run(["--require-production", "--json"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, "matterhorn.production-cors-readiness.v1");
  assert.equal(report.ok, true);
  assert.equal(report.ready, true);
  assert.equal(report.policy.defaultCors, "loopback");
  assert.equal(report.policy.productionWildcardAllowed, false);
  assert.deepEqual(report.failures, []);
  assert.ok(report.checks.every((check) => check.status === "pass"));
}

{
  const result = await run(
    ["--require-production", "--json"],
    { MATTERHORN_WORK_CORS_ORIGINS: "*" },
  );
  assert.equal(result.code, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.failures.some((failure) => failure.id === "environment_cors"));
  const envCheck = report.checks.find((check) => check.id === "environment_cors");
  assert.deepEqual(envCheck.wildcardKeys, ["MATTERHORN_WORK_CORS_ORIGINS"]);
  assert.doesNotMatch(JSON.stringify(report), /ghp_|owt_|sk-/);
}

{
  const result = await run(
    ["--require-production", "--json"],
    { OPENWORK_CORS_ORIGINS: "http://localhost:5173,http://127.0.0.1:5175" },
  );
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  const envCheck = report.checks.find((check) => check.id === "environment_cors");
  assert.equal(envCheck.status, "pass");
  assert.deepEqual(envCheck.configuredKeys, ["OPENWORK_CORS_ORIGINS"]);
}

{
  const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-cors-readiness-"));
  try {
    const outputPath = join(outputDir, "cors-readiness.json");
    const result = await run(["--json-output", outputPath]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("Matterhorn production CORS readiness: PASS"));
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(report.version, "matterhorn.production-cors-readiness.v1");
    assert.equal(report.ready, true);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

{
  const help = await run(["--help"]);
  assert.equal(help.code, 0, help.stderr || help.stdout);
  for (const text of [
    "Matterhorn production CORS readiness",
    "pnpm smoke:production-cors-readiness",
    "--require-production",
    "performs no network requests",
  ]) {
    assert.ok(help.stdout.includes(text), `help missing ${text}`);
  }
}

console.log("Production CORS readiness contract passed.");
