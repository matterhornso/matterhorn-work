import { describe, expect, test } from "bun:test";

import { parseSessionError } from "../src/react-app/domains/session/surface/session-surface";

describe("session error copy", () => {
  test("keeps internal engine names out of customer-facing recovery", () => {
    const errors = [
      new Error("OpenCode request failed"),
      new Error('{"code":"opencode_empty_response","message":"OpenCode returned an empty response"}'),
      new Error('{"code":"opencode_invalid_response","message":"OpenCode returned invalid session data"}'),
    ];

    for (const error of errors) {
      const parsed = parseSessionError(error);
      expect(parsed.kind).toBe("generic");
      expect(parsed.retryable).toBe(true);
      expect(parsed.message).toBe("Matterhorn's workspace engine could not complete this request.");
      expect(parsed.detail).toContain("Retry when the workspace engine reconnects");
      expect(`${parsed.message} ${parsed.detail}`).not.toMatch(/OpenCode|opencode_/i);
    }
  });

  test("replaces raw model-not-found diagnostics with actionable copy", () => {
    const parsed = parseSessionError("ProviderModelNotFoundError: model not found");

    expect(parsed.kind).toBe("model-not-found");
    expect(parsed.message).toBe("The selected model is not available.");
    expect(parsed.detail).toContain("Choose another model");
    expect(`${parsed.message} ${parsed.detail}`).not.toContain("ProviderModelNotFoundError");
  });

  test("retains provider and model identity when the structured error is safe", () => {
    const parsed = parseSessionError(JSON.stringify({
      name: "ProviderModelNotFoundError",
      data: { providerID: "matterhorn", modelID: "research-large", suggestions: [] },
    }));

    expect(parsed.kind).toBe("model-not-found");
    expect(parsed.message).toBe("Model matterhorn/research-large is not available.");
  });

  test("replaces provider privacy diagnostics with a clear, non-retryable explanation", () => {
    const parsed = parseSessionError(new Error(JSON.stringify({
      code: "provider_privacy_unverified",
      message: "ASI:Cloud cannot receive prompts until its no-training and retention policy is verified.",
      details: {
        providerId: "cudos",
        privacyStatus: "opt_in_training",
        trainingUse: "opt_in_only",
      },
    })));

    expect(parsed.kind).toBe("privacy-blocked");
    expect(parsed.retryable).toBe(false);
    expect(parsed.message).toBe("ASI:Cloud is not ready to receive prompts.");
    expect(parsed.detail).toContain("No prompt was sent");
    expect(`${parsed.message} ${parsed.detail}`).not.toContain("provider_privacy_unverified");
  });

  test("turns provider timeouts into a clear retry path", () => {
    const parsed = parseSessionError(new Error("TimeoutError: request exceeded response deadline"));

    expect(parsed.kind).toBe("generic");
    expect(parsed.retryable).toBe(true);
    expect(parsed.message).toBe("The model took too long to respond.");
    expect(parsed.detail).toContain("prompt is preserved");
    expect(`${parsed.message} ${parsed.detail}`).not.toContain("TimeoutError");
  });
});
