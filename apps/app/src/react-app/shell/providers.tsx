/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "../infra/wagmi-config";
import { isWebDeployment } from "../../app/lib/matterhorn-deployment";
import { hydrateMatterhornServerSettingsFromEnv } from "../../app/lib/matterhorn-server";
import { isDesktopRuntime } from "../../app/utils";
import { DenAuthProvider } from "../domains/cloud/den-auth-provider";
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

function resolveDefaultServerUrl(): string {
  if (isDesktopRuntime()) return "http://127.0.0.1:4096";

  const matterhornUrl =
    typeof import.meta.env?.VITE_OPENWORK_URL === "string"
      ? import.meta.env.VITE_OPENWORK_URL.trim()
      : "";
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

export function AppProviders({ children }: AppProvidersProps) {
  hydrateMatterhornServerSettingsFromEnv();

  useEffect(() => {
    // Start the dev observability forwarder. Reads the current openwork-server
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
    <WagmiProvider config={wagmiConfig}>
      <BootStateProvider>
        <ServerProvider defaultUrl={defaultUrl}>
          <ArchitectureMismatchGate>
            <DesktopRuntimeBoot />
            <DenAuthProvider>
              <DesktopConfigProvider>
                <RestrictionNoticeProvider>
                  <LocalProvider>
                    <StatusToastsProvider>
                      <ReloadCoordinatorProvider>{children}</ReloadCoordinatorProvider>
                    </StatusToastsProvider>
                  </LocalProvider>
                </RestrictionNoticeProvider>
              </DesktopConfigProvider>
            </DenAuthProvider>
          </ArchitectureMismatchGate>
        </ServerProvider>
      </BootStateProvider>
    </WagmiProvider>
  );
}
