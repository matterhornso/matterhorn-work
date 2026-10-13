// Isolated, disposable loopback contract for global-agent's logger replacement.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url);
const electronRequire = createRequire(new URL("node_modules/.pnpm/@electron+get@3.1.0/node_modules/@electron/get/package.json", root));
const proxyRequire = createRequire(electronRequire.resolve("global-agent/package.json"));
assert.equal(proxyRequire("roarr/package.json").version, "3.3.0");
assert.equal(electronRequire("global-agent/package.json").version, "3.0.0");
process.env.ROARR_LOG = "true";
process.env.ELECTRON_GET_NO_PROGRESS = "1";
process.env.GLOBAL_AGENT_FORCE_GLOBAL_AGENT = "true";
process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE = "GLOBAL_AGENT_";
delete process.env.ELECTRON_GET_USE_PROXY;

const payload = "disposable Electron download fixture";
const hits = [];
const proxy = createServer((request, response) => {
  hits.push(request.url);
  if (request.url.endsWith("/slow")) return;
  response.end(payload);
});
let bypasses = 0;
const direct = createServer((_request, response) => { bypasses++; response.end(payload); });
const temporary = await mkdtemp(join(tmpdir(), "matterhorn-proxy-smoke-"));
try {
  proxy.listen(0, "127.0.0.1");
  direct.listen(0, "127.0.0.1");
  await Promise.all([once(proxy, "listening"), once(direct, "listening")]);
  process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${proxy.address().port}`;
  process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.GLOBAL_AGENT_HTTP_PROXY;
  process.env.GLOBAL_AGENT_NO_PROXY = "127.0.0.1";

  const logger = proxyRequire("roarr");
  const records = [];
  logger.ROARR.write = record => records.push(JSON.parse(record));
  const electron = electronRequire(".");
  electron.initializeProxy();
  assert.ok(globalThis.GLOBAL_AGENT, "proxy initialization must not silently fail");
  const { GotDownloader } = electronRequire("./dist/cjs/GotDownloader.js");
  const downloader = new GotDownloader();
  const options = { quiet: true, retry: { limit: 0 }, timeout: { request: 1000 } };

  await downloader.download("http://electron-fixture.invalid/proxy", join(temporary, "proxy"), options);
  assert.equal(await readFile(join(temporary, "proxy"), "utf8"), payload);
  assert.ok(hits.includes("http://electron-fixture.invalid/proxy"));
  const beforeBypass = hits.length;
  await downloader.download(`http://127.0.0.1:${direct.address().port}/direct`, join(temporary, "direct"), options);
  assert.equal(bypasses, 1);
  assert.equal(hits.length, beforeBypass);

  const details = {
    version: "30.0.0", artifactName: "fixture.zip", isGeneric: true,
    cacheRoot: join(temporary, "cache"), tempDirectory: temporary, force: true,
    downloadOptions: options,
    mirrorOptions: { resolveAssetURL: async () => "http://electron-fixture.invalid/fixture.zip" },
    checksums: { "fixture.zip": createHash("sha256").update(payload).digest("hex") },
  };
  assert.equal(await readFile(await electron.downloadArtifact(details), "utf8"), payload);
  await assert.rejects(electron.downloadArtifact({ ...details, checksums: { "fixture.zip": "0".repeat(64) } }), /checksum/i);
  await assert.rejects(downloader.download("http://electron-fixture.invalid/slow", join(temporary, "timeout"),
    { ...options, timeout: { request: 50 } }), error => error.code === "ETIMEDOUT");
  assert.ok(records.some(record => record.context.package === "global-agent" && record.message === "proxying request"));
  assert.ok(records.some(record => record.context.package === "global-agent" && record.context.logLevel >= 40));
  process.stdout.write(JSON.stringify({ proxy: true, bypass: true, checksum: true, timeout: true, logs: true }) + "\n");
} finally {
  for (const server of [proxy, direct]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(temporary, { recursive: true, force: true });
}
