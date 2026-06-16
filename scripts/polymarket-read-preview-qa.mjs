#!/usr/bin/env node

/**
 * Polymarket read + preview QA harness.
 *
 * Drives the public Polymarket read endpoints (Gamma discovery/detail, CLOB
 * orderbook, geoblock) and exercises the preview-only flow end to end. It is
 * read-only: it never submits, signs, or sends an order, and it never accepts
 * or echoes signing material.
 *
 *   node scripts/polymarket-read-preview-qa.mjs --self-test --strict --json
 *   node scripts/polymarket-read-preview-qa.mjs --json   # live, read-only
 */

const DEFAULT_GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB_BASE_URL = "https://clob.polymarket.com";
const DEFAULT_GEOBLOCK_URL = "https://polymarket.com/api/geoblock";

// Mirror of the forbidden-credential vocabulary in packages/types/src/markets.ts.
const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const HEX_PRIVATE_KEY_RE = /\b0x[0-9a-fA-F]{64}\b/;
const HEX_RAW_SIGNATURE_RE = /\b0x[0-9a-fA-F]{130}\b/;
const PEM_PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i;
const MNEMONIC_WORD_RE = /^[a-z]{3,8}$/;
const MAX_SCAN_NODES = 100_000;
const MAX_SCAN_DEPTH = 256;

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

/** Throws (with no value echo) if a payload carries forbidden signing material. */
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
      if (FORBIDDEN_KEY_RE.test(key)) throw new Error(`${label} contains forbidden secret-shaped field: ${[...node.path, key].join(".")}`);
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
  return parseStringArray(value).map((item) => Number(item)).filter((n) => Number.isFinite(n));
}

