#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/billing-browser-smoke";

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
    headed: flags.has("--headed") || process.env.MATTERHORN_BILLING_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_BILLING_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_BILLING_BROWSER_URL || DEFAULT_URL,
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_BILLING_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn Billing browser smoke

Usage:
  node scripts/billing-browser-smoke.mjs --strict --json
  node scripts/billing-browser-smoke.mjs --url http://127.0.0.1:<port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on journey, network, console, or page errors.
  --json               Print the full JSON report.
  --headed             Show Chromium while running.
  --help               Show this message.

Boundaries:
  This smoke requires local billing preview mode. It starts and clears a mock
  pending checkout, verifies confirmed access does not change, and never opens
  Stripe, handles card data, grants a paid plan, or processes a charge.
`);
}

function billingSettingsUrl(appUrl) {
  const url = new URL(appUrl);
  const match = url.pathname.match(/^\/workspace\/([^/]+)/);
  if (!match?.[1]) throw new Error(`Workspace id is missing from ${appUrl}`);
  url.pathname = `/workspace/${match[1]}/settings/billing`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function makeReport(config) {
  return {
    name: "matterhorn-billing-browser-smoke",
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

function billingResponse(page, method, suffix) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname.endsWith(suffix),
    { timeout: 15_000 },
  );
}

async function currentPlanName(page) {
  const currentBadge = page.getByText("Current", { exact: true });
  await currentBadge.waitFor({ state: "visible", timeout: 15_000 });
  const card = currentBadge.locator("xpath=ancestor::div[.//h3][1]");
  return (await card.locator("h3").innerText()).trim();
}

const config = parseArgs();
if (config.help) {
  printHelp();
  process.exit(0);
}

const report = makeReport(config);
const consoleErrors = [];
const pageErrors = [];
const networkFailures = [];
let browser;
let page;

try {
  await mkdir(config.outputDir, { recursive: true });
  browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error" && shouldRecordConsoleError(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (response.status() === 404 && isOptionalDevWorkspace404(response.url())) return;
    if (!isBackendRequest(response.url()) && response.status() < 500) return;
    networkFailures.push({
      status: response.status(),
      method: response.request().method(),
      url: response.url(),
    });
  });

  const billingVisible = await stage(report, "open_billing", "Open workspace Billing settings or verify its launch-policy fallback", async () => {
    await page.goto(billingSettingsUrl(config.url), { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => (document.querySelector("#root")?.childElementCount ?? 0) > 0, undefined, { timeout: 30_000 });
    const billingHeading = page.getByRole("heading", { name: "Billing", exact: true });
    const overviewHeading = page.getByRole("heading", { name: "Overview", exact: true }).first();
    await Promise.race([
      billingHeading.waitFor({ state: "visible", timeout: 20_000 }),
      overviewHeading.waitFor({ state: "visible", timeout: 20_000 }),
    ]);
    if (await billingHeading.isVisible().catch(() => false)) return true;
    await overviewHeading.waitFor({ state: "visible", timeout: 5_000 });
    if (!new URL(page.url()).pathname.endsWith("/settings/overview")) {
      throw new Error(`Hidden Billing route resolved to an unexpected fallback: ${page.url()}`);
    }
    if (await page.getByRole("link", { name: "Billing", exact: true }).count()) {
      throw new Error("Launch policy hides Billing content but still exposes a Billing navigation link.");
    }
    report.artifacts.launchPolicy = {
      billing: "hidden",
      fallbackUrl: page.url(),
      outcome: "Hidden by launch policy",
    };
    return false;
  });

  if (!billingVisible) {
    const screenshotPath = resolve(config.outputDir, "billing-launch-policy-fallback.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.finalUrl = page.url();
    report.ready = true;
  } else {
  const confirmedPlan = await stage(report, "local_preview_truth", "Verify local preview and no-charge boundaries", async () => {
    await page.getByText("Local preview", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("No raw card data is handled by Matterhorn.", { exact: false }).waitFor({ state: "visible" });
    await page.getByText("Local billing preview is active. No checkout, payment account, or real charge is involved.", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Billing account not connected", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    const portal = page.getByRole("button", { name: "Billing account not connected", exact: true });
    if (await portal.count()) {
      if (!(await portal.isDisabled())) throw new Error("Local preview exposed an enabled billing portal without a payment account.");
    }
    return currentPlanName(page);
  });

  const previewButton = page.getByRole("button", { name: /^Preview (?:Free|Plus|Max)$/ }).filter({ visible: true }).first();
  await previewButton.waitFor({ state: "visible", timeout: 15_000 });
  if (await previewButton.isDisabled()) throw new Error("No non-current local plan preview action is available.");
  const previewLabel = (await previewButton.innerText()).trim();
  const previewShortName = previewLabel.replace(/^Preview\s+/, "");
  const pendingPlanName = previewShortName === "Free" ? "Free" : `Matterhorn ${previewShortName}`;

  await stage(report, "preview_plan", "Preview a non-current plan without granting access", async () => {
    const checkoutPromise = billingResponse(page, "POST", "/billing/checkout");
    const refreshPromise = billingResponse(page, "GET", "/billing/status");
    const pageCountBefore = context.pages().length;
    await previewButton.click();
    const checkoutResponse = await checkoutPromise;
    if (!checkoutResponse.ok()) throw new Error(`Local plan preview failed with HTTP ${checkoutResponse.status()}.`);
    const checkout = await responseJson(checkoutResponse, "Local plan preview");
    if (checkout.mode !== "mock") throw new Error(`Expected mock checkout mode, received ${checkout.mode ?? "unknown"}.`);
    const refreshed = await responseJson(await refreshPromise, "Billing status refresh");
    if (refreshed.status?.subscription?.planId === refreshed.status?.pendingCheckout?.planId) {
      throw new Error("Local preview incorrectly granted the pending plan.");
    }
    if (context.pages().length !== pageCountBefore) throw new Error("Local plan preview opened an external payment page.");
    await page.getByText("Plan preview saved", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText(`Checkout pending for ${pendingPlanName}.`, { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("This is a local preview and does not change plan access", { exact: false }).waitFor({ state: "visible" });
    const afterPlan = await currentPlanName(page);
    if (afterPlan !== confirmedPlan) throw new Error(`Confirmed plan changed from ${confirmedPlan} to ${afterPlan}.`);
    report.artifacts.preview = { confirmedPlan, pendingPlan: pendingPlanName, externalPageOpened: false };
  });

  await stage(report, "clear_pending", "Clear the mock pending checkout and restore state", async () => {
    const clearPromise = billingResponse(page, "DELETE", "/billing/pending-checkout");
    const refreshPromise = billingResponse(page, "GET", "/billing/status");
    await page.getByRole("button", { name: "Clear pending", exact: true }).click();
    const clearResponse = await clearPromise;
    if (!clearResponse.ok()) throw new Error(`Pending checkout clear failed with HTTP ${clearResponse.status()}.`);
    const refreshed = await responseJson(await refreshPromise, "Billing status after clear");
    if (refreshed.status?.pendingCheckout) throw new Error("Pending checkout remained after the clear action.");
    await page.getByText("Pending checkout cleared", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText(`Checkout pending for ${pendingPlanName}.`, { exact: false }).waitFor({ state: "hidden", timeout: 10_000 });
    const restoredPlan = await currentPlanName(page);
    if (restoredPlan !== confirmedPlan) throw new Error(`Billing state restored to ${restoredPlan}, expected ${confirmedPlan}.`);
  });

  await stage(report, "readiness_disclosure", "Verify setup ownership and live-payment state", async () => {
    await page.getByRole("button", { name: "Local preview", exact: true }).click();
    await page.getByText("Local plan preview", { exact: true }).last().waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("Live payments", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("Live payments are disabled in this build.", { exact: true }).waitFor({ state: "visible" });
  });

  const screenshotPath = resolve(config.outputDir, "billing-browser-smoke.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.artifacts.screenshot = screenshotPath;
  report.artifacts.finalUrl = page.url();
  report.ready = true;
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.errors.push(report.error);
  if (page) {
    const failedScreenshot = resolve(config.outputDir, "billing-browser-smoke-failed.png");
    await page.screenshot({ path: failedScreenshot, fullPage: true }).catch(() => undefined);
    report.artifacts.failedScreenshot = failedScreenshot;
    const clearPending = page.getByRole("button", { name: "Clear pending", exact: true });
    if (await clearPending.isVisible().catch(() => false)) {
      await clearPending.click().catch(() => undefined);
      report.artifacts.failureCleanupAttempted = true;
    }
  }
} finally {
  report.consoleErrors = consoleErrors;
  report.pageErrors = pageErrors;
  report.networkFailures = networkFailures;
  if (consoleErrors.length || pageErrors.length || networkFailures.length) report.ready = false;
  report.finishedAt = new Date().toISOString();
  const reportPath = resolve(config.outputDir, "summary.json");
  report.artifacts.report = reportPath;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser?.close();
}

if (config.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Matterhorn Billing browser smoke: ${report.ready ? "READY" : "NOT READY"}`);
  for (const item of report.stages) console.log(`[${item.status}] ${item.id}`);
  if (report.error) console.error(report.error);
}

if (config.strict && !report.ready) process.exit(1);
