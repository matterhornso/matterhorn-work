import { afterEach, describe, expect, test } from "bun:test";

import {
  createMatterhornServerClient,
  MatterhornServerError,
} from "../src/app/lib/matterhorn-server";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response.clone()) as typeof fetch;
}

describe("Matterhorn server client error contract", () => {
  test("reads live market execution readiness from the guarded backend route", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return new Response(JSON.stringify({
        success: true,
        report: {
          version: "matterhorn.market.execution-readiness.v1",
          checkedAt: "2026-07-21T00:00:00.000Z",
          readyForLiveSubmission: true,
          status: "ready",
          venues: [{ venue: "hyperliquid", canSubmit: true }],
          controls: [],
          nextActions: [],
          safety: {
            nonCustodial: true,
            liveSubmissionEnabled: true,
            canSubmit: true,
            signsOrSubmits: true,
            acceptsSecrets: false,
            acceptsRawSignatures: false,
            acceptsSignedPayloads: false,
          },
        },
        cards: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });

    const response = await client.marketExecutionReadiness();

    expect(requestedUrl).toBe("http://127.0.0.1:4096/api/crypto/market-execution-readiness");
    expect(response.report.venues[0]?.venue).toBe("hyperliquid");
    expect(response.report.venues[0]?.canSubmit).toBe(true);
  });

  test("turns proxy HTML errors into typed sanitized server errors", async () => {
    mockFetch(new Response("<html>bad gateway token=secret-token</html>", {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "text/html" },
    }));
    const client = createMatterhornServerClient({
      baseUrl: "http://127.0.0.1:4096",
      token: "secret-token",
    });

    try {
      await client.health();
      throw new Error("expected health to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MatterhornServerError);
      expect((error as MatterhornServerError).status).toBe(502);
      expect((error as MatterhornServerError).code).toBe("invalid_response");
      expect((error as Error).message).toBe("Workspace server returned an unreadable response.");
      expect((error as Error).message).not.toContain("secret-token");
      expect((error as Error).message).not.toContain("<html>");
    }
  });

  test("turns malformed 2xx responses into typed sanitized engine errors", async () => {
    mockFetch(new Response("ok but not json privateKey=abc", {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/plain" },
    }));
    const client = createMatterhornServerClient({ baseUrl: "http://127.0.0.1:4096" });

    try {
      await client.health();
      throw new Error("expected health to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MatterhornServerError);
      expect((error as MatterhornServerError).status).toBe(200);
      expect((error as MatterhornServerError).code).toBe("invalid_response");
      expect((error as Error).message).toBe("Matterhorn Desks engine returned an unreadable response.");
      expect((error as Error).message).not.toContain("privateKey");
    }
  });
});
