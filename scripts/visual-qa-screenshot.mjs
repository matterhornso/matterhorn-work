#!/usr/bin/env node
/**
 * scripts/visual-qa-screenshot.mjs
 *
 * Takes screenshots of each screen in the HTML prototype for Monday Beta Visual QA.
 * Opens docs/ui/matterhorn-customer-ux-refresh/index.html in Playwright,
 * navigates to each screen via the nav, scrolls to it, and captures a screenshot.
 *
 * Screenshots are saved to docs/ui/screenshots/ (relative to repo root).
 */

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const htmlPath = join(repoRoot, "docs/ui/matterhorn-customer-ux-refresh/index.html");
const cssPath = join(repoRoot, "docs/ui/matterhorn-customer-ux-refresh/styles.css");
const outDir = join(repoRoot, "docs/ui/screenshots");

// Ensure output directory exists
mkdirSync(outDir, { recursive: true });

const screens = [
  { id: "screen-1",  label: "welcome",               viewports: ["desktop", "tablet", "mobile"] },
  { id: "screen-2",  label: "create-workspace-modal", viewports: ["desktop"] },
  { id: "screen-3",  label: "session-hub",           viewports: ["desktop"] },
  { id: "screen-4",  label: "bittensor-desk",         viewports: ["desktop", "tablet", "mobile"] },
  { id: "screen-5",  label: "hyperliquid-desk",       viewports: ["desktop", "tablet", "mobile"] },
  { id: "screen-6",  label: "polymarket-desk",        viewports: ["desktop", "tablet", "mobile"] },
  { id: "screen-7",  label: "wellness-desk",          viewports: ["desktop", "tablet", "mobile"] },
  { id: "screen-8",  label: "services",               viewports: ["desktop"] },
  { id: "screen-9",  label: "chat-composer",          viewports: ["desktop"] },
  { id: "screen-10", label: "error-states",           viewports: ["desktop"] },
  { id: "screen-11", label: "order-preview-panel",     viewports: ["desktop"] },
  { id: "screen-12", label: "external-signer-handoff",viewports: ["desktop"] },
  { id: "screen-13", label: "receipt-verified",       viewports: ["desktop"] },
  { id: "screen-14", label: "safety-strip-amber",     viewports: ["desktop"] },
  { id: "screen-15", label: "safety-strip-blue",      viewports: ["desktop"] },
  { id: "screen-16", label: "safety-strip-green",     viewports: ["desktop"] },
];

const viewportConfigs = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 390,  height: 844 },
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const protocol = `file://${htmlPath}`;

  console.log(`\nOpening: ${protocol}\n`);

  for (const screen of screens) {
    for (const vpName of screen.viewports) {
      const vp = viewportConfigs[vpName];
      const filename = `${screen.label}--${vpName}.png`;
      const outPath = join(outDir, filename);

      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();

      // Navigate to the HTML (it auto-loads via file://)
      await page.goto(protocol, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500); // let CSS render

      // Click the nav link for this screen
      const navLink = page.locator(
        `nav a[href="#${screen.id}"], nav button[data-screen="${screen.id}"]`
      ).first();

      const navExists = await navLink.count() > 0;
      if (navExists) {
        await navLink.click();
        await page.waitForTimeout(300);
      }

      // Scroll the screen block into view and take the screenshot
      const screenEl = page.locator(`#${screen.id}`);
      const visible = await screenEl.count() > 0;

      if (visible) {
        await screenEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);

        // Clip to the screen block's bounding box
        const box = await screenEl.boundingBox();
        if (box) {
          // Expand clip slightly above the element (captures the sticky header context)
          await page.screenshot({
            path: outPath,
            clip: {
              x: 0,
              y: Math.max(0, box.y - 60),
              width: vp.width,
              height: Math.min(box.height + 80, vp.height),
            },
          });
        } else {
          await page.screenshot({ path: outPath, fullPage: false });
        }
        console.log(`  [OK] ${filename}`);
      } else {
        console.log(`  [SKIP] ${screen.id} — not found`);
      }

      await context.close();
    }
  }

  await browser.close();
  console.log(`\nScreenshots saved to: ${outDir}`);
}

run().catch((err) => {
  console.error("Screenshot script failed:", err);
  process.exit(1);
});
