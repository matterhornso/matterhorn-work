#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let failures = 0;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail = "missing") {
  failures += 1;
  console.error(`FAIL ${label}`);
  console.error(`  ${detail}`);
}

function mustContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${path} contains ${needle}`);
    else fail(`${path} contains ${needle}`);
  }
  return text;
}

function mustNotContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${path} excludes ${needle}`, "present");
    else pass(`${path} excludes ${needle}`);
  }
  return text;
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["test:market-official-sdk-validation-track"] === "node scripts/market-official-sdk-validation-track.test.mjs") {
  pass("package.json exposes test:market-official-sdk-validation-track");
} else {
  fail("package.json exposes test:market-official-sdk-validation-track");
}
if (packageJson.scripts?.["test:market-official-sdk-validation-evidence"] === "node scripts/market-official-sdk-validation-evidence.mjs --self-test") {
  pass("package.json exposes test:market-official-sdk-validation-evidence");
} else {
  fail("package.json exposes test:market-official-sdk-validation-evidence");
}
if (packageJson.scripts?.["test:market-official-sdk-validation-capture"] === "node scripts/market-official-sdk-validation-capture.test.mjs") {
  pass("package.json exposes test:market-official-sdk-validation-capture");
} else {
  fail("package.json exposes test:market-official-sdk-validation-capture");
}
if (packageJson.scripts?.["test:market-official-sdk-validation-doctor"] === "node scripts/market-official-sdk-validation-doctor.test.mjs") {
  pass("package.json exposes test:market-official-sdk-validation-doctor");
} else {
  fail("package.json exposes test:market-official-sdk-validation-doctor");
}
if (packageJson.scripts?.["test:market-official-sdk-normalize"] === "node scripts/market-official-sdk-normalize.test.mjs") {
  pass("package.json exposes test:market-official-sdk-normalize");
} else {
  fail("package.json exposes test:market-official-sdk-normalize");
}
if (packageJson.scripts?.["test:market-official-sdk-operator-loop"] === "node scripts/market-official-sdk-operator-loop.test.mjs") {
  pass("package.json exposes test:market-official-sdk-operator-loop");
} else {
  fail("package.json exposes test:market-official-sdk-operator-loop");
}
if (packageJson.scripts?.["test:market-official-sdk-validation-fixtures"] === "node scripts/market-official-sdk-validation-fixtures.test.mjs") {
  pass("package.json exposes test:market-official-sdk-validation-fixtures");
} else {
  fail("package.json exposes test:market-official-sdk-validation-fixtures");
}

mustContain("docs/market-official-sdk-validation.md", [
  "Hyperliquid's official SDK",
  "hyperliquid-python-sdk",
  "@polymarket/clob-client-v2",
  "@polymarket/clob-client",
  "requiresClientValidation: true",
  "canSubmit: false",
  "externalSignerOnly: true",
  "Matterhorn must not ask for, store, log, transmit, or import seed phrases",
  "Matterhorn must not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`",
  "Testnet validation must happen outside Matterhorn's server process",
  "Redacted Matterhorn typed-data template",
  "Official-client normalized typed-data/order",
  "Hyperliquid artifacts must be public order",
  "Polymarket artifacts must expose the public EIP-712 order structure",
  "matterhorn.market.official-sdk-validation.v1",
  "matterhorn-work crypto sdk-doctor",
  "matterhorn-work crypto sdk-normalize",
  "matterhorn-work crypto sdk-loop",
  "matterhorn-work crypto evidence-bundle",
  "matterhorn-market-sdk-operator-summary.md",
  "--operator-summary <operator-summary.md>",
  "node scripts/market-official-sdk-operator-loop.mjs",
  "node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path>",
  "node scripts/market-official-sdk-validation-capture.mjs",
  "pnpm test:market-official-sdk-validation-doctor",
  "pnpm test:market-official-sdk-normalize",
  "pnpm test:market-official-sdk-operator-loop",
  "pnpm test:market-official-sdk-validation-fixtures",
]);

mustContain("scripts/market-official-sdk-validation-evidence.mjs", [
  "matterhorn.market.official-sdk-validation.v1",
  "hyperliquid-python-sdk",
  "@polymarket/clob-client-v2",
  "requiresClientValidation",
  "canSubmit: false",
  "externalSignerOnly: true",
  "clientMustCompute",
  "walletMustSet",
  "signatureType",
  "validateHyperliquidNormalizedAction",
  "validatePolymarketNormalizedOrder",
  "officialClientNormalized",
  "FORBIDDEN_CREDENTIAL_KEY_RE",
]);
const evidenceSelfTest = spawnSync("node", ["scripts/market-official-sdk-validation-evidence.mjs", "--self-test"], {
  cwd: root,
  encoding: "utf8",
});
if (evidenceSelfTest.status === 0) {
  pass("official SDK evidence validator self-test passes");
} else {
  fail("official SDK evidence validator self-test passes", evidenceSelfTest.stderr || evidenceSelfTest.stdout || "unknown error");
}

mustContain("scripts/market-official-sdk-validation-capture.mjs", [
  "operator_redacted_official_client_json",
  "validateEvidenceBundle",
  "rawSignature",
  "canSubmit",
  "liveSubmissionEnabled",
  "hyperliquid-python-sdk",
  "@polymarket/clob-client",
]);
const captureSelfTest = spawnSync("node", ["scripts/market-official-sdk-validation-capture.mjs", "--self-test"], {
  cwd: root,
  encoding: "utf8",
});
if (captureSelfTest.status === 0) {
  pass("official SDK evidence capture self-test passes");
} else {
  fail("official SDK evidence capture self-test passes", captureSelfTest.stderr || captureSelfTest.stdout || "unknown error");
}

