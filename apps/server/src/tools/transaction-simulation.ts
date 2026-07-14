/**
 * Transaction Simulation.
 * Uses viem eth_call to verify a raw tx won't revert before showing Approve.
 */

import { getClient } from "../infra/chain-client.js";
import type { Address, Hex } from "viem";

const SECRET_ASSIGNMENT_PATTERN = /\b((?:api[_-]?key|authorization|bearer|mnemonic|password|passphrase|private[_-]?key|raw[_-]?signature|secret|seed(?:\s+phrase)?|signed[_-]?payload|token|wallet[_-]?export)\s*[:=]\s*)(["']?)[^\s"',;}]+(\2)/gi;
const BEARER_PATTERN = /\b(bearer\s+)[a-z0-9._~+/=-]+/gi;
const PRIVATE_KEY_PATTERN = /\b0x[a-f0-9]{64}\b/gi;
const LONG_HEX_PATTERN = /\b0x[a-f0-9]{96,}\b/gi;

export function sanitizeTransactionSimulationError(error: unknown, fallback = "Simulation failed."): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (/^Unsupported chainId: \d+$/i.test(trimmed)) return trimmed;
  if (/insufficient funds/i.test(trimmed)) return "Simulation failed: insufficient funds for gas or value.";
  if (/execution reverted|revert(ed)?\b/i.test(trimmed)) return "Simulation failed: the transaction would revert.";
  if (/timeout|network|fetch failed|econn|enotfound|socket|rpc provider/i.test(trimmed)) {
    return "Simulation failed: RPC provider unavailable.";
  }

  const containsUnsafeDetail =
    /request|response|headers|body|stack|viem@|private[_\s-]?key|seed phrase|mnemonic|wallet export|api[_\s-]?secret|raw signature|signed payload|authorization|bearer/i.test(trimmed) ||
    PRIVATE_KEY_PATTERN.test(trimmed) ||
    LONG_HEX_PATTERN.test(trimmed);

  if (containsUnsafeDetail) return fallback;

  const redacted = trimmed
    .replace(SECRET_ASSIGNMENT_PATTERN, `$1[redacted]`)
    .replace(BEARER_PATTERN, "$1[redacted]")
    .replace(PRIVATE_KEY_PATTERN, "[redacted]")
    .replace(LONG_HEX_PATTERN, "[redacted]");

  return redacted.length > 220 ? `${redacted.slice(0, 217)}...` : redacted;
}

/**
 * Simulate a raw contract call (swap, bridge, etc.).
 * Returns { success: true } or { error: string }.
 */
export async function simulateTransaction({
  chainId,
  to,
  data,
  value = "0",
  from,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
}) {
  const client = getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    await client.call({
      to,
      data,
      value: BigInt(value),
      account: from,
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: sanitizeTransactionSimulationError(err, "Simulation failed before approval."),
    };
  }
}

/**
 * Estimate gas for a raw call.
 * Returns { gas: bigint } or { error: string }.
 */
export async function estimateGas({
  chainId,
  to,
  data,
  value = "0",
  from,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
}) {
  const client = getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const gas = await client.estimateGas({
      to,
      data,
      value: BigInt(value),
      account: from,
    });
    return { gas };
  } catch (err) {
    return {
      error: sanitizeTransactionSimulationError(err, "Gas estimation failed before approval."),
    };
  }
}
