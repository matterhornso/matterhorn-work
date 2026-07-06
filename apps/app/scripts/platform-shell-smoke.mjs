import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:5173";
const OUT_DIR = process.env.SMOKE_OUT_DIR || "/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability/docs/handoffs/screenshots";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/session`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/platform-shell-smoke-welcome.png`, fullPage: false });

  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT_DIR}/platform-shell-smoke-palette.png`, fullPage: false });

  await browser.close();
  console.log("Smoke screenshots captured.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
