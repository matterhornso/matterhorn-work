import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  attachCryptoAppManifestSignature,
  buildCryptoAppSigningRequest,
  canonicalCryptoAppManifestPayload as sdkCanonicalPayload,
  type MatterhornUnsignedCryptoAppManifest,
} from "@matterhorn-work/crypto-app-sdk";

import { canonicalCryptoAppManifestPayload, verifyCryptoAppManifestSignature } from "./crypto-app-signature.js";

function draft(): MatterhornUnsignedCryptoAppManifest {
  return {
    appId: "compat.sui-testnet",
    displayName: "Compatibility Sui",
    description: "SDK and server canonical-signature compatibility fixture.",
    manifestRevision: "1.0.0",
    publisher: { id: "compat.publisher", keyId: "compat-key", algorithm: "ed25519" },
    transport: { kind: "openapi", endpoint: "https://compat.example/v1" },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [{
      id: "compat_read",
      title: "Compatibility read",
      description: "Read a bounded public compatibility value.",
      access: "read",
      risk: "informational",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      outputProjectionSchema: { type: "object", additionalProperties: false, properties: {} },
      requiredScopes: [],
      requiresFreshness: false,
      freshnessMaxAgeMs: null,
      timeoutMs: 5_000,
      simulationRequired: false,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: {
      privacyPolicyUrl: "https://compat.example/privacy",
      securityContact: "security@compat.example",
      statusUrl: null,
    },
  };
}

describe("crypto app SDK/server compatibility", () => {
  test("uses byte-identical canonical payloads accepted by the server verifier", () => {
    const signing = buildCryptoAppSigningRequest(draft());
    const keys = generateKeyPairSync("ed25519");
    const manifest = attachCryptoAppManifestSignature(
      draft(),
      sign(null, Buffer.from(signing.canonicalPayload), keys.privateKey).toString("base64url"),
    );
    expect(sdkCanonicalPayload(manifest)).toBe(signing.canonicalPayload);
    expect(canonicalCryptoAppManifestPayload(manifest)).toBe(signing.canonicalPayload);
    expect(verifyCryptoAppManifestSignature(manifest, keys.publicKey)).toBe(true);
  });
});
