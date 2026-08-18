#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { buildRollbackPlan, executeRollback, parseArgs } from "./public-beta-rollback-hook.mjs";

const currentCommit = "a".repeat(40);
const targetCommit = "b".repeat(40);
const baseArgs = [
  "--railway-project", "935a8288-3a56-4964-8edf-d2eed8ae9e79",
  "--railway-service", "bd355c60-01e6-4e7f-940c-14a8d95dd72e",
  "--railway-environment", "production",
  "--railway-deployment-id", "b7c42c74-0986-4067-af69-8f94506a0c7a",
  "--vercel-deployment", "https://matterhorn-desks-canary-4jotdy5oi-abhinav-4820s-projects.vercel.app",
  "--vercel-scope", "abhinav-4820s-projects",
  "--current-commit", currentCommit,
  "--target-commit", targetCommit,
];

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/public-beta-rollback-hook.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const config = parseArgs(baseArgs);
const { plan, requiredConfirmation } = buildRollbackPlan(config);
assert.equal(requiredConfirmation, `rollback:${targetCommit}`);
assert.deepEqual(plan.map((step) => step.id), ["freeze_runtime", "rollback_railway", "promote_vercel"]);
assert.equal(plan.every((step) => step.command === "railway" || step.command === "vercel"), true);
assert.equal(plan[0].args.includes("--skip-deploys"), true);
assert.equal(plan[0].args.includes("MATTERHORN_SIGNUPS_ENABLED=false"), true);
assert.equal(plan[0].args.includes("MATTERHORN_GUARDED_RUNTIME_MODE=off"), true);
assert.equal(plan[0].args.includes(`MATTERHORN_BUILD_COMMIT=${targetCommit}`), true);
assert.equal(plan[1].args.includes(`id=${config.railwayDeploymentId}`), true);
assert.equal(plan[2].args.includes(config.vercelDeployment), true);

const dryRun = executeRollback(config, () => {
  throw new Error("dry run must not execute commands");
});
assert.equal(dryRun.mode, "dry_run");
assert.equal(dryRun.applied, false);
assert.deepEqual(dryRun.completedSteps, []);

assert.throws(
  () => buildRollbackPlan(parseArgs([...baseArgs, "--apply"])),
  /requires --confirm rollback:/i,
);
assert.throws(
  () => buildRollbackPlan(parseArgs([...baseArgs, "--current-commit", targetCommit])),
  /must differ/i,
);
assert.throws(
  () => buildRollbackPlan(parseArgs([...baseArgs, "--railway-deployment-id", "not-a-deployment"])),
  /must be a UUID/i,
);
assert.throws(
  () => buildRollbackPlan(parseArgs([...baseArgs, "--vercel-deployment", "https://evil.example/?token=secret"])),
  /credential-free immutable HTTPS|configured Vercel project/i,
);

const calls = [];
const applied = executeRollback(
  parseArgs([...baseArgs, "--apply", "--confirm", `rollback:${targetCommit}`]),
  (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, signal: null };
  },
);
assert.equal(applied.applied, true);
assert.deepEqual(applied.completedSteps, ["freeze_runtime", "rollback_railway", "promote_vercel"]);
assert.equal(calls.every((call) => call.options.shell === false), true);

let attempts = 0;
assert.throws(
  () => executeRollback(
    parseArgs([...baseArgs, "--apply", "--confirm", `rollback:${targetCommit}`]),
    () => ({ status: ++attempts === 2 ? 1 : 0, signal: null }),
  ),
  /rollback_railway exited with status 1/i,
);
assert.equal(attempts, 2, "execution must stop immediately after the first failed step");

const cliDryRun = await run([...baseArgs, "--json"]);
assert.equal(cliDryRun.code, 0, cliDryRun.stderr || cliDryRun.stdout);
const cliReport = JSON.parse(cliDryRun.stdout);
assert.equal(cliReport.version, "matterhorn.public-beta-rollback-hook.v1");
assert.equal(cliReport.applied, false);
assert.doesNotMatch(cliDryRun.stdout, /secret|token/i);

console.log("Public Beta rollback hook contract passed.");
