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

const here = dirname(fileURLToPath(import.meta.url));

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

function mockMetagraph(netuid) {
  const now = new Date().toISOString();
  return {
    network: NETWORK,
    netuid,
    block: 123456,
    n: 3,
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
    updatedAt: now,
    source: "matterhorn-sidecar-mock",
  };
}

function mockWallet(ss58Address) {
  return {
    ss58Address,
    taoBalance: 12.345,
    stakePositions: [
      {
        netuid: 14,
        subnetName: "TAOHash",
        validatorHotkey: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF",
        alphaAmount: 24.69,
        taoValue: 12.345,
        slippageRisk: "low",
      },
    ],
    estimatedValueTao: 24.69,
    providerStatus: "ok",
    updatedAt: new Date().toISOString(),
    message: "Loaded from Matterhorn mock Subtensor sidecar.",
  };
}

function quote(input) {
  const amountTao = positiveAmount(input.amountTao);
  const netuid = Number.isInteger(input.netuid) ? input.netuid : numberOrNull(input.netuid);
  const priceTao = netuid === 14 ? 0.5 : 1;
  const expectedAlpha = amountTao ? amountTao / priceTao : null;
  const slippageBps = amountTao === null ? null : amountTao > 10 ? 150 : amountTao > 1 ? 75 : 25;
  return {
    action: input.action || "stake",
    netuid,
    amountTao,
    expectedAlpha,
    feeTao: 0.0001,
    slippageBps,
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

async function dispatch(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
    return json(res, 200, {
      ok: true,
      status: "healthy",
      mode: MODE,
      network: NETWORK,
      canRead: true,
      canPrepare: true,
      canSubmit: MODE === "python" && process.env.BITTENSOR_ENABLE_SUBMIT === "1",
      message: MODE === "mock"
        ? "Matterhorn mock Subtensor sidecar is running. Broadcast submission is disabled."
        : "Matterhorn Subtensor sidecar is running in Python SDK mode.",
    });
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
