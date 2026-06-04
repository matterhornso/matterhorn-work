/**
 * Across Protocol bridge integration.
 * Quotes via Across API; builds depositV2 calldata.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { WHITELISTED_PROTOCOLS } from "../infra/token-registry.js";

const ACROSS_API = "https://across.to/api";

const spokePoolAbi = [
  "function depositV2(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes memory message) external payable"
] as const;

export async function getBridgeQuote({
  originChainId,
  destinationChainId,
  originToken,
  amount,
  recipient,
}: {
  originChainId: number;
  destinationChainId: number;
  originToken: Address;
  amount: string;
  recipient: Address;
}): Promise<{ success: true; fee: string; time: string; receiveAmount: string; totalSent: string } | { success: false; error: string }> {
  try {
    const url = new URL(`${ACROSS_API}/suggested-fees`);
    url.searchParams.set("token", originToken);
    url.searchParams.set("inputAmount", amount);
    url.searchParams.set("originChainId", String(originChainId));
    url.searchParams.set("destinationChainId", String(destinationChainId));
    url.searchParams.set("recipient", recipient);
    url.searchParams.set("message", "0x");

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      return { success: false, error: `Across API HTTP ${res.status}: ${err}` };
    }
    const data = await res.json() as {
      totalRelayFee: { total: string; pct: string };
      timestamp: number;
      estimatedFillTimeSec: number;
      outputAmount: string;
    };
    const fee = data.totalRelayFee.total;
    const feeFormatted = (Number(fee) / 1e18).toFixed(6);
    const timeMin = Math.ceil(data.estimatedFillTimeSec / 60);
    const receive = data.outputAmount;
    const total = (BigInt(amount) + BigInt(fee)).toString();
    return {
      success: true,
      fee: feeFormatted,
      time: `~${timeMin} min`,
      receiveAmount: receive,
      totalSent: total,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Bridge quote failed" };
  }
}

export function buildBridgeDepositTx({
  chainId,
  destinationChainId,
  inputToken,
  outputToken,
  inputAmount,
  outputAmount,
  recipient,
  quoteTimestamp,
}: {
  chainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  inputAmount: string;
  outputAmount: string;
  recipient: Address;
  quoteTimestamp: number;
}): { success: true; to: Address; data: Hex; value: string } | { success: false; error: string } {
  const spokePool = WHITELISTED_PROTOCOLS[chainId]?.acrossSpokePool as Address | undefined;
  if (!spokePool) return { success: false, error: `Across not supported on chain ${chainId}` };
  try {
    const depositor = recipient; // self-deposit pattern
    const data = encodeFunctionData({
      abi: spokePoolAbi,
      functionName: "depositV2",
      args: [
        depositor,
        recipient,
        inputToken,
        outputToken,
        BigInt(inputAmount),
        BigInt(outputAmount),
        BigInt(destinationChainId),
        "0x0000000000000000000000000000000000000000", // no exclusive relayer
        quoteTimestamp,
        quoteTimestamp + 7200, // fill deadline 2h
        0, // no exclusivity
        "0x", // no message
      ],
    });
    return { success: true, to: spokePool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Deposit encoding failed" };
  }
}
