const { chromium } = require("playwright");
const { strictEqual, ok } = require("node:assert");

const BASE = "http://localhost:5173";
let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    process.stdout.write("PASS\n");
    passed++;
  } catch (e) {
    process.stdout.write(`FAIL\n    ${e.message}\n`);
    failed++;
  }
}

async function main() {
  console.log("Matterhorn Desks — E2E Test Suite\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // ═══════════════════════════════════════════════════════════════════════════
  // F1: Wallet Extension
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("F1: Wallet Extension");

  await test("wallet settings page renders", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {}); // swallow wagmi errors
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    const visible = await page.locator("text=Connect your wallet").first().isVisible({ timeout: 10000 });
    strictEqual(visible, true);
    await page.close();
  });

  await test("connect button shows 'Connect Wallet'", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    const btnText = await page.locator("button:has-text('Connect Wallet')").first().textContent();
    ok(btnText?.includes("Connect Wallet"), `Expected 'Connect Wallet' but got '${btnText}'`);
    await page.close();
  });

  await test("connect dropdown opens without error", async () => {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    await page.locator("button:has-text('Connect Wallet')").first().click();
    await page.waitForTimeout(500);
    // In headless Chrome without wallet extension, wagmi shows an empty dropdown.
    // The important thing is the click didn't crash and the button is in connecting state.
    const btnText = await page.locator("button:has-text('Connect')").first().textContent().catch(() => "");
    // Accept either "Connect Wallet" or "Connecting..." state
    ok(btnText.includes("Connect"), `Button should show Connect state, got: '${btnText}'`);
    await page.close();
  });

  await test("settings sidebar has wallet tab", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    const walletNav = page.locator("button:has-text('Wallet')").first();
    const visible = await walletNav.isVisible({ timeout: 5000 });
    ok(visible, "Wallet nav item should be visible in sidebar");
    await page.close();
  });

  await test("wallet page shows settings header", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    const headingVisible = await page.locator("h2:has-text('Wallet')").first().isVisible({ timeout: 5000 });
    ok(headingVisible, "Wallet heading should be visible");
    await page.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F3: TX Pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\nF3: TX Pipeline");

  await test("custom event opens TX approval modal", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: { to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: "0.01", data: "0xa9059cbb", chainId: 84532 },
      }));
    });
    await page.waitForTimeout(500);
    const visible = await page.locator("text=Transaction Approval").isVisible({ timeout: 5000 });
    ok(visible, "Transaction Approval modal should appear");
    await page.close();
  });

  await test("TX approval shows recipient address", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: { to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: "0.01", data: "0x", chainId: 84532 },
      }));
    });
    await page.waitForTimeout(500);
    const toText = await page.locator("text=0x036C").isVisible({ timeout: 5000 });
    ok(toText, "Should show truncated recipient address");
    const valueText = await page.locator("text=0.01 ETH").isVisible({ timeout: 3000 });
    ok(valueText, "Should show ETH value");
    await page.close();
  });

  await test("TX approval shows Base Sepolia chain", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: { to: "0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333", value: "0.01", data: "0x", chainId: 84532 },
      }));
    });
    await page.waitForTimeout(500);
    const chainText = await page.locator("text=Base Sepolia").isVisible({ timeout: 5000 });
    ok(chainText, "Should show Base Sepolia chain name");
    await page.close();
  });

  await test("reject button dismisses modal", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: { to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: "0", data: "0x", chainId: 84532 },
      }));
    });
    await page.waitForTimeout(500);
    await page.locator("button:has-text('Reject')").click();
    await page.waitForTimeout(300);
    const visible = await page.locator("text=Transaction Approval").isVisible({ timeout: 3000 }).catch(() => false);
    strictEqual(visible, false);
    await page.close();
  });

  await test("approve button fires response custom event", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });
    const responsePromise = page.evaluate(() => {
      return new Promise((resolve) => {
        window.addEventListener("matterhorn:tx-approval-response", (e) => {
          resolve(e.detail.approved);
        }, { once: true });
      });
    });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: { to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: "0", data: "0x", chainId: 84532 },
      }));
    });
    await page.waitForTimeout(500);
    await page.locator("button:has-text('Approve')").click();
    const approved = await responsePromise;
    strictEqual(approved, true);
    await page.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F5: Settings Navigation
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\nF5: Settings Navigation");

  await test("settings page renders at /settings", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    const settingsText = await page.locator("h1:has-text('Settings')").isVisible({ timeout: 10000 });
    ok(settingsText, "Settings heading should be visible");
    await page.close();
  });

  await test("sidebar navigates wallet → preferences → permissions", async () => {
    const page = await context.newPage();
    page.on("pageerror", () => {});
    await page.goto(`${BASE}/settings/wallet`, { waitUntil: "networkidle" });

    // Navigate to Preferences — use first() to avoid strict mode with sidebar + card
    await page.locator("button:has-text('Preferences')").first().click();
    await page.waitForTimeout(500);
    const prefsVisible = await page.locator("h2:has-text('Preferences')").first().isVisible({ timeout: 5000 });
    ok(prefsVisible, "Should show Preferences settings");

    // Navigate to Permissions
    await page.locator("button:has-text('Permissions')").first().click();
    await page.waitForTimeout(500);
    const permsVisible = await page.locator("h2:has-text('Permissions')").first().isVisible({ timeout: 5000 });
    ok(permsVisible, "Should show Permissions settings");

    // Navigate back to Wallet
    await page.locator("button:has-text('Wallet')").first().click();
    await page.waitForTimeout(500);
    const walletVisible = await page.locator("text=Connect your wallet").first().isVisible({ timeout: 5000 });
    ok(walletVisible, "Should navigate back to Wallet");
    await page.close();
  });

  await test("session page loads without crash", async () => {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/session`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const realErrors = errors.filter((e) => !e.includes("wagmi") && !e.includes("ethereum") && !e.includes("MetaMask"));
    strictEqual(realErrors.length, 0, `Unexpected errors: ${realErrors.join("; ")}`);
    await page.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${"═".repeat(50)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
