#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/generated-media-browser-smoke";
const DEFAULT_PROMPT = "sleek Matterhorn Work console showing generated media receipt cards";
const SMOKE_NFT_OBJECT_ID = "0x7777777777777777777777777777777777777777777777777777777777777777";
const SMOKE_LISTING_PRICE_MIST = "1000000000";

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
    headed: flags.has("--headed") || process.env.MATTERHORN_MEDIA_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_MEDIA_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_MEDIA_BROWSER_URL || DEFAULT_URL,
    prompt: values.get("--prompt") || process.env.MATTERHORN_MEDIA_BROWSER_PROMPT || DEFAULT_PROMPT,
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_MEDIA_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn generated-media browser smoke

Usage:
  pnpm dev:generated-media-smoke
  node scripts/generated-media-browser-smoke.mjs --strict --json
  node scripts/generated-media-browser-smoke.mjs --url http://127.0.0.1:<app-port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL. Defaults to the dev-generated-media-smoke app URL.
  --prompt <text>      Prompt used for the generated image.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on smoke failure or browser console/page errors.
  --json               Print the full JSON report.
  --headed             Show the Chromium window while running.
  --help               Show this message.

Expected stack:
  Run scripts/dev-generated-media-smoke.mjs first. It provides mock image generation,
  fake Walrus storage, fake Sui/Kiosk ids, and a fake OpenCode engine for chat.

Boundaries:
  This browser smoke creates a local NFT draft, uploads to fake Walrus, prepares
  a Sui mint preview, and prepares a Sui Kiosk listing preview. It does not sign
  wallet transactions or record receipts; receipt coverage lives in the backend
  generated-media flow smoke.
