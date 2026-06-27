#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/handoffs/matterhorn-backend-frontend-linkage-audit.md", "utf8");

for (const section of [
  "# Matterhorn Backend To Frontend Linkage Audit",
  "## Status Rubric",
  "## Settings Reality Check",
  "## Backend Feature Ledger",
  "## Backend To Frontend Linkage Test Matrix",
  "## Frontend QA Matrix",
  "## Safety Red Lines",
]) {
  assert.ok(doc.includes(section), `audit doc should include section: ${section}`);
}

for (const status of [
  "Ready",
  "Mostly ready",
  "Partial",
  "Preview",
  "Cloud only",
  "Desktop only",
  "Not linked",
]) {
  assert.ok(doc.includes(`| ${status} |`), `audit doc should define status: ${status}`);
}

for (const setting of [
  "Preferences",
  "Permissions",
  "Appearance",
  "Wallet",
  "MCPs and Tools",
  "AI Providers",
  "Environment",
  "Account",
  "Cloud Workers",
  "Agent Marketplace",
  "Recovery",
  "Feedback",
]) {
  assert.ok(doc.includes(`| ${setting} |`), `settings reality check should cover: ${setting}`);
}

for (const area of [
  "Bittensor chat and reads",
  "Bittensor actions",
  "Bittensor watches",
  "Hyperliquid reads",
  "Hyperliquid previews",
  "Polymarket reads",
  "Polymarket previews",
  "Unified crypto chat",
  "Crypto readiness and customer evidence",
  "Matterhorn Memory contract and vault",
  "Wellness workflow",
  "MCP agent control",
  "Desktop/browser control",
  "Workflow templates",
  "Lighthouse and Playwright harness",
]) {
  assert.ok(doc.includes(`| ${area} |`), `backend feature ledger should cover: ${area}`);
}

for (const command of [
  "pnpm --filter @matterhorn-work/app typecheck",
  "pnpm test:matterhorn-customer-onboarding-ui",
  "pnpm test:crypto-panel-ux",
  "pnpm test:customer-readiness-ui",
  "pnpm test:matterhorn-memory-ui",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:unified-crypto-chat",
  "pnpm test:bittensor-customer-readiness-gate",
  "pnpm test:wellness-creator-workflow",
]) {
  assert.ok(doc.includes(command), `audit doc should include test command: ${command}`);
}

for (const redLine of [
  "Never ask for, store, log, transmit, or render examples of seed phrases",
  "Hyperliquid and Polymarket remain preview/external-signer/public-receipt only",
  "Bittensor actions remain unsigned previews and external-signer handoffs",
  "Wellness remains educational and operational",
]) {
  assert.ok(doc.includes(redLine), `audit doc should include safety red line: ${redLine}`);
}

console.log("Matterhorn backend/frontend linkage audit gate passed.");
