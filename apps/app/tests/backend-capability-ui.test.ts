import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatterhornBackendCapabilitiesResponse } from "@matterhorn-work/types/backend-capabilities";
import {
  backendCapabilitiesErrorFixture,
  backendCapabilitiesFixtures,
  backendCapabilitiesNeedsSetupFixture,
  backendCapabilitiesPreviewFixture,
  backendCapabilitiesUnsupportedFixture,
  backendCapabilitiesWorkingFixture,
  BackendCapabilitiesSection,
  BackendCapabilityStatusBadge,
  capabilityStatusLabel,
  capabilityStatusTone,
  getBackendCapabilitiesResult,
  walletFamilySigningCopy,
} from "../src/react-app/domains/settings/backend-capabilities";
import { ProfileCapabilityStatus } from "../src/react-app/domains/profile/profile-capability-status";
import {
  getSettingsTabStatus,
  shouldDisplaySettingsReadinessStatus,
} from "../src/react-app/domains/settings/shell/settings-page";

function renderCapabilitiesSection(capabilities: MatterhornBackendCapabilitiesResponse | null, error?: Error | null) {
  return renderToStaticMarkup(
    React.createElement(BackendCapabilitiesSection, { capabilities, error: error ?? null, isLoading: false }),
  );
}

function renderProfile(
  capabilities: MatterhornBackendCapabilitiesResponse | null,
  error?: Error | null,
  cloudAvailable?: boolean,
  compact?: boolean,
) {
  return renderToStaticMarkup(
    React.createElement(ProfileCapabilityStatus, {
      capabilities,
      cloudAvailable,
      compact,
      error: error ?? null,
      isLoading: false,
    }),
  );
}

describe("Backend capability status helpers", () => {
  test("maps statuses to truthful UI labels", () => {
    expect(capabilityStatusLabel("working")).toBe("Working");
    expect(capabilityStatusLabel("needs_setup")).toBe("Needs setup");
    expect(capabilityStatusLabel("preview")).toBe("Limited release");
    expect(capabilityStatusLabel("unsupported")).toBe("Not supported here");
    expect(capabilityStatusLabel("error")).toBe("Unavailable");
    expect(capabilityStatusLabel("unavailable")).toBe("Unavailable");
  });

  test("maps statuses to UI tones", () => {
    expect(capabilityStatusTone("working")).toBe("ready");
    expect(capabilityStatusTone("needs_setup")).toBe("setup");
    expect(capabilityStatusTone("preview")).toBe("preview");
    expect(capabilityStatusTone("unsupported")).toBe("neutral");
    expect(capabilityStatusTone("error")).toBe("error");
    expect(capabilityStatusTone("unavailable")).toBe("neutral");
  });

  test("does not describe Sui as unimplemented when direct connect is unsupported in a runtime", () => {
    const copy = walletFamilySigningCopy({
      ...backendCapabilitiesWorkingFixture.wallets.families.sui,
      status: "unsupported",
      directConnect: false,
    });

    expect(copy.label).toBe("Not supported here");
    expect(copy.hint).toContain("Sui direct wallet connect is not available in this runtime.");
    expect(copy.hint).toContain("Transaction drafts and receipt evidence remain available");
    expect(copy.hint).not.toContain("not implemented");
  });
});

describe("Backend capability fixtures", () => {
  test("working fixture preserves product truths", () => {
    const f = backendCapabilitiesWorkingFixture;
    expect(f.models.defaultModel).toEqual({ providerId: "opencode", modelId: "big-pickle" });
    expect(f.models.providerListSource).toBe("opencode");
    expect(f.memory.scope).toBe("machine_global");
    expect(f.notes.scope).toBe("workspace");
    expect(f.wallets.families.evm.directConnect).toBe(true);
    expect(f.wallets.families.evm.signing).toBe("client_wallet");
    expect(f.wallets.families.sui.status).toBe("preview");
    expect(f.wallets.families.sui.directConnect).toBe(true);
    expect(f.wallets.families.sui.signing).toBe("client_wallet");
    expect(f.wallets.families.bittensor.publicRead).toBe(true);
    expect(f.wallets.families.bittensor.signing).toBe("external_signer");
    expect(f.wallets.families.bittensor.custody).toBe(false);
    const feedback = f.settings.find((s) => s.section === "feedback");
    expect(feedback?.status).toBe("working");
    const wallet = f.settings.find((s) => s.section === "wallet");
    expect(wallet?.route).toBe("/settings/wallet");
    expect(wallet?.workspaceScoped).toBe(true);
    expect(wallet?.backendDependencies).toContain("/api/backend/capabilities");
    expect(wallet?.primaryAction?.href).toBe("/settings/wallet");
  });

  test("needs_setup fixture marks profile and wallet", () => {
    const f = backendCapabilitiesNeedsSetupFixture;
    expect(f.models.status).toBe("needs_setup");
    expect(f.wallets.families.evm.status).toBe("needs_setup");
    const profile = f.settings.find((s) => s.section === "profile");
    expect(profile?.status).toBe("needs_setup");
  });

  test("preview fixture marks teams and sui", () => {
    const f = backendCapabilitiesPreviewFixture;
    expect(f.teams.cloudTeams.status).toBe("preview");
    expect(f.wallets.families.sui.status).toBe("preview");
  });

  test("unsupported fixture marks feedback", () => {
    const f = backendCapabilitiesUnsupportedFixture;
    const feedback = f.settings.find((s) => s.section === "feedback");
    expect(feedback?.status).toBe("unsupported");
  });

  test("error fixture marks models and security", () => {
    const f = backendCapabilitiesErrorFixture;
    expect(f.models.status).toBe("error");
    const security = f.settings.find((s) => s.section === "security");
    expect(security?.status).toBe("error");
  });
});

