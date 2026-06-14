import { describe, expect, test } from "bun:test";
import { buildRevokeApprovalTx } from "./approval-manager.js";
import { buildAaveBorrowTx, buildAaveSupplyTx } from "./aave-v3.js";
import { buildBridgeDepositTx } from "./bridge.js";
import { buildCowOrder, submitCowOrder } from "./cow-swap.js";
import { buildApproveTx, buildBatchPlan, createSwapApproveSupplyBatch } from "./defi-batcher.js";
import { signAndSubmitOrder, buildOrder } from "./hyperliquid-execution.js";
import { buildTransferTx } from "./transfer.js";

const BASE = 8453;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const USER = "0x1111111111111111111111111111111111111111";
const ATTACKER_TOKEN = "0x2222222222222222222222222222222222222222";
const AAVE_POOL = "0xA238dD80c2594fEcF6fE2d89C5E3BC3e6b01F994";

describe("transaction security guardrails", () => {
  test("transfer builder rejects arbitrary token contracts and malformed values", () => {
    expect(buildTransferTx({ chainId: BASE, token: ATTACKER_TOKEN, to: USER, amount: "1" })).toEqual({
      success: false,
      error: "token is not in the chain token registry",
    });
    expect(buildTransferTx({ chainId: BASE, token: USDC, to: "0x0" as `0x${string}`, amount: "1" })).toEqual({
      success: false,
      error: "recipient must be a valid EVM address",
    });
    expect(buildTransferTx({ chainId: BASE, token: USDC, to: USER, amount: "0" })).toEqual({
      success: false,
      error: "amount must be greater than zero",
    });
  });

  test("aave builders only encode known assets and valid interest modes", () => {
    expect(buildAaveSupplyTx({ chainId: BASE, asset: ATTACKER_TOKEN, amount: "1", onBehalfOf: USER })).toEqual({
      success: false,
      error: "asset is not in the chain token registry",
    });
    expect(buildAaveBorrowTx({ chainId: BASE, asset: USDC, amount: "1", interestRateMode: 99, onBehalfOf: USER })).toEqual({
      success: false,
      error: "interestRateMode must be 1 (stable) or 2 (variable)",
    });
  });

  test("bridge builder rejects unregistered bridge tokens and bad timestamps", () => {
    expect(buildBridgeDepositTx({
      chainId: BASE,
      destinationChainId: BASE,
      inputToken: ATTACKER_TOKEN,
      outputToken: USDC,
      inputAmount: "1",
      outputAmount: "1",
      recipient: USER,
      quoteTimestamp: 1,
    })).toEqual({ success: false, error: "inputToken is not in the chain token registry" });

    expect(buildBridgeDepositTx({
      chainId: BASE,
      destinationChainId: BASE,
      inputToken: USDC,
      outputToken: WETH,
      inputAmount: "1",
      outputAmount: "1",
      recipient: USER,
      quoteTimestamp: 0,
    })).toEqual({ success: false, error: "quoteTimestamp must be a positive unix timestamp" });
  });

  test("cow order helpers reject bad owners and signatures", async () => {
    expect(buildCowOrder({
      owner: "0x0" as `0x${string}`,
      quote: {
        sellToken: USDC,
        buyToken: WETH,
        receiver: USER,
        sellAmount: "1",
        buyAmount: "1",
        feeAmount: "0",
        validTo: 1,
        appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      },
    })).toEqual({ success: false, error: "owner must be a valid EVM address" });

    expect(await submitCowOrder({ chainId: BASE, order: {}, signature: "0x1234" })).toEqual({
      success: false,
      error: "signature is too short",
    });
  });

  test("approval and batch helpers reject arbitrary spender/token injection", async () => {
    expect(buildRevokeApprovalTx({ tokenAddress: "0x0" as `0x${string}`, spender: USER as `0x${string}` })).toEqual({
      success: false,
      error: "tokenAddress must be a valid EVM address",
    });

    expect(() => buildApproveTx({
      chainId: BASE,
      tokenAddress: ATTACKER_TOKEN as `0x${string}`,
      spender: AAVE_POOL as `0x${string}`,
      amount: "1",
    })).toThrow("tokenAddress is not in the chain token registry");

    expect(() => buildApproveTx({
      chainId: BASE,
      tokenAddress: USDC as `0x${string}`,
      spender: "0x0" as `0x${string}`,
      amount: "1",
    })).toThrow("spender must be a valid EVM address");

    await expect(buildBatchPlan({
      chainId: BASE,
      from: USER as `0x${string}`,
      steps: [{
        id: "bad",
        type: "custom",
        description: "bad calldata",
        to: AAVE_POOL as `0x${string}`,
        data: "not-hex" as `0x${string}`,
      }],
    })).resolves.toEqual({ success: false, error: "Step bad data must be hex encoded" });

    const swapTx = {
      action: "swap",
      chainId: BASE,
      summary: "Swap",
      tx: { to: AAVE_POOL, data: "0x", value: "0", gas: "21000", gasPrice: "1" },
      needsApproval: true,
      protocol: "1inch",
    } as Awaited<ReturnType<typeof import("./swap-builder.js").buildSwap>>;

    expect(() => createSwapApproveSupplyBatch({
      chainId: BASE,
      from: USER as `0x${string}`,
      swapTx,
      tokenToApprove: ATTACKER_TOKEN as `0x${string}`,
      spender: AAVE_POOL as `0x${string}`,
      supplyTx: { to: AAVE_POOL as `0x${string}`, data: "0x", description: "Supply" },
    })).toThrow("tokenToApprove is not in the chain token registry");

    expect(() => createSwapApproveSupplyBatch({
      chainId: BASE,
      from: USER as `0x${string}`,
      swapTx,
      tokenToApprove: USDC as `0x${string}`,
      spender: USER as `0x${string}`,
      supplyTx: { to: AAVE_POOL as `0x${string}`, data: "0x", description: "Supply" },
    })).toThrow("spender must be the whitelisted Aave V3 pool");
  });

  test("legacy Hyperliquid server-side signing fails closed", async () => {
    await expect(signAndSubmitOrder({
      order: buildOrder({ asset: "ETH", isBuy: true, sz: 0.01 }),
      isTestnet: true,
    })).rejects.toThrow("Server-side Hyperliquid signing is disabled");
  });
});
