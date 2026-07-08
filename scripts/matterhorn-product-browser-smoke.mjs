#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/matterhorn-product-browser-smoke";

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
    headed: flags.has("--headed") || process.env.MATTERHORN_PRODUCT_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_PRODUCT_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_PRODUCT_BROWSER_URL || DEFAULT_URL,
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_PRODUCT_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn product browser smoke

Usage:
  pnpm dev:generated-media-smoke
  node scripts/matterhorn-product-browser-smoke.mjs --strict --json
  node scripts/matterhorn-product-browser-smoke.mjs --url http://127.0.0.1:<app-port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL. Defaults to the dev-generated-media-smoke app URL.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on smoke failure or browser console/page errors.
  --json               Print the full JSON report.
  --headed             Show the Chromium window while running.
  --help               Show this message.

Expected stack:
  Run scripts/dev-generated-media-smoke.mjs first. It provides fake OpenCode,
  fake Walrus, mock image generation, Sui/Kiosk preview ids, the Matterhorn server,
  and the Vite app. This product smoke checks the platform shell around the
  generated-media lane: desk launch, activity/history, Notes, Memory, Wallet,
  Settings, Generated media, and support-report download.
`);
}

function makeReport(config) {
  return {
    name: "matterhorn-product-browser-smoke",
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
    const result = await action();
    report.stages.push({
      id,
      label,
      status: "pass",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.stages.push({
      id,
      label,
      status: "fail",
      durationMs: Date.now() - startedAt,
      error: message,
    });
    throw error;
  }
}

function workspaceIdFromUrl(appUrl) {
  const match = new URL(appUrl).pathname.match(/^\/workspace\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function workspaceUrl(appUrl, pathSuffix = "session") {
  const url = new URL(appUrl);
  const workspaceId = workspaceIdFromUrl(appUrl);
  if (!workspaceId) throw new Error(`Could not parse workspace id from ${appUrl}`);
  url.pathname = `/workspace/${encodeURIComponent(workspaceId)}/${pathSuffix.replace(/^\/+/, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function clickFirstVisible(locator, label) {
  const count = await locator.count();
  if (count < 1) throw new Error(`Could not find ${label}.`);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`${label} exists but is not visible.`);
}

async function waitForAnyVisible(page, locators, label, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const locator of locators) {
      if ((await locator.count()) > 0 && await locator.first().isVisible()) {
        return locator.first();
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Could not find ${label}.`);
}

function isStaticMissingResource(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(?:avif|bmp|gif|ico|jpg|jpeg|png|svg|webp|woff2?)$/.test(pathname);
  } catch {
    return false;
  }
}

function isWorkspaceOrApiRequest(url) {
  try {
    const pathname = new URL(url).pathname;
    return (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/workspace/") ||
      pathname.startsWith("/w/")
    );
  } catch {
    return false;
  }
}

function isOptionalDevWorkspace404(url) {
  try {
    const parsed = new URL(url);
    if (/^\/workspace\/[^/]+\/opencode\/mcp$/.test(parsed.pathname)) return true;
    if (
      /^\/workspace\/[^/]+\/files\/content$/.test(parsed.pathname) &&
      parsed.searchParams.get("path") === ".opencode/agents/opencode-router.md"
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function networkFailureMessage(failure) {
  return `${failure.method} ${failure.url} -> ${failure.status}`;
}

function shouldFailOnNetworkResponse(failure) {
  if (failure.status < 400) return false;
  if (failure.status === 404 && isStaticMissingResource(failure.url)) return false;
  if (failure.status === 404 && isOptionalDevWorkspace404(failure.url)) return false;
  return isWorkspaceOrApiRequest(failure.url) || failure.status >= 500;
}

async function runSmoke(config) {
  const report = makeReport(config);
  let browser;
  let page;
  const consoleErrors = [];
  const resourceWarnings = [];
  const networkFailures = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: !config.headed });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1360, height: 920 },
    });
    page = await context.newPage();

    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const request = response.request();
      networkFailures.push({
        status,
        method: request.method(),
        url: response.url(),
        resourceType: request.resourceType(),
      });
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/^Failed to load resource: the server responded with a status of 404/i.test(text)) {
        const location = message.location();
        const matchingFailure = networkFailures.find((failure) => failure.url === location.url);
        resourceWarnings.push({
          message: text,
          location,
          ...(matchingFailure ? { network: matchingFailure } : {}),
        });
        return;
      }
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await stage(report, "open_app", "Open Matterhorn app", async () => {
      await page.goto(config.url, { waitUntil: "load", timeout: 30_000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForFunction(
        () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
        undefined,
        { timeout: 30_000 },
      );
      await page.getByLabel("Workspace home").waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.workspaceId = workspaceIdFromUrl(config.url);
    });

    await stage(report, "home_shell", "Check workspace home shell", async () => {
      await page.getByText("Start a desk task, continue a chat, or collect notes and outputs for this workspace.", { exact: true })
        .waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("button", { name: "New chat", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("button", { name: "Jot note", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByText("Open a desk", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByLabel("Copy project path").waitFor({ state: "visible", timeout: 15_000 });
      await page.getByLabel("Open outputs folder").waitFor({ state: "visible", timeout: 15_000 });
    });

    await stage(report, "wallet_readiness", "Check compact wallet readiness", async () => {
      const readiness = page.locator("details").filter({ hasText: "Wallet readiness" }).first();
      await readiness.waitFor({ state: "visible", timeout: 20_000 });
      await readiness.getByText(/Sui: (Working|Preview|Needs setup|Not supported here)/).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await readiness.locator("summary").click();
      await readiness.getByText("Sui signing stays in your wallet; desktop uses external handoff.", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 });
      await readiness.getByRole("button", { name: "Open wallet", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    });

    await stage(report, "desk_task_start", "Start a Bittensor desk task", async () => {
      await clickFirstVisible(page.getByRole("button", { name: "Open Bittensor" }), "Open Bittensor desk card");
      await page.getByText("Bittensor desk", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByLabel("Agent tasks").waitFor({ state: "visible", timeout: 15_000 });
      await clickFirstVisible(page.getByRole("button", { name: /^Start task/ }), "Start task button");
      await waitForAnyVisible(page, [
        page.getByText("Starting Show my TAO balance", { exact: false }),
        page.getByTestId("session-image-generation-panel"),
        page.getByText("Show my TAO balance", { exact: false }),
      ], "started Bittensor task", 30_000);
      report.artifacts.startedDeskTask = "Bittensor";
    });

    await stage(report, "activity_summary", "Check compact Project Activity", async () => {
      await page.goto(workspaceUrl(config.url, "session"), { waitUntil: "load", timeout: 30_000 });
      await page.getByText("Project Activity", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await waitForAnyVisible(page, [
        page.getByText("Project history", { exact: true }),
        page.getByText("Run started", { exact: false }),
        page.getByText("Bittensor", { exact: false }),
      ], "compact project activity", 30_000);
      await page.getByText("Project Activity", { exact: true }).scrollIntoViewIfNeeded();
    });

    await stage(report, "project_history", "Open full Project history", async () => {
      const historyUrl = workspaceUrl(config.url, "history");
      await page.goto(historyUrl, { waitUntil: "load", timeout: 30_000 });
      await page.locator("main").getByRole("heading", { name: "Project history", exact: true }).last().waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Project history filters").waitFor({ state: "visible", timeout: 20_000 });
      await waitForAnyVisible(page, [
        page.getByText(/actual event(s)? shown/),
        page.getByText("Run started", { exact: false }),
        page.getByText("No all recorded yet", { exact: false }),
      ], "project history rows or empty state", 20_000);
      report.artifacts.projectHistoryUrl = page.url();
    });

    await stage(report, "notes_panel", "Open Notes inside session shell", async () => {
      await page.goto(`${workspaceUrl(config.url, "session")}?panel=notes`, { waitUntil: "load", timeout: 30_000 });
      await page.getByRole("heading", { name: "Notes", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("button", { name: "New note", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("button", { name: "All notes", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("button", { name: "Memory suggested", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Back to chat").waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.notesPanelUrl = page.url();
    });

    await stage(report, "memory_panel", "Open Memory review inside session shell", async () => {
      await page.goto(`${workspaceUrl(config.url, "session")}?panel=memory`, { waitUntil: "load", timeout: 30_000 });
      await page.getByText("Memory", { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Review suggestions before saving.", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Memory review", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Memory inbox filters").waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("button", { name: "Refresh memory review", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.memoryPanelUrl = page.url();
    });

    await stage(report, "wallet_panel", "Open Wallet and Sui workflow panel", async () => {
      await page.goto(`${workspaceUrl(config.url, "session")}?panel=wallet`, { waitUntil: "load", timeout: 30_000 });
      await waitForAnyVisible(page, [
        page.getByRole("heading", { name: "Sui wallet preview", exact: true }),
        page.getByText("Sui wallet workflow", { exact: true }),
        page.getByText("Matterhorn Wallet", { exact: true }),
      ], "wallet panel", 20_000);
      await page.getByText(/Signing stays in your wallet/).first().waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.walletPanelUrl = page.url();
    });

    await stage(report, "settings_overview_support_report", "Check Settings overview and support report download", async () => {
      await page.goto(workspaceUrl(config.url, "settings/overview"), { waitUntil: "load", timeout: 30_000 });
      await page.getByRole("heading", { name: "Settings", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Backend status", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Image and NFT publishing", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Project Activity", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      const supportButton = page.getByRole("button", { name: "Support report", exact: true });
      await supportButton.scrollIntoViewIfNeeded();
      const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
      await supportButton.click();
      const download = await downloadPromise;
      const suggestedFilename = download.suggestedFilename();
      if (!/matterhorn-backend-support.*\.json$/i.test(suggestedFilename)) {
        throw new Error(`Unexpected support report filename: ${suggestedFilename}`);
      }
      report.artifacts.supportReport = { suggestedFilename };
    });

    await stage(report, "settings_wallet", "Check Wallet settings Sui copy", async () => {
      await page.goto(workspaceUrl(config.url, "settings/wallet"), { waitUntil: "load", timeout: 30_000 });
      await page.getByText("Sui wallet preview", { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Connect a Sui wallet-standard wallet for account reads. Signing remains in your wallet.", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.walletSettingsUrl = page.url();
    });

    await stage(report, "settings_generated_media", "Check Generated media settings surface", async () => {
      await page.goto(workspaceUrl(config.url, "settings/generated-media"), { waitUntil: "load", timeout: 30_000 });
      await page.getByText("Production readiness", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Setup diagnostics", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Recent media", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Data controls", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.generatedMediaSettingsUrl = page.url();
    });

    const screenshotPath = resolve(config.outputDir, "matterhorn-product-browser-smoke.png");
    await mkdir(config.outputDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.finalUrl = page.url();
    report.warnings = resourceWarnings;
    const networkErrors = networkFailures
      .filter(shouldFailOnNetworkResponse)
      .map(networkFailureMessage);
    report.networkFailures = networkFailures;
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
    report.ready = report.stages.every((item) => item.status === "pass") && report.errors.length === 0;
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
    report.warnings = resourceWarnings;
    const networkErrors = networkFailures
      .filter(shouldFailOnNetworkResponse)
      .map(networkFailureMessage);
    report.networkFailures = networkFailures;
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
    if (page) {
      try {
        await mkdir(config.outputDir, { recursive: true });
        const failedScreenshot = resolve(config.outputDir, "matterhorn-product-browser-smoke-failed.png");
        await page.screenshot({ path: failedScreenshot, fullPage: true });
        report.artifacts.failedScreenshot = failedScreenshot;
      } catch {
        // Best-effort evidence only.
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    if (browser) await browser.close();
  }

  await mkdir(config.outputDir, { recursive: true });
  const reportPath = resolve(config.outputDir, "summary.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.artifacts.report = reportPath;
  return report;
}

function emitReport(report, config) {
  if (config.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Matterhorn product browser smoke: ${report.ready ? "PASS" : "FAIL"}\n`);
  for (const stageItem of report.stages) {
    process.stdout.write(`- ${stageItem.status.toUpperCase()} ${stageItem.id}: ${stageItem.label}${stageItem.error ? ` (${stageItem.error})` : ""}\n`);
  }
  if (report.errors.length) {
    process.stdout.write(`Browser errors: ${report.errors.length}\n`);
    for (const error of report.errors) process.stdout.write(`  - ${error}\n`);
  }
  if (report.warnings.length) {
    process.stdout.write(`Browser warnings: ${report.warnings.length}\n`);
  }
  if (report.networkFailures?.length) {
    process.stdout.write(`Network failures: ${report.networkFailures.length}\n`);
    for (const failure of report.networkFailures) {
      process.stdout.write(`  - ${networkFailureMessage(failure)}\n`);
    }
  }
  process.stdout.write(`Report: ${report.artifacts.report}\n`);
  if (report.artifacts.screenshot || report.artifacts.failedScreenshot) {
    process.stdout.write(`Screenshot: ${report.artifacts.screenshot || report.artifacts.failedScreenshot}\n`);
  }
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}

runSmoke(config)
  .then((report) => {
    emitReport(report, config);
    if (config.strict && !report.ready) process.exit(1);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
