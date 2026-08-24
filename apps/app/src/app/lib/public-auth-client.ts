import { DenApiError } from "./den-api-error";
import type { PublicCloudConfig } from "./public-cloud-config";

export { DenApiError } from "./den-api-error";

const PUBLIC_AUTH_TIMEOUT_MS = 12_000;

export type DenPublicAuthConfig = {
  signupsAvailable: boolean;
  signupStatus: "open" | "paused" | "setup_required";
  emailVerificationRequired: boolean;
  passwordResetAvailable: boolean;
  legalAcceptanceRequired: boolean;
  minimumPasswordLength: number;
  turnstileSiteKey: string | null;
};

export type PublicAuthSignUpResult = {
  verificationRequired: boolean;
  email: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  for (const key of ["message", "error_description", "error"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

async function requestPublicAuth<T>(
  config: PublicCloudConfig,
  path: string,
  input: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), PUBLIC_AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: input.method ?? "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const code = isRecord(payload)
        ? typeof payload.code === "string"
          ? payload.code
          : typeof payload.error === "string"
            ? payload.error
            : "request_failed"
        : "request_failed";
      throw new DenApiError(
        response.status,
        code,
        errorMessage(payload, `Request failed with ${response.status}.`),
        isRecord(payload) ? payload.details : undefined,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function createPublicAuthClient(config: PublicCloudConfig) {
  return {
    getPublicAuthConfig: () => requestPublicAuth<DenPublicAuthConfig>(config, "/api/auth/config"),
    signInEmail: (email: string, password: string) => requestPublicAuth<unknown>(config, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: email.trim(), password },
    }),
    async signUpEmail(
      email: string,
      password: string,
      legalAccepted = false,
      turnstileToken?: string,
    ): Promise<PublicAuthSignUpResult> {
      const payload = await requestPublicAuth<unknown>(config, "/api/auth/sign-up/email", {
        method: "POST",
        body: {
          name: "Matterhorn Desks User",
          email: email.trim(),
          password,
          legalAccepted,
          turnstileToken,
        },
      });
      return {
        verificationRequired: isRecord(payload) && payload.verificationRequired === true,
        email: isRecord(payload) && typeof payload.email === "string" ? payload.email : null,
      };
    },
    verifyEmail: (email: string, code: string) => requestPublicAuth<unknown>(config, "/api/auth/verify-email", {
      method: "POST",
      body: { email: email.trim(), code: code.trim() },
    }),
    resendVerification: (email: string) => requestPublicAuth<unknown>(config, "/api/auth/resend-verification", {
      method: "POST",
      body: { email: email.trim() },
    }),
    requestPasswordReset: (email: string) => requestPublicAuth<unknown>(config, "/api/auth/password-reset/request", {
      method: "POST",
      body: { email: email.trim() },
    }),
    confirmPasswordReset: (token: string, newPassword: string) => requestPublicAuth<unknown>(config, "/api/auth/password-reset/confirm", {
      method: "POST",
      body: { token: token.trim(), newPassword },
    }),
  };
}
