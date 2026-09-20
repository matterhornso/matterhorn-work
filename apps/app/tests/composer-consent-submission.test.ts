import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validatePrivacyConsentToken } from "../src/app/lib/agent-privacy-consent";
import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("composer consent request boundary", () => {
  test("ordinary sends have no token; an explicit token is preserved exactly", () => {
    expect(validatePrivacyConsentToken(undefined)).toBeUndefined();
    expect(validatePrivacyConsentToken("fixture-consent-token")).toBe("fixture-consent-token");
  });

  test("malformed tokens fail without serializing or echoing the value", () => {
    const cyclic = { target: {} };
    cyclic.target = cyclic;
    const values = [cyclic, null, false, 1, [], {}, "", "   "];
    for (const value of values) {
      expect(() => validatePrivacyConsentToken(value)).toThrow(
        "Privacy approval is invalid. Review privacy details and try again.",
      );
    }
  });

  test("direct message API clients reject invalid consent before fetch", async () => {
    let calls = 0;
    globalThis.fetch = Object.assign(async () => {
      calls += 1;
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }, { preconnect: originalFetch.preconnect });
    const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });
    const cyclic = { target: {} };
    cyclic.target = cyclic;
    for (const privacyConsentToken of [cyclic, null, 123, ""]) {
      const request = { parts: [{ type: "text", text: "Public test" }], model: { providerId: "fixture", modelId: "fixture" } };
      // Simulate an untyped caller without type assertions in production code.
      Object.assign(request, { privacyConsentToken });
      await expect(client.sendAgentMessage("ws_fixture", "ses_fixture", request)).rejects.toThrow("Privacy approval is invalid.");
    }
    expect(calls).toBe(0);
  });

  test("ordinary, consented and retried sends preserve the request contract", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = Object.assign(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }, { preconnect: originalFetch.preconnect });
    const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });
    const request = { parts: [{ type: "text", text: "Public test" }], model: { providerId: "fixture", modelId: "fixture" } };
    await client.sendAgentMessage("ws_fixture", "ses_fixture", request);
    await client.sendAgentMessage("ws_fixture", "ses_fixture", { ...request, privacyConsentToken: "fixture-consent-token" });
    await client.sendAgentMessage("ws_fixture", "ses_fixture", request);
    expect(bodies).toEqual([
      { ...request, messageID: expect.any(String) },
      { ...request, privacyConsentToken: "fixture-consent-token", messageID: expect.any(String) },
      { ...request, messageID: expect.any(String) },
    ]);
  });

  test("surface wires ordinary/retry and confirmed consent to distinct entry points", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url), "utf8");
    expect(source).toContain("const { send: handleSend, sendWithConsent } = useComposerSubmission(sendDraft);");
    expect(source).toContain("await sendWithConsent(consent.consentToken);");
    expect(source).toContain("onSend={handleSend}");
    expect(source).toContain("await handleSend();");
  });
});
