import { describe, expect, test } from "bun:test";

import { cryptoCoworkerFeatureConfig } from "./crypto-coworker-config.js";

describe("crypto coworker feature configuration", () => {
  test("defaults every new surface off without changing readiness", () => {
    expect(cryptoCoworkerFeatureConfig({})).toEqual({
      cryptoAppGatewayMode: "off",
      coworkerMode: "off",
      walrusEvidenceMode: "off",
      ready: true,
      issues: [],
    });
  });

  test("fails closed on unknown mode values", () => {
    const result = cryptoCoworkerFeatureConfig({
      MATTERHORN_CRYPTO_APP_GATEWAY_MODE: "unsafe",
      MATTERHORN_COWORKER_MODE: "everyone",
      MATTERHORN_WALRUS_EVIDENCE_MODE: "automatic",
    });
    expect(result).toMatchObject({
      cryptoAppGatewayMode: "off",
      coworkerMode: "off",
      walrusEvidenceMode: "off",
      ready: false,
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      "crypto_app_gateway_mode_invalid",
      "coworker_mode_invalid",
      "walrus_evidence_mode_invalid",
    ]));
  });

  test("does not allow public coworkers without enforced guarded boundaries", () => {
    const result = cryptoCoworkerFeatureConfig({
      MATTERHORN_CRYPTO_APP_GATEWAY_MODE: "shadow",
      MATTERHORN_COWORKER_MODE: "public",
      MATTERHORN_GUARDED_RUNTIME_MODE: "shadow",
      MATTERHORN_SIGNUPS_ENABLED: "true",
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("coworker_rollout_requires_enforced_gateway");
  });

  test("requires encrypted authenticated Walrus publication configuration", () => {
    const missing = cryptoCoworkerFeatureConfig({
      MATTERHORN_WALRUS_EVIDENCE_MODE: "mainnet",
    });
    expect(missing.ready).toBe(false);
    expect(missing.issues).toEqual(expect.arrayContaining([
      "walrus_publisher_https_required",
      "walrus_aggregator_https_required",
      "walrus_publisher_auth_required",
      "walrus_encryption_key_id_required",
      "walrus_mainnet_acknowledgement_required",
    ]));

    const configured = cryptoCoworkerFeatureConfig({
      MATTERHORN_WALRUS_EVIDENCE_MODE: "testnet",
      MATTERHORN_WALRUS_PUBLISHER_URL: "https://publisher.example.test",
      MATTERHORN_WALRUS_AGGREGATOR_URL: "https://aggregator.example.test",
      MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN: "server-only-test-token",
      MATTERHORN_WALRUS_ENCRYPTION_KEY_ID: "kms://matterhorn/testnet-evidence",
    });
    expect(configured).toMatchObject({ walrusEvidenceMode: "testnet", ready: true, issues: [] });
  });
});
