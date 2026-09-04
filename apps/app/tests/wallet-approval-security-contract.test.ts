import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  );
}

describe("Wallet approval security contract", () => {
  test("approved transactions are submitted on the reviewed chain", () => {
    const source = readAppSource("domains/wallet/useSessionWallet.ts");
    const reviewedSendSource = readAppSource(
      "domains/wallet/lib/reviewed-wallet-send.ts",
    );
    const stateSource = readAppSource("domains/wallet/state/wallet-store.ts");
    const modalSource = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("sendReviewedWalletTransaction");
    expect(reviewedSendSource).toContain("chainId: approval.chainId");
    expect(reviewedSendSource).toContain("prepareWalletTransactionSend");
    expect(reviewedSendSource).toContain("sendTransaction(prepared.request)");
    expect(source).toContain("chainId: targetChainId");
    expect(stateSource).toContain("Switch your wallet to");
    expect(modalSource).toContain("chainMismatch");
    expect(modalSource).toContain(
      "Matterhorn will not send on the wrong chain",
    );
  });

  test("approval modal does not clear or confirm before async wallet send succeeds", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");
    const sessionRuntimeSource = readAppSource(
      "domains/wallet/session-wallet-runtime.tsx",
    );

    expect(source).toContain("const [approvalBusy, setApprovalBusy]");
    expect(source).toContain("const refreshed = await onSimulateTransaction");
    expect(source).toContain("data: refreshed.simulation.data");
    expect(source).toContain("await onApprove(pending, {");
    expect(source).toContain("setApprovalError(message)");
    expect(source).toContain("sanitizeApprovalError");
    expect(source).not.toContain(
      "dispatchTxApprovalResponse(true);\n              onApprove(pending);\n              store.clearApproval();",
    );
    expect(sessionRuntimeSource).toContain(
      "onApprove={(_tx, simulationProof) => sessionWallet.approveTx(simulationProof)}",
    );
  });

  test("approval dialogs contain focus, start on a safe action, and restore focus", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("const overlayRef = useRef<HTMLDivElement | null>(null)");
    expect(source).toContain("data-approval-cancel");
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("dialog.contains(document.activeElement)");
    expect(source).toContain("previouslyFocused?.isConnected");
    expect(source).toContain("previouslyFocused.focus()");
    expect(source).toContain("tabIndex={-1}");
  });

  test("approval modal displays normalized ETH value instead of raw wei", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("analyzeWalletTransaction");
    expect(source).toContain("analysis.displayValue");
    expect(source).toContain('label="Token action"');
    expect(source).not.toContain("{pending.value} ETH");
  });

  test("wallet review keeps plain terms primary and technical contract data collapsed", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("Review wallet action");
    expect(source).toContain("Nothing moves until you continue in your wallet");
    expect(source).toContain('label="Recipient"');
    expect(source).toContain('label="Safety check"');
    expect(source).toContain('label="Network fee estimate"');
    expect(source).toContain("Show technical data");
    expect(source).toContain("Continue in wallet");
    expect(source).not.toContain('label="Calldata"');
    expect(source).not.toContain('label="Simulation"');
  });

  test("approval modal uses one calm status summary and a dominant reviewed value", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("function ApprovalStatusSummary");
    expect(source).toContain(
      "const reviewNotices = [...blockingNotices, ...cautionNotices]",
    );
    expect(source).toContain(
      "<ApprovalStatusSummary blocked={isBlocked || Boolean(approvalError)} notices={reviewNotices} />",
    );
    expect(source).toContain("matterhorn-raised-surface");
    expect(source).toContain("text-2xl font-semibold tabular-nums");
    expect(source).toContain("more details");
  });

  test("spend limits and swap rate limits block approval creation", () => {
    const source = readAppSource("domains/wallet/useSessionWallet.ts");
    const stateSource = readAppSource("domains/wallet/state/wallet-store.ts");

    expect(source).toContain("walletSafetyPolicyFromSnapshot");
    expect(source).toContain("evaluateWalletApprovalAgainstPolicy");
    expect(source).toContain("approvalPolicyFromSafetyPolicy");
    expect(stateSource).toContain(
      "input.valueUSD > input.maxPerTransactionUSD",
    );
    expect(stateSource).toContain(
      "input.valueUSD + input.dailySpendUSD > input.maxDailySpendUSD",
    );
    expect(stateSource).toContain(
      "input.sessionSwapCount >= MAX_SWAPS_PER_HOUR",
    );
    expect(stateSource).toContain("matterhorn.wallet.safety-policy.v1");
    expect(source).toContain('"limit_hit"');
    expect(source).toContain('"rate_limit_hit"');
    expect(source).toContain("return;");
    expect(source).not.toContain("warningOnly");
  });

  test("ERC-20 calldata value is decoded for policy and display", () => {
    const stateSource = readAppSource("domains/wallet/state/wallet-store.ts");
    const modalSource = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(stateSource).toContain("decodeKnownTokenAction");
    expect(stateSource).toContain("0xa9059cbb");
    expect(stateSource).toContain("0x095ea7b3");
    expect(stateSource).toContain("USDC_DECIMALS");
    expect(modalSource).toContain("analysis.tokenAction");
    expect(stateSource).toContain("valueUSDIsKnown");
    expect(stateSource).toContain("cannot verify this transaction's USD value");
  });

  test("gas estimation is server-routed and errors are sanitized before display", () => {
    const gasSource = readAppSource("domains/wallet/lib/gas-estimate.ts");
    const modalSource = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(gasSource).toContain("sanitizeGasEstimateError");
    expect(gasSource).not.toContain("mainnet.base.org");
    expect(gasSource).not.toContain("sepolia.base.org");
    expect(modalSource).toContain("result.gasUnits");
    expect(modalSource).not.toContain("estimateGasClient");
    expect(gasSource).not.toContain("error: err instanceof Error ? err.message");
  });

  test("approval modal uses workspace transaction simulation before approval", () => {
    const modalSource = readAppSource("domains/wallet/TransactionApproval.tsx");
    const sessionSource = readAppSource(
      "domains/session/chat/session-page.tsx",
    );
    const clientSource = readFileSync(
      new URL("../src/app/lib/matterhorn-server.ts", import.meta.url),
      "utf8",
    );

    expect(clientSource).toContain("simulateWalletTransaction");
    expect(clientSource).toContain("/wallet/simulate-transaction");
    expect(sessionSource).toContain(
      "simulateWalletTransaction(outputReceiptWorkspaceId, input)",
    );
    expect(sessionSource).toContain("onSimulateTransaction=");
    expect(modalSource).toContain("onSimulateTransaction");
    expect(modalSource).toContain('setSimulation({ status: "checking" })');
    expect(modalSource).toContain('action: "simulation_failed"');
    expect(modalSource).toContain(
      "Matterhorn will not send a transaction that fails simulation",
    );
    expect(modalSource).toContain(
      "Matterhorn will not send this transaction until simulation is available",
    );
    expect(modalSource).toContain(
      'const simulationUnavailable = simulation.status === "unavailable"',
    );
    expect(modalSource).toContain(
      "const simulationBlocked = simulationFailed || simulationUnavailable",
    );
    expect(modalSource).toContain("simulationChecking || isBlocked");
  });

  test("wallet safety ledger updates live and records explicit rejects", () => {
    const logSource = readAppSource("domains/wallet/state/security-log.ts");
    const panelSource = readAppSource("domains/wallet/WalletPanel.tsx");
    const hookSource = readAppSource("domains/wallet/useSessionWallet.ts");
    const clientSource = readFileSync(
      new URL("../src/app/lib/matterhorn-server.ts", import.meta.url),
      "utf8",
    );

    expect(logSource).toContain("SECURITY_LOG_UPDATED_EVENT");
    expect(logSource).toContain("WalletSafetyReviewTrail");
    expect(logSource).toContain("window.dispatchEvent(new CustomEvent");
    expect(logSource).toContain("subscribeSecurityLog");
    expect(logSource).toContain('window.addEventListener("storage"');
    expect(panelSource).toContain("subscribeSecurityLog");
    expect(panelSource).toContain("setSecurityLog(getSecurityLog(5))");
    expect(hookSource).toContain('action: "tx_rejected"');
    expect(hookSource).toContain("User rejected the transaction review.");
    expect(clientSource).toContain("MatterhornWalletSafetyPolicyResponse");
    expect(clientSource).toContain("MatterhornWalletSafetyPolicyUpdateRequest");
    expect(clientSource).toContain("getWalletSafetyPolicy");
    expect(clientSource).toContain("updateWalletSafetyPolicy");
    expect(clientSource).toContain("/wallet/safety-policy");
    expect(clientSource).toContain("review?:");
  });

  test("wallet settings safety boundaries are workspace-backed when a server is available", () => {
    const walletViewSource = readAppSource(
      "domains/settings/pages/wallet-view.tsx",
    );

    expect(walletViewSource).toContain("WalletSafetyPolicyControls");
    expect(walletViewSource).toContain("getWalletSafetyPolicy");
    expect(walletViewSource).toContain("updateWalletSafetyPolicy");
    expect(walletViewSource).toContain("Safety boundaries saved");
    expect(walletViewSource).toContain("Safety boundaries applied locally");
    expect(walletViewSource).toContain(
      "Future Base transaction reviews will use this workspace policy.",
    );
    expect(walletViewSource).toContain("Base transaction limits");
    expect(walletViewSource).toContain(
      "Applied before a Base transaction reaches your browser wallet.",
    );
    expect(walletViewSource).toMatch(
      /Sui\s+and Bittensor use their own wallet review checks\./,
    );
    expect(walletViewSource).toContain("How limits work");
    expect(walletViewSource).toContain(
      "aria-pressed={form.preferredNetwork === value}",
    );
    expect(walletViewSource).toContain("aria-pressed={form.mainnetEnabled}");
    expect(walletViewSource).toContain(
      "Per-transaction limit must be between $1 and $1,000,000.",
    );
    expect(walletViewSource).toContain(
      "Daily limit must be between $1 and $10,000,000.",
    );
    expect(walletViewSource).toContain(
      "Max slippage must be a whole number between 1 and 10,000 bps.",
    );
    expect(walletViewSource).toContain('title: "Check safety boundaries"');
    expect(walletViewSource).toContain("Reviewed");
    expect(walletViewSource).toContain("Sent");
    expect(walletViewSource).toContain("shortWalletAuditText");
    expect(walletViewSource).toContain('row.riskLevel !== "low"');
    expect(walletViewSource).toContain("No safety events yet");
  });

  test("market handoff approvals cannot imply Matterhorn signs or submits", () => {
    const approvalSource = readAppSource(
      "domains/wallet/TransactionApproval.tsx",
    );

    expect(approvalSource).toContain("Hyperliquid Handoff");
    expect(approvalSource).toContain("Review before external execution");
    expect(approvalSource).toContain(
      "Matterhorn does not sign, submit, or hold exchange credentials.",
    );
    expect(approvalSource).toContain("Mark reviewed");
    expect(approvalSource).not.toContain("Sign & Submit");
    expect(approvalSource).not.toContain(
      "onApprove(pending as unknown as TxApprovalRequest)",
    );
  });

  test("Hyperliquid execution is exact-intent, wallet-signed, and never agent automatic", () => {
    const panelSource = readAppSource(
      "domains/wallet/pages/BittensorPanel.tsx",
    );
    const serverSource = readFileSync(
      new URL("../../server/src/server.ts", import.meta.url),
      "utf8",
    );
    const executionSource = readFileSync(
      new URL(
        "../../server/src/tools/hyperliquid-live-execution.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const readinessSource = readFileSync(
      new URL(
        "../../server/src/tools/market-execution-readiness.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const cryptoMcpSource = readFileSync(
      new URL(
        "../../../packages/matterhorn-work-crypto-mcp/index.mjs",
        import.meta.url,
      ),
      "utf8",
    );

    expect(panelSource).toContain("Place a perpetual order");
    expect(panelSource).toContain("signTypedDataAsync(intent.typedData)");
    expect(panelSource).toContain("/api/hyperliquid/actions/execution-intent");
    expect(panelSource).toContain("/api/hyperliquid/orders/submit");
    expect(panelSource).toContain("Agent prompts never auto-execute");
    expect(readinessSource).toContain(
      "MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED",
    );
    expect(serverSource).toContain("isHyperliquidExecutionEnabled()");
    expect(serverSource).toContain("hyperliquid_execution_disabled");
    expect(executionSource).toContain("recoverTypedDataAddress");
    expect(executionSource).toContain(
      "Wallet signature does not authorize this exact action intent",
    );
    expect(executionSource).toContain("oneTimeSubmission: true");
    expect(executionSource).toContain("privateKeysAccepted: false");
    expect(executionSource).toContain("apiSecretsAccepted: false");
    expect(executionSource).toContain(
      "expiresAfter: Date.parse(intent.expiresAt)",
    );
    expect(executionSource).toContain(
      "hashHyperliquidAction(action, nonce, null, expiresAtMs)",
    );
    expect(cryptoMcpSource).not.toContain("hl_submitOrder");
  });

  test("batch wallet steps are audited when approved or blocked", () => {
    const hookSource = readAppSource("domains/wallet/useSessionWallet.ts");
    const reviewedSendSource = readAppSource(
      "domains/wallet/lib/reviewed-wallet-send.ts",
    );
    const approvalSource = readAppSource(
      "domains/wallet/TransactionApproval.tsx",
    );
    const batchSource = readAppSource(
      "domains/wallet/components/TransactionBatch.tsx",
    );

    expect(hookSource).toContain("sendReviewedWalletTransaction");
    expect(hookSource).toContain("Batch step blocked:");
    expect(hookSource).toContain("User approved a batch transaction step.");
    expect(reviewedSendSource).toContain("prepareWalletTransactionSend");
    expect(reviewedSendSource).toContain("onSecurityLog");
    expect(reviewedSendSource).toContain('action: "tx_approved"');
    expect(approvalSource).toContain("stepGuards");
    expect(approvalSource).toContain("plannedDailySpendUSD");
    expect(approvalSource).toContain(
      "This batch step could not be decoded safely.",
    );
    expect(batchSource).toContain("nextStepBlocked");
    expect(batchSource).toContain("Step blocked");
    expect(batchSource).toContain("if (guard?.blockers.length) return;");
    expect(batchSource).toContain(
      "disabled={busy || nextStep === null || nextStepBlocked}",
    );
  });

  test("approval overlays expose dialog semantics", () => {
    const approvalSource = readAppSource(
      "domains/wallet/TransactionApproval.tsx",
    );
    const batchSource = readAppSource(
      "domains/wallet/components/TransactionBatch.tsx",
    );

    expect(
      approvalSource.match(/role=\"dialog\"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      approvalSource.match(/aria-modal=\"true\"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(approvalSource).toContain("matterhorn-transaction-approval-title");
    expect(approvalSource).toContain(
      "matterhorn-hyperliquid-order-approval-title",
    );
    expect(batchSource).toContain('role="dialog"');
    expect(batchSource).toContain('aria-modal="true"');
    expect(batchSource).toContain("matterhorn-batch-approval-title");
  });

  test("ENS resolution cannot reuse a stale previous recipient", () => {
    const hookSource = readAppSource(
      "domains/wallet/hooks/useEnsResolution.ts",
    );
    const transferSource = readAppSource(
      "domains/wallet/pages/TransferPanel.tsx",
    );
    const bridgeSource = readAppSource("domains/wallet/pages/BridgePanel.tsx");
    const ensSource = readAppSource("domains/wallet/lib/ens.ts");

    expect(hookSource).toContain("requestIdRef");
    expect(hookSource).toContain("requestId === requestIdRef.current");
    expect(transferSource).toContain("resolvedFor === normalizedRecipient");
    expect(bridgeSource).toContain("resolvedFor === normalizedRecipient");
    expect(ensSource).toContain('http("https://ethereum-rpc.publicnode.com")');
    expect(ensSource).not.toContain("transport: http(),");
  });

  test("the hosted wallet rail exposes the reviewed Base transfer flow", () => {
    const settingsSource = readAppSource(
      "domains/settings/pages/wallet-view.tsx",
    );
    const transferSource = readAppSource(
      "domains/wallet/pages/TransferPanel.tsx",
    );

    expect(settingsSource).toContain("Send on Base");
    expect(settingsSource).toContain("<TransferPanel store={store}");
    expect(settingsSource).toContain("simulates it and checks your limits");
    expect(transferSource).toContain("parseUnits(amount, selectedMeta.decimals)");
    expect(transferSource).toContain("store.requestApproval(");
    expect(transferSource).toContain("Switch your wallet to Base or Base Sepolia");
  });
});
