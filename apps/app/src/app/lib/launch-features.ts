import type { SettingsTab } from "../types";
import { MATTERHORN_CLOUD_ENABLED } from "./den";
import { isMatterhornPublicBetaWebDeployment } from "./matterhorn-deployment";

export type MatterhornLaunchFeaturePolicy = {
  billing: boolean;
  cloud: boolean;
  generatedMedia: boolean;
  publicOauthConnectors: string[];
  reviewedDeskActions: boolean;
};

function readBooleanFlag(env: Record<string, unknown> | undefined, key: string): boolean {
  const value = env?.[key];
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

function readListFlag(env: Record<string, unknown> | undefined, key: string): string[] {
  const value = env?.[key];
  if (typeof value !== "string") return [];
  return [...new Set(value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean))];
}

export function resolveMatterhornLaunchFeaturePolicy(
  env: Record<string, unknown> | undefined,
  cloudEnabled = false,
): MatterhornLaunchFeaturePolicy {
  return {
    billing: readBooleanFlag(env, "VITE_MATTERHORN_BILLING_ENABLED"),
    cloud: cloudEnabled,
    generatedMedia: readBooleanFlag(env, "VITE_MATTERHORN_GENERATED_MEDIA_ENABLED"),
    publicOauthConnectors: readListFlag(env, "VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS"),
    reviewedDeskActions: !isMatterhornPublicBetaWebDeployment(env),
  };
}

const BUILD_ENV = typeof import.meta !== "undefined"
  ? import.meta.env as Record<string, unknown> | undefined
  : undefined;

export const MATTERHORN_LAUNCH_FEATURES = resolveMatterhornLaunchFeaturePolicy(
  BUILD_ENV,
  MATTERHORN_CLOUD_ENABLED,
);

const INTERNAL_SETTINGS_TABS = new Set<SettingsTab>([
  "advanced",
  "debug",
  "environment",
  "marketplace",
  "recovery",
  "skills",
]);

export function isSettingsTabVisibleAtLaunch(
  tab: SettingsTab,
  policy: MatterhornLaunchFeaturePolicy = MATTERHORN_LAUNCH_FEATURES,
): boolean {
  if (INTERNAL_SETTINGS_TABS.has(tab)) return false;
  if (tab === "generated-media") return policy.generatedMedia;
  if (tab === "billing") return policy.billing;
  if (["cloud-account", "cloud-marketplaces", "cloud-workers", "cloud-providers"].includes(tab)) {
    return policy.cloud;
  }
  return true;
}

export function isSettingsTabRouteEnabledAtLaunch(
  tab: SettingsTab,
  policy: MatterhornLaunchFeaturePolicy = MATTERHORN_LAUNCH_FEATURES,
  options: { allowLocalProfile?: boolean } = {},
): boolean {
  if (tab === "cloud-account" && options.allowLocalProfile) return true;
  return isSettingsTabVisibleAtLaunch(tab, policy);
}

export function filterLaunchSettingsTabs(
  tabs: SettingsTab[],
  policy: MatterhornLaunchFeaturePolicy = MATTERHORN_LAUNCH_FEATURES,
): SettingsTab[] {
  return tabs.filter((tab) => isSettingsTabVisibleAtLaunch(tab, policy));
}

export function isExtensionVisibleAtLaunch(
  extensionId: string,
  policy: MatterhornLaunchFeaturePolicy = MATTERHORN_LAUNCH_FEATURES,
): boolean {
  if (extensionId === "openai-image-gen") return policy.generatedMedia;
  if (extensionId === "matterhorn-cloud") return policy.cloud;
  return true;
}

export function isPublicOauthConnectorEnabledAtLaunch(
  serverName: string,
  policy: MatterhornLaunchFeaturePolicy = MATTERHORN_LAUNCH_FEATURES,
): boolean {
  return policy.publicOauthConnectors.includes(serverName.trim().toLowerCase());
}