describe("Settings tab capability status mapping", () => {
  test("uses truthful fallback states while live capabilities are loading", () => {
    expect(getSettingsTabStatus("ai")).toBe("Working");
    expect(getSettingsTabStatus("wallet")).toBe("Preview");
    expect(getSettingsTabStatus("generated-media")).toBe("Preview");
    expect(getSettingsTabStatus("cloud-account")).toBe("Local only");
    expect(getSettingsTabStatus("billing")).toBe("Preview only");
  });

  test("uses backend settings sections instead of static readiness labels", () => {
    const sections = backendCapabilitiesNeedsSetupFixture.settings;

    expect(getSettingsTabStatus("wallet", sections)).toBe("Connect wallet");
    expect(getSettingsTabStatus("generated-media", sections)).toBe("Platform setup");
    expect(getSettingsTabStatus("billing", sections)).toBe("Preview only");
    expect(getSettingsTabStatus("cloud-account", sections)).toBe("Configure cloud");
    expect(getSettingsTabStatus("permissions", sections)).toBe("Working");
    expect(getSettingsTabStatus("extensions", sections)).toBe("Working");
    expect(getSettingsTabStatus("appearance", sections)).toBe("Working");
  });

  test("rolls multiple backend sections up to the most actionable status", () => {
    const sections = backendCapabilitiesWorkingFixture.settings.map((section) => {
      if (section.section === "models") return { ...section, status: "needs_setup" as const };
      if (section.section === "providers") return { ...section, status: "working" as const };
      if (section.section === "wallet") return { ...section, status: "preview" as const };
      if (section.section === "billing") return { ...section, status: "needs_setup" as const };
      return section;
    });

    expect(getSettingsTabStatus("ai", sections)).toBe("Connect provider");
    expect(getSettingsTabStatus("wallet", sections)).toBe("Preview");
    expect(getSettingsTabStatus("billing", sections)).toBe("Platform setup");
  });

  test("distinguishes functional local settings from operator-owned preview surfaces", () => {
    const sections = backendCapabilitiesWorkingFixture.settings.map((section) => {
      if (section.section === "security") return { ...section, status: "preview" as const };
      if (section.section === "teams") return { ...section, status: "preview" as const };
      if (section.section === "billing") return { ...section, status: "preview" as const };
      return section;
    });

    expect(getSettingsTabStatus("permissions", sections)).toBe("Working");
    expect(getSettingsTabStatus("cloud-account", sections)).toBe("Local only");
    expect(getSettingsTabStatus("billing", sections)).toBe("Preview only");
  });

  test("keeps healthy and informational states silent in settings navigation", () => {
    expect(shouldDisplaySettingsReadinessStatus("Working")).toBe(false);
    expect(shouldDisplaySettingsReadinessStatus("Preview")).toBe(false);
    expect(shouldDisplaySettingsReadinessStatus("Desktop only")).toBe(false);
    expect(shouldDisplaySettingsReadinessStatus("Connect provider")).toBe(true);
    expect(shouldDisplaySettingsReadinessStatus("Platform setup")).toBe(true);
    expect(shouldDisplaySettingsReadinessStatus("Local only")).toBe(true);
    expect(shouldDisplaySettingsReadinessStatus("Preview only")).toBe(true);
    expect(shouldDisplaySettingsReadinessStatus("Not supported here")).toBe(true);
  });
});

describe("Backend capability status badge", () => {
  test.each([
    ["working", "Working"],
    ["needs_setup", "Needs setup"],
    ["preview", "Limited release"],
    ["unsupported", "Not supported here"],
    ["error", "Unavailable"],
    ["unavailable", "Unavailable"],
  ] as const)("renders %s badge with label %s", (status, expected) => {
    const html = renderToStaticMarkup(React.createElement(BackendCapabilityStatusBadge, { status }));
    expect(html).toContain(expected);
  });
});

