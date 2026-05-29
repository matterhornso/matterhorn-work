# USDC Transfer

## What this skill does
Send USDC to any address on Base or Base Sepolia. The agent prepares an ERC-20 transfer transaction and the user approves it in their wallet panel.

## Supported chains
- Base (8453)
- Base Sepolia (84532)

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base Sepolia | USDC | 0x036CbD53842c5426634e7949541eC2318f3dCF7e |
| Base | USDC | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |

## Decimals
USDC uses 6 decimals. To send 1 USDC, encode the amount as 1000000 (1 * 10^6).

## How to use

### Step 1: Get recipient and amount
Ask the user for the recipient address and the amount of USDC to send.

### Step 2: Calculate the raw amount
Convert the human-readable amount to the raw token amount:
- `rawAmount = amount * 10^6` (since USDC uses 6 decimals)
- Format the raw amount as a hex string

### Step 3: Encode the ERC-20 transfer call
The ERC-20 `transfer` function has the following ABI:
```
function transfer(address to, uint256 amount) returns (bool)
```

Encode the call using ethers.js or viem:
```typescript
// Using viem
import { encodeFunctionData, parseAbi } from "viem";
const data = encodeFunctionData({
  abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
  functionName: "transfer",
  args: [recipientAddress, rawAmount],
});
```

### Step 4: Call wallet_sendTransaction
Use the wallet MCP tool with these parameters:
- **to**: The USDC contract address for the current chain
- **data**: The encoded transfer call data
- **value**: "0x0" (no ETH value, this is a token transfer)

### Step 5: Report the result
The user will approve or reject the transaction in their wallet panel. Report the transaction hash to the user after confirmation.

## Gas considerations
- USDC transfers typically cost ~40,000-60,000 gas
- Ensure the wallet has enough ETH to cover gas fees
- On Base, gas is cheap; on Base Sepolia, use the faucet for test ETH

## Example
```
User: "Send 10 USDC to 0xAbC123... on Base Sepolia"
Agent calculates: 10 * 10^6 = 10000000
Agent encodes: transfer("0xAbC123...", 10000000) 
Agent calls: wallet_sendTransaction({ to: "0x036CbD53842c5426634e7949541eC2318f3dCF7e", value: "0x0", data: "0xa9059cbb..." })
User approves in wallet panel
Agent reports: "Sent 10 USDC to 0xAbC123... TX hash: 0x..."
```
