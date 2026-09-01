import { describe, expect, test } from "bun:test";

import {
  assertCryptoAdapterConnectedAddress,
  isPublicCryptoAdapterAddress,
  isPublicHttpsCryptoAdapterEndpoint,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";

describe("crypto app egress boundary", () => {
  test("accepts named HTTPS endpoints and rejects literal, local or credentialed origins", () => {
    expect(isPublicHttpsCryptoAdapterEndpoint("https://api.example.com/v1")).toBe(true);
    for (const endpoint of [
      "http://api.example.com",
      "https://localhost/tool",
      "https://service.internal/tool",
      "https://127.0.0.1/tool",
      "https://user:pass@api.example.com/tool",
    ]) expect(isPublicHttpsCryptoAdapterEndpoint(endpoint)).toBe(false);
  });

  test("rejects private, carrier-grade NAT, benchmark and reserved IPv4 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
    ]) expect(isPublicCryptoAdapterAddress(address), address).toBe(false);
    expect(isPublicCryptoAdapterAddress("93.184.216.34")).toBe(true);
  });

  test("fails a mixed public/private DNS answer to prevent rebinding", async () => {
    await expect(resolvePublicCryptoAdapterEndpoint("https://api.example.com", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ])).rejects.toThrow("crypto_app_endpoint_address_not_public");
  });

  test("binds the transport result to one approved public remote address", async () => {
    const resolved = await resolvePublicCryptoAdapterEndpoint("https://api.example.com", async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(resolved.approvedAddresses).toEqual(["93.184.216.34"]);
    expect(() => assertCryptoAdapterConnectedAddress(resolved.approvedAddresses, "93.184.216.35"))
      .toThrow("crypto_app_connected_address_mismatch");
    expect(() => assertCryptoAdapterConnectedAddress(resolved.approvedAddresses, "93.184.216.34"))
      .not.toThrow();
  });
});
