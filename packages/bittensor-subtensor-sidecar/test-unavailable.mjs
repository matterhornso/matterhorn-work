#!/usr/bin/env node
import assert from "node:assert/strict";

process.env.BITTENSOR_SIDECAR_MODE = "python";
process.env.BITTENSOR_PYTHON = "/nonexistent/matterhorn-test-python";
const { createBittensorSidecarServer } = await import("./index.mjs");
const server = createBittensorSidecarServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const path of ["/liveness", "/health", "/health"]) {
    const value = await (await fetch(base + path)).json();
    assert.equal(value.status, "degraded");
    assert.equal(value.sdkAvailable, false);
    assert.equal(value.canRead, false);
    assert.equal(value.canPrepare, false);
    assert.equal(value.canSubmit, false);
    assert.equal(value.block, null);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await (await fetch(base + "/subnets")).json();
    assert.deepEqual(value.subnets, []);
    assert.equal(value.block, null);
    assert.notEqual(value.freshness, "live");
  }
  console.log("Bittensor unavailable SDK fails closed without crashing.");
} finally {
  server.close();
}
