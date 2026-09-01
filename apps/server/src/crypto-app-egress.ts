import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type MatterhornResolvedAdapterEndpoint = {
  endpoint: URL;
  hostname: string;
  approvedAddresses: string[];
};

export type MatterhornAdapterDnsResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

function publicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(a === 0
    || a === 10
    || a === 100 && b >= 64 && b <= 127
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 0
    || a === 192 && b === 2
    || a === 192 && b === 168
    || a === 198 && (b === 18 || b === 19)
    || a === 198 && b === 51
    || a === 203 && b === 0
    || a >= 224);
}

export function isPublicCryptoAdapterAddress(address: string): boolean {
  // Initial hosted transport is IPv4-pinned. Rejecting literal/resolved IPv6
  // is intentionally conservative until the egress connector can pin and
  // verify IPv6 remote addresses without normalization ambiguity.
  return isIP(address) === 4 && publicIpv4(address);
}

export function isPublicHttpsCryptoAdapterEndpoint(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname
      || hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".home.arpa")
      || isIP(hostname.replace(/^\[|\]$/g, "")) !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

export async function resolvePublicCryptoAdapterEndpoint(
  value: string,
  resolver: MatterhornAdapterDnsResolver = async (hostname) => lookup(hostname, { all: true, verbatim: true }),
): Promise<MatterhornResolvedAdapterEndpoint> {
  if (!isPublicHttpsCryptoAdapterEndpoint(value)) throw new Error("crypto_app_endpoint_not_public_https");
  const endpoint = new URL(value);
  const resolved = await resolver(endpoint.hostname);
  const addresses = [...new Set(resolved.map((item) => item.address))];
  if (addresses.length === 0 || addresses.some((address) => !isPublicCryptoAdapterAddress(address))) {
    throw new Error("crypto_app_endpoint_address_not_public");
  }
  return { endpoint, hostname: endpoint.hostname, approvedAddresses: addresses };
}

export function assertCryptoAdapterConnectedAddress(
  approvedAddresses: readonly string[],
  connectedAddress: string,
): void {
  if (!isPublicCryptoAdapterAddress(connectedAddress) || !approvedAddresses.includes(connectedAddress)) {
    throw new Error("crypto_app_connected_address_mismatch");
  }
}
