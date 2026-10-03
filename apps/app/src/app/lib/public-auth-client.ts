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

function parsePublicAuthConfig(value: unknown): DenPublicAuthConfig {
  if (
    !isRecord(value) ||
    typeof value.signupsAvailable !== "boolean" ||
    (value.signupStatus !== "open" && value.signupStatus !== "paused" && value.signupStatus !== "setup_required") ||
    value.signupsAvailable !== (value.signupStatus === "open") ||
    typeof value.emailVerificationRequired !== "boolean" ||
    typeof value.passwordResetAvailable !== "boolean" ||
    typeof value.legalAcceptanceRequired !== "boolean" ||
    typeof value.minimumPasswordLength !== "number" ||
    !Number.isSafeInteger(value.minimumPasswordLength) ||
    value.minimumPasswordLength < 1 ||
    (value.turnstileSiteKey !== null && (typeof value.turnstileSiteKey !== "string" || !value.turnstileSiteKey.trim()))
  ) {
    throw new Error("Account configuration is temporarily unavailable.");
  }
  return {
    signupsAvailable: value.signupsAvailable,
    signupStatus: value.signupStatus,
    emailVerificationRequired: value.emailVerificationRequired,
    passwordResetAvailable: value.passwordResetAvailable,
    legalAcceptanceRequired: value.legalAcceptanceRequired,
    minimumPasswordLength: value.minimumPasswordLength,
    turnstileSiteKey: value.turnstileSiteKey,
  };
}

function requireAuthAcknowledgement(value: unknown): { ok: true } {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error("Account service returned an invalid response.");
  }
  return { ok: true };
}

async function requestPublicAuth(
  config: PublicCloudConfig,
  path: string,
  input: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<unknown> {
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
    return payload;
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
    getPublicAuthConfig: async () => parsePublicAuthConfig(await requestPublicAuth(config, "/api/auth/config")),
    signInEmail: (email: string, password: string) => requestPublicAuth(config, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: email.trim(), password },
    }),
    async signUpEmail(
      email: string,
      password: string,
      legalAccepted = false,
      turnstileToken?: string,
    ): Promise<PublicAuthSignUpResult> {
      const payload = await requestPublicAuth(config, "/api/auth/sign-up/email", {
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
    verifyEmail: (email: string, code: string) => requestPublicAuth(config, "/api/auth/verify-email", {
      method: "POST",
      body: { email: email.trim(), code: code.trim() },
    }),
    resendVerification: (email: string) => requestPublicAuth(config, "/api/auth/resend-verification", {
      method: "POST",
      body: { email: email.trim() },
    }).then(requireAuthAcknowledgement),
    requestPasswordReset: (email: string) => requestPublicAuth(config, "/api/auth/password-reset/request", {
      method: "POST",
      body: { email: email.trim() },
    }).then(requireAuthAcknowledgement),
    confirmPasswordReset: (token: string, newPassword: string) => requestPublicAuth(config, "/api/auth/password-reset/confirm", {
      method: "POST",
      body: { token: token.trim(), newPassword },
    }).then(requireAuthAcknowledgement),
  };
}
