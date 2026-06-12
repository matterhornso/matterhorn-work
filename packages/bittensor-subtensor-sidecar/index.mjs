#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOST = process.env.BITTENSOR_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.BITTENSOR_SIDECAR_PORT || "9876");
const MODE = process.env.BITTENSOR_SIDECAR_MODE || "mock";
const NETWORK = process.env.BITTENSOR_NETWORK === "test" || process.env.BITTENSOR_NETWORK === "local"
  ? process.env.BITTENSOR_NETWORK
  : "finney";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const PYTHON_HEALTH_CACHE_MS = Number(process.env.BITTENSOR_HEALTH_CACHE_MS || "5000");
const PYTHON_SUBNET_CACHE_MS = Number(process.env.BITTENSOR_SUBNET_CACHE_MS || "60000");

const here = dirname(fileURLToPath(import.meta.url));
let pythonHealthCache = null;
let pythonSubnetCache = null;
let pythonSubnetRefresh = null;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(`${JSON.stringify(body)}\n`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Request body must be valid JSON.");
    err.status = 400;
    throw err;
  }
}

function validSs58(address) {
  return typeof address === "string" && address.length >= 32 && address.length <= 64 && BASE58_RE.test(address);
}

function numberOrNull(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveAmount(value) {
  const parsed = numberOrNull(value);
  return parsed && parsed > 0 ? parsed : null;
}

function firstNumberForHealth(record, key) {
  if (!record || typeof record !== "object") return null;
  return numberOrNull(record[key]);
}

function limitFromUrl(url, fallback = 128, max = 512) {
  const parsed = numberOrNull(url.searchParams.get("limit"));
  if (!parsed || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function forbiddenKeyPath(value, path = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = forbiddenKeyPath(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (/(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i.test(key)) return [...path, key].join(".");
    const nested = forbiddenKeyPath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function liveMeta(source = MODE === "mock" ? "matterhorn-sidecar-mock" : "bittensor-python-sdk") {
  return {
    network: NETWORK,
    source,
    fetchedAt: new Date().toISOString(),
    block: 123456,
    freshness: MODE === "mock" ? "mock" : "live",
  };
}

function livenessPayload(bridgeHealth = null) {
  const sdkAvailable = MODE === "mock" || bridgeHealth?.ok !== false;
  return {
    ok: true,
    status: sdkAvailable ? "healthy" : "degraded",
    mode: MODE,
    network: NETWORK,
    sdkAvailable,
    canRead: sdkAvailable,
    canPrepare: sdkAvailable,
    canSubmit: false,
    block: firstNumberForHealth(bridgeHealth, "block") ?? 123456,
    fetchedAt: new Date().toISOString(),
    message: MODE === "mock"
      ? "Matterhorn mock Subtensor sidecar is running. Broadcast submission is disabled."
      : bridgeHealth?.message ?? "Matterhorn Subtensor sidecar is running in Python SDK mode.",
  };
}

function mockDynamicSubnet(netuid) {
  const known = {
    0: {
      name: "Root Network",
      symbol: "ROOT",
      category: "Network coordination",
      description: "Coordinates Bittensor network-level incentives and delegation context.",
      priceTao: null,
      emission: 0,
      tempo: 360,
    },
    1: {
      name: "Subnet 1",
      symbol: "SN1",
      category: "Intelligence market",
      description: "General Bittensor subnet used for capability discovery tests.",
      priceTao: 1,
      emission: 0.08,
      tempo: 360,
    },
    14: {
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute and infrastructure",
      description: "Compute and infrastructure subnet sample for validator and staking previews.",
      priceTao: 0.5,
      emission: 0.15,
      tempo: 360,
    },
    22: {
      name: "Creative Media",
      symbol: "SN22",
      category: "Creative AI",
      description: "Creative/media-oriented sample for image-generation discovery prompts.",
      priceTao: 0.8,
      emission: 0.11,
      tempo: 360,
    },
  };
  const row = known[netuid] ?? {
    name: `Subnet ${netuid}`,
    symbol: `SN${netuid}`,
    category: "Intelligence market",
    description: "Bittensor subnet sample. Verify live SDK metadata before relying on current utility.",
    priceTao: 1,
    emission: null,
    tempo: null,
  };
  return {
    ...liveMeta(),
    netuid,
    name: row.name,
    symbol: row.symbol,
    category: row.category,
    description: row.description,
    priceTao: row.priceTao,
    emission: row.emission,
    tempo: row.tempo,
    alphaIn: row.priceTao === null ? null : 20000,
    alphaOut: row.priceTao === null ? null : 10000,
    taoIn: row.priceTao === null ? null : 5000,
    ownerColdkey: null,
    ownerHotkey: null,
    warnings: ["Mock sidecar data. Use Python SDK mode for live Finney reads."],
  };
}

function mockSubnets() {
  return {
    ...liveMeta(),
    subnets: [0, 1, 14, 22].map(mockDynamicSubnet),
    warnings: ["Mock subnet list. Use Python SDK mode for live Finney subnet metadata."],
  };
}

function mockMetagraph(netuid) {
  return {
    ...liveMeta(),
    netuid,
    n: 3,
    totalStake: 1760,
    neurons: [
      {
        uid: 1,
        hotkey: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF",
        coldkey: "5FHneW46xGXgs5mUiveU4sbTyGBzmstX9yY9h1m1QjZC9kF1",
        stake: 1000,
        trust: 0.92,
        validator_trust: 0.9,
        dividends: 0.22,
        emission: 0.15,
        active: true,
        validator_permit: true,
      },
      {
        uid: 2,
        hotkey: "5DAAnrj7VHTz5qZK3m7SVLxMnG7LwTqj4VnM6n9c8Hc44QFq",
        coldkey: "5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw",
        stake: 640,
        trust: 0.81,
        validator_trust: 0.78,
        dividends: 0.14,
        emission: 0.11,
        active: true,
        validator_permit: true,
      },
      {
        uid: 3,
        hotkey: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
        coldkey: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF",
        stake: 120,
        trust: 0.45,
        validator_trust: 0.32,
        dividends: 0.02,
        emission: 0.03,
        active: true,
        validator_permit: false,
      },
    ],
    warnings: ["Mock metagraph sample. Use Python SDK mode for live validator/miner state."],
  };
}

function mockWallet(ss58Address) {
  return {
    ...liveMeta(),
    ss58Address,
    taoBalance: 12.345,
    freeTao: 12.345,
    stakedTao: 12.345,
    stakePositions: [
      {
        netuid: 14,
        subnetName: "TAOHash",
        validatorHotkey: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF",
        coldkey: ss58Address,
        alphaAmount: 24.69,
        taoValue: 12.345,
        slippageRisk: "low",
        source: "matterhorn-sidecar-mock",
      },
    ],
    estimatedValueTao: 24.69,
    providerStatus: "ok",
    updatedAt: new Date().toISOString(),
    message: "Loaded from Matterhorn mock Subtensor sidecar.",
    warnings: ["Mock wallet exposure. Use Python SDK mode for live Finney wallet and stake reads."],
  };
}

function quote(input) {
  const amountTao = positiveAmount(input.amountTao);
  const netuid = Number.isInteger(input.netuid) ? input.netuid : numberOrNull(input.netuid);
  const dynamic = mockDynamicSubnet(netuid ?? 1);
  const priceTao = dynamic.priceTao && dynamic.priceTao > 0 ? dynamic.priceTao : 1;
  const expectedAlpha = amountTao ? amountTao / priceTao : null;
  const idealAlpha = expectedAlpha;
  const slippageBps = amountTao === null ? null : amountTao > 10 ? 150 : amountTao > 1 ? 75 : 25;
  const alphaWithSlippage = expectedAlpha === null || slippageBps === null
    ? null
    : expectedAlpha * (1 - slippageBps / 10_000);
  return {
    ...liveMeta(),
    action: input.action || "stake",
    netuid,
    amountTao,
    priceTao,
    idealAlpha,
    expectedAlpha: alphaWithSlippage ?? expectedAlpha,
    feeTao: 0.0001,
    slippageBps,
    rateTolerance: numberOrNull(input.rateTolerance) ?? 0.005,
    dynamic,
    warnings: [
      "Mock sidecar quote. Use live Subtensor SDK mode before relying on chain economics.",
      "Signing remains external; the sidecar does not need seed phrases, mnemonics, or private keys.",
    ],
    requiresExternalSignature: true,
  };
}

function prepareExtrinsic(input) {
  const quoted = quote({
    action: input.action === "unstake" ? "unstake" : input.action === "transfer" ? "transfer" : "stake",
    netuid: input.netuid ?? input.originNetuid ?? null,
    amountTao: input.amountTao,
  });
  const payload = {
    chain: "bittensor",
    network: NETWORK,
    action: input.action,
    netuid: quoted.netuid,
    originNetuid: input.originNetuid ?? null,
    destinationNetuid: input.destinationNetuid ?? null,
    amountTao: quoted.amountTao,
    coldkey: validSs58(input.coldkey) ? input.coldkey : null,
    hotkey: validSs58(input.hotkey) ? input.hotkey : null,
    destination: validSs58(input.destination) ? input.destination : input.destination ?? null,
    rateTolerance: numberOrNull(input.rateTolerance) ?? 0.005,
    safeMode: true,
    sidecarMode: MODE,
  };
  const forbidden = forbiddenKeyPath(payload);
  if (forbidden) {
    const err = new Error(`Unsigned payload contains forbidden key material field: ${forbidden}`);
    err.status = 400;
    throw err;
  }
  return {
    ...quoted,
    unsignedPayload: payload,
    warnings: [
      ...quoted.warnings,
      "Unsigned payload only. Review and sign in a Bittensor-compatible external signer.",
    ],
  };
}

function pythonBridge(action, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.BITTENSOR_PYTHON || "python3", [join(here, "python_bridge.py"), action], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, BITTENSOR_NETWORK: NETWORK },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Python Bittensor bridge timed out."));
    }, 20_000);
    child.stdout.on("data", (data) => { stdout += data.toString("utf8"); });
    child.stderr.on("data", (data) => { stderr += data.toString("utf8"); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python Bittensor bridge exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Python Bittensor bridge returned invalid JSON."));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function cachedPythonHealth() {
  const now = Date.now();
  if (pythonHealthCache && now - pythonHealthCache.cachedAt < PYTHON_HEALTH_CACHE_MS) {
    return pythonHealthCache.payload;
  }
  const payload = await pythonBridge("health", {});
  pythonHealthCache = { cachedAt: now, payload };
  return payload;
}

function startPythonSubnetRefresh(limit) {
  if (pythonSubnetRefresh) return;
  const refreshLimit = Math.max(limit, pythonSubnetCache?.limit ?? 0, 128);
  pythonSubnetRefresh = pythonBridge("subnets", { limit: refreshLimit })
    .then((payload) => {
      pythonSubnetCache = { cachedAt: Date.now(), limit: refreshLimit, payload };
    })
    .catch((err) => {
      pythonSubnetCache = {
        cachedAt: Date.now(),
        limit: 0,
        payload: {
          ...liveMeta("bittensor-python-sdk"),
          subnets: [],
          warnings: [err instanceof Error ? err.message : "Python subnet list refresh failed."],
        },
      };
    })
    .finally(() => {
      pythonSubnetRefresh = null;
    });
}

function cachedPythonSubnets(limit) {
  const now = Date.now();
  const cached = pythonSubnetCache;
  const isFresh = cached && now - cached.cachedAt < PYTHON_SUBNET_CACHE_MS && cached.limit >= limit;
  if (isFresh) {
    const subnets = Array.isArray(cached.payload.subnets) ? cached.payload.subnets.slice(0, limit) : [];
    return { ...cached.payload, subnets };
  }
  startPythonSubnetRefresh(limit);
  if (cached) {
    const subnets = Array.isArray(cached.payload.subnets) ? cached.payload.subnets.slice(0, limit) : [];
    return {
      ...cached.payload,
      subnets,
      warnings: [
        ...(Array.isArray(cached.payload.warnings) ? cached.payload.warnings : []),
        "Returning cached subnet list while a live Python SDK refresh runs in the background.",
      ],
    };
  }
  return {
    ...liveMeta("bittensor-python-sdk"),
    subnets: [],
    warnings: ["Subnet list is warming from the Python SDK. Retry shortly for live subnet discovery."],
  };
}

async function dispatch(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/liveness") {
    return json(res, 200, livenessPayload());
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
    const bridgeHealth = MODE === "python"
      ? await cachedPythonHealth().catch((err) => ({ ok: false, message: err instanceof Error ? err.message : "Python SDK health check failed." }))
      : null;
    return json(res, 200, livenessPayload(bridgeHealth));
  }

  if (req.method === "GET" && url.pathname === "/subnets") {
    const limit = limitFromUrl(url);
    const data = MODE === "python" ? cachedPythonSubnets(limit) : mockSubnets();
    return json(res, 200, data);
  }

  const dynamicMatch = url.pathname.match(/^\/subnets\/(\d+)\/dynamic$/);
  if (req.method === "GET" && dynamicMatch) {
    const netuid = Number(dynamicMatch[1]);
    const data = MODE === "python" ? await pythonBridge("dynamic_subnet", { netuid }) : mockDynamicSubnet(netuid);
    return json(res, 200, data);
  }

  const metagraphMatch = url.pathname.match(/^\/subnets\/(\d+)\/metagraph$/);
  if (req.method === "GET" && metagraphMatch) {
    const netuid = Number(metagraphMatch[1]);
    const data = MODE === "python" ? await pythonBridge("metagraph", { netuid }) : mockMetagraph(netuid);
    return json(res, 200, data);
  }

  const walletMatch = url.pathname.match(/^\/wallet\/([^/]+)$/);
  if (req.method === "GET" && walletMatch) {
    const ss58Address = decodeURIComponent(walletMatch[1]);
    if (!validSs58(ss58Address)) return json(res, 400, { ok: false, error: "invalid_ss58", message: "Wallet address must be a public SS58 address." });
    const data = MODE === "python" ? await pythonBridge("wallet", { ss58Address }) : mockWallet(ss58Address);
    return json(res, 200, data);
  }

  if (req.method === "POST" && url.pathname === "/extrinsics/quote") {
    const body = await readBody(req);
    const data = MODE === "python" ? await pythonBridge("quote", body) : quote(body);
    return json(res, 200, data);
  }

  if (req.method === "POST" && url.pathname === "/extrinsics/prepare") {
    const body = await readBody(req);
    const forbidden = forbiddenKeyPath(body);
    if (forbidden) return json(res, 400, { ok: false, error: "forbidden_key_material", message: `Request contains forbidden key material field: ${forbidden}` });
    const data = MODE === "python" ? await pythonBridge("prepare", body) : prepareExtrinsic(body);
    return json(res, 200, data);
  }

  if (req.method === "POST" && url.pathname === "/submit") {
    const body = await readBody(req);
    const forbidden = forbiddenKeyPath(body);
    if (forbidden) return json(res, 400, { ok: false, error: "forbidden_key_material", message: `Request contains forbidden key material field: ${forbidden}` });
    if (MODE !== "python" || process.env.BITTENSOR_ENABLE_SUBMIT !== "1") {
      return json(res, 501, {
        ok: false,
        status: "submit_disabled",
        message: "Broadcast submission is disabled. Use Python SDK mode with BITTENSOR_ENABLE_SUBMIT=1 after external signing is verified.",
      });
    }
    const data = await pythonBridge("submit", body);
    return json(res, 200, data);
  }

  return json(res, 404, { ok: false, error: "not_found", message: "Unknown Bittensor sidecar endpoint." });
}

export function createBittensorSidecarServer() {
  return createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      json(res, err.status || 500, {
        ok: false,
        error: err.code || "sidecar_error",
        message: err instanceof Error ? err.message : "Bittensor sidecar error.",
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createBittensorSidecarServer();
  server.listen(PORT, HOST, () => {
    console.log(`Matterhorn Bittensor sidecar listening on http://${HOST}:${PORT} (${MODE}, ${NETWORK})`);
  });
}
