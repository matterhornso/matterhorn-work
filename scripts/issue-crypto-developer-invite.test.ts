import { describe, expect, test } from "bun:test";

import {
  buildCryptoDeveloperInviteUrl,
  issueCryptoDeveloperInvite,
  parseCryptoDeveloperInviteArguments,
} from "./issue-crypto-developer-invite";

const INVITE = `mhdi_${"a".repeat(43)}`;

describe("crypto developer invite operator command", () => {
  test("builds a fragment-only one-time invite URL", () => {
    const value = buildCryptoDeveloperInviteUrl("https://matterhorn.example", INVITE);
    const url = new URL(value);
    expect(url.origin).toBe("https://matterhorn.example");
    expect(url.pathname).toBe("/developer/crypto-apps");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#invite=${INVITE}`);
  });

  test("accepts bounded operator options and refuses command-line secrets", () => {
    expect(parseCryptoDeveloperInviteArguments([
      "--server-url", "https://api.example",
      "--app-url", "https://matterhorn.example",
      "--ttl-minutes", "60",
      "--json",
    ])).toEqual({
      serverUrl: "https://api.example",
      appUrl: "https://matterhorn.example",
      ttlMinutes: 60,
      json: true,
      help: false,
    });
    expect(() => parseCryptoDeveloperInviteArguments(["--host-token", "secret"]))
      .toThrow("Unknown option: --host-token");
    expect(() => parseCryptoDeveloperInviteArguments(["--ttl-minutes", "0"]))
      .toThrow("--ttl-minutes must be an integer");
  });

  test("sends host authority only in the request header and returns a redacted link packet", async () => {
    const hostToken = "host-only-secret";
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const result = await issueCryptoDeveloperInvite({
      serverOrigin: "https://api.example",
      appOrigin: "https://matterhorn.example",
      hostToken,
      ttlMinutes: 60,
      fetch: async (url, init) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(JSON.stringify({
          invite: { token: INVITE, expiresAt: new Date(Date.now() + 60_000).toISOString() },
        }), { status: 201, headers: { "content-type": "application/json" } });
      },
    });
    expect(seenUrl).toBe("https://api.example/operator/crypto-developers/invites");
    expect(seenUrl).not.toContain(hostToken);
    expect(seenInit?.headers).toEqual({
      "content-type": "application/json",
      "x-matterhorn-host-token": hostToken,
    });
    expect(seenInit?.body).toBe('{"ttlMinutes":60}');
    expect(JSON.stringify(result)).not.toContain(hostToken);
    expect(result).toMatchObject({
      version: "matterhorn.crypto-developer-invite-link.v1",
      safety: {
        oneTime: true,
        tokenInFragmentOnly: true,
        hostTokenIncluded: false,
        walletAuthorityIncluded: false,
      },
    });
  });

  test("rejects unsafe origins, invalid responses, and upstream errors without echoing secrets", async () => {
    expect(() => buildCryptoDeveloperInviteUrl("https://user:pass@matterhorn.example", INVITE))
      .toThrow("App URL must be a public HTTPS origin");
    expect(() => buildCryptoDeveloperInviteUrl("https://matterhorn.example/path", INVITE))
      .toThrow("App URL must be a public HTTPS origin");
    expect(() => buildCryptoDeveloperInviteUrl("https://matterhorn.example", "bad"))
      .toThrow("Developer invite response was invalid");
    const secret = "host-secret-that-must-not-echo";
    await expect(issueCryptoDeveloperInvite({
      serverOrigin: "https://api.example",
      appOrigin: "https://matterhorn.example",
      hostToken: secret,
      ttlMinutes: 60,
      fetch: async () => new Response(JSON.stringify({ error: secret }), { status: 500 }),
    })).rejects.toThrow("Matterhorn could not issue the developer invite");
  });
});
