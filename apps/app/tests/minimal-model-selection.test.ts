import { describe, expect, test } from "bun:test";
import { modelSelectionForSave } from "../src/react-app/domains/settings/pages/minimal-models";

describe("minimal model selection request", () => {
  const saved = { providerId: "provider-a", modelId: "reasoning-model", variant: "high" };

  test("preserves saved reasoning when selecting the same provider and model", () => {
    expect(modelSelectionForSave({ providerId: "provider-a", id: "reasoning-model" }, saved)).toEqual(saved);
    expect(saved.variant).toBe("high");
  });

  test("does not carry reasoning settings to another model", () => {
    expect(modelSelectionForSave({ providerId: "provider-a", id: "other-model" }, saved)).toEqual({
      providerId: "provider-a", modelId: "other-model", variant: null,
    });
  });

  test("treats the same model ID from another provider as a different model", () => {
    expect(modelSelectionForSave({ providerId: "provider-b", id: "reasoning-model" }, saved)).toEqual({
      providerId: "provider-b", modelId: "reasoning-model", variant: null,
    });
  });

  test("keeps provider-default reasoning for the first selection and an existing null variant", () => {
    const model = { providerId: "provider-a", id: "reasoning-model" };
    const defaultSelection = { ...saved, variant: null };
    expect(modelSelectionForSave(model, null)).toEqual(defaultSelection);
    expect(modelSelectionForSave(model, defaultSelection)).toEqual(defaultSelection);
  });
});
