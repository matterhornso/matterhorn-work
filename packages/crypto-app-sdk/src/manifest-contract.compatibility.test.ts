import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION as SERVER_MANIFEST_VERSION,
  type MatterhornCryptoAppAction as ServerAction,
  type MatterhornCryptoAppManifest as ServerManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppAction,
  type MatterhornCryptoAppManifest,
} from "./manifest-contract.js";

type Extends<Left, Right> = [Left] extends [Right] ? true : false;

// These values are deliberately used so package typecheck fails if the
// dependency-free public contract drifts from the server-owned contract.
const localManifestFitsServer: Extends<MatterhornCryptoAppManifest, ServerManifest> = true;
const serverManifestFitsLocal: Extends<ServerManifest, MatterhornCryptoAppManifest> = true;
const localActionFitsServer: Extends<MatterhornCryptoAppAction, ServerAction> = true;
const serverActionFitsLocal: Extends<ServerAction, MatterhornCryptoAppAction> = true;

describe("distributable manifest contract", () => {
  test("stays bidirectionally compatible with the authoritative server contract", () => {
    expect(localManifestFitsServer).toBe(true);
    expect(serverManifestFitsLocal).toBe(true);
    expect(localActionFitsServer).toBe(true);
    expect(serverActionFitsLocal).toBe(true);
    expect(MATTERHORN_CRYPTO_APP_MANIFEST_VERSION).toBe(SERVER_MANIFEST_VERSION);
  });

  test("keeps model submission authority structurally impossible", () => {
    const manifest: MatterhornCryptoAppManifest = {
      version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
      appId: "matterhorn.sui-testnet-read",
      displayName: "Sui testnet read",
      description: "A bounded public testnet read with no signing or submission authority.",
      manifestRevision: "0.1.0",
      publisher: {
        id: "matterhorn",
        keyId: "publisher-1",
        algorithm: "ed25519",
        signature: "detached-signature-placeholder",
      },
      transport: {
        kind: "matterhorn_sdk",
        endpoint: "https://adapter.example.test/v1",
      },
      authentication: { type: "none", scopes: [] },
      networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
      actions: [{
        id: "read_balance",
        title: "Read balance",
        description: "Read one public Sui testnet balance.",
        access: "read",
        risk: "informational",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputProjectionSchema: { type: "object", properties: {}, additionalProperties: false },
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      }],
      support: {
        privacyPolicyUrl: "https://example.test/privacy",
        securityContact: "security@example.test",
        statusUrl: "https://example.test/status",
      },
    };
    expect(validateMatterhornCryptoAppManifest(manifest)).toEqual([]);
  });
});
