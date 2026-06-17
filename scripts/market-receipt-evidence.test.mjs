#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const read = (p) => readFileSync(path.join(repoRoot, p), "utf8");

// ---------------------------------------------------------------------------
// docs/market-receipt-qa.md must teach the public-receipt-only contract,
// concrete venue examples, mismatch rejection, and the missing-evidence warning.
// ---------------------------------------------------------------------------
{
  const doc = read("docs/market-receipt-qa.md");
  for (const needle of [
    "public status only",
    "never** contain a\nraw signature",
    "signed payload",
    "Hyperliquid public receipt",
    "Polymarket public receipt",
    "matterhorn-work crypto receipt-check",
    "--handoff-file",
    "--receipt-file",
    "is **rejected**",
    "side mismatch",
    "no order id and no tx hash",
    "warning",
  ]) {
    assert.ok(doc.includes(needle), `market-receipt-qa.md covers: ${needle}`);
  }
  // No real secrets in the examples.
  for (const banned of ["privateKey\"", "apiSecret\"", "\"signature\"", "signedPayload\""]) {
    assert.ok(!doc.includes(banned), `market-receipt-qa.md must not contain a literal ${banned} field`);
  }
  console.log("PASS market-receipt-qa.md teaches public-receipt-only + mismatch + missing-evidence");
}

// ---------------------------------------------------------------------------
// The customer runbook's receipt step stays public-only and file-friendly.
// ---------------------------------------------------------------------------
{
  const runbook = read("docs/market-customer-qa-runbook.md");
  assert.ok(runbook.includes("Do not paste raw signatures or signed payloads"), "runbook warns against pasting signed material");
  assert.ok(/signature.*privateKey.*apiSecret.*signedPayload|signedPayload.*fails/i.test(runbook), "runbook lists the rejected fields");
  console.log("PASS runbook keeps receipt import public-only");
}

// ---------------------------------------------------------------------------
// CLI exposes --receipt-json / --receipt-file for both venues, no secret flags.
// ---------------------------------------------------------------------------
{
  const cli = read("apps/orchestrator/src/cli.ts");
  for (const needle of ['"receipt-json"', '"receipt-file"', "readMarketReceiptArg", "readMarketHandoffArg"]) {
    assert.ok(cli.includes(needle), `cli wires ${needle}`);
  }
  // The shared receipt helper reads only public status fields (no secret flags).
  const helperStart = cli.indexOf("function readMarketReceiptArg");
  const helperEnd = cli.indexOf("async function runHyperliquid");
  const helper = cli.slice(helperStart, helperEnd > helperStart ? helperEnd : cli.length);
  for (const banned of ["private-key", "api-secret", '"signature"', "signed-payload", "mnemonic", "seed"]) {
    assert.ok(!helper.includes(banned), `readMarketReceiptArg must not read a secret flag: ${banned}`);
  }
  // Help text points at file-based receipt verification.
  assert.ok(cli.includes("hyperliquid receipt --handoff-file <path> --receipt-file <path>"), "HL help shows file-based receipt");
  assert.ok(cli.includes("polymarket receipt --handoff-file <path> --receipt-file <path>"), "PM help shows file-based receipt");
  console.log("PASS CLI exposes file-based receipt verification, no secret flags");
}

console.log("Market receipt evidence checks passed.");
