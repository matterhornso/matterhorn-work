import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createHostedMcpAccess,
  readHostedMcpAccess,
  revokeHostedMcpAccess,
} from "../src/react-app/domains/settings/pages/hosted-mcp-access-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("hosted MCP access client", () => {
  test("lists account-scoped credential summaries with first-party cookies", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({
      mode: "invite",
      eligible: true,
      maxExpiresInDays: 30,
      credentials: [],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    expect(await readHostedMcpAccess()).toEqual({
      mode: "invite",
      eligible: true,
      maxExpiresInDays: 30,
      credentials: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/account/mcp-access",
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
  });

  test("returns a newly issued secret once without writing browser storage", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({
      credential: {
        id: "mcp_123",
        label: "Codex",
        createdAt: 1,
        expiresAt: 2,
        lastUsedAt: null,
        accessToken: "mhmcp_once",
      },
    }), { status: 201 }));
    globalThis.fetch = fetchMock as typeof fetch;

    expect(await createHostedMcpAccess({ label: "Codex", expiresInDays: 30 }))
      .toEqual(expect.objectContaining({ id: "mcp_123", accessToken: "mhmcp_once" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/account/mcp-access",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ label: "Codex", expiresInDays: 30 }),
      }),
    );
  });

  test("fails closed on malformed rolling-deploy responses", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({
      mode: "invite",
      eligible: true,
      maxExpiresInDays: 30,
      credentials: [{ id: "mcp_123", label: "Codex" }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    expect(readHostedMcpAccess())
      .rejects.toThrow("Matterhorn returned invalid external-access state.");
  });

  test("revokes only the selected credential and surfaces safe server errors", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/mcp_missing")) {
        return new Response(JSON.stringify({ message: "Access key not found." }), { status: 404 });
      }
      return new Response(JSON.stringify({ ok: true, revoked: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await revokeHostedMcpAccess("mcp_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/account/mcp-access/mcp_123",
      { method: "DELETE", credentials: "include", headers: { Accept: "application/json" } },
    );
    expect(revokeHostedMcpAccess("mcp_missing"))
      .rejects.toThrow("Access key not found.");
  });
});
