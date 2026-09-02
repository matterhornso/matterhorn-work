import { describe, expect, test } from "bun:test";

import { cryptoCoworkerFeatureConfig } from "./crypto-coworker-config.js";

describe("crypto coworker feature configuration", () => {
  test("defaults every new surface off without changing readiness", () => {
    expect(cryptoCoworkerFeatureConfig({})).toEqual({
      cryptoAppGatewayMode: "off",
      coworkerMode: "off",
      walrusEvidenceMode: "off",
      agentFilesMode: "off",
      ready: true,
      issues: [],
    });
  });

  test("fails closed on unknown mode values", () => {
    const result = cryptoCoworkerFeatureConfig({
      MATTERHORN_CRYPTO_APP_GATEWAY_MODE: "unsafe",
      MATTERHORN_COWORKER_MODE: "everyone",
      MATTERHORN_WALRUS_EVIDENCE_MODE: "automatic",
      MATTERHORN_AGENT_FILES_MODE: "public",
    });
    expect(result).toMatchObject({
      cryptoAppGatewayMode: "off",
      coworkerMode: "off",
      walrusEvidenceMode: "off",
      agentFilesMode: "off",
      ready: false,
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      "crypto_app_gateway_mode_invalid",
      "coworker_mode_invalid",
      "walrus_evidence_mode_invalid",
      "agent_files_mode_invalid",
    ]));
  });

  test("requires coworkers and KMS before encrypted Agent Files can start", () => {
    const missing = cryptoCoworkerFeatureConfig({ MATTERHORN_AGENT_FILES_MODE: "encrypted" });
    expect(missing.ready).toBe(false);
    expect(missing.issues).toEqual(expect.arrayContaining([
      "agent_files_require_coworkers",
      "agent_files_kms_region_required",
      "agent_files_kms_key_id_required",
    ]));

    const configured = cryptoCoworkerFeatureConfig({
      MATTERHORN_AGENT_FILES_MODE: "encrypted",
      MATTERHORN_COWORKER_MODE: "internal",
      MATTERHORN_EVIDENCE_KMS_REGION: "us-east-1",
      MATTERHORN_EVIDENCE_KMS_KEY_ID: "alias/matterhorn-agent-files",
    });
    expect(configured).toMatchObject({ agentFilesMode: "encrypted", ready: true, issues: [] });
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
      "evidence_kms_region_required",
      "evidence_kms_key_id_required",
      "walrus_mainnet_acknowledgement_required",
    ]));

    const configured = cryptoCoworkerFeatureConfig({
      MATTERHORN_WALRUS_EVIDENCE_MODE: "testnet",
      MATTERHORN_WALRUS_PUBLISHER_URL: "https://publisher.example.test",
      MATTERHORN_WALRUS_AGGREGATOR_URL: "https://aggregator.example.test",
      MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN: "server-only-test-token",
      MATTERHORN_EVIDENCE_KMS_REGION: "us-east-1",
      MATTERHORN_EVIDENCE_KMS_KEY_ID: "alias/matterhorn-testnet-evidence",
    });
    expect(configured).toMatchObject({ walrusEvidenceMode: "testnet", ready: true, issues: [] });
  });

  test("keeps Agent File publication on one backend instance", () => {
    const result = cryptoCoworkerFeatureConfig({
      MATTERHORN_COWORKER_MODE: "internal",
      MATTERHORN_COWORKER_POLICY_VERSION: "policy-1",
      MATTERHORN_AGENT_FILES_MODE: "encrypted",
      MATTERHORN_WALRUS_EVIDENCE_MODE: "testnet",
      MATTERHORN_WALRUS_PUBLISHER_URL: "https://publisher.example",
      MATTERHORN_WALRUS_AGGREGATOR_URL: "https://aggregator.example",
      MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN: "server-only",
      MATTERHORN_EVIDENCE_KMS_REGION: "us-east-1",
      MATTERHORN_EVIDENCE_KMS_KEY_ID: "alias/test",
      MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT: "2",
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContain("agent_file_walrus_requires_single_instance");
  });
});
