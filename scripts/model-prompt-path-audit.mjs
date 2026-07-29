#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const VERSION = "matterhorn.model-prompt-path-audit.v1";
const STALE_COPY = "until the prompt path is fully unified";

const FILES = {
  serverRoute: "apps/server/src/server.ts",
  serverModelContract: "apps/server/src/backend-models.ts",
  serverRouteTests: "apps/server/src/session-read-model.e2e.test.ts",
  appSessionRoute: "apps/app/src/react-app/shell/session-route.tsx",
  settingsAiView: "apps/app/src/react-app/domains/settings/pages/ai-view.tsx",
  settingsReadiness: "apps/app/src/react-app/domains/settings/state/model-readiness-summary.ts",
};

function usage() {
  return `Model prompt path audit

Usage:
  node scripts/model-prompt-path-audit.mjs [--json] [--json-output <path>]

Checks that Matterhorn's prompt model path is truthful:
  - stable workspace prompt routes resolve the model server-side
  - app composer and desk sends pass explicit picker overrides
  - Settings exposes workspace default controls
  - regression tests cover server default, workspace default, and explicit request override precedence
`;
}

function parseArgs(argv) {
  const parsed = { json: false, jsonOutput: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--json-output") {
      const next = argv[index + 1];
      if (!next) throw new Error("--json-output requires a path");
      parsed.jsonOutput = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function readSources() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      const source = await readFile(resolve(file), "utf8");
      return [key, { file, source }];
    }),
  );
  return Object.fromEntries(entries);
}

function makeCheck(id, label, file, pass, detail) {
  return {
    id,
    label,
    file,
    status: pass ? "pass" : "fail",
    detail,
  };
}

function containsAll(source, snippets) {
  return snippets.every((snippet) => source.includes(snippet));
}

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function runChecks(sources) {
  const checks = [];
  const serverRoute = sources.serverRoute.source;
  const serverModelContract = sources.serverModelContract.source;
  const serverRouteTests = sources.serverRouteTests.source;
  const appSessionRoute = sources.appSessionRoute.source;
  const settingsAiView = sources.settingsAiView.source;
  const settingsReadiness = sources.settingsReadiness.source;

  checks.push(makeCheck(
    "server-stable-route-resolves-model",
    "Stable workspace prompt route resolves model before sending",
    FILES.serverRoute,
    containsAll(serverRoute, [
      "await resolveSessionPromptModel(config, workspace, parseSessionPromptModel(body))",
      "sessionPromptAuditMetadata(",
      "modelResolution,",
      "modelResolution.model ? { model: modelResolution.model } : {}",
      "metadata: auditMetadata",
    ]),
    "The workspace /sessions/:sessionId/messages route must normalize model precedence and audit the source.",
  ));

  checks.push(makeCheck(
    "server-precedence-tests",
    "Server tests cover prompt model precedence",
    FILES.serverRouteTests,
    containsAll(serverRouteTests, [
      "submits stable route prompts with the server default model when no selection exists",
      "submits stable route prompts with the saved workspace model when request omits model",
      "request model overrides saved workspace model for stable route prompts",
      'modelSource: "server_default"',
      'modelSource: "server_workspace_preference"',
      'modelSource: "request"',
    ]),
    "Regression coverage must prove server fallback, workspace default, and explicit request override behavior.",
  ));

  checks.push(makeCheck(
    "app-composer-send-uses-picker-model",
    "Composer prompt send passes explicit picker override",
    FILES.appSessionRoute,
    appSessionRoute.includes("model: selectedPromptModel ?? undefined"),
    "Normal chat sends should include providerID/modelID only when the app picker has a concrete selection.",
  ));

  checks.push(makeCheck(
    "app-desk-send-uses-picker-model",
    "Desk immediate send passes explicit picker override",
    FILES.appSessionRoute,
    countOccurrences(appSessionRoute, "model: selectedPromptModel ?? undefined") >= 2,
    "Desk task launches should follow the same explicit override contract as normal chat sends.",
  ));

  checks.push(makeCheck(
    "settings-workspace-default-controls",
    "Settings exposes workspace default model controls",
    FILES.settingsAiView,
    containsAll(settingsAiView, [
      "Use workspace default",
      "Save for workspace",
      "saveWorkspaceModelSelection",
      "clearWorkspaceModelSelection",
      "notifyWorkspaceModelSelectionChanged",
    ]),
    "Users need visible controls to save, use, and clear the server-owned workspace default.",
  ));

  checks.push(makeCheck(
    "settings-copy-explains-precedence",
    "Settings copy explains precedence",
    FILES.settingsReadiness,
    containsAll(settingsReadiness, [
      "This chat follows the workspace default.",
      "Used for new chats and desk tasks unless you choose another model.",
      "You can still choose another model for a chat.",
    ]),
    "Settings should explain in plain language that a chat choice overrides the saved workspace default.",
  ));

  checks.push(makeCheck(
    "backend-copy-no-stale-unified-warning",
    "Backend model contract no longer claims prompt path is pending",
    FILES.serverModelContract,
    !serverModelContract.includes(STALE_COPY),
    "The backend contract must reflect the current precedence rule instead of saying unification is future work.",
  ));

  checks.push(makeCheck(
    "app-send-path-no-hardcoded-default-model",
    "App prompt send path does not hardcode the default model",
    FILES.appSessionRoute,
    !appSessionRoute.includes("big-pickle"),
    "Default model fallback belongs in the server/engine contract, not in the React send path.",
  ));

  return checks;
}

function buildReport(checks) {
  const failed = checks.filter((check) => check.status !== "pass");
  return {
    success: failed.length === 0,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    summary: failed.length === 0
      ? "Matterhorn prompt model path is aligned."
      : `${failed.length} prompt model path checks failed.`,
    modelPrecedence: [
      "Explicit app picker request model wins for that app session.",
      "Saved workspace default is used by stable workspace prompt routes when the request omits a model.",
      "Engine/server default is used when neither request model nor workspace default exists.",
    ],
    checks,
  };
}

function renderText(report) {
  const lines = [
    `Model prompt path audit (${report.version})`,
    report.summary,
    "",
    "Precedence:",
    ...report.modelPrecedence.map((item) => `- ${item}`),
    "",
    "Checks:",
    ...report.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.label}`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const sources = await readSources();
  const report = buildReport(runChecks(sources));

  if (args.jsonOutput) {
    await writeFile(resolve(args.jsonOutput), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderText(report));
  }

  if (!report.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
