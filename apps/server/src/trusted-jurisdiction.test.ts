import { describe, expect, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import {
  MATTERHORN_EDGE_JURISDICTION_HEADER,
  resolveTrustedRequestJurisdiction,
} from "./trusted-jurisdiction.js";

const SECRET = "trusted-jurisdiction-test-secret";
const NOW_MS = Date.parse("2026-09-04T18:00:00.000Z");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function attestation(overrides: Record<string, unknown> = {}): string {
  const payload = {
    version: "matterhorn.edge-jurisdiction.v2",
    source: "vercel_ip_country",
    country: "GB",
    region: "ENG",
    method: "POST",
    path: "/workspace/ws_1/sessions/ses_1/messages",
    clientIpHash: sha256("203.0.113.9"),
    requestIdHash: sha256("iad1::matterhorn-request"),
    issuedAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 60_000,
    ...overrides,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function request(token = attestation(), overrides: Record<string, string> = {}): Request {
  return new Request("https://control.example.com/workspace/ws_1/sessions/ses_1/messages", {
    method: "POST",
    headers: {
      "x-matterhorn-proxy-secret": SECRET,
      "x-matterhorn-client-ip": "203.0.113.9",
      [MATTERHORN_EDGE_JURISDICTION_HEADER]: token,
      ...overrides,
    },
  });
}

describe("trusted edge jurisdiction", () => {
  test("accepts an exact short-lived same-origin proxy proof without retaining an IP", () => {
    const result = resolveTrustedRequestJurisdiction(request(), SECRET, new Date(NOW_MS + 1_000));
    expect(result).toEqual({
      version: "matterhorn.edge-jurisdiction.v2",
      source: "vercel_ip_country",
      country: "GB",
      region: "ENG",
      observedAt: "2026-09-04T18:00:00.000Z",
      expiresAt: "2026-09-04T18:01:00.000Z",
      evidenceHash: sha256([
        "matterhorn.edge-jurisdiction.v2",
        "vercel_ip_country",
        "GB",
        "ENG",
        sha256("203.0.113.9"),
      ].join("\u0000")),
    });
    expect(JSON.stringify(result)).not.toContain("203.0.113.9");
  });

  test("rejects raw, forged, stale, future, overlong, and open payloads", () => {
    const cases = [
      request("", { "x-vercel-ip-country": "GB" }),
      request(`${attestation().slice(0, -1)}x`),
      request(attestation({ expiresAtMs: NOW_MS })),
      request(attestation({ issuedAtMs: NOW_MS + 6_001, expiresAtMs: NOW_MS + 66_001 })),
      request(attestation({ expiresAtMs: NOW_MS + 60_001 })),
      request(attestation({ attacker: true })),
      request(attestation({ country: "USA" })),
      request(attestation({ region: "ENGLAND" })),
    ];
    for (const candidate of cases) {
      expect(resolveTrustedRequestJurisdiction(candidate, SECRET, new Date(NOW_MS + 1_000))).toBeNull();
    }
  });

  test("rejects wrong proxy secrets, peers, methods, paths, and direct backend requests", () => {
    expect(resolveTrustedRequestJurisdiction(request(), "wrong-secret-value", new Date(NOW_MS + 1_000))).toBeNull();
    expect(resolveTrustedRequestJurisdiction(
      request(attestation(), { "x-matterhorn-client-ip": "203.0.113.10" }),
      SECRET,
      new Date(NOW_MS + 1_000),
    )).toBeNull();
    expect(resolveTrustedRequestJurisdiction(
      new Request("https://control.example.com/workspace/ws_1/sessions/ses_1/messages", {
        method: "GET",
        headers: request().headers,
      }),
      SECRET,
      new Date(NOW_MS + 1_000),
    )).toBeNull();
    expect(resolveTrustedRequestJurisdiction(
      new Request("https://control.example.com/workspace/ws_2/sessions/ses_1/messages", {
        method: "POST",
        headers: request().headers,
      }),
      SECRET,
      new Date(NOW_MS + 1_000),
    )).toBeNull();
    expect(resolveTrustedRequestJurisdiction(new Request(
      "https://control.example.com/workspace/ws_1/sessions/ses_1/messages",
      { method: "POST", headers: { "x-vercel-ip-country": "GB" } },
    ), SECRET, new Date(NOW_MS + 1_000))).toBeNull();
  });
});
