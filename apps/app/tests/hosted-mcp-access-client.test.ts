import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createHostedMcpAccess,
  readHostedMcpAccess,
  revokeHostedMcpAccess,
} from "../src/react-app/domains/settings/pages/hosted-mcp-access-client";

const originalFetch = globalThis.fetch;
const CREDENTIAL_ID = `mcp_${"a".repeat(32)}`;
const ACCESS_TOKEN = `mhmcp_${"A".repeat(43)}`;

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
        id: CREDENTIAL_ID,
        label: "Codex",
        createdAt: 1,
        expiresAt: 2,
        lastUsedAt: null,
        accessToken: ACCESS_TOKEN,
      },
    }), { status: 201 }));
    globalThis.fetch = fetchMock as typeof fetch;

    expect(await createHostedMcpAccess({ label: "Codex", expiresInDays: 30 }))
      .toEqual(expect.objectContaining({ id: CREDENTIAL_ID, accessToken: ACCESS_TOKEN }));
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

  test("rejects malformed or over-broad access material", async () => {
    const malformedToken = mock(async () => new Response(JSON.stringify({
      credential: {
        id: CREDENTIAL_ID,
        label: "Codex",
        createdAt: 1,
        expiresAt: 2,
        lastUsedAt: null,
        accessToken: `${ACCESS_TOKEN}extra`,
      },
    }), { status: 201 }));
    globalThis.fetch = malformedToken as typeof fetch;
    expect(createHostedMcpAccess({ label: "Codex", expiresInDays: 30 }))
      .rejects.toThrow("Matterhorn did not return the new access key.");

    const extendedLifetime = mock(async () => new Response(JSON.stringify({
      mode: "invite",
      eligible: true,
      maxExpiresInDays: 30,
      credentials: [{
        id: CREDENTIAL_ID,
        label: "Codex",
        createdAt: 1,
        expiresAt: 31 * 24 * 60 * 60 * 1_000,
        lastUsedAt: null,
      }],
    }), { status: 200 }));
    globalThis.fetch = extendedLifetime as typeof fetch;
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

    await revokeHostedMcpAccess(CREDENTIAL_ID);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/auth/account/mcp-access/${CREDENTIAL_ID}`,
      { method: "DELETE", credentials: "include", headers: { Accept: "application/json" } },
    );
    expect(revokeHostedMcpAccess("mcp_missing"))
      .rejects.toThrow("Access key not found.");
  });
});
