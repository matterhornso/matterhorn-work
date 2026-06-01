/** @jsxImportSource react */
import { useEffect, useMemo, useReducer, useRef } from "react";
import { RefreshCcw } from "lucide-react";

import { readDevLogs } from "../../../../app/lib/dev-log";
import { readPerfLogs } from "../../../../app/lib/perf-log";
import {
  buildMatterhornWorkspaceBaseUrl,
  parseOpenworkWorkspaceIdFromUrl,
  type MatterhornServerSettings,
  type MatterhornServerStatus,
} from "../../../../app/lib/matterhorn-server";
import type { MatterhornServerInfo } from "../../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../../app/utils";
import { t } from "../../../../i18n";
import {
  ConfigDiagnosticsSection,
  ConfigEngineReloadSection,
  ConfigMessagingIdentitiesSection,
  ConfigServerConnectionSection,
  ConfigServerSharingSection,
  ConfigWorkspaceSummary,
} from "./config-view-sections";
import { configLocalReducer, initialConfigLocalState } from "./config-view-state";

export type ConfigViewProps = {
  busy: boolean;
  clientConnected: boolean;
  anyActiveRuns: boolean;

  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerUrl: string;
  matterhornServerSettings: MatterhornServerSettings;
  matterhornServerHostInfo: MatterhornServerInfo | null;
  runtimeWorkspaceId: string | null;

  updateMatterhornServerSettings: (next: MatterhornServerSettings) => void;
  resetMatterhornServerSettings: () => void;
  testMatterhornServerConnection: (
    next: MatterhornServerSettings,
  ) => Promise<boolean>;

  canReloadWorkspace: boolean;
  reloadWorkspaceEngine: () => Promise<void>;
  reloadBusy: boolean;
  reloadError: string | null;

  developerMode: boolean;
};

function buildDiagnosticsBundleJson(input: {
  anyActiveRuns: boolean;
  canReloadWorkspace: boolean;
  clientConnected: boolean;
  developerMode: boolean;
  hostConnectUrl: string;
  hostConnectUrlUsesMdns: boolean;
  hostInfo: MatterhornServerInfo | null;
  matterhornServerSettings: MatterhornServerSettings;
  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerUrl: string;
  runtimeWorkspaceId: string | null;
}) {
  const urlOverride = input.matterhornServerSettings.urlOverride?.trim() ?? "";
  const token = input.matterhornServerSettings.token?.trim() ?? "";
  const developerLogs = input.developerMode ? readDevLogs(80) : [];
  const perfLogs = input.developerMode ? readPerfLogs(80) : [];
  const bundle = {
    capturedAt: new Date().toISOString(),
    runtime: {
      tauri: isDesktopRuntime(),
      developerMode: input.developerMode,
    },
    workspace: {
      runtimeWorkspaceId: input.runtimeWorkspaceId ?? null,
      clientConnected: input.clientConnected,
      anyActiveRuns: input.anyActiveRuns,
    },
    matterhornServer: {
      status: input.matterhornServerStatus,
      url: input.matterhornServerUrl,
      settings: {
        urlOverride: urlOverride || null,
        tokenPresent: Boolean(token),
      },
      host: input.hostInfo
        ? {
            running: Boolean(input.hostInfo.running),
            remoteAccessEnabled: input.hostInfo.remoteAccessEnabled,
            baseUrl: input.hostInfo.baseUrl ?? null,
            connectUrl: input.hostInfo.connectUrl ?? null,
            mdnsUrl: input.hostInfo.mdnsUrl ?? null,
            lanUrl: input.hostInfo.lanUrl ?? null,
          }
        : null,
    },
    reload: {
      canReloadWorkspace: input.canReloadWorkspace,
    },
    sharing: {
      hostConnectUrl: input.hostConnectUrl || null,
      hostConnectUrlUsesMdns: input.hostConnectUrlUsesMdns,
    },
    performance: {
      retainedEntries: perfLogs.length,
      recent: perfLogs,
    },
    developerLogs: {
      retainedEntries: developerLogs.length,
      recent: developerLogs,
    },
  };
  return JSON.stringify(bundle, null, 2);
}

