#!/usr/bin/env node
import assert from "node:assert/strict";
import { createBittensorSidecarServer } from "./index.mjs";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";

const server = createBittensorSidecarServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { res, json: await res.json() };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}

try {
  const health = await get("/health");
  assert.equal(health.res.status, 200);
  assert.equal(health.json.status, "healthy");
  assert.equal(health.json.mode, "mock");
  assert.equal(JSON.stringify(health.json).includes("127.0.0.1"), false);

  const status = await get("/status");
  assert.equal(status.json.status, "healthy");

  const metagraph = await get("/subnets/14/metagraph");
  assert.equal(metagraph.res.status, 200);
  assert.equal(metagraph.json.netuid, 14);
  assert.ok(Array.isArray(metagraph.json.neurons));
  assert.ok(metagraph.json.neurons.length > 0);

  const wallet = await get(`/wallet/${VALID_SS58}`);
  assert.equal(wallet.res.status, 200);
  assert.equal(wallet.json.providerStatus, "ok");
  assert.equal(wallet.json.ss58Address, VALID_SS58);

  const invalidWallet = await get("/wallet/not-an-ss58-address");
  assert.equal(invalidWallet.res.status, 400);
  assert.equal(invalidWallet.json.error, "invalid_ss58");

  const quote = await post("/extrinsics/quote", { action: "stake", netuid: 14, amountTao: "2" });
  assert.equal(quote.res.status, 200);
  assert.equal(quote.json.requiresExternalSignature, true);
  assert.equal(quote.json.expectedAlpha, 4);

  const preview = await post("/extrinsics/prepare", { action: "stake", netuid: 14, amountTao: "2", hotkey: VALID_SS58 });
  assert.equal(preview.res.status, 200);
  assert.equal(preview.json.unsignedPayload.action, "stake");
  assert.equal(preview.json.unsignedPayload.safeMode, true);
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(preview.json.unsignedPayload)), false);

  const rejectedSecret = await post("/extrinsics/prepare", { action: "stake", netuid: 14, secretSeed: "nope" });
  assert.equal(rejectedSecret.res.status, 400);
  assert.equal(rejectedSecret.json.error, "forbidden_key_material");

  const submit = await post("/submit", { signature: "0x1234567890abcdef", preview: preview.json.unsignedPayload });
  assert.equal(submit.res.status, 501);
  assert.equal(submit.json.status, "submit_disabled");

  console.log("Bittensor Subtensor sidecar contract tests passed.");
} finally {
  server.close();
}
