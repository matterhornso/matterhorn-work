import { afterEach, describe, expect, test } from "bun:test";

import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type CapturedRequest = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  hasHostToken: boolean;
};

function captureRequests(): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body,
      hasHostToken: headers.has("X-Matterhorn-Host-Token"),
    });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return requests;
}

describe("Agent File server client", () => {
  test("uses tenant-scoped routes and an explicit ciphertext-only backup acknowledgement", async () => {
    const requests = captureRequests();
    const client = createMatterhornServerClient({
      baseUrl: "https://control.example",
      token: "account-token",
      hostToken: "operator-token",
    });

    await client.listAgentFiles("workspace one");
    await client.createAgentFile("workspace one", {
      name: "risk notes.md",
      mimeType: "text/markdown",
      coworkerIds: ["coworker_1"],
      expiresAt: "2026-10-02T00:00:00.000Z",
      contentBase64: "cmlzayBub3Rlcw==",
    });
    await client.publishAgentFile("workspace one", "file one", 3);
    await client.verifyAgentFile("workspace one", "file one");
    await client.recoverAgentFile("workspace one", "file one", 4);
    await client.deleteAgentFile("workspace one", "file one", 4);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://control.example/workspace/workspace%20one/agent-files",
      "POST https://control.example/workspace/workspace%20one/agent-files",
      "POST https://control.example/workspace/workspace%20one/agent-files/file%20one/publish",
      "POST https://control.example/workspace/workspace%20one/agent-files/file%20one/verify",
      "POST https://control.example/workspace/workspace%20one/agent-files/file%20one/recover",
      "DELETE https://control.example/workspace/workspace%20one/agent-files/file%20one",
    ]);
    expect(requests[1]?.body).toEqual({
      name: "risk notes.md",
      mimeType: "text/markdown",
      coworkerIds: ["coworker_1"],
      expiresAt: "2026-10-02T00:00:00.000Z",
      contentBase64: "cmlzayBub3Rlcw==",
    });
    expect(requests[2]?.body).toEqual({
      expectedRevision: 3,
      network: "testnet",
      acknowledgePublicCiphertext: true,
    });
    expect(requests[3]?.body).toBeNull();
    expect(requests[4]?.body).toEqual({ expectedRevision: 4 });
    expect(requests[5]?.body).toEqual({ expectedRevision: 4 });
    expect(requests.every((request) => !request.hasHostToken)).toBe(true);
  });

  test("creates only the server-owned starter coworker roles exposed by the UI", async () => {
    const requests = captureRequests();
    const client = createMatterhornServerClient({ baseUrl: "https://control.example" });

    await client.createCoworkerFromTemplate("workspace_1", { templateId: "market_analyst" });
    await client.createCoworkerFromTemplate("workspace_1", { templateId: "risk_monitor" });

    expect(requests.map((request) => request.body)).toEqual([
      { templateId: "market_analyst" },
      { templateId: "risk_monitor" },
    ]);
  });

  test("keeps coworker lifecycle, alerts, checks, and wallet review account-scoped", async () => {
    const requests = captureRequests();
    const client = createMatterhornServerClient({
      baseUrl: "https://control.example",
      token: "account-token",
      hostToken: "operator-token",
    });

    await client.listCoworkers("workspace one");
    await client.getCoworkerState("workspace one", "coworker one");
    await client.listCoworkerWatches("workspace one", "coworker one");
    await client.transitionCoworkerWatch("workspace one", "coworker one", "watch one", { state: "paused", expectedRevision: 2 });
    await client.listCoworkerInbox("workspace one", "coworker one");
    await client.transitionCoworkerInboxItem("workspace one", "coworker one", "item one", { state: "read", expectedState: "unread" });
    await client.listCoworkerWalletIntents("workspace one", "coworker one");
    await client.cancelCoworkerWalletIntent("workspace one", "coworker one", "intent one", 5);
    await client.transitionCoworker("workspace one", "coworker one", { state: "paused", expectedRevision: 3 });
    await client.deleteCoworker("workspace one", "coworker one", 4);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://control.example/workspace/workspace%20one/coworkers",
      "GET https://control.example/workspace/workspace%20one/coworkers/coworker%20one/state",
      "GET https://control.example/workspace/workspace%20one/coworkers/coworker%20one/watches",
      "PATCH https://control.example/workspace/workspace%20one/coworkers/coworker%20one/watches/watch%20one",
      "GET https://control.example/workspace/workspace%20one/coworkers/coworker%20one/inbox?limit=50",
      "PATCH https://control.example/workspace/workspace%20one/coworkers/coworker%20one/inbox/item%20one",
      "GET https://control.example/workspace/workspace%20one/coworkers/coworker%20one/wallet-intents",
      "POST https://control.example/workspace/workspace%20one/coworkers/coworker%20one/wallet-intents/intent%20one/cancel",
      "PATCH https://control.example/workspace/workspace%20one/coworkers/coworker%20one",
      "DELETE https://control.example/workspace/workspace%20one/coworkers/coworker%20one",
    ]);
    expect(requests[7]?.body).toEqual({ expectedRevision: 5 });
    expect(requests.every((request) => !request.hasHostToken)).toBe(true);
  });
});
