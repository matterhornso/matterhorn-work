# ERC-20 and Smart Contract Interaction

How to encode contract calls for wagmi/viem. Use these patterns in the wallet store and TX pipeline.

## ERC-20 Transfer

USDC uses the standard ERC-20 `transfer(address to, uint256 amount)` function.

```typescript
import { encodeFunctionData, parseUnits } from "viem";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia
const USDC_DECIMALS = 6;

function encodeUsdcTransfer(to: `0x${string}`, amountDisplay: string): `0x${string}` {
  const amount = parseUnits(amountDisplay, USDC_DECIMALS);
  return encodeFunctionData({
    abi: [{
      type: "function",
      name: "transfer",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    }],
    functionName: "transfer",
    args: [to, amount],
  });
}

// Usage:
// sendTransaction(USDC_ADDRESS, "0", encodeUsdcTransfer("0xRecipient...", "10.00"))
// value is "0" because this is a token transfer, not ETH
```

## ETH Transfer

Plain ETH transfer — no data needed:

```typescript
import { parseEther } from "viem";

// Send 0.1 ETH
sendTransaction("0xRecipientAddress", parseEther("0.1").toString())
// data is undefined/empty
```

## Reading Token Balance

```typescript
import { readContract } from "@wagmi/core";
import { wagmiConfig } from "./config"; // or wherever wagmi config lives

async function getUsdcBalance(address: `0x${string}`): Promise<string> {
  const balance = await readContract(wagmiConfig, {
    address: USDC_ADDRESS,
    abi: [{
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    }],
    functionName: "balanceOf",
    args: [address],
  });
  return formatUnits(balance, USDC_DECIMALS);
}
```

## Reading ETH Balance

```typescript
import { getBalance } from "@wagmi/core";

async function getEthBalance(address: `0x${string}`): Promise<string> {
  const balance = await getBalance(wagmiConfig, { address });
  return formatEther(balance);
}
```

## Common viem Utilities

```typescript
import { parseUnits, formatUnits, parseEther, formatEther, encodeFunctionData, decodeEventLog } from "viem";

// Parse human-readable amounts to on-chain values
parseUnits("1.5", 18);   // 1.5 ETH → 1500000000000000000n
parseUnits("100.00", 6); // 100 USDC → 100000000n

// Format on-chain values for display
formatUnits(1500000000000000000n, 18); // → "1.5"
formatUnits(100000000n, 6);             // → "100.0"

// Shorthand for 18 decimals
parseEther("1.5");    // → 1500000000000000000n
formatEther(value);    // → "1.5"
```

## Transaction Lifecycle

```typescript
import { sendTransaction, waitForTransactionReceipt } from "@wagmi/core";

// 1. Send TX
const hash = await sendTransaction(wagmiConfig, {
  to: recipientAddress,
  value: parseEther("0.01"),      // for ETH transfers
  data: encodedCallData,           // for contract interactions
});

// 2. Wait for confirmation
const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

// 3. Check status
if (receipt.status === "success") {
  console.log("TX confirmed:", hash);
} else {
  console.log("TX failed:", hash);
}
```

## Gas Estimation

```typescript
import { estimateGas } from "@wagmi/core";

const gas = await estimateGas(wagmiConfig, {
  to: USDC_ADDRESS,
  data: encodedCallData,
});
// gas is a bigint — the estimated gas units needed
```

## Contract Addresses Reference

| Chain | USDC | WETH |
|-------|------|------|
| Base Sepolia (84532) | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | 0x4200000000000000000000000000000000000006 |
| Base (8453) | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | 0x4200000000000000000000000000000000000006 |

## Pitfalls

- ERC-20 transfers: `to` = USDC contract address, `value` = "0", `data` = encoded transfer call. NOT `to` = recipient with `value` = amount (that would send ETH, not USDC).
- USDC uses 6 decimals, not 18. `parseUnits("1.0", 6)` = 1000000n, not 1000000000000000000n.
- `@wagmi/core` functions (readContract, getBalance, sendTransaction) need the wagmi config, not just the chain.
- `encodeFunctionData` returns `0x${string}`, ready for the `data` field.
- Do NOT use `wagmi` hooks for contract reads in non-React code (stores, services). Use `@wagmi/core` instead.
