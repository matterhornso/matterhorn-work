import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  createPublicAuthClient,
  DenApiError,
} from "../src/app/lib/public-auth-client";

const originalFetch = globalThis.fetch;
const config = {
  baseUrl: "https://matterhorn.example",
  apiBaseUrl: "https://matterhorn.example/api/den",
  requireSignin: true,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("public auth client", () => {
  test("uses the small cookie-backed auth surface and preserves verification state", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://matterhorn.example/api/auth/sign-up/email");
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        email: "person@example.com",
        legalAccepted: true,
        turnstileToken: "turnstile-token",
      });
      return new Response(JSON.stringify({
        verificationRequired: true,
        email: "person@example.com",
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(createPublicAuthClient(config).signUpEmail(
      " person@example.com ",
      "a sufficiently long password",
      true,
      "turnstile-token",
    )).resolves.toEqual({
      verificationRequired: true,
      email: "person@example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns a typed safe error without importing the full workspace client", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      code: "email_unverified",
      message: "Verify your email to continue.",
    }), { status: 403, headers: { "Content-Type": "application/json" } })) as typeof fetch;

    await expect(createPublicAuthClient(config).signInEmail(
      "person@example.com",
      "password",
    )).rejects.toEqual(expect.objectContaining<Partial<DenApiError>>({
      name: "DenApiError",
      status: 403,
      code: "email_unverified",
      message: "Verify your email to continue.",
    }));
  });
});
