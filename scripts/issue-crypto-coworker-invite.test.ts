import { describe, expect, test } from "bun:test";

import {
  buildCryptoCoworkerInviteUrl,
  issueCryptoCoworkerInvite,
  parseCryptoCoworkerInviteArguments,
} from "./issue-crypto-coworker-invite";

const INVITE = `mhci_${"a".repeat(43)}`;

describe("crypto coworker invite operator command", () => {
  test("builds a fragment-only one-time invite URL", () => {
    const value = buildCryptoCoworkerInviteUrl("https://matterhorn.example", INVITE);
    const url = new URL(value);
    expect(url.origin).toBe("https://matterhorn.example");
    expect(url.pathname).toBe("/coworker-access");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#invite=${INVITE}`);
  });

  test("accepts bounded operator options and refuses command-line secrets", () => {
    expect(parseCryptoCoworkerInviteArguments([
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
    expect(() => parseCryptoCoworkerInviteArguments(["--host-token", "secret"]))
      .toThrow("Unknown option: --host-token");
    expect(() => parseCryptoCoworkerInviteArguments(["--ttl-minutes", "0"]))
      .toThrow("--ttl-minutes must be an integer");
  });

  test("sends host authority only in the request header and returns a redacted link packet", async () => {
    const hostToken = "host-only-secret";
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const result = await issueCryptoCoworkerInvite({
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
    expect(seenUrl).toBe("https://api.example/operator/coworker-access/invites");
    expect(seenUrl).not.toContain(hostToken);
    expect(seenInit?.headers).toEqual({
      "content-type": "application/json",
      "x-matterhorn-host-token": hostToken,
    });
    expect(seenInit?.body).toBe('{"ttlMinutes":60}');
    expect(JSON.stringify(result)).not.toContain(hostToken);
    expect(result).toMatchObject({
      version: "matterhorn.crypto-coworker-invite-link.v1",
      safety: {
        oneTime: true,
        tokenInFragmentOnly: true,
        hostTokenIncluded: false,
        walletAuthorityIncluded: false,
      },
    });
  });

  test("rejects unsafe origins, invalid responses, and upstream errors without echoing secrets", async () => {
    expect(() => buildCryptoCoworkerInviteUrl("https://user:pass@matterhorn.example", INVITE))
      .toThrow("App URL must be a public HTTPS origin");
    expect(() => buildCryptoCoworkerInviteUrl("https://matterhorn.example/path", INVITE))
      .toThrow("App URL must be a public HTTPS origin");
    expect(() => buildCryptoCoworkerInviteUrl("https://matterhorn.example", "bad"))
      .toThrow("Coworker invite response was invalid");
    const secret = "host-secret-that-must-not-echo";
    await expect(issueCryptoCoworkerInvite({
      serverOrigin: "https://api.example",
      appOrigin: "https://matterhorn.example",
      hostToken: secret,
      ttlMinutes: 60,
      fetch: async () => new Response(JSON.stringify({ error: secret }), { status: 500 }),
    })).rejects.toThrow("Matterhorn could not issue the coworker invite");
  });

  test("explains when invite mode is not enabled", async () => {
    await expect(issueCryptoCoworkerInvite({
      serverOrigin: "https://api.example",
      appOrigin: "https://matterhorn.example",
      hostToken: "host-only-secret",
      ttlMinutes: 60,
      fetch: async () => new Response(JSON.stringify({ code: "coworker_invite_mode_required" }), { status: 409 }),
    })).rejects.toThrow("Invite-only Crypto Coworkers are not enabled");
  });
});