function mapMarket(record) {
  const outcomes = parseStringArray(record.outcomes);
  const prices = parseNumberArray(record.outcomePrices);
  const tokenIds = parseStringArray(record.clobTokenIds);
  const outcomePrices = {};
  const tokens = {};
  outcomes.forEach((outcome, index) => {
    if (outcome === "__proto__" || outcome === "constructor" || outcome === "prototype") return;
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
      .filter((level) => level.price !== null && level.size !== null && level.price > 0);
  const bids = levels(book.bids).sort((a, b) => b.price - a.price);
  const asks = levels(book.asks).sort((a, b) => a.price - b.price);
  const bestBid = bids.length > 0 ? bids[0].price : null;
  const bestAsk = asks.length > 0 ? asks[0].price : null;
  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    midpoint: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
  };
}

function estimateFill(asks, amountUsdc) {
  let remaining = amountUsdc;
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

/** Build a preview-only summary. canSubmit is always false; blocked -> no price/size. */
function buildPreviewSummary({ market, outcome, amountUsdc, orderbook, compliance }) {
  if (compliance.status === "blocked") {
    return { execution: "blocked_by_compliance", marketId: market?.id ?? null, outcome, price: null, size: null, estimatedShares: null, canSubmit: false };
  }
  const fill = estimateFill(orderbook.asks, amountUsdc);
  return {
    execution: "unsigned_preview",
    marketId: market.id,
    outcome,
    price: fill.avgPrice,
    size: amountUsdc,
    estimatedShares: fill.avgPrice !== null ? fill.shares : null,
    canSubmit: false,
  };
}

export async function runPolymarketReadPreviewQa(options = {}) {
  const config = {
    gammaBaseUrl: (options.gammaBaseUrl || DEFAULT_GAMMA_BASE_URL).replace(/\/+$/, ""),
    clobBaseUrl: (options.clobBaseUrl || DEFAULT_CLOB_BASE_URL).replace(/\/+$/, ""),
    geoblockUrl: options.geoblockUrl || DEFAULT_GEOBLOCK_URL,
    query: options.query || "AI",
    marketId: options.marketId || "",
    amountUsdc: Number.isFinite(options.amountUsdc) ? options.amountUsdc : 10,
    limit: Number.isFinite(options.limit) ? options.limit : 5,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000,
  };
  const fetchImpl = options.fetchImpl || fetch;
  const stages = [];

  async function getJson(url, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      assertNoForbiddenSecrets(parsed, `response ${label}`);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  async function stage(id, label, fn) {
    try {
      const extra = (await fn()) || {};
      stages.push({ id, label, status: extra.status || "pass", ...extra });
      return extra;
    } catch (error) {
      stages.push({ id, label, status: "fail", error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  const discover = await stage("discover", "Discover markets via Gamma", async () => {
    const data = await getJson(`${config.gammaBaseUrl}/markets?active=true&closed=false&limit=${config.limit * 3}`, "gamma/markets");
    const list = (Array.isArray(data) ? data : data?.markets || []).filter((x) => x && typeof x === "object").map(mapMarket);
    const terms = config.query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const matched = list.filter((m) => m.id && terms.every((t) => m.question.toLowerCase().includes(t)));
    const markets = (matched.length > 0 ? matched : list).slice(0, config.limit);
    if (markets.length === 0) throw new Error("no markets discovered");
    return { count: markets.length, marketId: markets[0].id };
  });

  const marketId = config.marketId || discover?.marketId;

  const detail = await stage("market.detail", "Read market detail", async () => {
    if (!marketId) throw new Error("no market id");
    const data = await getJson(`${config.gammaBaseUrl}/markets/${encodeURIComponent(marketId)}`, "gamma/market");
    const market = mapMarket(data);
    if (!market.id) throw new Error("market detail missing id");
    return { market };
  });

  const market = detail?.market || null;
  const outcome = market ? market.outcomes[0] : null;
  const tokenId = market && outcome ? market.tokenIds[outcome] : null;

  const orderbookStage = await stage("orderbook", "Read CLOB orderbook", async () => {
    if (!tokenId) throw new Error("no token id");
    const data = await getJson(`${config.clobBaseUrl}/book?token_id=${encodeURIComponent(tokenId)}`, "clob/book");
    const orderbook = shapeOrderbook(data && typeof data === "object" ? data : {});
    return { orderbook, midpoint: orderbook.midpoint };
  });
  const orderbook = orderbookStage?.orderbook || { bids: [], asks: [], bestBid: null, bestAsk: null, midpoint: null };

  const complianceStage = await stage("geoblock", "Check Polymarket geoblock", async () => {
    let compliance;
    try {
      const data = await getJson(config.geoblockUrl, "geoblock");
      compliance = { status: data && typeof data === "object" && data.blocked ? "blocked" : "allowed", source: config.geoblockUrl };
    } catch (error) {
      compliance = { status: "unknown", source: config.geoblockUrl, reason: error instanceof Error ? error.message : "error" };
    }
    return { compliance };
  });
  const compliance = complianceStage?.compliance || { status: "unknown", source: config.geoblockUrl };

  await stage("order.preview", "Build preview-only order", async () => {
    if (!market) throw new Error("no market for preview");
    const preview = buildPreviewSummary({ market, outcome, amountUsdc: config.amountUsdc, orderbook, compliance });
    if (preview.canSubmit !== false) throw new Error("preview canSubmit must be false");
    if (compliance.status === "blocked") {
      if (preview.execution !== "blocked_by_compliance") throw new Error("blocked compliance must block the preview");
      if (preview.price !== null || preview.size !== null) throw new Error("blocked preview must not carry executable price/size");
    } else if (preview.execution !== "unsigned_preview") {
      throw new Error("allowed preview must be unsigned_preview");
    }
    return { preview };
  });

  await stage("secret.rejection", "Reject signing-material payloads", async () => {
    const probes = [{ privateKey: "redacted" }, { note: `0x${"a".repeat(64)}` }, { phrase: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima" }];
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

  const summary = {
    pass: stages.filter((s) => s.status === "pass").length,
    fail: stages.filter((s) => s.status === "fail").length,
    skip: stages.filter((s) => s.status === "skip").length,
  };
  return {
    ready: summary.fail === 0,
    strict: Boolean(options.strict),
    completedAt: new Date().toISOString(),
    summary,
    stages,
    safety: {
      custody: "none",
      acceptsApiSecrets: false,
      submitsOrders: false,
      previewsCanSubmit: false,
    },
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
    gammaBaseUrl: arg("--gamma-url", process.env.POLYMARKET_GAMMA_URL),
    clobBaseUrl: arg("--clob-url", process.env.POLYMARKET_CLOB_URL),
    geoblockUrl: arg("--geoblock-url", process.env.POLYMARKET_GEOBLOCK_URL),
    query: arg("--query", "AI"),
    marketId: arg("--market-id", ""),
    amountUsdc: Number(arg("--amount-usdc", "10")),
    limit: Number(arg("--limit", "5")),
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    selfTest: args.includes("--self-test"),
  };
}

function selfTestFetch(url) {
  const json = (payload) => Promise.resolve({ ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } });
  const market = {
    id: "0xmarket-ai",
    question: "Will an AI model pass the bar exam by 2027?",
    outcomes: JSON.stringify(["Yes", "No"]),
    outcomePrices: JSON.stringify(["0.62", "0.38"]),
    clobTokenIds: JSON.stringify(["token-yes", "token-no"]),
  };
  if (url.includes("/api/geoblock")) return json({ blocked: false, country: "US" });
  if (url.includes("/markets/")) return json(market);
  if (url.includes("/markets")) return json([market]);
  if (url.includes("/book")) return json({ market: "0xmarket-ai", bids: [{ price: "0.61", size: "100" }], asks: [{ price: "0.63", size: "200" }] });
  return Promise.resolve({ ok: false, status: 404, async json() { return {}; }, async text() { return ""; } });
}

const config = parseArgs(process.argv);
const report = await runPolymarketReadPreviewQa({ ...config, fetchImpl: config.selfTest ? selfTestFetch : undefined });
if (config.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`Polymarket read/preview QA: ${report.ready ? "PASS" : "FAIL"}\n`);
  for (const item of report.stages) process.stdout.write(`- ${item.status.toUpperCase()} ${item.id}: ${item.label}${item.error ? ` (${item.error})` : ""}\n`);
}
if (config.strict && !report.ready) process.exitCode = 1;
