import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  isPrivateModeModel,
  isVerifiedPrivateModePolicy,
  privateModeModelFromProviders,
  standardModeModelFromProviders,
} from "../src/react-app/domains/session/private-model-mode";

describe("private model mode", () => {
  test("selects the first server-approved Venice model only when connected", () => {
    const providers = [
      { id: "cudos", models: { "asi1-mini": {} } },
      {
        id: "venice",
        models: {
          "z-ai-glm-5-3-flash": {},
          "private-tools": {},
        },
      },
    ];

    expect(privateModeModelFromProviders(providers, ["cudos", "venice"])).toEqual({
      providerID: "venice",
      modelID: "z-ai-glm-5-3-flash",
    });
    expect(privateModeModelFromProviders(providers, ["cudos"])).toBeNull();
  });

  test("selects a connected non-private fallback when private mode is turned off", () => {
    const providers = [
      { id: "venice", models: { "private-tools": {} } },
      { id: "cudos", models: { "asi1-mini": {} } },
    ];

    expect(standardModeModelFromProviders(providers, ["venice", "cudos"])).toEqual({
      providerID: "cudos",
      modelID: "asi1-mini",
    });
    expect(standardModeModelFromProviders(providers, ["venice"])).toBeNull();
  });

  test("recognizes Venice selections without treating other providers as private mode", () => {
    expect(isPrivateModeModel({ providerID: "VENICE", modelID: "private-tools" })).toBe(true);
    expect(isPrivateModeModel({ providerID: "cudos", modelID: "asi1-mini" })).toBe(false);
    expect(isPrivateModeModel(null)).toBe(false);
  });

  test("requires a current server proof before the UI claims private mode", () => {
    const policy = {
      providerId: "venice",
      providerName: "Venice Private",
      status: "verified_no_training" as const,
      trainingUse: "none" as const,
      retentionDays: 0,
      policyUrl: "https://docs.venice.ai/overview/privacy",
      verifiedAt: "2026-09-02T12:00:00.000Z",
      verificationExpiresAt: "2026-09-03T12:00:00.000Z",
      verifiedModelIds: ["private-tools"],
      allowed: true,
      label: "Private model · zero retention",
      description: "Verified private model.",
    };

    const model = { providerID: "venice", modelID: "private-tools" };
    expect(isVerifiedPrivateModePolicy(policy, model, Date.parse("2026-09-03T11:59:59.999Z"))).toBe(true);
    expect(isVerifiedPrivateModePolicy(policy, model, Date.parse("2026-09-03T12:00:00.000Z"))).toBe(false);
    expect(isVerifiedPrivateModePolicy({ ...policy, verificationExpiresAt: undefined }, model, Date.parse("2026-09-02T13:00:00.000Z"))).toBe(false);
    expect(isVerifiedPrivateModePolicy({ ...policy, verifiedModelIds: [] }, model, Date.parse("2026-09-02T13:00:00.000Z"))).toBe(false);
    expect(isVerifiedPrivateModePolicy(policy, { ...model, modelID: "removed-private-model" }, Date.parse("2026-09-02T13:00:00.000Z"))).toBe(false);
    expect(isVerifiedPrivateModePolicy({ ...policy, status: "unverified" }, model, Date.parse("2026-09-02T13:00:00.000Z"))).toBe(false);
    expect(isVerifiedPrivateModePolicy({ ...policy, providerId: "cudos" }, model, Date.parse("2026-09-02T13:00:00.000Z"))).toBe(false);
  });

  test("keeps private mode discoverable, accessible, and bound to private workspace mode", () => {
    const composer = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/composer/composer.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const sessionSurface = readFileSync(
      new URL(
        "../src/react-app/domains/session/surface/session-surface.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const sessionRoute = readFileSync(
      new URL(
        "../src/react-app/shell/session-route.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(composer).toContain('"Set up a private model"');
    expect(composer).toContain('"Private model unavailable"');
    expect(composer).toContain('"Private unavailable"');
    expect(composer).toContain('aria-label={props.privateModeEnabled ? "Turn off private model" : "Turn on private model"}');
    expect(composer).toContain('role="switch"');
    expect(composer).toContain("aria-checked={Boolean(props.privateModeEnabled)}");
    expect(composer).toContain('<span>{props.privateModeEnabled ? "Private on" : "Private"}</span>');
    expect(composer).toContain("props.onPrivateModeChange?.(true)");
    expect(sessionSurface).toContain('mode: "private_workspace"');
    expect(sessionSurface).toContain("Private mode · Venice does not retain this prompt or response.");
    expect(sessionSurface).toContain("Matterhorn does not train on your chats");
    expect(sessionRoute).toContain("selectedPrivateModeVerified");
    expect(sessionRoute).toContain("Model privacy not verified");
    expect(sessionRoute).toContain("privateModePrivacyPolicy?.verificationExpiresAt");
  });
});
