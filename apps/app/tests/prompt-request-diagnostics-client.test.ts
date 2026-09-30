import { describe, expect, test } from "bun:test";
import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";
import { createPromptRequestDiagnostics } from "../src/react-app/shell/prompt-request-diagnostics";

describe("prompt diagnostics over the HTTP client", () => {
  test("renewing or removing Jev after a lost acknowledgement preserves request identity", async () => {
    const ids: string[] = [];
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      ids.push((await request.json()).messageID);
      return ids.length < 3 ? Response.json({ message: "Synthetic lost acknowledgement" }, { status: 503 })
        : Response.json({ ok: true, accepted: true, sessionId: "ses_jev_retry" }, { status: 202 });
    } });
    try {
      const client = createMatterhornServerClient({ baseUrl: server.url.origin });
      const input = { parts: [{ type: "text", text: "Synthetic public message" }], model: { providerId: "fixture", modelId: "fixture" } };
      await expect(client.sendAgentMessage("ws_jev", "ses_jev_retry", { ...input, jevReceipt: "old-fixture" })).rejects.toThrow();
      await expect(client.sendAgentMessage("ws_jev", "ses_jev_retry", { ...input, jevReceipt: "renewed-fixture" })).rejects.toThrow();
      await client.sendAgentMessage("ws_jev", "ses_jev_retry", input);
      expect(new Set(ids).size).toBe(1);
      await client.sendAgentMessage("ws_jev", "ses_jev_retry", input);
      expect(ids[3]).not.toBe(ids[0]);
    } finally { server.stop(true); }
  });

  test("correlates preflight and accepted dispatch without exposing request or response content", async () => {
    const requests: string[] = [];
    const events: { name: string; data: Record<string, unknown> }[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        requests.push(new URL(request.url).pathname);
        const body = await request.json();
        expect(body.parts).toEqual([{ type: "text", text: "private test prompt" }]);
        if (request.url.endsWith("/preflight")) {
          return Response.json({ decision: "allow", reason: "private policy reason" });
        }
        expect(body.privacyConsentToken).toBe("private-consent-fixture");
        return Response.json({ ok: true, accepted: true, sessionId: "ses_test", runId: "run_test", privacy: { requestHash: "private-hash", consentUsed: true } }, { status: 202 });
      },
    });
    try {
      const client = createMatterhornServerClient({ baseUrl: server.url.origin });
      const d = createPromptRequestDiagnostics({ attemptId: "attempt_test", workspaceId: "ws_test", sessionId: "ses_test", record: (name, data) => { events.push({ name, data }); } });
      const parts = [{ type: "text", text: "private test prompt" }];
      const model = { providerId: "fixture", modelId: "fixture" };
      const preflight = await d.observe("preflight", () => client.preflightAgentMessage("ws_test", "ses_test", { parts, model }));
      expect(preflight.decision).toBe("allow");
      const result = await d.observe("dispatch", () => client.sendAgentMessage("ws_test", "ses_test", { parts, model, privacyConsentToken: "private-consent-fixture" }));
      expect(result.runId).toBe("run_test");
      expect(requests).toHaveLength(2);
      expect(events).toHaveLength(4);
      expect(events[3]?.data).toMatchObject({ attemptId: "attempt_test", runId: "run_test", accepted: true });
      expect(JSON.stringify(events)).not.toContain("private");
    } finally { server.stop(true); }
  });

  test("reports a rejected HTTP dispatch once without logging the server's error details", async () => {
    let calls = 0;
    const events: Record<string, unknown>[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch() {
        calls++;
        return Response.json({ code: "private-provider-code", message: "private provider failure", details: { token: "private-token" } }, { status: 503 });
      },
    });
    try {
      const client = createMatterhornServerClient({ baseUrl: server.url.origin });
      const d = createPromptRequestDiagnostics({ attemptId: "attempt_test", workspaceId: "ws_test", sessionId: "ses_test", record: (_name, data) => { events.push(data); } });
      await expect(d.observe("dispatch", () => client.sendAgentMessage("ws_test", "ses_test", { parts: [], model: { providerId: "fixture", modelId: "fixture" } }))).rejects.toThrow();
      expect(calls).toBe(1);
      expect(events[1]).toMatchObject({ failure: "server_error", status: 503 });
      expect(JSON.stringify(events)).not.toContain("private");
    } finally { server.stop(true); }
  });
});
