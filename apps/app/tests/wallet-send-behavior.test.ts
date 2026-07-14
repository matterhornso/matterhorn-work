import { describe, expect, test } from "bun:test";

import { sendReviewedWalletTransaction } from "../src/react-app/domains/wallet/lib/reviewed-wallet-send";
import {
  analyzeWalletTransaction,
  prepareWalletTransactionSend,
  type PreparedWalletSendRequest,
  type TxRecord,
} from "../src/react-app/domains/wallet/state/wallet-store";
import { USDC_BY_CHAIN } from "../src/react-app/infra/contracts";
import type { SecurityLogEntry } from "../src/react-app/domains/wallet/state/security-log";

const TARGET = "0x2222222222222222222222222222222222222222";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SPENDER = "0x3333333333333333333333333333333333333333";

function policy(overrides: Partial<Parameters<typeof sendReviewedWalletTransaction>[0]["policy"]> = {}) {
  return {
    maxPerTransactionUSD: 1_000,
    maxDailySpendUSD: 10_000,
    dailySpendUSD: 0,
    sessionSwapCount: 0,
    lastSwapReset: 0,
    ...overrides,
  };
}

function encodeErc20Transfer(to: string, rawAmount: bigint) {
  return `0xa9059cbb${to.replace(/^0x/, "").padStart(64, "0")}${rawAmount.toString(16).padStart(64, "0")}`;
}

function encodeErc20Approve(spender: string, rawAmount: bigint) {
  return `0x095ea7b3${spender.replace(/^0x/, "").padStart(64, "0")}${rawAmount.toString(16).padStart(64, "0")}`;
}

