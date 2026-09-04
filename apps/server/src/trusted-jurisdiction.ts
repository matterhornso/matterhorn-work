import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const MATTERHORN_EDGE_JURISDICTION_HEADER = "x-matterhorn-edge-jurisdiction";
export const MATTERHORN_EDGE_JURISDICTION_VERSION = "matterhorn.edge-jurisdiction.v1" as const;
const MATTERHORN_EDGE_JURISDICTION_TTL_MS = 60_000;
const MATTERHORN_EDGE_JURISDICTION_CLOCK_SKEW_MS = 5_000;

type EdgeJurisdictionPayload = {
  version: typeof MATTERHORN_EDGE_JURISDICTION_VERSION;
  source: "vercel_ip_country";
  country: string;
  method: string;
  path: string;
  clientIpHash: string;
  requestIdHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type MatterhornTrustedJurisdiction = {
  version: typeof MATTERHORN_EDGE_JURISDICTION_VERSION;
  source: "vercel_ip_country";
  country: string;
  observedAt: string;
  expiresAt: string;
  /** Content-free digest bound into consent, guarded runs, and capabilities. */
  evidenceHash: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function closedPayload(value: unknown): value is EdgeJurisdictionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "clientIpHash",
    "country",
    "expiresAtMs",
    "issuedAtMs",
    "method",
    "path",
    "requestIdHash",
    "source",
    "version",
  ];
  if (Object.keys(record).sort().join("\n") !== expectedKeys.sort().join("\n")) return false;
  return record.version === MATTERHORN_EDGE_JURISDICTION_VERSION
    && record.source === "vercel_ip_country"
    && typeof record.country === "string"
    && /^[A-Z]{2}$/.test(record.country)
    && typeof record.method === "string"
    && /^[A-Z]+$/.test(record.method)
    && typeof record.path === "string"
    && record.path.startsWith("/")
    && !record.path.startsWith("//")
    && record.path.length <= 2_048
    && typeof record.clientIpHash === "string"
    && /^[a-f0-9]{64}$/.test(record.clientIpHash)
    && typeof record.requestIdHash === "string"
    && /^[a-f0-9]{64}$/.test(record.requestIdHash)
    && Number.isSafeInteger(record.issuedAtMs)
    && Number.isSafeInteger(record.expiresAtMs);
}

function parsePayload(encoded: string): EdgeJurisdictionPayload | null {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.byteLength === 0 || decoded.byteLength > 2_048) return null;
    const canonical = decoded.toString("base64url");
    if (canonical !== encoded) return null;
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    return closedPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve only the short-lived jurisdiction proof created by Matterhorn's
 * Vercel same-origin proxy. Raw country headers and direct backend requests
 * have no authority. Invalid, stale, cross-route, or cross-peer proofs fail
 * closed by returning no trusted jurisdiction.
 */
export function resolveTrustedRequestJurisdiction(
  request: Request,
  trustedProxySecret: string | undefined,
  now = new Date(),
): MatterhornTrustedJurisdiction | null {
  const secret = trustedProxySecret?.trim() ?? "";
  const presentedProxySecret = request.headers.get("x-matterhorn-proxy-secret")?.trim() ?? "";
  const token = request.headers.get(MATTERHORN_EDGE_JURISDICTION_HEADER)?.trim() ?? "";
  if (secret.length < 16 || !presentedProxySecret || !tokenEqual(secret, presentedProxySecret) || !token) return null;

  const pieces = token.split(".");
  if (pieces.length !== 2) return null;
  const [encoded, signature] = pieces;
  if (!encoded || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!tokenEqual(expected, signature)) return null;
  const payload = parsePayload(encoded);
  if (!payload) return null;

  const nowMs = now.getTime();
  if (
    !Number.isFinite(nowMs)
    || payload.issuedAtMs > nowMs + MATTERHORN_EDGE_JURISDICTION_CLOCK_SKEW_MS
    || payload.expiresAtMs <= nowMs
    || payload.expiresAtMs - payload.issuedAtMs !== MATTERHORN_EDGE_JURISDICTION_TTL_MS
  ) return null;

  const requestUrl = new URL(request.url);
  const clientIp = request.headers.get("x-matterhorn-client-ip")?.trim() ?? "";
  if (
    payload.method !== request.method.toUpperCase()
    || payload.path !== requestUrl.pathname
    || !isIP(clientIp)
    || !tokenEqual(payload.clientIpHash, sha256(clientIp))
  ) return null;

  return {
    version: MATTERHORN_EDGE_JURISDICTION_VERSION,
    source: payload.source,
    country: payload.country,
    observedAt: new Date(payload.issuedAtMs).toISOString(),
    expiresAt: new Date(payload.expiresAtMs).toISOString(),
    // Deliberately stable across the preflight and submission HTTP requests
    // from the same edge-observed peer. Transport tokens themselves are
    // request-bound and short-lived; this hash binds consent/run policy to a
    // country and peer without retaining or exposing the raw IP.
    evidenceHash: sha256([
      MATTERHORN_EDGE_JURISDICTION_VERSION,
      payload.source,
      payload.country,
      payload.clientIpHash,
    ].join("\u0000")),
  };
}
