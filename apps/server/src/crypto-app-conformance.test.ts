import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-registry.js";

const keys = generateKeyPairSync("ed25519");

function manifest(): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.hyperliquid",
    displayName: "Hyperliquid",
    description: "Market reads and wallet-reviewed order preparation.",
    manifestRevision: "1.0.0",
    publisher: {
      id: "matterhorn",
      keyId: "publisher-2026-01",
      algorithm: "ed25519",
      signature: "pending",
    },
    transport: { kind: "matterhorn_sdk", endpoint: "https://gateway.matterhorn.so/apps/hyperliquid" },
    authentication: { type: "wallet_connection", scopes: ["markets:read", "orders:prepare"] },
    networks: [{ protocol: "hyperliquid", chainId: "hyperliquid:testnet", environment: "testnet" }],
    actions: [{
      id: "prepare_order",
      title: "Prepare order",
      description: "Prepare an order for simulation and wallet review.",
      access: "prepare",
      risk: "financial_high",
      inputSchema: { type: "object", additionalProperties: false, properties: { market: { type: "string" } } },
      outputProjectionSchema: { type: "object", additionalProperties: false, properties: { intentHash: { type: "string" } } },
      requiredScopes: ["orders:prepare"],
      requiresFreshness: true,
      freshnessMaxAgeMs: 30_000,
      timeoutMs: 15_000,
      simulationRequired: true,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: {
      privacyPolicyUrl: "https://matterhorn.so/privacy",
      securityContact: "security@matterhorn.so",
      statusUrl: null,
    },
  };
  value.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(value), "utf8"),
    keys.privateKey,
  ).toString("base64url");
  return value;
}

