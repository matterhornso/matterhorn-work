import assert from "node:assert/strict";
import test from "node:test";
import { getJson, safeText, summarize } from "./readonly-api-smoke.mjs";

test("refuses remote or credential-bearing request origins", () => {
  for (const url of ["https://example.com/api", "http://example.com/api", "http://user:password@localhost/api"]) {
    assert.throws(() => getJson({ url, cookie: "fixture-cookie" }), /isolated loopback/);
  }
});

test("allowlisted model report omits credentials and private catalog fields", () => {
  const summary = summarize("models", {
    catalog: { serverFetched: true, providers: [{ id: "fixture", connected: true, modelCount: 1, apiKey: "never-output", models: { private: "never-output" } }] },
    privacy: { providers: [{ providerId: "fixture", status: "unverified", allowed: false, secret: "never-output" }] },
    cookie: "never-output", account: "never-output",
  });
  assert.equal(summary.serverFetched, true);
  assert.equal(summary.privacy.providers[0].allowed, false);
  assert.equal(JSON.stringify(summary).includes("never-output"), false);
});

test("public orderbooks retain bounded counts without raw venue material", () => {
  const summary = summarize("hyperliquid-orderbook", { orderbook: { asset: "BTC", bids: [{ raw: "never-output" }], asks: [], raw: "never-output", source: { source: "public", freshness: "live", apiKey: "never-output" } } });
  assert.equal(summary.bids, 1);
  assert.equal(summary.asks, 0);
  assert.equal(summary.source.freshness, "live");
  assert.equal(JSON.stringify(summary).includes("never-output"), false);
});

test("diagnostic errors redact credential-shaped values and local paths", () => {
  const sanitized = safeText("Cookie=abc password=xyz Bearer qrs test@example.com /Users/test/private-file");
  for (const value of ["abc", "xyz", "qrs", "test@example.com", "/Users/test/private-file"]) assert.equal(sanitized.includes(value), false);
  assert.equal(safeText("x".repeat(1000)).length, 350);
});
