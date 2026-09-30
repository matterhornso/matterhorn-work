import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");
const require = createRequire(import.meta.url);
const versions = { "brace-expansion": "5.0.12", "engine.io": "6.6.10", "fast-uri": "3.1.8", axios: "1.20.0" };
const securityPins = { ...versions, next: "16.3.6" };
function patched(name) {
  const version = versions[name];
  const directory = process.env.MATTERHORN_SECURITY_SMOKE_ROOT
    ? resolve(process.env.MATTERHORN_SECURITY_SMOKE_ROOT, "node_modules", name)
    : new URL(`node_modules/.pnpm/${name}@${version}/node_modules/${name}/`, root).pathname;
  assert.equal(JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")).version, version);
  return require(directory);
}

test("release lock and both override sources retain patched versions", () => {
  const workspace = readFileSync(new URL("pnpm-workspace.yaml", root), "utf8");
  for (const [name, version] of Object.entries(securityPins)) {
    assert.equal(manifest.pnpm.overrides[name], version);
    assert.ok(workspace.includes(`${name}: ${version}`));
    assert.ok(lock.includes(`  ${name}@${version}:`));
  }
  for (const version of ["brace-expansion@5.0.9:", "engine.io@6.6.7:", "fast-uri@3.1.7:", "axios@1.18.0:", "next@16.3.4:"])
    assert.ok(!lock.includes(version));
});

test("patched brace expansion preserves ordinary glob expansion", () => {
  const { expand } = patched("brace-expansion");
  assert.deepEqual(expand("desk/{sui,bittensor}/{1..2}"), [
    "desk/sui/1", "desk/sui/2", "desk/bittensor/1", "desk/bittensor/2",
  ]);
});

test("patched URI parser consistently normalizes encoded host case", () => {
  const uri = patched("fast-uri");
  assert.equal(uri.normalize("https://EXAMPLE.com/desk"), "https://example.com/desk");
  assert.equal(uri.normalize("https://%45XAMPLE.com/desk"), "https://example.com/desk");
});

test("patched Axios retains JSON requests, redirects, and cancellation", { timeout: 10_000 }, async () => {
  const axios = patched("axios");
  const http = createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: "/json" }); response.end(); return; }
    if (request.url === "/wait") return;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ready: true }));
  });
  http.listen(0, "127.0.0.1");
  try {
    await once(http, "listening");
    const base = `http://127.0.0.1:${http.address().port}`;
    const result = await axios.get(`${base}/redirect`, { proxy: false });
    assert.deepEqual(result.data, { ready: true });
    await assert.rejects(axios.get(`${base}/wait`, { proxy: false, signal: AbortSignal.timeout(50) }),
      error => error.code === "ERR_CANCELED");
  } finally {
    http.closeAllConnections();
    await new Promise((done, reject) => http.close(error => error ? reject(error) : done()));
  }
});

test("patched Engine.IO accepts supported polling and rejects old protocol", { timeout: 10_000 }, async () => {
  const { Server } = patched("engine.io");
  const http = createServer();
  const engine = new Server({ allowEIO3: false });
  engine.attach(http);
  http.listen(0, "127.0.0.1");
  try {
    await once(http, "listening");
    const base = `http://127.0.0.1:${http.address().port}/engine.io/?transport=polling`;
    const supported = await fetch(`${base}&EIO=4`);
    assert.equal(supported.status, 200);
    const packet = await supported.text();
    assert.equal(packet[0], "0");
    assert.equal(typeof JSON.parse(packet.slice(1)).sid, "string");
    const unsupported = await fetch(`${base}&EIO=3`);
    assert.equal(unsupported.status, 400);
    assert.equal((await unsupported.json()).code, 5);
  } finally {
    engine.close();
    http.closeAllConnections();
    await new Promise((done, reject) => http.close(error => error ? reject(error) : done()));
  }
});
