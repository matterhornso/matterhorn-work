import { describe, expect, test } from "bun:test";

import { createInMemoryRequestRateLimitStore } from "./request-rate-limit-store.js";
import { createRequestRateLimiter, resolveRateLimitPeerAddress } from "./server.js";

describe("shared request rate-limit store", () => {
  test("aggregates the same budget across independent server limiters", async () => {
    const store = createInMemoryRequestRateLimitStore();
    const config = { enabled: true, windowMs: 60_000, readMaxRequests: 2 };
    const firstInstance = createRequestRateLimiter(config, store);
    const secondInstance = createRequestRateLimiter(config, store);
    const request = new Request("https://api.matterhorn.test/workspace/ws_shared/config");
    const url = new URL(request.url);

    await expect(firstInstance.check(request, url, "203.0.113.10")).resolves.toEqual({ allowed: true });
    await expect(secondInstance.check(request, url, "203.0.113.10")).resolves.toEqual({ allowed: true });

    const blocked = await firstInstance.check(request, url, "203.0.113.10");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("keeps read, write, workspace, and client budgets isolated", async () => {
    const store = createInMemoryRequestRateLimitStore();
    const limiter = createRequestRateLimiter(
      { enabled: true, windowMs: 60_000, readMaxRequests: 1, writeMaxRequests: 1 },
      store,
    );
    const read = new Request("https://api.matterhorn.test/workspace/ws_one/config");
    const write = new Request(read.url, { method: "POST" });

    expect((await limiter.check(read, new URL(read.url), "203.0.113.11")).allowed).toBe(true);
    expect((await limiter.check(read, new URL(read.url), "203.0.113.11")).allowed).toBe(false);
    expect((await limiter.check(write, new URL(write.url), "203.0.113.11")).allowed).toBe(true);
    expect((await limiter.check(read, new URL(read.url), "203.0.113.12")).allowed).toBe(true);
    const otherWorkspace = new Request("https://api.matterhorn.test/workspace/ws_two/config");
    expect((await limiter.check(otherWorkspace, new URL(otherWorkspace.url), "203.0.113.11")).allowed).toBe(true);
  });

  test("trusts forwarded client identity only from the configured edge proxy", () => {
    const trusted = new Request("https://api.matterhorn.test/health", {
      headers: {
        "x-matterhorn-proxy-secret": "edge-secret",
        "x-matterhorn-client-ip": "203.0.113.42",
      },
    });
    expect(resolveRateLimitPeerAddress(trusted, "10.0.0.5", "edge-secret")).toBe("203.0.113.42");
    expect(resolveRateLimitPeerAddress(trusted, "10.0.0.5", "wrong-secret")).toBe("10.0.0.5");

    const invalid = new Request("https://api.matterhorn.test/health", {
      headers: {
        "x-matterhorn-proxy-secret": "edge-secret",
        "x-matterhorn-client-ip": "attacker.example",
      },
    });
    expect(resolveRateLimitPeerAddress(invalid, "10.0.0.5", "edge-secret")).toBe("10.0.0.5");
  });
});
