import { describe, expect, test } from "bun:test";

import {
  getModelBehaviorCapability,
  getModelBehaviorCapabilityLabel,
  getModelBehaviorOptions,
  getModelBehaviorSummary,
  sanitizeModelBehaviorValue,
} from "../src/app/lib/model-behavior";

type ProviderModel = Parameters<typeof getModelBehaviorSummary>[1];

const reasoningModel = {
  capabilities: { reasoning: true },
  variants: {
    high: {},
    minimal: {},
    xhigh: {},
    none: {},
    medium: {},
    low: {},
  },
} as ProviderModel;

describe("model reasoning effort control", () => {
  test("orders provider levels from fastest to deepest", () => {
    const options = getModelBehaviorOptions("openai", reasoningModel);

    expect(options.map((option) => option.value)).toEqual([
      null,
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(options.every((option) => Boolean(option.label && option.description))).toBe(true);
  });

  test("shows the provider default at a supported middle level", () => {
    const summary = getModelBehaviorSummary("openai", reasoningModel, null);

    expect(summary.title).toBe("Reasoning effort");
    expect(summary.value).toBe("medium");
    expect(summary.label).toBe("Balanced");
  });

  test("preserves supported choices and rejects unsupported values", () => {
    expect(sanitizeModelBehaviorValue("openai", reasoningModel, "high")).toBe("high");
    expect(sanitizeModelBehaviorValue("openai", reasoningModel, "turbo")).toBeNull();
  });

  test("does not expose a fake slider for models without variants", () => {
    const standardModel = {
      capabilities: { reasoning: false },
      variants: {},
    } as ProviderModel;

    const summary = getModelBehaviorSummary("opencode", standardModel, "high");

    expect(summary.options).toEqual([]);
    expect(summary.value).toBeNull();
    expect(summary.label).toBe("Standard");
    expect(getModelBehaviorCapability(standardModel)).toBe("standard");
    expect(getModelBehaviorCapabilityLabel(standardModel)).toBe("Standard");
  });

  test("labels adjustable and built-in reasoning without inventing controls", () => {
    const builtInModel = {
      capabilities: { reasoning: true },
      variants: {},
    } as ProviderModel;

    expect(getModelBehaviorCapability(reasoningModel)).toBe("adjustable");
    expect(getModelBehaviorCapabilityLabel(reasoningModel)).toBe("Adjustable reasoning");
    expect(getModelBehaviorCapability(builtInModel)).toBe("built-in");
    expect(getModelBehaviorCapabilityLabel(builtInModel)).toBe("Built-in reasoning");
    expect(getModelBehaviorOptions("custom", builtInModel)).toEqual([]);
  });
});
