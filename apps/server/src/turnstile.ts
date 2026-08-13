const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_RESPONSE_MAX_BYTES = 32 * 1024;

export const MATTERHORN_SIGNUP_TURNSTILE_ACTION = "signup";

type TurnstileEnvironment = Record<string, string | undefined>;

export type MatterhornTurnstileConfig = {
  configured: boolean;
  ready: boolean;
  siteKey: string;
  secret: string;
  hostnames: ReadonlySet<string>;
};

export type MatterhornTurnstileFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type TurnstileVerificationInput = {
  token: unknown;
  remoteIp?: string | null;
  expectedAction?: string;
  config: MatterhornTurnstileConfig;
  fetcher?: MatterhornTurnstileFetcher;
};

function normalized(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function resolveMatterhornTurnstileConfig(
  env: TurnstileEnvironment = process.env,
): MatterhornTurnstileConfig {
  const siteKey = normalized(env.MATTERHORN_TURNSTILE_SITEKEY);
  const secret = normalized(env.TURNSTILE_SECRET);
  const hostnames = new Set(
    normalized(env.TURNSTILE_HOSTNAMES)
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
  const configured = Boolean(siteKey || secret || hostnames.size);
  return {
    configured,
    ready: Boolean(siteKey && secret && hostnames.size),
    siteKey,
    secret,
    hostnames,
  };
}

function validTurnstileResult(
  value: unknown,
  expectedAction: string,
  hostnames: ReadonlySet<string>,
): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.success === true &&
    result.action === expectedAction &&
    typeof result.hostname === "string" &&
    hostnames.has(result.hostname.toLowerCase());
}

export async function verifyMatterhornTurnstile(
  input: TurnstileVerificationInput,
): Promise<boolean> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (
    !input.config.ready ||
    !token ||
    token.length > 2048
  ) {
    return false;
  }

  const body = new URLSearchParams({
    secret: input.config.secret,
    response: token,
  });
  const remoteIp = input.remoteIp?.trim();
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await (input.fetcher ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const text = await response.text();
    if (!text || text.length > TURNSTILE_RESPONSE_MAX_BYTES) return false;
    return validTurnstileResult(
      JSON.parse(text),
      input.expectedAction ?? MATTERHORN_SIGNUP_TURNSTILE_ACTION,
      input.config.hostnames,
    );
  } catch {
    return false;
  }
}
