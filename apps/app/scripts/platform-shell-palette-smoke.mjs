import { chromium } from "playwright";
const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:5173";
const OUT_DIR = process.env.SMOKE_OUT_DIR || "/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability/docs/handoffs/screenshots";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE_URL}/session`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT_DIR}/platform-shell-smoke-palette.png`, fullPage: false });
  await browser.close();
  console.log("Palette screenshot captured.");
})();
