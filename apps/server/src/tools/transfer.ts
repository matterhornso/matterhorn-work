/**
 * Transfer builder — same-chain ERC-20 transfer or native ETH send.
 * Builds calldata only; client signs and broadcasts.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { normalizeAddressField, validateNativeOrKnownToken, validatePositiveUint256 } from "./tx-security.js";

const erc20Abi = [
  "function transfer(address to, uint256 amount) external returns (bool)",
] as const;

export function buildTransferTx({
  chainId,
  token,
  to,
  amount,
}: {
  chainId: number;
  token: "native" | Address;
  to: Address;
  amount: string;
}): { success: true; to: Address; data?: Hex; value: string } | { success: false; error: string } {
  const recipient = normalizeAddressField("recipient", to);
  if (!recipient.success) return recipient;
  const rawAmount = validatePositiveUint256("amount", amount);
  if (!rawAmount.success) return rawAmount;
  const safeToken = validateNativeOrKnownToken(chainId, token);
  if (!safeToken.success) return safeToken;

  if (safeToken.value === "native") {
    return { success: true, to: recipient.value, value: rawAmount.value };
  }
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient.value, BigInt(rawAmount.value)],
    });
    return { success: true, to: safeToken.value, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Transfer encoding failed" };
  }
}
