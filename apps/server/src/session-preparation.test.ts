import { expect, test } from "bun:test";
import { SessionPreparationRegistry } from "./session-preparation.js";

const scope = { workspaceId: "workspace", sessionId: "chat", subjectId: "user:first" };

test("Stop cancels only admitted preparations for the exact authenticated scope", async () => {
  const registry = new SessionPreparationRegistry(() => {});
  for (const other of [scope, { ...scope, workspaceId: "other" },
    { ...scope, sessionId: "other" }, { ...scope, subjectId: "user:other" }]) {
    const request = new Request("http://local.test");
    await registry.run(scope, request, async () => {
      registry.stop(other);
      if (other === scope) expect(() => registry.assertActive(request)).toThrow("Request stopped before model dispatch.");
      else expect(() => registry.assertActive(request)).not.toThrow();
    });
    expect(() => registry.assertActive(request)).not.toThrow();
  }
});

test("Stop invalidates overlapping preparations, but not a fresh explicit request", async () => {
  const registry = new SessionPreparationRegistry(() => {});
  const first = new Request("http://local.test/first");
  const second = new Request("http://local.test/second");
  await registry.run(scope, first, async () => registry.run(scope, second, async () => {
    registry.stop(scope);
    registry.stop(scope);
    expect(() => registry.assertActive(first)).toThrow();
    expect(() => registry.assertActive(second)).toThrow();
    const fresh = new Request("http://local.test/fresh");
    await registry.run(scope, fresh, async () => expect(() => registry.assertActive(fresh)).not.toThrow());
  }));
});

test("Disconnect blocks preparation and completion always unregisters", async () => {
  const registry = new SessionPreparationRegistry(() => {});
  const controller = new AbortController();
  const request = new Request("http://local.test", { signal: controller.signal });
  await expect(registry.run(scope, request, async () => {
    controller.abort();
    registry.assertActive(request);
  })).rejects.toMatchObject({ code: "write_denied", details: { reason: "cancelled" } });
  const failed = new Request("http://local.test/failed");
  await expect(registry.run(scope, failed, async () => { throw new Error("Preparation failed"); }))
    .rejects.toThrow("Preparation failed");
  registry.stop(scope);
  expect(() => registry.assertActive(failed)).not.toThrow();
});

test("A Stop after dispatch does not retroactively reject an accepted response", async () => {
  const registry = new SessionPreparationRegistry(() => {});
  const request = new Request("http://local.test");
  await expect(registry.run(scope, request, async () => {
    registry.assertActive(request);
    // Simulate an already dispatched transport completing after Stop.
    registry.stop(scope);
    return "accepted";
  })).resolves.toBe("accepted");
});

test("Every preparation checkpoint rechecks the admitted request's authority", async () => {
  const request = new Request("http://local.test");
  let allowed = true;
  let checks = 0;
  const registry = new SessionPreparationRegistry(candidate => {
    expect(candidate).toBe(request);
    checks += 1;
    if (!allowed) throw new Error("Access revoked");
  });
  await expect(registry.run(scope, request, async () => {
    registry.assertActive(request);
    allowed = false;
    registry.assertActive(request);
  })).rejects.toThrow("Access revoked");
  expect(checks).toBe(3);
  allowed = true;
  registry.stop(scope);
  expect(() => registry.assertActive(request)).not.toThrow();
  allowed = false;
  let prepared = false;
  await expect(registry.run(scope, request, async () => { prepared = true; })).rejects.toThrow("Access revoked");
  expect(prepared).toBe(false);
});