describe("reviewed wallet send behavior", () => {
  test("sends the exact reviewed chain, recipient, calldata, and normalized wei value to the wallet", async () => {
    const requests: PreparedWalletSendRequest["request"][] = [];
    const txs: TxRecord[] = [];
    const logs: SecurityLogEntry[] = [];

    const result = await sendReviewedWalletTransaction({
      approval: {
        chainId: 84532,
        to: TARGET,
        value: "50000000000000000",
        data: "0x",
        proposedBy: "behavior_test",
        riskLevel: "low",
      },
      connectedChainId: 84532,
      forceTestnet: true,
      policy: policy(),
      chainName: (id) => (id === 84532 ? "Base Sepolia" : `chain ${id}`),
      sendTransaction: async (request) => {
        requests.push(request);
        return HASH;
      },
      now: () => 1_783_607_000_000,
      onTransaction: (tx) => txs.push(tx),
      onDailySpend: (amountUSD) => logs.push({
        timestamp: 1_783_607_000_000,
        action: "tx_proposed",
        chainId: 84532,
        to: TARGET,
        valueUSD: amountUSD,
        riskLevel: "low",
        reason: "daily spend increment observed",
      }),
      onSecurityLog: (entry) => logs.push(entry),
      approvedReason: "User approved via TransactionApproval modal",
    });

    expect(result.hash).toBe(HASH);
    expect(result.analysis.assetChanges).toEqual([{
      asset: "ETH",
      direction: "send",
      amount: "0.05",
      usdValue: 100,
      recipient: TARGET,
      summary: "Send 0.05 ETH",
    }]);
    expect(requests).toEqual([{
      chainId: 84532,
      to: TARGET,
      value: 50_000_000_000_000_000n,
      data: "0x",
    }]);
    expect(txs).toEqual([{
      hash: HASH,
      to: TARGET,
      value: "50000000000000000",
      status: "pending",
      timestamp: 1_783_607_000_000,
      chainId: 84532,
      proposedBy: "behavior_test",
      riskLevel: "low",
    }]);
    expect(logs.some((entry) =>
      entry.action === "tx_approved" &&
      entry.chainId === 84532 &&
      entry.to === TARGET &&
      entry.valueUSD === 100 &&
      entry.reason === "User approved via TransactionApproval modal"
    )).toBe(true);
    const approvedLog = logs.find((entry) => entry.action === "tx_approved");
    expect(approvedLog?.txHash).toBe(HASH);
    expect(approvedLog?.review).toEqual({
      reviewed: {
        chainId: 84532,
        to: TARGET,
        value: "50000000000000000",
        valueUSD: 100,
        dataSelector: null,
        displayValue: "0.05 ETH",
        proposedBy: "behavior_test",
      },
      submitted: {
        chainId: 84532,
        to: TARGET,
        value: "50000000000000000",
        dataSelector: null,
        txHash: HASH,
      },
    });
  });

  test("does not call the wallet when the connected chain differs from the reviewed chain", async () => {
    const requests: PreparedWalletSendRequest["request"][] = [];
    const logs: SecurityLogEntry[] = [];

    let message = "";
    try {
      await sendReviewedWalletTransaction({
        approval: {
          chainId: 84532,
          to: TARGET,
          value: "1",
          proposedBy: "behavior_test",
          riskLevel: "medium",
        },
        connectedChainId: 8453,
        forceTestnet: true,
        policy: policy(),
        chainName: (id) => (id === 84532 ? "Base Sepolia" : id === 8453 ? "Base" : `chain ${id}`),
        sendTransaction: async (request) => {
          requests.push(request);
          return HASH;
        },
        onSecurityLog: (entry) => logs.push(entry),
        approvedReason: "User approved via TransactionApproval modal",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Switch your wallet to Base Sepolia");
    expect(message).toContain("It is currently on Base");
    expect(requests).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "chain_mismatch",
      chainId: 84532,
      to: TARGET,
      riskLevel: "medium",
      review: {
        reviewed: {
          chainId: 84532,
          to: TARGET,
          value: "1",
          valueUSD: 0.000000000000002,
          displayValue: "0.000000000000000001 ETH",
          dataSelector: null,
          proposedBy: "behavior_test",
        },
        submitted: null,
      },
    });
    expect(logs[0].reason).toContain("Switch your wallet to Base Sepolia");
  });

  test("does not call the wallet when reviewed value breaches spend policy", async () => {
    const requests: PreparedWalletSendRequest["request"][] = [];
    const logs: SecurityLogEntry[] = [];

    let message = "";
    try {
      await sendReviewedWalletTransaction({
        approval: {
          chainId: 84532,
          to: TARGET,
          value: "50000000000000000",
          proposedBy: "behavior_test",
          riskLevel: "medium",
        },
        connectedChainId: 84532,
        forceTestnet: true,
        policy: policy({ maxPerTransactionUSD: 10 }),
        sendTransaction: async (request) => {
          requests.push(request);
          return HASH;
        },
        onSecurityLog: (entry) => logs.push(entry),
        approvedReason: "User approved via TransactionApproval modal",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("per-transaction limit of $10");
    expect(requests).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "limit_hit",
      chainId: 84532,
      valueUSD: 100,
      riskLevel: "medium",
    });
  });

  test("uses decoded ERC-20 value for policy instead of treating calldata as $0", async () => {
    const requests: PreparedWalletSendRequest["request"][] = [];
    const logs: SecurityLogEntry[] = [];
    const usdc = USDC_BY_CHAIN[84532];
    const transferData = encodeErc20Transfer(TARGET, 1_000_000_000_000n);

    const analysis = analyzeWalletTransaction({
      chainId: 84532,
      to: usdc,
      value: "0",
      data: transferData,
    });
    expect(analysis.displayValue).toBe("Transfer 1000000 USDC");
    expect(analysis.valueUSD).toBe(1_000_000);
    expect(analysis.assetChanges).toEqual([{
      asset: "USDC",
      direction: "transfer",
      amount: "1000000",
      usdValue: 1_000_000,
      recipient: TARGET,
      summary: "Transfer 1000000 USDC",
    }]);

    let message = "";
    try {
      await sendReviewedWalletTransaction({
        approval: {
          chainId: 84532,
          to: usdc,
          value: "0",
          data: transferData,
          proposedBy: "behavior_test",
          riskLevel: "high",
        },
        connectedChainId: 84532,
        forceTestnet: true,
        policy: policy({ maxPerTransactionUSD: 100_000 }),
        sendTransaction: async (request) => {
          requests.push(request);
          return HASH;
        },
        onSecurityLog: (entry) => logs.push(entry),
        approvedReason: "User approved via TransactionApproval modal",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("per-transaction limit of $100000");
    expect(requests).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "limit_hit",
      chainId: 84532,
      to: usdc,
      valueUSD: 1_000_000,
      riskLevel: "high",
    });
  });

  test("blocks mainnet sends when the app is in forced testnet mode", () => {
    const usdc = USDC_BY_CHAIN[8453];
    const approveData = encodeErc20Approve(SPENDER, 1_000_000n);

    expect(() => prepareWalletTransactionSend({
      chainId: 8453,
      connectedChainId: 8453,
      to: usdc,
      value: "0",
      data: approveData,
      forceTestnet: true,
      policy: policy(),
    })).toThrow("Mainnet is disabled");
  });

  test("records explicit audit actions for mainnet and unavailable-wallet blocks", async () => {
    const logs: SecurityLogEntry[] = [];

    await expect(sendReviewedWalletTransaction({
      approval: {
        chainId: 8453,
        to: TARGET,
        value: "1",
        proposedBy: "behavior_test",
        riskLevel: "high",
      },
      connectedChainId: 8453,
      forceTestnet: true,
      policy: policy(),
      sendTransaction: async () => HASH,
      onSecurityLog: (entry) => logs.push(entry),
      approvedReason: "User approved via TransactionApproval modal",
    })).rejects.toThrow("Mainnet is disabled");

    await expect(sendReviewedWalletTransaction({
      approval: {
        chainId: 84532,
        to: TARGET,
        value: "1",
        proposedBy: "behavior_test",
        riskLevel: "medium",
      },
      connectedChainId: null,
      forceTestnet: true,
      policy: policy(),
      sendTransaction: async () => HASH,
      onSecurityLog: (entry) => logs.push(entry),
      approvedReason: "User approved via TransactionApproval modal",
    })).rejects.toThrow("Wallet chain is unavailable");

    expect(logs.map((entry) => entry.action)).toEqual(["mainnet_blocked", "wallet_unavailable"]);
  });

  test("increments swap quota only after a reviewed swap transaction is submitted", async () => {
    let swapSubmissions = 0;
    const swapData = `0x38ed1739${"0".repeat(64 * 5)}`;

    const result = await sendReviewedWalletTransaction({
      approval: {
        chainId: 84532,
        to: TARGET,
        value: "0",
        data: swapData,
        proposedBy: "behavior_test",
        riskLevel: "medium",
      },
      connectedChainId: 84532,
      forceTestnet: true,
      policy: policy({ sessionSwapCount: 4, lastSwapReset: Date.now() }),
      sendTransaction: async () => HASH,
      onSwapSubmitted: () => {
        swapSubmissions += 1;
      },
      approvedReason: "User approved via TransactionApproval modal",
    });

    expect(result.analysis.isSwap).toBe(true);
    expect(swapSubmissions).toBe(1);
  });

  test("does not increment swap quota for ordinary reviewed transfers", async () => {
    let swapSubmissions = 0;

    const result = await sendReviewedWalletTransaction({
      approval: {
        chainId: 84532,
        to: TARGET,
        value: "1",
        proposedBy: "behavior_test",
        riskLevel: "low",
      },
      connectedChainId: 84532,
      forceTestnet: true,
      policy: policy({ sessionSwapCount: 4, lastSwapReset: Date.now() }),
      sendTransaction: async () => HASH,
      onSwapSubmitted: () => {
        swapSubmissions += 1;
      },
      approvedReason: "User approved via TransactionApproval modal",
    });

    expect(result.analysis.isSwap).toBe(false);
    expect(swapSubmissions).toBe(0);
  });
});
