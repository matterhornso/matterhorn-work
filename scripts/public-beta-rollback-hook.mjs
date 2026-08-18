#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const VERSION = "matterhorn.public-beta-rollback-hook.v1";
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export function parseArgs(argv) {
  const config = {
    railwayProject: "",
    railwayService: "",
    railwayEnvironment: "",
    railwayDeploymentId: "",
    vercelDeployment: "",
    vercelScope: "",
    vercelProjectPrefix: "matterhorn-desks-canary",
    currentCommit: "",
    targetCommit: "",
    confirm: "",
    apply: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf("=");
    const arg = separator > 0 ? raw.slice(0, separator) : raw;
    const inline = separator > 0 ? raw.slice(separator + 1) : null;
    const next = () => {
      if (inline !== null) {
        if (!inline) throw new Error(`${arg} requires a value.`);
        return inline;
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--railway-project": config.railwayProject = next(); break;
      case "--railway-service": config.railwayService = next(); break;
      case "--railway-environment": config.railwayEnvironment = next(); break;
      case "--railway-deployment-id": config.railwayDeploymentId = next(); break;
      case "--vercel-deployment": config.vercelDeployment = next(); break;
      case "--vercel-scope": config.vercelScope = next(); break;
      case "--vercel-project-prefix": config.vercelProjectPrefix = next(); break;
      case "--current-commit": config.currentCommit = next().toLowerCase(); break;
      case "--target-commit": config.targetCommit = next().toLowerCase(); break;
      case "--confirm": config.confirm = next().toLowerCase(); break;
      case "--apply": config.apply = true; break;
      case "--json": config.json = true; break;
      case "--help":
      case "-h": config.help = true; break;
      default: throw new Error(`Unknown argument: ${raw}`);
    }
  }
  return config;
}

function help() {
  return [
    "Matterhorn Public Beta rollback hook",
    "",
    "Builds an exact-target rollback plan. It is dry-run only unless --apply and",
    "--confirm rollback:<target-commit> are both present.",
    "",
    "The applied sequence freezes signups and guarded mode without triggering a deploy,",
    "rolls Railway back to an immutable deployment, then promotes an immutable Vercel deployment.",
    "No credentials or secret values are accepted by this command.",
  ].join("\n");
}

function required(value, flag) {
  if (!value) throw new Error(`${flag} is required.`);
}

function validateUuid(value, flag) {
  required(value, flag);
  if (!UUID_PATTERN.test(value)) throw new Error(`${flag} must be a UUID.`);
}

function validateSafeName(value, flag) {
  required(value, flag);
  if (!SAFE_NAME_PATTERN.test(value)) throw new Error(`${flag} contains unsupported characters.`);
}

function validateVercelDeployment(value, prefix) {
  required(value, "--vercel-deployment");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--vercel-deployment must be an immutable HTTPS deployment URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("--vercel-deployment must be a credential-free immutable HTTPS deployment URL.");
  }
  const expectedPrefix = `${prefix.toLowerCase()}-`;
  if (!url.hostname.toLowerCase().startsWith(expectedPrefix) || !url.hostname.toLowerCase().endsWith(".vercel.app")) {
    throw new Error("--vercel-deployment must be an immutable deployment for the configured Vercel project prefix.");
  }
  if (url.pathname !== "/") throw new Error("--vercel-deployment must not include a path.");
  return url.origin;
}

export function validateConfig(config) {
  validateUuid(config.railwayProject, "--railway-project");
  validateSafeName(config.railwayService, "--railway-service");
  validateSafeName(config.railwayEnvironment, "--railway-environment");
  validateUuid(config.railwayDeploymentId, "--railway-deployment-id");
  validateSafeName(config.vercelProjectPrefix, "--vercel-project-prefix");
  if (config.vercelScope) validateSafeName(config.vercelScope, "--vercel-scope");
  if (!SHA_PATTERN.test(config.currentCommit)) throw new Error("--current-commit must be a full 40-character commit SHA.");
  if (!SHA_PATTERN.test(config.targetCommit)) throw new Error("--target-commit must be a full 40-character commit SHA.");
  if (config.currentCommit === config.targetCommit) throw new Error("Current and target commits must differ.");
  const vercelDeployment = validateVercelDeployment(config.vercelDeployment, config.vercelProjectPrefix);
  const requiredConfirmation = `rollback:${config.targetCommit}`;
  if (config.apply && config.confirm !== requiredConfirmation) {
    throw new Error(`--apply requires --confirm ${requiredConfirmation}.`);
  }
  return { vercelDeployment, requiredConfirmation };
}

export function buildRollbackPlan(config) {
  const { vercelDeployment, requiredConfirmation } = validateConfig(config);
  const plan = [
    {
      id: "freeze_runtime",
      command: "railway",
      args: [
        "variable", "set",
        "--project", config.railwayProject,
        "--service", config.railwayService,
        "--environment", config.railwayEnvironment,
        "--skip-deploys",
        "MATTERHORN_SIGNUPS_ENABLED=false",
        "MATTERHORN_GUARDED_RUNTIME_MODE=off",
        `MATTERHORN_BUILD_COMMIT=${config.targetCommit}`,
      ],
    },
    {
      id: "rollback_railway",
      command: "railway",
      args: [
        "api",
        "mutation RollbackDeployment($id: String!) { deploymentRollback(id: $id) }",
        "--raw-var", `id=${config.railwayDeploymentId}`,
        "--compact",
      ],
    },
    {
      id: "promote_vercel",
      command: "vercel",
      args: [
        "promote", vercelDeployment, "--yes",
        ...(config.vercelScope ? ["--scope", config.vercelScope] : []),
      ],
    },
  ];
  return { plan, requiredConfirmation, vercelDeployment };
}

function publicStep(step) {
  return { id: step.id, command: step.command, args: [...step.args] };
}

export function executeRollback(config, runner = spawnSync) {
  const { plan, requiredConfirmation, vercelDeployment } = buildRollbackPlan(config);
  const report = {
    version: VERSION,
    mode: config.apply ? "apply" : "dry_run",
    applied: false,
    currentCommit: config.currentCommit,
    targetCommit: config.targetCommit,
    railwayDeploymentId: config.railwayDeploymentId,
    vercelDeployment,
    requiredConfirmation,
    plan: plan.map(publicStep),
    completedSteps: [],
  };
  if (!config.apply) return report;

  for (const step of plan) {
    const result = runner(step.command, step.args, {
      shell: false,
      stdio: "inherit",
      env: process.env,
    });
    if (result.error) throw new Error(`${step.id} failed to start: ${result.error.message}`);
    if (result.signal) throw new Error(`${step.id} terminated by signal ${result.signal}.`);
    if (result.status !== 0) throw new Error(`${step.id} exited with status ${result.status ?? "unknown"}.`);
    report.completedSteps.push(step.id);
  }
  report.applied = true;
  return report;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const report = executeRollback(config);
  if (config.json || !config.apply) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Public Beta rollback applied to ${report.targetCommit}. Verify health and exact commit now.\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
