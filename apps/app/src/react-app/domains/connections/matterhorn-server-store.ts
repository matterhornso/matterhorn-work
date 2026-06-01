import { useSyncExternalStore } from "react";

import { t } from "../../../i18n";
import type { StartupPreference, WorkspaceDisplay } from "../../../app/types";
import { isDesktopRuntime } from "../../../app/utils";
import {
  matterhornServerInfo,
  matterhornServerRestart,
  type MatterhornServerInfo,
} from "../../../app/lib/desktop";
import {
  clearMatterhornServerSettings,
  createMatterhornServerClient,
  isLoopbackOpenworkServerUrl,
  normalizeMatterhornServerUrl,
  readMatterhornServerSettings,
  writeMatterhornServerSettings,
  type MatterhornAuditEntry,
  type MatterhornServerCapabilities,
  type MatterhornServerClient,
  type MatterhornServerDiagnostics,
  type MatterhornServerError,
  type MatterhornServerSettings,
  type MatterhornServerStatus,
} from "../../../app/lib/matterhorn-server";

type SetStateAction<T> = T | ((current: T) => T);

type RemoteWorkspaceInput = {
  matterhornHostUrl: string;
  matterhornToken?: string | null;
  directory?: string | null;
  displayName?: string | null;
};

export type MatterhornServerStoreSnapshot = {
  matterhornServerSettings: MatterhornServerSettings;
  shareRemoteAccessBusy: boolean;
  shareRemoteAccessError: string | null;
  matterhornServerUrl: string;
  matterhornServerBaseUrl: string;
  matterhornServerAuth: { token?: string; hostToken?: string };
  matterhornServerClient: MatterhornServerClient | null;
  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerCapabilities: MatterhornServerCapabilities | null;
  matterhornServerReady: boolean;
  matterhornServerWorkspaceReady: boolean;
  resolvedOpenworkCapabilities: MatterhornServerCapabilities | null;
  matterhornServerCanWriteSkills: boolean;
  matterhornServerCanWritePlugins: boolean;
  matterhornServerHostInfo: MatterhornServerInfo | null;
  matterhornServerDiagnostics: MatterhornServerDiagnostics | null;
  matterhornReconnectBusy: boolean;
  matterhornAuditEntries: MatterhornAuditEntry[];
  matterhornAuditStatus: "idle" | "loading" | "error";
  matterhornAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

export type MatterhornServerStore = ReturnType<typeof createMatterhornServerStore>;

type CreateMatterhornServerStoreOptions = {
  startupPreference: () => StartupPreference | null;
  documentVisible: () => boolean;
  developerMode: () => boolean;
  runtimeWorkspaceId: () => string | null;
  activeClient: () => unknown | null;
  selectedWorkspaceDisplay: () => WorkspaceDisplay;
  restartLocalServer: () => Promise<boolean>;
  createRemoteWorkspaceFlow: (input: RemoteWorkspaceInput) => Promise<boolean>;
};

type MutableState = {
  matterhornServerSettings: MatterhornServerSettings;
  shareRemoteAccessBusy: boolean;
  shareRemoteAccessError: string | null;
  matterhornServerUrl: string;
  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerCapabilities: MatterhornServerCapabilities | null;
  matterhornServerCheckedAt: number | null;
  matterhornServerHostInfo: MatterhornServerInfo | null;
  matterhornServerHostInfoReady: boolean;
  matterhornServerDiagnostics: MatterhornServerDiagnostics | null;
  matterhornReconnectBusy: boolean;
  matterhornAuditEntries: MatterhornAuditEntry[];
  matterhornAuditStatus: "idle" | "loading" | "error";
  matterhornAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

const applyStateAction = <T,>(current: T, next: SetStateAction<T>) =>
  typeof next === "function" ? (next as (value: T) => T)(current) : next;

export function createMatterhornServerStore(options: CreateMatterhornServerStoreOptions) {
  const bootStartedAt = Date.now();
  const listeners = new Set<() => void>();
  const intervals = new Map<string, number>();

  let clientCacheKey = "";
  let clientCacheValue: MatterhornServerClient | null = null;
  let started = false;
  let disposed = false;
  let healthTimeoutId: number | null = null;
  let healthBusy = false;
  let healthDelayMs = 10_000;
  let consecutiveHealthFailures = 0;
  let visibilityChangeHandler: (() => void) | null = null;
  let snapshot: MatterhornServerStoreSnapshot;

  let state: MutableState = {
    matterhornServerSettings: readMatterhornServerSettings(),
    shareRemoteAccessBusy: false,
    shareRemoteAccessError: null,
    matterhornServerUrl: "",
    matterhornServerStatus: "disconnected",
    matterhornServerCapabilities: null,
    matterhornServerCheckedAt: null,
    matterhornServerHostInfo: null,
    matterhornServerHostInfoReady: !isDesktopRuntime(),
    matterhornServerDiagnostics: null,
    matterhornReconnectBusy: false,
    matterhornAuditEntries: [],
    matterhornAuditStatus: "idle",
    matterhornAuditError: null,
    devtoolsWorkspaceId: null,
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
  };

  const getBaseUrl = () => {
    const pref = options.startupPreference();
    const hostInfo = state.matterhornServerHostInfo;
    const settingsUrl = normalizeMatterhornServerUrl(state.matterhornServerSettings.urlOverride ?? "") ?? "";

    if (pref === "local") return hostInfo?.baseUrl ?? "";
    if (pref === "server" && settingsUrl && isLoopbackOpenworkServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return hostInfo.baseUrl;
    }
    if (pref === "server") return settingsUrl;
    return hostInfo?.baseUrl ?? settingsUrl;
  };

  const getAuth = () => {
    const pref = options.startupPreference();
    const hostInfo = state.matterhornServerHostInfo;
    const settingsUrl = normalizeMatterhornServerUrl(state.matterhornServerSettings.urlOverride ?? "") ?? "";
    const settingsToken = state.matterhornServerSettings.token?.trim() ?? "";
    const settingsHostToken = state.matterhornServerSettings.hostToken?.trim() ?? "";
    const clientToken = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";

    if (pref === "local") {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    if (pref === "server" && settingsUrl && isLoopbackOpenworkServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return {
        token: clientToken || settingsToken || undefined,
        hostToken: hostToken || settingsHostToken || undefined,
      };
    }
    if (pref === "server") {
      return {
        token: settingsToken || undefined,
        hostToken: settingsUrl && isLoopbackOpenworkServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
      };
    }
    if (hostInfo?.baseUrl) {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    return {
      token: settingsToken || undefined,
      hostToken: settingsUrl && isLoopbackOpenworkServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
    };
  };

  const getClient = () => {
    const baseUrl = getBaseUrl().trim();
    if (!baseUrl) {
      clientCacheKey = "";
      clientCacheValue = null;
      return null;
    }

    const auth = getAuth();
    const key = `${baseUrl}::${auth.token ?? ""}::${auth.hostToken ?? ""}`;
    if (key !== clientCacheKey) {
      clientCacheKey = key;
      clientCacheValue = createMatterhornServerClient({
        baseUrl,
        token: auth.token,
        hostToken: auth.hostToken,
      });
    }
    return clientCacheValue;
  };

  const refreshSnapshot = () => {
    const matterhornServerBaseUrl = getBaseUrl().trim();
    const matterhornServerAuth = getAuth();
    const matterhornServerClient = getClient();
    const matterhornServerReady = state.matterhornServerStatus === "connected";
    const matterhornServerWorkspaceReady = Boolean(options.runtimeWorkspaceId());
    const resolvedOpenworkCapabilities = state.matterhornServerCapabilities;

    const pref = options.startupPreference();
    const info = state.matterhornServerHostInfo;
    const hostUrl = info?.connectUrl ?? info?.lanUrl ?? info?.mdnsUrl ?? info?.baseUrl ?? "";
    const settingsUrl = normalizeMatterhornServerUrl(state.matterhornServerSettings.urlOverride ?? "") ?? "";

    let matterhornServerUrl = hostUrl || settingsUrl;
    if (pref === "local") matterhornServerUrl = hostUrl;
    if (pref === "server") matterhornServerUrl = settingsUrl;
    state.matterhornServerUrl = matterhornServerUrl;

    snapshot = {
      matterhornServerSettings: state.matterhornServerSettings,
      shareRemoteAccessBusy: state.shareRemoteAccessBusy,
      shareRemoteAccessError: state.shareRemoteAccessError,
      matterhornServerUrl,
      matterhornServerBaseUrl,
      matterhornServerAuth,
      matterhornServerClient,
      matterhornServerStatus: state.matterhornServerStatus,
      matterhornServerCapabilities: state.matterhornServerCapabilities,
      matterhornServerReady,
      matterhornServerWorkspaceReady,
      resolvedOpenworkCapabilities,
      matterhornServerCanWriteSkills:
        matterhornServerReady &&
        (resolvedOpenworkCapabilities?.skills?.write ?? false),
      matterhornServerCanWritePlugins:
        matterhornServerReady &&
        (resolvedOpenworkCapabilities?.plugins?.write ?? false),
      matterhornServerHostInfo: state.matterhornServerHostInfo,
      matterhornServerDiagnostics: state.matterhornServerDiagnostics,
      matterhornReconnectBusy: state.matterhornReconnectBusy,
      matterhornAuditEntries: state.matterhornAuditEntries,
      matterhornAuditStatus: state.matterhornAuditStatus,
      matterhornAuditError: state.matterhornAuditError,
      devtoolsWorkspaceId: state.devtoolsWorkspaceId,
    };
  };

  const mutateState = (updater: (current: MutableState) => MutableState) => {
    state = updater(state);
    refreshSnapshot();
    emitChange();
  };

  const setStateField = <K extends keyof MutableState>(key: K, value: MutableState[K]) => {
    if (Object.is(state[key], value)) return;
    mutateState((current) => ({ ...current, [key]: value }));
  };

  const setMatterhornServerSettings = (next: SetStateAction<MatterhornServerSettings>) => {
    const resolved = applyStateAction(state.matterhornServerSettings, next);
    mutateState((current) => ({ ...current, matterhornServerSettings: resolved }));
    queueHealthCheck(0);
  };

  const updateMatterhornServerSettings = (next: MatterhornServerSettings) => {
    const stored = writeMatterhornServerSettings(next);
    mutateState((current) => ({ ...current, matterhornServerSettings: stored }));
    queueHealthCheck(0);
  };

  const resetMatterhornServerSettings = () => {
    clearMatterhornServerSettings();
    mutateState((current) => ({ ...current, matterhornServerSettings: {} }));
    queueHealthCheck(0);
  };

  const shouldWaitForLocalHostInfo = () =>
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    !state.matterhornServerHostInfoReady;

  const shouldRetryStartupCheck = (status: MatterhornServerStatus) =>
    status !== "connected" &&
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    Date.now() - bootStartedAt < 5_000;

  const checkOpenworkServer = async (url: string, token?: string, hostToken?: string) => {
    const client = createMatterhornServerClient({ baseUrl: url, token, hostToken });
    try {
      await client.health();
    } catch (error) {
      const resolved = error as MatterhornServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as MatterhornServerStatus, capabilities: null };
      }
      return { status: "disconnected" as MatterhornServerStatus, capabilities: null };
    }

    if (!token) {
      return { status: "limited" as MatterhornServerStatus, capabilities: null };
    }

    try {
      const capabilities = await client.capabilities();
      return { status: "connected" as MatterhornServerStatus, capabilities };
    } catch (error) {
      const resolved = error as MatterhornServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as MatterhornServerStatus, capabilities: null };
      }
      return { status: "disconnected" as MatterhornServerStatus, capabilities: null };
    }
  };

  const clearHealthTimeout = () => {
    if (healthTimeoutId !== null) {
      window.clearTimeout(healthTimeoutId);
      healthTimeoutId = null;
    }
  };

  const queueHealthCheck = (delayMs: number) => {
    if (disposed || typeof window === "undefined") return;
    clearHealthTimeout();
    healthTimeoutId = window.setTimeout(() => {
      healthTimeoutId = null;
      void runHealthCheck();
    }, Math.max(0, delayMs));
  };

  const runHealthCheck = async () => {
    if (disposed || typeof window === "undefined") return;
    if (!options.documentVisible()) {
      queueHealthCheck(healthDelayMs);
      return;
    }
    if (shouldWaitForLocalHostInfo()) {
      queueHealthCheck(250);
      return;
    }
    if (healthBusy) return;

    const url = getBaseUrl().trim();
    const auth = getAuth();
    if (!url) {
      consecutiveHealthFailures = 0;
      mutateState((current) => ({
        ...current,
        matterhornServerStatus: "disconnected",
        matterhornServerCapabilities: null,
        matterhornServerCheckedAt: Date.now(),
      }));
      return;
    }

    healthBusy = true;
    try {
      let result = await checkOpenworkServer(url, auth.token, auth.hostToken);

      if (shouldRetryStartupCheck(result.status)) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
        if (disposed) return;

        try {
          const info = await matterhornServerInfo() as MatterhornServerInfo;
          if (disposed) return;

          mutateState((current) => ({
            ...current,
            matterhornServerHostInfo: info,
            matterhornServerHostInfoReady: true,
          }));

          const retryUrl = info.baseUrl?.trim() ?? "";
          const retryToken = info.clientToken?.trim() || undefined;
          const retryHostToken = info.hostToken?.trim() || undefined;
          if (retryUrl) {
            result = await checkOpenworkServer(retryUrl, retryToken, retryHostToken);
          }
        } catch {
          // Preserve the original check result when the retry probe fails.
        }
      }

      if (disposed) return;
      const previousStatus = state.matterhornServerStatus;
      const previousCapabilities = state.matterhornServerCapabilities;
      const healthy = result.status === "connected" || result.status === "limited";
      if (healthy) {
        consecutiveHealthFailures = 0;
        healthDelayMs = 10_000;
      } else {
        consecutiveHealthFailures += 1;
        healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      }

      const preservePrevious =
        !healthy &&
        consecutiveHealthFailures < 3 &&
        (previousStatus === "connected" || previousStatus === "limited");

      mutateState((current) => ({
        ...current,
        matterhornServerStatus: preservePrevious ? previousStatus : result.status,
        matterhornServerCapabilities: preservePrevious ? previousCapabilities : result.capabilities,
        matterhornServerCheckedAt: Date.now(),
      }));
    } catch {
      healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      mutateState((current) => ({
        ...current,
        matterhornServerCheckedAt: Date.now(),
      }));
    } finally {
      healthBusy = false;
      if (!disposed) queueHealthCheck(healthDelayMs);
    }
  };

  const syncFromOptions = () => {
    refreshSnapshot();
    emitChange();

    if (!isDesktopRuntime()) return;
    const port = state.matterhornServerHostInfo?.port;
    if (!port) return;
    if (state.matterhornServerSettings.portOverride === port) return;

    updateMatterhornServerSettings({
      ...state.matterhornServerSettings,
      portOverride: port,
    });
  };

  const startInterval = (key: string, fn: () => void, ms: number) => {
    if (typeof window === "undefined") return;
    if (intervals.has(key)) return;
    intervals.set(key, window.setInterval(fn, ms));
  };

  const stopInterval = (key: string) => {
    const id = intervals.get(key);
    if (id === undefined) return;
    window.clearInterval(id);
    intervals.delete(key);
  };

  const start = () => {
    if (typeof window === "undefined") return;
    if (started) return;
    // Allow restart after a prior dispose() (React 18 StrictMode double-mounts
    // each effect in dev: mount → dispose → re-mount). If we early-return when
    // `disposed` is true, the real mount never arms polling and the UI stays
    // on stale/empty state forever.
    disposed = false;
    started = true;

    syncFromOptions();
    queueHealthCheck(0);
    visibilityChangeHandler = () => {
      if (!options.documentVisible()) return;
      consecutiveHealthFailures = 0;
      queueHealthCheck(0);
    };
    window.addEventListener("visibilitychange", visibilityChangeHandler);

    const refreshHostInfo = () => {
      if (!isDesktopRuntime()) return;
      if (!options.documentVisible()) return;
      void (async () => {
        try {
          const info = await matterhornServerInfo() as MatterhornServerInfo;
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            matterhornServerHostInfo: info,
            matterhornServerHostInfoReady: true,
          }));
        } catch {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            matterhornServerHostInfo: null,
            matterhornServerHostInfoReady: true,
          }));
        }
      })();
    };
    refreshHostInfo();
    startInterval("hostInfo", refreshHostInfo, 10_000);

    const refreshDiagnostics = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("matterhornServerDiagnostics", null);
        return;
      }

      const client = getClient();
      if (!client || state.matterhornServerStatus === "disconnected") {
        setStateField("matterhornServerDiagnostics", null);
        return;
      }

      void (async () => {
        try {
          const status = await client.status();
          if (!disposed) setStateField("matterhornServerDiagnostics", status);
        } catch {
          if (!disposed) setStateField("matterhornServerDiagnostics", null);
        }
      })();
    };
    refreshDiagnostics();
    startInterval("diagnostics", refreshDiagnostics, 10_000);

    const refreshDevtoolsWorkspace = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      const client = getClient();
      if (!client) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      void (async () => {
        try {
          const response = await client.listWorkspaces();
          if (disposed) return;
          const items = Array.isArray(response.items) ? response.items : [];
          const activeMatch = response.activeId
            ? items.find((item) => item.id === response.activeId)
            : null;
          setStateField("devtoolsWorkspaceId", activeMatch?.id ?? items[0]?.id ?? null);
        } catch {
          if (!disposed) setStateField("devtoolsWorkspaceId", null);
        }
      })();
    };
    refreshDevtoolsWorkspace();
    startInterval("devtoolsWorkspace", refreshDevtoolsWorkspace, 20_000);

    const refreshAudit = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        mutateState((current) => ({
          ...current,
          matterhornAuditEntries: [],
          matterhornAuditStatus: "idle",
          matterhornAuditError: null,
        }));
        return;
      }

      const client = getClient();
      const workspaceId = state.devtoolsWorkspaceId;
      if (!client || !workspaceId) {
        mutateState((current) => ({
          ...current,
          matterhornAuditEntries: [],
          matterhornAuditStatus: "idle",
          matterhornAuditError: null,
        }));
        return;
      }

      mutateState((current) => ({
        ...current,
        matterhornAuditStatus: "loading",
        matterhornAuditError: null,
      }));

      void (async () => {
        try {
          const result = await client.listAudit(workspaceId, 50);
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            matterhornAuditEntries: Array.isArray(result.items) ? result.items : [],
            matterhornAuditStatus: "idle",
          }));
        } catch (error) {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            matterhornAuditEntries: [],
            matterhornAuditStatus: "error",
            matterhornAuditError:
              error instanceof Error
                ? error.message
                : t("app.error_audit_load"),
          }));
        }
      })();
    };
    refreshAudit();
    startInterval("audit", refreshAudit, 15_000);
  };

  const dispose = () => {
    disposed = true;
    started = false;
    clearHealthTimeout();
    if (visibilityChangeHandler && typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", visibilityChangeHandler);
      visibilityChangeHandler = null;
    }
    for (const key of [...intervals.keys()]) stopInterval(key);
  };

  const testMatterhornServerConnection = async (next: MatterhornServerSettings) => {
    const derived = normalizeMatterhornServerUrl(next.urlOverride ?? "");
    if (!derived) {
      mutateState((current) => ({
        ...current,
        matterhornServerStatus: "disconnected",
        matterhornServerCapabilities: null,
        matterhornServerCheckedAt: Date.now(),
      }));
      return false;
    }

    const result = await checkOpenworkServer(derived, next.token);
    consecutiveHealthFailures = result.status === "disconnected" ? consecutiveHealthFailures + 1 : 0;
    mutateState((current) => ({
      ...current,
      matterhornServerStatus: result.status,
      matterhornServerCapabilities: result.capabilities,
      matterhornServerCheckedAt: Date.now(),
    }));

    const ok = result.status === "connected" || result.status === "limited";
    if (ok && !isDesktopRuntime()) {
      const active = options.selectedWorkspaceDisplay();
      const shouldAttach =
        !options.activeClient() ||
        active.workspaceType !== "remote" ||
        active.remoteType !== "openwork";
      if (shouldAttach) {
        await options
          .createRemoteWorkspaceFlow({
            matterhornHostUrl: derived,
            matterhornToken: next.token ?? null,
          })
          .catch(() => undefined);
      }
    }
    return ok;
  };

  const reconnectOpenworkServer = async () => {
    if (state.matterhornReconnectBusy) return false;
    setStateField("matterhornReconnectBusy", true);

    try {
      let hostInfo = state.matterhornServerHostInfo;
      if (isDesktopRuntime()) {
        try {
          hostInfo = await matterhornServerInfo() as MatterhornServerInfo;
          mutateState((current) => ({ ...current, matterhornServerHostInfo: hostInfo }));
        } catch {
          hostInfo = null;
          setStateField("matterhornServerHostInfo", null);
        }
      }

      if (hostInfo?.clientToken?.trim() && options.startupPreference() !== "server") {
        const liveToken = hostInfo.clientToken.trim();
        const settings = state.matterhornServerSettings;
        if ((settings.token?.trim() ?? "") !== liveToken) {
          updateMatterhornServerSettings({ ...settings, token: liveToken });
        }
      }

      const url = getBaseUrl().trim();
      const auth = getAuth();
      if (!url) {
        mutateState((current) => ({
          ...current,
          matterhornServerStatus: "disconnected",
          matterhornServerCapabilities: null,
          matterhornServerCheckedAt: Date.now(),
        }));
        return false;
      }

      const result = await checkOpenworkServer(url, auth.token, auth.hostToken);
      mutateState((current) => ({
        ...current,
        matterhornServerStatus: result.status,
        matterhornServerCapabilities: result.capabilities,
        matterhornServerCheckedAt: Date.now(),
      }));
      return result.status === "connected" || result.status === "limited";
    } finally {
      setStateField("matterhornReconnectBusy", false);
    }
  };

  async function ensureLocalMatterhornServerClient(): Promise<MatterhornServerClient | null> {
    let hostInfo = state.matterhornServerHostInfo;
    if (hostInfo?.baseUrl?.trim() && hostInfo.clientToken?.trim()) {
      const existing = createMatterhornServerClient({
        baseUrl: hostInfo.baseUrl.trim(),
        token: hostInfo.clientToken.trim(),
        hostToken: hostInfo.hostToken?.trim() || undefined,
      });
      try {
        await existing.health();
        if (options.startupPreference() !== "server") {
          await reconnectOpenworkServer();
        }
        return existing;
      } catch {
        // Fall through to a local restart.
      }
    }

    if (!isDesktopRuntime()) return null;

    try {
      hostInfo = await matterhornServerRestart({
        remoteAccessEnabled: state.matterhornServerSettings.remoteAccessEnabled === true,
      }) as MatterhornServerInfo;
      mutateState((current) => ({ ...current, matterhornServerHostInfo: hostInfo }));
    } catch {
      return null;
    }

    const baseUrl = hostInfo?.baseUrl?.trim() ?? "";
    const token = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";
    if (!baseUrl || !token) return null;

    if (options.startupPreference() !== "server") {
      await reconnectOpenworkServer();
    }

    return createMatterhornServerClient({
      baseUrl,
      token,
      hostToken: hostToken || undefined,
    });
  }

  const saveShareRemoteAccess = async (enabled: boolean) => {
    if (state.shareRemoteAccessBusy) return;
    const previous = state.matterhornServerSettings;
    const next: MatterhornServerSettings = {
      ...previous,
      remoteAccessEnabled: enabled,
    };

    mutateState((current) => ({
      ...current,
      shareRemoteAccessBusy: true,
      shareRemoteAccessError: null,
    }));
    updateMatterhornServerSettings(next);

    try {
      if (isDesktopRuntime() && options.selectedWorkspaceDisplay().workspaceType === "local") {
        const restarted = await options.restartLocalServer();
        if (!restarted) {
          throw new Error(t("app.error_restart_local_worker"));
        }
        await reconnectOpenworkServer();
      }
    } catch (error) {
      updateMatterhornServerSettings(previous);
      mutateState((current) => ({
        ...current,
        shareRemoteAccessError:
          error instanceof Error
            ? error.message
            : t("app.error_remote_access"),
      }));
      return;
    } finally {
      setStateField("shareRemoteAccessBusy", false);
    }
  };

  refreshSnapshot();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => snapshot;

  return {
    subscribe,
    getSnapshot,
    start,
    dispose,
    syncFromOptions,
    setMatterhornServerSettings,
    updateMatterhornServerSettings,
    resetMatterhornServerSettings,
    saveShareRemoteAccess,
    checkOpenworkServer,
    testMatterhornServerConnection,
    reconnectOpenworkServer,
    ensureLocalMatterhornServerClient,
  };
}

export function useMatterhornServerStoreSnapshot(store: MatterhornServerStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
