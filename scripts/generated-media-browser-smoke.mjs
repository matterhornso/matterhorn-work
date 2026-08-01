#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5282/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/generated-media-browser-smoke";
const DEFAULT_PROMPT_BASE = "sleek Matterhorn Desks console showing generated media receipt cards";
const SMOKE_NFT_OBJECT_ID = "0x7777777777777777777777777777777777777777777777777777777777777777";
const SMOKE_MINT_DIGEST = "smokeMintDigest111111111111111111111111111111111111111111";
const SMOKE_LISTING_DIGEST = "smokeListingDigest222222222222222222222222222222222222222";
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

  const promptBase = values.get("--prompt") || process.env.MATTERHORN_MEDIA_BROWSER_PROMPT || DEFAULT_PROMPT_BASE;
  const runId = `smoke-${Date.now().toString(36)}`;

  return {
    help: flags.has("--help") || flags.has("-h"),
    headed: flags.has("--headed") || process.env.MATTERHORN_MEDIA_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_MEDIA_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_MEDIA_BROWSER_URL || DEFAULT_URL,
    prompt: `${promptBase} ${runId}`,
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
  a Sui mint preview, records public mint receipt metadata, prepares a Sui Kiosk
  listing preview, and records public listing receipt metadata. It does not sign
  wallet transactions or submit anything on-chain.
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

function nftDialog(page) {
  return page.locator('[role="dialog"]').filter({ hasText: "Publish as NFT" }).first();
}

function generatedImageCard(page, prompt) {
  return page.getByTestId("generated-image-card").filter({ hasText: prompt }).first();
}

function generatedMediaSettingsUrl(appUrl) {
  const url = new URL(appUrl);
  const workspaceMatch = url.pathname.match(/^\/workspace\/([^/]+)/);
  if (workspaceMatch) {
    url.pathname = `/workspace/${workspaceMatch[1]}/settings/generated-media`;
  } else {
    url.pathname = "/settings/generated-media";
  }
  url.search = "";
  url.hash = "";
  return url.toString();
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

    const startBlank = page.getByRole("button", { name: "Start chat", exact: true });
    if ((await startBlank.count()) > 0) {
      await clickFirstVisible(startBlank, "Start chat button");
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
  const networkFailures = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: !config.headed });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
        if (isOptionalDevWorkspace404(location.url)) return;
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
    });

    await stage(report, "home_wallet_readiness", "Check Home wallet readiness", async () => {
      await page.getByText("Wallet readiness", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText(/Sui: (Working|Limited release|Needs setup|Not supported here)/).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.getByLabel("Wallet readiness details").click();
      await page.getByText(/review and sign every transaction in your wallet/i).first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("button", { name: "Open wallet settings", exact: true }).waitFor({
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
      const promptField = panel.getByPlaceholder("Describe the image...", { exact: true });
      if ((await promptField.count()) > 0) return;
      await clickFirstVisible(panel.getByRole("button", { name: "Generate image", exact: true }), "Generate image toggle");
      await promptField.waitFor({ state: "visible", timeout: 10_000 });
    });

    await stage(report, "generate_image", "Generate image from chat", async () => {
      const panel = page.getByTestId("session-image-generation-panel");
      await panel.getByPlaceholder("Describe the image...", { exact: true }).fill(config.prompt);
      const generationResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/images/generate"),
        { timeout: 30_000 },
      );
      await panel.getByRole("button", { name: "Create image", exact: true }).click();
      const generationResponse = await generationResponsePromise;
      if (!generationResponse.ok()) {
        let detail = "The backend rejected the request.";
        try {
          const payload = await generationResponse.json();
          detail = payload?.error?.message || payload?.message || payload?.error || detail;
        } catch {
          // Keep bounded fallback copy when a provider returns no JSON body.
        }
        throw new Error(`Image generation request failed (${generationResponse.status()}): ${detail}`);
      }
      const createdCard = generatedImageCard(page, config.prompt);
      await createdCard.getByText(config.prompt, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await createdCard.getByText("Saved to Outputs", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      report.artifacts.generatedImage = {
        prompt: config.prompt,
        savedToOutputs: true,
      };
    });

    await stage(report, "open_nft_panel", "Open NFT draft panel", async () => {
      await clickFirstVisible(generatedImageCard(page, config.prompt).getByRole("button", { name: "Make NFT", exact: true }), "Make NFT button");
      const dialog = nftDialog(page);
      await dialog.getByText("Publishing path", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await dialog.getByText("Sui NFT minting", { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
      await dialog.getByText("NFT marketplace listing", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    });

    await stage(report, "create_nft_draft", "Create local NFT draft", async () => {
      await fillIfPresent(page, "Title", "Matterhorn generated-media smoke NFT");
      await fillIfPresent(page, "Description", "Local smoke draft for generated media publishing.");
      await page.getByRole("button", { name: "Create draft", exact: true }).click();
      await page.getByText("NFT draft created", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      await nftDialog(page).getByText("Storage", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    });

    await stage(report, "upload_storage", "Prepare and upload media to fake Walrus", async () => {
      const prepare = await waitForEnabled(page.getByRole("button", { name: "Prepare", exact: true }), "Prepare button");
      await prepare.click();
      const upload = await waitForEnabled(page.getByRole("button", { name: "Upload to Walrus", exact: true }), "Upload to Walrus button", 20_000);
      await upload.click();
      await page.getByText("matterhorn_smoke_blob", { exact: false }).waitFor({ state: "visible", timeout: 25_000 });
      report.artifacts.storage = { uploaded: true };
    });

    await stage(report, "preview_mint", "Prepare Sui mint preview", async () => {
      const previewMint = await waitForEnabled(page.getByRole("button", { name: "Prepare mint handoff", exact: true }), "Prepare mint handoff button", 20_000);
      await previewMint.click();
      await nftDialog(page).getByText("Mint plan ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.mintPreview = { ready: true, custody: false };
    });

    await stage(report, "record_mint_receipt", "Record public mint receipt", async () => {
      const dialog = nftDialog(page);
      await dialog.getByLabel("Mint digest", { exact: true }).fill(SMOKE_MINT_DIGEST);
      await dialog.getByLabel("Minted object id", { exact: true }).fill(SMOKE_NFT_OBJECT_ID);
      await dialog.getByRole("button", { name: "Save mint receipt", exact: true }).click();
      await dialog.getByText("Confirmed", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Mint receipt recorded", { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
      report.artifacts.mintReceipt = {
        recorded: true,
        objectId: SMOKE_NFT_OBJECT_ID,
      };
    });

    await stage(report, "preview_listing", "Prepare Sui Kiosk listing preview", async () => {
      const dialog = nftDialog(page);
      await dialog.getByText("Listing inputs", { exact: true }).click();
      await dialog.getByLabel("NFT object id", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await dialog.getByLabel("NFT object id", { exact: true }).fill(SMOKE_NFT_OBJECT_ID);
      await dialog.getByLabel("Price (MIST)", { exact: true }).fill(SMOKE_LISTING_PRICE_MIST);
      const previewListing = await waitForEnabled(page.getByRole("button", { name: "Prepare listing handoff", exact: true }), "Prepare listing handoff button", 20_000);
      await previewListing.click();
      await nftDialog(page).getByText("Listing plan ready", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.listingPreview = { ready: true, custody: false };
    });

    await stage(report, "record_listing_receipt", "Record public listing receipt", async () => {
      const dialog = nftDialog(page);
      await dialog.getByLabel("Listing transaction digest", { exact: true }).fill(SMOKE_LISTING_DIGEST);
      await dialog.getByRole("button", { name: "Save listing receipt", exact: true }).click();
      await dialog.getByText("Listed", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Listing receipt recorded", { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
      await page
        .getByLabel("Generated media history")
        .locator("button")
        .filter({ hasText: config.prompt })
        .filter({ hasText: "Listed" })
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
      report.artifacts.listingReceipt = {
        recorded: true,
        objectId: SMOKE_NFT_OBJECT_ID,
      };
    });

    await stage(report, "settings_generated_media", "Check Generated media settings readiness", async () => {
      await page.goto(generatedMediaSettingsUrl(config.url), { waitUntil: "load", timeout: 30_000 });
      await page.getByText("Production readiness", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Media library", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByRole("button", { name: "NFT drafts", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Publishing path", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText(config.prompt, { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Listed", { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Diagnostics and readiness report", { exact: true }).click();
      await page.getByRole("button", { name: "Run diagnostics", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Storage and data controls", { exact: true }).click();
      await page.getByText("Local generated media delete", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Delete generated image", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByText("Delete NFT draft", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

      const deleteButtons = page.getByRole("button", { name: /^Delete$/ });
      if ((await deleteButtons.count()) > 0) {
        throw new Error("Generated media settings exposed row delete actions for public NFT state.");
      }
      report.artifacts.generatedMediaSettings = {
        url: page.url(),
        publicStateRetained: true,
      };
    });

    await stage(report, "settings_generated_media_diagnostics", "Run generated media setup diagnostics", async () => {
      await page.getByRole("button", { name: "Run diagnostics", exact: true }).click();
      await page.getByText("Generated media setup passed all safe diagnostics.", { exact: true }).first().waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.getByText("Walrus publisher and relay endpoints responded to safe diagnostics probes.", { exact: true }).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.getByText("Diagnostics do not upload user media, do not sign, and do not submit transactions.", { exact: false }).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.getByText("Production smoke plan", { exact: true }).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      const productionPlanHeader = page.getByText("Production smoke plan", { exact: true }).locator("..");
      const productionMode = productionPlanHeader.getByText(/^(?:Local test|Platform setup)$/, { exact: true });
      await productionMode.waitFor({
        state: "visible",
        timeout: 20_000,
      });
      const productionSmokeMode = (await productionMode.innerText()).trim() === "Local test"
        ? "local_test"
        : "needs_setup";
      await page.getByText("Public writes require user action", { exact: true }).waitFor({
        state: "visible",
        timeout: 20_000,
      });
      report.artifacts.generatedMediaDiagnostics = {
        status: "pass",
        productionSmokeMode,
        publicWritesDuringDiagnostics: false,
      };
    });

    const screenshotPath = resolve(config.outputDir, "generated-media-browser-smoke.png");
    await mkdir(config.outputDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.finalUrl = page.url();
    report.warnings = resourceWarnings;
    const actionableNetworkFailures = networkFailures.filter(shouldFailOnNetworkResponse);
    const networkErrors = actionableNetworkFailures.map(networkFailureMessage);
    report.networkFailures = actionableNetworkFailures;
    report.ignoredNetworkResponses = networkFailures.filter((failure) => !shouldFailOnNetworkResponse(failure));
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
    report.ready = report.stages.every((item) => item.status === "pass") && report.errors.length === 0;
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
    report.warnings = resourceWarnings;
    const actionableNetworkFailures = networkFailures.filter(shouldFailOnNetworkResponse);
    const networkErrors = actionableNetworkFailures.map(networkFailureMessage);
    report.networkFailures = actionableNetworkFailures;
    report.ignoredNetworkResponses = networkFailures.filter((failure) => !shouldFailOnNetworkResponse(failure));
    report.errors = [...consoleErrors, ...pageErrors, ...networkErrors];
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
