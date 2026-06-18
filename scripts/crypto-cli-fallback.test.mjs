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

    if (req.method === "GET" && url.pathname === "/api/crypto/readiness") {
      return writeJson(res, 200, {
        success: true,
        ready: true,
        status: "ready",
        report: {
          ready: true,
          checks: [
            { id: "bittensor.readiness", label: "Bittensor readiness", status: "pass" },
            { id: "hyperliquid.read_preview", label: "Hyperliquid read/preview", status: "pass" },
            { id: "polymarket.read_preview", label: "Polymarket read/preview", status: "pass" },
          ],
          safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/external-sign-request") {
      if (body.executionMode !== "testnet_external_signer") {
        return writeJson(res, 400, { error: "invalid_execution_mode" });
      }
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "signature" in body) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      return writeJson(res, 200, {
        success: true,
        signRequest: {
          version: "matterhorn.market.external-sign-request.v1",
          venue: "hyperliquid",
          routeName: "hyperliquid.orders.sign_request",
          executionMode: "testnet_external_signer",
          network: "testnet",
          action: "place_order",
          signRequestSha256: "1".repeat(64),
          previewSha256: "2".repeat(64),
          handoffSha256: "3".repeat(64),
          unsignedPayloadSha256: "4".repeat(64),
          readyToSign: true,
          signedArtifactAccepted: false,
          submitSignedAllowedByContract: false,
          canSubmit: false,
          liveSubmissionEnabled: false,
          externalSignerOnly: true,
          warnings: ["Mock sign-request: no Matterhorn signing or submission."],
        },
        handoff: { canSubmit: false, liveSubmissionEnabled: false },
        preview: { canSubmit: false, liveSubmissionEnabled: false },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/polymarket/orders/external-sign-request") {
      if (body.executionMode !== "testnet_external_signer") {
        return writeJson(res, 400, { error: "invalid_execution_mode" });
      }
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "signature" in body) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      return writeJson(res, 200, {
        success: true,
        signRequest: {
          version: "matterhorn.market.external-sign-request.v1",
          venue: "polymarket",
          routeName: "polymarket.orders.sign_request",
          executionMode: "testnet_external_signer",
          network: "amoy",
          action: "place_order",
          signRequestSha256: "5".repeat(64),
          previewSha256: "6".repeat(64),
          handoffSha256: "7".repeat(64),
          unsignedPayloadSha256: "8".repeat(64),
          readyToSign: true,
          signedArtifactAccepted: false,
          submitSignedAllowedByContract: false,
          canSubmit: false,
          liveSubmissionEnabled: false,
          externalSignerOnly: true,
          warnings: ["Mock sign-request: no Matterhorn signing or submission."],
        },
        handoff: { canSubmit: false, liveSubmissionEnabled: false },
        preview: { canSubmit: false, liveSubmissionEnabled: false },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/external-artifact/validate") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "signature" in body.artifact) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      return writeJson(res, 200, {
        success: true,
        validation: {
          version: "matterhorn.market.artifact-validation.v1",
          venue: "hyperliquid",
          status: "accepted_public_metadata",
          matchesSignRequest: true,
          signedArtifactAccepted: false,
          submitSignedAllowedByContract: false,
          canSubmit: false,
          liveSubmissionEnabled: false,
          publicAuditReceiptCandidate: {
            version: "matterhorn.market.receipt.v1",
            venue: "hyperliquid",
            status: "received",
            action: "place_order",
          },
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/polymarket/orders/external-artifact/validate") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "signature" in body.artifact) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      return writeJson(res, 200, {
        success: true,
        validation: {
          version: "matterhorn.market.artifact-validation.v1",
          venue: "polymarket",
          status: "accepted_public_metadata",
          matchesSignRequest: true,
          signedArtifactAccepted: false,
          submitSignedAllowedByContract: false,
          canSubmit: false,
          liveSubmissionEnabled: false,
          publicAuditReceiptCandidate: {
            version: "matterhorn.market.receipt.v1",
            venue: "polymarket",
            status: "received",
            action: "buy_shares",
          },
        },
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

    // 2. The runtime customer-readiness route is exposed through the public
    // crypto CLI and uses the client Bearer token with no request body.
    await expectCli(
      "crypto readiness",
      mock.url,
      ["crypto", "readiness"],
      (payload) => {
        if (payload.ready !== true) throw new Error(`expected readiness ready=true, got ${payload.ready}`);
        if (payload.report?.safety?.liveSubmissionEnabled !== false) throw new Error("expected readiness liveSubmissionEnabled=false");
        if (payload.report?.safety?.canSubmit !== false) throw new Error("expected readiness canSubmit=false");
      },
    );
    const readinessRequest = mock.requests.find((request) => request.method === "GET" && request.path === "/api/crypto/readiness");
    if (!readinessRequest) throw new Error("crypto readiness did not call /api/crypto/readiness");
    if (Object.keys(readinessRequest.body || {}).length !== 0) throw new Error("crypto readiness should not send a request body");

    // 2. market alias + ask subcommand routes an explicit Polymarket venue.
    await expectCli(
      "market ask -> polymarket",
      mock.url,
      ["market", "ask", "--message", "find Polymarket markets about AI", "--venue", "polymarket", "--limit", "5"],
      (payload) => {
        if (payload.venue !== "polymarket") throw new Error(`expected venue polymarket, got ${payload.venue}`);
      },
    );

    // 3. Venue sign-request commands call only the external sign-request route
    // and keep every execution flag disabled.
    const hyperliquidSignPayload = await expectCli(
      "hyperliquid sign-request external signer only",
      mock.url,
      [
        "hyperliquid",
        "sign-request",
        "--execution-mode",
        "testnet_external_signer",
        "--asset",
        "BTC",
        "--side",
        "buy",
        "--size",
        "0.1",
        "--price",
        "100000",
      ],
      (payload) => {
        if (payload.signRequest?.version !== "matterhorn.market.external-sign-request.v1") {
          throw new Error("expected Hyperliquid external sign-request version");
        }
        if (payload.signRequest?.venue !== "hyperliquid") throw new Error("expected Hyperliquid sign-request venue");
        if (payload.signRequest?.executionMode !== "testnet_external_signer") throw new Error("expected explicit testnet external signer mode");
        if (payload.signRequest?.canSubmit !== false) throw new Error("expected Hyperliquid signRequest.canSubmit=false");
        if (payload.signRequest?.liveSubmissionEnabled !== false) throw new Error("expected Hyperliquid liveSubmissionEnabled=false");
        if (payload.signRequest?.signedArtifactAccepted !== false) throw new Error("expected Hyperliquid signedArtifactAccepted=false");
        if (payload.signRequest?.submitSignedAllowedByContract !== false) {
          throw new Error("expected Hyperliquid submitSignedAllowedByContract=false");
        }
      },
    );

    const polymarketSignPayload = await expectCli(
      "polymarket sign-request external signer only",
      mock.url,
      [
        "polymarket",
        "sign-request",
        "--execution-mode",
        "testnet_external_signer",
        "--market-id",
        "0xmarket-ai",
        "--amount-usdc",
        "10",
        "--side",
        "yes",
      ],
      (payload) => {
        if (payload.signRequest?.version !== "matterhorn.market.external-sign-request.v1") {
          throw new Error("expected Polymarket external sign-request version");
        }
        if (payload.signRequest?.venue !== "polymarket") throw new Error("expected Polymarket sign-request venue");
        if (payload.signRequest?.executionMode !== "testnet_external_signer") throw new Error("expected explicit testnet external signer mode");
        if (payload.signRequest?.canSubmit !== false) throw new Error("expected Polymarket signRequest.canSubmit=false");
        if (payload.signRequest?.liveSubmissionEnabled !== false) throw new Error("expected Polymarket liveSubmissionEnabled=false");
        if (payload.signRequest?.signedArtifactAccepted !== false) throw new Error("expected Polymarket signedArtifactAccepted=false");
        if (payload.signRequest?.submitSignedAllowedByContract !== false) {
          throw new Error("expected Polymarket submitSignedAllowedByContract=false");
        }
      },
    );

    const signRequestModeRequestsBefore = mock.requests.length;
    const missingModeResult = await runCli(mock.url, ["hyperliquid", "sign-request", "--asset", "BTC", "--side", "buy", "--size", "0.1"]);
    if (missingModeResult.code === 0) throw new Error("hyperliquid sign-request accepted missing execution mode");
    const missingModePayload = parseJsonOutput(missingModeResult);
    if (!/execution-mode testnet_external_signer/i.test(String(missingModePayload.error ?? ""))) {
      throw new Error(`unexpected missing execution-mode error: ${JSON.stringify(missingModePayload)}`);
    }
    if (mock.requests.length !== signRequestModeRequestsBefore) {
      throw new Error("missing execution-mode sign-request reached the server");
    }
    console.log("PASS hyperliquid sign-request requires explicit testnet external signer mode");

    const artifactDir = mkdtempSync(join(tmpdir(), "matterhorn-market-artifact-cli-"));
    const hyperliquidSignRequestPath = join(artifactDir, "hyperliquid-sign-request.json");
    const hyperliquidArtifactPath = join(artifactDir, "hyperliquid-artifact.json");
    const polymarketSignRequestPath = join(artifactDir, "polymarket-sign-request.json");
    const polymarketArtifactPath = join(artifactDir, "polymarket-artifact.json");
    writeFileSync(hyperliquidSignRequestPath, JSON.stringify({ signRequest: hyperliquidSignPayload.signRequest }));
    writeFileSync(hyperliquidArtifactPath, JSON.stringify({
      artifact: {
        version: "matterhorn.market.redacted-signed-artifact-envelope.v1",
        venue: "hyperliquid",
        routeName: "hyperliquid.orders.sign_request",
        validationMode: "public_redacted_metadata",
        executionMode: "testnet_external_signer",
        network: hyperliquidSignPayload.signRequest.network,
        action: hyperliquidSignPayload.signRequest.action,
        signRequestSha256: hyperliquidSignPayload.signRequest.signRequestSha256,
        previewSha256: hyperliquidSignPayload.signRequest.previewSha256,
        handoffSha256: hyperliquidSignPayload.signRequest.handoffSha256,
        unsignedPayloadSha256: hyperliquidSignPayload.signRequest.unsignedPayloadSha256,
        signedArtifactPublicHash: "a".repeat(64),
        signedArtifactRedacted: true,
        signerAddress: "0x0000000000000000000000000000000000000001",
        canSubmit: false,
        liveSubmissionEnabled: false,
      },
    }));
    writeFileSync(polymarketSignRequestPath, JSON.stringify({ signRequest: polymarketSignPayload.signRequest }));
    writeFileSync(polymarketArtifactPath, JSON.stringify({
      artifact: {
        version: "matterhorn.market.redacted-signed-artifact-envelope.v1",
        venue: "polymarket",
        routeName: "polymarket.orders.sign_request",
        validationMode: "public_redacted_metadata",
        executionMode: "testnet_external_signer",
        network: polymarketSignPayload.signRequest.network,
        action: polymarketSignPayload.signRequest.action,
        signRequestSha256: polymarketSignPayload.signRequest.signRequestSha256,
        previewSha256: polymarketSignPayload.signRequest.previewSha256,
        handoffSha256: polymarketSignPayload.signRequest.handoffSha256,
        unsignedPayloadSha256: polymarketSignPayload.signRequest.unsignedPayloadSha256,
        signedArtifactPublicHash: "b".repeat(64),
        signedArtifactRedacted: true,
        signerAddress: "0x0000000000000000000000000000000000000001",
        canSubmit: false,
        liveSubmissionEnabled: false,
      },
    }));

    await expectCli(
      "hyperliquid validate-artifact external metadata only",
      mock.url,
      [
        "hyperliquid",
        "validate-artifact",
        "--sign-request-file",
        hyperliquidSignRequestPath,
        "--artifact-file",
        hyperliquidArtifactPath,
      ],
      (payload) => {
        if (payload.validation?.version !== "matterhorn.market.artifact-validation.v1") {
          throw new Error("expected Hyperliquid artifact validation version");
        }
        if (payload.validation?.status !== "accepted_public_metadata") throw new Error("expected Hyperliquid accepted_public_metadata");
        if (payload.validation?.canSubmit !== false) throw new Error("expected Hyperliquid validation canSubmit=false");
        if (payload.validation?.liveSubmissionEnabled !== false) throw new Error("expected Hyperliquid validation liveSubmissionEnabled=false");
        if (payload.validation?.signedArtifactAccepted !== false) throw new Error("expected Hyperliquid signedArtifactAccepted=false");
        if (payload.validation?.publicAuditReceiptCandidate?.version !== "matterhorn.market.receipt.v1") {
          throw new Error("expected Hyperliquid public audit receipt candidate");
        }
      },
    );

    await expectCli(
      "polymarket validate-artifact external metadata only",
      mock.url,
      [
        "polymarket",
        "validate-artifact",
        "--sign-request-file",
        polymarketSignRequestPath,
        "--artifact-file",
        polymarketArtifactPath,
      ],
      (payload) => {
        if (payload.validation?.version !== "matterhorn.market.artifact-validation.v1") {
          throw new Error("expected Polymarket artifact validation version");
        }
        if (payload.validation?.status !== "accepted_public_metadata") throw new Error("expected Polymarket accepted_public_metadata");
        if (payload.validation?.canSubmit !== false) throw new Error("expected Polymarket validation canSubmit=false");
        if (payload.validation?.liveSubmissionEnabled !== false) throw new Error("expected Polymarket validation liveSubmissionEnabled=false");
        if (payload.validation?.signedArtifactAccepted !== false) throw new Error("expected Polymarket signedArtifactAccepted=false");
        if (payload.validation?.publicAuditReceiptCandidate?.version !== "matterhorn.market.receipt.v1") {
          throw new Error("expected Polymarket public audit receipt candidate");
        }
      },
    );

    // 4. Credential-shaped flags are rejected before the CLI ever calls the server.
    const requestsBefore = mock.requests.length;
    const secretResult = await runCli(mock.url, ["crypto", "chat", "--message", "show BTC funding", "--api-secret", "do-not-accept"]);
    if (secretResult.code === 0) throw new Error("credential-shaped crypto CLI flag was accepted");
    const secretPayload = parseJsonOutput(secretResult);
    if (!/not accepted/i.test(String(secretPayload.error ?? ""))) {
      throw new Error(`unexpected credential rejection output: ${JSON.stringify(secretPayload)}`);
    }
    if (mock.requests.length !== requestsBefore) throw new Error("secret-flag request reached the server; rejection must happen client-side first");
    console.log("PASS crypto secret flag rejection (no server call)");

    // 5. The consolidated customer-ready smoke is exposed through the public CLI
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

    // 6. The live public-data QA pack is exposed through the public CLI and can
    // create fixture-fallback evidence without calling the server.
    const livePublicRequestsBefore = mock.requests.length;
    const livePublicDir = mkdtempSync(join(tmpdir(), "matterhorn-live-public-qa-cli-"));
    await expectCli(
      "crypto live-public-qa fixture",
      mock.url,
      ["crypto", "live-public-qa", "--fixture", "--output-dir", livePublicDir],
      (payload) => {
        if (payload.status !== "SKIPPED_WITH_FIXTURE_FALLBACK") {
          throw new Error(`expected live public QA fixture fallback, got ${payload.status}`);
        }
        if (payload.safety?.nonCustodial !== true) throw new Error("expected live public QA nonCustodial=true");
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected live public QA liveSubmissionEnabled=false");
        if (payload.safety?.signsOrSubmits !== false) throw new Error("expected live public QA signsOrSubmits=false");
        if (!payload.files?.json || !existsSync(payload.files.json)) throw new Error("expected live public QA JSON evidence file");
        if (!payload.files?.markdown || !existsSync(payload.files.markdown)) throw new Error("expected live public QA Markdown evidence file");
        if (!payload.files?.sha256 || !existsSync(payload.files.sha256)) throw new Error("expected live public QA SHA-256 evidence file");
      },
    );
    if (mock.requests.length !== livePublicRequestsBefore) throw new Error("crypto live-public-qa --fixture should not call the Matterhorn server");
    const livePublicJson = readFileSync(join(livePublicDir, "matterhorn-live-public-qa.json"), "utf8");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(livePublicJson)) {
      throw new Error("live public QA evidence leaked token or secret-shaped fields");
    }
    console.log("PASS crypto live-public-qa CLI writes offline fixture evidence");

    // 7. The Hermes customer QA helper is exposed through the public CLI and
    // prints a public/redacted command plan without calling the server.
    const hermesQaRequestsBefore = mock.requests.length;
    await expectCli(
      "crypto hermes-customer-qa dry-run",
      mock.url,
      ["crypto", "hermes-customer-qa", "--dry-run"],
      (payload) => {
        if (payload.version !== "matterhorn.crypto.hermes-customer-qa.v1") {
          throw new Error(`expected Hermes QA helper version, got ${payload.version}`);
        }
        if (payload.safety?.acceptsSecrets !== false) throw new Error("expected Hermes QA acceptsSecrets=false");
        if (payload.safety?.canSubmit !== false) throw new Error("expected Hermes QA canSubmit=false");
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected Hermes QA liveSubmissionEnabled=false");
        if (!Array.isArray(payload.commands) || payload.commands.length < 8) throw new Error("expected Hermes QA commands");
        const commandText = payload.commands.map((command) => command.command).join("\n");
        if (!commandText.includes("matterhorn-work crypto live-public-qa")) throw new Error("expected Hermes QA live-public-qa command");
        if (!commandText.includes("matterhorn-work crypto customer-packet")) throw new Error("expected Hermes QA customer-packet command");
      },
    );
    if (mock.requests.length !== hermesQaRequestsBefore) throw new Error("crypto hermes-customer-qa should not call the Matterhorn server");
    console.log("PASS crypto hermes-customer-qa CLI prints offline command plan");

    // 8. The official SDK doctor is exposed through the public CLI without
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

    // 9. The official SDK normalizer is exposed through the public CLI for
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

    // 10. The official SDK capture harness is exposed through the public CLI for
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

    // 11. The official SDK evidence validator is exposed through the public CLI
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

    // 12. The official SDK operator loop is exposed through the public CLI without
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

    const sdkPublicRequestsBefore = mock.requests.length;
    const sdkPublicOutputDir = mkdtempSync(join(tmpdir(), "matterhorn-crypto-sdk-public-cli-"));
    await expectCli(
      "crypto sdk-validate-public fixture",
      mock.url,
      [
        "crypto",
        "sdk-validate-public",
        "--mode",
        "fixture",
        "--input-dir",
        join(repoRoot, "qa-fixtures/market-official-sdk"),
        "--output-dir",
        sdkPublicOutputDir,
        "--strict",
      ],
      (payload) => {
        if (payload.version !== "matterhorn.market.official-sdk-public-validation.v1") {
          throw new Error(`expected SDK public validation version, got ${payload.version}`);
        }
        if (payload.ready !== true) throw new Error(`expected SDK public validation ready=true, got ${payload.ready}`);
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected SDK public validation liveSubmissionEnabled=false");
        if (payload.safety?.signsOrSubmits !== false) throw new Error("expected SDK public validation signsOrSubmits=false");
        if (payload.safety?.acceptsSecrets !== false) throw new Error("expected SDK public validation acceptsSecrets=false");
        if (!payload.files?.publicValidationJson || !existsSync(payload.files.publicValidationJson)) {
          throw new Error("expected SDK public validation JSON evidence file");
        }
        if (!payload.files?.publicValidationSha256 || !existsSync(payload.files.publicValidationSha256)) {
          throw new Error("expected SDK public validation SHA-256 file");
        }
      },
    );
    if (mock.requests.length !== sdkPublicRequestsBefore) throw new Error("crypto sdk-validate-public should not call the Matterhorn server");
    const sdkPublicReport = readFileSync(join(sdkPublicOutputDir, "matterhorn-market-sdk-public-validation.json"), "utf8");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(sdkPublicReport)) {
      throw new Error("SDK public validation report leaked token or secret-shaped fields");
    }
    console.log("PASS crypto sdk-validate-public CLI is offline and non-custodial");

    const sdkManifestRequestsBefore = mock.requests.length;
    const bundleSdkManifestCheckPath = join(sdkOutputDir, "matterhorn-market-sdk-manifest-check.json");
    await expectCli(
      "crypto sdk-manifest-check",
      mock.url,
      ["crypto", "sdk-manifest-check", "--manifest", sdkLoop.files.runManifest, "--output", bundleSdkManifestCheckPath],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected SDK manifest check ok=true, got ${payload.ok}`);
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected SDK manifest safety.liveSubmissionEnabled=false");
      },
    );
    if (mock.requests.length !== sdkManifestRequestsBefore) throw new Error("crypto sdk-manifest-check should not call the Matterhorn server");
    console.log("PASS crypto sdk-manifest-check CLI is offline and non-custodial");

    // 13. The customer evidence bundle is also available through the public
    // crypto CLI and stays offline.
    const bundleRequestsBefore = mock.requests.length;
    const smokePath = join(sdkOutputDir, "customer-ready-smoke.json");
    const bundleMarkdownPath = join(sdkOutputDir, "matterhorn-market-customer-evidence.md");
    const bundleJsonPath = join(sdkOutputDir, "matterhorn-market-customer-evidence.json");
    const bundleReceiptCheckPath = join(sdkOutputDir, "matterhorn-market-receipt-check.json");
    const bundleArtifactReconciliationPath = join(sdkOutputDir, "matterhorn-market-artifact-reconciliation.json");
    writeFileSync(smokePath, JSON.stringify({
      ready: true,
      metadata: { generatedAt: "2026-06-17T00:00:00.000Z", gitSha: "c".repeat(40), gitBranch: "codex/test" },
      summary: { pass: 28, fail: 0, skip: 0 },
      stages: [
        { id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" },
        { id: "crypto.direct_prompt_safety", label: "Direct venue credential prompt safety", status: "pass" },
        { id: "crypto.shared_card_contract", label: "Unified crypto shared-card contract", status: "pass" },
        { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
        { id: "market.official_sdk_validation", label: "Official SDK validation", status: "pass" },
        { id: "market.artifact_reconciliation", label: "Market artifact reconciliation evidence", status: "pass" },
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
    writeFileSync(bundleArtifactReconciliationPath, JSON.stringify({
      version: "matterhorn.market.artifact-reconciliation.v1",
      ready: true,
      venues: [
        {
          venue: "hyperliquid",
          present: true,
          ready: true,
          status: "accepted_public_metadata",
          receiptCandidate: { version: "matterhorn.market.receipt.v1", venue: "hyperliquid", status: "received", action: "place_order" },
        },
      ],
      errors: [],
      warnings: [],
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        signsOrSubmits: false,
        acceptsSecrets: false,
        publicMetadataOnly: true,
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
      "--sdk-manifest-check",
      bundleSdkManifestCheckPath,
      "--require-sdk-manifest-check",
      "--receipt-check",
      bundleReceiptCheckPath,
      "--require-receipt-check",
      "--artifact-reconciliation",
      bundleArtifactReconciliationPath,
      "--require-artifact-reconciliation",
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
    if (!/SDK Run Manifest Evidence/.test(bundleMarkdown)) {
      throw new Error("expected customer bundle to include SDK run manifest-check evidence");
    }
    if (!/Artifact Reconciliation Evidence/.test(bundleMarkdown)) {
      throw new Error("expected customer bundle to include artifact reconciliation evidence");
    }
    if (bundleJson.operatorSummary?.present !== true) throw new Error("expected customer bundle JSON to include operatorSummary.present=true");
    if (bundleJson.sdkManifestCheck?.ready !== true) throw new Error("expected customer bundle JSON to include sdkManifestCheck.ready=true");
    if (bundleJson.receiptCheck?.ready !== true) throw new Error("expected customer bundle JSON to include receiptCheck.ready=true");
    if (bundleJson.artifactReconciliation?.ready !== true) throw new Error("expected customer bundle JSON to include artifactReconciliation.ready=true");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(bundleMarkdown)) {
      throw new Error("customer evidence bundle leaked token or secret-shaped fields");
    }
    console.log("PASS crypto evidence-bundle CLI is offline and non-custodial");

    const verifyRequestsBefore = mock.requests.length;
    const bundleVerifyPath = join(sdkOutputDir, "matterhorn-market-customer-evidence-verify.json");
    await expectCli(
      "crypto evidence-verify",
      mock.url,
      [
        "crypto",
        "evidence-verify",
        "--bundle-json",
        bundleJsonPath,
        "--bundle-md",
        bundleMarkdownPath,
        "--require-sdk-manifest-check",
        "--require-receipt-check",
        "--require-artifact-reconciliation",
        "--output",
        bundleVerifyPath,
        "--strict",
      ],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected customer evidence verify ok=true, got ${payload.ok}`);
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected verifier safety.liveSubmissionEnabled=false");
      },
    );
    if (mock.requests.length !== verifyRequestsBefore) throw new Error("crypto evidence-verify should not call the Matterhorn server");
    const verifyJson = JSON.parse(readFileSync(bundleVerifyPath, "utf8"));
    if (verifyJson.ready !== true) throw new Error("expected customer evidence verifier output ready=true");
    console.log("PASS crypto evidence-verify CLI is offline and non-custodial");

    const packetRequestsBefore = mock.requests.length;
    const bittensorBundlePath = join(sdkOutputDir, "matterhorn-bittensor-customer-evidence.json");
    const bittensorBundleMarkdownPath = join(sdkOutputDir, "matterhorn-bittensor-customer-evidence.md");
    const bittensorVerifyPath = join(sdkOutputDir, "matterhorn-bittensor-customer-evidence-verify.json");
    const customerPacketMarkdownPath = join(sdkOutputDir, "matterhorn-crypto-customer-packet.md");
    const customerPacketJsonPath = join(sdkOutputDir, "matterhorn-crypto-customer-packet.json");
    writeFileSync(bittensorBundlePath, JSON.stringify({
      ready: true,
      bittensor: { ready: true, detail: "7 passed, 0 failed", passedStages: ["Wallet snapshot"], failedStages: [] },
      agentControl: { ready: true, detail: "4 passed, 0 failed" },
      ci: { total: 3, passed: ["Matterhorn Work Tests"], failed: [], pending: [] },
      readinessGate: { ready: true, detail: "Readiness gate says ready" },
      readonlyAdapterCanary: { ready: true },
      receiptCheck: { ready: true },
      watchAutopilotScheduler: { ready: true },
    }));
    writeFileSync(bittensorBundleMarkdownPath, [
      "# Matterhorn Work Bittensor Customer Evidence Bundle",
      "",
      "## Decision",
      "",
      "- Result: READY_FOR_TEST_CUSTOMERS",
      "",
      "## Gate Summary",
      "",
      "## Before Customer Demo",
      "",
    ].join("\n"));
    await expectCli(
      "crypto bittensor-evidence-verify",
      mock.url,
      [
        "crypto",
        "bittensor-evidence-verify",
        "--bundle-json",
        bittensorBundlePath,
        "--bundle-md",
        bittensorBundleMarkdownPath,
        "--require-receipt-check",
        "--require-readonly-adapter-canary",
        "--require-watch-autopilot-scheduler",
        "--output",
        bittensorVerifyPath,
        "--strict",
      ],
      (payload) => {
        if (payload.ok !== true) throw new Error(`expected Bittensor evidence verify ok=true, got ${payload.ok}`);
        if (payload.safety?.liveSubmissionEnabled !== false) throw new Error("expected Bittensor verifier safety.liveSubmissionEnabled=false");
      },
    );
    if (mock.requests.length !== packetRequestsBefore) throw new Error("crypto bittensor-evidence-verify should not call the Matterhorn server");
    const packetResult = await runCli(mock.url, [
      "crypto",
      "customer-packet",
      "--customer-ready-smoke",
      smokePath,
      "--market-evidence-verify",
      bundleVerifyPath,
      "--bittensor-evidence-bundle",
      bittensorBundlePath,
      "--require-market-evidence",
      "--require-bittensor-evidence",
      "--output",
      customerPacketMarkdownPath,
      "--json-output",
      customerPacketJsonPath,
      "--strict",
    ]);
    if (packetResult.code !== 0) throw new Error(`crypto customer-packet exited ${packetResult.code}. stdout=${packetResult.stdout} stderr=${packetResult.stderr}`);
    if (mock.requests.length !== packetRequestsBefore) throw new Error("crypto customer-packet should not call the Matterhorn server");
    const packetMarkdown = readFileSync(customerPacketMarkdownPath, "utf8");
    const packetJson = JSON.parse(readFileSync(customerPacketJsonPath, "utf8"));
    if (!/READY_FOR_TEST_CUSTOMER_QA/.test(packetMarkdown)) throw new Error("expected customer packet markdown to be ready");
    if (packetJson.ready !== true) throw new Error("expected customer packet JSON ready=true");
    if (packetJson.marketEvidence?.ready !== true) throw new Error("expected customer packet market evidence ready=true");
    if (packetJson.bittensorEvidence?.ready !== true) throw new Error("expected customer packet Bittensor evidence ready=true");
    if (/test-client-token|privateKey|mnemonic|signedPayload|walletExport|apiSecret|rawSignature/i.test(packetMarkdown)) {
      throw new Error("customer packet leaked token or secret-shaped fields");
    }
    console.log("PASS crypto customer-packet CLI is offline and non-custodial");

    // 14. The public market receipt checker is available through the crypto CLI
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

    // 15. No request touched a submit/sign/exchange route.
    const expectedServerRoutes = new Set([
      "/api/crypto/chat/execute",
      "/api/crypto/readiness",
      "/api/hyperliquid/orders/external-sign-request",
      "/api/hyperliquid/orders/external-artifact/validate",
      "/api/polymarket/orders/external-sign-request",
      "/api/polymarket/orders/external-artifact/validate",
    ]);
    for (const entry of mock.requests) {
      if (FORBIDDEN_ROUTE_RE.test(entry.path)) throw new Error(`crypto CLI reached a forbidden route: ${entry.path}`);
      if (!expectedServerRoutes.has(entry.path)) throw new Error(`crypto CLI reached an unexpected route: ${entry.path}`);
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
