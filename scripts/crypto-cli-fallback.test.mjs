#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleEvidence } from "./market-official-sdk-validation-evidence.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const token = "test-client-token";
const cliPath = join(repoRoot, "apps/orchestrator/src/cli.ts");

const FORBIDDEN_ROUTE_RE = /\/orders\/(submit|sign)|\/exchange\/submit/i;

function readJson(req) {
  return new Promise((resolveBody) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { resolveBody({}); }
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function listen(server) {
  return new Promise((resolvePort) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolvePort(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

/** Infer a venue from the prompt when the caller asked the router to decide (venue=auto). */
function inferVenue(message, venue) {
  if (venue && venue !== "auto") return venue;
  const text = String(message || "").toLowerCase();
  if (/hyperliquid|funding|btc|perp/.test(text)) return "hyperliquid";
  if (/polymarket|prediction|election/.test(text)) return "polymarket";
  if (/bittensor|tao|subnet/.test(text)) return "bittensor";
  return "auto";
}

async function createMockServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJson(req);
    requests.push({ method: req.method, path: url.pathname, body });

    if (req.headers.authorization !== `Bearer ${token}`) return writeJson(res, 401, { error: "unauthorized" });

    if (req.method === "POST" && url.pathname === "/api/crypto/chat/execute") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "walletExport" in body) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      const venue = inferVenue(body.message, body.venue);
      return writeJson(res, 200, {
        success: true,
        venue,
        execution: "read_only",
        responseText: `Unified crypto router handled venue=${venue}.`,
        cards: [],
        sharedCards: [
          {
            version: "matterhorn.crypto.shared-card.v1",
            kind: "discovery",
            venue,
            title: `${venue} discovery`,
            summary: `Read-only discovery context from ${venue}.`,
            status: "success",
            originalKind: `${venue}_market_list`,
            source: { source: `mock.${venue}` },
            warnings: [],
            data: { kind: `${venue}_market_list`, title: `${venue} discovery` },
            safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
          },
        ],
        warnings: [],
      });
    }

    return writeJson(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return { server, requests, url: `http://127.0.0.1:${port}` };
}

function runCli(serverUrl, args) {
  const bun = process.env.BUN_BIN || "bun";
  const cliArgs = [cliPath, ...args, "--openwork-url", serverUrl, "--token", token, "--json"];
  return new Promise((resolveResult) => {
    const child = spawn(bun, cliArgs, { cwd: repoRoot, env: { ...process.env, OPENWORK_DEV_MODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}

function parseJsonOutput(result) {
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Could not parse CLI JSON. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} error=${error.message}`);
  }
}

async function expectCli(label, serverUrl, args, validate) {
  const result = await runCli(serverUrl, args);
  if (result.code !== 0) throw new Error(`${label} exited ${result.code}. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJsonOutput(result);
  validate(payload);
  console.log(`PASS ${label}`);
  return payload;
}

async function main() {
  if (!existsSync(cliPath)) throw new Error(`CLI source not found at ${cliPath}`);
  const mock = await createMockServer();
  try {
    // 1. crypto chat routes an auto prompt to Hyperliquid and stays read-only.
    await expectCli(
      "crypto chat auto -> hyperliquid",
      mock.url,
      ["crypto", "chat", "--message", "show BTC Hyperliquid funding", "--venue", "auto", "--asset", "BTC"],
      (payload) => {
        if (payload.venue !== "hyperliquid") throw new Error(`expected venue hyperliquid, got ${payload.venue}`);
        if (payload.execution !== "read_only") throw new Error(`expected execution read_only, got ${payload.execution}`);
        if (!Array.isArray(payload.sharedCards) || payload.sharedCards.length === 0) throw new Error("expected sharedCards in response");
        if (payload.sharedCards[0].version !== "matterhorn.crypto.shared-card.v1") throw new Error("expected versioned sharedCards");
        if (payload.sharedCards[0].kind !== "discovery") throw new Error("expected sharedCards kind discovery");
        if (payload.sharedCards[0].safety?.canSubmit !== false) throw new Error("expected sharedCards safety.canSubmit=false");
      },
    );

    // 2. market alias + ask subcommand routes an explicit Polymarket venue.
    await expectCli(
      "market ask -> polymarket",
      mock.url,
      ["market", "ask", "--message", "find Polymarket markets about AI", "--venue", "polymarket", "--limit", "5"],
      (payload) => {
        if (payload.venue !== "polymarket") throw new Error(`expected venue polymarket, got ${payload.venue}`);
      },
    );

    // 3. Credential-shaped flags are rejected before the CLI ever calls the server.
    const requestsBefore = mock.requests.length;
    const secretResult = await runCli(mock.url, ["crypto", "chat", "--message", "show BTC funding", "--api-secret", "do-not-accept"]);
    if (secretResult.code === 0) throw new Error("credential-shaped crypto CLI flag was accepted");
    const secretPayload = parseJsonOutput(secretResult);
    if (!/not accepted/i.test(String(secretPayload.error ?? ""))) {
      throw new Error(`unexpected credential rejection output: ${JSON.stringify(secretPayload)}`);
    }
    if (mock.requests.length !== requestsBefore) throw new Error("secret-flag request reached the server; rejection must happen client-side first");
    console.log("PASS crypto secret flag rejection (no server call)");

    // 4. The consolidated customer-ready smoke is exposed through the public CLI
    // and can write JSON evidence without shell redirection.
    const customerSmokeRequestsBefore = mock.requests.length;
    const customerSmokeDir = mkdtempSync(join(tmpdir(), "matterhorn-crypto-customer-smoke-cli-"));
    const customerSmokeJson = join(customerSmokeDir, "smoke.json");
    await expectCli(
      "crypto customer-smoke dry-run",
      mock.url,
      ["crypto", "customer-smoke", "--dry-run", "--json-output", customerSmokeJson],
      (payload) => {
        if (payload.ready !== true) throw new Error(`expected customer smoke ready=true, got ${payload.ready}`);
        if (payload.dryRun !== true) throw new Error("expected customer smoke dryRun=true");
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected customer smoke liveSubmissionEnabled=false");
      },
    );
    if (mock.requests.length !== customerSmokeRequestsBefore) throw new Error("crypto customer-smoke should not call the Matterhorn server");
    const customerSmokeFile = JSON.parse(readFileSync(customerSmokeJson, "utf8"));
    if (customerSmokeFile.ready !== true || customerSmokeFile.safety?.nonCustodial !== true) {
      throw new Error("expected customer-smoke --json-output file to contain a ready non-custodial report");
    }
    console.log("PASS crypto customer-smoke CLI writes offline JSON evidence");

    // 5. The official SDK doctor is exposed through the public CLI without
    // requiring a Matterhorn server or accepting signing material.
    const sdkDoctorRequestsBefore = mock.requests.length;
    const sdkDoctor = await expectCli(
      "crypto sdk-doctor",
      mock.url,
      ["crypto", "sdk-doctor", "--venue", "hyperliquid"],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected SDK doctor ok=true, got ${payload.ok}`);
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected SDK doctor liveSubmissionEnabled=false");
        if (payload.safety?.acceptsSecrets !== false) throw new Error("expected SDK doctor acceptsSecrets=false");
      },
    );
    if (mock.requests.length !== sdkDoctorRequestsBefore) throw new Error("crypto sdk-doctor should not call the Matterhorn server");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(JSON.stringify(sdkDoctor))) {
      throw new Error("SDK doctor leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-doctor CLI is offline and non-custodial");

    // 6. The official SDK normalizer is exposed through the public CLI for
    // redacted public artifacts.
    const sdkNormalizeRequestsBefore = mock.requests.length;
    const normalizedOutput = join(customerSmokeDir, "hyperliquid-normalized.json");
    const sdkNormalize = await expectCli(
      "crypto sdk-normalize",
      mock.url,
      [
        "crypto",
        "sdk-normalize",
        "--venue",
        "hyperliquid",
        "--input",
        join(repoRoot, "qa-fixtures/market-official-sdk/hyperliquid-normalized-action.fixture.json"),
        "--output",
        normalizedOutput,
      ],
      (payload) => {
        if (payload.type !== "order") throw new Error(`expected normalized Hyperliquid order, got ${payload.type}`);
        if (payload.operatorRedaction?.submissionFieldsRemoved !== true) {
          throw new Error("expected normalizer to mark submission fields removed");
        }
      },
    );
    if (mock.requests.length !== sdkNormalizeRequestsBefore) throw new Error("crypto sdk-normalize should not call the Matterhorn server");
    if (!existsSync(normalizedOutput)) throw new Error("expected crypto sdk-normalize to write output file");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(JSON.stringify(sdkNormalize))) {
      throw new Error("SDK normalizer leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-normalize CLI is offline and non-custodial");

    // 7. The official SDK capture harness is exposed through the public CLI for
    // normalized public artifacts and remains offline.
    const sdkCaptureRequestsBefore = mock.requests.length;
    const captureOutput = join(customerSmokeDir, "official-sdk-capture.json");
    const sdkCapture = await expectCli(
      "crypto sdk-capture",
      mock.url,
      [
        "crypto",
        "sdk-capture",
        "--generated-at",
        new Date(0).toISOString(),
        "--validated-at",
        new Date(0).toISOString(),
        "--hyperliquid-normalized",
        normalizedOutput,
        "--hyperliquid-package-version",
        "fixture-hyperliquid-python-sdk",
        "--polymarket-normalized",
        join(repoRoot, "qa-fixtures/market-official-sdk/polymarket-normalized-typed-data.fixture.json"),
        "--polymarket-package-version",
        "fixture-@polymarket/clob-client-v2",
        "--polymarket-exchange-address",
        "0x0000000000000000000000000000000000000001",
        "--polymarket-chain-id",
        "80002",
        "--output",
        captureOutput,
      ],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected SDK capture ok=true, got ${payload.ok}`);
        if (payload.evidence?.safety?.liveSubmissionEnabled !== false) {
          throw new Error("expected SDK capture liveSubmissionEnabled=false");
        }
        if (!payload.evidence?.venues?.every((venue) => venue.status === "validated")) {
          throw new Error("expected SDK capture venues to be validated");
        }
        if (!payload.evidence?.venues?.every((venue) => venue.matterhornTemplate?.canSubmit === false)) {
          throw new Error("expected SDK capture matterhorn templates to remain canSubmit=false");
        }
      },
    );
    if (mock.requests.length !== sdkCaptureRequestsBefore) throw new Error("crypto sdk-capture should not call the Matterhorn server");
    if (!existsSync(captureOutput)) throw new Error("expected crypto sdk-capture to write output file");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(JSON.stringify(sdkCapture))) {
      throw new Error("SDK capture leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-capture CLI is offline and non-custodial");

    // 8. The official SDK evidence validator is exposed through the public CLI
    // for captured public artifacts and remains offline.
    const sdkEvidenceRequestsBefore = mock.requests.length;
    const sdkEvidenceValidation = await expectCli(
      "crypto sdk-evidence",
      mock.url,
      [
        "crypto",
        "sdk-evidence",
        "--evidence-file",
        captureOutput,
      ],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected SDK evidence ok=true, got ${payload.ok}`);
        if (payload.evidence?.safety?.liveSubmissionEnabled !== false) {
          throw new Error("expected SDK evidence liveSubmissionEnabled=false");
        }
        if (!payload.evidence?.venues?.every((venue) => venue.matterhornTemplate?.canSubmit === false)) {
          throw new Error("expected SDK evidence matterhorn templates to remain canSubmit=false");
        }
      },
    );
    if (mock.requests.length !== sdkEvidenceRequestsBefore) throw new Error("crypto sdk-evidence should not call the Matterhorn server");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(JSON.stringify(sdkEvidenceValidation))) {
      throw new Error("SDK evidence validation leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-evidence CLI is offline and non-custodial");

    // 9. The official SDK operator loop is exposed through the public CLI without
    // requiring a Matterhorn server or forwarding auth tokens/secrets.
    const sdkRequestsBefore = mock.requests.length;
    const sdkOutputDir = mkdtempSync(join(tmpdir(), "matterhorn-crypto-sdk-loop-cli-"));
    const sdkLoop = await expectCli(
      "crypto sdk-loop fixture",
      mock.url,
      ["crypto", "sdk-loop", "--fixture", "--output-dir", sdkOutputDir],
      (payload) => {
        if (payload.ready !== true) throw new Error(`expected SDK loop ready=true, got ${payload.ready}`);
        if (payload.safety?.nonCustodial !== true) throw new Error("expected SDK loop safety.nonCustodial=true");
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected SDK loop liveSubmissionEnabled=false");
        if (payload.safety?.signsOrSubmits !== false) throw new Error("expected SDK loop signsOrSubmits=false");
        if (!payload.files?.officialSdkEvidence || !existsSync(payload.files.officialSdkEvidence)) {
          throw new Error("expected official SDK evidence file to be written");
        }
        if (!payload.files?.runManifest || !existsSync(payload.files.runManifest)) {
          throw new Error("expected official SDK run manifest file to be written");
        }
      },
    );
    if (mock.requests.length !== sdkRequestsBefore) throw new Error("crypto sdk-loop should not call the Matterhorn server");
    const sdkEvidence = readFileSync(sdkLoop.files.officialSdkEvidence, "utf8");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport/i.test(sdkEvidence)) {
      throw new Error("SDK loop evidence leaked token or secret-shaped fields");
    }
    const sdkRunManifest = readFileSync(sdkLoop.files.runManifest, "utf8");
    if (!/matterhorn\.market\.sdk\.run-manifest\.v1/.test(sdkRunManifest)) {
      throw new Error("SDK loop run manifest missing expected version");
    }
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(sdkRunManifest)) {
      throw new Error("SDK loop run manifest leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-loop CLI is offline and non-custodial");

    // 10. The customer evidence bundle is also available through the public
    // crypto CLI and stays offline.
    const bundleRequestsBefore = mock.requests.length;
    const smokePath = join(sdkOutputDir, "customer-ready-smoke.json");
    const bundleMarkdownPath = join(sdkOutputDir, "matterhorn-market-customer-evidence.md");
    const bundleJsonPath = join(sdkOutputDir, "matterhorn-market-customer-evidence.json");
    const bundleReceiptCheckPath = join(sdkOutputDir, "matterhorn-market-receipt-check.json");
    writeFileSync(smokePath, JSON.stringify({
      ready: true,
      summary: { pass: 27, fail: 0, skip: 0 },
      stages: [
        { id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" },
        { id: "crypto.shared_card_contract", label: "Unified crypto shared-card contract", status: "pass" },
        { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
        { id: "market.official_sdk_validation", label: "Official SDK validation", status: "pass" },
        { id: "market.customer_evidence_bundle", label: "Market customer evidence bundle", status: "pass" },
        { id: "hyperliquid.readiness", label: "Hyperliquid readiness gate", status: "pass" },
        { id: "polymarket.readiness", label: "Polymarket readiness gate", status: "pass" },
        { id: "bittensor.customer_readiness", label: "Bittensor customer readiness gate", status: "pass" },
      ],
      safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
    }));
    writeFileSync(sdkLoop.files.officialSdkEvidence, JSON.stringify(sampleEvidence()));
    writeFileSync(bundleReceiptCheckPath, JSON.stringify({
      ok: true,
      matchesHandoff: true,
      receipt: {
        version: "matterhorn.market.receipt.v1",
        venue: "hyperliquid",
        status: "filled",
        action: "place_order",
        previewSha256: "h".repeat(64),
        handoffSha256: "a".repeat(64),
        orderId: "hl-order-123",
        txHash: null,
        warnings: [],
      },
      errors: [],
      warnings: [],
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        signsOrSubmits: false,
        acceptsSecrets: false,
      },
    }));
    const bundleResult = await runCli(mock.url, [
      "crypto",
      "evidence-bundle",
      "--customer-ready-smoke",
      smokePath,
      "--official-sdk-validation",
      sdkLoop.files.officialSdkEvidence,
      "--operator-summary",
      sdkLoop.files.operatorSummaryMarkdown,
      "--receipt-check",
      bundleReceiptCheckPath,
      "--require-receipt-check",
      "--output",
      bundleMarkdownPath,
      "--json-output",
      bundleJsonPath,
      "--strict",
    ]);
    if (bundleResult.code !== 0) throw new Error(`crypto evidence-bundle exited ${bundleResult.code}. stdout=${bundleResult.stdout} stderr=${bundleResult.stderr}`);
    if (mock.requests.length !== bundleRequestsBefore) throw new Error("crypto evidence-bundle should not call the Matterhorn server");
    const bundleMarkdown = readFileSync(bundleMarkdownPath, "utf8");
    const bundleJson = JSON.parse(readFileSync(bundleJsonPath, "utf8"));
    if (!/READY_FOR_TEST_CUSTOMER_QA/.test(bundleMarkdown)) throw new Error("expected customer bundle markdown to be ready");
    if (!/Operator Summary/.test(bundleMarkdown) || !/SHA-256/.test(bundleMarkdown)) throw new Error("expected customer bundle to include operator summary hash");
    if (!/Public Receipt Evidence/.test(bundleMarkdown) || !/hl-order-123/.test(bundleMarkdown)) {
      throw new Error("expected customer bundle to include public receipt-check evidence");
    }
    if (bundleJson.operatorSummary?.present !== true) throw new Error("expected customer bundle JSON to include operatorSummary.present=true");
    if (bundleJson.receiptCheck?.ready !== true) throw new Error("expected customer bundle JSON to include receiptCheck.ready=true");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(bundleMarkdown)) {
      throw new Error("customer evidence bundle leaked token or secret-shaped fields");
    }
    console.log("PASS crypto evidence-bundle CLI is offline and non-custodial");

    // 11. The public market receipt checker is available through the crypto CLI
    // and stays offline.
    const receiptRequestsBefore = mock.requests.length;
    const handoffPath = join(sdkOutputDir, "market-handoff.json");
    const receiptPath = join(sdkOutputDir, "market-receipt.json");
    writeFileSync(handoffPath, JSON.stringify({
      previewSha256: "h".repeat(64),
      handoffSha256: "a".repeat(64),
      asset: "BTC",
      side: "buy",
    }));
    writeFileSync(receiptPath, JSON.stringify({
      previewSha256: "h".repeat(64),
      handoffSha256: "a".repeat(64),
      orderId: "hl-order-123",
      status: "filled",
      asset: "BTC",
      side: "buy",
    }));
    const receiptCheck = await expectCli(
      "crypto receipt-check",
      mock.url,
      [
        "crypto",
        "receipt-check",
        "--venue",
        "hyperliquid",
        "--handoff-file",
        handoffPath,
        "--receipt-file",
        receiptPath,
      ],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected receipt check ok=true, got ${payload.ok}`);
        if (payload.receipt?.version !== "matterhorn.market.receipt.v1") {
          throw new Error("expected receipt check to emit shared market receipt version");
        }
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected receipt check liveSubmissionEnabled=false");
      },
    );
    if (mock.requests.length !== receiptRequestsBefore) throw new Error("crypto receipt-check should not call the Matterhorn server");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(JSON.stringify(receiptCheck))) {
      throw new Error("receipt check leaked token or secret-shaped fields");
    }
    console.log("PASS crypto receipt-check CLI is offline and non-custodial");

    // 12. No request touched a submit/sign/exchange route.
    for (const entry of mock.requests) {
      if (FORBIDDEN_ROUTE_RE.test(entry.path)) throw new Error(`crypto CLI reached a forbidden route: ${entry.path}`);
      if (entry.path !== "/api/crypto/chat/execute") throw new Error(`crypto CLI reached an unexpected route: ${entry.path}`);
    }
    console.log("PASS crypto CLI never touched submit/sign/exchange routes");
  } finally {
    await new Promise((resolveClose) => mock.server.close(resolveClose));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
