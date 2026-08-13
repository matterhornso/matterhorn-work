import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createInMemoryRequestRateLimitStore,
  createSqliteRequestRateLimitStore,
} from "./request-rate-limit-store.js";
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

  test("atomically shares hosted budgets across independent SQLite connections", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-rate-limit-"));
    const path = join(root, "auth", "rate-limits.db");
    const first = createSqliteRequestRateLimitStore(path);
    const second = createSqliteRequestRateLimitStore(path);
    try {
      const input = {
        key: "auth:sign-up-ip:203.0.113.20",
        windowMs: 60_000,
        maxRequests: 2,
        now: 1_000,
      };
      expect(first.consume(input)).toEqual({ allowed: true, resetAt: 61_000 });
      expect(second.consume(input)).toEqual({ allowed: true, resetAt: 61_000 });
      expect(first.consume(input)).toEqual({ allowed: false, resetAt: 61_000 });
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const inspection = new Database(path, { readonly: true });
      const persisted = inspection
        .query("SELECT key FROM request_rate_limits LIMIT 1")
        .get() as { key: string };
      inspection.close();
      expect(persisted.key).toMatch(/^[a-f0-9]{64}$/);
      expect(persisted.key).not.toContain("203.0.113.20");

      second.reset(input.key);
      expect(first.consume(input)).toEqual({ allowed: true, resetAt: 61_000 });
    } finally {
      first.close?.();
      second.close?.();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("persists a hosted budget across a process-style reopen and expires it safely", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-rate-limit-reopen-"));
    const path = join(root, "rate-limits.db");
    try {
      const first = createSqliteRequestRateLimitStore(path);
      expect((await first.consume({
        key: "auth:password-reset:user@example.test",
        windowMs: 10_000,
        maxRequests: 1,
        now: 5_000,
      })).allowed).toBe(true);
      first.close?.();

      const reopened = createSqliteRequestRateLimitStore(path);
      expect((await reopened.consume({
        key: "auth:password-reset:user@example.test",
        windowMs: 10_000,
        maxRequests: 1,
        now: 6_000,
      })).allowed).toBe(false);
      expect((await reopened.consume({
        key: "auth:password-reset:user@example.test",
        windowMs: 10_000,
        maxRequests: 1,
        now: 15_000,
      })).allowed).toBe(true);
      reopened.close?.();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
