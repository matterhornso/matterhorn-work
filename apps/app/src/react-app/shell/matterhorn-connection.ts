import {
  isLoopbackOpenworkServerUrl,
  normalizeMatterhornServerUrl,
  readMatterhornServerSettings,
} from "../../app/lib/matterhorn-server";
import { isPublicBetaWebDeployment } from "../../app/lib/matterhorn-deployment";
import { matterhornServerInfo, type MatterhornServerInfo } from "../../app/lib/desktop";
import { isDesktopRuntime } from "../../app/utils";

export type MatterhornConnectionSource = "desktop-runtime" | "environment" | "stored-settings" | "empty";

export type ResolvedMatterhornConnection = {
  normalizedBaseUrl: string;
  resolvedToken: string;
  resolvedHostToken: string;
  hostInfo: MatterhornServerInfo | null;
  source: MatterhornConnectionSource;
};

function hasUsableConnection(url: string, token: string) {
  return (
    url.trim().length > 0 &&
    (token.trim().length > 0 || isPublicBetaWebDeployment())
  );
}

type MatterhornConnectionEnv = Record<string, unknown>;

function readEnvValue(env: MatterhornConnectionEnv, primary: string, legacy: string) {
  const primaryValue = typeof env[primary] === "string" ? env[primary].trim() : "";
  if (primaryValue) return primaryValue;
  return typeof env[legacy] === "string" ? env[legacy].trim() : "";
}

/**
 * Local web development starts the app and engine together with an ephemeral
 * port and token. When that connection is marked authoritative, use it
 * directly instead of depending on a browser-storage round trip during boot.
 */
export function resolveForcedWebConnectionFromEnv(
  env: MatterhornConnectionEnv,
  options: { desktop: boolean; publicBetaWeb: boolean; browserOrigin?: string },
): ResolvedMatterhornConnection | null {
  if (options.desktop || options.publicBetaWeb) return null;

  const forceSettings =
    readEnvValue(env, "VITE_MATTERHORN_WORK_FORCE_SETTINGS", "VITE_OPENWORK_FORCE_SETTINGS") === "1";
  if (!forceSettings) return null;

  const configuredBaseUrl =
    normalizeMatterhornServerUrl(
      readEnvValue(env, "VITE_MATTERHORN_WORK_URL", "VITE_OPENWORK_URL"),
    ) ?? "";
  const resolvedToken = readEnvValue(env, "VITE_MATTERHORN_WORK_TOKEN", "VITE_OPENWORK_TOKEN");
  if (!hasUsableConnection(configuredBaseUrl, resolvedToken)) return null;

  // The local web server proxies engine routes on its own origin. Keeping
  // browser requests same-origin avoids browser-specific loopback stalls while
  // preserving the launcher-provided credentials and backend target.
  const normalizedBrowserOrigin = normalizeMatterhornServerUrl(options.browserOrigin ?? "") ?? "";
  const normalizedBaseUrl = normalizedBrowserOrigin || configuredBaseUrl;

  return {
    normalizedBaseUrl,
    resolvedToken,
    resolvedHostToken: isLoopbackOpenworkServerUrl(normalizedBaseUrl)
      ? readEnvValue(env, "VITE_MATTERHORN_WORK_HOST_TOKEN", "VITE_OPENWORK_HOST_TOKEN")
      : "",
    hostInfo: null,
    source: "environment",
  };
}

/**
 * Resolve the Matterhorn Desks server connection for routes that consume the server API.
 *
 * Local desktop-hosted servers expose ephemeral loopback ports and freshly
 * minted tokens on every boot, so live runtime info is the source of truth
 * there. Stored settings remain the fallback for remote/manual server
 * connections and for desktop cases where the runtime bridge is unavailable.
 * Public web uses the same-origin authenticated proxy, where the browser
 * session replaces a client-side bearer token.
 */
export async function resolveMatterhornConnection(): Promise<ResolvedMatterhornConnection> {
  let staleDesktopRuntimeBaseUrl = "";
  const desktop = isDesktopRuntime();
  const publicBetaWeb = isPublicBetaWebDeployment();

  if (desktop) {
    try {
      const info = await matterhornServerInfo() as MatterhornServerInfo;
      const normalizedBaseUrl =
        normalizeMatterhornServerUrl(info.baseUrl ?? info.connectUrl ?? info.lanUrl ?? info.mdnsUrl ?? "") ??
        "";
      const resolvedToken = info.ownerToken?.trim() || info.clientToken?.trim() || "";
      if (info.running === true && hasUsableConnection(normalizedBaseUrl, resolvedToken)) {
        return {
          normalizedBaseUrl,
          resolvedToken,
          resolvedHostToken: info.hostToken?.trim() || "",
          hostInfo: info,
          source: "desktop-runtime",
        };
      }
      staleDesktopRuntimeBaseUrl = normalizedBaseUrl;
    } catch {
      // Fall through to stored settings for remote/manual connections.
    }
  }

  const environmentConnection = resolveForcedWebConnectionFromEnv(
    import.meta.env as MatterhornConnectionEnv,
    {
      desktop,
      publicBetaWeb,
      browserOrigin:
        typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)
          ? window.location.origin
          : undefined,
    },
  );
  if (environmentConnection) return environmentConnection;

  const settings = readMatterhornServerSettings();
  const normalizedBaseUrl = normalizeMatterhornServerUrl(settings.urlOverride ?? "") ?? "";
  const resolvedToken = settings.token?.trim() ?? "";
  const resolvedHostToken =
    normalizedBaseUrl && isLoopbackOpenworkServerUrl(normalizedBaseUrl)
      ? settings.hostToken?.trim() ?? ""
      : "";
  const storedConnectionIsStaleDesktopRuntime = Boolean(
      desktop &&
      staleDesktopRuntimeBaseUrl &&
      normalizedBaseUrl === staleDesktopRuntimeBaseUrl,
  );
  const source =
    !storedConnectionIsStaleDesktopRuntime && hasUsableConnection(normalizedBaseUrl, resolvedToken)
      ? "stored-settings"
      : "empty";

  return {
    normalizedBaseUrl: source === "empty" ? "" : normalizedBaseUrl,
    resolvedToken: source === "empty" ? "" : resolvedToken,
    resolvedHostToken: source === "empty" ? "" : resolvedHostToken,
    hostInfo: null,
    source,
  };
}
