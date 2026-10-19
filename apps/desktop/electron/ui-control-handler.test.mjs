import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createUiControlRequestHandler } from "./ui-control-handler.mjs";

async function invoke(options = {}, request = {}) {
  const calls = [];
  const result = {};
  const handler = createUiControlRequestHandler({
    appName: "Synthetic desktop",
    isAuthorized: () => true,
    readBody: async () => ({ actionId: "fixture" }),
    runCommand: async (...args) => { calls.push(args); return { ok: true }; },
    ...options,
  });
  await handler({ method: "GET", url: "/snapshot", ...request }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = JSON.parse(body); },
  });
  return { ...result, calls };
}

test("UI-control health, auth, command dispatch and cache boundary are preserved", async () => {
  const health = await invoke({ isAuthorized: () => false }, { url: "/health" });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true, app: "Synthetic desktop", version: 1 });
  const denied = await invoke({ isAuthorized: () => false });
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.calls, []);
  for (const command of ["snapshot", "actions"]) {
    const result = await invoke({}, { url: `/${command}` });
    assert.equal(result.status, 200);
    assert.deepEqual(result.calls, [[command]]);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
  const executed = await invoke({}, { method: "POST", url: "/execute" });
  assert.equal(executed.status, 200);
  assert.deepEqual(executed.calls, [["execute", { actionId: "fixture" }]]);
  assert.equal((await invoke({}, { url: "/missing" })).status, 404);
});

test("execution and body errors cannot expose secrets, paths or thrown-object getters", async () => {
  const secret = "synthetic-secret-not-for-http";
  const dangerous = Object.create(null, {
    message: { get() { throw new Error("must not inspect message"); } },
    toString: { get() { throw new Error("must not coerce object"); } },
  });
  for (const failure of [new Error(`/private/fixture/${secret}`), secret, dangerous]) {
    for (const field of ["runCommand", "readBody"]) {
      const result = await invoke({ [field]: async () => { throw failure; } }, { method: "POST", url: "/execute" });
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, {
        ok: false, error: "Could not complete this UI control request.", code: "ui_control_failed",
      });
      assert.equal(JSON.stringify(result.body).includes(secret), false);
    }
  }
});

test("desktop server uses the independently tested HTTP handler", () => {
  const source = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('from "./ui-control-handler.mjs"'));
  assert.ok(source.includes("createServer(createUiControlRequestHandler({"));
});
