import { describe, expect, test } from "bun:test";

import {
  filterLaunchSettingsTabs,
  isExtensionVisibleAtLaunch,
  isPublicOauthConnectorEnabledAtLaunch,
  isSettingsTabRouteEnabledAtLaunch,
  isSettingsTabVisibleAtLaunch,
  resolveMatterhornLaunchFeaturePolicy,
} from "../src/app/lib/launch-features";
import { getCloudSettingsTabs } from "../src/react-app/domains/settings/shell/settings-page";

describe("stable launch feature policy", () => {
  test("defaults optional production services off", () => {
    expect(resolveMatterhornLaunchFeaturePolicy(undefined)).toEqual({
      billing: false,
      cloud: false,
      generatedMedia: false,
      publicOauthConnectors: [],
      reviewedDeskActions: true,
    });
  });

  test("accepts explicit production build flags", () => {
    expect(resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_BILLING_ENABLED: "true",
      VITE_MATTERHORN_GENERATED_MEDIA_ENABLED: "1",
    }, true)).toEqual({
      billing: true,
      cloud: true,
      generatedMedia: true,
      publicOauthConnectors: [],
      reviewedDeskActions: true,
    });
  });

  test("fails closed on reviewed desk actions in public Beta until explicitly enabled", () => {
    const publicBetaPolicy = resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_DEPLOYMENT: "web",
      VITE_MATTERHORN_PUBLIC_BETA: "1",
    });
    const ordinaryWebPolicy = resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_DEPLOYMENT: "web",
    });

    expect(publicBetaPolicy.reviewedDeskActions).toBe(false);
    expect(ordinaryWebPolicy.reviewedDeskActions).toBe(true);
  });

  test("enables wallet-reviewed desk actions for an approved public Beta build", () => {
    const policy = resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_DEPLOYMENT: "web",
      VITE_MATTERHORN_PUBLIC_BETA: "1",
      VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED: "true",
    });

    expect(policy.reviewedDeskActions).toBe(true);
  });

  test("keeps launch navigation limited to approved surfaces", () => {
    const stablePolicy = resolveMatterhornLaunchFeaturePolicy(undefined);
    expect(filterLaunchSettingsTabs([
      "preferences",
      "generated-media",
      "extensions",
      "billing",
      "cloud-account",
    ], stablePolicy)).toEqual(["preferences", "extensions"]);
    expect(isSettingsTabVisibleAtLaunch("wallet", stablePolicy)).toBe(true);
    expect(isSettingsTabVisibleAtLaunch("generated-media", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("billing", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("cloud-account", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("advanced", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("debug", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("environment", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("marketplace", stablePolicy)).toBe(false);
    expect(isSettingsTabVisibleAtLaunch("recovery", stablePolicy)).toBe(false);
    expect(getCloudSettingsTabs()).toEqual([]);
  });

  test("blocks stale optional-service routes while preserving the embedded local Profile surface", () => {
    const stablePolicy = resolveMatterhornLaunchFeaturePolicy(undefined);
    expect(isSettingsTabRouteEnabledAtLaunch("cloud-account", stablePolicy)).toBe(false);
    expect(isSettingsTabRouteEnabledAtLaunch("cloud-account", stablePolicy, { allowLocalProfile: true })).toBe(true);
    expect(isSettingsTabRouteEnabledAtLaunch("generated-media", stablePolicy)).toBe(false);
    expect(isSettingsTabRouteEnabledAtLaunch("billing", stablePolicy)).toBe(false);
    expect(isSettingsTabRouteEnabledAtLaunch("cloud-workers", stablePolicy)).toBe(false);
  });

  test("hides generated-media extensions unless the launch flag is enabled", () => {
    const stablePolicy = resolveMatterhornLaunchFeaturePolicy(undefined);
    const mediaPolicy = resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_GENERATED_MEDIA_ENABLED: "1",
    });
    expect(isExtensionVisibleAtLaunch("openai-image-gen", stablePolicy)).toBe(false);
    expect(isExtensionVisibleAtLaunch("openai-image-gen", mediaPolicy)).toBe(true);
    expect(isExtensionVisibleAtLaunch("bittensor", stablePolicy)).toBe(true);
  });

  test("hides the Cloud MCP connector unless Cloud is enabled", () => {
    const stablePolicy = resolveMatterhornLaunchFeaturePolicy(undefined);
    const cloudPolicy = resolveMatterhornLaunchFeaturePolicy(undefined, true);
    expect(isExtensionVisibleAtLaunch("matterhorn-cloud", stablePolicy)).toBe(false);
    expect(isExtensionVisibleAtLaunch("matterhorn-cloud", cloudPolicy)).toBe(true);
    expect(isExtensionVisibleAtLaunch("matterhorn-ui", stablePolicy)).toBe(true);
  });

  test("fails closed for public OAuth connectors until each connector is allowlisted", () => {
    const stablePolicy = resolveMatterhornLaunchFeaturePolicy(undefined);
    const acceptedPolicy = resolveMatterhornLaunchFeaturePolicy({
      VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS: " Notion, linear,notion ",
    });

    expect(isPublicOauthConnectorEnabledAtLaunch("notion", stablePolicy)).toBe(false);
    expect(isPublicOauthConnectorEnabledAtLaunch("notion", acceptedPolicy)).toBe(true);
    expect(isPublicOauthConnectorEnabledAtLaunch("LINEAR", acceptedPolicy)).toBe(true);
    expect(isPublicOauthConnectorEnabledAtLaunch("sentry", acceptedPolicy)).toBe(false);
    expect(acceptedPolicy.publicOauthConnectors).toEqual(["notion", "linear"]);
  });
});
