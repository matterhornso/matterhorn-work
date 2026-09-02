import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentPrivacyRequestHash, MatterhornPrivacyFirewall } from "./agent-privacy.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

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
    expect(firewall.validateConsent({
      token: consent.consentToken,
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(true);
    expect(firewall.validateConsent({
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

  test("binds consent to server context, attachment bytes, Memory versions, model, agent, and tools", () => {
    const request = {
      ...baseInput(),
      agentId: "matterhorn-bittensor",
      attachmentIds: ["attachment_1"],
      memoryIds: ["memory_1"],
      authorizationContextHash: "f".repeat(64),
      parts: [
        { type: "text", text: "Compare validators", source: "composer" as const },
        {
          type: "system",
          source: "system" as const,
          label: "public" as const,
          text: "Server-owned desk policy",
        },
        {
          type: "attachment",
          source: "attachment" as const,
          label: "workspace_private" as const,
          name: "notes.txt",
          contentHash: "a".repeat(64),
          sizeBytes: 12,
        },
        {
          type: "memory",
          source: "memory" as const,
          label: "workspace_private" as const,
          contentHash: "b".repeat(64),
          version: "2026-08-20T00:00:00.000Z",
        },
        {
          type: "tool_profile",
          source: "system" as const,
          label: "public" as const,
          contentHash: "c".repeat(64),
        },
      ],
    };
    const hash = agentPrivacyRequestHash(request);
    const mutations = [
      { ...request, modelId: "asi1-large" },
      { ...request, providerId: "ollama" },
      { ...request, agentId: "matterhorn-sui" },
      { ...request, attachmentIds: ["attachment_2"] },
      { ...request, memoryIds: ["memory_2"] },
      { ...request, authorizationContextHash: "0".repeat(64) },
      { ...request, parts: request.parts.map((part, index) => index === 1 ? { ...part, text: "Changed server policy" } : part) },
      { ...request, parts: request.parts.map((part, index) => index === 2 ? { ...part, contentHash: "d".repeat(64) } : part) },
      { ...request, parts: request.parts.map((part, index) => index === 3 ? { ...part, version: "2026-08-20T00:01:00.000Z" } : part) },
      { ...request, parts: request.parts.map((part, index) => index === 4 ? { ...part, contentHash: "e".repeat(64) } : part) },
    ];
    for (const mutation of mutations) {
      expect(agentPrivacyRequestHash(mutation)).not.toBe(hash);
    }
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

  test("persists challenges across restarts and consumes consent atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-privacy-state-"));
    const path = join(root, "state.db");
    const request = { ...baseInput(), memoryIds: ["memory_private"] };
    const firstStore = new MatterhornGuardedRuntimeStateStore(path);
    const first = new MatterhornPrivacyFirewall(firstStore);
    const preflight = first.preflight(request);
    firstStore.close();

    const secondStore = new MatterhornGuardedRuntimeStateStore(path);
    const second = new MatterhornPrivacyFirewall(secondStore);
    const consent = second.confirm({
      challengeId: preflight.response.challenge?.id ?? "",
      requestHash: preflight.response.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    });
    const competingStore = new MatterhornGuardedRuntimeStateStore(path);
    const competing = new MatterhornPrivacyFirewall(competingStore);
    expect(second.consumeConsent({
      token: consent.consentToken,
      requestHash: consent.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(true);
    expect(competing.consumeConsent({
      token: consent.consentToken,
      requestHash: consent.requestHash,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    })).toBe(false);
    secondStore.close();
    competingStore.close();
  });

  test("does not consume exact-request consent when a mutated request is rejected", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-privacy-mutation-"));
    const store = new MatterhornGuardedRuntimeStateStore(join(root, "guarded.db"));
    try {
      const firewall = new MatterhornPrivacyFirewall(store);
      const original = { ...baseInput(), memoryIds: ["memory_private"] };
      const preflight = firewall.preflight(original).response;
      const consent = firewall.confirm({
        challengeId: preflight.challenge!.id,
        requestHash: preflight.requestHash,
        workspaceId: original.workspaceId,
        sessionId: original.sessionId,
      });
      expect(firewall.consumeConsent({
        token: consent.consentToken,
        requestHash: "f".repeat(64),
        workspaceId: original.workspaceId,
        sessionId: original.sessionId,
      })).toBe(false);
      expect(firewall.consumeConsent({
        token: consent.consentToken,
        requestHash: preflight.requestHash,
        workspaceId: original.workspaceId,
        sessionId: original.sessionId,
      })).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
