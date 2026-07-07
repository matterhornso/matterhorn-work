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
} from "../src/react-app/domains/settings/backend-capabilities";
import { ProfileCapabilityStatus } from "../src/react-app/domains/profile/profile-capability-status";

function renderCapabilitiesSection(capabilities: MatterhornBackendCapabilitiesResponse | null, error?: Error | null) {
  return renderToStaticMarkup(
    React.createElement(BackendCapabilitiesSection, { capabilities, error: error ?? null, isLoading: false }),
  );
}

function renderProfile(capabilities: MatterhornBackendCapabilitiesResponse | null, error?: Error | null) {
  return renderToStaticMarkup(
    React.createElement(ProfileCapabilityStatus, { capabilities, error: error ?? null, isLoading: false }),
  );
}

describe("Backend capability status helpers", () => {
  test("maps statuses to truthful UI labels", () => {
    expect(capabilityStatusLabel("working")).toBe("Working");
    expect(capabilityStatusLabel("needs_setup")).toBe("Needs setup");
    expect(capabilityStatusLabel("preview")).toBe("Preview");
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

describe("Backend capability status badge", () => {
  test.each([
    ["working", "Working"],
    ["needs_setup", "Needs setup"],
    ["preview", "Preview"],
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
    expect(html).toContain("Direct connect");
    expect(html).toContain("Public read / external signer");
    expect(html).toContain("Wallet-standard preview");
    expect(html).toContain("Machine / global");
    expect(html).toContain("Route: /settings/wallet");
    expect(html).toContain("backend dependencies");
  });

  test("needs_setup state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesNeedsSetupFixture);
    expect(html).toContain("Needs setup");
    expect(html).toContain("EVM wallet");
    expect(html).not.toContain("Direct connect");
  });

  test("preview state", () => {
    const html = renderCapabilitiesSection(backendCapabilitiesPreviewFixture);
    expect(html).toContain("Preview");
    expect(html).toContain("Cloud teams");
    expect(html).toContain("Sui wallet");
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

  test("needs_setup profile", () => {
    const html = renderProfile(backendCapabilitiesNeedsSetupFixture);
    expect(html).toContain("Needs setup");
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
