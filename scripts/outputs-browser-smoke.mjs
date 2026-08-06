#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const DEFAULT_SERVER_URL = "http://127.0.0.1:4126";
const DEFAULT_OUTPUT_DIR = "qa-reports/outputs-browser-smoke";

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
    } else {
      flags.add(name);
    }
  }
  return {
    help: flags.has("--help") || flags.has("-h"),
    headed: flags.has("--headed") || process.env.MATTERHORN_OUTPUTS_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_OUTPUTS_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_OUTPUTS_BROWSER_URL || DEFAULT_URL,
    serverUrl: (values.get("--server-url") || process.env.MATTERHORN_OUTPUTS_BROWSER_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/$/, ""),
    token: values.get("--token") || process.env.MATTERHORN_OUTPUTS_BROWSER_TOKEN || process.env.VITE_MATTERHORN_WORK_TOKEN || "",
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_OUTPUTS_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn Outputs browser smoke

Usage:
  node scripts/outputs-browser-smoke.mjs --strict --token <client-token>
  node scripts/outputs-browser-smoke.mjs --url <app-url> --server-url <backend-url> --token <client-token>

Options:
  --url <url>          Matterhorn app URL.
  --server-url <url>   Authenticated Matterhorn backend. Default: ${DEFAULT_SERVER_URL}
  --token <token>      Collaborator client token. Never written to the report.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on journey, network, console, or page errors.
  --json               Print the full JSON report.
  --headed             Show Chromium while running.
  --help               Show this message.

Boundaries:
  This smoke seeds one wallet-reviewed Sui output, verifies its customer-facing
  preview/actions/note handoff, and deletes only that uniquely named QA output
  and its linked QA note. It never holds keys or submits without wallet approval.
`);
}

function workspaceContext(appUrl) {
  const url = new URL(appUrl);
  const match = url.pathname.match(/^\/workspace\/([^/]+)/);
  if (!match?.[1]) throw new Error(`Workspace id is missing from ${appUrl}`);
  return {
    workspaceId: decodeURIComponent(match[1]),
    sessionUrl(panel) {
      const next = new URL(url);
      next.pathname = `/workspace/${match[1]}/session`;
      next.search = `?panel=${panel}`;
      next.hash = "";
      return next.toString();
    },
  };
}

function makeReport(config) {
  return {
    name: "matterhorn-outputs-browser-smoke",
    url: config.url,
    serverUrl: config.serverUrl,
    startedAt: new Date().toISOString(),
    ready: false,
    stages: [],
    artifacts: {},
    warnings: [],
    errors: [],
  };
}

async function stage(report, id, label, action) {
  const startedAt = Date.now();
  try {
    const value = await action();
    report.stages.push({ id, label, status: "pass", durationMs: Date.now() - startedAt });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.stages.push({ id, label, status: "fail", durationMs: Date.now() - startedAt, error: message });
    throw error;
  }
}

function isOptionalDevWorkspace404(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return /^\/workspace\/[^/]+\/opencode\/mcp$/.test(url.pathname) ||
      (/^\/workspace\/[^/]+\/files\/content$/.test(url.pathname) &&
        url.searchParams.get("path") === ".opencode/agents/opencode-router.md");
  } catch {
    return false;
  }
}

function isBackendRequest(rawUrl) {
  try {
    const path = new URL(rawUrl).pathname;
    return path.startsWith("/api/") || path.startsWith("/workspace/") || path.startsWith("/w/");
  } catch {
    return false;
  }
}

function shouldRecordConsoleError(message) {
  return !(message.includes("Failed to load resource") && message.includes("404"));
}

function routeResponse(page, method, matcher) {
  return page.waitForResponse(
    (response) => response.request().method() === method && matcher(new URL(response.url()).pathname),
    { timeout: 15_000 },
  );
}

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned unreadable JSON.`);
  }
}

