import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  failRuntimeUpgrade,
  RUNTIME_UPGRADE_FAILURE_MESSAGE,
  runtimeUpgradeFailureDiagnostic,
  startRuntimeUpgrade,
  type RuntimeServiceName,
} from "../src/runtime-upgrade-state.js";

test("upgrade failure exposes one bounded message while preserving operation metadata", () => {
  const running = startRuntimeUpgrade(["opencode"], "operation-one", 100);
  const failed = failRuntimeUpgrade(running, 200);
  expect(failed).toEqual({
    status: "failed", startedAt: 100, finishedAt: 200,
    error: RUNTIME_UPGRADE_FAILURE_MESSAGE, operationId: "operation-one", services: ["opencode"],
  });
  expect(running.status).toBe("running");
  expect(running.error).toBeNull();
  expect(RUNTIME_UPGRADE_FAILURE_MESSAGE.length).toBeLessThan(100);
});

test("a new accepted upgrade clears all previous failure fields before it is serialized", () => {
  const state = failRuntimeUpgrade(startRuntimeUpgrade(["opencode"], "previous", 100), 200);
  const services: RuntimeServiceName[] = ["openwork-server", "opencode-router"];
  Object.assign(state, startRuntimeUpgrade(services, "next", 300));
  services.push("opencode");
  const acceptedResponse = JSON.parse(JSON.stringify({ ok: true, started: true, upgrade: { ...state } }));
  expect(acceptedResponse.upgrade).toEqual({
    status: "running", startedAt: 300, finishedAt: null, error: null,
    operationId: "next", services: ["openwork-server", "opencode-router"],
  });
  expect(JSON.stringify(acceptedResponse)).not.toContain("previous");
  expect(JSON.stringify(acceptedResponse)).not.toContain(RUNTIME_UPGRADE_FAILURE_MESSAGE);
});

test("local diagnostics retain only allowlisted error categories, never arbitrary exception details", () => {
  const sensitive = "synthetic-secret /private/operator/config https://provider.invalid/?token=synthetic";
  const coded = Object.assign(new Error(sensitive), { code: "EACCES", cause: new Error(sensitive) });
  coded.name = sensitive;
  const inputs: unknown[] = [
    coded, new TypeError(sensitive), new RangeError(sensitive), new SyntaxError(sensitive),
    Object.assign(new Error(sensitive), { code: sensitive }), sensitive, null, undefined,
    { message: sensitive, stack: sensitive, name: sensitive, code: sensitive },
  ];
  const expected = [
    { kind: "Error", code: "EACCES" }, { kind: "TypeError" }, { kind: "RangeError" },
    { kind: "SyntaxError" }, { kind: "Error" }, { kind: "unknown" }, { kind: "unknown" },
    { kind: "unknown" }, { kind: "unknown" },
  ];
  for (const [index, error] of inputs.entries()) {
    const diagnostic = runtimeUpgradeFailureDiagnostic(error);
    expect(diagnostic).toEqual(expected[index]);
    expect(JSON.stringify(diagnostic)).not.toContain(sensitive);
    const failed = failRuntimeUpgrade(startRuntimeUpgrade(["opencode"], "operation", 1), 2);
    expect(JSON.stringify(failed)).not.toContain(sensitive);
    expect(failed.error).toBe(RUNTIME_UPGRADE_FAILURE_MESSAGE);
  }
});

test("diagnostics do not invoke error accessors or stringify hooks and tolerate hostile objects", () => {
  let invoked = false;
  const error = {
    get code() { invoked = true; throw new Error("must not inspect"); },
    get message() { invoked = true; throw new Error("must not inspect"); },
    toString() { invoked = true; throw new Error("must not stringify"); },
  };
  expect(runtimeUpgradeFailureDiagnostic(error)).toEqual({ kind: "unknown" });
  expect(invoked).toBe(false);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  expect(runtimeUpgradeFailureDiagnostic(revoked.proxy)).toEqual({ kind: "unknown" });
});

test("the CLI uses safe failure state and resets it before the accepted HTTP response", async () => {
  const source = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const performStart = source.indexOf("const performRuntimeUpgrade = async");
  const performEnd = source.indexOf("const shutdown = async", performStart);
  expect(performStart).toBeGreaterThan(0);
  expect(performEnd).toBeGreaterThan(performStart);
  const perform = source.slice(performStart, performEnd);
  const failure = perform.slice(perform.indexOf("} catch (error) {"));
  expect(failure).toContain("failRuntimeUpgrade(runtimeUpgradeState, Date.now())");
  expect(failure).toContain("runtimeUpgradeFailureDiagnostic(error)");
  expect(failure).not.toContain("error.message");
  expect(failure).not.toContain("String(error)");
  expect(failure).not.toContain("error.stack");
  expect(failure).toContain("operationId: runtimeUpgradeState.operationId");
  expect(perform).toContain('phase = "resolve-opencode"');
  expect(perform).toContain('phase = "restart-openwork-server"');

  const routeStart = source.indexOf('if (method === "POST" && url.pathname === "/runtime/upgrade")');
  const routeEnd = source.indexOf("void performRuntimeUpgrade(services)", routeStart);
  expect(routeStart).toBeGreaterThan(0);
  expect(routeEnd).toBeGreaterThan(routeStart);
  const route = source.slice(routeStart, routeEnd);
  const reset = route.indexOf("startRuntimeUpgrade(services, randomUUID(), Date.now())");
  const accepted = route.indexOf("res.statusCode = 202");
  expect(reset).toBeGreaterThan(0);
  expect(accepted).toBeGreaterThan(reset);
  expect(route.slice(accepted)).toContain("upgrade: { ...runtimeUpgradeState }");
  expect(route.slice(accepted)).not.toContain("error:");
});
