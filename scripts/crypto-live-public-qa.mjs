#!/usr/bin/env node

/**
 * Matterhorn Work live public-data QA pack.
 *
 * Builds a customer-safe evidence bundle for Bittensor + Hyperliquid +
 * Polymarket live-read demos. Missing public live inputs are treated as a
 * fixture fallback, not a product failure. This script never signs, never
 * submits, never accepts custody material, and never persists client tokens.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase)$/i;
const FORBIDDEN_PAYLOAD_RE =
  /(apiSecret|api_secret|privateKey|private_key|seedPhrase|seed_phrase|mnemonic|rawSignature|raw_signature|signedPayload|signed_payload|signedOrder|signed_order|walletExport|wallet_export|"signature"\s*:)/i;

function readArg(name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function readFlag(name) {
  return args.includes(name);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Work live public-data QA pack",
    "",
    "Usage:",
    "  node scripts/crypto-live-public-qa.mjs --output-dir <dir> [--strict] [--json]",
    "  matterhorn-work crypto live-public-qa --output-dir <dir> --strict --json",
    "  matterhorn-work crypto live-public-qa --output-dir <dir> --fixture --json",
    "",
    "Optional live public inputs:",
    "  --server-url <url> --token <client-token>",
    "  --ss58-address <public-coldkey> --validator-hotkey <public-validator-hotkey>",
    "  --netuid 14 --amount-tao 1 --rate-tolerance 0.01",
    "",
    "Optional evidence attachments:",
    "  --customer-ready-smoke <path-to-json>",
    "  --market-evidence-verify <path-to-json>",
    "  --bittensor-evidence-verify <path-to-json>",
    "  --customer-packet <path-to-json>",
    "",
    "Outputs:",
    "  matterhorn-live-public-qa.json",
    "  matterhorn-live-public-qa.md",
    "  matterhorn-live-public-qa.sha256",
    "",
  ].join("\n"));
}

function assertNoForbiddenArgs() {
  for (const item of args) {
    if (FORBIDDEN_ARG_RE.test(item.split("=")[0] || item)) {
      throw new Error(`Forbidden credential-shaped flag ${item.split("=")[0]} is not accepted by live public QA.`);
    }
  }
}

function assertNoForbiddenPayload(value, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (FORBIDDEN_PAYLOAD_RE.test(serialized || "")) {
    throw new Error(`${label} contained secret-shaped fields or signing material.`);
  }
}

function gitValue(argsForGit) {
  const result = spawnSync("git", argsForGit, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonFile(path, label) {
  const raw = readFileSync(path, "utf8");
  assertNoForbiddenPayload(raw, label);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function summarizeReport(value) {
  if (!value || typeof value !== "object") return "Attached public evidence.";
  if (typeof value.ready === "boolean") return value.ready ? "Ready report attached." : "Not-ready report attached.";
  if (typeof value.ok === "boolean") return value.ok ? "OK report attached." : "Non-OK report attached.";
  if (value.summary && typeof value.summary === "object") {
    return `Summary attached: ${JSON.stringify(value.summary)}`;
  }
  return "Attached public evidence.";
}

function childCommandDisplay(script, options) {
  return [
    "node",
    `scripts/${script}`,
    "--server-url <server-url>",
    "--token <client-token>",
    ...options,
  ].join(" ");
}

function marketExecutionChainApiCommand() {
  return [
    "curl -sS",
    "\"<server-url>/api/crypto/market-execution-chain\"",
    "-H \"Authorization: Bearer <client-token>\"",
  ].join(" ");
}

function marketSdkValidationApiCommand() {
  return [
    "curl -sS",
    "\"<server-url>/api/crypto/market-sdk-validation\"",
    "-H \"Authorization: Bearer <client-token>\"",
  ].join(" ");
}

function runNodeJson(script, commandArgs, label) {
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts", script), ...commandArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: "fail",
      error: `${label} exited ${result.status ?? "unknown"}`,
      stderr: String(result.stderr || "").split("\n").slice(0, 6).join("\n"),
    };
  }
  assertNoForbiddenPayload(result.stdout, label);
  try {
    return { status: "pass", report: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      status: "fail",
      error: `${label} did not emit JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function fetchJson(url, token, label) {
  let response;
  let raw;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    raw = await response.text();
  } catch (error) {
    return {
      status: "fail",
      error: `${label} request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  assertNoForbiddenPayload(raw, label);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "fail",
      error: `${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`,
      stderr: raw.slice(0, 1000),
    };
  }
  if (!response.ok) {
    return {
      status: "fail",
      error: `${label} returned HTTP ${response.status}`,
      report: parsed,
    };
  }
  return { status: "pass", report: parsed };
}

function validateMarketExecutionChainReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["Execution-chain response was not an object."];
  }
  if (report.success !== true) errors.push("Execution-chain response did not set success:true.");
  const guide = report.guide;
  if (!guide || typeof guide !== "object") {
    return [...errors, "Execution-chain response did not include guide."];
  }
  if (guide.version !== "matterhorn.market.execution-chain-guide.v1") {
    errors.push(`Unexpected execution-chain version ${String(guide.version || "")}.`);
  }
  const safety = guide.safety || {};
  const expectedFalse = ["canSubmit", "liveSubmissionEnabled", "acceptsSecrets", "acceptsRawSignatures", "acceptsSignedPayloads"];
  for (const key of expectedFalse) {
    if (safety[key] !== false) errors.push(`Execution-chain safety.${key} must be false.`);
  }
  if (safety.nonCustodial !== true) errors.push("Execution-chain safety.nonCustodial must be true.");
  if (safety.externalSignerRequired !== true) errors.push("Execution-chain safety.externalSignerRequired must be true.");
  const stages = Array.isArray(guide.stages) ? guide.stages : [];
  if (stages.length < 5) errors.push("Execution-chain guide must include at least five stages.");
  const stageIds = new Set(stages.map((stage) => stage?.id));
  for (const id of ["preview_handoff", "external_sign_request", "redacted_artifact_validation", "artifact_reconciliation", "public_receipt_import"]) {
    if (!stageIds.has(id)) errors.push(`Execution-chain guide is missing stage ${id}.`);
  }
  return errors;
}

function validateMarketSdkValidationReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["SDK-validation response was not an object."];
  }
  if (report.success !== true) errors.push("SDK-validation response did not set success:true.");
  const guide = report.guide;
  if (!guide || typeof guide !== "object") {
    return [...errors, "SDK-validation response did not include guide."];
  }
  if (guide.version !== "matterhorn.market.sdk-validation-guide.v1") {
    errors.push(`Unexpected SDK-validation version ${String(guide.version || "")}.`);
  }
  const modes = Array.isArray(guide.modes) ? guide.modes : [];
  for (const mode of ["fixture", "operator_owned_fixture", "operator_owned_testnet"]) {
    if (!modes.includes(mode)) errors.push(`SDK-validation guide is missing mode ${mode}.`);
  }
  const hyperliquidNetworks = Array.isArray(guide.networks?.hyperliquid) ? guide.networks.hyperliquid : [];
  const polymarketNetworks = Array.isArray(guide.networks?.polymarket) ? guide.networks.polymarket : [];
  if (!hyperliquidNetworks.includes("hyperliquid-testnet")) {
    errors.push("SDK-validation guide is missing Hyperliquid testnet network.");
  }
  if (!polymarketNetworks.includes("polygon-amoy")) {
    errors.push("SDK-validation guide is missing Polygon Amoy network.");
  }
  const safety = guide.safety || {};
  const expectedFalse = [
    "canSubmit",
    "liveSubmissionEnabled",
    "acceptsSecrets",
    "acceptsRawSignatures",
    "acceptsSignedPayloads",
    "runsPrivateSdkSigning",
    "computesFinalSignatures",
    "callsExchanges",
  ];
  for (const key of expectedFalse) {
    if (safety[key] !== false) errors.push(`SDK-validation safety.${key} must be false.`);
  }
  if (safety.nonCustodial !== true) errors.push("SDK-validation safety.nonCustodial must be true.");
  const commands = guide.commands || {};
  for (const key of ["doctor", "fixtureValidation", "operatorOwnedTestnetValidation", "operatorLoop"]) {
    if (typeof commands[key] !== "string" || commands[key].length === 0) {
      errors.push(`SDK-validation guide is missing command ${key}.`);
    }
  }
  return errors;
}

function stageSkip(id, label, reason, command) {
  return {
    id,
    label,
    status: "SKIPPED_WITH_FIXTURE_FALLBACK",
    reason,
    command,
  };
}

function stageFromAttachment(id, label, path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return {
      id,
      label,
      status: "fail",
      error: `Evidence file was not found: ${resolved}`,
    };
  }
  const raw = readFileSync(resolved, "utf8");
  assertNoForbiddenPayload(raw, label);
  const parsed = readJsonFile(resolved, label);
  return {
    id,
    label,
    status: "pass",
    evidencePath: resolved,
    evidenceSha256: sha256Text(raw),
    summary: summarizeReport(parsed),
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Matterhorn Work Live Public-Data QA",
    "",
    `- Status: ${report.status}`,
    `- Generated: ${report.generatedAt}`,
    `- Git SHA: ${report.git.sha || "unknown"}`,
    `- Git branch: ${report.git.branch || "unknown"}`,
    "",
    "## Safety",
    "",
    "- Non-custodial: yes",
    "- Live submission: off",
    "- Signs or submits: no",
    "- Secret inputs accepted: no",
    "- Public inputs only: yes",
    "",
    "Do not use seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or real customer funds in this QA pack.",
    "",
    "## Inputs",
    "",
    `- Server URL configured: ${report.inputs.serverUrlConfigured ? "yes" : "no"}`,
    `- Client token configured: ${report.inputs.tokenConfigured ? "yes" : "no"}`,
    `- Public SS58/coldkey configured: ${report.inputs.ss58AddressConfigured ? "yes" : "no"}`,
    `- Public validator hotkey configured: ${report.inputs.validatorHotkeyConfigured ? "yes" : "no"}`,
    `- Netuid: ${report.inputs.netuid}`,
    `- Amount TAO: ${report.inputs.amountTao}`,
    `- Rate tolerance: ${report.inputs.rateTolerance}`,
    "",
    "## Stages",
    "",
    "| Stage | Status | Evidence | Notes |",
    "| --- | --- | --- | --- |",
  ];
  for (const stage of report.stages) {
    const evidence = stage.evidencePath ? basename(stage.evidencePath) : stage.artifact ? basename(stage.artifact) : "";
    const notes = stage.summary || stage.reason || stage.error || "";
    lines.push(`| ${stage.label} | ${stage.status} | ${evidence} | ${notes.replace(/\|/g, "\\|")} |`);
  }
  lines.push(
    "",
    "## Re-run",
    "",
    "```bash",
    "matterhorn-work crypto live-public-qa --output-dir <dir> --strict --json",
    "```",
    "",
    "Add only public live inputs when available:",
    "",
    "```bash",
    "matterhorn-work crypto live-public-qa \\",
    "  --output-dir /tmp/matterhorn-live-public-qa \\",
    "  --server-url \"$MATTERHORN_WORK_SERVER_URL\" \\",
    "  --token \"$MATTERHORN_WORK_TOKEN\" \\",
    "  --ss58-address \"$MATTERHORN_WORK_BITTENSOR_SS58\" \\",
    "  --validator-hotkey \"$MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY\" \\",
    "  --netuid 14 --amount-tao 1 --rate-tolerance 0.01 \\",
    "  --strict --json",
    "```",
    "",
  );
  return lines.join("\n");
}

async function main() {
  if (readFlag("--help") || readFlag("-h")) {
    printHelp();
    return;
  }

  assertNoForbiddenArgs();

  const outputDir = resolve(readArg("--output-dir", process.env.MATTERHORN_WORK_LIVE_PUBLIC_QA_DIR || join(repoRoot, "qa-reports", "live-public-qa")));
  const serverUrl = (readArg("--server-url") || readArg("--openwork-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "").replace(/\/+$/, "");
  const token = readArg("--token") || readArg("--openwork-token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "";
  const ss58Address = readArg("--ss58-address") || readArg("--coldkey") || process.env.MATTERHORN_WORK_BITTENSOR_SS58 || "";
  const validatorHotkey = readArg("--validator-hotkey") || process.env.MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY || "";
  const netuid = readArg("--netuid", process.env.MATTERHORN_WORK_BITTENSOR_NETUID || "14");
  const amountTao = readArg("--amount-tao", process.env.MATTERHORN_WORK_BITTENSOR_AMOUNT_TAO || "1");
  const rateTolerance = readArg("--rate-tolerance", process.env.MATTERHORN_WORK_BITTENSOR_RATE_TOLERANCE || "0.01");
  const customerReadySmoke = readArg("--customer-ready-smoke", "");
  const marketEvidenceVerify = readArg("--market-evidence-verify", "");
  const bittensorEvidenceVerify = readArg("--bittensor-evidence-verify", "");
  const customerPacket = readArg("--customer-packet", "");
  const strict = readFlag("--strict");
  const outputJson = readFlag("--json");
  const fixtureMode = readFlag("--fixture") || readFlag("--fixture-fallback");

  mkdirSync(outputDir, { recursive: true });

  const stages = [];
  if (customerReadySmoke) {
    stages.push(stageFromAttachment("customer_crypto_smoke", "Customer crypto smoke evidence", customerReadySmoke));
  } else {
    stages.push(stageSkip(
      "customer_crypto_smoke",
      "Customer crypto smoke evidence",
      "No customer-ready smoke JSON was provided. Attach one with --customer-ready-smoke after running pnpm smoke:customer-ready-crypto.",
      "pnpm smoke:customer-ready-crypto",
    ));
  }

  if (marketEvidenceVerify) {
    stages.push(stageFromAttachment("market_evidence_verify", "Market evidence verification", marketEvidenceVerify));
  } else {
    stages.push(stageSkip(
      "market_evidence_verify",
      "Market evidence verification",
      "No market evidence verification JSON was provided. Attach one with --market-evidence-verify after running matterhorn-work crypto evidence-verify.",
      "matterhorn-work crypto evidence-verify --bundle-json <path> --bundle-md <path> --strict --json",
    ));
  }

  if (bittensorEvidenceVerify) {
    stages.push(stageFromAttachment("bittensor_evidence_verify", "Bittensor evidence verification", bittensorEvidenceVerify));
  } else {
    stages.push(stageSkip(
      "bittensor_evidence_verify",
      "Bittensor evidence verification",
      "No Bittensor evidence verification JSON was provided. Attach one with --bittensor-evidence-verify after running matterhorn-work crypto bittensor-evidence-verify.",
      "matterhorn-work crypto bittensor-evidence-verify --bundle-json <path> --bundle-md <path> --strict --json",
    ));
  }

  if (customerPacket) {
    stages.push(stageFromAttachment("crypto_customer_packet", "Crypto customer packet evidence", customerPacket));
  } else {
    stages.push(stageSkip(
      "crypto_customer_packet",
      "Crypto customer packet evidence",
      "No top-level customer packet JSON was provided. Attach one with --customer-packet after running matterhorn-work crypto customer-packet.",
      "matterhorn-work crypto customer-packet --customer-ready-smoke <path> --output <path> --json-output <path> --strict",
    ));
  }

  if (!fixtureMode && serverUrl && token) {
    const market = runNodeJson("market-live-readonly-smoke.mjs", [
      "--server-url",
      serverUrl,
      "--token",
      token,
      "--strict",
      "--json",
    ], "Market live read-only smoke");
    const artifact = join(outputDir, "matterhorn-market-live-readonly-smoke.json");
    if (market.report) writeFileSync(artifact, JSON.stringify(market.report, null, 2) + "\n");
    stages.push({
      id: "market_live_readonly_smoke",
      label: "Hyperliquid/Polymarket live read-only smoke",
      status: market.status,
      ...(market.report ? { artifact, summary: summarizeReport(market.report) } : {}),
      ...(market.error ? { error: market.error, stderr: market.stderr } : {}),
      command: childCommandDisplay("market-live-readonly-smoke.mjs", ["--strict", "--json"]),
    });
  } else {
    stages.push(stageSkip(
      "market_live_readonly_smoke",
      "Hyperliquid/Polymarket live read-only smoke",
      fixtureMode
        ? "Fixture mode was requested, so live market route checks were skipped."
        : "No server URL and client token were provided, so live market route checks were skipped in fixture fallback mode.",
      childCommandDisplay("market-live-readonly-smoke.mjs", ["--strict", "--json"]),
    ));
  }

  if (!fixtureMode && serverUrl && token) {
    const chain = await fetchJson(`${serverUrl}/api/crypto/market-execution-chain`, token, "Market execution-chain API");
    const artifact = join(outputDir, "matterhorn-market-execution-chain.json");
    if (chain.report) writeFileSync(artifact, JSON.stringify(chain.report, null, 2) + "\n");
    const validationErrors = chain.report ? validateMarketExecutionChainReport(chain.report) : [];
    const chainStatus = chain.status === "pass" && validationErrors.length === 0 ? "pass" : "fail";
    stages.push({
      id: "market_execution_chain_api",
      label: "Market execution-chain API",
      status: chainStatus,
      ...(chain.report ? {
        artifact,
        summary: chainStatus === "pass"
          ? `${chain.report.guide?.version || "execution-chain"} with ${chain.report.guide?.stages?.length || 0} safe stages.`
          : "Execution-chain API returned an invalid safety contract.",
      } : {}),
      ...(chain.error ? { error: chain.error, stderr: chain.stderr } : {}),
      ...(validationErrors.length ? { errors: validationErrors } : {}),
      command: marketExecutionChainApiCommand(),
    });
  } else {
    stages.push(stageSkip(
      "market_execution_chain_api",
      "Market execution-chain API",
      fixtureMode
        ? "Fixture mode was requested, so the live execution-chain route check was skipped."
        : "No server URL and client token were provided, so the live execution-chain route check was skipped in fixture fallback mode.",
      marketExecutionChainApiCommand(),
    ));
  }

  if (!fixtureMode && serverUrl && token) {
    const sdkValidation = await fetchJson(`${serverUrl}/api/crypto/market-sdk-validation`, token, "Market SDK-validation API");
    const artifact = join(outputDir, "matterhorn-market-sdk-validation.json");
    if (sdkValidation.report) writeFileSync(artifact, JSON.stringify(sdkValidation.report, null, 2) + "\n");
    const validationErrors = sdkValidation.report ? validateMarketSdkValidationReport(sdkValidation.report) : [];
    const sdkStatus = sdkValidation.status === "pass" && validationErrors.length === 0 ? "pass" : "fail";
    stages.push({
      id: "market_sdk_validation_api",
      label: "Market SDK-validation API",
      status: sdkStatus,
      ...(sdkValidation.report ? {
        artifact,
        summary: sdkStatus === "pass"
          ? `${sdkValidation.report.guide?.version || "sdk-validation"} with ${(sdkValidation.report.guide?.modes || []).length} public validation modes.`
          : "SDK-validation API returned an invalid safety contract.",
      } : {}),
      ...(sdkValidation.error ? { error: sdkValidation.error, stderr: sdkValidation.stderr } : {}),
      ...(validationErrors.length ? { errors: validationErrors } : {}),
      command: marketSdkValidationApiCommand(),
    });
  } else {
    stages.push(stageSkip(
      "market_sdk_validation_api",
      "Market SDK-validation API",
      fixtureMode
        ? "Fixture mode was requested, so the live SDK-validation route check was skipped."
        : "No server URL and client token were provided, so the live SDK-validation route check was skipped in fixture fallback mode.",
      marketSdkValidationApiCommand(),
    ));
  }

  if (!fixtureMode && serverUrl && token && ss58Address && validatorHotkey) {
    const bittensor = runNodeJson("bittensor-live-qa.mjs", [
      "--server-url",
      serverUrl,
      "--token",
      token,
      "--ss58-address",
      ss58Address,
      "--validator-hotkey",
      validatorHotkey,
      "--netuid",
      netuid,
      "--amount-tao",
      amountTao,
      "--rate-tolerance",
      rateTolerance,
      "--strict",
      "--json",
    ], "Bittensor live QA");
    const artifact = join(outputDir, "matterhorn-bittensor-live-qa.json");
    if (bittensor.report) writeFileSync(artifact, JSON.stringify(bittensor.report, null, 2) + "\n");
    stages.push({
      id: "bittensor_live_qa",
      label: "Bittensor live public wallet/stake QA",
      status: bittensor.status,
      ...(bittensor.report ? { artifact, summary: summarizeReport(bittensor.report) } : {}),
      ...(bittensor.error ? { error: bittensor.error, stderr: bittensor.stderr } : {}),
      command: childCommandDisplay("bittensor-live-qa.mjs", [
        "--ss58-address <public-coldkey>",
        "--validator-hotkey <public-validator-hotkey>",
        "--netuid 14",
        "--amount-tao 1",
        "--rate-tolerance 0.01",
        "--strict",
        "--json",
      ]),
    });
  } else {
    stages.push(stageSkip(
      "bittensor_live_qa",
      "Bittensor live public wallet/stake QA",
      fixtureMode
        ? "Fixture mode was requested, so live Bittensor route checks were skipped."
        : "No complete public Bittensor input set was provided. Supply server URL, client token, public SS58/coldkey, and public validator hotkey to run this stage live.",
      childCommandDisplay("bittensor-live-qa.mjs", [
        "--ss58-address <public-coldkey>",
        "--validator-hotkey <public-validator-hotkey>",
        "--netuid 14",
        "--amount-tao 1",
        "--rate-tolerance 0.01",
        "--strict",
        "--json",
      ]),
    ));
  }

  const failed = stages.filter((stage) => stage.status === "fail");
  const skipped = stages.filter((stage) => stage.status === "SKIPPED_WITH_FIXTURE_FALLBACK");
  const passed = stages.filter((stage) => stage.status === "pass");
  const status = failed.length
    ? "NOT_READY"
    : skipped.length
      ? "SKIPPED_WITH_FIXTURE_FALLBACK"
      : "READY";

  const report = {
    version: "matterhorn.crypto.live-public-qa.v1",
    status,
    ready: failed.length === 0,
    generatedAt: new Date().toISOString(),
    mode: skipped.length ? "fixture_fallback" : "live_public",
    fixtureMode,
    git: {
      sha: gitValue(["rev-parse", "HEAD"]),
      branch: gitValue(["branch", "--show-current"]),
    },
    command: "matterhorn-work crypto live-public-qa --output-dir <dir> --strict --json",
    outputDir,
    inputs: {
      serverUrlConfigured: Boolean(serverUrl),
      tokenConfigured: Boolean(token),
      ss58AddressConfigured: Boolean(ss58Address),
      validatorHotkeyConfigured: Boolean(validatorHotkey),
      netuid,
      amountTao,
      rateTolerance,
    },
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
      acceptsSigningMaterial: false,
      publicInputsOnly: true,
      marketPreviewsCanSubmit: false,
    },
    summary: {
      pass: passed.length,
      fail: failed.length,
      skippedWithFixtureFallback: skipped.length,
    },
    stages,
    files: {
      json: join(outputDir, "matterhorn-live-public-qa.json"),
      markdown: join(outputDir, "matterhorn-live-public-qa.md"),
      sha256: join(outputDir, "matterhorn-live-public-qa.sha256"),
    },
  };

  assertNoForbiddenPayload(report, "live public QA report");

  const json = JSON.stringify(report, null, 2) + "\n";
  const markdown = renderMarkdown(report);
  writeFileSync(report.files.json, json);
  writeFileSync(report.files.markdown, markdown);
  writeFileSync(report.files.sha256, `${sha256Text(json)}  matterhorn-live-public-qa.json\n`);

  if (outputJson) {
    process.stdout.write(json);
  } else {
    process.stdout.write(`Matterhorn Work live public-data QA: ${status}\n`);
    process.stdout.write(`Evidence: ${report.files.json}\n`);
  }

  if (strict && failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
