import { describe, expect, test } from "bun:test";

import {
  createMatterhornCryptoDeveloperClient,
  MatterhornCryptoDeveloperClientError,
} from "./developer-client.js";

const profile = {
  id: "dev_123",
  publisherId: "acme.crypto",
  displayName: "Acme Crypto",
  createdAt: "2026-09-01T00:00:00.000Z",
  keys: [],
};

const submission = {
  appId: "acme-sui",
  manifestRevision: "revision-1",
  manifestHash: "a".repeat(64),
  manifest: {
    appId: "acme-sui",
    displayName: "Acme Sui",
    description: "Testnet-only adapter",
    manifestRevision: "revision-1",
  },
  publisherKeyFingerprint: "b".repeat(64),
  targetEnvironment: "testnet",
  staticReport: {
    version: "matterhorn.crypto-app-conformance.v1",
    appId: "acme-sui",
    manifestRevision: "revision-1",
    manifestHash: "a".repeat(64),
    publisherId: "acme.crypto",
    publisherKeyId: "key-1",
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    generatedAt: "2026-09-01T00:00:00.000Z",
    passed: true,
    findings: [],
    reportHash: "c".repeat(64),
  },
  state: "static_passed",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  certificationRequestedAt: null,
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

describe("Matterhorn crypto developer client", () => {
  test("uses only the signed-in account session and exposes the bounded developer workflow", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createMatterhornCryptoDeveloperClient({
      baseUrl: "https://matterhorn.example",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, init: init ?? {} });
        if (url.endsWith("/status")) return json({
          mode: "shadow",
          status: {
            version: "matterhorn.crypto-developer-status.v1",
            policyVersion: "policy-1",
            enrolled: true,
            publisherKeyReady: true,
            supportedEnvironments: ["testnet"],
            mainnetAvailable: false,
            runtimeCertificationRequired: true,
            submissionCounts: { staticFailed: 0, staticPassed: 1, certificationRequested: 0 },
            nextStep: "request_testnet_certification",
          },
        });
        if (url.endsWith("/profile")) {
          return json({ mode: "shadow", enrolled: true, profile: { ...profile, privateKey: "must-drop" } });
        }
        if (url.endsWith("/enroll")) return json({ mode: "shadow", profile }, 201);
        if (url.endsWith("/publisher-keys")) return json({ mode: "shadow", profile }, 201);
        if (url.endsWith("/certification-request")) {
          return json({ mode: "shadow", submission: { ...submission, state: "certification_requested" } });
        }
        if ((init?.method ?? "GET") === "POST") return json({ mode: "shadow", submission }, 201);
        return json({ mode: "shadow", submissions: [submission] });
      },
    });

    expect((await client.getStatus()).status.nextStep).toBe("request_testnet_certification");
    const fetchedProfile = (await client.getProfile()).profile;
    expect(fetchedProfile?.publisherId).toBe("acme.crypto");
    expect(JSON.stringify(fetchedProfile)).not.toContain("must-drop");
    await client.enroll({ inviteToken: "mhdi_example", publisherId: "acme.crypto", displayName: "Acme Crypto" });
    await client.registerPublisherKey({ keyId: "key-1", algorithm: "ed25519", publicKeyPem: "public-only" });
    expect(await client.listSubmissions()).toHaveLength(1);
    await client.submitTestnetManifest({ appId: "acme-sui" } as never);
    expect((await client.requestTestnetCertification("acme-sui", "revision-1")).state)
      .toBe("certification_requested");

    expect(calls).toHaveLength(7);
    for (const call of calls) {
      expect(call.init.credentials).toBe("include");
      expect(call.init.redirect).toBe("error");
      expect(new Headers(call.init.headers).has("authorization")).toBe(false);
      expect(new Headers(call.init.headers).has("x-matterhorn-host-token")).toBe(false);
    }
    const submissionBody = JSON.parse(String(calls[5]?.init.body));
    expect(submissionBody.targetEnvironment).toBe("testnet");
    expect(JSON.stringify(calls)).not.toContain("privateKey");
  });

  test("rejects unsafe origins, oversized responses, and unbounded server errors", async () => {
    expect(() => createMatterhornCryptoDeveloperClient({ baseUrl: "http://adapter.example" }))
      .toThrowError(expect.objectContaining({ code: "developer_client_configuration_invalid" }));
    expect(() => createMatterhornCryptoDeveloperClient({ baseUrl: "https://user:password@example.com" }))
      .toThrowError(expect.objectContaining({ code: "developer_client_configuration_invalid" }));

    const oversized = createMatterhornCryptoDeveloperClient({
      fetch: async () => new Response("{}", { headers: { "content-length": String(513 * 1_024) } }),
    });
    await expect(oversized.getProfile()).rejects.toMatchObject({ code: "developer_client_response_too_large" });

    const failed = createMatterhornCryptoDeveloperClient({
      fetch: async () => json({
        code: "developer_manifest_invalid",
        issues: [...Array(60)].map((_, index) => `issue-${index}-${"x".repeat(300)}`),
        internalStack: "must-not-surface",
      }, 400),
    });
    try {
      await failed.getProfile();
      throw new Error("expected request failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MatterhornCryptoDeveloperClientError);
      expect(error).toMatchObject({
        code: "developer_client_request_failed",
        status: 400,
        serverCode: "developer_manifest_invalid",
      });
      expect((error as MatterhornCryptoDeveloperClientError).issues).toHaveLength(50);
      expect(JSON.stringify(error)).not.toContain("must-not-surface");
    }
  });
});
