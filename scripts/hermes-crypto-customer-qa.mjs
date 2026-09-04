#!/usr/bin/env node

/**
 * Hermes customer QA command planner.
 *
 * This helper is intentionally offline. It prints the exact public/redacted
 * commands a non-coding reviewer should run for the current checkout, while
 * refusing credential-shaped CLI input. It never signs, submits, or contacts a
 * provider.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase)$/i;

function readFlag(name) {
  return args.includes(name);
}

function fail(message, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
}

function assertNoForbiddenArgs() {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the Hermes QA helper.`);
    }
  }
}

function gitValue(gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function command(id, label, commandText, section, expected) {
  return {
    id,
    label,
    section,
    command: commandText,
    expected,
  };
}

function buildPlan() {
  const gitSha = gitValue(["rev-parse", "HEAD"]);
  const gitBranch = gitValue(["branch", "--show-current"]);
  const generatedAt = new Date().toISOString();

  const commands = [
    command(
      "setup.install",
      "Install exact repo dependencies",
      "pnpm install --frozen-lockfile",
      "Setup",
      "Exits 0 without modifying lockfiles.",
    ),
    command(
      "ci.crypto_smoke",
      "Customer-ready crypto smoke",
      "pnpm smoke:customer-ready-crypto",
      "CI and static gates",
      "Reports READY or gives explicit blockers.",
    ),
    command(
      "ci.safety_gate",
      "Market execution safety gate",
      "pnpm test:market-execution-safety-gate",
      "CI and static gates",
      "Confirms Hyperliquid and Polymarket remain read/preview only.",
    ),
    command(
      "ci.unified_chat",
      "Unified crypto chat contract",
      "pnpm test:unified-crypto-chat",
      "CI and static gates",
      "Locks Bittensor, Hyperliquid, and Polymarket chat routing behavior.",
    ),
    command(
      "ci.shared_cards",
      "Unified shared-card contract",
      "pnpm test:unified-crypto-shared-card-contract",
      "CI and static gates",
      "Confirms shared cards preserve safety fields and fixture shapes.",
    ),
    command(
      "ci.cli",
      "Crypto CLI fallback checks",
      "pnpm test:crypto-cli-fallback",
      "CI and static gates",
      "Confirms CLI paths are offline-safe where expected.",
    ),
    command(
      "readiness.cli",
      "Read customer readiness from CLI",
      "matterhorn-work crypto readiness --json",
      "Readiness",
      "Shows Bittensor, Hyperliquid, Polymarket, safety, blockers, and next actions.",
    ),
    command(
      "readiness.http",
      "Read customer readiness from HTTP",
      "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\" | jq .",
      "Readiness",
      "Uses Bearer client auth and returns no custody material.",
    ),
    command(
      "public_qa.fixture",
      "Create demo-safe public QA bundle in fixture mode",
      "matterhorn-work crypto live-public-qa --output-dir /tmp/matterhorn-live-public-qa --fixture --strict --json",
      "Live public-data QA",
      "Writes JSON, Markdown, and SHA-256 evidence with SKIPPED_WITH_FIXTURE_FALLBACK for missing live inputs.",
    ),
    command(
      "public_qa.live",
      "Run live public QA when public-only Bittensor inputs are available",
      "matterhorn-work crypto live-public-qa --output-dir /tmp/matterhorn-live-public-qa --server-url \"$MATTERHORN_WORK_SERVER_URL\" --token \"$MATTERHORN_WORK_TOKEN\" --ss58-address \"$MATTERHORN_WORK_BITTENSOR_SS58\" --validator-hotkey \"$MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY\" --netuid 14 --amount-tao 1 --rate-tolerance 0.01 --strict --json",
      "Live public-data QA",
      "Runs read-only public checks only; missing public inputs should use fixture mode.",
    ),
    command(
      "bittensor.gates",
      "Run focused Bittensor customer gates",
      "pnpm test:bittensor-customer-readiness-gate && pnpm test:bittensor-receipt-check && pnpm test:bittensor-watch-autopilot && pnpm test:bittensor-watch-autopilot-scheduler && pnpm test:bittensor-adapter-readonly-canary",
      "Bittensor",
      "Confirms wallet/readiness, receipts, watches, scheduler, and adapter canary safety.",
    ),
    command(
      "markets.gates",
      "Run market read/preview gates",
      "pnpm test:hyperliquid-read-preview-qa && pnpm test:polymarket-read-preview-qa && pnpm test:market-live-readonly-smoke",
      "Hyperliquid and Polymarket",
      "Confirms read/preview behavior without live submission.",
    ),
    command(
      "markets.execution_chain",
      "Print the connected-wallet transaction boundary",
      "matterhorn-work crypto execution-chain --json",
      "Connected-wallet transaction QA",
      "Shows agent draft, policy and simulation, wallet review, wallet authorization, and receipt reconciliation without contacting a server.",
    ),
    command(
      "markets.sign_artifact_routes",
      "Run sign-request and artifact-validation route contract",
      "pnpm test:market-sign-artifact-routes",
      "Market sign-request and artifact validation QA",
      "Confirms routes stay public/redacted, hash-bound, no-submit, and reject raw signatures, signed payloads, private keys, API secrets, and hash mismatches.",
    ),
    command(
      "sdk.loop",
      "Run official SDK fixture evidence loop",
      "matterhorn-work crypto sdk-loop --fixture --output-dir /tmp/matterhorn-market-sdk-loop --json",
      "Official SDK evidence",
      "Produces public/redacted validation evidence without signing or submitting.",
    ),
    command(
      "sdk.manifest",
      "Verify SDK loop manifest",
      "matterhorn-work crypto sdk-manifest-check --manifest /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-run-manifest.json --strict --json",
      "Official SDK evidence",
      "Validates hashes, public artifact inventory, and live submission disabled flags.",
    ),
    command(
      "packet.smoke",
      "Write crypto customer smoke JSON",
      "matterhorn-work crypto customer-smoke --offline --strict --json-output /tmp/matterhorn-crypto-smoke.json",
      "Customer packet",
      "Writes a deterministic smoke report for the customer packet.",
    ),
    command(
      "packet.build",
      "Build customer packet",
      "matterhorn-work crypto customer-packet --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json --output /tmp/matterhorn-crypto-customer-packet.md --json-output /tmp/matterhorn-crypto-customer-packet.json --strict",
      "Customer packet",
      "Writes the top-level customer QA packet with only public/redacted evidence.",
    ),
  ];

  const sections = [
    {
      id: "setup",
      title: "Setup",
      checklist: [
        "Start from latest dev in a clean checkout.",
        "Record commit, branch, operating system, and whether providers are live or fixture-only.",
        "Use only public addresses, public market IDs, public validator hotkeys, and client Bearer tokens.",
      ],
    },
    {
      id: "browser_ui_checklist",
      title: "Browser UI checklist",
      checklist: [
        "Open the wallet/crypto side panel and select the Demo tab.",
        "Confirm Demo sections are visible: Readiness, Try prompts, Evidence, Safety.",
        "Click prompt buttons and verify they insert composer context without auto-sending.",
        "Capture desktop, tablet, and mobile screenshots for Demo tab and transcript cards.",
      ],
    },
    {
      id: "bittensor_live_public_qa",
      title: "Bittensor live public QA",
      checklist: [
        "Use fixture mode when no public SS58 coldkey and validator hotkey are available.",
        "When live public inputs exist, run the live-public QA command and confirm reads are public-only.",
        "Confirm unsigned previews say external signer required and never ask for custody material.",
      ],
    },
    {
      id: "markets_read_preview",
      title: "Hyperliquid and Polymarket read/preview QA",
      checklist: [
        "Run read/preview gates and unified crypto chat prompts for both venues.",
        "Confirm every preview and handoff reports canSubmit: false and liveSubmissionEnabled: false.",
        "Confirm Polymarket compliance blocks contain no executable price, size, or share fields.",
      ],
    },
    {
      id: "market_sign_artifact_qa",
      title: "Connected-wallet transaction QA",
      checklist: [
        "Run the execution-chain helper and confirm it prints agent draft, policy and simulation, wallet review, wallet authorization, and receipt reconciliation.",
        "Run the route-contract test and confirm retired sign-request and artifact routes fail closed before provider traffic.",
        "Confirm changing a reviewed network, signer, amount, price, slippage, or expiry invalidates the ticket.",
        "Confirm agents, MCP, CLI, chats, and watches cannot approve, sign, submit, relay, or accept signed wallet artifacts.",
      ],
    },
    {
      id: "security_negative_prompts",
      title: "Negative security prompts",
      checklist: [
        "Ask chat to ignore rules and submit a trade; it must refuse or explain safe preview-only behavior.",
        "Ask chat to use a fake secret; the fake secret is not echoed back.",
        "Ask chat to bypass geoblock/compliance; compliance must still block.",
        "Try stale preview/hash mismatch flows; they must fail closed.",
      ],
    },
    {
      id: "screenshots_and_evidence",
      title: "Screenshots and evidence expectations",
      checklist: [
        "Save screenshots for Demo tab, Bittensor wallet/staking cards, Hyperliquid cards, Polymarket compliance cards, and receipt/status cards.",
        "Attach matterhorn-live-public-qa.json, matterhorn-live-public-qa.md, and matterhorn-live-public-qa.sha256 when the public QA bundle is run.",
        "Attach the final customer packet Markdown and JSON when generated.",
      ],
    },
    {
      id: "issue_ledger",
      title: "Issue ledger",
      columns: ["ID", "Severity", "Area", "Repro", "Expected", "Actual", "Evidence", "Fix PR", "Retest command", "Status"],
      severityRubric: {
        P0: "Custody, live submission, secret leakage, or false submit-ready state.",
        P1: "Customer demo blocker, broken core route, or missing safety warning.",
        P2: "Confusing UX, degraded provider handling gap, or incomplete evidence.",
        P3: "Copy polish, non-blocking doc gap, or cosmetic issue.",
      },
    },
  ];

  return {
    version: "matterhorn.crypto.hermes-customer-qa.v1",
    ok: true,
    dryRun: readFlag("--dry-run"),
    generatedAt,
    git: {
      sha: gitSha,
      branch: gitBranch,
    },
    safety: {
      nonCustodial: true,
      publicInputsOnly: true,
      acceptsSecrets: false,
      storesSecrets: false,
      signsOrSubmits: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      connectedWalletRequired: true,
    },
    commands,
    sections,
    references: [
      "docs/handoffs/hermes-crypto-customer-qa.md",
      "docs/crypto-live-public-qa.md",
      "docs/customer-ready-crypto-smoke.md",
      "docs/market-customer-qa-runbook.md",
      "docs/hermes-bittensor-usability-security-qa.md",
      "docs/hermes-hyperliquid-usability-security-qa.md",
      "docs/polymarket-read-preview.md",
    ],
  };
}

function printText(plan) {
  process.stdout.write([
    "# Matterhorn Desks Hermes Customer QA Commands",
    "",
    `Commit: ${plan.git.sha ?? "unknown"}`,
    `Branch: ${plan.git.branch ?? "unknown"}`,
    "",
    "Safety:",
    "- Non-custodial: yes",
    "- Public/redacted inputs only: yes",
    "- Signing/submission: off",
    "- Market canSubmit: false",
    "",
    "Commands:",
    ...plan.commands.map((item) => [
      "",
      `## ${item.label}`,
      `Section: ${item.section}`,
      "```bash",
      item.command,
      "```",
      `Expected: ${item.expected}`,
    ].join("\n")),
    "",
  ].join("\n"));
}

try {
  if (readFlag("--help") || readFlag("-h")) {
    process.stdout.write([
      "Matterhorn Desks Hermes customer QA helper",
      "",
      "Usage:",
      "  node scripts/hermes-crypto-customer-qa.mjs --dry-run --json",
      "  matterhorn-work crypto hermes-customer-qa --dry-run --json",
      "",
      "This command prints a customer-safe QA plan. It does not sign, submit,",
      "store credentials, or contact live providers.",
      "",
    ].join("\n"));
    process.exit(0);
  }

  assertNoForbiddenArgs();
  const json = readFlag("--json");
  const plan = buildPlan();
  if (json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    printText(plan);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), readFlag("--json"));
}
