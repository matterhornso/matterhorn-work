#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/wallet-approval-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.ok(
  script.includes("Matterhorn wallet approval browser smoke"),
  "wallet approval browser smoke should explain its purpose",
);
assert.ok(
  script.includes('import { chromium } from "playwright"'),
  "wallet approval browser smoke should use Playwright Chromium",
);
assert.ok(
  script.includes("MATTERHORN_WALLET_BROWSER_URL") &&
    script.includes("MATTERHORN_WALLET_BROWSER_OUTPUT_DIR") &&
    script.includes("MATTERHORN_WALLET_BROWSER_STRICT"),
  "wallet approval browser smoke should expose URL, output, and strict env controls",
);
assert.ok(
  script.includes("context.addInitScript") &&
    script.includes("window.__matterhornWalletSmoke") &&
    script.includes('Object.defineProperty(window, "ethereum"'),
  "wallet approval browser smoke should inject a mock wallet before app boot",
);
assert.ok(
  script.includes("eip6963:announceProvider") &&
    script.includes("eip6963:requestProvider") &&
    script.includes("Matterhorn Smoke Wallet"),
  "wallet approval browser smoke should support wallet-standard injected discovery",
);
for (const method of [
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "wallet_switchEthereumChain",
  "eth_estimateGas",
  "eth_sendTransaction",
]) {
  assert.ok(script.includes(method), `mock wallet should implement ${method}`);
}
for (const stageId of [
  "open_wallet_settings",
  "connect_mock_wallet",
  "open_session",
  "block_failed_simulation",
  "approve_reviewed_transaction",
  "block_mainnet_transaction",
]) {
  assert.ok(script.includes(stageId), `wallet approval browser smoke should report stage ${stageId}`);
}
assert.ok(
  script.includes("walletSettingsUrl") &&
    script.includes("/settings/wallet") &&
    script.includes("workspaceSessionUrl") &&
    script.includes("/session") &&
    script.includes("PopStateEvent"),
  "wallet approval browser smoke should connect in settings then navigate within the SPA to the session",
);
assert.ok(
  script.includes("matterhorn:tx-approval-request") &&
    script.includes("SIMULATION_ROUTE_GLOB") &&
    script.includes("/wallet/simulate-transaction") &&
    script.includes("waitForAnyVisible") &&
    script.includes("Smoke simulation failed before wallet approval") &&
    script.includes("Matterhorn will not send a transaction that fails simulation") &&
    script.includes("Matterhorn will not send this transaction until simulation is available") &&
    script.includes("wallet_browser_smoke") &&
    script.includes("Transaction Approval"),
  "wallet approval browser smoke should use the real transaction approval event, modal, and simulation gate",
);
assert.ok(
  script.includes("SAFETY_EVENT_ROUTE_GLOB") &&
    script.includes("/wallet/safety-events") &&
    script.includes("persists synthetic wallet events to the selected workspace ledger") &&
    script.includes("request.postDataJSON()") &&
    script.includes("safetyAction: input.action"),
  "wallet approval browser smoke should keep synthetic safety events out of the selected workspace ledger",
);
assert.ok(
  script.includes("REVIEWED_TO") &&
    script.includes("REVIEWED_VALUE_WEI") &&
    script.includes("REVIEWED_VALUE_DISPLAY") &&
    script.includes("REVIEWED_VALUE_RAW_BUG") &&
    script.includes("REVIEWED_VALUE_HEX") &&
    script.includes("observedChainId") &&
    script.includes("BASE_SEPOLIA_HEX"),
  "wallet approval browser smoke should assert normalized value display and exact reviewed transaction sent to the wallet",
);
assert.ok(
  script.includes("approvalCopy.includes(REVIEWED_VALUE_RAW_BUG)") &&
    script.includes("Approval modal exposed raw wei as ETH") &&
    script.includes("page.getByText(REVIEWED_TO.slice(0, 6), { exact: false }).first().waitFor") &&
    script.includes("page.getByText(REVIEWED_VALUE_DISPLAY, { exact: false }).first().waitFor") &&
    script.includes("Passed pre-approval simulation"),
  "wallet approval browser smoke should fail when raw wei is displayed as ETH and prove passing simulations are visible without strict duplicate address selectors",
);
assert.ok(
  script.includes("blocked approval button is enabled") &&
    script.includes("assertApprovalBlocked(page, \"Failed simulation\")") &&
    script.includes("approve button is enabled") &&
    script.includes("Failed simulation reached wallet") &&
    script.includes("simulation route was not reachable in this browser path") &&
    script.includes("simulationMode = \"failed\"") &&
    script.includes("simulationMode = \"passed\""),
  "wallet approval browser smoke should prove failed simulations block wallet sends",
);
assert.ok(
  script.includes("BASE_MAINNET_ID") &&
    script.includes("Blocked") &&
    script.includes("Blocked request reached wallet"),
  "wallet approval browser smoke should prove blocked transactions never reach the wallet",
);
assert.ok(
  script.includes("page.on(\"console\"") &&
    script.includes("page.on(\"response\"") &&
    script.includes("page.on(\"pageerror\"") &&
    script.includes("isOptionalDevWorkspace404") &&
    script.includes("isOptionalWalletSmokeEngineFailure") &&
    script.includes("/opencode") &&
    script.includes("/sessions") &&
    script.includes("opencode") &&
    script.includes("mcp") &&
    script.includes(".opencode/agents/opencode-router.md") &&
    script.includes("shouldFailOnConsoleError") &&
    script.includes("shouldFailOnNetworkResponse") &&
    script.includes("report.errors.length === 0"),
  "wallet approval browser smoke should fail strict runs on browser and API failures",
);
assert.ok(
  script.includes("wallet-approval-browser-smoke.png") &&
    script.includes("summary.json"),
  "wallet approval browser smoke should write screenshot and JSON evidence",
);
assert.equal(
  packageJson.scripts?.["smoke:wallet-approval-browser"],
  "node scripts/wallet-approval-browser-smoke.mjs --strict",
  "package.json should expose the wallet approval browser smoke",
);
assert.equal(
  packageJson.scripts?.["test:wallet-approval-browser-smoke"],
  "node scripts/wallet-approval-browser-smoke.test.mjs",
  "package.json should expose the wallet approval browser smoke contract gate",
);

console.log("Wallet approval browser smoke contract passed.");