async function backendJson(config, path, init = {}) {
  const response = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function selectSeededOutput(region, outputPath, outputFileName) {
  const browseOutputs = region.locator("summary").filter({ hasText: "Browse outputs" });
  if (await browseOutputs.count()) {
    await browseOutputs.click();
    const outputRow = region.getByRole("button").filter({ hasText: outputPath });
    await outputRow.waitFor({ state: "visible", timeout: 20_000 });
    if (await outputRow.count() !== 1) throw new Error("Seeded output did not resolve to one Outputs row.");
    await outputRow.click();
  }

  await region.getByText(outputFileName, { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}
if (!config.token) {
  console.error("Matterhorn Outputs browser smoke requires --token or MATTERHORN_OUTPUTS_BROWSER_TOKEN.");
  process.exit(2);
}

const workspace = workspaceContext(config.url);
const report = makeReport(config);
const consoleErrors = [];
const pageErrors = [];
const networkFailures = [];
const qaSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const qaSessionId = `qa_outputs_${qaSuffix}`;
let outputPath = null;
let outputFileName = null;
let noteId = null;
let outputDeleted = false;
let noteDeleted = false;
let browser;
let page;

try {
  await mkdir(config.outputDir, { recursive: true });

  await stage(report, "seed_preview_output", "Create one wallet-reviewed QA output", async () => {
    const { response, payload } = await backendJson(
      config,
      `/workspace/${encodeURIComponent(workspace.workspaceId)}/sui/transactions/preview`,
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: qaSessionId,
          payload: {
            network: "testnet",
            sender: "0x2",
            recipient: "0x3",
            amountMist: "1000000000",
            memo: "Matterhorn Outputs browser QA",
          },
        }),
      },
    );
    if (response.status !== 201) throw new Error(`QA output seed returned HTTP ${response.status}.`);
    outputPath = payload.evidence?.outputPath ?? null;
    outputFileName = outputPath?.split("/").pop() ?? null;
    if (!outputPath?.startsWith(`outputs/sui/${qaSessionId}/`) || !outputFileName) {
      throw new Error("QA output seed returned an unexpected workspace path.");
    }
    const preview = payload.preview;
    const handoff = preview?.handoff;
    if (
      preview?.custody !== false
      || preview?.canSubmit !== true
      || preview?.liveSubmissionEnabled !== true
      || preview?.signerPolicy !== "client_wallet_required"
      || preview?.requiresWalletStandard !== true
      || handoff?.kind !== "sui_wallet_standard"
      || handoff?.action !== "sign_and_execute_in_wallet"
      || handoff?.unsignedIntent?.sender !== preview.sender
      || handoff?.unsignedIntent?.recipient !== preview.recipient
      || handoff?.unsignedIntent?.amountMist !== preview.amountMist
    ) {
      throw new Error("QA output seed did not preserve connected-wallet approval boundaries.");
    }
  });

  browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error" && shouldRecordConsoleError(message.text())) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (response.status() === 404 && isOptionalDevWorkspace404(response.url())) return;
    if (!isBackendRequest(response.url()) && response.status() < 500) return;
    networkFailures.push({ status: response.status(), method: response.request().method(), url: response.url() });
  });

  await stage(report, "open_output", "Open the seeded output from the live Outputs rail", async () => {
    await page.goto(workspace.sessionUrl("artifacts"), { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => (document.querySelector("#root")?.childElementCount ?? 0) > 0, undefined, { timeout: 30_000 });
    const region = page.getByRole("region", { name: "Output preview", exact: true });
    await region.waitFor({ state: "visible", timeout: 20_000 });
    await selectSeededOutput(region, outputPath, outputFileName);
    await region.locator("summary").filter({ hasText: "File details" }).click();
    await region.getByText(outputPath, { exact: true }).first().waitFor({ state: "visible" });
    await region.getByText("Transaction Preview", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await region.getByText("safety", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  });

  await stage(report, "copy_and_download", "Copy the selected path and download its exact file", async () => {
    const toolbar = page.getByRole("toolbar", { name: "Selected output actions", exact: true });
    await toolbar.getByRole("button", { name: "Copy path", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (copied !== outputPath) throw new Error(`Copied path was ${copied || "empty"}, expected ${outputPath}.`);
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await toolbar.getByRole("button", { name: "Download output", exact: true }).click();
    const download = await downloadPromise;
    if (download.suggestedFilename() !== outputFileName) {
      throw new Error(`Downloaded ${download.suggestedFilename()}, expected ${outputFileName}.`);
    }
    report.artifacts.downloadedFileName = download.suggestedFilename();
  });

  await stage(report, "add_linked_note", "Create and verify a note linked to the selected output", async () => {
    const createNotePromise = routeResponse(
      page,
      "POST",
      (path) => path === `/workspace/${encodeURIComponent(workspace.workspaceId)}/notes`,
    );
    await page.getByRole("toolbar", { name: "Selected output actions", exact: true })
      .getByRole("button", { name: "Add note about this output", exact: true })
      .click();
    const response = await createNotePromise;
    if (response.status() !== 201) throw new Error(`Linked note creation returned HTTP ${response.status()}.`);
    const payload = await responseJson(response, "Linked note creation");
    noteId = payload.note?.id ?? null;
    const expectedTitle = `Note about ${outputFileName}`.slice(0, 150);
    if (!noteId || payload.note?.title !== expectedTitle || payload.note?.outputPath !== outputPath) {
      throw new Error("Linked note did not preserve its output title and path.");
    }
    const notesPanel = page.getByRole("region", { name: "Notes panel", exact: true });
    await notesPanel.waitFor({ state: "visible", timeout: 15_000 });
    const noteButton = notesPanel.getByRole("button").filter({ hasText: expectedTitle });
    await noteButton.waitFor({ state: "visible", timeout: 15_000 });
    if (await noteButton.count() !== 1) throw new Error("Linked output note was not visible in Notes.");
    await noteButton.click();
    const noteBody = await page.getByPlaceholder("Write your note…", { exact: true }).inputValue();
    if (noteBody !== `Linked output: ${outputPath}`) throw new Error("Linked note body did not retain the exact output path.");
  });

  await stage(report, "delete_linked_note", "Delete the QA linked note", async () => {
    await page.getByRole("button", { name: "Delete note", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete note?", exact: true });
    const deletePromise = routeResponse(
      page,
      "DELETE",
      (path) => path === `/workspace/${encodeURIComponent(workspace.workspaceId)}/notes/${encodeURIComponent(noteId)}`,
    );
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    const response = await deletePromise;
    if (!response.ok()) throw new Error(`Linked note deletion returned HTTP ${response.status()}.`);
    noteDeleted = true;
  });

  await stage(report, "delete_output", "Delete only the seeded QA output and verify removal", async () => {
    await page.goto(workspace.sessionUrl("artifacts"), { waitUntil: "load", timeout: 30_000 });
    const region = page.getByRole("region", { name: "Output preview", exact: true });
    await region.waitFor({ state: "visible", timeout: 20_000 });
    await selectSeededOutput(region, outputPath, outputFileName);
    const deletePromise = routeResponse(
      page,
      "DELETE",
      (path) => path === `/workspace/${encodeURIComponent(workspace.workspaceId)}/outputs`,
    );
    await page.getByRole("toolbar", { name: "Selected output actions", exact: true })
      .getByRole("button", { name: "Delete output", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog", { name: "Delete output?", exact: true });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    const response = await deletePromise;
    if (!response.ok()) throw new Error(`Output deletion returned HTTP ${response.status()}.`);
    const payload = await responseJson(response, "Output deletion");
    if (payload.deleted?.path !== outputPath) throw new Error("Output deletion returned a different path.");
    outputDeleted = true;
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    await region.getByText(outputPath, { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });

    const { response: statResponse, payload: statPayload } = await backendJson(
      config,
      `/workspace/${encodeURIComponent(workspace.workspaceId)}/files/stat?path=${encodeURIComponent(outputPath)}`,
    );
    if (!statResponse.ok || statPayload.exists !== false) {
      throw new Error(`Deleted output stat returned HTTP ${statResponse.status} with exists=${String(statPayload.exists)}.`);
    }
  });

  const screenshotPath = resolve(config.outputDir, "outputs-browser-smoke.png");
  await page.screenshot({ path: screenshotPath });
  report.artifacts.screenshot = screenshotPath;
  report.artifacts.finalUrl = page.url();
  report.artifacts.qaRecord = { outputPath, noteId, outputDeleted, noteDeleted };
  report.ready = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.errors.push(report.error);
  if (page) {
    const failedScreenshot = resolve(config.outputDir, "outputs-browser-smoke-failed.png");
    await page.screenshot({ path: failedScreenshot, fullPage: true }).catch(() => undefined);
    report.artifacts.failedScreenshot = failedScreenshot;
  }
} finally {
  if (noteId && !noteDeleted) {
    await backendJson(
      config,
      `/workspace/${encodeURIComponent(workspace.workspaceId)}/notes/${encodeURIComponent(noteId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  }
  if (outputPath && !outputDeleted) {
    await backendJson(
      config,
      `/workspace/${encodeURIComponent(workspace.workspaceId)}/outputs?path=${encodeURIComponent(outputPath)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  }
  report.consoleErrors = consoleErrors;
  report.pageErrors = pageErrors;
  report.networkFailures = networkFailures;
  if (consoleErrors.length || pageErrors.length || networkFailures.length) report.ready = false;
  report.finishedAt = new Date().toISOString();
  const reportPath = resolve(config.outputDir, "summary.json");
  report.artifacts.report = reportPath;
  await mkdir(config.outputDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser?.close();
}

if (config.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Matterhorn Outputs browser smoke: ${report.ready ? "READY" : "NOT READY"}`);
  for (const item of report.stages) console.log(`[${item.status}] ${item.id}`);
  if (report.error) console.error(report.error);
}

if (config.strict && !report.ready) process.exit(1);
