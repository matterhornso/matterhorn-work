#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/notes-memory-browser-smoke";

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
    headed: flags.has("--headed") || process.env.MATTERHORN_NOTES_MEMORY_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_NOTES_MEMORY_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_NOTES_MEMORY_BROWSER_URL || DEFAULT_URL,
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_NOTES_MEMORY_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn Notes and Memory browser smoke

Usage:
  node scripts/notes-memory-browser-smoke.mjs --strict --json
  node scripts/notes-memory-browser-smoke.mjs --url http://127.0.0.1:<port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on journey, network, console, or page errors.
  --json               Print the full JSON report.
  --headed             Show Chromium while running.
  --help               Show this message.

Boundaries:
  This smoke creates one uniquely named QA note, verifies autosave and the
  explicit Memory-review handoff, dismisses that suggestion, and deletes the
  note. It never confirms or saves QA content as remembered Memory.
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
    name: "matterhorn-notes-memory-browser-smoke",
    url: config.url,
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

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned unreadable JSON.`);
  }
}

function routeResponse(page, method, matcher) {
  return page.waitForResponse(
    (response) => {
      const path = new URL(response.url()).pathname;
      return response.request().method() === method && matcher(path);
    },
    { timeout: 15_000 },
  );
}

function noteRoute(workspaceId, suffix = "") {
  return `/workspace/${encodeURIComponent(workspaceId)}/notes${suffix}`;
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}

const workspace = workspaceContext(config.url);
const report = makeReport(config);
const consoleErrors = [];
const pageErrors = [];
const networkFailures = [];
const qaSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const qaTitle = `QA Notes lifecycle ${qaSuffix}`;
const qaBody = "Browser-created QA note for create, autosave, search, filter, reopen, Memory review, and cleanup verification.";
let browser;
let page;
let noteId = null;
let suggestionId = null;
let noteDeleted = false;
let suggestionDismissed = false;

try {
  await mkdir(config.outputDir, { recursive: true });
  browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

  await stage(report, "open_notes", "Open the workspace Notes panel", async () => {
    await page.goto(workspace.sessionUrl("notes"), { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => (document.querySelector("#root")?.childElementCount ?? 0) > 0, undefined, { timeout: 30_000 });
    const panel = page.getByRole("region", { name: "Notes panel", exact: true });
    await panel.waitFor({ state: "visible", timeout: 20_000 });
    await panel.getByRole("button", { name: "New note", exact: true }).waitFor({ state: "visible" });
  });

  await stage(report, "create_note", "Create one workspace-scoped QA note", async () => {
    const createPromise = routeResponse(page, "POST", (path) => path === noteRoute(workspace.workspaceId));
    await page.getByRole("region", { name: "Notes panel", exact: true })
      .getByRole("button", { name: "New note", exact: true })
      .click();
    const createResponse = await createPromise;
    if (createResponse.status() !== 201) throw new Error(`Note creation returned HTTP ${createResponse.status()}.`);
    const payload = await responseJson(createResponse, "Note creation");
    noteId = payload.note?.id ?? null;
    if (!noteId) throw new Error("Note creation did not return a note id.");
    await page.getByRole("region", { name: "Notes editor", exact: true }).waitFor({ state: "visible" });
  });

  await stage(report, "autosave_note", "Edit the note and verify backend autosave", async () => {
    const updatePromise = routeResponse(
      page,
      "PATCH",
      (path) => path === noteRoute(workspace.workspaceId, `/${encodeURIComponent(noteId)}`),
    );
    await page.getByPlaceholder("Note title", { exact: true }).fill(qaTitle);
    await page.getByPlaceholder("Write your note…", { exact: true }).fill(qaBody);
    const updateResponse = await updatePromise;
    if (!updateResponse.ok()) throw new Error(`Note autosave returned HTTP ${updateResponse.status()}.`);
    const payload = await responseJson(updateResponse, "Note autosave");
    if (payload.note?.title !== qaTitle || payload.note?.body !== qaBody) {
      throw new Error("Note autosave did not persist the complete title and body.");
    }
    await page.getByText("Saving", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
  });

  await stage(report, "suggest_memory", "Send the note to Memory review without saving it", async () => {
    const suggestionPromise = routeResponse(
      page,
      "POST",
      (path) => path === noteRoute(workspace.workspaceId, `/${encodeURIComponent(noteId)}/memory-suggestion`),
    );
    await page.getByRole("button", { name: "Suggest memory", exact: true }).click();
    const suggestionResponse = await suggestionPromise;
    if (!suggestionResponse.ok()) throw new Error(`Memory suggestion returned HTTP ${suggestionResponse.status()}.`);
    const payload = await responseJson(suggestionResponse, "Memory suggestion");
    suggestionId = payload.suggestionId ?? null;
    if (!suggestionId || payload.suggestionStatus !== "pending") {
      throw new Error(`Expected a pending Memory suggestion, received ${payload.suggestionStatus ?? "unknown"}.`);
    }
    await page.getByText("In Memory review", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    const rememberButton = page.getByRole("button", { name: "Suggest memory", exact: true });
    if (await rememberButton.isVisible().catch(() => false)) throw new Error("The note still exposed a duplicate Memory suggestion action.");
  });

  await stage(report, "find_and_reopen", "Search, filter, and reopen the persisted note", async () => {
    await page.getByRole("button", { name: "Back to notes", exact: true }).click();
    const panel = page.getByRole("region", { name: "Notes panel", exact: true });
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    await panel.getByPlaceholder("Search notes…", { exact: true }).fill(qaTitle);
    await panel.getByRole("combobox", { name: "Filter notes", exact: true }).selectOption("memory-suggested");
    const noteButton = panel.getByRole("button").filter({ hasText: qaTitle });
    if (await noteButton.count() !== 1) throw new Error("Search and Memory-suggested filtering did not isolate the QA note.");
    await noteButton.click();
    if (await page.getByPlaceholder("Note title", { exact: true }).inputValue() !== qaTitle) {
      throw new Error("Reopened note title did not match the autosaved title.");
    }
    if (await page.getByPlaceholder("Write your note…", { exact: true }).inputValue() !== qaBody) {
      throw new Error("Reopened note body did not match the autosaved body.");
    }
    await page.getByText("In Memory review", { exact: true }).waitFor({ state: "visible" });
  });

  await stage(report, "delete_note", "Delete the QA note and verify backend cleanup", async () => {
    await page.getByRole("button", { name: "Delete note", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete note?", exact: true });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    const deletePromise = routeResponse(
      page,
      "DELETE",
      (path) => path === noteRoute(workspace.workspaceId, `/${encodeURIComponent(noteId)}`),
    );
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    const deleteResponse = await deletePromise;
    if (!deleteResponse.ok()) throw new Error(`Note deletion returned HTTP ${deleteResponse.status()}.`);
    const payload = await responseJson(deleteResponse, "Note deletion");
    if (!payload.deleted) throw new Error("Note deletion did not confirm removal.");
    noteDeleted = true;
    await page.getByRole("region", { name: "Notes panel", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    if (await page.getByText(qaTitle, { exact: true }).count()) throw new Error("Deleted note remained visible in Notes.");
  });

  await stage(report, "dismiss_memory", "Dismiss the QA Memory suggestion and verify it was not saved", async () => {
    await page.goto(workspace.sessionUrl("memory"), { waitUntil: "load", timeout: 30_000 });
    const suggestionHeading = page.getByRole("heading", { name: qaTitle, exact: true });
    await suggestionHeading.waitFor({ state: "visible", timeout: 20_000 });
    await page.getByText("Nothing is saved until you choose Remember or Save edited.", { exact: true }).waitFor({ state: "visible" });
    const resolvePromise = routeResponse(
      page,
      "POST",
      (path) => path === `/workspace/${encodeURIComponent(workspace.workspaceId)}/memory/suggestions/${encodeURIComponent(suggestionId)}/resolve`,
    );
    await page.getByRole("button", { name: `Dismiss visible Memory suggestion: ${qaTitle}`, exact: true }).click();
    const resolveResponse = await resolvePromise;
    if (!resolveResponse.ok()) throw new Error(`Memory dismissal returned HTTP ${resolveResponse.status()}.`);
    const payload = await responseJson(resolveResponse, "Memory dismissal");
    if (payload.entry?.status !== "dismissed") throw new Error(`Memory suggestion resolved as ${payload.entry?.status ?? "unknown"}.`);
    suggestionDismissed = true;
    await suggestionHeading.waitFor({ state: "hidden", timeout: 10_000 });
    if (await page.getByText("No saved memories yet", { exact: true }).count() !== 1) {
      throw new Error("The dismissed QA suggestion unexpectedly created a saved Memory record.");
    }
  });

  const screenshotPath = resolve(config.outputDir, "notes-memory-browser-smoke.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.artifacts.screenshot = screenshotPath;
  report.artifacts.finalUrl = page.url();
  report.artifacts.qaRecord = { noteId, suggestionId, noteDeleted, suggestionDismissed };
  report.ready = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.errors.push(report.error);
  if (page) {
    const failedScreenshot = resolve(config.outputDir, "notes-memory-browser-smoke-failed.png");
    await page.screenshot({ path: failedScreenshot, fullPage: true }).catch(() => undefined);
    report.artifacts.failedScreenshot = failedScreenshot;
    report.artifacts.failureCleanupRequired = {
      noteId: noteDeleted ? null : noteId,
      suggestionId: suggestionDismissed ? null : suggestionId,
      qaTitle,
    };
  }
} finally {
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
  console.log(`Matterhorn Notes and Memory browser smoke: ${report.ready ? "READY" : "NOT READY"}`);
  for (const item of report.stages) console.log(`[${item.status}] ${item.id}`);
  if (report.error) console.error(report.error);
}

if (config.strict && !report.ready) process.exit(1);