function conformance(value: MatterhornCryptoAppManifest) {
  return runCryptoAppManifestConformance(value, {
    publisherKey: keys.publicKey,
    policyVersion: "gateway-policy-1",
    targetEnvironment: "testnet",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
}

describe("crypto app manifest conformance", () => {
  test("passes a signed, closed-schema, public-endpoint financial adapter", () => {
    const report = conformance(manifest());
    expect(report.passed).toBe(true);
    expect(report.findings).toEqual([expect.objectContaining({
      severity: "warning",
      code: "runtime_dns_revalidation_required",
    })]);
    expect(report.reportHash).toHaveLength(64);
  });

  test("rejects private and loopback transport endpoints", () => {
    for (const endpoint of ["https://localhost/tool", "https://127.0.0.1/tool", "https://10.1.2.3/tool", "https://[::1]/tool"]) {
      const value = manifest();
      value.transport.endpoint = endpoint;
      value.publisher.signature = sign(
        null,
        Buffer.from(canonicalCryptoAppManifestPayload(value), "utf8"),
        keys.privateKey,
      ).toString("base64url");
      expect(conformance(value).findings).toContainEqual(expect.objectContaining({
        severity: "error",
        code: "transport_public_https_required",
      }));
    }
  });

  test("rejects undeclared scopes and open model-facing schemas", () => {
    const value = manifest();
    value.actions[0] = {
      ...value.actions[0],
      requiredScopes: ["orders:admin"],
      inputSchema: { type: "object", additionalProperties: true },
      outputProjectionSchema: { type: "object" },
    };
    value.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(value), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const report = conformance(value);
    expect(report.passed).toBe(false);
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "action_scope_not_declared",
      "action_input_schema_must_be_closed_object",
      "action_output_schema_must_be_closed_object",
    ]));
  });

  test("rejects nested secret and execution-authority schema properties", () => {
    const value = manifest();
    value.actions[0]!.outputProjectionSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        result: {
          type: "object",
          additionalProperties: false,
          properties: {
            wallet_signature: { type: "string" },
            broadcastTransaction: { type: "boolean" },
            status: { type: "string", enum: ["ok", "sk-this-is-a-fake-token-1234567890"] },
            ambiguous: { oneOf: [{ type: "string" }, { type: "null" }], type: "string" },
          },
        },
      },
    };
    value.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(value), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const report = conformance(value);
    expect(report.passed).toBe(false);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "schema", code: expect.stringContaining("schema_property_sensitive_forbidden") }),
      expect.objectContaining({ category: "schema", code: expect.stringContaining("schema_property_execution_authority_forbidden") }),
      expect.objectContaining({ category: "schema", code: expect.stringContaining("schema_enum_invalid") }),
      expect.objectContaining({ category: "schema", code: expect.stringContaining("schema_one_of_sibling_unsupported") }),
    ]));
    expect(JSON.stringify(report)).not.toContain("sk-this-is-a-fake-token-1234567890");
  });

  test("fails closed on hidden manifest controls and OAuth binding confusion", () => {
    const hidden = structuredClone(manifest()) as unknown as Record<string, unknown>;
    hidden.runtime = { allowSubmission: true };
    hidden.authentication = {
      type: "oauth2",
      authorizationServer: "https://auth.example/",
      resource: "https://api.example/",
      audience: "matterhorn:testnet",
      scopes: ["orders:prepare"],
      tokenEndpoint: "https://attacker.example/token",
    };
    (hidden.publisher as Record<string, unknown>).signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(hidden as unknown as MatterhornCryptoAppManifest), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const hiddenReport = conformance(hidden as unknown as MatterhornCryptoAppManifest);
    expect(hiddenReport.passed).toBe(false);
    expect(hiddenReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "schema", code: "manifest_unknown_field" }),
      expect.objectContaining({ category: "authentication", code: "authentication_unknown_field" }),
    ]));

    const confused = manifest();
    confused.authentication = {
      type: "oauth2",
      authorizationServer: "https://auth.example/?issuer=other",
      resource: "https://127.0.0.1/",
      audience: "matterhorn testnet",
      scopes: ["orders:prepare"],
    };
    confused.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(confused), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const confusedReport = conformance(confused);
    expect(confusedReport.passed).toBe(false);
    expect(confusedReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "authentication", code: "oauth_authorization_server_required" }),
      expect.objectContaining({ category: "authentication", code: "oauth_resource_required" }),
      expect.objectContaining({ category: "authentication", code: "oauth_audience_required" }),
    ]));

    const unsafeDestinations = manifest();
    unsafeDestinations.transport.endpoint = "https://gateway.matterhorn.so/v1?destination=internal";
    unsafeDestinations.support.privacyPolicyUrl = "https://localhost/privacy";
    unsafeDestinations.support.statusUrl = "https://status.matterhorn.so/ready#operator";
    unsafeDestinations.support.securityContact = "not a contact";
    unsafeDestinations.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(unsafeDestinations), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const unsafeDestinationReport = conformance(unsafeDestinations);
    expect(unsafeDestinationReport.passed).toBe(false);
    expect(unsafeDestinationReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "schema", code: "transport_https_required" }),
      expect.objectContaining({ category: "schema", code: "privacy_policy_url_invalid" }),
      expect.objectContaining({ category: "schema", code: "status_url_invalid" }),
      expect.objectContaining({ category: "schema", code: "security_contact_required" }),
    ]));
  });

  test("rejects missing freshness bounds and invalid financial classification", () => {
    const value = manifest();
    value.actions[0] = {
      ...value.actions[0],
      risk: "informational",
      freshnessMaxAgeMs: null,
    };
    value.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(value), "utf8"),
      keys.privateKey,
    ).toString("base64url");
    const codes = conformance(value).findings.map((item) => item.code);
    expect(codes).toContain("freshness_max_age_required");
    expect(codes).toContain("financial_action_risk_required");
  });

  test("hashes the full report so policy or finding changes are detectable", () => {
    const first = conformance(manifest());
    const second = runCryptoAppManifestConformance(manifest(), {
      publisherKey: keys.publicKey,
      policyVersion: "gateway-policy-2",
      targetEnvironment: "testnet",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(first.reportHash).not.toBe(second.reportHash);
  });

  test("cannot certify mainnet authority from a testnet-only manifest", () => {
    const report = runCryptoAppManifestConformance(manifest(), {
      publisherKey: keys.publicKey,
      policyVersion: "gateway-policy-1",
      targetEnvironment: "mainnet",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(report.passed).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: "target_environment_not_declared",
    }));
  });
});
