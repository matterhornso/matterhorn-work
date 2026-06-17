#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const MANIFEST_VERSION = "matterhorn.market.sdk.run-manifest.v1";
const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signedPayload|signed_payload|signedAction|signed_action)$/i;
const FORBIDDEN_TEXT_RE =
  /\b(seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedAction|signed_action)\b/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1] ?? "";
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : "";
  };
  return {
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    selfTest: args.includes("--self-test"),
    manifest: value("--manifest"),
    baseDir: value("--base-dir"),
    output: value("--output") || value("-o"),
  };
}

function usage() {
  return [
    "Matterhorn market SDK run manifest checker",
    "",
    "Usage:",
    "  node scripts/market-sdk-run-manifest-check.mjs --manifest /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-run-manifest.json --strict --json",
    "  node scripts/market-sdk-run-manifest-check.mjs --self-test",
    "",
    "The checker is offline and public-data only. It re-hashes files listed in the manifest and rejects secret-shaped keys/content.",
  ].join("\n");
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!isRecord(value) && !Array.isArray(value)) return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    // EIP-712 typed-data uses signatureType as public metadata, not signing material.
    if (key !== "signatureType" && FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden secret-shaped field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

function readJson(path, label) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assertNoForbiddenKeys(parsed, label);
  return parsed;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveFile(entry, label, manifestPath, baseDir) {
  const candidates = [];
  if (entry?.path) candidates.push(String(entry.path));
  if (entry?.file) {
    if (baseDir) candidates.push(join(baseDir, String(entry.file)));
    candidates.push(join(dirname(manifestPath), String(entry.file)));
  }
  for (const candidate of candidates) {
    const resolved = isAbsolute(candidate) ? candidate : resolve(dirname(manifestPath), candidate);
    if (existsSync(resolved)) return resolved;
  }
  throw new Error(`Manifest file entry ${label} could not be resolved.`);
}

export function verifyMarketSdkRunManifest({ manifestPath, baseDir = "" }) {
  if (!manifestPath) throw new Error("Missing --manifest path.");
  const manifest = readJson(manifestPath, "market SDK run manifest");
  const errors = [];
  const warnings = [];
  if (manifest.version !== MANIFEST_VERSION) errors.push(`Unsupported manifest version: ${manifest.version || "missing"}.`);
  if (manifest.safety?.nonCustodial !== true) errors.push("Manifest safety must keep nonCustodial=true.");
  if (manifest.safety?.liveSubmissionEnabled !== false) errors.push("Manifest safety must keep liveSubmissionEnabled=false.");
  if (manifest.safety?.signsOrSubmits !== false) errors.push("Manifest safety must keep signsOrSubmits=false.");
  if (manifest.safety?.acceptsSecrets !== false) errors.push("Manifest safety must keep acceptsSecrets=false.");

  const fileEntries = isRecord(manifest.files) ? Object.entries(manifest.files) : [];
  if (fileEntries.length === 0) errors.push("Manifest does not list any files.");
  const files = [];
  for (const [label, entry] of fileEntries) {
    try {
      const path = resolveFile(entry, label, manifestPath, baseDir);
      const bytes = readFileSync(path);
      const actualSha256 = sha256(bytes);
      const expectedSha256 = String(entry.sha256 || "");
      const expectedBytes = Number(entry.bytes);
      const text = bytes.toString("utf8");
      if (FORBIDDEN_TEXT_RE.test(text)) errors.push(`Manifest file ${label} contains forbidden secret-shaped text.`);
      if (path.endsWith(".json")) readJson(path, `manifest file ${label}`);
      const shaMatches = expectedSha256 === actualSha256;
      const bytesMatch = Number.isFinite(expectedBytes) ? expectedBytes === bytes.length : true;
      if (!shaMatches) errors.push(`Manifest file ${label} SHA-256 mismatch.`);
      if (!bytesMatch) errors.push(`Manifest file ${label} byte count mismatch.`);
      files.push({
        label,
        file: entry.file ?? null,
        path,
        bytes: bytes.length,
        expectedBytes: Number.isFinite(expectedBytes) ? expectedBytes : null,
        bytesMatch,
        expectedSha256,
        actualSha256,
        shaMatches,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    ready: ok && manifest.ready === true,
    manifest: {
      version: manifest.version ?? null,
      status: manifest.status ?? null,
      ready: manifest.ready === true,
      ok: manifest.ok === true,
      venueCount: Array.isArray(manifest.venues) ? manifest.venues.length : 0,
      fileCount: fileEntries.length,
    },
    files,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  };
}

function runSelfTest() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-manifest-check-"));
  try {
    const evidence = join(dir, "matterhorn-market-sdk-evidence.json");
    writeFileSync(evidence, `${JSON.stringify({
      version: "matterhorn.market.official-sdk-validation.v1",
      signatureType: 0,
      safety: { nonCustodial: true, liveSubmissionEnabled: false },
    }, null, 2)}\n`);
    const bytes = readFileSync(evidence);
    const manifest = join(dir, "matterhorn-market-sdk-run-manifest.json");
    writeFileSync(manifest, `${JSON.stringify({
      version: MANIFEST_VERSION,
      status: "READY_FOR_TEST_CUSTOMER_QA",
      ready: true,
      ok: true,
      safety: { nonCustodial: true, liveSubmissionEnabled: false, signsOrSubmits: false, acceptsSecrets: false },
      venues: [{ venue: "hyperliquid" }],
      files: {
        officialSdkEvidence: {
          file: "matterhorn-market-sdk-evidence.json",
          bytes: bytes.length,
          sha256: sha256(bytes),
        },
      },
    }, null, 2)}\n`);
    const accepted = verifyMarketSdkRunManifest({ manifestPath: manifest });
    if (!accepted.ok) throw new Error(`Self-test accepted manifest failed: ${accepted.errors.join("; ")}`);
    writeFileSync(evidence, `${JSON.stringify({ privateKey: "never" })}\n`);
    const rejected = verifyMarketSdkRunManifest({ manifestPath: manifest });
    if (rejected.ok) throw new Error("Self-test secret-shaped file unexpectedly passed.");
    process.stdout.write("Market SDK run manifest checker self-test passed.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (config.selfTest) {
    runSelfTest();
    process.exit(0);
  }
  try {
    const result = verifyMarketSdkRunManifest({ manifestPath: config.manifest, baseDir: config.baseDir });
    if (config.output) writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
    if (config.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(`Market SDK run manifest: ${result.ok ? "OK" : "NOT_OK"}\n`);
      for (const file of result.files) process.stdout.write(`- ${file.label}: ${file.shaMatches ? "sha-ok" : "sha-mismatch"}\n`);
      for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
      for (const error of result.errors) process.stderr.write(`Error: ${error}\n`);
    }
    process.exit(config.strict && !result.ok ? 1 : 0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
