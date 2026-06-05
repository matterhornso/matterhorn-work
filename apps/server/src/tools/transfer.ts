/**
 * Transfer builder — same-chain ERC-20 transfer or native ETH send.
 * Builds calldata only; client signs and broadcasts.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";

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
  if (token === "native") {
    return { success: true, to, value: amount };
  }
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, BigInt(amount)],
    });
    return { success: true, to: token, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Transfer encoding failed" };
  }
}
