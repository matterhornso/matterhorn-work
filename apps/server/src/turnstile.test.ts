import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_SIGNUP_TURNSTILE_ACTION,
  resolveMatterhornTurnstileConfig,
  verifyMatterhornTurnstile,
} from "./turnstile.js";

const config = resolveMatterhornTurnstileConfig({
  MATTERHORN_TURNSTILE_SITEKEY: "site-key",
  TURNSTILE_SECRET: "secret-key",
  TURNSTILE_HOSTNAMES: "matterhorn.example, localhost",
});

describe("Matterhorn Turnstile", () => {
  test("resolves a complete, normalized configuration", () => {
    expect(config.configured).toBe(true);
    expect(config.ready).toBe(true);
    expect(config.siteKey).toBe("site-key");
    expect([...config.hostnames]).toEqual(["matterhorn.example", "localhost"]);
  });

  test("distinguishes absent and partial configuration", () => {
    expect(resolveMatterhornTurnstileConfig({}).configured).toBe(false);
    expect(resolveMatterhornTurnstileConfig({}).ready).toBe(false);
    expect(resolveMatterhornTurnstileConfig({
      MATTERHORN_TURNSTILE_SITEKEY: "site-key",
    })).toMatchObject({ configured: true, ready: false });
  });

  test("verifies action, hostname, token, and peer address", async () => {
    let requestBody = "";
    const verified = await verifyMatterhornTurnstile({
      config,
      token: "browser-token",
      remoteIp: "203.0.113.10",
      fetcher: (async (input, init) => {
        expect(String(input)).toBe(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        );
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({
          "Content-Type": "application/x-www-form-urlencoded",
        });
        requestBody = String(init?.body);
        return Response.json({
          success: true,
          action: MATTERHORN_SIGNUP_TURNSTILE_ACTION,
          hostname: "matterhorn.example",
        });
      }),
    });

    expect(verified).toBe(true);
    expect(new URLSearchParams(requestBody).get("secret")).toBe("secret-key");
    expect(new URLSearchParams(requestBody).get("response")).toBe("browser-token");
    expect(new URLSearchParams(requestBody).get("remoteip")).toBe("203.0.113.10");
  });

  test("fails closed for invalid, replayed, or mismatched responses", async () => {
    for (const payload of [
      { success: false, "error-codes": ["timeout-or-duplicate"] },
      { success: true, action: "login", hostname: "matterhorn.example" },
      { success: true, action: "signup", hostname: "attacker.example" },
    ]) {
      expect(await verifyMatterhornTurnstile({
        config,
        token: "browser-token",
        fetcher: async () => Response.json(payload),
      })).toBe(false);
    }
  });

  test("does not call Siteverify for missing or oversized tokens", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return Response.json({ success: true });
    });
    expect(await verifyMatterhornTurnstile({ config, token: "", fetcher })).toBe(false);
    expect(await verifyMatterhornTurnstile({
      config,
      token: "x".repeat(2049),
      fetcher,
    })).toBe(false);
    expect(calls).toBe(0);
  });

  test("fails closed on provider errors and invalid bodies", async () => {
    const cases = [
      async () => new Response("unavailable", { status: 503 }),
      async () => new Response("not-json"),
      async () => { throw new Error("network"); },
    ];
    for (const fetcher of cases) {
      expect(await verifyMatterhornTurnstile({
        config,
        token: "browser-token",
        fetcher,
      })).toBe(false);
    }
  });
});
