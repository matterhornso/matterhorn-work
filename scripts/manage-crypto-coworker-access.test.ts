import { describe, expect, test } from "bun:test";

import {
  listCryptoCoworkerAccess,
  parseCryptoCoworkerAccessArguments,
  revokeCryptoCoworkerAccess,
} from "./manage-crypto-coworker-access";

const ACCESS_ID = `mhca_${"a".repeat(24)}`;
const NOW = "2026-09-03T12:00:00.000Z";

describe("crypto coworker access operator command", () => {
  test("accepts only opaque access management arguments", () => {
    expect(parseCryptoCoworkerAccessArguments([
      "list", "--server-url", "https://api.example", "--limit", "20", "--json",
    ])).toEqual({
      action: "list",
      serverUrl: "https://api.example",
      limit: 20,
      json: true,
      help: false,
    });
    expect(parseCryptoCoworkerAccessArguments(["revoke", "--access-id", ACCESS_ID]))
      .toMatchObject({ action: "revoke", accessId: ACCESS_ID });
    expect(() => parseCryptoCoworkerAccessArguments(["revoke", "--account-id", "account-a"]))
      .toThrow("Unknown option: --account-id");
    expect(() => parseCryptoCoworkerAccessArguments(["list", "--host-token", "secret"]))
      .toThrow("Unknown option: --host-token");
  });

  test("lists only closed, opaque access records", async () => {
    const hostToken = "host-only-secret";
    let seenUrl = "";
    let seenHeaders: HeadersInit | undefined;
    const records = await listCryptoCoworkerAccess({
      serverOrigin: "https://api.example",
      hostToken,
      limit: 20,
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenHeaders = init?.headers;
        return new Response(JSON.stringify({
          mode: "invite",
          accounts: [{
            accessId: ACCESS_ID,
            state: "active",
            grantedAt: NOW,
            updatedAt: NOW,
            revokedAt: null,
          }],
        }), { status: 200 });
      },
    });
    expect(seenUrl).toBe("https://api.example/operator/coworker-access?limit=20");
    expect(seenHeaders).toEqual({ "x-matterhorn-host-token": hostToken });
    expect(JSON.stringify(records)).not.toContain(hostToken);
    expect(records).toHaveLength(1);
    expect(records[0].accessId).toBe(ACCESS_ID);

    await expect(listCryptoCoworkerAccess({
      serverOrigin: "https://api.example",
      hostToken,
      limit: 20,
      fetch: async () => new Response(JSON.stringify({
        mode: "invite",
        accounts: [{
          accessId: ACCESS_ID,
          ownerId: "account-a",
          state: "active",
          grantedAt: NOW,
          updatedAt: NOW,
          revokedAt: null,
        }],
      }), { status: 200 }),
    })).rejects.toThrow("Coworker access response was invalid");
  });

  test("revokes by opaque access ID without sending account identity", async () => {
    const hostToken = "host-only-secret";
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const result = await revokeCryptoCoworkerAccess({
      serverOrigin: "https://api.example",
      hostToken,
      accessId: ACCESS_ID,
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(JSON.stringify({
          status: {
            version: "matterhorn.coworker-access-status.v1",
            allowed: false,
            acceptedAt: null,
          },
        }), { status: 200 });
      },
    });
    expect(seenUrl).toBe("https://api.example/operator/coworker-access/revoke");
    expect(seenInit?.body).toBe(`{"accessId":"${ACCESS_ID}"}`);
    expect(String(seenInit?.body)).not.toContain("account");
    expect(seenInit?.headers).toEqual({
      "content-type": "application/json",
      "x-matterhorn-host-token": hostToken,
    });
    expect(result).toEqual({ allowed: false, acceptedAt: null });
  });

  test("rejects unsafe origins and sanitizes upstream failures", async () => {
    await expect(listCryptoCoworkerAccess({
      serverOrigin: "https://user:pass@api.example",
      hostToken: "host-only-secret",
      limit: 20,
    })).rejects.toThrow("Server URL must be a public HTTPS origin");
    const secret = "secret-that-must-not-echo";
    await expect(revokeCryptoCoworkerAccess({
      serverOrigin: "https://api.example",
      hostToken: secret,
      accessId: ACCESS_ID,
      fetch: async () => new Response(JSON.stringify({ error: secret }), { status: 500 }),
    })).rejects.toThrow("Matterhorn could not revoke coworker access");
  });
});
