import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const suiFixture = "0x0000000000000000000000000000000000000000000000000000000000000002";
const allowedHosts = new Set(["desks-qa.localhost", "model-qa.localhost", "localhost"]);
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const fields = (value, keys) => Object.fromEntries(keys.filter((key) => key in record(value)).map((key) => [key, value[key]]));
const source = (value) => typeof value === "string" ? value : fields(value, ["source", "freshness", "fetchedAt", "network"]);

export function safeText(value) {
  return String(value ?? "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]")
    .replace(/(?:bearer\s+|(?:cookie|password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "[credential omitted]")
    .replace(/(?:\/Users\/|\/private\/|\/var\/)[^\s]+/g, "[local path omitted]").slice(0, 350);
}

export function getJson({ url, cookie, timeoutMs = 20_000 }) {
  const target = new URL(url);
  if (target.protocol !== "http:" || !allowedHosts.has(target.hostname) || target.username || target.password) {
    throw new Error("Only explicitly isolated loopback QA origins are supported.");
  }
  return new Promise((resolveRequest) => {
    const start = Date.now();
    const request = http.request({
      hostname: "127.0.0.1", port: target.port || 80, path: target.pathname + target.search,
      method: "GET", headers: { Host: target.host, Origin: target.origin, Cookie: cookie, Accept: "application/json" },
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) request.destroy(new Error("Response exceeded the bounded JSON limit."));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = null; }
        resolveRequest({ status: response.statusCode, elapsedMs: Date.now() - start, body,
          transportError: body === null ? "Response was not JSON." : null });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Read-only request timed out.")));
    request.on("error", (error) => resolveRequest({ status: null, elapsedMs: Date.now() - start, body: null, transportError: safeText(error.message) }));
    request.end();
  });
}

export function summarize(id, body) {
  const data = record(body);
  switch (id) {
    case "capabilities": return {
      models: fields(data.models, ["status"]), wallets: fields(data.wallets, ["status"]),
      approvalMode: record(data.server).approvalMode,
    };
    case "workspace-readiness": return {
      summary: fields(data.summary, ["status", "readyFeatures", "totalFeatures", "blockingChecks"]),
      checks: Object.fromEntries(Object.entries(record(data.checks)).map(([key, check]) => [key, fields(check, ["status"])])),
    };
    case "models": return {
      serverFetched: record(data.catalog).serverFetched,
      providerCount: list(record(data.catalog).providers).length,
      providers: list(record(data.catalog).providers).filter((provider) => provider.connected || provider.id === "venice").map((provider) => fields(provider, ["id", "connected", "modelCount"])),
      privacy: { enforcementMode: record(data.privacy).enforcementMode, providers: list(record(data.privacy).providers).filter((policy) => policy.providerId === "venice" || list(record(data.catalog).providers).some((provider) => provider.connected && provider.id === policy.providerId)).map((policy) => fields(policy, ["providerId", "status", "allowed", "trainingUse", "retentionDays"])) },
    };
    case "market-readiness": return { status: record(data.report).status,
      venues: list(record(data.report).venues).map((venue) => fields(venue, ["venue", "executionMode", "liveSubmissionEnabled", "canSubmit"])) };
    case "bittensor-sidecar": return fields(data.health ?? data, ["configured", "status", "canRead", "canPrepare", "network", "message"]);
    case "bittensor-readiness": return { ...fields(data.report, ["status", "ready"]),
      checks: list(record(data.report).checks).map((check) => fields(check, ["id", "status", "summary"])),
      blockers: list(record(data.report).blockers).map(safeText), warnings: list(record(data.report).warnings).map(safeText) };
    case "bittensor-subnets": return { count: list(data.subnets).length,
      sources: [...new Set(list(data.subnets).map((subnet) => subnet.source))],
      samples: list(data.subnets).slice(0, 3).map((subnet) => fields(subnet, ["netuid", "name", "source", "block", "freshness"])) };
    case "hyperliquid-markets": return { count: list(data.markets).length,
      samples: list(data.markets).slice(0, 3).map((market) => ({ ...fields(market, ["asset", "markPx"]), source: source(market.source) })) };
    case "hyperliquid-funding": return { ...fields(data.funding, ["asset", "fundingRate", "markPx"]), source: source(record(data.funding).source) };
    case "hyperliquid-orderbook":
    case "polymarket-orderbook": return { ...fields(data.orderbook, ["asset", "marketId", "tokenId", "bestBid", "bestAsk"]),
      bids: list(record(data.orderbook).bids).length, asks: list(record(data.orderbook).asks).length,
      source: source(record(data.orderbook).source), warnings: list(record(data.orderbook).warnings).map(safeText) };
    case "polymarket-discovery": return { count: list(data.markets).length,
      samples: list(data.markets).slice(0, 3).map((market) => ({ ...fields(market, ["id", "question", "active", "closed"]), source: source(market.source) })) };
    case "polymarket-detail": return { ...fields(data.market, ["id", "question", "active", "closed", "outcomes"]), source: source(record(data.market).source) };
    case "polymarket-compliance": return fields(data.compliance, ["status", "reason", "jurisdiction", "checkedAt", "source"]);
    case "sui-balance":
    case "sui-account": {
      const balance = id === "sui-account" ? record(data.account).balance : data.balance;
      return { ...fields(balance, ["network", "balanceMist", "balanceSui", "custody", "canSubmit"]), source: source(record(balance).source),
        warnings: list(record(balance).warnings).map(safeText), fixture: "Public 0x2 address from apps/server/src/tools/sui.test.ts; not a customer wallet." };
    }
    default: return {};
  }
}

export async function runSmoke({ runtimeRoot, appUrl, workspaceId, outputPath }) {
  const origin = new URL(appUrl).origin;
  if (!/^ws_[a-zA-Z0-9_]+$/.test(workspaceId)) throw new Error("Expected an explicit workspace ID.");
  const account = JSON.parse(await readFile(join(runtimeRoot, "private-ui-account.json"), "utf8"));
  const cookie = account.cookie;
  if (typeof cookie !== "string" || !cookie.trim() || /[\r\n]/.test(cookie)) throw new Error("Missing or invalid private account cookie.");
  const observations = [];
  async function check(id, path) {
    const response = await getJson({ url: origin + path, cookie });
    const data = record(response.body);
    const ok = response.status >= 200 && response.status < 300 && response.body !== null && data.success !== false;
    const error = data.error;
    observations.push({ id, method: "GET", path, httpStatus: response.status, elapsedMs: response.elapsedMs,
      status: ok ? "response_received" : "failed", ...(ok ? { observed: summarize(id, data) } : {
        errorCode: safeText(typeof error === "string" ? error : record(error).code ?? data.code),
        cause: response.transportError ?? safeText(record(error).message ?? data.message ?? "Endpoint returned an unsuccessful response."),
      }) });
    return ok ? data : null;
  }
  const jobs = [
    ["capabilities", "/api/backend/capabilities"],
    ["workspace-readiness", `/workspace/${workspaceId}/backend/readiness`],
    ["models", `/workspace/${workspaceId}/backend/models`],
    ["market-readiness", "/api/crypto/market-execution-readiness"],
    ["bittensor-sidecar", "/api/bittensor/sidecar/health"],
    ["bittensor-subnets", "/api/bittensor/subnets"],
    ["bittensor-readiness", "/api/bittensor/readiness"],
    ["hyperliquid-markets", "/api/hyperliquid/markets?limit=3"],
    ["hyperliquid-funding", "/api/hyperliquid/funding/BTC"],
    ["hyperliquid-orderbook", "/api/hyperliquid/orderbook/BTC"],
    ["polymarket-compliance", "/api/polymarket/compliance"],
    ["sui-balance", `/api/sui/balance/${suiFixture}?network=testnet`],
    ["sui-account", `/api/sui/account/${suiFixture}?network=testnet`],
  ];
  for (let offset = 0; offset < jobs.length; offset += 3) await Promise.all(jobs.slice(offset, offset + 3).map(([id, path]) => check(id, path)));
  const discovery = await check("polymarket-discovery", "/api/polymarket/markets?limit=3");
  const market = list(discovery?.markets).find((candidate) => candidate.active && !candidate.closed && Object.values(record(candidate.tokenIds)).some((id) => /^\d+$/.test(String(id))));
  if (market && /^[a-zA-Z0-9_-]+$/.test(market.id)) {
    await check("polymarket-detail", `/api/polymarket/markets/${encodeURIComponent(market.id)}`);
    const tokenId = Object.values(record(market.tokenIds)).find((id) => /^\d+$/.test(String(id)));
    await check("polymarket-orderbook", `/api/polymarket/orderbook/${encodeURIComponent(tokenId)}?marketId=${encodeURIComponent(market.id)}`);
  } else for (const id of ["polymarket-detail", "polymarket-orderbook"]) observations.push({ id, status: "blocked", cause: "Discovery did not return a current public market with a usable token ID; no fixture result substituted." });
  const report = { version: 1, checkedAt: new Date().toISOString(), appUrl: origin, workspaceId,
    scope: "Authenticated read-only API probes against the isolated local runtime; public provider reads, not hosted/browser/inference/wallet acceptance.",
    safety: { requestMethod: "GET", inferenceRequests: 0, walletConnections: 0, transactionSubmissions: 0, privatePayloadsPersisted: false },
    requestCount: observations.filter((item) => item.method).length,
    observations, limitations: ["HTTP 200 and readiness claims are not live-source proof; inspect freshness and fallback labels.", "No owner-authorized wallet signing, browser connector, chat response, production endpoint, or paid resource was exercised.", "Readiness endpoints may refresh internal caches or their diagnostic context; no user workflow mutation was requested."] };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { "runtime-root": { type: "string" }, "app-url": { type: "string" }, "workspace-id": { type: "string" }, output: { type: "string" } } });
  if (!values["runtime-root"] || !values["app-url"] || !values["workspace-id"]) throw new Error("Required: --runtime-root --app-url --workspace-id; credentials must remain in private-ui-account.json.");
  const report = await runSmoke({ runtimeRoot: values["runtime-root"], appUrl: values["app-url"], workspaceId: values["workspace-id"], outputPath: values.output ?? join(outputDirectory, "readonly-api-results.json") });
  console.log(JSON.stringify({ checkedAt: report.checkedAt, requests: report.requestCount, results: report.observations.map((item) => ({ id: item.id, httpStatus: item.httpStatus, status: item.status })) }, null, 2));
  if (report.observations.some((item) => ["failed", "blocked"].includes(item.status))) process.exitCode = 1;
}
