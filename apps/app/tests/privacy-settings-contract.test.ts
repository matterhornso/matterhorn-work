import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type {
  MatterhornBackendModelsResponse,
  MatterhornProviderPrivacyPolicy,
} from "@matterhorn-work/types/backend-models";

import {
  activeProviderPrivacyPolicies,
  providerPrivacyTone,
  providerRetentionLabel,
  providerVerificationLabel,
} from "../src/react-app/domains/settings/pages/privacy-view";
import {
  getSettingsTabDescription,
  getSettingsTabLabel,
  getSettingsTabStatus,
  getWorkspaceSettingsTabs,
} from "../src/react-app/domains/settings/shell/settings-page";

const verifiedPolicy: MatterhornProviderPrivacyPolicy = {
  providerId: "cudos",
  providerName: "ASI:Cloud",
  status: "verified_no_training",
  trainingUse: "none",
  retentionDays: 0,
  policyUrl: "https://example.com/privacy",
  verifiedAt: "2026-08-11T00:00:00.000Z",
  allowed: true,
  label: "No training verified",
  description: "Provider terms prohibit training with customer prompts.",
};

function modelsFixture(): MatterhornBackendModelsResponse {
  return {
    success: true,
    version: "matterhorn.backend.models.v1",
    generatedAt: "2026-08-11T00:00:00.000Z",
    defaultModel: {
      providerId: "cudos",
      modelId: "asi1-mini",
      source: "server_default",
    },
    catalog: {
      status: "working",
      label: "Model catalog",
      source: "opencode_provider_list",
      serverFetched: true,
      providerCount: 3,
      connectedProviderCount: 2,
      modelCount: 2,
      connectedProviderIds: ["opencode", "cudos"],
      defaultModels: { cudos: "asi1-mini" },
      providers: [
        {
          id: "opencode",
          name: "OpenCode",
          connected: true,
          modelCount: 1,
          modelIds: ["mimo-v2.5-free"],
          sampleModels: ["mimo-v2.5-free"],
        },
        {
          id: "cudos",
          name: "ASI:Cloud",
          connected: true,
          modelCount: 1,
          modelIds: ["asi1-mini"],
          sampleModels: ["asi1-mini"],
        },
        {
          id: "unused",
          name: "Unused provider",
          connected: false,
          modelCount: 1,
          modelIds: ["unused-model"],
          sampleModels: ["unused-model"],
        },
      ],
    },
    routing: {
      answerPath: {
        status: "working",
        label: "Chats and desk tasks",
        transport: "opencode_session_prompt_async",
        requestModelField: "model.providerID_modelID",
      },
      selection: {
        status: "working",
        label: "User-selected model",
        userSelectable: true,
        surface: "model_picker",
        preferenceStore: "server",
        serverPersisted: true,
      },
      registry: {
        status: "working",
        label: "Model catalog",
        source: "opencode_provider_list",
        serverOwned: false,
        clientTool: "opencode_client_provider_list",
        cloudProviderImport: true,
      },
    },
    privacy: {
      trainingUse: "none_by_default",
      feedbackUse: "eval_routing_product_quality_only",
      matterhornTrainingUse: "none",
      enforcementMode: "verified_only",
      providers: [
        { ...verifiedPolicy, providerId: "opencode", providerName: "OpenCode" },
        verifiedPolicy,
        { ...verifiedPolicy, providerId: "unused", providerName: "Unused provider" },
      ],
    },
    limitations: [],
  };
}

describe("Privacy settings", () => {
  test("is a first-class working workspace route", () => {
    expect(getWorkspaceSettingsTabs()).toContain("privacy");
    expect(getSettingsTabLabel("privacy")).toBe("Privacy");
    expect(getSettingsTabDescription("privacy")).toContain("Provider processing");
    expect(getSettingsTabStatus("privacy")).toBe("Working");
  });

  test("shows only connected prompt providers, not the catalog or disconnected entries", () => {
    expect(activeProviderPrivacyPolicies(modelsFixture()).map((policy) => policy.providerId)).toEqual([
      "cudos",
    ]);
  });

  test("fails closed while a rolling backend still returns the pre-privacy payload", () => {
    const legacyModels = {
      ...modelsFixture(),
      privacy: undefined,
    } as unknown as MatterhornBackendModelsResponse;

    expect(activeProviderPrivacyPolicies(legacyModels)).toEqual([]);
  });

  test("makes the complete workspace archive discoverable from Privacy", () => {
    const privacySource = readFileSync(
      new URL(
        "../src/react-app/domains/settings/pages/privacy-view.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const publicPrivacySource = readFileSync(
      new URL(
        "../src/react-app/domains/public/public-trust-route.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(privacySource).toContain("Complete workspace archive");
    expect(privacySource).toContain("client.exportWorkspaceDataArchive(workspaceId)");
    expect(privacySource).toContain("Secrets and authentication material are excluded.");
    expect(privacySource).toContain("Download archive");
    expect(publicPrivacySource).toContain(
      "Download a complete workspace archive from Settings → Privacy.",
    );
    expect(publicPrivacySource).toContain(
      "Settings → Account",
    );
  });

  test("maps verified and blocked policies to explicit states", () => {
    expect(providerPrivacyTone(verifiedPolicy)).toBe("ready");
    expect(providerRetentionLabel(verifiedPolicy)).toBe("No provider retention");
    expect(providerVerificationLabel(verifiedPolicy)).toBe("Verified Aug 11, 2026");

    const blocked = {
      ...verifiedPolicy,
      status: "unverified" as const,
      trainingUse: "unknown" as const,
      retentionDays: null,
      verifiedAt: null,
      allowed: false,
    };
    expect(providerPrivacyTone(blocked)).toBe("error");
    expect(providerRetentionLabel(blocked)).toBe("Retention not verified");
    expect(providerVerificationLabel(blocked)).toBe("Not verified");

    const reviewedProviderPolicy = {
      ...verifiedPolicy,
      status: "opt_in_training" as const,
      trainingUse: "opt_in_only" as const,
      retentionDays: null,
      allowed: true,
      label: "Training opt-in disabled",
    };
    expect(providerPrivacyTone(reviewedProviderPolicy)).toBe("warning");
    expect(providerRetentionLabel(reviewedProviderPolicy)).toBe(
      "Provider-policy retention",
    );
  });
});
