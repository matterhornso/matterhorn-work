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
      expect((error as Error).message).toBe("Matterhorn Work engine returned an unreadable response.");
      expect((error as Error).message).not.toContain("privateKey");
    }
  });
});
