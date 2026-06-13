import type { Address, Hex } from "viem";
import { getAddress, isAddress, isHex } from "viem";
import { tokensForChain, WHITELISTED_PROTOCOLS } from "../infra/token-registry.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UINT256_MAX = (1n << 256n) - 1n;

export type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

export function normalizeAddressField(name: string, value: string): ValidationResult<Address> {
  if (!isAddress(value)) return { success: false, error: `${name} must be a valid EVM address` };
  const normalized = getAddress(value);
  if (normalized.toLowerCase() === ZERO_ADDRESS) {
    return { success: false, error: `${name} cannot be the zero address` };
  }
  return { success: true, value: normalized };
}

export function validatePositiveUint256(name: string, value: string): ValidationResult<string> {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return { success: false, error: `${name} must be a raw positive integer amount` };
  }
  const amount = BigInt(value);
  if (amount <= 0n) return { success: false, error: `${name} must be greater than zero` };
  if (amount > UINT256_MAX) return { success: false, error: `${name} exceeds uint256 max` };
  return { success: true, value: amount.toString() };
}

export function validateKnownToken(
  chainId: number,
  token: string,
  name = "token",
): ValidationResult<Address> {
  const address = normalizeAddressField(name, token);
  if (!address.success) return address;

  const registry = tokensForChain(chainId);
  if (!registry) return { success: false, error: `Chain ${chainId} is not supported` };

  const lower = address.value.toLowerCase();
  const known = Object.values(registry).some((meta) => meta.address.toLowerCase() === lower);
  if (!known) return { success: false, error: `${name} is not in the chain token registry` };

  return address;
}

export function validateNativeOrKnownToken(
  chainId: number,
  token: "native" | string,
): ValidationResult<"native" | Address> {
  if (token === "native") return { success: true, value: "native" };
  return validateKnownToken(chainId, token, "token");
}

export function validateWhitelistedProtocol(
  chainId: number,
  protocolKey: string,
): ValidationResult<Address> {
  const address = WHITELISTED_PROTOCOLS[chainId]?.[protocolKey];
  if (!address) return { success: false, error: `${protocolKey} is not supported on chain ${chainId}` };
  return { success: true, value: getAddress(address) };
}

export function validateSignatureHex(signature: string): ValidationResult<Hex> {
  if (!isHex(signature)) return { success: false, error: "signature must be hex encoded" };
  if (signature.length < 132) return { success: false, error: "signature is too short" };
  return { success: true, value: signature };
}
