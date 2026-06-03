/**
 * Calldata Decoder.
 * Uses 4byte.directory to look up function signatures and decode common params.
 */

import type { Hex } from "viem";

const FOURBYTE_API = "https://www.4byte.directory/api/v1/signatures";

/**
 * Look up a function signature by its 4-byte selector.
 */
export async function decodeSelector(selector: Hex) {
  const clean = selector.toLowerCase().replace(/^0x/, "");
  const short = clean.slice(0, 8);

  try {
    const res = await fetch(`${FOURBYTE_API}/?hex_signature=0x${short}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

    const json = (await res.json()) as { results: { text_signature: string }[] };
    const signatures = json.results.map((r) => r.text_signature);

    return {
      success: true,
      selector: short,
      signatures,
      bestGuess: signatures[0] ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "4byte lookup failed",
    };
  }
}

/**
 * Decode a full transaction calldata:
 * - Extract the 4-byte selector
 * - Look it up on 4byte
 * - Return the remaining params (raw hex)
 */
export async function decodeCalldata(data: Hex) {
  const clean = data.toLowerCase().replace(/^0x/, "");
  if (clean.length < 8) return { success: false, error: "Calldata too short" };

  const selector = `0x${clean.slice(0, 8)}` as Hex;
  const params = `0x${clean.slice(8)}`;

  const lookup = await decodeSelector(selector);

  if (!lookup.success) {
    return {
      success: true,
      selector,
      signature: null,
      params,
      raw: data,
      note: "Unknown function — could not decode via 4byte.directory",
    };
  }

  return {
    success: true,
    selector,
    signature: lookup.bestGuess,
    signatures: lookup.signatures,
    params,
    raw: data,
  };
}

/**
 * Known function signatures for common DeFi protocols (cached fallback).
 */
const KNOWN_SIGNATURES: Record<string, string> = {
  "0x095ea7b3": "approve(address spender, uint256 amount)",
  "0xa9059cbb": "transfer(address to, uint256 amount)",
  "0x23b872dd": "transferFrom(address from, address to, uint256 amount)",
  "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x8803dbee": "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
  "0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "0x18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
  "0xe8e33700": "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
  "0xf305d719": "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0xbaa2abde": "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
  "0x02751cec": "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0xd0e30db0": "deposit()",
  "0x2e1a7d4d": "withdraw(uint256)",
};

/**
 * Fast local decode — no network call.
 */
export function decodeCalldataFast(data: Hex) {
  const clean = data.toLowerCase().replace(/^0x/, "");
  const selector = `0x${clean.slice(0, 8)}`;
  const params = `0x${clean.slice(8)}`;

  return {
    selector,
    signature: KNOWN_SIGNATURES[selector] ?? null,
    params,
    raw: data,
  };
}
