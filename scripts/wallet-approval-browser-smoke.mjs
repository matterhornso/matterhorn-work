#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const repoRoot = resolve(import.meta.dirname, "..");
const DEFAULT_URL = "http://127.0.0.1:5196/workspace/ws_d6a5b5572860/session";
const DEFAULT_OUTPUT_DIR = "qa-reports/wallet-approval-browser-smoke";
const MOCK_ACCOUNT = "0x1111111111111111111111111111111111111111";
const REVIEWED_TO = "0x2222222222222222222222222222222222222222";
const REVIEWED_VALUE_WEI = "10000000000000000";
const REVIEWED_VALUE_DISPLAY = "0.01 ETH";
const REVIEWED_VALUE_RAW_BUG = `${REVIEWED_VALUE_WEI} ETH`;
const REVIEWED_VALUE_HEX = "0x2386f26fc10000";
const BASE_SEPOLIA_ID = 84532;
const BASE_SEPOLIA_HEX = "0x14a34";
const BASE_MAINNET_ID = 8453;
const SIMULATION_ROUTE_GLOB = "**/workspace/**/wallet/simulate-transaction";
const SAFETY_EVENT_ROUTE_GLOB = "**/workspace/**/wallet/safety-events";

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
    headed: flags.has("--headed") || process.env.MATTERHORN_WALLET_BROWSER_HEADED === "1",
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_WALLET_BROWSER_STRICT === "1",
    url: values.get("--url") || process.env.MATTERHORN_WALLET_BROWSER_URL || DEFAULT_URL,
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_WALLET_BROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
  };
}

function printHelp() {
  console.log(`Matterhorn wallet approval browser smoke

Usage:
  node scripts/wallet-approval-browser-smoke.mjs --strict
  node scripts/wallet-approval-browser-smoke.mjs --url http://127.0.0.1:<app-port>/workspace/<id>/session

Options:
  --url <url>          Matterhorn app URL. Defaults to the current local dev URL.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Exit nonzero on smoke failure or browser console/page errors.
  --json               Print the full JSON report.
  --headed             Show the Chromium window while running.
  --help               Show this message.

Expected stack:
  Start the Matterhorn app first, then pass the visible workspace session URL.
  The smoke injects a mock EIP-1193/EIP-6963 wallet before app boot.

Boundaries:
  This smoke proves a reviewed transaction is sent exactly to the injected mock
  wallet on Base Sepolia, and that a blocked mainnet request does not reach the
  wallet. It never connects a real wallet, submits an on-chain transaction, or
  persists synthetic wallet events to the selected workspace ledger.
`);
}