describe("Backend capabilities section renders all capability states", () => {
  test("working state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesWorkingFixture);
    expect(html).toContain("Working");
    expect(html).toContain("opencode/big-pickle");
    expect(html).toContain("Image and NFT publishing");
    expect(html).toContain("Image generation");
    expect(html).toContain("mock/mock-image-1");
    expect(html).toContain("Walrus storage");
    expect(html).toContain("Publisher/relay needed");
    expect(html).toContain("Required setup");
    expect(html).toContain("MATTERHORN_WALRUS_PUBLISHER_URL");
    expect(html).toContain("MATTERHORN_WALRUS_RELAY_URL");
    expect(html).toContain("Sui NFT minting");
    expect(html).toContain("Sui testnet");
    expect(html).toContain("MATTERHORN_SUI_NFT_PACKAGE_ID");
    expect(html).toContain("NFT marketplace listing");
    expect(html).toContain("Kiosk/TransferPolicy needed");
    expect(html).toContain("MATTERHORN_SUI_KIOSK_PACKAGE_ID");
    expect(html).toContain("Connect here");
    expect(html).toContain("Read here · Prepare only");
    expect(html).toContain("Connect here · Limited release");
    expect(html).toContain("Machine / global");
    expect(html).toContain("Structured feedback is stored locally for evaluation, routing, and product quality only.");
    expect(html).toContain("Route: /settings/wallet");
    expect(html).toContain("backend dependencies");
    expect(html).not.toContain("Today feedback is still a link");
  });

  test("needs_setup state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesNeedsSetupFixture);
    expect(html).toContain("Needs setup");
    expect(html).toContain("EVM wallet");
    expect(html).toContain("Connect here · Limited release");
  });

  test("preview state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesPreviewFixture);
    expect(html).toContain("Limited release");
    expect(html).toContain("Cloud teams");
    expect(html).toContain("Sui wallet");
    expect(html).toContain("Structured feedback is in preview.");
    expect(html).not.toContain("Today feedback is still a link");
  });

  test("unsupported state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesUnsupportedFixture);
    expect(html).toContain("Not supported here");
    expect(html).toContain("Feedback");
  });

  test("error state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesErrorFixture);
    expect(html).toContain("Unavailable");
    expect(html).toContain("Could not reach the model provider list.");
  });

  test("unavailable state", () => {
    const html = renderCapabilitiesSection(null, new Error("Backend unreachable"));
    expect(html).toContain("Unavailable");
    expect(html).toContain("Backend unreachable");
  });

  test("loading state", () => {
    const html = renderToStaticMarkup(React.createElement(BackendCapabilitiesSection, { capabilities: null, isLoading: true }));
    expect(html).toContain("Loading backend capabilities");
  });
});

describe("Profile capability status renders all states", () => {
  test("working profile", () => {
    const html = renderProfile(backendCapabilitiesWorkingFixture);
    expect(html).toContain("Profile");
    expect(html).toContain("Cloud account");
    expect(html).toContain("Local teammate access");
    expect(html).toContain("Cloud teammates");
    expect(html).toContain("Local token sharing works. Cloud teams are in preview.");
    expect(html).toContain("Backend version");
    expect(html).toContain(backendCapabilitiesWorkingFixture.server.version);
  });

  test("disabled Cloud is distinct from the working local profile", () => {
    const html = renderProfile(backendCapabilitiesWorkingFixture, null, false);
    expect(html).toContain("Local teammate access");
    expect(html).toContain("Working");
    expect(html).not.toContain("Cloud account");
    expect(html).not.toContain("Cloud teammates");
    expect(html).not.toContain("Platform setup");
  });

  test("compact profile prioritizes local capability and hides technical state", () => {
    const html = renderProfile(backendCapabilitiesWorkingFixture, null, false, true);
    expect(html).toContain("Local profile");
    expect(html).toContain("No account is required");
    expect(html).toContain("Preferences and workspace access");
    expect(html).toContain("Local teammate access");
    expect(html).toContain("Technical details");
    expect(html).not.toContain("Cloud account");
    expect(html).not.toContain("Cloud teammates");
  });

  test("needs_setup profile", () => {
    const html = renderProfile({
      ...backendCapabilitiesNeedsSetupFixture,
      teams: {
        ...backendCapabilitiesNeedsSetupFixture.teams,
        cloudTeams: {
          ...backendCapabilitiesNeedsSetupFixture.teams.cloudTeams,
          status: "needs_setup",
        },
      },
    });
    expect(html).toContain("Needs setup");
    expect(html).toContain("Platform setup");
  });

  test("unavailable profile", () => {
    const html = renderProfile(null, new Error("No backend"));
    expect(html).toContain("Profile status unavailable");
    expect(html).toContain("No backend");
  });
});

describe("backend capabilities result resolver", () => {
  test("returns fixture by default", () => {
    const result = getBackendCapabilitiesResult();
    expect(result.data).toBe(backendCapabilitiesFixtures.working);
    expect(result.error).toBeNull();
    expect(result.isLoading).toBe(false);
  });

  test("returns selected fixture", () => {
    const result = getBackendCapabilitiesResult({ fixture: "needsSetup" });
    expect(result.data).toBe(backendCapabilitiesFixtures.needsSetup);
  });

  test("fetch source requires a Matterhorn server client", () => {
    const result = getBackendCapabilitiesResult({ source: "fetch" });
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain("client is required");
  });
});
