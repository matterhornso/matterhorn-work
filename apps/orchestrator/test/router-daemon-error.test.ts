import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { RouterDaemonRequestError, routerDaemonErrorResponse } from "../src/router-daemon-error.js";

test("only explicitly classified request errors retain public validation status", () => {
  expect(routerDaemonErrorResponse(new RouterDaemonRequestError("invalid_json"))).toEqual({ status: 400, error: "invalid_json" });
  expect(routerDaemonErrorResponse(new RouterDaemonRequestError("payload_too_large"))).toEqual({ status: 413, error: "payload_too_large" });
});

test("filesystem, remote and parse failures expose no arbitrary text even with a plausible status", () => {
  const detail = "synthetic-secret /private/operator/config https://remote.invalid/?token=synthetic";
  for (const error of [new Error(detail), new SyntaxError(detail), Object.assign(new Error(detail), { statusCode: 400 }), { statusCode: 413, message: detail }, detail, null]) {
    const result = routerDaemonErrorResponse(error);
    expect(result).toEqual({ status: 500, error: "router_request_failed" });
    expect(JSON.stringify(result)).not.toContain(detail);
  }
});

test("safe failure handling does not stringify hostile values or read message and status accessors", () => {
  let accessed = false;
  const value = {
    get message() { accessed = true; throw new Error("unsafe"); },
    get statusCode() { accessed = true; throw new Error("unsafe"); },
    toString() { accessed = true; throw new Error("unsafe"); },
  };
  expect(routerDaemonErrorResponse(value)).toEqual({ status: 500, error: "router_request_failed" });
  expect(accessed).toBe(false);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  expect(routerDaemonErrorResponse(revoked.proxy)).toEqual({ status: 500, error: "router_request_failed" });
});

test("reachable daemon catch uses stable public failures with separate bounded local diagnostics", async () => {
  const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function runRouterDaemon(");
  const end = source.indexOf("const shutdown = async", start);
  const daemon = source.slice(start, end);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  expect(daemon).toContain('new RouterDaemonRequestError("payload_too_large")');
  expect(daemon).toContain('new RouterDaemonRequestError("invalid_json")');
  const failure = daemon.slice(daemon.lastIndexOf("} catch (error) {"));
  expect(failure).toContain("routerDaemonErrorResponse(error)");
  expect(failure).toContain("runtimeUpgradeFailureDiagnostic(error)");
  expect(failure).not.toContain("error.message");
  expect(failure).not.toContain("String(error)");
  expect(failure).not.toContain("statusCode");
});
