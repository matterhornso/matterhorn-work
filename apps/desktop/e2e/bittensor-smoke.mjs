#!/usr/bin/env node
import { _electron as electron } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const electronMain = path.join(desktopRoot, "electron", "main.mjs");
const startUrl =
  process.env.MATTERHORN_WORK_E2E_START_URL?.trim() ||
  process.env.OPENWORK_ELECTRON_START_URL?.trim() ||
  "http://127.0.0.1:5173";
const prompt =
  process.env.MATTERHORN_WORK_E2E_BITTENSOR_PROMPT?.trim() ||
  "Explain subnet 14 in Bittensor.";
const timeoutMs = Number.parseInt(process.env.MATTERHORN_WORK_E2E_TIMEOUT_MS || "90000", 10);

async function assertDevServerReady(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("received HTTP " + response.status);
    }
  } catch (error) {
    throw new Error(
      "Matterhorn Work app dev server is not reachable at " + url + ". " +
        "Start it first with: pnpm --filter @matterhorn-work/app dev. " +
        "Original error: " + (error instanceof Error ? error.message : String(error)),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function findComposer(page) {
  const selectors = [
    "textarea:not([disabled])",
    "[contenteditable='true']",
    "[role='textbox']",
    "input[type='text']:not([disabled])",
  ];
  for (const selector of selectors) {
    const locators = await page.locator(selector).all();
    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 500 })) return locator;
      } catch {
        // keep scanning
      }
    }
  }
  return null;
}

async function main() {
  await assertDevServerReady(startUrl);

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-desktop-bittensor-smoke-"));
  let app;
  try {
    app = await electron.launch({
      args: [electronMain],
      cwd: desktopRoot,
      env: {
        ...process.env,
        OPENWORK_DEV_MODE: process.env.OPENWORK_DEV_MODE ?? "1",
        OPENWORK_ELECTRON_START_URL: startUrl,
        OPENWORK_ELECTRON_USERDATA: userDataDir,
        OPENWORK_DATA_DIR: process.env.OPENWORK_DATA_DIR ?? path.join(userDataDir, "data"),
        MATTERHORN_WORK_E2E: "1",
      },
      timeout: timeoutMs,
    });

    const page = await app.firstWindow({ timeout: timeoutMs });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
    await page.getByText(/Matterhorn/i).first().waitFor({ timeout: timeoutMs });

    const composer = await findComposer(page);
    if (!composer) {
      throw new Error("Could not find a visible chat composer/textbox in the desktop window.");
    }

    await composer.click();
    await composer.fill(prompt).catch(async () => {
      await composer.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await composer.type(prompt);
    });
    await composer.press("Enter");

    await page
      .getByText(/Bittensor|subnet|netuid|unsupported adapter|adapter/i)
      .first()
      .waitFor({ timeout: timeoutMs });

    console.log(JSON.stringify({ ok: true, startUrl, prompt }, null, 2));
  } catch (error) {
    if (app) {
      try {
        const page = await app.firstWindow({ timeout: 1000 });
        const screenshotPath = path.join(os.tmpdir(), "matterhorn-bittensor-smoke-failure.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error("Saved failure screenshot: " + screenshotPath);
      } catch {
        // ignore screenshot failures
      }
    }
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
