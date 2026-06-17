#!/usr/bin/env node
import { readFileSync } from "node:fs";

export const VERSION = "matterhorn.market.official-sdk-validation.v1";

const FORBIDDEN_CREDENTIAL_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|walletExport|wallet_export|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action|signedExtrinsic|signed_extrinsic)$/i;

const HYPERLIQUID_DOC_URL = "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api";
const HYPERLIQUID_SDK_URL = "https://github.com/hyperliquid-dex/hyperliquid-python-sdk";
const POLYMARKET_DOC_URL = "https://docs.polymarket.com/trading/overview";

const EXPECTED_POLYMARKET_CLIENTS = new Set([
  "@polymarket/clob-client-v2",
  "@polymarket/clob-client",
  "py-clob-client-v2",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(value, text) {
  return String(value ?? "").toLowerCase().includes(text.toLowerCase());
}

function findForbiddenCredentialKey(value, path = [], depth = 0) {
  if (depth > 50) return [...path, "too_deep"].join(".");
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenCredentialKey(value[index], [...path, String(index)], depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    // Polymarket's public typed-data template includes signatureType metadata.
    if (key !== "signatureType" && FORBIDDEN_CREDENTIAL_KEY_RE.test(key)) return [...path, key].join(".");
    const found = findForbiddenCredentialKey(child, [...path, key], depth + 1);
    if (found) return found;
  }
  return null;
}

export function sampleEvidence() {
  const generatedAt = new Date(0).toISOString();
  return {
    version: VERSION,
    generatedAt,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
      storesSecrets: false,
    },
    venues: [
      {
        venue: "hyperliquid",
        status: "pending_official_client_validation",
        officialClient: {
          name: "hyperliquid-python-sdk",
          packageVersion: null,
          sourceUrl: HYPERLIQUID_SDK_URL,
          docsUrl: HYPERLIQUID_DOC_URL,
        },
        environment: {
          mode: "operator_owned_testnet_or_fixture",
          network: "hyperliquid-testnet",
          apiUrl: "https://api.hyperliquid-testnet.xyz",
        },
        matterhornTemplate: {
          kind: "hyperliquid-l1-action",
          requiresClientValidation: true,
          canSubmit: false,
          externalSignerOnly: true,
          clientMustCompute: ["nonce", "connectionId", "signature"],
        },
        evidenceRequired: [
          "sdkPackageVersion",
          "testnetOrFixtureEnvironment",
          "redactedMatterhornActionTemplate",
          "officialClientNormalizedAction",
          "diffsAndCorrections",
        ],
        validation: {
          validatedAt: null,
          officialClientNormalized: null,
          differences: [],
          publicReceipt: null,
        },
      },
      {
        venue: "polymarket",
        status: "pending_official_client_validation",
        officialClient: {
          name: "@polymarket/clob-client-v2",
          packageVersion: null,
          sourceUrl: "https://www.npmjs.com/package/@polymarket/clob-client-v2",
          docsUrl: POLYMARKET_DOC_URL,
        },
        environment: {
          mode: "operator_owned_testnet_or_fixture",
          network: "polygon-amoy-or-official-client-fixture",
        },
        matterhornTemplate: {
          kind: "polymarket-eip712-order",
          requiresClientValidation: true,
          canSubmit: false,
          externalSignerOnly: true,
          walletMustSet: ["maker", "signer", "salt", "nonce", "expiration"],
          amountDecimals: 6,
        },
        evidenceRequired: [
          "sdkPackageVersion",
          "exchangeAddressAndChainId",
          "redactedMatterhornTypedDataTemplate",
          "officialClientNormalizedTypedDataOrOrder",
          "diffsAndCorrections",
        ],
        validation: {
          validatedAt: null,
          officialClientNormalized: null,
          differences: [],
          publicReceipt: null,
        },
      },
    ],
  };
}

function assertCondition(errors, condition, message) {
  if (!condition) errors.push(message);
}

function publicArtifactContent(venue, errors, label) {
  const artifact = venue.validation?.officialClientNormalized;
  assertCondition(errors, isRecord(artifact), `${label} validated evidence must include validation.officialClientNormalized.`);
  if (!isRecord(artifact)) return null;
  assertCondition(errors, typeof artifact.kind === "string" && artifact.kind.length > 0, `${label} normalized artifact must include kind.`);
  assertCondition(errors, typeof artifact.sha256 === "string" && /^[a-f0-9]{64}$/i.test(artifact.sha256), `${label} normalized artifact must include a sha256 content hash.`);
  assertCondition(errors, artifact.source === "operator_redacted_official_client_json", `${label} normalized artifact source must be operator_redacted_official_client_json.`);
  assertCondition(errors, isRecord(artifact.content), `${label} normalized artifact must include public JSON content.`);
  return isRecord(artifact.content) ? artifact.content : null;
}

function validateHyperliquidNormalizedAction(venue, errors) {
  if (venue.status !== "validated") return;
  const content = publicArtifactContent(venue, errors, "Hyperliquid");
  if (!content) return;
  const action = isRecord(content.action) ? content.action : content;
  assertCondition(errors, action.type === "order", "Hyperliquid normalized action must be an order action.");
  assertCondition(errors, action.grouping === "na" || action.grouping === "normalTpsl" || action.grouping === "positionTpsl", "Hyperliquid normalized action must include a supported grouping.");
  assertCondition(errors, Array.isArray(action.orders) && action.orders.length > 0, "Hyperliquid normalized action must include at least one order.");
  const order = Array.isArray(action.orders) ? action.orders[0] : null;
  assertCondition(errors, isRecord(order), "Hyperliquid normalized action order must be an object.");
  if (!isRecord(order)) return;
  assertCondition(errors, Number.isInteger(order.a) && order.a >= 0, "Hyperliquid order asset index `a` must be a non-negative integer.");
  assertCondition(errors, typeof order.b === "boolean", "Hyperliquid order side `b` must be boolean.");
  assertCondition(errors, typeof order.p === "string" && order.p.length > 0, "Hyperliquid order price `p` must be a string.");
  assertCondition(errors, typeof order.s === "string" && order.s.length > 0, "Hyperliquid order size `s` must be a string.");
  assertCondition(errors, typeof order.r === "boolean", "Hyperliquid order reduce-only `r` must be boolean.");
  assertCondition(errors, isRecord(order.t) && (isRecord(order.t.limit) || isRecord(order.t.trigger)), "Hyperliquid order type `t` must include limit or trigger details.");
}

function validatePolymarketNormalizedOrder(venue, errors) {
  if (venue.status !== "validated") return;
  const content = publicArtifactContent(venue, errors, "Polymarket");
  if (!content) return;
  const typedData = isRecord(content.typedData) ? content.typedData : content;
  const domain = isRecord(typedData.domain) ? typedData.domain : null;
  const types = isRecord(typedData.types) ? typedData.types : null;
  const message = isRecord(typedData.message) ? typedData.message : typedData;
  assertCondition(errors, isRecord(domain), "Polymarket normalized typed data must include a domain object.");
  assertCondition(errors, isRecord(types), "Polymarket normalized typed data must include a types object.");
  assertCondition(errors, isRecord(message), "Polymarket normalized typed data/order must include a message object.");
  if (domain) {
    if (venue.environment?.chainId !== null && venue.environment?.chainId !== undefined) {
      assertCondition(errors, Number(domain.chainId) === Number(venue.environment.chainId), "Polymarket normalized domain chainId must match evidence environment.chainId.");
    }
    if (venue.environment?.exchangeAddress) {
      assertCondition(errors, String(domain.verifyingContract ?? "").toLowerCase() === String(venue.environment.exchangeAddress).toLowerCase(), "Polymarket normalized domain verifyingContract must match evidence exchangeAddress.");
    }
  }
  if (types) assertCondition(errors, Array.isArray(types.Order) && types.Order.length > 0, "Polymarket normalized types must include an Order type layout.");
  if (isRecord(message)) {
    for (const field of ["makerAmount", "takerAmount"]) {
      assertCondition(errors, typeof message[field] === "string" && /^\d+$/.test(message[field]), `Polymarket message.${field} must be a base-unit decimal string.`);
    }
    assertCondition(errors, "signatureType" in message, "Polymarket message must include public signatureType metadata.");
  }
  if ("primaryType" in typedData) assertCondition(errors, typedData.primaryType === "Order", "Polymarket normalized primaryType must be Order.");
}

function validateHyperliquidVenue(venue, errors) {
  assertCondition(errors, venue.officialClient?.name === "hyperliquid-python-sdk", "Hyperliquid evidence must name hyperliquid-python-sdk as the official client.");
  assertCondition(errors, venue.officialClient?.sourceUrl === HYPERLIQUID_SDK_URL, "Hyperliquid evidence must point at the official SDK repository.");
  assertCondition(errors, hasText(venue.environment?.network, "testnet") || hasText(venue.environment?.mode, "fixture"), "Hyperliquid validation must be testnet or official-client fixture evidence.");
  const template = venue.matterhornTemplate ?? {};
  assertCondition(errors, template.kind === "hyperliquid-l1-action", "Hyperliquid template kind must be hyperliquid-l1-action.");
  assertCondition(errors, template.requiresClientValidation === true, "Hyperliquid template must keep requiresClientValidation:true.");
  assertCondition(errors, template.canSubmit === false, "Hyperliquid template must keep canSubmit:false.");
  assertCondition(errors, template.externalSignerOnly === true, "Hyperliquid template must keep externalSignerOnly:true.");
  const clientMustCompute = Array.isArray(template.clientMustCompute) ? template.clientMustCompute.join(" ").toLowerCase() : "";
  for (const item of ["nonce", "connectionid", "signature"]) {
    assertCondition(errors, clientMustCompute.includes(item), `Hyperliquid clientMustCompute must include ${item}.`);
  }
  validateHyperliquidNormalizedAction(venue, errors);
}

function validatePolymarketVenue(venue, errors) {
  assertCondition(errors, EXPECTED_POLYMARKET_CLIENTS.has(venue.officialClient?.name), "Polymarket evidence must name @polymarket/clob-client-v2, @polymarket/clob-client, or py-clob-client-v2.");
  assertCondition(errors, venue.officialClient?.docsUrl === POLYMARKET_DOC_URL, "Polymarket evidence must point at the official trading overview docs.");
  assertCondition(errors, hasText(venue.environment?.network, "amoy") || hasText(venue.environment?.mode, "fixture"), "Polymarket validation must be Polygon Amoy or official-client fixture evidence.");
  const template = venue.matterhornTemplate ?? {};
  assertCondition(errors, template.kind === "polymarket-eip712-order", "Polymarket template kind must be polymarket-eip712-order.");
  assertCondition(errors, template.requiresClientValidation === true, "Polymarket template must keep requiresClientValidation:true.");
  assertCondition(errors, template.canSubmit === false, "Polymarket template must keep canSubmit:false.");
  assertCondition(errors, template.externalSignerOnly === true, "Polymarket template must keep externalSignerOnly:true.");
  assertCondition(errors, template.amountDecimals === 6, "Polymarket evidence must keep 6-decimal USDC/share accounting.");
  const walletMustSet = Array.isArray(template.walletMustSet) ? template.walletMustSet : [];
  for (const item of ["maker", "signer", "salt", "nonce", "expiration"]) {
    assertCondition(errors, walletMustSet.includes(item), `Polymarket walletMustSet must include ${item}.`);
  }
  validatePolymarketNormalizedOrder(venue, errors);
}

export function validateEvidenceBundle(bundle) {
  const errors = [];
  const warnings = [];
  assertCondition(errors, isRecord(bundle), "Evidence must be a JSON object.");
  if (!isRecord(bundle)) return { ok: false, errors, warnings };

  const forbidden = findForbiddenCredentialKey(bundle);
  assertCondition(errors, !forbidden, forbidden ? `Evidence contains forbidden credential-shaped field: ${forbidden}` : "");
  assertCondition(errors, bundle.version === VERSION, `Evidence version must be ${VERSION}.`);
  assertCondition(errors, bundle.safety?.nonCustodial === true, "Evidence must mark nonCustodial:true.");
  assertCondition(errors, bundle.safety?.liveSubmissionEnabled === false, "Evidence must mark liveSubmissionEnabled:false.");
  assertCondition(errors, bundle.safety?.asksForSecrets === false, "Evidence must mark asksForSecrets:false.");
  assertCondition(errors, bundle.safety?.storesSecrets === false, "Evidence must mark storesSecrets:false.");

  const venues = Array.isArray(bundle.venues) ? bundle.venues : [];
  assertCondition(errors, venues.length > 0, "Evidence must include at least one venue.");
  const byVenue = new Map(venues.map((venue) => [venue?.venue, venue]));
  assertCondition(errors, byVenue.has("hyperliquid"), "Evidence must include a Hyperliquid venue entry.");
  assertCondition(errors, byVenue.has("polymarket"), "Evidence must include a Polymarket venue entry.");

  for (const venue of venues) {
    assertCondition(errors, ["pending_official_client_validation", "validated", "drift_found"].includes(venue?.status), `Unsupported validation status for ${venue?.venue ?? "unknown venue"}.`);
    if (venue?.status === "validated") {
      assertCondition(errors, Boolean(venue.officialClient?.packageVersion), `${venue.venue} validated evidence must include officialClient.packageVersion.`);
      assertCondition(errors, Boolean(venue.validation?.validatedAt), `${venue.venue} validated evidence must include validation.validatedAt.`);
      assertCondition(errors, Boolean(venue.validation?.officialClientNormalized), `${venue.venue} validated evidence must include validation.officialClientNormalized.`);
    }
    if (venue?.venue === "hyperliquid") validateHyperliquidVenue(venue, errors);
    else if (venue?.venue === "polymarket") validatePolymarketVenue(venue, errors);
    else errors.push(`Unsupported venue in SDK validation evidence: ${venue?.venue ?? "unknown"}.`);
  }

  if (warnings.length === 0 && venues.some((venue) => venue.status === "pending_official_client_validation")) {
    warnings.push("Evidence is structurally valid but still pending official-client/testnet validation.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

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
    sample: args.includes("--sample") || (!args.includes("--self-test") && !args.includes("--evidence-file")),
    selfTest: args.includes("--self-test"),
    evidenceFile: value("--evidence-file"),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn market official SDK validation evidence",
    "",
    "Usage:",
    "  node scripts/market-official-sdk-validation-evidence.mjs --sample --json",
    "  node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path> --json",
    "  node scripts/market-official-sdk-validation-evidence.mjs --self-test",
    "",
    "This validates redacted operator-owned official SDK/testnet evidence.",
    "It never asks for private keys, API secrets, raw signatures, or signed payloads.",
    "",
  ].join("\n"));
}

function runSelfTest() {
  const positive = validateEvidenceBundle(sampleEvidence());
  if (!positive.ok) throw new Error(`Sample evidence failed validation: ${positive.errors.join("; ")}`);

  const negative = sampleEvidence();
  negative.venues[0].matterhornTemplate.canSubmit = true;
  negative.venues[1].signature = "0xdeadbeef";
  const negativeResult = validateEvidenceBundle(negative);
  if (negativeResult.ok) throw new Error("Negative evidence unexpectedly passed validation.");
  if (!negativeResult.errors.join(" ").includes("canSubmit:false")) throw new Error("Negative self-test did not catch canSubmit:true.");
  if (!negativeResult.errors.join(" ").includes("signature")) throw new Error("Negative self-test did not catch credential-shaped signature field.");

  const malformedValidated = sampleEvidence();
  malformedValidated.venues[0].status = "validated";
  malformedValidated.venues[0].officialClient.packageVersion = "0.15.0";
  malformedValidated.venues[0].validation = {
    validatedAt: new Date(0).toISOString(),
    officialClientNormalized: {
      kind: "hyperliquid-official-normalized-action",
      source: "operator_redacted_official_client_json",
      sha256: "0".repeat(64),
      content: { type: "cancel", cancels: [{ a: 0, o: 1 }] },
    },
    differences: [],
    publicReceipt: null,
  };
  const malformedResult = validateEvidenceBundle(malformedValidated);
  if (malformedResult.ok) throw new Error("Malformed validated evidence unexpectedly passed validation.");
  if (!malformedResult.errors.join(" ").includes("Hyperliquid normalized action must be an order action")) {
    throw new Error("Malformed self-test did not catch invalid Hyperliquid normalized action shape.");
  }

  process.stdout.write("Market official SDK validation evidence self-test passed.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    process.exit(0);
  }

  if (config.selfTest) {
    runSelfTest();
    process.exit(0);
  }

  const evidenceInput = config.evidenceFile
    ? JSON.parse(readFileSync(config.evidenceFile, "utf8"))
    : sampleEvidence();
  const evidence = isRecord(evidenceInput?.evidence) ? evidenceInput.evidence : evidenceInput;
  const result = validateEvidenceBundle(evidence);
  const report = { ...result, evidence };
  if (config.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`Market official SDK validation evidence accepted with ${result.warnings.length} warning(s).\n`);
    for (const warning of result.warnings) process.stdout.write(`- ${warning}\n`);
  } else {
    process.stderr.write(`Market official SDK validation evidence rejected with ${result.errors.length} error(s).\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
