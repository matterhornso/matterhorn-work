#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const DEFAULT_OUTPUT_DIR = "qa-reports/generated-media-e2e-smoke";
const STACK_READY_TIMEOUT_MS = 60_000;
const SMOKE_TIMEOUT_MS = 90_000;

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [name, inlineValue] = arg.split("=", 2);
    if (inlineValue !== undefined) {
      values.set(name, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(name, next);
      index += 1;
      continue;
    }
    flags.add(name);
  }

  return {
    help: flags.has("--help") || flags.has("-h"),
    headed: flags.has("--headed"),
    json: flags.has("--json"),
    outputDir: values.get("--output-dir") || process.env.MATTERHORN_MEDIA_E2E_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
  };
}

function printHelp() {
  console.log(`Matterhorn generated-media E2E smoke

Starts the dedicated generated-media smoke stack, runs the browser smoke against it,
then shuts the stack down.

Usage:
  node scripts/generated-media-e2e-smoke.mjs
  node scripts/generated-media-e2e-smoke.mjs --json --output-dir qa-reports/generated-media-e2e-smoke

Options:
  --output-dir <dir>   Evidence directory for the browser smoke.
  --json               Forward JSON output from the browser smoke.
  --headed             Run the browser smoke headed.
  --help               Show this message.
`);
}

function waitForAppUrl(stack) {
  return new Promise((resolveReady, rejectReady) => {
    let settled = false;
    let buffered = "";
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      rejectReady(new Error("Timed out waiting for generated-media smoke app URL."));
    }, STACK_READY_TIMEOUT_MS);

    const onData = (chunk) => {
      const text = String(chunk);
      buffered += text;
      process.stdout.write(text);
      const match = buffered.match(/App:\s+(http:\/\/127\.0\.0\.1:\d+\/workspace\/[^\s]+\/session)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      stack.stdout.off("data", onData);
      resolveReady(match[1]);
    };

    stack.stdout.on("data", onData);
    stack.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));
    stack.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectReady(new Error(`Generated-media smoke stack exited before ready (${signal ?? code ?? 1}).`));
    });
    stack.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectReady(error);
    });
  });
}

function runBrowserSmoke(appUrl, options) {
  return new Promise((resolveRun) => {
    const args = [
      "scripts/generated-media-browser-smoke.mjs",
      "--strict",
      "--url",
      appUrl,
      "--output-dir",
      resolve(options.outputDir),
    ];
    if (options.json) args.push("--json");
    if (options.headed) args.push("--headed");

    const child = spawn("node", args, { stdio: "inherit" });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolveRun(1);
    }, SMOKE_TIMEOUT_MS);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveRun(code ?? 1);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      console.error(error.message);
      resolveRun(1);
    });
  });
}

async function stopStack(stack) {
  if (stack.exitCode !== null || stack.signalCode !== null) return;
  stack.kill("SIGINT");
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (stack.exitCode === null && stack.signalCode === null) stack.kill("SIGTERM");
      resolveStop();
    }, 3_000);
    stack.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

const options = parseArgs();
if (options.help) {
  printHelp();
  process.exit(0);
}

const stack = spawn("node", ["scripts/dev-generated-media-smoke.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let exitCode = 1;
try {
  const appUrl = await waitForAppUrl(stack);
  console.log(`Running generated-media browser smoke against ${appUrl}`);
  exitCode = await runBrowserSmoke(appUrl, options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await stopStack(stack);
}

process.exit(exitCode);
