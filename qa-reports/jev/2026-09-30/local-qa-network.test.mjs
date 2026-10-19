import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { request } from "playwright";
import { createLocalQaBackend, requireLoopbackOrigin, signInLocalQaBrowser } from "./local-qa-network.mjs";

const credentials = { email: "disposable-qa@example.invalid", password: "synthetic-fixture-only" };

test("accepts only canonical literal loopback HTTP(S) origins", () => {
  for (const origin of ["http://127.0.0.1:12345", "http://localhost:12345", "http://[::1]:12345",
    "https://127.0.0.1:12345", "https://localhost:12345", "https://[::1]:12345"]) {
    assert.equal(requireLoopbackOrigin(origin, "fixture"), origin);
    assert.equal(requireLoopbackOrigin(`${origin}/`, "fixture"), origin);
    assert.equal(typeof createLocalQaBackend(origin, origin), "function");
  }
  for (const origin of [undefined, null, "", "not a URL", "//127.0.0.1:12345",
    "https://example.invalid", "http://127.0.0.1.example.invalid", "http://localhost.example.invalid",
    "http://desk.localhost:12345", "http://localhost.:12345", "http://0.0.0.0:12345", "http://192.168.1.1:12345",
    "file:///tmp/qa", "ftp://127.0.0.1", "ws://127.0.0.1", "javascript:alert(1)",
    "http://user:password@127.0.0.1:12345", "http://127.0.0.1:12345@evil.invalid",
    "http://127.1:12345", "http://2130706433:12345", "http://0x7f000001:12345",
    "http://[0:0:0:0:0:0:0:1]:12345", "http://[::ffff:127.0.0.1]:12345", "http://%6cocalhost:12345",
    " http://localhost:12345", "http://localhost:12345\n", "HTTP://LOCALHOST:12345",
    "http://localhost:12345/path", "http://localhost:12345/?query=value", "http://localhost:12345/#fragment",
    "http://localhost:12345\\@evil.invalid"]) {
    assert.throws(() => requireLoopbackOrigin(origin, "fixture"), /loopback origin required/);
    assert.throws(() => createLocalQaBackend(origin, "http://127.0.0.1:12345"), /loopback origin required/);
  }
});

test("backend origin must independently match host, scheme and port", () => {
  const origin = "http://127.0.0.1:12345";
  for (const expected of [undefined, "https://example.invalid", "http://127.0.0.1:12346",
    "http://localhost:12345", "https://127.0.0.1:12345", "http://[::1]:12345"]) {
    assert.throws(() => createLocalQaBackend(origin, expected), /origin/);
  }
  const backend = createLocalQaBackend(origin, origin);
  for (const path of ["https://example.invalid/", "//example.invalid/", "//127.0.0.1:12346/",
    "/\\example.invalid/", "/api#fragment", "relative/path"]) {
    assert.throws(() => backend(path, { headers: { cookie: "fixture=private" } }), /path|required|pinned backend origin/);
  }
});

async function serve(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

test("retains normal disposable sign-in and authenticated readback without a browser or provider", async () => {
  const received = [];
  const service = await serve(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ path: req.url, cookie: req.headers.cookie, body: Buffer.concat(chunks).toString() });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/auth/sign-in/email") {
      assert.deepEqual(JSON.parse(received.at(-1).body), credentials);
      res.setHeader("set-cookie", "qa-session=synthetic-only; HttpOnly; Path=/");
      res.end(JSON.stringify({ user: { id: "qa-disposable" } }));
    } else {
      if (req.headers.cookie !== "qa-session=synthetic-only") { res.writeHead(401); res.end("{}"); return; }
      res.end(JSON.stringify({ items: [{ id: "workspace-fixture" }] }));
    }
  });
  const context = await request.newContext();
  try {
    assert.equal((await signInLocalQaBrowser(context, service.origin, credentials)).ok(), true);
    assert.equal((await context.get(`${service.origin}/workspaces`)).ok(), true);
    const backend = createLocalQaBackend(service.origin, service.origin);
    const signed = await backend("/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials),
    });
    assert.equal(signed.ok, true);
    const cookie = signed.headers.get("set-cookie").split(";")[0];
    for (const path of ["/workspaces", "/workspace/workspace-fixture/sessions/session-fixture/messages",
      "/workspace/workspace-fixture/model-usage/status"]) {
      const result = await backend(path, { headers: { cookie } });
      assert.equal(result.ok, true);
      assert.deepEqual(await result.json(), { items: [{ id: "workspace-fixture" }] });
    }
    assert.equal(received.length, 6);
  } finally { await context.dispose(); await service.close(); }
});

test("browser and backend credentials/cookies never follow 301/302/303/307/308 redirects", async () => {
  const leaked = [];
  const trap = await serve((req, res) => { leaked.push({ method: req.method, cookie: req.headers.cookie }); res.end("unexpected"); });
  let status = 302;
  let destination = `${trap.origin}/capture`;
  const attempts = [];
  const service = await serve((req, res) => { attempts.push(req.url); res.writeHead(status, { location: destination }); res.end(); });
  const context = await request.newContext();
  try {
    const backend = createLocalQaBackend(service.origin, service.origin);
    for (status of [301, 302, 303, 307, 308]) {
      const browserResult = await signInLocalQaBrowser(context, service.origin, credentials);
      assert.equal(browserResult.status(), status);
      assert.equal(browserResult.ok(), false);
      await assert.rejects(backend("/api/auth/sign-in/email", {
        method: "POST", body: JSON.stringify(credentials), redirect: "follow",
      }), /fetch failed/);
      await assert.rejects(backend("/workspaces", { headers: { cookie: "qa-session=synthetic-only" } }), /fetch failed/);
    }
    // Redirects within the same origin must also fail closed, not silently
    // replay a credential POST at a different endpoint.
    destination = "/capture";
    const before = attempts.length;
    await assert.rejects(backend("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify(credentials) }), /fetch failed/);
    assert.deepEqual(attempts.slice(before), ["/api/auth/sign-in/email"]);
    assert.deepEqual(leaked, []);
  } finally { await context.dispose(); await service.close(); await trap.close(); }
});
