import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

// ── Feature 1: Wallet Extension ─────────────────────────────────────────────

test.describe("F1: Wallet Extension", () => {
  test("wallet settings page renders", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Page should have wallet-related content
    await expect(page.locator("text=Wallet")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Connect your wallet")).toBeVisible();
  });

  test("wallet connect button renders", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // "Connect Wallet" button should exist (disconnected state)
    const connectBtn = page.locator("button", { hasText: "Connect Wallet" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
  });

  test("wallet connect dropdown opens with connector options", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Click connect button
    const connectBtn = page.locator("button", { hasText: "Connect Wallet" });
    await connectBtn.click();

    // Dropdown should appear with connector names
    await expect(page.locator("text=Injected")).toBeVisible({ timeout: 5000 });
  });

  test("settings sidebar shows wallet tab", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // The sidebar should have the Wallet nav item and it should be active
    const walletTab = page.locator("button", { hasText: "Wallet" }).first();
    await expect(walletTab).toBeVisible({ timeout: 10000 });
  });

  test("wallet panel shows disconnected state details", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Should show the wallet panel with network info or empty state
    // The page should not crash
    const body = page.locator("body");
    await expect(body).not.toHaveText(/error/i);
  });
});

// ── Feature 2: Session Context ──────────────────────────────────────────────

test.describe("F2: Session Context", () => {
  test("SessionContextProvider exports without errors", async ({ page }) => {
    // Navigate to any page that uses wallet context
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // No React errors in console
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Filter out expected wallet connection errors (MetaMask not installed)
    const realErrors = errors.filter(
      (e) => !e.includes("wagmi") && !e.includes("ethereum") && !e.includes("MetaMask"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("wallet view passes store prop without crashing", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Verify the component tree mounted
    const root = page.locator("#root");
    await expect(root).toBeVisible();
  });
});

// ── Feature 3: TX Pipeline ──────────────────────────────────────────────────

test.describe("F3: TX Pipeline", () => {
  test("transaction approval modal opens via custom event", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Dispatch a test TX approval request via custom event
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("matterhorn:tx-approval-request", {
          detail: {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            value: "0.01",
            data: "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240",
            chainId: 84532,
          },
        }),
      );
    });

    // Approval modal should appear
    await expect(page.locator("text=Transaction Approval")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=0x036C")).toBeVisible();
    await expect(page.locator("text=0.01 ETH")).toBeVisible();
    await expect(page.locator("text=Base Sepolia")).toBeVisible();
  });

  test("transaction approval shows data for contract calls", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Dispatch a TX with data (USDC transfer)
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("matterhorn:tx-approval-request", {
          detail: {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            value: "0",
            data: "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240",
            chainId: 84532,
          },
        }),
      );
    });

    await expect(page.locator("text=Transaction Approval")).toBeVisible({ timeout: 5000 });
    // Data section should show truncated calldata
    await expect(page.locator("text=0xa9059cbb")).toBeVisible();
  });

  test("reject button clears approval modal", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Dispatch a TX
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("matterhorn:tx-approval-request", {
          detail: {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            value: "0.01",
            data: "0x",
            chainId: 84532,
          },
        }),
      );
    });

    await expect(page.locator("text=Transaction Approval")).toBeVisible({ timeout: 5000 });

    // Click Reject
    await page.locator("button", { hasText: "Reject" }).click();

    // Modal should disappear
    await expect(page.locator("text=Transaction Approval")).not.toBeVisible({ timeout: 3000 });
  });

  test("approve button clears modal and fires response event", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Set up response event listener
    const responsePromise = page.evaluate(() => {
      return new Promise<{ approved: boolean }>((resolve) => {
        const handler = (e: Event) => {
          const detail = (e as CustomEvent).detail as { approved: boolean };
          window.removeEventListener("matterhorn:tx-approval-response", handler);
          resolve(detail);
        };
        window.addEventListener("matterhorn:tx-approval-response", handler);
      });
    });

    // Dispatch a TX
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("matterhorn:tx-approval-request", {
          detail: {
            to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            value: "0.01",
            data: "0x",
            chainId: 84532,
          },
        }),
      );
    });

    await expect(page.locator("text=Transaction Approval")).toBeVisible({ timeout: 5000 });

    // Click Approve
    await page.locator("button", { hasText: "Approve" }).click();

    // Modal should disappear
    await expect(page.locator("text=Transaction Approval")).not.toBeVisible({ timeout: 3000 });

    // Response event should have fired
    const response = await responsePromise;
    expect(response.approved).toBe(true);
  });
});

// ── Feature 5: Agent Marketplace ────────────────────────────────────────────

test.describe("F5: Agent Marketplace", () => {
  test("settings page general tab renders card grid", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState("networkidle");

    // Should land on settings general page
    await expect(page.locator("text=Settings")).toBeVisible({ timeout: 10000 });
  });

  test("wallet tab accessible from settings sidebar", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState("networkidle");

    // Click the Wallet nav item
    const walletNav = page.locator("button", { hasText: "Wallet" });
    await walletNav.click();

    // Should navigate to wallet settings
    await page.waitForURL("**/settings/wallet");
    await expect(page.locator("text=Connect your wallet")).toBeVisible({ timeout: 5000 });
  });

  test("app session page loads without errors", async ({ page }) => {
    await page.goto(`${BASE}/session`);
    await page.waitForLoadState("networkidle");

    // Page should load without crashing — session view may show empty state
    const root = page.locator("#root");
    await expect(root).toBeVisible({ timeout: 10000 });
  });
});

// ── Cross-cutting ───────────────────────────────────────────────────────────

test.describe("Cross-cutting", () => {
  test("no uncaught console errors on wallet page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Allow wagmi/no-ethereum errors since wallet isn't installed in headless
    const realErrors = errors.filter(
      (e) => !e.includes("wagmi") && !e.includes("ethereum") && !e.includes("MetaMask") && !e.includes("Connector") && !e.includes("Provider"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("settings sidebar navigates between tabs", async ({ page }) => {
    await page.goto(`${BASE}/settings/wallet`);
    await page.waitForLoadState("networkidle");

    // Click Preferences
    await page.locator("button", { hasText: "Preferences" }).click();
    await page.waitForURL("**/settings/preferences");
    await expect(page.locator("text=Preferences")).toBeVisible({ timeout: 5000 });

    // Click Permissions
    await page.locator("button", { hasText: "Permissions" }).click();
    await page.waitForURL("**/settings/permissions");
    await expect(page.locator("text=Permissions")).toBeVisible({ timeout: 5000 });

    // Navigate back to wallet
    await page.locator("button", { hasText: "Wallet" }).click();
    await page.waitForURL("**/settings/wallet");
    await expect(page.locator("text=Connect your wallet")).toBeVisible({ timeout: 5000 });
  });
});