function makeReport(config) {
  return {
    name: "wallet-approval-browser-smoke",
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

async function clickFirstVisible(locator, label, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) {
        await candidate.click();
        return;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Could not find a visible ${label}.`);
}

async function waitForMountedApp(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      return Boolean(root && root.childElementCount > 0);
    },
    { timeout: 30_000 },
  );
}

function workspacePathUrl(appUrl, suffix) {
  const url = new URL(appUrl);
  const workspaceMatch = url.pathname.match(/^\/workspace\/([^/]+)/);
  if (workspaceMatch) {
    url.pathname = `/workspace/${workspaceMatch[1]}${suffix}`;
  } else {
    url.pathname = suffix;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function walletSettingsUrl(appUrl) {
  return workspacePathUrl(appUrl, "/settings/wallet");
}

function workspaceSessionUrl(appUrl) {
  return workspacePathUrl(appUrl, "/session");
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

function isOptionalWalletSmokeEngineFailure(failure) {
  if (![400, 401, 502].includes(failure.status)) return false;
  try {
    const parsed = new URL(failure.url);
    if (/^\/workspace\/[^/]+\/opencode(?:\/|$)/.test(parsed.pathname)) return true;
    if (/^\/workspace\/[^/]+\/sessions$/.test(parsed.pathname)) return true;
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
  if (failure.status === 404 && /\.(?:avif|bmp|gif|ico|jpg|jpeg|png|svg|webp|woff2?)$/i.test(failure.url)) return false;
  if (failure.status === 404 && isOptionalDevWorkspace404(failure.url)) return false;
  if (isOptionalWalletSmokeEngineFailure(failure)) return false;
  return isWorkspaceOrApiRequest(failure.url) || failure.status >= 500;
}

function shouldFailOnConsoleError(message) {
  if (message.includes("Failed to load resource") && message.includes("404")) return false;
  if (
    message.includes("Failed to load resource") &&
    (message.includes("400") || message.includes("401") || message.includes("502"))
  ) {
    return false;
  }
  return true;
}

async function installMockWallet(context) {
  await context.addInitScript(({ account, chainIdHex }) => {
    const listeners = new Map();
    const sentTransactions = [];
    let currentChainId = chainIdHex;

    const emit = (event, payload) => {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of handlers) handler(payload);
    };

    const provider = {
      isMetaMask: true,
      request: async ({ method, params = [] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
        if (method === "eth_chainId") return currentChainId;
        if (method === "net_version") return String(Number.parseInt(currentChainId, 16));
        if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain") {
          currentChainId = params?.[0]?.chainId ?? currentChainId;
          emit("chainChanged", currentChainId);
          return null;
        }
        if (method === "wallet_addEthereumChain") return null;
        if (method === "eth_getBalance") return "0x2386f26fc10000";
        if (method === "eth_blockNumber") return "0x1";
        if (method === "eth_getTransactionCount") return "0x0";
        if (method === "eth_estimateGas") return "0x5208";
        if (method === "eth_gasPrice") return "0x3b9aca00";
        if (method === "eth_maxPriorityFeePerGas") return "0x3b9aca00";
        if (method === "eth_feeHistory") {
          return {
            oldestBlock: "0x1",
            baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
            gasUsedRatio: [0.5],
            reward: [["0x3b9aca00"]],
          };
        }
        if (method === "eth_call") return "0x";
        if (method === "eth_sendTransaction") {
          const tx = params?.[0] ?? {};
          sentTransactions.push({ ...tx, observedChainId: currentChainId });
          return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        }
        throw new Error(`Unsupported mock wallet method: ${method}`);
      },
      on(event, handler) {
        const handlers = listeners.get(event) ?? new Set();
        handlers.add(handler);
        listeners.set(event, handlers);
      },
      removeListener(event, handler) {
        listeners.get(event)?.delete(handler);
      },
    };

    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: provider,
    });

    window.__matterhornWalletSmoke = {
      account,
      sentTransactions,
      provider,
      getChainId: () => currentChainId,
      setChainId: (nextChainId) => {
        currentChainId = nextChainId;
        emit("chainChanged", currentChainId);
      },
    };

    const providerDetail = {
      info: {
        uuid: "5b4f2d85-6cf4-4e24-a48d-matterhorn-smoke",
        name: "Matterhorn Smoke Wallet",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23c7efff'/%3E%3Cpath d='M7 22c5.5 0 5.5-12 11-12h7v12h-5V14h-2c-3.4 0-3.7 12-11 12z' fill='%23000'/%3E%3C/svg%3E",
        rdns: "work.matterhorn.smoke",
      },
      provider,
    };
    const announceProvider = () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: providerDetail }));
    };
    window.addEventListener("eip6963:requestProvider", announceProvider);
    queueMicrotask(announceProvider);
  }, { account: MOCK_ACCOUNT, chainIdHex: BASE_SEPOLIA_HEX });
}

function mockBaseRpcResult(method) {
  if (method === "eth_chainId") return BASE_SEPOLIA_HEX;
  if (method === "net_version") return String(BASE_SEPOLIA_ID);
  if (method === "eth_getBalance") return "0x2386f26fc10000";
  if (method === "eth_blockNumber") return "0x1";
  if (method === "eth_getTransactionCount") return "0x0";
  if (method === "eth_estimateGas") return "0x5208";
  if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x3b9aca00";
  if (method === "eth_feeHistory") {
    return {
      oldestBlock: "0x1",
      baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
      gasUsedRatio: [0.5],
      reward: [["0x3b9aca00"]],
    };
  }
  if (method === "eth_getBlockByNumber") {
    return {
      number: "0x1",
      hash: `0x${"1".repeat(64)}`,
      parentHash: `0x${"0".repeat(64)}`,
      timestamp: "0x1",
      gasLimit: "0x1c9c380",
      gasUsed: "0x0",
      baseFeePerGas: "0x3b9aca00",
      transactions: [],
    };
  }
  if (method === "eth_call") return "0x";
  return null;
}

async function installMockBaseRpc(page) {
  await page.route("https://sepolia.base.org/**", async (route) => {
    const payload = route.request().postDataJSON();
    const entries = Array.isArray(payload) ? payload : [payload];
    const responses = entries.map((entry) => ({
      jsonrpc: "2.0",
      id: entry.id ?? null,
      result: mockBaseRpcResult(entry.method),
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(payload) ? responses : responses[0]),
    });
  });
}

async function connectInjectedWallet(page) {
  await waitForMountedApp(page);
  const connectorButton = page.getByRole("button", {
    name: /Matterhorn Smoke Wallet|MetaMask|Injected|Browser wallet extension|Wallet connector/i,
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const connectedAccount = await page.evaluate(() => {
      const smoke = window.__matterhornWalletSmoke;
      if (!smoke?.account) return null;
      return document.body.innerText.includes(smoke.account.slice(0, 6)) ||
        document.body.innerText.includes("Connected") ||
        document.body.innerText.includes("Disconnect")
        ? smoke.account
        : null;
    });
    if (connectedAccount === MOCK_ACCOUNT) return;
    const count = await connectorButton.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = connectorButton.nth(index);
      if (await candidate.isVisible()) {
        await candidate.click();
        await page.getByText(/Connected|Disconnect/i).first().waitFor({ state: "visible", timeout: 20_000 });
        return;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Could not find a connected or visible injected wallet connector.");
}

async function navigateWithinSpa(page, targetUrl) {
  await page.evaluate((nextUrl) => {
    window.history.pushState({}, "", nextUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, targetUrl);
  await waitForMountedApp(page);
}

async function waitForSessionSurface(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if ((await page.getByText(/Ask Matterhorn/i).count()) > 0) return;
    if ((await page.getByRole("button", { name: /New chat|Start chat/i }).count()) > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Could not find the Matterhorn session surface.");
}

async function dispatchApprovalRequest(page, { chainId, value = REVIEWED_VALUE_WEI }) {
  await page.evaluate(
    ({ chainId: requestChainId, to, requestValue }) => {
      window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", {
        detail: {
          chainId: requestChainId,
          to,
          value: requestValue,
          data: "0x",
          proposedBy: "wallet_browser_smoke",
          riskLevel: "low",
        },
      }));
    },
    { chainId, to: REVIEWED_TO, requestValue: value },
  );
}

async function waitForAnyVisible(page, entries, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    for (const entry of entries) {
      const locator = page.getByText(entry.pattern, { exact: false }).first();
      try {
        if ((await locator.count()) > 0 && await locator.isVisible()) {
          return entry.id;
        }
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  const labels = entries.map((entry) => String(entry.pattern)).join(" or ");
  throw new Error(`Timed out waiting for ${labels}.${lastError ? ` Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ""}`);
}

async function assertApprovalBlocked(page, reason) {
  const blockedButton = page.getByRole("button", { name: /^Blocked$/ });
  if ((await blockedButton.count()) > 0 && await blockedButton.first().isVisible()) {
    if (await blockedButton.first().isEnabled()) {
      throw new Error(`${reason} blocked approval button is enabled.`);
    }
    return;
  }

  const approveButton = page.getByRole("button", { name: /^Approve$/ });
  if ((await approveButton.count()) > 0 && await approveButton.first().isVisible()) {
    if (await approveButton.first().isEnabled()) {
      throw new Error(`${reason} approve button is enabled.`);
    }
    return;
  }

  throw new Error(`${reason} did not expose a blocked or disabled approve button.`);
}

async function runSmoke(config) {
  const report = makeReport(config);
  let browser;
  let page;
  const consoleErrors = [];
  const networkFailures = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({ headless: !config.headed });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installMockWallet(context);
    page = await context.newPage();
    await installMockBaseRpc(page);
    let simulationMode = "passed";

    await page.route(SAFETY_EVENT_ROUTE_GLOB, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }

      const input = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          event: {
            safetyAction: input.action,
            chainId: input.chainId,
            to: input.to,
            valueUSD: input.valueUSD,
            riskLevel: input.riskLevel,
            reason: input.reason,
            sessionId: null,
            txHash: input.txHash ?? null,
            review: input.review ?? null,
          },
        }),
      });
    });

    await page.route(SIMULATION_ROUTE_GLOB, async (route) => {
      const status = simulationMode === "failed" ? "failed" : "passed";
      const input = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          simulation: status === "failed"
              ? {
                status,
                chainId: input.chainId,
                to: input.to,
                from: input.from,
                value: input.value,
                data: input.data,
                dataSelector: input.data?.length >= 10 ? input.data.slice(0, 10) : input.data,
                sessionId: input.sessionId ?? null,
                checkedAt: Date.now(),
                gasUnits: null,
                gasError: "Smoke simulation failed before wallet approval.",
                error: "Smoke simulation failed before wallet approval.",
              }
            : {
                status,
                chainId: input.chainId,
                to: input.to,
                from: input.from,
                value: input.value,
                data: input.data,
                dataSelector: input.data?.length >= 10 ? input.data.slice(0, 10) : input.data,
                sessionId: input.sessionId ?? null,
                checkedAt: Date.now(),
                gasUnits: "21000",
                gasError: null,
                error: null,
              },
        }),
      });
    });

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
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await stage(report, "open_wallet_settings", "Open wallet settings", async () => {
      await page.goto(walletSettingsUrl(config.url), { waitUntil: "domcontentloaded" });
      await waitForMountedApp(page);
      await page.getByText(/Matterhorn Wallet|Wallet/i).first().waitFor({ state: "visible", timeout: 30_000 });
    });

    await stage(report, "connect_mock_wallet", "Connect injected mock wallet", async () => {
      await connectInjectedWallet(page);
      const account = await page.evaluate(() => window.__matterhornWalletSmoke?.account ?? null);
      if (account !== MOCK_ACCOUNT) throw new Error("Mock wallet was not installed.");
    });

    await stage(report, "open_session", "Open workspace session without reloading wallet state", async () => {
      await navigateWithinSpa(page, workspaceSessionUrl(config.url));
      await waitForSessionSurface(page);
    });

    await stage(report, "block_failed_simulation", "Block transaction that fails pre-approval simulation", async () => {
      simulationMode = "failed";
      await dispatchApprovalRequest(page, { chainId: 84532 });
      await page.getByRole("dialog", { name: /Transaction Approval/i }).waitFor({ state: "visible", timeout: 15_000 });
      const simulationOutcome = await waitForAnyVisible(page, [
        { id: "failed", pattern: /Smoke simulation failed before wallet approval/i },
        { id: "unavailable", pattern: /Simulation service is unavailable/i },
      ]);
      if (simulationOutcome === "failed") {
        await page.getByText(/Matterhorn will not send a transaction that fails simulation/i).waitFor({ state: "visible", timeout: 10_000 });
      } else {
        const unavailableBlocker = page.getByText(/Matterhorn will not send this transaction until simulation is available/i).first();
        if ((await unavailableBlocker.count()) > 0) {
          await unavailableBlocker.waitFor({ state: "visible", timeout: 10_000 });
        }
        report.warnings.push("simulation route was not reachable in this browser path; unavailable simulation still blocked approval");
      }
      await assertApprovalBlocked(page, "Failed simulation");
      const sentCount = await page.evaluate(() => window.__matterhornWalletSmoke.sentTransactions.length);
      if (sentCount !== 0) {
        throw new Error(`Failed simulation reached wallet. Sent transaction count: ${sentCount}`);
      }
      await page.getByRole("button", { name: /^Reject$/ }).click();
      simulationMode = "passed";
    });

    await stage(report, "reject_reviewed_transaction", "Cancel reviewed Base Sepolia transaction", async () => {
      const sentCountBefore = await page.evaluate(() => window.__matterhornWalletSmoke.sentTransactions.length);
      await dispatchApprovalRequest(page, { chainId: 84532 });
      const approvalDialog = page.getByRole("dialog", { name: /Transaction Approval/i });
      await approvalDialog.waitFor({ state: "visible", timeout: 15_000 });
      await page.getByText(/Passed pre-approval simulation/i).waitFor({ state: "visible", timeout: 10_000 });
      const approveButton = page.getByRole("button", { name: /^Approve$/ });
      if (!(await approveButton.isEnabled())) {
        throw new Error("Valid simulated transaction could not be reviewed before cancellation.");
      }
      await page.getByRole("button", { name: /^Reject$/ }).click();
      await approvalDialog.waitFor({ state: "hidden", timeout: 10_000 });
      const sentCountAfter = await page.evaluate(() => window.__matterhornWalletSmoke.sentTransactions.length);
      if (sentCountAfter !== sentCountBefore) {
        throw new Error(`Cancelled review reached wallet. Sent transaction count changed from ${sentCountBefore} to ${sentCountAfter}.`);
      }
    });

    await stage(report, "approve_reviewed_transaction", "Approve reviewed Base Sepolia transaction", async () => {
      await dispatchApprovalRequest(page, { chainId: 84532 });
      await page.getByRole("dialog", { name: /Transaction Approval/i }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByText(REVIEWED_TO.slice(0, 6), { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
      await page.getByText(REVIEWED_VALUE_DISPLAY, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
      await page.getByText(/Passed pre-approval simulation/i).waitFor({ state: "visible", timeout: 10_000 });
      const approvalCopy = await page.getByRole("dialog", { name: /Transaction Approval/i }).innerText();
      if (approvalCopy.includes(REVIEWED_VALUE_RAW_BUG)) {
        throw new Error(`Approval modal exposed raw wei as ETH: ${REVIEWED_VALUE_RAW_BUG}`);
      }
      await page.getByRole("button", { name: /^Approve$/ }).click();
      await page.waitForFunction(() => (window.__matterhornWalletSmoke?.sentTransactions?.length ?? 0) === 1, { timeout: 15_000 });
      const sent = await page.evaluate(() => window.__matterhornWalletSmoke.sentTransactions[0]);
      if (String(sent.to).toLowerCase() !== REVIEWED_TO.toLowerCase()) {
        throw new Error(`Wallet send target mismatch: ${sent.to}`);
      }
      if (String(sent.value).toLowerCase() !== REVIEWED_VALUE_HEX.toLowerCase()) {
        throw new Error(`Wallet send value mismatch: ${sent.value}`);
      }
      if (String(sent.observedChainId).toLowerCase() !== BASE_SEPOLIA_HEX) {
        throw new Error(`Wallet send chain mismatch: ${sent.observedChainId}`);
      }
    });

    await stage(report, "block_mainnet_transaction", "Block mainnet request before wallet send", async () => {
      await dispatchApprovalRequest(page, { chainId: BASE_MAINNET_ID });
      await page.getByRole("dialog", { name: /Transaction Approval/i }).waitFor({ state: "visible", timeout: 15_000 });
      await page.getByText(/Mainnet is disabled|Switch your wallet/i).first().waitFor({ state: "visible", timeout: 10_000 });
      const blockedButton = page.getByRole("button", { name: /^Blocked$/ });
      await blockedButton.waitFor({ state: "visible", timeout: 10_000 });
      if (await blockedButton.isEnabled()) {
        throw new Error("Blocked approval button is enabled.");
      }
      const sentCount = await page.evaluate(() => window.__matterhornWalletSmoke.sentTransactions.length);
      if (sentCount !== 1) {
        throw new Error(`Blocked request reached wallet. Sent transaction count: ${sentCount}`);
      }
      await page.getByRole("button", { name: /^Reject$/ }).click();
    });

    const failingNetworkResponses = networkFailures.filter(shouldFailOnNetworkResponse).map(networkFailureMessage);
    if (failingNetworkResponses.length > 0) {
      report.errors.push(...failingNetworkResponses);
    }
    const failingConsoleErrors = consoleErrors.filter(shouldFailOnConsoleError);
    const ignoredConsoleErrors = consoleErrors.filter((error) => !shouldFailOnConsoleError(error));
    if (ignoredConsoleErrors.length > 0) {
      report.warnings.push(...ignoredConsoleErrors.map((error) => `console: ${error}`));
    }
    if (failingConsoleErrors.length > 0) {
      report.errors.push(...failingConsoleErrors.map((error) => `console: ${error}`));
    }
    if (pageErrors.length > 0) {
      report.errors.push(...pageErrors.map((error) => `pageerror: ${error}`));
    }

    report.ready = report.errors.length === 0 && report.stages.every((entry) => entry.status === "pass");
    await mkdir(config.outputDir, { recursive: true });
    const screenshotPath = resolve(config.outputDir, "wallet-approval-browser-smoke.png");
    const summaryPath = resolve(config.outputDir, "summary.json");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    report.artifacts.screenshot = screenshotPath;
    report.artifacts.summary = summaryPath;
    await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    if (page) {
      await mkdir(config.outputDir, { recursive: true });
      const screenshotPath = resolve(config.outputDir, "wallet-approval-browser-smoke-failure.png");
      const summaryPath = resolve(config.outputDir, "summary.json");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      report.artifacts.screenshot = screenshotPath;
      report.artifacts.summary = summaryPath;
      await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
    }
    return report;
  } finally {
    await browser?.close();
  }
}

const config = parseArgs();

if (config.help) {
  printHelp();
  process.exit(0);
}

const report = await runSmoke(config);

if (config.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const status = report.ready ? "PASS" : "FAIL";
  console.log(`${status} ${report.name}`);
  for (const entry of report.stages) {
    console.log(`${entry.status === "pass" ? "✓" : "✗"} ${entry.id} (${entry.durationMs}ms)`);
    if (entry.error) console.log(`  ${entry.error}`);
  }
  if (report.artifacts.summary) console.log(`summary: ${report.artifacts.summary}`);
  if (report.artifacts.screenshot) console.log(`screenshot: ${report.artifacts.screenshot}`);
  for (const warning of report.warnings) console.log(`warning: ${warning}`);
  for (const error of report.errors) console.log(`error: ${error}`);
}

if (config.strict && !report.ready) {
  process.exit(1);
}
