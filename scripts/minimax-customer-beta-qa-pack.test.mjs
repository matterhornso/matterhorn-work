#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}`);
  if (detail) console.error(`  ${detail}`);
}

function mustContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${path} contains "${needle}"`);
    else fail(`${path} contains "${needle}"`, "missing");
  }
  return text;
}

function mustNotContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${path} excludes "${needle}"`, "present");
    else pass(`${path} excludes "${needle}"`);
  }
  return text;
}

const doc = read("docs/handoffs/minimax-customer-beta-qa-pack.md");

// ── Install steps ────────────────────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Install",
  "DMG",
  "Applications",
]);

// ── Gatekeeper unsigned-app note ───────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Gatekeeper",
  "unsigned",
  "Privacy & Security",
  "Open Anyway",
]);

// ── First launch ────────────────────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "First Launch",
  "crash",
  "chat interface",
]);

// ── Bittensor beta checks ───────────────────────────────────────────────────────

const bittensorSection = extractSection(doc, "3. Bittensor Chat Prompts");
if (bittensorSection) {
  pass("Bittensor section found");
  mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
    "subnet",
    "stak",
    "validator",
    "External signer",
    "external signer",
    "canSubmit",
  ]);
} else {
  fail("Bittensor section found", "missing");
}

// ── Hyperliquid preview-only checks ────────────────────────────────────────────

const hyperliquidSection = extractSection(doc, "4. Hyperliquid Read");
if (hyperliquidSection) {
  pass("Hyperliquid section found");
  mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
    "orderbook",
    "Preview",
    "No submit",
    "canSubmit",
  ]);
} else {
  fail("Hyperliquid section found", "missing");
}

// ── Polymarket preview-only checks ─────────────────────────────────────────────

const polymarketSection = extractSection(doc, "5. Polymarket Read");
if (polymarketSection) {
  pass("Polymarket section found");
  mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
    "market",
    "Preview",
    "No submit",
    "canSubmit",
    "compliance",
  ]);
} else {
  fail("Polymarket section found", "missing");
}

// ── Wellness workflow checks ───────────────────────────────────────────────────

const wellnessSection = extractSection(doc, "6. Wellness Creator Prompts");
if (wellnessSection) {
  pass("Wellness section found");
  mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
    "disclaimer",
    "payment",
    "No payment",
    "medical diagnosis",
  ]);
  mustNotContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
    "live payment confirmed",
    "payment processed",
    "email sent",
    "storage confirmed",
  ]);
} else {
  fail("Wellness section found", "missing");
}

// ── Workflow catalog and evidence ─────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "workflow",
  "Evidence",
  "manifest",
]);

// catalog / Catalog case-insensitive check
if (/catalog/i.test(doc)) pass("docs/handoffs/minimax-customer-beta-qa-pack.md contains catalog (case-insensitive)");
else fail("docs/handoffs/minimax-customer-beta-qa-pack.md contains catalog (case-insensitive)", "missing");

// ── Forbidden secret prompts ───────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "seed phrase",
  "private key",
  "API secret",
  "raw signature",
  "wallet export",
  "Secret Refusal",
]);

// ── No-wallet / no-secret safety cases ────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Secret Refusal",
  "Wallet Bypass",
  "P0",
]);

// ── Issue ledger format ────────────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Issue Ledger",
  "Severity",
  "Repro",
  "Expected",
  "Actual",
  "Evidence",
  "P0",
  "P1",
  "P2",
  "P3",
]);

// ── Safety boundary table ──────────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Safety boundary",
  "seed phrase",
  "private key",
]);

// ── Verification commands ─────────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "test:market-execution-safety-gate",
  "pnpm test:market-execution-safety-gate",
  "gate passed",
]);

// ── Final safety confirmation ──────────────────────────────────────────────────

mustContain("docs/handoffs/minimax-customer-beta-qa-pack.md", [
  "Final safety confirmation",
  "no seed phrases",
]);

// ── Summary ────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nMatterhorn customer beta QA pack gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("\nMatterhorn customer beta QA pack gate passed.");

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractSection(doc, heading) {
  const start = doc.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const end = doc.indexOf("\n## ", start + heading.length + 4);
  return doc.slice(start, end < 0 ? doc.length : end);
}
