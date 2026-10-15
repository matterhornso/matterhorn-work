import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assertPromptActive, prepareActivePrompt } from "../src/react-app/shell/prompt-cancellation";
import { runAssistantResponseRetry } from "../src/react-app/domains/session/surface/response-actions";
import { MatterhornServerError } from "../src/app/lib/matterhorn-server";

test("Stop during delayed privacy preflight prevents late dispatch and permits a fresh retry", async () => {
  const preflight = Promise.withResolvers<string>();
  const cancellation = new AbortController();
  let dispatches = 0;
  const send = async (signal: AbortSignal, prepare: () => Promise<string>) => {
    await prepareActivePrompt(signal, prepare);
    assertPromptActive(signal);
    dispatches += 1;
  };
  const pending = send(cancellation.signal, () => preflight.promise);
  const stopped = pending.catch((error: unknown) => error);
  await Promise.resolve();
  cancellation.abort();
  expect(await stopped).toMatchObject({ message: expect.stringContaining('"reason":"cancelled"') });
  expect(dispatches).toBe(0);
  preflight.resolve("allow");
  await Promise.resolve();
  await Promise.resolve();
  expect(dispatches).toBe(0);
  await send(new AbortController().signal, async () => "allow");
  expect(dispatches).toBe(1);
});

test("already cancelled preparation never starts work", () => {
  const cancellation = new AbortController();
  cancellation.abort();
  let called = false;
  expect(() => prepareActivePrompt(cancellation.signal, async () => { called = true; })).toThrow('"reason":"cancelled"');
  expect(called).toBe(false);
});

test("Stop before the preparation microtask never starts it", async () => {
  const cancellation = new AbortController();
  let called = false;
  const pending = prepareActivePrompt(cancellation.signal, async () => { called = true; });
  const stopped = pending.catch((error: unknown) => error);
  cancellation.abort();
  expect(await stopped).toMatchObject({ message: expect.stringContaining('"reason":"cancelled"') });
  expect(called).toBe(false);
});

test("preparation failures remain real failures and completed work remains usable", async () => {
  const cancellation = new AbortController();
  const failure = new Error("Provider unavailable");
  await expect(prepareActivePrompt(cancellation.signal, async () => { throw failure; })).rejects.toBe(failure);
  expect(await prepareActivePrompt(cancellation.signal, async () => "ready")).toBe("ready");
  expect(await prepareActivePrompt(undefined, async () => "legacy caller")).toBe("legacy caller");
  cancellation.abort();
});

test("chat, continuation and retry pass Stop cancellation to the route preflight", () => {
  const surface = readFileSync(new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/react-app/shell/session-route.tsx", import.meta.url), "utf8");
  expect(surface.match(/props\.onSendDraft\(prepared, cancellation\.signal\)/g)).toHaveLength(3);
  expect(surface).toContain("promptCancellationRef.current?.sessionId === props.sessionId");
  expect(surface).toContain("promptCancellationRef.current.controller.abort()");
  expect(route).toContain('prepareActivePrompt(signal, () => requestDiagnostics.observe("preflight"');
  expect(route).toContain("prepareActivePrompt(signal, () => Promise.all([");
  expect(route).toContain("assertPromptActive(signal)");
  expect(route).toContain('requireCurrentAccount();\n        recordInspectorEvent("session.prompt.dispatch_accepted"');
  expect(route).not.toContain('requireActiveSubmission();\n        recordInspectorEvent("session.prompt.dispatch_accepted"');
});

test("Stop after dispatch starts does not restore a retry whose replacement was accepted", async () => {
  const cancellation = new AbortController();
  const started = Promise.withResolvers<void>();
  const accepted = Promise.withResolvers<void>();
  let restored = 0;
  const retry = runAssistantResponseRetry({
    prepare: async () => "public prompt",
    abort: async () => {},
    revert: async () => {},
    dispatch: async () => {
      await prepareActivePrompt(cancellation.signal, async () => "allow");
      assertPromptActive(cancellation.signal);
      started.resolve();
      await accepted.promise;
      // Acknowledgement is authoritative; Stop cannot turn it into an unsent request.
    },
    restore: async () => { restored += 1; },
  });
  await started.promise;
  cancellation.abort();
  accepted.resolve();
  await retry;
  expect(restored).toBe(0);
});

test.each([
  new Error(JSON.stringify({ code: "message_outcome_unknown", message: "Check chat history before retrying." })),
  new MatterhornServerError(409, "message_outcome_unknown", "Check chat history before retrying."),
])("an unknown replacement outcome preserves history for reconciliation instead of restoring: %s", async (failure) => {
  let restored = 0;
  await expect(runAssistantResponseRetry({
    prepare: async () => "public prompt",
    abort: async () => {},
    revert: async () => {},
    dispatch: async () => { throw failure; },
    restore: async () => { restored += 1; },
  })).rejects.toBe(failure);
  expect(restored).toBe(0);
});
