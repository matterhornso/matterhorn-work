import { describe, expect, test } from "bun:test";
import {
  analyzeWalletTransaction,
  computeTxValueUSD,
  createWalletStore,
  decodeKnownTokenAction,
  approvalPolicyFromSafetyPolicy,
  evaluateWalletApprovalPolicy,
  evaluateWalletApprovalAgainstPolicy,
  formatTxValueEth,
  parseTxValueWei,
  prepareWalletTransactionSend,
  validateWalletTransactionBeforeSend,
  walletSafetyPolicyFromSnapshot,
} from "./wallet-store";
import { sanitizeGasEstimateError } from "../lib/gas-estimate";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RECIPIENT = "0x0000000000000000000000001111111111111111111111111111111111111111";
const SPENDER = "0x0000000000000000000000002222222222222222222222222222222222222222";
const UNKNOWN_TOKEN = "0x3333333333333333333333333333333333333333";

function word(hex: string): string {
  return hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function addressWord(address: string): string {
  return word(address);
}

function uintWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

describe("wallet transaction value parsing", () => {
  test("treats raw integer strings as wei, not decimal ETH", () => {
    expect(parseTxValueWei("1000000000000000000")).toBe(1_000_000_000_000_000_000n);
    expect(computeTxValueUSD("1000000000000000000")).toBe(2000);
  });

  test("supports hex wei and decimal ETH for manual requests", () => {
    expect(parseTxValueWei("0xde0b6b3a7640000")).toBe(1_000_000_000_000_000_000n);
    expect(parseTxValueWei("0.01")).toBe(10_000_000_000_000_000n);
    expect(computeTxValueUSD("0.01")).toBe(20);
  });

  test("formats reviewed transaction values as ETH instead of raw wei", () => {
    expect(formatTxValueEth("50000000000000000")).toBe("0.05");
    expect(formatTxValueEth("0xde0b6b3a7640000")).toBe("1");
    expect(formatTxValueEth("0.0100")).toBe("0.01");
  });

  test("rejects malformed values before wallet submission", () => {
    expect(() => parseTxValueWei("-1")).toThrow("Transaction value must be hex wei, raw wei, or decimal ETH");
    expect(() => parseTxValueWei("not-a-number")).toThrow("Transaction value must be hex wei, raw wei, or decimal ETH");
  });

  test("decodes known USDC transfer calldata into user-visible value", () => {
    const data = `0xa9059cbb${addressWord(RECIPIENT)}${uintWord(1_000_000_000_000n)}`;
    const action = decodeKnownTokenAction({ chainId: 8453, to: BASE_USDC, data });
    const analysis = analyzeWalletTransaction({ chainId: 8453, to: BASE_USDC, value: "0", data });

    expect(action?.kind).toBe("transfer");
    expect(action?.amountFormatted).toBe("1000000");
    expect(action?.recipient).toBe("0x1111111111111111111111111111111111111111");
    expect(analysis.valueUSD).toBe(1_000_000);
    expect(analysis.displayValue).toBe("Transfer 1000000 USDC");
  });

  test("detects unlimited USDC approval as a review warning", () => {
    const maxUint = (2n ** 256n) - 1n;
    const data = `0x095ea7b3${addressWord(SPENDER)}${uintWord(maxUint)}`;
    const analysis = analyzeWalletTransaction({ chainId: 8453, to: BASE_USDC, value: "0", data });

    expect(analysis.tokenAction?.kind).toBe("approve");
    expect(analysis.tokenAction?.isUnlimitedApproval).toBe(true);
    expect(analysis.warnings.join(" ")).toContain("Unlimited USDC approval");
  });

  test("blocks approval when token value breaches spend policy", () => {
    const reasons = evaluateWalletApprovalPolicy({
      valueUSD: 1_000_000,
      maxPerTransactionUSD: 50,
      maxDailySpendUSD: 100,
      dailySpendUSD: 0,
      sessionSwapCount: 0,
      lastSwapReset: Date.now(),
      now: Date.now(),
    });

    expect(reasons.join(" ")).toContain("per-transaction limit");
    expect(reasons.join(" ")).toContain("daily limit");
  });

  test("fails closed when an ERC-20 action cannot be priced in USD", () => {
    const data = `0xa9059cbb${addressWord(RECIPIENT)}${uintWord(10n ** 18n)}`;
    const analysis = analyzeWalletTransaction({ chainId: 8453, to: UNKNOWN_TOKEN, value: "0", data });

    expect(analysis.valueUSD).toBe(0);
    expect(analysis.valueUSDIsKnown).toBe(false);
    expect(analysis.displayValue).toBe("Token value unavailable");
    expect(analysis.unpricedValueReason).toContain("cannot verify the USD value");
    expect(() => validateWalletTransactionBeforeSend({
      chainId: 8453,
      connectedChainId: 8453,
      to: UNKNOWN_TOKEN,
      value: "0",
      data,
      policy: {
        maxPerTransactionUSD: 1_000_000,
        maxDailySpendUSD: 1_000_000,
        dailySpendUSD: 0,
        sessionSwapCount: 0,
        lastSwapReset: Date.now(),
      },
    })).toThrow("cannot verify this transaction's USD value");
  });

  test("fails closed for token-input router swaps with no price evidence", () => {
    const analysis = analyzeWalletTransaction({
      chainId: 8453,
      to: RECIPIENT,
      value: "0",
      data: "0x3593564c",
    });

    expect(analysis.isSwap).toBe(true);
    expect(analysis.valueUSDIsKnown).toBe(false);
    expect(analysis.unpricedValueReason).toContain("token-input swap");
  });

  test("builds one versioned safety policy from the wallet snapshot", () => {
    const store = createWalletStore();
    store.setMaxPerTransactionUSD(25);
    store.setMaxDailySpendUSD(250);
    store.setMainnetEnabled(true);
    store.setPreferredNetwork(84532);
    store.setMaxSlippageBps(75);
    store.incrementDailySpendUSD(10);
    store.incrementSessionSwapCount();

    const policy = walletSafetyPolicyFromSnapshot(store.getSnapshot());

    expect(policy).toMatchObject({
      version: "matterhorn.wallet.safety-policy.v1",
      maxPerTransactionUSD: 25,
      maxDailySpendUSD: 250,
      dailySpendUSD: 10,
      sessionSwapCount: 1,
      mainnetEnabled: true,
      maxSlippageBps: 75,
      preferredNetwork: 84532,
    });
    expect(approvalPolicyFromSafetyPolicy(policy)).toMatchObject({
      maxPerTransactionUSD: 25,
      maxDailySpendUSD: 250,
      dailySpendUSD: 10,
      sessionSwapCount: 1,
    });
  });

  test("evaluates approvals against the shared safety policy object", () => {
    const store = createWalletStore();
    store.setMaxPerTransactionUSD(50);
    store.setMaxDailySpendUSD(100);
    store.incrementDailySpendUSD(75);

    const policy = walletSafetyPolicyFromSnapshot(store.getSnapshot());
    const reasons = evaluateWalletApprovalAgainstPolicy({
      valueUSD: 60,
      policy,
      now: Date.now(),
    });

    expect(reasons.join(" ")).toContain("per-transaction limit");
    expect(reasons.join(" ")).toContain("daily limit");
  });

  test("blocks approvals when the swap rate window is exhausted", () => {
    const now = Date.now();
    const reasons = evaluateWalletApprovalPolicy({
      valueUSD: 1,
      maxPerTransactionUSD: 100,
      maxDailySpendUSD: 100,
      dailySpendUSD: 0,
      sessionSwapCount: 5,
      lastSwapReset: now - 1000,
      isSwap: true,
      now,
    });

    expect(reasons).toContain("Swap rate limit reached (5/hour).");
  });

  test("does not spend swap rate quota on non-swap approvals", () => {
    const now = Date.now();
    const reasons = evaluateWalletApprovalPolicy({
      valueUSD: 1,
      maxPerTransactionUSD: 100,
      maxDailySpendUSD: 100,
      dailySpendUSD: 0,
      sessionSwapCount: 5,
      lastSwapReset: now - 1000,
      isSwap: false,
      now,
    });

    expect(reasons).not.toContain("Swap rate limit reached (5/hour).");
  });

  test("send validation hard-fails when the connected wallet is on the wrong chain", () => {
    expect(() =>
      validateWalletTransactionBeforeSend({
        chainId: 84532,
        connectedChainId: 8453,
        to: RECIPIENT,
        value: "0.01",
        forceTestnet: false,
        chainName: (id) => (id === 84532 ? "Base Sepolia" : id === 8453 ? "Base" : `chain ${id}`),
        policy: {
          maxPerTransactionUSD: 100,
          maxDailySpendUSD: 100,
          dailySpendUSD: 0,
          sessionSwapCount: 0,
          lastSwapReset: Date.now(),
        },
      }),
    ).toThrow("Switch your wallet to Base Sepolia. It is currently on Base.");
  });

  test("send preparation preserves the reviewed chain and normalized wallet payload", () => {
    const prepared = prepareWalletTransactionSend({
      chainId: 84532,
      connectedChainId: 84532,
      to: RECIPIENT,
      value: "0.05",
      data: "0x",
      forceTestnet: true,
      chainName: (id) => (id === 84532 ? "Base Sepolia" : `chain ${id}`),
      policy: {
        maxPerTransactionUSD: 200,
        maxDailySpendUSD: 200,
        dailySpendUSD: 0,
        sessionSwapCount: 0,
        lastSwapReset: Date.now(),
      },
    });

    expect(prepared.request).toEqual({
      chainId: 84532,
      to: RECIPIENT,
      value: 50_000_000_000_000_000n,
      data: "0x",
    });
    expect(prepared.analysis.displayValue).toBe("0.05 ETH");
    expect(prepared.analysis.valueUSD).toBe(100);
  });

  test("send preparation refuses to build a wallet payload on chain mismatch", () => {
    expect(() =>
      prepareWalletTransactionSend({
        chainId: 84532,
        connectedChainId: 8453,
        to: RECIPIENT,
        value: "0.05",
        forceTestnet: false,
        chainName: (id) => (id === 84532 ? "Base Sepolia" : id === 8453 ? "Base" : `chain ${id}`),
        policy: {
          maxPerTransactionUSD: 200,
          maxDailySpendUSD: 200,
          dailySpendUSD: 0,
          sessionSwapCount: 0,
          lastSwapReset: Date.now(),
        },
      }),
    ).toThrow("Switch your wallet to Base Sepolia. It is currently on Base.");
  });

  test("send validation hard-fails for mainnet when testnet mode is forced", () => {
    expect(() =>
      validateWalletTransactionBeforeSend({
        chainId: 8453,
        connectedChainId: 8453,
        to: RECIPIENT,
        value: "0.01",
        forceTestnet: true,
        policy: {
          maxPerTransactionUSD: 100,
          maxDailySpendUSD: 100,
          dailySpendUSD: 0,
          sessionSwapCount: 0,
          lastSwapReset: Date.now(),
        },
      }),
    ).toThrow("Mainnet is disabled");
  });

  test("mainnet is disabled by default in the wallet store", () => {
    const store = createWalletStore();
    expect(store.getSnapshot().mainnetEnabled).toBe(false);
    store.setMainnetEnabled(true);
    expect(store.getSnapshot().mainnetEnabled).toBe(true);
  });

  test("send validation blocks ERC-20 value that would otherwise look like a zero-ETH approval", () => {
    const data = `0xa9059cbb${addressWord(RECIPIENT)}${uintWord(1_000_000_000_000n)}`;

    expect(() =>
      validateWalletTransactionBeforeSend({
        chainId: 8453,
        connectedChainId: 8453,
        to: BASE_USDC,
        value: "0",
        data,
        forceTestnet: false,
        policy: {
          maxPerTransactionUSD: 50,
          maxDailySpendUSD: 100,
          dailySpendUSD: 0,
          sessionSwapCount: 0,
          lastSwapReset: Date.now(),
        },
      }),
    ).toThrow("per-transaction limit");
  });

  test("sanitizes gas errors before showing them in approval UI", () => {
    const raw = new Error(
      'execution reverted: {"body":{"method":"eth_estimateGas","params":["secret"]},"details":"viem@2.21.0"}',
    );

    const message = sanitizeGasEstimateError(raw);
    expect(message).toBe("Gas estimate failed because the transaction would revert.");
    expect(message).not.toContain("eth_estimateGas");
    expect(message).not.toContain("viem");
  });
});