export function ConfigView(props: ConfigViewProps) {
  const [localState, dispatchLocal] = useReducer(
    configLocalReducer,
    initialConfigLocalState,
  );
  const { openworkConnection, tokenVisible, copyingField } = localState;
  const matterhornUrl = openworkConnection.url;
  const matterhornToken = openworkConnection.token;
  const openworkTestState = openworkConnection.testState;
  const openworkTestMessage = openworkConnection.testMessage;
  const copyTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    dispatchLocal({
      type: "serverSettings",
      connection: {
        url: props.matterhornServerSettings.urlOverride ?? "",
        token: props.matterhornServerSettings.token ?? "",
        testState: "idle",
        testMessage: null,
      },
    });
  }, [props.matterhornServerSettings]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== undefined) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const matterhornStatusLabel = (() => {
    switch (props.matterhornServerStatus) {
      case "connected":
        return t("config.status_connected");
      case "limited":
        return t("config.status_limited");
      default:
        return t("config.status_not_connected");
    }
  })();

  const matterhornStatusStyle = (() => {
    switch (props.matterhornServerStatus) {
      case "connected":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "limited":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  })();

  const reloadAvailabilityReason = (() => {
    if (!props.clientConnected) return t("config.reload_connect_hint");
    if (!props.canReloadWorkspace) return t("config.reload_availability_hint");
    return null;
  })();

  const reloadButtonLabel = props.reloadBusy
    ? t("config.reloading")
    : t("config.reload_engine");
  const reloadButtonTone: "destructive" | "secondary" = props.anyActiveRuns
    ? "destructive"
    : "secondary";
  const reloadButtonDisabled =
    props.reloadBusy || Boolean(reloadAvailabilityReason);

  const buildOpenworkSettings = (): MatterhornServerSettings => ({
    ...props.matterhornServerSettings,
    urlOverride: matterhornUrl.trim() || undefined,
    token: matterhornToken.trim() || undefined,
  });

  const hasOpenworkChanges = (() => {
    const currentUrl = props.matterhornServerSettings.urlOverride ?? "";
    const currentToken = props.matterhornServerSettings.token ?? "";
    return (
      matterhornUrl.trim() !== currentUrl || matterhornToken.trim() !== currentToken
    );
  })();

  const resolvedWorkspaceId = (() => {
    const explicitId = props.runtimeWorkspaceId?.trim() ?? "";
    if (explicitId) return explicitId;
    return parseOpenworkWorkspaceIdFromUrl(matterhornUrl) ?? "";
  })();

  const resolvedWorkspaceUrl = (() => {
    const baseUrl = matterhornUrl.trim();
    if (!baseUrl) return "";
    return buildMatterhornWorkspaceBaseUrl(baseUrl, resolvedWorkspaceId) ?? baseUrl;
  })();

  const hostInfo = props.matterhornServerHostInfo;
  const hostRemoteAccessEnabled = hostInfo?.remoteAccessEnabled === true;
  const hostStatusLabel = !hostInfo?.running
    ? t("config.host_offline")
    : hostRemoteAccessEnabled
      ? t("config.host_remote_enabled")
      : t("config.host_local_only");
  const hostStatusStyle = !hostInfo?.running
    ? "bg-gray-4/60 text-gray-11 border-gray-7/50"
    : "bg-green-7/10 text-green-11 border-green-7/20";
  const hostConnectUrl =
    hostInfo?.connectUrl ??
    hostInfo?.mdnsUrl ??
    hostInfo?.lanUrl ??
    hostInfo?.baseUrl ??
    "";
  const hostConnectUrlUsesMdns = hostConnectUrl.includes(".local");

  const diagnosticsBundleJson = useMemo(() => {
    return buildDiagnosticsBundleJson({
      anyActiveRuns: props.anyActiveRuns,
      canReloadWorkspace: props.canReloadWorkspace,
      clientConnected: props.clientConnected,
      developerMode: props.developerMode,
      hostConnectUrl,
      hostConnectUrlUsesMdns,
      hostInfo,
      matterhornServerSettings: props.matterhornServerSettings,
      matterhornServerStatus: props.matterhornServerStatus,
      matterhornServerUrl: props.matterhornServerUrl,
      runtimeWorkspaceId: props.runtimeWorkspaceId,
    });
  }, [
    hostConnectUrl,
    hostConnectUrlUsesMdns,
    hostInfo,
    props.anyActiveRuns,
    props.canReloadWorkspace,
    props.clientConnected,
    props.developerMode,
    props.matterhornServerSettings.token,
    props.matterhornServerSettings.urlOverride,
    props.matterhornServerStatus,
    props.matterhornServerUrl,
    props.runtimeWorkspaceId,
  ]);

  const handleCopy = async (value: string, field: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      dispatchLocal({ type: "copyingField", field });
      if (copyTimeoutRef.current !== undefined) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        dispatchLocal({ type: "copyingField", field: null });
        copyTimeoutRef.current = undefined;
      }, 2000);
    } catch {
      // ignore
    }
  };

  const handleTestConnection = async () => {
    if (openworkTestState === "testing") return;
    const next = buildOpenworkSettings();
    props.updateMatterhornServerSettings(next);
    dispatchLocal({
      type: "testState",
      testState: "testing",
      testMessage: null,
    });
    try {
      const ok = await props.testMatterhornServerConnection(next);
      dispatchLocal({
        type: "testState",
        testState: ok ? "success" : "error",
        testMessage: ok
          ? t("config.connection_successful")
          : t("config.connection_failed"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("config.connection_failed_check");
      dispatchLocal({
        type: "testState",
        testState: "error",
        testMessage: message,
      });
    }
  };

  return (
    <section className="space-y-6 max-w-3xl w-full">
      <ConfigWorkspaceSummary runtimeWorkspaceId={props.runtimeWorkspaceId} />
      <ConfigEngineReloadSection
        anyActiveRuns={props.anyActiveRuns}
        reloadBusy={props.reloadBusy}
        reloadError={props.reloadError}
        reloadAvailabilityReason={reloadAvailabilityReason}
        reloadButtonTone={reloadButtonTone}
        reloadButtonDisabled={reloadButtonDisabled}
        reloadButtonLabel={reloadButtonLabel}
        onReload={props.reloadWorkspaceEngine}
      />
      {props.developerMode ? (
        <ConfigDiagnosticsSection
          busy={props.busy}
          diagnosticsBundleJson={diagnosticsBundleJson}
          copyingField={copyingField}
          onCopy={handleCopy}
        />
      ) : null}
      {hostInfo ? (
        <ConfigServerSharingSection
          hostInfo={hostInfo}
          hostConnectUrl={hostConnectUrl}
          hostRemoteAccessEnabled={hostRemoteAccessEnabled}
          hostConnectUrlUsesMdns={hostConnectUrlUsesMdns}
          hostStatusLabel={hostStatusLabel}
          hostStatusStyle={hostStatusStyle}
          tokenVisible={tokenVisible}
          copyingField={copyingField}
          onCopy={handleCopy}
          onToggleToken={(key) => dispatchLocal({ type: "toggleToken", key })}
        />
      ) : null}
      <ConfigServerConnectionSection
        busy={props.busy}
        matterhornUrl={matterhornUrl}
        matterhornToken={matterhornToken}
        tokenVisible={tokenVisible.openwork}
        matterhornStatusLabel={matterhornStatusLabel}
        matterhornStatusStyle={matterhornStatusStyle}
        resolvedWorkspaceUrl={resolvedWorkspaceUrl}
        resolvedWorkspaceId={resolvedWorkspaceId}
        openworkTestState={openworkTestState}
        openworkTestMessage={openworkTestMessage}
        hasOpenworkChanges={hasOpenworkChanges}
        onUrlChange={(url) => dispatchLocal({ type: "url", url })}
        onTokenChange={(token) => dispatchLocal({ type: "token", token })}
        onToggleToken={() => dispatchLocal({ type: "toggleToken", key: "openwork" })}
        onTestConnection={handleTestConnection}
        onSave={() => props.updateMatterhornServerSettings(buildOpenworkSettings())}
        onReset={props.resetMatterhornServerSettings}
      />
      <ConfigMessagingIdentitiesSection />
      {!isDesktopRuntime() ? <div className="text-xs text-gray-9">{t("config.desktop_only_hint")}</div> : null}
    </section>
  );
}
