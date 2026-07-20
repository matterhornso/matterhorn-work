#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULTS = {
  upstreamUrl: process.env.OPENWORK_UPSTREAM_REMOTE || "https://github.com/different-ai/openwork.git",
  upstreamBranch: process.env.OPENWORK_UPSTREAM_BRANCH || "main",
  baseBranch: process.env.MATTERHORN_WORK_BASE_BRANCH || "dev",
};

export const CONFLICT_ZONES = [
  {
    name: "Branding and i18n",
    paths: ["apps/app/src/i18n", "README.md", "docs"],
    preserve: "Visible product copy should say Matterhorn Desks.",
  },
  {
    name: "Env vars and headers",
    paths: ["apps/server", "apps/orchestrator", "docs"],
    preserve: "Matterhorn-native aliases should take precedence while OpenWork fallbacks keep working.",
  },
  {
    name: "CLI and packaging",
    paths: ["apps/orchestrator", "packages", "scripts/release"],
    preserve: "Public commands should stay matterhorn-work and matterhorn-work-server with openwork shims.",
  },
  {
    name: "OpenCode abstraction",
    paths: ["apps/app/src", "apps/orchestrator", "docs/opencode-runtime-abstraction.md"],
    preserve: "User-facing copy should say Matterhorn Desks engine while technical docs can name OpenCode.",
  },
  {
    name: "Agent control surface",
    paths: ["docs/agent-control-*.md", "packages/matterhorn-work-mcp", "apps/orchestrator/src/cli.ts"],
    preserve: "HTTP, MCP, CLI, browser-control, and event-stream contracts should remain stable.",
  },
  {
    name: "Bittensor safety",
    paths: ["apps/server/src/tools/bittensor*", "packages/types/src/bittensor.ts", "docs/bittensor-*.md"],
    preserve: "Bittensor remains chat-first, non-custodial, source-aware, and no-secret by contract.",
  },
  {
    name: "Release automation",
    paths: [".github/workflows", "scripts/release", "apps/desktop"],
    preserve: "CI runner fallbacks, alpha packaging, and Matterhorn naming should remain intact.",
  },
];

export const VERIFICATION_COMMANDS = [
  "pnpm test:upstream-openwork-sync",
  "pnpm test:cli-packaging-rename",
  "pnpm test:opencode-abstraction-copy",
  "pnpm test:agent-control-coverage-matrix",
  "pnpm test:agent-control-doctor",
  "pnpm test:bittensor-operator-playbook",
  "pnpm test:bittensor-live-qa",
];

export function parseArgs(argv) {
  const parsed = {
    upstreamUrl: DEFAULTS.upstreamUrl,
    upstreamBranch: DEFAULTS.upstreamBranch,
    baseBranch: DEFAULTS.baseBranch,
    date: new Date().toISOString().slice(0, 10),
    json: false,
    remote: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === "--") continue;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--remote") parsed.remote = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--upstream-url") parsed.upstreamUrl = next();
    else if (arg === "--upstream-branch") parsed.upstreamBranch = next();
    else if (arg === "--base-branch") parsed.baseBranch = next();
    else if (arg === "--date") parsed.date = next();
    else throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

export function branchDateSlug(date) {
  const slug = String(date)
    .trim()
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || new Date().toISOString().slice(0, 10);
}

export function inspectRemote(upstreamUrl, upstreamBranch) {
  try {
    const output = execFileSync("git", ["ls-remote", "--heads", upstreamUrl, upstreamBranch], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    return {
      checked: true,
      status: output ? "reachable" : "missing_branch",
      message: output
        ? `Found upstream branch ${upstreamBranch}.`
        : `Could not find upstream branch ${upstreamBranch}.`,
      head: output.split(/\s+/)[0] || null,
    };
  } catch (error) {
    return {
      checked: true,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      head: null,
    };
  }
}

export function buildPlan(options) {
  const syncBranch = `codex/sync-openwork-${branchDateSlug(options.date)}`;
  const remoteStatus = options.remote
    ? inspectRemote(options.upstreamUrl, options.upstreamBranch)
    : {
        checked: false,
        status: "skipped",
        message: "Remote inspection skipped. Pass --remote when network access is available.",
      };

  return {
    upstreamUrl: options.upstreamUrl,
    upstreamBranch: options.upstreamBranch,
    baseBranch: options.baseBranch,
    syncBranch,
    remoteStatus,
    conflictZones: CONFLICT_ZONES,
    verificationCommands: VERIFICATION_COMMANDS,
    nextCommands: [
      `git fetch origin ${options.baseBranch}`,
      `git switch -c ${syncBranch} origin/${options.baseBranch}`,
      `git remote add openwork-upstream ${options.upstreamUrl}`,
      `git fetch openwork-upstream ${options.upstreamBranch}`,
      `git log --oneline ${options.baseBranch}..openwork-upstream/${options.upstreamBranch}`,
      `git diff --name-status ${options.baseBranch}...openwork-upstream/${options.upstreamBranch}`,
    ],
  };
}

export function printHuman(plan) {
  console.log("Matterhorn Desks upstream OpenWork sync intake");
  console.log("");
  console.log(`Upstream: ${plan.upstreamUrl} (${plan.upstreamBranch})`);
  console.log(`Base: ${plan.baseBranch}`);
  console.log(`Recommended branch: ${plan.syncBranch}`);
  console.log(`Remote status: ${plan.remoteStatus.status} - ${plan.remoteStatus.message}`);
  console.log("");
  console.log("Conflict zones to review:");
  for (const zone of plan.conflictZones) {
    console.log(`- ${zone.name}: ${zone.preserve}`);
  }
  console.log("");
  console.log("Verification commands:");
  for (const command of plan.verificationCommands) {
    console.log(`- ${command}`);
  }
  console.log("");
  console.log("Suggested intake commands:");
  for (const command of plan.nextCommands) {
    console.log(`- ${command}`);
  }
}

export function printHelp() {
  console.log(`Usage: node scripts/upstream-openwork-sync-check.mjs [options]

Options:
  --json                         Print JSON instead of human-readable text
  --remote                       Check the configured upstream branch with git ls-remote
  --upstream-url <url>           Override OPENWORK_UPSTREAM_REMOTE
  --upstream-branch <branch>     Override OPENWORK_UPSTREAM_BRANCH
  --base-branch <branch>         Override MATTERHORN_WORK_BASE_BRANCH
  --date <YYYY-MM-DD>            Date used in the recommended sync branch
  --help                         Show this help text
`);
}

export function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printHelp();
      return 0;
    }
    const plan = buildPlan(options);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      printHuman(plan);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
