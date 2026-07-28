import type { McpDirectoryInfo } from "../../../../../app/constants";
import { evaluateEnablement } from "../../../../../app/enablement";
import { isExtensionVisibleAtLaunch } from "../../../../../app/lib/launch-features";
import type { McpStatusMap } from "../../../../../app/types";

export type ComposerExtensionReadiness = {
  visible: boolean;
  ready: boolean;
  setupMessage: string | null;
};

export type ComposerExtensionReadinessContext = {
  enabled: boolean;
  desktopRuntime: boolean;
  connectedProviderIds?: string[];
  configuredEnvKeys?: string[];
  loadedPlugins?: string[];
  mcpStatuses?: McpStatusMap;
};

function isPlatformSupported(entry: McpDirectoryInfo, desktopRuntime: boolean) {
  const platforms = entry.extensionManifest?.platform;
  if (!platforms?.length) return true;
  if (!desktopRuntime) return platforms.includes("web");
  return platforms.some((platform) => platform !== "web");
}

function setupMessageFor(entry: McpDirectoryInfo, unmetType: string | undefined) {
  if (unmetType === "provider-connected") {
    return `Connect ${entry.name} in Settings.`;
  }
  if (unmetType === "mcp-connected") {
    return "Connect the required MCP server in Settings.";
  }
  if (unmetType === "env-set") {
    return "Add the required API key in Settings.";
  }
  if (unmetType === "permission-granted") {
    return "Grant the required desktop permission in Settings.";
  }
  if (unmetType === "plugin-loaded") {
    return "Finish extension setup in Settings.";
  }
  return "Finish setup in Settings.";
}

export function getComposerExtensionReadiness(
  entry: McpDirectoryInfo,
  context: ComposerExtensionReadinessContext,
): ComposerExtensionReadiness {
  const extensionId = entry.id ?? entry.serverName ?? entry.name;
  if (!context.enabled || !isExtensionVisibleAtLaunch(extensionId)) {
    return { visible: false, ready: false, setupMessage: null };
  }
  if (!isPlatformSupported(entry, context.desktopRuntime)) {
    return { visible: false, ready: false, setupMessage: null };
  }

  const conditions = entry.extensionManifest?.enablement;
  if (!conditions?.length) {
    return { visible: true, ready: true, setupMessage: null };
  }

  const enablement = evaluateEnablement(conditions, {
    connectedProviders: new Set(context.connectedProviderIds ?? []),
    configuredEnvKeys: new Set(context.configuredEnvKeys ?? []),
    loadedPlugins: new Set(context.loadedPlugins ?? []),
    mcpStatuses: context.mcpStatuses,
    isToggleEnabled: (ref) => ref === extensionId && context.enabled,
  });
  if (enablement.active) {
    return { visible: true, ready: true, setupMessage: null };
  }

  const unmetType = enablement.results.find((result) => !result.met)?.condition.type;
  return {
    visible: true,
    ready: false,
    setupMessage: setupMessageFor(entry, unmetType),
  };
}
