import { afterEach, describe, expect, test } from "bun:test";

import {
  checkPublicCloudSession,
  type PublicCloudConfig,
} from "../src/app/lib/public-cloud-config";

const config: PublicCloudConfig = {
  baseUrl: "https://app.matterhorn.test",
  apiBaseUrl: "https://api.matterhorn.test",
  requireSignin: true,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("public Cloud session bootstrap", () => {
  test("accepts only a valid cookie-backed user response", async () => {
    let request: { input: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input, init) => {
      request = { input: String(input), init };
      return new Response(
        JSON.stringify({
          user: {
            id: "usr_public_beta",
            email: "beta@example.test",
            name: "Beta User",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    await expect(checkPublicCloudSession(config)).resolves.toBe(true);
    expect(request?.input).toBe("https://api.matterhorn.test/v1/me");
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.headers).toEqual({ Accept: "application/json" });
  });

  test("treats unauthorized sessions as signed out", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await expect(checkPublicCloudSession(config)).resolves.toBe(false);
  });

  test("rejects malformed success responses", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ user: { id: 42, email: null } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await expect(checkPublicCloudSession(config)).resolves.toBe(false);
  });

  test("surfaces non-authentication server failures to the generic UI handler", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await expect(checkPublicCloudSession(config)).rejects.toThrow(
      "Matterhorn Cloud session check failed (503)",
    );
  });
});
