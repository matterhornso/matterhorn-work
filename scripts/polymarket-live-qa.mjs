#!/usr/bin/env node

/**
 * Polymarket read + preview live QA harness.
 *
 * Drives the PUBLIC Polymarket read endpoints (Gamma discovery/detail, CLOB
 * orderbook, geoblock) and exercises the preview-only flow end to end. It is
 * read-only: it never submits, signs, or sends an order, and it never accepts
 * or echoes signing material.
 *
 * Run live (read-only network):   node scripts/polymarket-live-qa.mjs --json
 * The bundled deterministic test (scripts/polymarket-live-qa.test.mjs) imports
 * runPolymarketLiveQa() with a mocked fetch.
 */

const DEFAULT_GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB_BASE_URL = "https://clob.polymarket.com";
const DEFAULT_GEOBLOCK_URL = "https://polymarket.com/api/geoblock";

// Mirror of MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN (packages/types/src/markets.ts).
const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

const HEX_PRIVATE_KEY_RE = /\b0x[0-9a-fA-F]{64}\b/;
const HEX_RAW_SIGNATURE_RE = /\b0x[0-9a-fA-F]{130}\b/;
const PEM_PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i;
const MNEMONIC_WORD_RE = /^[a-z]{3,8}$/;

const MAX_SCAN_NODES = 100_000;
const MAX_SCAN_DEPTH = 256;

