import { describe, expect, test } from "bun:test";

import { hydrateLocalPreferences } from "../src/react-app/kernel/local-provider";

describe("local preferences", () => {
  test("keeps an explicit cleared model so workspace defaults can govern sends", () => {
    const prefs = hydrateLocalPreferences(
      {
        defaultModel: null,
        modelVariant: "high",
        hasCompletedOnboarding: true,
      },
      { providerID: "opencode", modelID: "big-pickle" },
    );

    expect(prefs.defaultModel).toBeNull();
    expect(prefs.modelVariant).toBe("high");
    expect(prefs.hasCompletedOnboarding).toBe(true);
  });

  test("migrates legacy model preference only when the new preference has no model field", () => {
    const prefs = hydrateLocalPreferences(
      {
        hasCompletedOnboarding: true,
      },
      { providerID: "openai", modelID: "gpt-4.1" },
    );

    expect(prefs.defaultModel).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
    expect(prefs.hasCompletedOnboarding).toBe(true);
  });

  test("leaves fresh installs without a local model override", () => {
    const prefs = hydrateLocalPreferences(null, null);

    expect(prefs.defaultModel).toBeNull();
    expect(prefs.modelVariant).toBeNull();
  });
});
