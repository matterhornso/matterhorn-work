import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { TransactionApproval } from "../src/react-app/domains/wallet/TransactionApproval";
import { createWalletStore } from "../src/react-app/domains/wallet/state/wallet-store";

const CONNECTED = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";

function renderApproval({
  connectedChainId,
  requestedChainId,
  value,
  maxPerTransactionUSD = 1_000,
}: {
  connectedChainId: number;
  requestedChainId: number;
  value: string;
  maxPerTransactionUSD?: number;
}) {
  const store = createWalletStore();
  store.setConnected(CONNECTED, connectedChainId, "Mock wallet");
  store.setMaxPerTransactionUSD(maxPerTransactionUSD);
  store.setMaxDailySpendUSD(10_000);
  store.requestApproval(TARGET, value, undefined, requestedChainId, "render_test", "low");

  return renderToStaticMarkup(
    <TransactionApproval
      store={store}
      onApprove={async () => {
        throw new Error("Approve should not run during server render.");
      }}
      onReject={() => undefined}
    />,
  );
}

function renderBatchApproval({
  connectedChainId,
  requestedChainId,
  value,
  maxPerTransactionUSD = 1_000,
}: {
  connectedChainId: number;
  requestedChainId: number;
  value: string;
  maxPerTransactionUSD?: number;
}) {
  const store = createWalletStore();
  store.setConnected(CONNECTED, connectedChainId, "Mock wallet");
  store.setMaxPerTransactionUSD(maxPerTransactionUSD);
  store.setMaxDailySpendUSD(10_000);
  store.requestBatchApproval({
    batchId: "batch_test",
    chainId: requestedChainId,
    proposedBy: "render_test",
    riskLevel: "medium",
    steps: [
      {
        id: "step_1",
        type: "transfer",
        description: "Send reviewed funds",
        to: TARGET,
        value,
      },
    ],
  });

  return renderToStaticMarkup(
    <TransactionApproval
      store={store}
      onApprove={async () => {
        throw new Error("Approve should not run during server render.");
      }}
      onReject={() => undefined}
      onExecuteBatchStep={async () => {
        throw new Error("Batch execution should not run during server render.");
      }}
    />,
  );
}

describe("Wallet approval rendered behavior", () => {
  test("blocks approval on chain mismatch while preserving the reviewed chain copy", () => {
    const html = renderApproval({
      connectedChainId: 8453,
      requestedChainId: 84532,
      value: "50000000000000000",
    });

    expect(html).toContain("Switch your wallet to Base Sepolia");
    expect(html).toContain("Matterhorn will not send on the wrong chain");
    expect(html).toContain("Asset changes");
    expect(html).toContain("Send 0.05 ETH");
    expect(html).toContain("0.05 ETH");
    expect(html).not.toContain("50000000000000000 ETH");
    expect(html).toContain("disabled");
    expect(html).toContain("Blocked");
  });

  test("blocks Base mainnet by default until mainnet is explicitly enabled", () => {
    const html = renderApproval({
      connectedChainId: 8453,
      requestedChainId: 8453,
      value: "1000000000000000",
    });

    expect(html).toContain("Mainnet is disabled. Enable mainnet in Settings");
    expect(html).toContain("Base");
    expect(html).toContain("disabled");
    expect(html).toContain("Blocked");
  });

  test("blocks approval when normalized value breaches spend policy", () => {
    const html = renderApproval({
      connectedChainId: 84532,
      requestedChainId: 84532,
      value: "50000000000000000",
      maxPerTransactionUSD: 10,
    });

    expect(html).toContain("This transaction exceeds your per-transaction limit of $10.");
    expect(html).toContain("Asset changes");
    expect(html).toContain("Send 0.05 ETH");
    expect(html).toContain("0.05 ETH");
    expect(html).toContain("~$100.00 USD");
    expect(html).toContain("disabled");
    expect(html).toContain("Blocked");
  });

  test("blocks batch execution before send when a step breaches policy", () => {
    const html = renderBatchApproval({
      connectedChainId: 84532,
      requestedChainId: 84532,
      value: "50000000000000000",
      maxPerTransactionUSD: 10,
    });

    expect(html).toContain("Transaction Batch");
    expect(html).toContain("Step blocked");
    expect(html).toContain("This transaction exceeds your per-transaction limit of $10.");
    expect(html).toContain("0.05 ETH");
    expect(html).toContain("~$100.00 USD");
    expect(html).toContain("disabled");
    expect(html).toContain("Blocked");
  });

  test("blocks batch execution before send on chain mismatch", () => {
    const html = renderBatchApproval({
      connectedChainId: 8453,
      requestedChainId: 84532,
      value: "1",
    });

    expect(html).toContain("Step blocked");
    expect(html).toContain("Switch your wallet to Base Sepolia");
    expect(html).toContain("Matterhorn will not send on the wrong chain");
    expect(html).toContain("disabled");
    expect(html).toContain("Blocked");
  });
});
