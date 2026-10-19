import assert from "node:assert/strict";
import test from "node:test";
import { startHealthServer } from "../dist/health.js";
import { createRouterPublicError, ROUTER_ADAPTER_START_FAILURE, ROUTER_CONTROL_FAILURE } from "../dist/public-control-error.js";

const token = "synthetic-control-token";
const marker = "synthetic-private-path-provider-token";

async function fixture(handlers) {
  let port;
  const diagnostics = [];
  const logger = {
    info(value, message) { if (message === "health server listening") port = value.port; },
    warn(value) { diagnostics.push(value); },
    error(value) { diagnostics.push(value); },
  };
  const stop = await startHealthServer(0, () => ({ ok: true }), logger, handlers, { writeToken: token });
  return {
    stop, diagnostics,
    async request(path, method = "GET", body, authorized = true) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method, headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

const routes = [
  ["/config/telegram-token", "POST", { token: "synthetic" }],
  ["/config/slack-tokens", "POST", { botToken: "synthetic", appToken: "synthetic" }],
  ["/identities/telegram", "GET"],
  ["/identities/telegram", "POST", { token: "synthetic" }],
  ["/identities/telegram/default", "DELETE"],
  ["/identities/slack", "GET"],
  ["/identities/slack", "POST", { botToken: "synthetic", appToken: "synthetic" }],
  ["/identities/slack/default", "DELETE"],
  ["/config/groups", "POST", { enabled: true }],
  ["/bindings", "GET"],
  ["/bindings", "POST", { channel: "slack", peerId: "synthetic", directory: "synthetic" }],
  ["/send", "POST", { channel: "slack", peerId: "synthetic", text: "hello" }],
];

test("all twelve error sinks reject unauthenticated calls and redact unexpected failures", async () => {
  let calls = 0;
  const fail = async () => { calls++; throw Object.assign(new Error(marker), { status: 400, code: "EACCES" }); };
  const server = await fixture({
    upsertTelegramIdentity: fail, upsertSlackIdentity: fail, listTelegramIdentities: fail, listSlackIdentities: fail,
    deleteTelegramIdentity: fail, deleteSlackIdentity: fail, setGroupsEnabled: fail, listBindings: fail,
    setBinding: fail, clearBinding: fail, sendMessage: fail,
  });
  try {
    for (const [path, method, body] of routes) {
      assert.equal((await server.request(path, method, body, false)).status, 401);
    }
    assert.equal(calls, 0);
    for (const [path, method, body] of routes) {
      assert.deepEqual(await server.request(path, method, body), { status: 500, body: { ok: false, error: ROUTER_CONTROL_FAILURE } });
    }
    assert.equal(calls, 12);
    assert.equal(JSON.stringify(server.diagnostics).includes(marker), false);
    assert.ok(server.diagnostics.every(value => value.error.code === "EACCES"));
  } finally { server.stop(); }
});

test("request parse errors are fixed but trusted validation retains safe detail", async () => {
  let calls = 0;
  const server = await fixture({ upsertTelegramIdentity: async () => { calls++; throw createRouterPublicError("outside_workspace"); } });
  try {
    assert.deepEqual(await server.request("/identities/telegram", "POST", `{"token":"${marker}"`), {
      status: 400, body: { ok: false, error: "Request body must be a JSON object." },
    });
    assert.equal(calls, 0);
    assert.deepEqual(await server.request("/identities/telegram", "POST", { token: "synthetic" }), {
      status: 400, body: { ok: false, error: "Directory must stay within workspace root." },
    });
  } finally { server.stop(); }
});

test("HTTP success envelopes do not expose adapter or delivery exception text", async () => {
  const server = await fixture({
    upsertTelegramIdentity: async () => ({ id: "default", enabled: true, applied: false, error: marker }),
    upsertSlackIdentity: async () => ({ id: "default", enabled: true, starting: false, error: marker }),
    sendMessage: async () => ({ channel: "slack", directory: "synthetic", attempted: 1, sent: 0,
      failures: [{ identityId: "default", peerId: "synthetic", error: marker }],
      targets: [{ identityId: "default", peerId: "synthetic", attemptedParts: 1, sentParts: 0,
        partResults: [{ index: 0, type: "text", sent: false, code: "auth", retryable: false, error: marker }] }],
    }),
  });
  try {
    for (const path of ["/config/telegram-token", "/identities/telegram"]) {
      const response = await server.request(path, "POST", { token: "synthetic" });
      assert.equal(response.status, 200);
      assert.equal(response.body.telegram.error, ROUTER_ADAPTER_START_FAILURE);
      assert.equal(response.body.telegram.applied, false);
    }
    for (const path of ["/config/slack-tokens", "/identities/slack"]) {
      const response = await server.request(path, "POST", { botToken: "synthetic", appToken: "synthetic" });
      assert.equal(response.status, 200);
      assert.equal(response.body.slack.error, ROUTER_ADAPTER_START_FAILURE);
      assert.equal(response.body.slack.starting, false);
    }
    const delivery = await server.request("/send", "POST", { channel: "slack", peerId: "synthetic", text: "hello" });
    assert.equal(delivery.status, 200);
    assert.equal(JSON.stringify(delivery).includes(marker), false);
    assert.equal(delivery.body.failures[0].error, "Messaging authentication failed.");
    assert.equal(delivery.body.targets[0].partResults[0].retryable, false);
  } finally { server.stop(); }
});
