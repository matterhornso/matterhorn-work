import assert from "node:assert/strict";
import test from "node:test";
import {
  createRouterPublicError, parseControlJson, publicIdentityResult, publicRouterFailure,
  publicSendResult, routerFailureDiagnostic, ROUTER_ADAPTER_START_FAILURE, ROUTER_CONTROL_FAILURE,
} from "../dist/public-control-error.js";

const privateMarker = "synthetic-private-path-provider-token";

test("unknown errors never become public messages, even with a public-looking status", () => {
  const hostile = Object.defineProperties({}, {
    message: { get() { throw new Error(privateMarker); } },
    status: { get() { throw new Error(privateMarker); } },
    code: { get() { throw new Error(privateMarker); } },
    toString: { value() { throw new Error(privateMarker); } },
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const error of [new Error(privateMarker), new SyntaxError(privateMarker), privateMarker,
    Object.assign(new Error(privateMarker), { status: 400, code: privateMarker, cause: new Error(privateMarker) }),
    hostile, revoked.proxy, null]) {
    assert.deepEqual(publicRouterFailure(error), { status: 500, message: ROUTER_CONTROL_FAILURE });
    assert.equal(JSON.stringify(routerFailureDiagnostic(error)).includes(privateMarker), false);
  }
});

test("closed validation codes and exact safe literals preserve only their mapped status", () => {
  assert.deepEqual(publicRouterFailure(createRouterPublicError("file_unavailable")), { status: 404, message: "File not found." });
  assert.deepEqual(publicRouterFailure(createRouterPublicError("payload_too_large")), { status: 413, message: "File exceeds maximum allowed size." });
  assert.deepEqual(publicRouterFailure(Object.assign(new Error("Invalid channel"), { status: 599 })), { status: 400, message: "Invalid channel" });
  assert.deepEqual(routerFailureDiagnostic(Object.assign(new Error(privateMarker), { code: "EACCES" })), { kind: "Error", code: "EACCES" });
});

test("body JSON parsing emits fixed errors and does not misclassify persisted parser errors", () => {
  assert.deepEqual(parseControlJson(""), {});
  assert.deepEqual(parseControlJson('{"enabled":true}'), { enabled: true });
  for (const raw of [`{"token":"${privateMarker}"`, "null", "[]", "42"]) {
    assert.throws(() => parseControlJson(raw), error => {
      assert.deepEqual(publicRouterFailure(error), { status: 400, message: "Request body must be a JSON object." });
      return true;
    });
  }
  assert.equal(publicRouterFailure(new SyntaxError(privateMarker)).status, 500);
});

test("identity errors are fixed without changing applied or starting flags", () => {
  const result = { id: "default", enabled: true, applied: false, starting: false, error: privateMarker };
  assert.deepEqual(publicIdentityResult(result), { ...result, error: ROUTER_ADAPTER_START_FAILURE });
  assert.equal(result.error, privateMarker);
  const success = { id: "default", enabled: true, applied: true };
  assert.equal(publicIdentityResult(success), success);
});

test("delivery errors are projected while target metadata and retry semantics remain", () => {
  const result = {
    channel: "slack", directory: "synthetic-workspace", attempted: 1, sent: 0,
    failures: [{ identityId: "default", peerId: "synthetic-peer", error: privateMarker }],
    targets: [{ identityId: "default", peerId: "synthetic-peer", attemptedParts: 2, sentParts: 1,
      partResults: [
        { index: 0, type: "text", sent: true },
        { index: 1, type: "file", sent: false, error: privateMarker, code: "timeout", retryable: true },
      ] }],
  };
  const projected = publicSendResult(result);
  assert.equal(JSON.stringify(projected).includes(privateMarker), false);
  assert.equal(projected.failures[0].error, "Messaging delivery timed out.");
  assert.deepEqual(projected.targets[0].partResults[1], {
    index: 1, type: "file", sent: false, error: "Messaging delivery timed out.", code: "timeout", retryable: true,
  });
  assert.equal(projected.attempted, 1);
  assert.equal(projected.sent, 0);
  assert.equal(result.failures[0].error, privateMarker);
  assert.deepEqual(publicSendResult({ channel: "slack", directory: "synthetic-workspace", attempted: 0, sent: 0 }), {
    channel: "slack", directory: "synthetic-workspace", attempted: 0, sent: 0,
  });
});
