import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPromptRequestDiagnostics, diagnosticIdentifier } from "../src/react-app/shell/prompt-request-diagnostics";

function fixture() {
  let time = 10;
  const events: { name: string; data: Record<string, unknown> }[] = [];
  return {
    events,
    advance: (value: number) => { time += value; },
    diagnostics: createPromptRequestDiagnostics({
      attemptId: "attempt_1", workspaceId: "ws_1", sessionId: "ses_1",
      now: () => time,
      record: (name, data) => { events.push({ name, data }); },
    }),
  };
}

describe("prompt request diagnostics", () => {
  test("preserves the response and reports only acknowledgement metadata", async () => {
    const f = fixture();
    const response = { accepted: true, runId: "run_1", sessionId: "ses_1", privacy: { consentToken: "do-not-log" }, parts: ["private text"] };
    const value = await f.diagnostics.observe("dispatch", async () => { f.advance(125); return response; });
    expect(value).toBe(response);
    expect(f.events).toEqual([
      { name: "session.request.dispatch.started", data: { attemptId: "attempt_1", workspaceId: "ws_1", sessionId: "ses_1" } },
      { name: "session.request.dispatch.completed", data: { attemptId: "attempt_1", workspaceId: "ws_1", sessionId: "ses_1", durationMs: 125, accepted: true, runId: "run_1", acceptedSessionId: "ses_1" } },
    ]);
    expect(JSON.stringify(f.events)).not.toMatch(/do-not-log|private text|consentToken/);
  });

  test.each(["allow", "blocked", "consent_required"])("records preflight decision %s without its contents", async (decision) => {
    const f = fixture();
    await f.diagnostics.observe("preflight", async () => ({ decision, reason: "secret reason", requestHash: "secret hash", memory: "secret memory" }));
    expect(f.events[1]?.data.decision).toBe(decision);
    expect(JSON.stringify(f.events)).not.toContain("secret");
  });

  test("does not copy arbitrary response fields or invalid decision/identifiers", async () => {
    const f = fixture();
    await f.diagnostics.observe("dispatch", async () => ({ accepted: true, runId: "Bearer secret", sessionId: "https://private.example", token: "private" }));
    await f.diagnostics.observe("preflight", async () => ({ decision: "private decision" }));
    expect(f.events[1]?.data.runId).toBeNull();
    expect(f.events[1]?.data.acceptedSessionId).toBeNull();
    expect(f.events[3]?.data.decision).toBe("unknown");
    expect(JSON.stringify(f.events)).not.toContain("private");
  });

  test.each([
    [401, "access_denied"], [403, "access_denied"], [429, "rate_limited"],
    [503, "server_error"], [400, "request_rejected"],
  ])("classifies HTTP %s without exposing error content", async (status, failure) => {
    const f = fixture();
    const error = Object.assign(new Error("private provider content"), { status, code: "secret-code", details: { token: "secret-token" } });
    let caught: unknown;
    try { await f.diagnostics.observe("dispatch", async () => { f.advance(30); throw error; }); } catch (value) { caught = value; }
    expect(caught).toBe(error);
    expect(f.events[1]?.data).toMatchObject({ failure, status, durationMs: 30 });
    expect(JSON.stringify(f.events)).not.toMatch(/private|secret|stack|details/);
  });

  test("separates timeout, cancellation and unknown errors without retries", async () => {
    for (const [error, failure] of [
      [new Error("Request timed out."), "timeout"],
      [Object.assign(new Error("sensitive"), { name: "AbortError" }), "aborted"],
      ["sensitive unknown rejection", "request_failed"],
    ]) {
      const f = fixture(); let calls = 0;
      try { await f.diagnostics.observe("preflight", async () => { calls++; throw error; }); } catch { /* expected */ }
      expect(calls).toBe(1);
      expect(f.events[1]?.data.failure).toBe(failure);
      expect(JSON.stringify(f.events)).not.toContain("sensitive");
    }
  });

  test("a broken event recorder cannot suppress or repeat the request", async () => {
    let calls = 0;
    const d = createPromptRequestDiagnostics({ attemptId: "a", workspaceId: "w", sessionId: "s", record: () => { throw new Error("inspector unavailable"); } });
    expect(await d.observe("dispatch", async () => { calls++; return 42; })).toBe(42);
    expect(calls).toBe(1);
    const error = new Error("original failure");
    await expect(d.observe("dispatch", async () => { throw error; })).rejects.toBe(error);
  });

  test("identifiers are bounded and elapsed time cannot be negative or non-finite", async () => {
    for (const value of [null, 4, "", "x".repeat(129), "/path", "a\nb", "user@example.com"]) expect(diagnosticIdentifier(value)).toBeNull();
    expect(diagnosticIdentifier("run_abc-123")).toBe("run_abc-123");
    for (const elapsed of [-100, NaN, Infinity]) {
      const f = fixture(); await f.diagnostics.observe("dispatch", async () => { f.advance(elapsed); return {}; });
      expect(f.events[1]?.data.durationMs).toBe(0);
    }
  });

  test("route observes both preflight and hosted dispatch with one attempt ID", () => {
    const source = readFileSync(new URL("../src/react-app/shell/session-route.tsx", import.meta.url), "utf8");
    expect(source.includes('requestDiagnostics.observe("preflight"')).toBe(true);
    expect(source.includes('requestDiagnostics.observe("dispatch"')).toBe(true);
    expect(source.includes("attemptId: timing.attemptId")).toBe(true);
    expect(source.includes("workspaceId: timing.workspaceId")).toBe(true);
  });
});