// Linear token scan (not a regex) to avoid ReDoS on adversarial input.
function looksLikeMnemonic(value) {
  let run = 0;
  for (const token of value.split(/\s+/)) {
    if (MNEMONIC_WORD_RE.test(token)) {
      if (++run >= 12) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function classifyForbiddenValue(value) {
  if (typeof value !== "string") return null;
  if (PEM_PRIVATE_KEY_RE.test(value)) return "a private key";
  if (HEX_RAW_SIGNATURE_RE.test(value)) return "a raw signature";
  if (HEX_PRIVATE_KEY_RE.test(value)) return "a private key";
  if (looksLikeMnemonic(value)) return "a seed phrase / mnemonic";
  return null;
}

/**
 * Throws (with no value echo) if a payload carries forbidden signing material.
 * Iterative + bounded so a hostile deep/oversized payload fails closed instead
 * of overflowing the stack.
 */
export function assertNoForbiddenSecrets(value, label, rootPath = []) {
  const stack = [{ value, path: rootPath, depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (++visited > MAX_SCAN_NODES) throw new Error(`${label} payload too large to scan safely`);
    if (node.depth > MAX_SCAN_DEPTH) throw new Error(`${label} payload too deeply nested to scan safely`);
    const current = node.value;
    if (typeof current === "string") {
      const category = classifyForbiddenValue(current);
      if (category) throw new Error(`${label} contains ${category} at ${node.path.join(".") || "<root>"}`);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      current.forEach((child, index) => stack.push({ value: child, path: [...node.path, String(index)], depth: node.depth + 1 }));
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_KEY_RE.test(key)) {
        throw new Error(`${label} contains forbidden secret-shaped field: ${[...node.path, key].join(".")}`);
      }
      stack.push({ value: child, path: [...node.path, key], depth: node.depth + 1 });
    }
  }
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function parseStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseNumberArray(value) {
  return parseStringArray(value)
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n));
}

function mapMarket(record) {
  const outcomes = parseStringArray(record.outcomes);
  const prices = parseNumberArray(record.outcomePrices);
  const tokenIds = parseStringArray(record.clobTokenIds);
  const outcomePrices = {};
  const tokens = {};
  outcomes.forEach((outcome, index) => {
    if (index < prices.length) outcomePrices[outcome] = prices[index];
    if (index < tokenIds.length) tokens[outcome] = tokenIds[index];
  });
  return {
    id: typeof record.id === "string" ? record.id : typeof record.conditionId === "string" ? record.conditionId : "",
    question: typeof record.question === "string" ? record.question : "",
    outcomes,
    outcomePrices,
    tokenIds: tokens,
  };
}

function shapeOrderbook(book) {
  const levels = (value) =>
    (Array.isArray(value) ? value : [])
      .map((entry) => ({ price: asNumber(entry?.price), size: asNumber(entry?.size) }))
      .filter((level) => level.price !== null && level.size !== null);
  const bids = levels(book.bids).sort((a, b) => b.price - a.price);
  const asks = levels(book.asks).sort((a, b) => a.price - b.price);
  const bestBid = bids.length > 0 ? bids[0].price : null;
  const bestAsk = asks.length > 0 ? asks[0].price : null;
  const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  return { bids, asks, bestBid, bestAsk, midpoint, spread };
}

function estimateBuyFill(asks, targetUsdc) {
  let remaining = targetUsdc;
  let shares = 0;
  let spent = 0;
  for (const level of [...asks].sort((a, b) => a.price - b.price)) {
    if (remaining <= 0) break;
    const takeUsdc = Math.min(level.price * level.size, remaining);
    if (level.price > 0) shares += takeUsdc / level.price;
    spent += takeUsdc;
    remaining -= takeUsdc;
  }
  return { avgPrice: shares > 0 ? spent / shares : null, shares, fullyFilled: remaining <= 1e-9 };
}

/**
 * Build a preview-only summary. canSubmit is always false. When compliance is
 * blocked, no executable price/size is produced.
 */
function buildPreviewSummary({ market, outcome, side, amountUsdc, orderbook, compliance }) {
  if (compliance.status === "blocked") {
    return {
      execution: "blocked_by_compliance",
      signerPolicy: "blocked_by_compliance",
      marketId: market?.id ?? null,
      outcome,
      side,
      price: null,
      size: null,
      estimatedShares: null,
      canSubmit: false,
    };
  }
  const fill = estimateBuyFill(orderbook.asks, amountUsdc);
  return {
    execution: "unsigned_preview",
    signerPolicy: "api_wallet_required",
    marketId: market.id,
    outcome,
    side,
    price: fill.avgPrice,
    size: amountUsdc,
    estimatedShares: fill.avgPrice !== null ? fill.shares : null,
    canSubmit: false,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const arg = (name, fallback) => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((item) => item.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : fallback;
  };
  return {
    gammaBaseUrl: arg("--gamma-url", process.env.POLYMARKET_GAMMA_URL || DEFAULT_GAMMA_BASE_URL),
    clobBaseUrl: arg("--clob-url", process.env.POLYMARKET_CLOB_URL || DEFAULT_CLOB_BASE_URL),
    geoblockUrl: arg("--geoblock-url", process.env.POLYMARKET_GEOBLOCK_URL || DEFAULT_GEOBLOCK_URL),
    query: arg("--query", "AI"),
    marketId: arg("--market-id", ""),
    side: arg("--side", "yes"),
    amountUsdc: Number(arg("--amount-usdc", "10")),
    limit: Number(arg("--limit", "5")),
    timeoutMs: Number(arg("--timeout-ms", "15000")),
    json: args.includes("--json"),
    strict: args.includes("--strict"),
  };
}

/**
 * Run the read + preview QA sequence. `fetchImpl` is injectable so the bundled
 * test can run deterministically offline.
 */
export async function runPolymarketLiveQa(options = {}) {
  const config = {
    gammaBaseUrl: (options.gammaBaseUrl || DEFAULT_GAMMA_BASE_URL).replace(/\/+$/, ""),
    clobBaseUrl: (options.clobBaseUrl || DEFAULT_CLOB_BASE_URL).replace(/\/+$/, ""),
    geoblockUrl: options.geoblockUrl || DEFAULT_GEOBLOCK_URL,
    query: options.query || "AI",
    marketId: options.marketId || "",
    side: options.side || "yes",
    amountUsdc: Number.isFinite(options.amountUsdc) ? options.amountUsdc : 10,
    limit: Number.isFinite(options.limit) ? options.limit : 5,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000,
  };
  const fetchImpl = options.fetchImpl || fetch;
  const stages = [];

  async function getJson(url, params, label) {
    const target = new URL(url);
    if (params) for (const [k, v] of Object.entries(params)) target.searchParams.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(target.toString(), { method: "GET", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      assertNoForbiddenSecrets(parsed, `response ${label}`);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  async function runStep(id, label, fn) {
    try {
      const extra = (await fn()) || {};
      stages.push({ id, label, status: extra.status || "pass", ...extra });
      return extra;
    } catch (error) {
      stages.push({ id, label, status: "fail", error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  // 1. Discovery.
  const discover = await runStep("discover", "Discover markets via Gamma", async () => {
    const data = await getJson(`${config.gammaBaseUrl}/markets`, { active: "true", closed: "false", limit: String(config.limit * 3) }, "gamma/markets");
    const list = (Array.isArray(data) ? data : data?.markets || []).filter((x) => x && typeof x === "object").map(mapMarket);
    const terms = config.query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const matched = list.filter((m) => m.id && terms.every((t) => m.question.toLowerCase().includes(t)));
    const markets = (matched.length > 0 ? matched : list).slice(0, config.limit);
    if (markets.length === 0) throw new Error("no markets discovered");
    return { count: markets.length, marketId: markets[0].id };
  });

  const marketId = config.marketId || discover?.marketId;

  // 2. Detail.
  const detail = await runStep("detail", "Read market detail", async () => {
    if (!marketId) throw new Error("no market id to read");
    const data = await getJson(`${config.gammaBaseUrl}/markets/${encodeURIComponent(marketId)}`, undefined, "gamma/market");
    const market = mapMarket(data);
    if (!market.id) throw new Error("market detail missing id");
    return { market };
  });

  const market = detail?.market || null;
  const outcome = market ? (market.outcomes.find((o) => o.toLowerCase() === config.side) || market.outcomes[0]) : null;
  const tokenId = market && outcome ? market.tokenIds[outcome] : null;

  // 3. Orderbook.
  const orderbookStage = await runStep("orderbook", "Read CLOB orderbook", async () => {
    if (!tokenId) throw new Error("no token id for orderbook");
    const data = await getJson(`${config.clobBaseUrl}/book`, { token_id: tokenId }, "clob/book");
    const orderbook = shapeOrderbook(data && typeof data === "object" ? data : {});
    return { orderbook, midpoint: orderbook.midpoint, spread: orderbook.spread };
  });
  const orderbook = orderbookStage?.orderbook || { bids: [], asks: [], bestBid: null, bestAsk: null, midpoint: null, spread: null };

  // 4. Compliance / geoblock.
  const complianceStage = await runStep("geoblock", "Check Polymarket geoblock", async () => {
    let compliance;
    try {
      const data = await getJson(config.geoblockUrl, undefined, "geoblock");
      const blocked = Boolean(data && typeof data === "object" && data.blocked);
      compliance = { status: blocked ? "blocked" : "allowed", source: config.geoblockUrl };
    } catch (error) {
      compliance = { status: "unknown", source: config.geoblockUrl, reason: error instanceof Error ? error.message : "error" };
    }
    return { compliance };
  });
  const compliance = complianceStage?.compliance || { status: "unknown", source: config.geoblockUrl };

  // 5. Preview (preview-only; blocked compliance yields a non-executable preview).
  await runStep("preview", "Build preview-only order", async () => {
    if (!market) throw new Error("no market for preview");
    const preview = buildPreviewSummary({ market, outcome, side: config.side, amountUsdc: config.amountUsdc, orderbook, compliance });
    if (preview.canSubmit !== false) throw new Error("preview canSubmit must be false");
    if (compliance.status === "blocked") {
      if (preview.execution !== "blocked_by_compliance") throw new Error("blocked compliance must block the preview");
      if (preview.price !== null || preview.size !== null) throw new Error("blocked preview must not carry executable price/size");
    } else if (preview.execution !== "unsigned_preview") {
      throw new Error("allowed preview must be unsigned_preview");
    }
    return { preview };
  });

  // 6. Secret-field rejection self-check (no real secret is ever transmitted).
  await runStep("secret-rejection", "Reject signing-material payloads", async () => {
    const probes = [
      { privateKey: "redacted" },
      { note: `0x${"a".repeat(64)}` },
      { phrase: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima" },
    ];
    for (const probe of probes) {
      let rejected = false;
      try {
        assertNoForbiddenSecrets(probe, "probe");
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("sanitizer failed to reject a signing-material probe");
    }
    return { probes: probes.length };
  });

  const failed = stages.filter((s) => s.status === "fail");
  const summary = {
    ok: failed.length === 0,
    total: stages.length,
    passed: stages.filter((s) => s.status === "pass").length,
    failed: failed.length,
    compliance: compliance.status,
    liveTradingImplemented: false,
  };
  return { stages, summary };
}

async function main() {
  const config = parseArgs(process.argv);
  const report = await runPolymarketLiveQa(config);
  if (config.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const stage of report.stages) {
      const mark = stage.status === "pass" ? "PASS" : stage.status === "fail" ? "FAIL" : stage.status.toUpperCase();
      process.stdout.write(`[${mark}] ${stage.label}${stage.error ? ` — ${stage.error}` : ""}\n`);
    }
    process.stdout.write(`\n${report.summary.ok ? "OK" : "FAIL"}: ${report.summary.passed}/${report.summary.total} stages passed (compliance: ${report.summary.compliance}).\n`);
  }
  if (config.strict && !report.summary.ok) process.exitCode = 1;
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
