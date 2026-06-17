#!/usr/bin/env node

const VENUES = ["hyperliquid", "polymarket"];
const SAFE_MODES = new Set(["operator_owned_testnet", "operator_owned_fixture", "fixture"]);

export const FORBIDDEN_MARKET_SDK_ENV_KEY_RE =
  /(^|_)(SEED|SEED_PHRASE|MNEMONIC|PRIVATE_KEY|PRIVATEKEY|API_SECRET|APISECRET|SECRET|PASSWORD|PASSPHRASE|KEYFILE|WALLET_EXPORT|RAW_SIGNATURE|SIGNED_PAYLOAD|SIGNED_ACTION|SIGNED_ORDER)($|_)/i;

function isMarketScopedKey(key) {
  return /^(HYPERLIQUID|POLYMARKET|MARKET|CRYPTO|WALLET|WEB3)_/i.test(key);
}

function isAddress(value) {
  return /^0x[a-f0-9]{40}$/i.test(String(value ?? ""));
}

function addCheck(checks, id, label, status, summary) {
  checks.push({ id, label, status, summary });
}

function selectedVenues(venue) {
  if (!venue || venue === "all") return VENUES;
  if (VENUES.includes(venue)) return [venue];
  throw new Error("Unsupported --venue. Use all, hyperliquid, or polymarket.");
}

function checkForbiddenEnv(env, errors, checks) {
  const forbidden = Object.keys(env)
    .filter((key) => isMarketScopedKey(key) && FORBIDDEN_MARKET_SDK_ENV_KEY_RE.test(key))
    .sort();
  if (forbidden.length > 0) {
    errors.push(`Remove credential-shaped market SDK env keys before validation: ${forbidden.join(", ")}`);
    addCheck(checks, "market_sdk.secret_env", "Secret-shaped env keys", "fail", "Credential-shaped market SDK env keys are present. Values were not read or printed.");
    return;
  }
  addCheck(checks, "market_sdk.secret_env", "Secret-shaped env keys", "pass", "No market-scoped credential-shaped env keys were found.");
}

function checkMode(env, strict, errors, warnings, checks) {
  const mode = String(env.MARKET_OFFICIAL_SDK_VALIDATION_MODE ?? "").trim();
  if (!mode) {
    const message = "Set MARKET_OFFICIAL_SDK_VALIDATION_MODE=operator_owned_testnet or fixture before running official SDK capture.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "market_sdk.mode", "Validation mode", strict ? "fail" : "warn", message);
    return;
  }
  if (!SAFE_MODES.has(mode)) {
    errors.push("MARKET_OFFICIAL_SDK_VALIDATION_MODE must be operator_owned_testnet, operator_owned_fixture, or fixture.");
    addCheck(checks, "market_sdk.mode", "Validation mode", "fail", `Unsupported validation mode: ${mode}.`);
    return;
  }
  addCheck(checks, "market_sdk.mode", "Validation mode", "pass", `Validation mode is ${mode}.`);
}

function checkHyperliquid(env, strict, errors, warnings, checks) {
  const network = String(env.HYPERLIQUID_VALIDATION_NETWORK ?? env.HYPERLIQUID_NETWORK ?? "").trim();
  const packageVersion = String(env.HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION ?? "").trim();
  if (/mainnet|api\.hyperliquid\.xyz/i.test(network)) {
    errors.push("Hyperliquid official SDK validation must use testnet or fixture evidence, not mainnet.");
    addCheck(checks, "hyperliquid.network", "Hyperliquid network", "fail", "Mainnet-looking Hyperliquid network was detected.");
  } else if (/testnet|fixture|mock/i.test(network)) {
    addCheck(checks, "hyperliquid.network", "Hyperliquid network", "pass", `Hyperliquid validation network is ${network}.`);
  } else {
    const message = "Set HYPERLIQUID_VALIDATION_NETWORK=hyperliquid-testnet or fixture.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "hyperliquid.network", "Hyperliquid network", strict ? "fail" : "warn", message);
  }

  if (packageVersion) {
    addCheck(checks, "hyperliquid.package", "Hyperliquid SDK package", "pass", "Hyperliquid official SDK package version is declared.");
  } else {
    const message = "Set HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION after the operator-owned SDK run.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "hyperliquid.package", "Hyperliquid SDK package", strict ? "fail" : "warn", message);
  }
}

