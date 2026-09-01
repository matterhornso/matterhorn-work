import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  canonicalCryptoAppManifestPayload,
  MatterhornCryptoAppRegistry,
  MatterhornCryptoAppRegistryError,
  verifyCryptoAppManifestSignature,
} from "./crypto-app-registry.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

function unsignedManifest(overrides: Partial<MatterhornCryptoAppManifest> = {}): MatterhornCryptoAppManifest {
  return {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.sui",
    displayName: "Sui",
    description: "Sui reads and wallet-reviewed transaction preparation.",
    manifestRevision: "1.0.0",
    publisher: {
      id: "matterhorn",
      keyId: "publisher-2026-01",
      algorithm: "ed25519",
      signature: "pending",
    },
    transport: {
      kind: "matterhorn_sdk",
      endpoint: "https://gateway.matterhorn.so/apps/sui",
    },
    authentication: {
      type: "wallet_connection",
      scopes: ["sui:read", "sui:prepare"],
    },
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [{
      id: "prepare_transfer",
      title: "Prepare transfer",
      description: "Prepare and simulate an exact transfer for wallet review.",
      access: "prepare",
      risk: "financial_high",
      inputSchema: { type: "object", additionalProperties: false },
      outputProjectionSchema: { type: "object", additionalProperties: false },
      requiredScopes: ["sui:prepare"],
      requiresFreshness: true,
      freshnessMaxAgeMs: 60_000,
      timeoutMs: 15_000,
      simulationRequired: true,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: {
      privacyPolicyUrl: "https://matterhorn.so/privacy",
      securityContact: "security@matterhorn.so",
      statusUrl: "https://status.matterhorn.so",
    },
    ...overrides,
  };
}

function signedManifest(overrides: Partial<MatterhornCryptoAppManifest> = {}): MatterhornCryptoAppManifest {
  const manifest = unsignedManifest(overrides);
  manifest.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(manifest), "utf8"),
    privateKey,
  ).toString("base64url");
  return manifest;
}

function registry(): MatterhornCryptoAppRegistry {
  return new MatterhornCryptoAppRegistry({
    publisherKeys: [{
      publisherId: "matterhorn",
      keyId: "publisher-2026-01",
      algorithm: "ed25519",
      publicKey,
    }],
    policyVersion: "gateway-policy-1",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
}

describe("crypto app signed registry", () => {
  test("verifies the detached signature over the canonical manifest payload", () => {
    const manifest = signedManifest();
    expect(verifyCryptoAppManifestSignature(manifest, publicKey)).toBe(true);

    const tampered = { ...manifest, displayName: "Tampered Sui" };
    expect(verifyCryptoAppManifestSignature(tampered, publicKey)).toBe(false);
  });

  test("registers an immutable pending revision and resolves it only after certification", () => {
    const store = registry();
    const manifest = signedManifest();
    const pending = store.register(manifest);
    expect(pending.certification.state).toBe("pending");
    expect(store.resolve(manifest.appId)).toBeNull();

    const certified = store.updateCertification({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "certified_testnet",
      reportHash: "sha256:certification-report",
    });
    expect(certified.certification.state).toBe("certified_testnet");
    expect(store.resolve(manifest.appId)?.manifestHash).toBe(pending.manifestHash);
  });

  test("rejects untrusted publishers and invalid signatures", () => {
    expect(() => registry().register(signedManifest({
      publisher: {
        id: "untrusted",
        keyId: "publisher-2026-01",
        algorithm: "ed25519",
        signature: "pending",
      },
    }))).toThrowError(MatterhornCryptoAppRegistryError);

    const manifest = signedManifest();
    manifest.publisher.signature = "not-a-valid-signature";
    expect(() => registry().register(manifest)).toThrowError(expect.objectContaining({
      code: "manifest_signature_invalid",
    }));
  });

  test("rejects unsafe advertised authority before signature verification", () => {
    const unsafe = signedManifest({
      actions: [{
        ...unsignedManifest().actions[0],
        id: "submit_transfer",
        access: "prepare",
      }],
    });
    expect(() => registry().register(unsafe)).toThrowError(expect.objectContaining({
      code: "manifest_invalid",
      issues: expect.arrayContaining(["action_submit_authority_forbidden"]),
    }));
  });

  test("rejects revision mutation and makes revocation terminal", () => {
    const store = registry();
    const manifest = signedManifest();
    store.register(manifest);
    expect(store.get(manifest.appId, manifest.manifestRevision)?.manifestHash)
      .toBe(store.register(manifest).manifestHash);

    const mutated = signedManifest({ displayName: "Sui v2 content under v1 revision" });
    expect(() => store.register(mutated)).toThrowError(expect.objectContaining({
      code: "manifest_revision_conflict",
    }));

    store.updateCertification({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "revoked",
      reason: "publisher key compromise",
    });
    expect(store.resolve(manifest.appId)).toBeNull();
    expect(() => store.updateCertification({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "certified_testnet",
    })).toThrowError(expect.objectContaining({ code: "certification_transition_invalid" }));
  });

  test("returns defensive copies so callers cannot mutate registry state", () => {
    const store = registry();
    const manifest = signedManifest();
    const entry = store.register(manifest);
    entry.manifest.displayName = "Client mutation";
    expect(store.get(manifest.appId, manifest.manifestRevision)?.manifest.displayName).toBe("Sui");
  });
});
