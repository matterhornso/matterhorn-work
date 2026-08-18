import { describe, expect, test } from "bun:test";
import { MatterhornPrivacyFirewall } from "./agent-privacy.js";

function baseInput() {
  return {
    workspaceId: "ws_guard",
    sessionId: "ses_guard",
    parts: [{ type: "text", text: "Compare Hyperliquid funding rates" }],
    providerId: "cudos",
    modelId: "asi1-mini",
  };
}

describe("agent privacy firewall", () => {
  test("allows disclosed public research without consent", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const result = firewall.preflight(baseInput());
    expect(result.response.decision).toBe("allow");
    expect(result.response.effectiveMode).toBe("public_research");
    expect(result.response.provider.dataLeavesMatterhorn).toBe(true);
  });

  test("keeps an unrelated public chain address in public research mode", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const result = firewall.preflight({
      ...baseInput(),
      parts: [{ type: "text", text: `Research activity for 0x${"1".repeat(40)}` }],
    });
    expect(result.response.effectiveMode).toBe("public_research");
    expect(result.response.decision).toBe("allow");
  });

  test("blocks secrets without echoing their value", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const secret = "never-copy-this-secret-value";
    const result = firewall.preflight({
      ...baseInput(),
      parts: [{ type: "text", text: `private key: ${secret}` }],
    });
    expect(result.response.decision).toBe("blocked");
    expect(result.response.detectedData.labels).toContain("secret");
    expect(JSON.stringify(result.response)).not.toContain(secret);
  });

  test("blocks secret-shaped attachments before provider dispatch", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const result = firewall.preflight({
      ...baseInput(),
      parts: [{ type: "file", name: ".env.production", source: "attachment" }],
      attachmentIds: ["file_secret"],
    });
    expect(result.response.decision).toBe("blocked");
    expect(result.response.detectedData.categories).toContain("secret_attachment");
    expect(JSON.stringify(result.response)).not.toContain(".env.production");
  });

  test("requires one-request consent and invalidates prompt mutation", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const request = { ...baseInput(), memoryIds: ["memory_1"] };
    const preflight = firewall.preflight(request);
    expect(preflight.response.decision).toBe("consent_required");
    const consent = firewall.confirm({
      challengeId: preflight.response.challenge?.id ?? "",
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    });
    expect(firewall.consumeConsent({
      token: consent.consentToken,
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(true);
    expect(firewall.consumeConsent({
      token: consent.consentToken,
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(false);

    const changed = firewall.preflight({ ...request, parts: [{ type: "text", text: "Changed private request" }] });
    const changedConsent = firewall.confirm({
      challengeId: changed.response.challenge?.id ?? "",
      requestHash: changed.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    });
    expect(firewall.consumeConsent({
      token: changedConsent.consentToken,
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(false);
  });

  test("allows private context through a local provider without consent", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const result = firewall.preflight({
      ...baseInput(),
      providerId: "ollama",
      providerName: "Local model",
      memoryIds: ["memory_private"],
    });

    expect(result.response.effectiveMode).toBe("private_workspace");
    expect(result.response.decision).toBe("allow");
    expect(result.response.provider.privacyStatus).toBe("local_processing");
    expect(result.response.provider.dataLeavesMatterhorn).toBe(false);
    expect(result.response.challenge).toBeUndefined();
  });

  test("allows private context through a currently verified no-training provider", () => {
    const keys = [
      "MATTERHORN_CUDOS_TRAINING_USE",
      "MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS",
      "MATTERHORN_CUDOS_PRIVACY_POLICY_URL",
      "MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.MATTERHORN_CUDOS_TRAINING_USE = "none";
      process.env.MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS = "30";
      process.env.MATTERHORN_CUDOS_PRIVACY_POLICY_URL = "https://provider.example/privacy";
      process.env.MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT = "2026-08-18T00:00:00.000Z";
      const firewall = new MatterhornPrivacyFirewall();
      const result = firewall.preflight(
        { ...baseInput(), memoryIds: ["memory_private"] },
        { now: new Date("2026-08-18T12:00:00.000Z") },
      );

      expect(result.response.effectiveMode).toBe("private_workspace");
      expect(result.response.decision).toBe("allow");
      expect(result.response.provider.privacyStatus).toBe("verified_no_training");
      expect(result.response.provider.retentionDays).toBe(30);
      expect(result.response.challenge).toBeUndefined();
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("keeps deterministic text-only policy overhead below 100ms p95", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const durations: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const startedAt = performance.now();
      firewall.preflight({
        ...baseInput(),
        parts: [{ type: "text", text: `Compare public funding rates ${index}` }],
      }, { issueChallenge: false });
      durations.push(performance.now() - startedAt);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY).toBeLessThan(100);
  });

  test("workspace purge invalidates outstanding challenges and consents", () => {
    const firewall = new MatterhornPrivacyFirewall();
    const request = { ...baseInput(), memoryIds: ["memory_private"] };
    const preflight = firewall.preflight(request);
    const purge = firewall.purgeWorkspace(request.workspaceId);
    expect(purge.challenges).toBe(1);
    expect(() => firewall.confirm({
      challengeId: preflight.response.challenge?.id ?? "",
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toThrow("privacy_consent_challenge_invalid");
  });
});