`);
}

function makeReport(config) {
  return {
    name: "generated-media-browser-smoke",
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

async function waitForEnabled(locator, label, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if ((await locator.count()) > 0 && await locator.first().isVisible() && await locator.first().isEnabled()) {
      return locator.first();
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`${label} did not become enabled.`);
}

async function fillIfPresent(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  if ((await field.count()) < 1) return false;
  await field.fill(value);
  return true;
}

function nftDialog(page) {
  return page.locator('[role="dialog"]').filter({ hasText: "Make NFT" }).first();
}

async function ensureChatSession(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if ((await page.getByTestId("session-image-generation-panel").count()) > 0) return;

    const newChat = page.getByRole("button", { name: "New chat", exact: true });
    if ((await newChat.count()) > 0) {
      await clickFirstVisible(newChat, "New chat button");
      await page.getByTestId("session-image-generation-panel").waitFor({ state: "visible", timeout: 20_000 });
      return;
    }

    const startBlank = page.getByRole("button", { name: "Start blank chat", exact: true });
    if ((await startBlank.count()) > 0) {
      await clickFirstVisible(startBlank, "Start blank chat button");
      await page.getByTestId("session-image-generation-panel").waitFor({ state: "visible", timeout: 20_000 });
      return;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Could not find a chat session or a way to create one.");
}

async function runSmoke(config) {
  const report = makeReport(config);
  let browser;
  let page;
  const consoleErrors = [];
  const resourceWarnings = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: !config.headed });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/^Failed to load resource: the server responded with a status of 404/i.test(text)) {
        resourceWarnings.push({ message: text, location: message.location() });
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
    });

    await stage(report, "home_wallet_readiness", "Check Home wallet readiness", async () => {
      const readiness = page.locator("details").filter({ hasText: "Wallet readiness" }).first();
      await readiness.waitFor({ state: "visible", timeout: 20_000 });
      await readiness.getByText(/Sui: (Working|Preview|Needs setup|Not supported here)/).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await readiness.locator("summary").click();
      await readiness
        .getByText("Sui signing stays in your wallet; desktop uses external handoff.", { exact: true })
        .waitFor({ state: "visible", timeout: 10_000 });
      await readiness.getByRole("button", { name: "Open wallet", exact: true }).waitFor({
        state: "visible",
        timeout: 10_000,
      });
    });

    await stage(report, "open_chat", "Open or create chat session", async () => {
      await ensureChatSession(page);
      await page.getByTestId("session-image-generation-panel").waitFor({ state: "visible", timeout: 20_000 });
    });

    await stage(report, "open_image_panel", "Open chat image generation panel", async () => {
      const panel = page.getByTestId("session-image-generation-panel");
      const promptField = panel.getByPlaceholder("Describe an image to generate...", { exact: true });
      if ((await promptField.count()) > 0) return;
      await clickFirstVisible(panel.getByRole("button", { name: "Generate image", exact: true }), "Generate image toggle");
      await promptField.waitFor({ state: "visible", timeout: 10_000 });
    });

    await stage(report, "generate_image", "Generate image from chat", async () => {
      const panel = page.getByTestId("session-image-generation-panel");
      await panel.getByPlaceholder("Describe an image to generate...", { exact: true }).fill(config.prompt);
      await panel.getByRole("button", { name: "Generate", exact: true }).click();
      await panel.getByText("Image saved to outputs", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
      report.artifacts.generatedImage = {
        prompt: config.prompt,
        savedToOutputs: true,
      };
    });

    await stage(report, "open_nft_panel", "Open NFT draft panel", async () => {
      await clickFirstVisible(page.getByRole("button", { name: "Make NFT", exact: true }), "Make NFT button");
      const dialog = nftDialog(page);
      await dialog.getByText("Publishing readiness", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await dialog.getByText("Sui NFT minting", { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
      await dialog.getByText("NFT marketplace listing", { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
    });

    await stage(report, "create_nft_draft", "Create local NFT draft", async () => {
      await fillIfPresent(page, "Title", "Matterhorn generated-media smoke NFT");
      await fillIfPresent(page, "Description", "Local smoke draft for generated media publishing.");
      await page.getByRole("button", { name: "Create local draft", exact: true }).click();
      await page.getByText("NFT draft created", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      await nftDialog(page).getByText("Storage", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    });

    await stage(report, "upload_storage", "Prepare and upload media to fake Walrus", async () => {
      const prepare = await waitForEnabled(page.getByRole("button", { name: "Prepare upload", exact: true }), "Prepare upload button");
      await prepare.click();
      const upload = await waitForEnabled(page.getByRole("button", { name: "Upload", exact: true }), "Upload button", 20_000);
      await upload.click();
      await page.getByText("matterhorn_smoke_blob", { exact: false }).waitFor({ state: "visible", timeout: 25_000 });
      report.artifacts.storage = { uploaded: true };
    });

    await stage(report, "preview_mint", "Prepare Sui mint preview", async () => {
      const previewMint = await waitForEnabled(page.getByRole("button", { name: "Preview mint", exact: true }), "Preview mint button", 20_000);
      await previewMint.click();
      await nftDialog(page).getByText("Mint plan ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.mintPreview = { ready: true, custody: false };
    });

    await stage(report, "preview_listing", "Prepare Sui Kiosk listing preview", async () => {
      await fillIfPresent(page, "NFT object id", SMOKE_NFT_OBJECT_ID);
      await fillIfPresent(page, "Price (MIST)", SMOKE_LISTING_PRICE_MIST);
      const previewListing = await waitForEnabled(page.getByRole("button", { name: "Preview listing", exact: true }), "Preview listing button", 20_000);
      await previewListing.click();
      await nftDialog(page).getByText("Listing plan ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.listingPreview = { ready: true, custody: false };
    });

    const screenshotPath = resolve(config.outputDir, "generated-media-browser-smoke.png");
    await mkdir(config.outputDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.finalUrl = page.url();
    report.warnings = resourceWarnings;
    report.errors = [...consoleErrors, ...pageErrors];
    report.ready = report.stages.every((item) => item.status === "pass") && report.errors.length === 0;
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
    report.warnings = resourceWarnings;
    report.errors = [...consoleErrors, ...pageErrors];
    if (page) {
      try {
        await mkdir(config.outputDir, { recursive: true });
        const failedScreenshot = resolve(config.outputDir, "generated-media-browser-smoke-failed.png");
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
  process.stdout.write(`Matterhorn generated-media browser smoke: ${report.ready ? "PASS" : "FAIL"}\n`);
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
