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

  test("replaces hosted route denials with a safe workspace recovery path", () => {
    const parsed = parseSessionError(new Error(JSON.stringify({
      code: "hosted_operation_not_allowed",
      message: "This operation is not available in Matterhorn web workspaces.",
    })));

    expect(parsed.kind).toBe("generic");
    expect(parsed.retryable).toBe(false);
    expect(parsed.message).toBe("This chat is no longer connected to the current workspace.");
    expect(parsed.detail).toContain("Return to Home");
    expect(`${parsed.message} ${parsed.detail}`).not.toContain("hosted_operation_not_allowed");
  });

  test("does not expose unknown structured API diagnostics", () => {
    const parsed = parseSessionError(new Error(JSON.stringify({
      code: "provider_request_invalid",
      message: "Unrecognized request argument supplied: agent_id",
      details: { internalRoute: "/session/example/prompt_async" },
    })));

    expect(parsed.kind).toBe("generic");
    expect(parsed.retryable).toBe(true);
    expect(parsed.message).toBe("Matterhorn could not complete this request.");
    expect(parsed.detail).toContain("prompt is still available");
    expect(`${parsed.message} ${parsed.detail}`).not.toMatch(/agent_id|prompt_async|provider_request_invalid/);
  });

  test("keeps structured security and allowance failures actionable", () => {
    const secret = parseSessionError(new Error(JSON.stringify({ code: "secret_detected" })));
    expect(secret.kind).toBe("privacy-blocked");
    expect(secret.retryable).toBe(false);
    expect(secret.detail).toContain("Nothing was shared");

    const allowance = parseSessionError(new Error(JSON.stringify({ code: "model_usage_exceeded" })));
    expect(allowance.retryable).toBe(false);
    expect(allowance.message).toContain("model allowance");
    expect(allowance.detail).toContain("reset date");

    const wallet = parseSessionError(new Error(JSON.stringify({ code: "wallet_airlock_required" })));
    expect(wallet.retryable).toBe(false);
    expect(wallet.message).toContain("wallet review");
    expect(wallet.detail).toContain("will not sign or send");
  });

  test("extracts an exact-request privacy challenge from a nested provider error", () => {
    const preflight = {
      version: "matterhorn.agent-privacy-preflight.v1",
      requestHash: "request_hash",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      requestedMode: "public_research",
      effectiveMode: "private_workspace",
      decision: "consent_required",
      provider: {
        id: "cudos",
        name: "ASI:Cloud",
        modelId: "asi1-mini",
        privacyStatus: "unverified",
        trainingUse: "unknown",
        retentionDays: null,
        policyUrl: null,
        dataLeavesMatterhorn: true,
      },
      detectedData: {
        labels: ["workspace_private"],
        categories: ["selected_memory"],
        redactionCount: 0,
      },
      challenge: { id: "challenge_1", expiresAt: "2026-08-18T10:05:00.000Z", singleUse: true },
      reason: "Private context requires one-request consent.",
    };
    const parsed = parseSessionError(new Error(JSON.stringify({
      data: { responseBody: JSON.stringify({ code: "agent_privacy_consent_required", details: preflight }) },
    })));

    expect(parsed.kind).toBe("privacy-consent");
    expect(parsed.privacyPreflight?.requestHash).toBe("request_hash");
    expect(parsed.message).toBe("Share private context with ASI:Cloud once?");
    expect(parsed.detail).toContain("saved memory");
    expect(parsed.detail).toContain("will send it to ASI:Cloud");
    expect(parsed.detail).toContain("has not verified whether the provider uses requests for training");
    expect(parsed.detail).toContain("has not verified how long the provider keeps request data");
    expect(parsed.detail).toContain("only to this exact request");
    expect(parsed.detail).not.toContain("selected_memory");
  });
});
