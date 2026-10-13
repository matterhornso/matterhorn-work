import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");
const require = createRequire(import.meta.url);
const versions = {
  "brace-expansion": "5.0.12", "engine.io": "6.6.10", "fast-uri": "3.1.8", axios: "1.20.0",
  "http-cache-semantics": "4.3.0", "proxy-addr": "2.0.8",
  seroval: "1.6.9", sharp: "0.35.5", "source-map-js": "1.2.2",
};
const securityPins = { ...versions, next: "16.3.8", "@modelcontextprotocol/sdk": "1.31.0" };
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
    assert.ok(workspace.includes(`${name}: ${version}`) || workspace.includes(`"${name}": ${version}`));
    assert.ok(lock.includes(`  ${name}@${version}:`) || lock.includes(`  '${name}@${version}':`));
  }
  for (const version of [
    "brace-expansion@5.0.9:", "engine.io@6.6.7:", "fast-uri@3.1.7:", "axios@1.18.0:",
    "next@16.3.4:", "next@16.3.6:", "@modelcontextprotocol/sdk@1.29.0", "@modelcontextprotocol/sdk@1.30.1",
    "http-cache-semantics@4.2.0:", "postcss-selector-parser@7.1.5:", "proxy-addr@2.0.7:",
    "seroval@1.5.6:", "sharp@0.35.4:", "source-map-js@1.2.1:",
    "sprintf-js@", "roarr@2.15.4:",
  ])
    assert.ok(!lock.includes(version));
});

test("Electron proxy logging upgrade preserves downloads, bypass, checksums, and timeout", { timeout: 15_000 }, async () => {
  const override = "global-agent@3.0.0>roarr";
  assert.equal(manifest.pnpm.overrides[override], "3.3.0");
  assert.ok(readFileSync(new URL("pnpm-workspace.yaml", root), "utf8").includes(`"${override}": 3.3.0`));
  // global-agent modifies Node's HTTP methods: run this contract in a child, not
  // in the test runner process or against a user's real proxy configuration.
  const { stdout } = await promisify(execFile)(process.execPath, [
    new URL("fixtures/electron-proxy-security.mjs", import.meta.url).pathname,
  ], { timeout: 12_000 });
  assert.deepEqual(JSON.parse(stdout.trim()), { proxy: true, bypass: true, checksum: true, timeout: true, logs: true });
});

test("patched proxy trust and cache policy retain security boundaries", () => {
  const trust = patched("proxy-addr").compile(["127.0.0.0/8"]);
  assert.equal(trust("127.0.0.1"), true);
  assert.equal(trust("203.0.113.1"), false);
  const CachePolicy = patched("http-cache-semantics");
  const request = { url: "https://example.com/profile", method: "GET", headers: {} };
  const policy = new CachePolicy(request, { status: 200, headers: { "cache-control": "no-store", "set-cookie": "session=fixture" } });
  // The documented contract requires discarding non-storable responses before
  // consulting reuse/freshness; max-stale is not a storage permission.
  assert.equal(policy.storable(), false);
  const publicPolicy = new CachePolicy(request, { status: 200, headers: { "cache-control": "public, max-age=60" } });
  assert.equal(publicPolicy.storable(), true);
  assert.equal(publicPolicy.satisfiesWithoutRevalidation(request), true);
});

test("patched parsers and serializer preserve ordinary application data", () => {
  const seroval = patched("seroval");
  const value = { desk: "sui", selected: true, items: [1, 2] };
  assert.deepEqual(seroval.fromJSON(seroval.toJSON(value)), value);
  const { SourceMapGenerator, SourceMapConsumer } = patched("source-map-js");
  const generator = new SourceMapGenerator({ file: "app.js" });
  generator.addMapping({ generated: { line: 1, column: 0 }, source: "app.ts", original: { line: 1, column: 0 } });
  const consumer = new SourceMapConsumer(generator.toJSON());
  assert.equal(consumer.originalPositionFor({ line: 1, column: 0 }).source, "app.ts");
});

test("unused generator is removed while its exact licensed stylesheet is preserved", () => {
  const app = JSON.parse(readFileSync(new URL("apps/app/package.json", root), "utf8"));
  assert.equal(app.dependencies.shadcn, undefined);
  assert.equal(app.devDependencies.shadcn, undefined);
  for (const name of ["shadcn", "braces", "micromatch", "postcss-selector-parser"]) {
    assert.ok(!new RegExp(`^  ${name}@`, "m").test(lock), `${name} must not remain in the dependency graph`);
  }
  const css = readFileSync(new URL("apps/app/src/styles/vendor/shadcn-tailwind.css", root));
  assert.equal(createHash("sha256").update(css).digest("hex"), "146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6");
  assert.ok(readFileSync(new URL("apps/app/src/styles/vendor/shadcn-LICENSE.md", root), "utf8").includes("Copyright (c) 2023 shadcn"));
  assert.ok(readFileSync(new URL("apps/app/src/app/index.css", root), "utf8").includes('@import "../styles/vendor/shadcn-tailwind.css";'));
});

test("patched image library retains local image encoding", async () => {
  const sharp = patched("sharp");
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await sharp(png).metadata()).format, "png");
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
