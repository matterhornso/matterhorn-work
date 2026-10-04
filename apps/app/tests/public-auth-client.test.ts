import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
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

const authConfig = {
  signupsAvailable: true,
  signupStatus: "open",
  emailVerificationRequired: true,
  passwordResetAvailable: true,
  legalAcceptanceRequired: true,
  minimumPasswordLength: 12,
  turnstileSiteKey: "public-site-key",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("public auth client", () => {
  const mutations = [
    { name: "sign-in", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.signInEmail("fixture@example.invalid", "synthetic-only", signal) },
    { name: "sign-up", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.signUpEmail("fixture@example.invalid", "synthetic-only", true, "synthetic-turnstile", signal) },
    { name: "verification", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.verifyEmail("fixture@example.invalid", "123456", signal) },
    { name: "resend", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.resendVerification("fixture@example.invalid", signal) },
    { name: "request-reset", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.requestPasswordReset("fixture@example.invalid", signal) },
    { name: "confirm-reset", run: (client: ReturnType<typeof createPublicAuthClient>, signal: AbortSignal) => client.confirmPasswordReset("synthetic-token", "synthetic-only", signal) },
  ];
  for (const mutation of mutations) {
    test(`cancels ${mutation.name} transport without treating cancellation as a timeout`, async () => {
      let transportSignal: AbortSignal | null | undefined;
      const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        transportSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          transportSignal?.addEventListener("abort", () => reject(transportSignal?.reason), { once: true });
        });
      });
      try {
        const cancellation = new AbortController();
        const request = mutation.run(createPublicAuthClient(config), cancellation.signal);
        cancellation.abort();
        await expect(request).rejects.toBeInstanceOf(DOMException);
        expect(transportSignal?.aborted).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally { fetchMock.mockRestore(); }
    });
  }

  test("cancels a pending configuration lookup without reporting a timeout", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), { once: true });
      });
    }) as typeof fetch;
    const result = createPublicAuthClient(config).getPublicAuthConfig(controller.signal);
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(DOMException);
    expect(requestSignal?.aborted).toBe(true);
  });

  test.each([
    "null",
    "",
    "{}",
    "[]",
    "<!doctype html><title>App</title>",
    JSON.stringify({ ...authConfig, signupsAvailable: "true" }),
    JSON.stringify({ ...authConfig, signupStatus: "unknown" }),
    JSON.stringify({ ...authConfig, signupsAvailable: false }),
    JSON.stringify({ ...authConfig, emailVerificationRequired: null }),
    JSON.stringify({ ...authConfig, passwordResetAvailable: undefined }),
    JSON.stringify({ ...authConfig, legalAcceptanceRequired: "false" }),
    JSON.stringify({ ...authConfig, minimumPasswordLength: 0 }),
    JSON.stringify({ ...authConfig, minimumPasswordLength: 12.5 }),
    JSON.stringify({ ...authConfig, turnstileSiteKey: {} }),
    JSON.stringify({ ...authConfig, turnstileSiteKey: " " }),
  ])("rejects malformed successful auth configuration: %s", async (body) => {
    globalThis.fetch = mock(async () => new Response(body)) as typeof fetch;
    await expect(createPublicAuthClient(config).getPublicAuthConfig()).rejects.toThrow(
      "Account configuration is temporarily unavailable.",
    );
  });

  for (const action of ["resendVerification", "requestPasswordReset", "confirmPasswordReset"] as const) {
    test.each(["null", "{}", "[]", "<!doctype html><title>App</title>", '{"ok":false}', '{"ok":"true"}'])(`${action} rejects invalid acknowledgement: %s`, async (body) => {
      globalThis.fetch = mock(async () => new Response(body)) as typeof fetch;
      const client = createPublicAuthClient(config);
      const request = action === "confirmPasswordReset"
        ? client.confirmPasswordReset("disposable-token", "new test password")
        : client[action]("person@example.com");
      await expect(request).rejects.toThrow("Account service returned an invalid response.");
    });

    test(`${action} accepts the server acknowledgement`, async () => {
      globalThis.fetch = mock(async () => Response.json({ ok: true }, { status: action === "confirmPasswordReset" ? 200 : 202 })) as typeof fetch;
      const client = createPublicAuthClient(config);
      const request = action === "confirmPasswordReset"
        ? client.confirmPasswordReset("disposable-token", "new test password")
        : client[action]("person@example.com");
      await expect(request).resolves.toEqual({ ok: true });
    });
  }

  test.each(["open", "paused", "setup_required"])("accepts valid %s configuration with additive server fields", async (signupStatus) => {
    const expected = { ...authConfig, signupStatus, signupsAvailable: signupStatus === "open", turnstileSiteKey: null };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://matterhorn.example/api/auth/config");
      expect(init).toMatchObject({ method: "GET", credentials: "include" });
      return Response.json({ ...expected, infrastructureReady: true, launchReady: true });
    }) as typeof fetch;
    await expect(createPublicAuthClient(config).getPublicAuthConfig()).resolves.toMatchObject(expected);
  });

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
