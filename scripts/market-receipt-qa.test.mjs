#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const marketTypes = readFileSync("packages/types/src/markets.ts", "utf8");

assert.ok(marketTypes.includes('version: "matterhorn.market.receipt.v1"'), "shared MarketReceipt version is documented");
assert.ok(marketTypes.includes("MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN"), "shared forbidden credential pattern is exported");

const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

const PUBLIC_STATUSES = new Set(["received", "pending", "filled", "cancelled", "rejected", "failed", "unknown"]);

function forbiddenPath(value, root = []) {
  const stack = [{ value, path: root }];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    visited += 1;
    if (visited > 100_000) return [...current.path, "<oversized>"].join(".");
    if (Array.isArray(current.value)) {
      current.value.forEach((child, index) => stack.push({ value: child, path: [...current.path, String(index)] }));
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      if (FORBIDDEN_KEY_RE.test(key)) return [...current.path, key].join(".");
      stack.push({ value: child, path: [...current.path, key] });
    }
  }
  return null;
}

function normalizeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return PUBLIC_STATUSES.has(normalized) ? normalized : "unknown";
}

function verifyPublicReceipt({ venue, handoff, receipt }) {
  const forbidden = forbiddenPath(receipt, ["receipt"]);
  if (forbidden) {
    return {
      ok: false,
      receipt: null,
      matchesHandoff: false,
      errors: [`Receipt contained forbidden signing or credential material at ${forbidden}.`],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];
  if (receipt.previewSha256 && receipt.previewSha256 !== handoff.previewSha256) errors.push("previewSha256 mismatch");
  if (receipt.handoffSha256 && receipt.handoffSha256 !== handoff.handoffSha256) errors.push("handoffSha256 mismatch");

  if (venue === "hyperliquid") {
    if (receipt.asset && receipt.asset !== handoff.asset) errors.push("asset mismatch");
    if (receipt.side && receipt.side !== handoff.side) errors.push("side mismatch");
  } else if (venue === "polymarket") {
    if (receipt.marketId && receipt.marketId !== handoff.marketId) errors.push("marketId mismatch");
    if (receipt.outcome && receipt.outcome !== handoff.outcome) errors.push("outcome mismatch");
    if (receipt.side && receipt.side !== handoff.side) errors.push("side mismatch");
  } else {
    errors.push(`unsupported venue ${venue}`);
  }

  if (!receipt.orderId && !receipt.txHash) warnings.push("receipt has no order id or tx hash");

  return {
    ok: errors.length === 0,
    matchesHandoff: errors.length === 0,
    receipt: {
      version: "matterhorn.market.receipt.v1",
      venue,
      status: normalizeStatus(receipt.status),
      action: venue === "polymarket" ? "buy_shares" : "place_order",
      previewSha256: receipt.previewSha256 ?? handoff.previewSha256,
      handoffSha256: receipt.handoffSha256 ?? handoff.handoffSha256,
      orderId: receipt.orderId ?? null,
      txHash: receipt.txHash ?? null,
      warnings,
    },
    errors,
    warnings,
  };
}

function expectAccepted(label, result) {
  assert.equal(result.ok, true, `${label} should be accepted`);
  assert.equal(result.matchesHandoff, true, `${label} should match handoff`);
  assert.equal(result.receipt?.version, "matterhorn.market.receipt.v1", `${label} should emit shared receipt version`);
  assert.equal(result.errors.length, 0, `${label} should have no errors`);
  console.log(`PASS ${label}`);
}

function expectRejected(label, result, expectedText) {
  assert.equal(result.ok, false, `${label} should be rejected`);
  assert.equal(result.matchesHandoff, false, `${label} should not match handoff`);
  assert.ok(result.errors.join(" ").includes(expectedText), `${label} should include ${expectedText}`);
  console.log(`PASS ${label}`);
}

const hyperliquidHandoff = {
  previewSha256: "h".repeat(64),
  handoffSha256: "a".repeat(64),
  asset: "BTC",
  side: "buy",
};

expectAccepted(
  "Hyperliquid public order-id receipt",
  verifyPublicReceipt({
    venue: "hyperliquid",
    handoff: hyperliquidHandoff,
    receipt: {
      previewSha256: hyperliquidHandoff.previewSha256,
      handoffSha256: hyperliquidHandoff.handoffSha256,
      orderId: "hl-order-123",
      status: "filled",
      asset: "BTC",
      side: "buy",
    },
  }),
);

expectRejected(
  "Hyperliquid side mismatch",
  verifyPublicReceipt({
    venue: "hyperliquid",
    handoff: hyperliquidHandoff,
    receipt: {
      previewSha256: hyperliquidHandoff.previewSha256,
      handoffSha256: hyperliquidHandoff.handoffSha256,
      orderId: "hl-order-123",
      status: "filled",
      asset: "BTC",
      side: "sell",
    },
  }),
  "side mismatch",
);

expectRejected(
  "Hyperliquid raw signature rejection",
  verifyPublicReceipt({
    venue: "hyperliquid",
    handoff: hyperliquidHandoff,
    receipt: {
      previewSha256: hyperliquidHandoff.previewSha256,
      handoffSha256: hyperliquidHandoff.handoffSha256,
      status: "filled",
      signature: "0xdeadbeef",
    },
  }),
  "receipt.signature",
);

const polymarketHandoff = {
  previewSha256: "p".repeat(64),
  handoffSha256: "b".repeat(64),
  marketId: "123456",
  outcome: "Yes",
  side: "yes",
};

expectAccepted(
  "Polymarket public tx receipt",
  verifyPublicReceipt({
    venue: "polymarket",
    handoff: polymarketHandoff,
    receipt: {
      previewSha256: polymarketHandoff.previewSha256,
      handoffSha256: polymarketHandoff.handoffSha256,
      txHash: "0x" + "1".repeat(64),
      status: "pending",
      marketId: "123456",
      outcome: "Yes",
      side: "yes",
    },
  }),
);

expectRejected(
  "Polymarket outcome mismatch",
  verifyPublicReceipt({
    venue: "polymarket",
    handoff: polymarketHandoff,
    receipt: {
      previewSha256: polymarketHandoff.previewSha256,
      handoffSha256: polymarketHandoff.handoffSha256,
      txHash: "0x" + "1".repeat(64),
      status: "pending",
      marketId: "123456",
      outcome: "No",
      side: "yes",
    },
  }),
  "outcome mismatch",
);

expectRejected(
  "Polymarket nested signed payload rejection",
  verifyPublicReceipt({
    venue: "polymarket",
    handoff: polymarketHandoff,
    receipt: {
      previewSha256: polymarketHandoff.previewSha256,
      handoffSha256: polymarketHandoff.handoffSha256,
      txHash: "0x" + "1".repeat(64),
      publicResult: { signedPayload: "not allowed" },
    },
  }),
  "receipt.publicResult.signedPayload",
);

const warningOnly = verifyPublicReceipt({
  venue: "polymarket",
  handoff: polymarketHandoff,
  receipt: {
    previewSha256: polymarketHandoff.previewSha256,
    handoffSha256: polymarketHandoff.handoffSha256,
    status: "received",
    marketId: "123456",
    outcome: "Yes",
    side: "yes",
  },
});
assert.equal(warningOnly.ok, true, "receipt with no order id/hash is still public evidence but needs review");
assert.ok(warningOnly.warnings.join(" ").includes("no order id or tx hash"), "missing locator warning is surfaced");
console.log("PASS receipt missing order id/hash warning");

const checkerSelfTest = spawnSync("node", ["scripts/market-receipt-check.mjs", "--self-test"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(checkerSelfTest.status, 0, `receipt checker self-test passes: ${checkerSelfTest.stderr || checkerSelfTest.stdout}`);
console.log("PASS public receipt checker self-test");

console.log("Market receipt QA harness passed.");