mustContain("scripts/market-official-sdk-validation-doctor.mjs", [
  "runOfficialSdkValidationDoctor",
  "FORBIDDEN_MARKET_SDK_ENV_KEY_RE",
  "MARKET_OFFICIAL_SDK_VALIDATION_MODE",
  "HYPERLIQUID_VALIDATION_NETWORK",
  "POLYMARKET_EXCHANGE_ADDRESS",
  "liveSubmissionEnabled: false",
  "acceptsSecrets: false",
  "printsSecretValues: false",
]);
const doctorSelfTest = spawnSync("node", ["scripts/market-official-sdk-validation-doctor.test.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (doctorSelfTest.status === 0) {
  pass("official SDK validation doctor test passes");
} else {
  fail("official SDK validation doctor test passes", doctorSelfTest.stderr || doctorSelfTest.stdout || "unknown error");
}

mustContain("scripts/market-official-sdk-normalize.mjs", [
  "normalizeOfficialSdkArtifact",
  "normalizeHyperliquid",
  "normalizePolymarket",
  "FORBIDDEN_CREDENTIAL_KEY_RE",
  "operatorRedaction",
  "submissionFieldsRemoved",
]);
const normalizerSelfTest = spawnSync("node", ["scripts/market-official-sdk-normalize.test.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (normalizerSelfTest.status === 0) {
  pass("official SDK normalizer test passes");
} else {
  fail("official SDK normalizer test passes", normalizerSelfTest.stderr || normalizerSelfTest.stdout || "unknown error");
}

mustContain("scripts/market-official-sdk-operator-loop.mjs", [
  "runMarketOfficialSdkOperatorLoop",
  "runOfficialSdkValidationDoctor",
  "normalizeOfficialSdkArtifact",
  "buildCapturedEvidence",
  "buildMarketCustomerEvidenceBundle",
  "liveSubmissionEnabled: false",
  "signsOrSubmits: false",
  "matterhorn-market-sdk-operator-summary.md",
]);
const operatorLoopSelfTest = spawnSync("node", ["scripts/market-official-sdk-operator-loop.test.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (operatorLoopSelfTest.status === 0) {
  pass("official SDK operator loop test passes");
} else {
  fail("official SDK operator loop test passes", operatorLoopSelfTest.stderr || operatorLoopSelfTest.stdout || "unknown error");
}

mustContain("scripts/market-customer-evidence-bundle.mjs", [
  "--operator-summary",
  "FORBIDDEN_OPERATOR_SUMMARY_RE",
  "operatorSummary",
  "SHA-256",
]);

mustContain("qa-fixtures/market-official-sdk/README.md", [
  "hyperliquid-normalized-action.fixture.json",
  "polymarket-normalized-typed-data.fixture.json",
  "hyperliquid-forbidden-raw-signature.fixture.json",
  "polymarket-mismatched-domain.fixture.json",
  "Do not add private keys",
]);
const fixtureSelfTest = spawnSync("node", ["scripts/market-official-sdk-validation-fixtures.test.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (fixtureSelfTest.status === 0) {
  pass("official SDK fixture validation test passes");
} else {
  fail("official SDK fixture validation test passes", fixtureSelfTest.stderr || fixtureSelfTest.stdout || "unknown error");
}

mustContain("docs/hyperliquid-read-preview.md", [
  "requiresClientValidation",
  "official Hyperliquid SDK",
  "Matterhorn does **not** compute the `connectionId`",
  "canSubmit: false",
]);

mustContain("docs/polymarket-read-preview.md", [
  "requiresClientValidation",
  "@polymarket/clob-client",
  "never the signature, API key, or submission",
  "canSubmit: false",
]);

const hyperliquidTool = mustContain("apps/server/src/tools/hyperliquid.ts", [
  "requiresClientValidation: true",
  "clientMustCompute",
  "connectionId",
  "official Hyperliquid SDK",
  "canSubmit: false",
  "externalSignerOnly: true",
]);
if (/requiresClientValidation:\s*false/.test(hyperliquidTool)) fail("Hyperliquid payloads keep requiresClientValidation true", "found false");
else pass("Hyperliquid payloads keep requiresClientValidation true");
if (/canSubmit:\s*true/.test(hyperliquidTool)) fail("Hyperliquid payloads never enable canSubmit", "found true");
else pass("Hyperliquid payloads never enable canSubmit");

const polymarketTool = mustContain("apps/server/src/tools/polymarket.ts", [
  "requiresClientValidation: true",
  "walletMustSet",
  "@polymarket/clob-client",
  "POLYMARKET_EXCHANGE_ADDRESS",
  "canSubmit: false",
  "externalSignerOnly: true",
]);
if (/requiresClientValidation:\s*false/.test(polymarketTool)) fail("Polymarket payloads keep requiresClientValidation true", "found false");
else pass("Polymarket payloads keep requiresClientValidation true");
if (/canSubmit:\s*true/.test(polymarketTool)) fail("Polymarket payloads never enable canSubmit", "found true");
else pass("Polymarket payloads never enable canSubmit");

mustNotContain("apps/server/src/server.ts", [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
]);

for (const [label, text] of [["Hyperliquid", hyperliquidTool], ["Polymarket", polymarketTool]]) {
  for (const forbidden of ["privateKey =", "apiSecret =", "seedPhrase =", "mnemonic ="]) {
    if (text.includes(forbidden)) fail(`${label} SDK validation track excludes ${forbidden}`, "present");
    else pass(`${label} SDK validation track excludes ${forbidden}`);
  }
}

if (failures > 0) {
  console.error(`Market official SDK validation track gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Market official SDK validation track gate passed.");
