const DEFAULT_PUBLIC_CLOUD_URL = "https://app.matterhorn.work";

function readBooleanEnv(value: unknown): boolean {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

function normalizeHttpUrl(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  try {
    const url = new URL(candidate || fallback);
    if (!/^https?:$/.test(url.protocol)) return fallback;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export type PublicCloudConfig = {
  baseUrl: string;
  apiBaseUrl: string;
  requireSignin: boolean;
};

/**
 * Build-time public Cloud configuration without importing the desktop Den
 * client. The release readiness gate requires both URLs in production.
 */
export function readPublicCloudConfig(): PublicCloudConfig {
  const baseUrl = normalizeHttpUrl(
    import.meta.env.VITE_MATTERHORN_CLOUD_URL,
    DEFAULT_PUBLIC_CLOUD_URL,
  );
  const apiBaseUrl = normalizeHttpUrl(
    import.meta.env.VITE_MATTERHORN_CLOUD_API_URL,
    `${baseUrl}/api`,
  );

  return {
    baseUrl,
    apiBaseUrl,
    requireSignin: readBooleanEnv(import.meta.env.VITE_MATTERHORN_REQUIRE_SIGNIN),
  };
}

export function buildPublicCloudAuthUrl(
  config: PublicCloudConfig,
  mode: "sign-in" | "sign-up",
  appOrigin = window.location.origin,
): string {
  const target = new URL(config.baseUrl);
  target.searchParams.set("mode", mode);
  target.searchParams.set("returnTo", new URL("/onboarding", appOrigin).toString());
  return target.toString();
}

export async function checkPublicCloudSession(
  config: PublicCloudConfig,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetch(`${config.apiBaseUrl}/v1/me`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) {
    throw new Error(`Matterhorn Cloud session check failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || !("user" in payload)) {
    return false;
  }
  const user = (payload as { user?: unknown }).user;
  return Boolean(
    user &&
      typeof user === "object" &&
      "id" in user &&
      typeof (user as { id?: unknown }).id === "string" &&
      "email" in user &&
      typeof (user as { email?: unknown }).email === "string",
  );
}
