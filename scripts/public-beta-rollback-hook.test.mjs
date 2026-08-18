#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { buildRollbackPlan, executeRollback, parseArgs } from "./public-beta-rollback-hook.mjs";

const currentCommit = "a".repeat(40);
const targetCommit = "b".repeat(40);
const baseArgs = [
  "--railway-project", "935a8288-3a56-4964-8edf-d2eed8ae9e79",
  "--railway-service", "bd355c60-01e6-4e7f-940c-14a8d95dd72e",
  "--railway-environment", "8cd2f051-83fa-4005-bd23-6657991283e2",
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
const { preflight, plan, requiredConfirmation } = buildRollbackPlan(config);
assert.equal(requiredConfirmation, `rollback:${targetCommit}`);
assert.deepEqual(preflight.map((step) => step.id), ["validate_railway_target", "validate_vercel_target"]);
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
assert.deepEqual(dryRun.completedPreflights, []);
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
const successfulRunner = (command, args, options) => {
  calls.push({ command, args, options });
  if (command === "railway" && args[0] === "api" && args[1].startsWith("query TargetDeployment")) {
    return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({ data: { deployment: {
        id: config.railwayDeploymentId,
        projectId: config.railwayProject,
        serviceId: config.railwayService,
        environmentId: config.railwayEnvironment,
        status: "SUCCESS",
        canRollback: true,
      } } }),
    };
  }
  if (command === "vercel" && args[0] === "inspect") {
    return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({
        id: "dpl_accepted",
        name: "matterhorn-desks-canary",
        url: new URL(config.vercelDeployment).hostname,
        readyState: "READY",
        target: "production",
      }),
    };
  }
  return { status: 0, signal: null };
};
const applied = executeRollback(
  parseArgs([...baseArgs, "--apply", "--confirm", `rollback:${targetCommit}`]),
  successfulRunner,
);
assert.equal(applied.applied, true);
assert.deepEqual(applied.targetValidation, { railway: true, vercel: true });
assert.deepEqual(applied.completedPreflights, ["validate_railway_target", "validate_vercel_target"]);
assert.deepEqual(applied.completedSteps, ["freeze_runtime", "rollback_railway", "promote_vercel"]);
assert.equal(calls.every((call) => call.options.shell === false), true);
assert.equal(calls.length, 5);

let mismatchedAttempts = 0;
assert.throws(
  () => executeRollback(
    parseArgs([...baseArgs, "--apply", "--confirm", `rollback:${targetCommit}`]),
    (command, args, options) => {
      mismatchedAttempts += 1;
      const result = successfulRunner(command, args, options);
      if (mismatchedAttempts === 1) {
        const payload = JSON.parse(result.stdout);
        payload.data.deployment.serviceId = "00000000-0000-4000-8000-000000000000";
        result.stdout = JSON.stringify(payload);
      }
      return result;
    },
  ),
  /validate_railway_target rejected/i,
);
assert.equal(mismatchedAttempts, 1, "a target mismatch must fail before any mutation command");

let attempts = 0;
assert.throws(
  () => executeRollback(
    parseArgs([...baseArgs, "--apply", "--confirm", `rollback:${targetCommit}`]),
    (command, args, options) => {
      attempts += 1;
      const result = successfulRunner(command, args, options);
      if (attempts === 4) return { status: 1, signal: null };
      return result;
    },
  ),
  /rollback_railway exited with status 1/i,
);
assert.equal(attempts, 4, "execution must stop immediately after the first failed mutation step");

const cliDryRun = await run([...baseArgs, "--json"]);
assert.equal(cliDryRun.code, 0, cliDryRun.stderr || cliDryRun.stdout);
const cliReport = JSON.parse(cliDryRun.stdout);
assert.equal(cliReport.version, "matterhorn.public-beta-rollback-hook.v1");
assert.equal(cliReport.applied, false);
assert.doesNotMatch(cliDryRun.stdout, /secret|token/i);

console.log("Public Beta rollback hook contract passed.");
