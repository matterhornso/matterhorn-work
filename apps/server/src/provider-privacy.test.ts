import { describe, expect, test } from "bun:test";

import {
  buildProviderPrivacySummary,
  providerPrivacyEnforcementMode,
  resolveProviderPrivacyPolicy,
} from "./provider-privacy.js";

const verifiedCudosEnvironment = {
  MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only",
  MATTERHORN_CUDOS_TRAINING_USE: "none",
  MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS: "0",
  MATTERHORN_CUDOS_PRIVACY_POLICY_URL: "https://provider.example/privacy",
  MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT: "2026-08-10T00:00:00.000Z",
};

describe("provider privacy policy", () => {
  test("uses disclosure mode outside the public signup gate", () => {
    expect(providerPrivacyEnforcementMode({})).toBe("disclosure");
    expect(resolveProviderPrivacyPolicy("openai", "OpenAI", {}).allowed).toBe(
      true,
    );
  });

  test("forces verified-only enforcement whenever public signups are enabled", () => {
    expect(
      providerPrivacyEnforcementMode({
        MATTERHORN_SIGNUPS_ENABLED: "true",
        MATTERHORN_PROVIDER_PRIVACY_MODE: "disclosure",
      }),
    ).toBe("verified_only");
  });

  test("blocks an unverified hosted provider in verified-only mode", () => {
    const policy = resolveProviderPrivacyPolicy("cudos", "CUDOS / ASI:Cloud", {
      MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only",
    });

    expect(policy.status).toBe("unverified");
    expect(policy.allowed).toBe(false);
  });

  test("allows CUDOS only when no-training, retention, policy, and review are current", () => {
    const policy = resolveProviderPrivacyPolicy(
      "cudos",
      "CUDOS / ASI:Cloud",
      verifiedCudosEnvironment,
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(policy).toMatchObject({
      status: "verified_no_training",
      trainingUse: "none",
      retentionDays: 0,
      allowed: true,
      label: "No training verified",
    });
  });

  test("rejects stale verification evidence", () => {
    const policy = resolveProviderPrivacyPolicy(
      "cudos",
      "ASI:Cloud",
      {
        ...verifiedCudosEnvironment,
        MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT: "2025-01-01T00:00:00.000Z",
      },
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(policy.status).toBe("unverified");
    expect(policy.allowed).toBe(false);
  });

  test("keeps local model processing available", () => {
    const policy = resolveProviderPrivacyPolicy("ollama", "Ollama", {
      MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only",
    });

    expect(policy).toMatchObject({
      status: "local_processing",
      trainingUse: "none",
      allowed: true,
    });
  });

  test("reports one policy per provider without prompt content", () => {
    const summary = buildProviderPrivacySummary(
      [
        {
          id: "cudos",
          name: "CUDOS / ASI:Cloud",
          source: "env",
          connected: true,
          modelCount: 1,
          modelIds: ["asi1-mini"],
          sampleModels: ["asi1-mini"],
        },
      ],
      verifiedCudosEnvironment,
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(summary.matterhornTrainingUse).toBe("none");
    expect(summary.enforcementMode).toBe("verified_only");
    expect(summary.providers).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toContain("promptText");
  });
});