function checkPolymarket(env, strict, errors, warnings, checks) {
  const network = String(env.POLYMARKET_VALIDATION_NETWORK ?? env.POLYMARKET_NETWORK ?? "").trim();
  const chainId = String(env.POLYMARKET_CHAIN_ID ?? "").trim();
  const exchangeAddress = String(env.POLYMARKET_EXCHANGE_ADDRESS ?? "").trim();
  const packageVersion = String(env.POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION ?? "").trim();

  if (/mainnet|polygon-mainnet/i.test(network) || chainId === "137" || chainId === "1") {
    errors.push("Polymarket official SDK validation must use Polygon Amoy or fixture evidence, not mainnet.");
    addCheck(checks, "polymarket.network", "Polymarket network", "fail", "Mainnet-looking Polymarket network or chain id was detected.");
  } else if (/amoy|fixture|mock/i.test(network) || chainId === "80002") {
    addCheck(checks, "polymarket.network", "Polymarket network", "pass", `Polymarket validation network is ${network || `chain ${chainId}`}.`);
  } else {
    const message = "Set POLYMARKET_VALIDATION_NETWORK=polygon-amoy or fixture, and POLYMARKET_CHAIN_ID=80002 for Amoy captures.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "polymarket.network", "Polymarket network", strict ? "fail" : "warn", message);
  }

  if (exchangeAddress && !isAddress(exchangeAddress)) {
    errors.push("POLYMARKET_EXCHANGE_ADDRESS must be a public 0x address.");
    addCheck(checks, "polymarket.exchange", "Polymarket exchange address", "fail", "Invalid public exchange address.");
  } else if (exchangeAddress) {
    addCheck(checks, "polymarket.exchange", "Polymarket exchange address", "pass", "Polymarket public exchange address is declared.");
  } else {
    const message = "Set POLYMARKET_EXCHANGE_ADDRESS to the public testnet/fixture exchange contract used for validation.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "polymarket.exchange", "Polymarket exchange address", strict ? "fail" : "warn", message);
  }

  if (packageVersion) {
    addCheck(checks, "polymarket.package", "Polymarket SDK package", "pass", "Polymarket official SDK package version is declared.");
  } else {
    const message = "Set POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION after the operator-owned SDK run.";
    if (strict) errors.push(message);
    else warnings.push(message);
    addCheck(checks, "polymarket.package", "Polymarket SDK package", strict ? "fail" : "warn", message);
  }
}

export function runOfficialSdkValidationDoctor(options = {}) {
  const env = options.env ?? process.env;
  const strict = Boolean(options.strict);
  const errors = [];
  const warnings = [];
  const checks = [];
  const venues = selectedVenues(options.venue ?? "all");

  checkForbiddenEnv(env, errors, checks);
  checkMode(env, strict, errors, warnings, checks);
  if (venues.includes("hyperliquid")) checkHyperliquid(env, strict, errors, warnings, checks);
  if (venues.includes("polymarket")) checkPolymarket(env, strict, errors, warnings, checks);

  return {
    ok: errors.length === 0,
    ready: errors.length === 0 && warnings.length === 0,
    strict,
    venue: options.venue ?? "all",
    checks,
    errors,
    warnings,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      acceptsSecrets: false,
      printsSecretValues: false,
    },
  };
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
    strict: args.includes("--strict"),
    venue: value("--venue") || "all",
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn market official SDK validation doctor",
    "",
    "Usage:",
    "  node scripts/market-official-sdk-validation-doctor.mjs --json",
    "  node scripts/market-official-sdk-validation-doctor.mjs --strict --venue hyperliquid",
    "  node scripts/market-official-sdk-validation-doctor.mjs --strict --venue polymarket",
    "",
    "The doctor inspects public validation metadata and credential-shaped env key names.",
    "It does not read or print secret values, run SDK clients, sign, submit, or call exchanges.",
  ].join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    process.exit(0);
  }
  try {
    const result = runOfficialSdkValidationDoctor(config);
    if (config.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`Matterhorn market official SDK validation doctor: ${result.ready ? "READY" : result.ok ? "OK_WITH_WARNINGS" : "NOT_READY"}\n`);
      for (const check of result.checks) process.stdout.write(`- ${check.status.toUpperCase()} ${check.id}: ${check.summary}\n`);
      for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
      for (const error of result.errors) process.stderr.write(`Error: ${error}\n`);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
