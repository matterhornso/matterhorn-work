/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { readDenBootstrapConfig, readDenSettings } from "../../app/lib/den";
import {
  isPublicBetaWebDeployment,
  isWebDeployment,
} from "../../app/lib/matterhorn-deployment";
import { hydrateMatterhornServerSettingsFromEnv } from "../../app/lib/matterhorn-server";
import { isDesktopRuntime } from "../../app/utils";
import { DenAuthProvider } from "../domains/cloud/den-auth-provider";
import { BetaAuthProvider } from "../domains/auth";
import { DesktopConfigProvider } from "../domains/cloud/desktop-config-provider";
import { RestrictionNoticeProvider } from "../domains/cloud/restriction-notice-provider";
import { StatusToastsProvider } from "../domains/shell-feedback/status-toasts";
import { LocalProvider } from "../kernel/local-provider";
import { ServerProvider } from "../kernel/server-provider";
import { ArchitectureMismatchGate } from "./architecture-mismatch-gate";
import { BootStateProvider } from "./boot-state";
import { DesktopRuntimeBoot } from "./desktop-runtime-boot";
import { startDebugLogger, stopDebugLogger } from "./debug-logger";
import { resolveMatterhornConnection } from "./matterhorn-connection";
import { ReloadCoordinatorProvider } from "./reload-coordinator";
import { LazyWalletRuntimeProvider } from "./LazyWalletRuntimeProvider";

function resolveDefaultServerUrl(): string {
  if (isDesktopRuntime()) return "http://127.0.0.1:4096";

  // A public web build always reaches the authenticated deployment proxy on
  // its own origin. It must never inherit a local API URL or browser token.
  if (isPublicBetaWebDeployment() && typeof window !== "undefined") {
    return `${window.location.origin}/opencode`;
  }

  const matterhornUrl =
    (typeof import.meta.env?.VITE_MATTERHORN_WORK_URL === "string"
      ? import.meta.env.VITE_MATTERHORN_WORK_URL.trim()
      : "") ||
    (typeof import.meta.env?.VITE_OPENWORK_URL === "string"
      ? import.meta.env.VITE_OPENWORK_URL.trim()
      : "");
  if (matterhornUrl) {
    return `${matterhornUrl.replace(/\/+$/, "")}/opencode`;
  }

  if (isWebDeployment() && import.meta.env.PROD && typeof window !== "undefined") {
    return `${window.location.origin}/opencode`;
  }

  const envUrl =
    typeof import.meta.env?.VITE_OPENCODE_URL === "string"
      ? import.meta.env.VITE_OPENCODE_URL.trim()
      : "";
  return envUrl || "http://127.0.0.1:4096";
}

type AppProvidersProps = {
  children: ReactNode;
};

function routeNeedsWalletRuntime(
  pathname: string,
  requireSignin: boolean,
  hasCachedAuth: boolean,
  publicBetaWeb: boolean,
): boolean {
  // Public required-signin builds only mount this authenticated shell after
  // their cookie-backed session has been verified by PublicSigninBootstrap.
  // Desktop required-signin builds still use the cached-token guard.
  if (requireSignin && !hasCachedAuth && !publicBetaWeb) return false;

  const path = pathname.toLowerCase();
  return !(
    path === "/signin" ||
    path.startsWith("/signin/") ||
    path === "/onboarding" ||
    path.startsWith("/onboarding/")
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  const location = useLocation();
  hydrateMatterhornServerSettingsFromEnv();
  const requireSignin = readDenBootstrapConfig().requireSignin;
  const hasCachedAuth = Boolean(readDenSettings().authToken?.trim());
  const publicBetaWeb = isPublicBetaWebDeployment();

  useEffect(() => {
    // Start the dev observability forwarder. Reads the current matterhorn-server
    // URL on every flush so reconnects after port changes still work. In prod
    // builds `startDebugLogger` is a no-op.
    startDebugLogger({
      serverUrl: async () => (await resolveMatterhornConnection()).normalizedBaseUrl,
    });
    return () => {
      stopDebugLogger();
    };
  }, []);

  const defaultUrl = resolveDefaultServerUrl();
  return (
    <LazyWalletRuntimeProvider
      enabled={routeNeedsWalletRuntime(
        location.pathname,
        requireSignin,
        hasCachedAuth,
        publicBetaWeb,
      )}
    >
      <BootStateProvider>
        <ServerProvider defaultUrl={defaultUrl}>
          <ArchitectureMismatchGate>
            <DesktopRuntimeBoot />
            <DenAuthProvider>
              <BetaAuthProvider>
                <DesktopConfigProvider>
                  <RestrictionNoticeProvider>
                    <LocalProvider>
                      <StatusToastsProvider>
                        <ReloadCoordinatorProvider>
                          {children}
                        </ReloadCoordinatorProvider>
                      </StatusToastsProvider>
                    </LocalProvider>
                  </RestrictionNoticeProvider>
                </DesktopConfigProvider>
              </BetaAuthProvider>
            </DenAuthProvider>
          </ArchitectureMismatchGate>
        </ServerProvider>
      </BootStateProvider>
    </LazyWalletRuntimeProvider>
  );
}
