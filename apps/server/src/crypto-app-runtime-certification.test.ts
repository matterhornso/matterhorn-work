import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import {
  buildCryptoAppRuntimeCertificationReport,
  expectedCryptoAppRuntimeProbeActionIds,
  requiredCryptoAppRuntimeCertificationProbes,
  verifyCryptoAppRuntimeCertificationReport,
} from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";

const keys = generateKeyPairSync("ed25519");

function manifest(authentication: MatterhornCryptoAppManifest["authentication"] = {
  type: "wallet_connection",
  scopes: ["sui:prepare"],
}): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.sui",
    displayName: "Sui",
    description: "Sui testnet transaction preparation.",
    manifestRevision: "1.0.0",
    publisher: { id: "matterhorn", keyId: "publisher-1", algorithm: "ed25519", signature: "pending" },
    transport: { kind: "matterhorn_sdk", endpoint: "https://gateway.matterhorn.so/apps/sui" },
    authentication,
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [{
      id: "prepare_transfer",
      title: "Prepare transfer",
      description: "Prepare and simulate a transfer for wallet review.",
      access: "prepare",
      risk: "financial_high",
      inputSchema: { type: "object", additionalProperties: false },
      outputProjectionSchema: { type: "object", additionalProperties: false },
      requiredScopes: authentication.scopes,
      requiresFreshness: true,
      freshnessMaxAgeMs: 30_000,
      timeoutMs: 15_000,
      simulationRequired: true,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
    support: { privacyPolicyUrl: "https://matterhorn.so/privacy", securityContact: "security@matterhorn.so", statusUrl: null },
  };
  value.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(value)),
    keys.privateKey,
  ).toString("base64url");
  return value;
}

function reports(value = manifest()) {
  const staticReport = runCryptoAppManifestConformance(value, {
    publisherKey: keys.publicKey,
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  const runtimeReport = buildCryptoAppRuntimeCertificationReport(value, staticReport, {
    probes: requiredCryptoAppRuntimeCertificationProbes(value).map((id) => ({
      id,
      passed: true,
      evidenceHash: sha256({ id, evidence: "redacted-certification-artifact" }),
      actionIds: expectedCryptoAppRuntimeProbeActionIds(value, id),
    })),
    now: () => new Date("2026-09-01T12:00:30.000Z"),
  });
  return { staticReport, runtimeReport };
}

describe("crypto app runtime certification", () => {
  test("requires the complete adversarial probe set and binds it to the static report", () => {
    const value = manifest();
    const { staticReport, runtimeReport } = reports(value);
    expect(runtimeReport.requiredProbeIds).toEqual([
      "authority_boundary",
      "egress_boundary",
      "tenant_isolation",
      "schema_drift",
      "untrusted_output",
      "timeout_abort",
      "capability_replay",
      "quota_circuit_restart",
      "wallet_only_simulation",
      "auth_confusion",
    ]);
    expect(runtimeReport.passed).toBe(true);
    expect(verifyCryptoAppRuntimeCertificationReport(runtimeReport, value, staticReport)).toBe(true);
    expect(JSON.stringify(runtimeReport)).not.toContain("redacted-certification-artifact");
  });

  test("fails closed for a missing, failed, malformed, or wrong-action probe", () => {
    const value = manifest();
    const staticReport = reports(value).staticReport;
    const required = requiredCryptoAppRuntimeCertificationProbes(value);
    const validProbes = required.map((id) => ({
      id,
      passed: true,
      evidenceHash: sha256({ id }),
      actionIds: expectedCryptoAppRuntimeProbeActionIds(value, id),
    }));
    const missing = buildCryptoAppRuntimeCertificationReport(value, staticReport, { probes: validProbes.slice(1) });
    expect(missing.passed).toBe(false);
    expect(verifyCryptoAppRuntimeCertificationReport(missing, value, staticReport)).toBe(false);

    const failed = buildCryptoAppRuntimeCertificationReport(value, staticReport, {
      probes: validProbes.map((probe) => probe.id === "egress_boundary" ? { ...probe, passed: false } : probe),
    });
    expect(failed.passed).toBe(false);

    const malformed = buildCryptoAppRuntimeCertificationReport(value, staticReport, {
      probes: validProbes.map((probe) => probe.id === "schema_drift" ? { ...probe, evidenceHash: "raw evidence" } : probe),
    });
    expect(malformed.passed).toBe(false);

    const wrongAction = buildCryptoAppRuntimeCertificationReport(value, staticReport, {
      probes: validProbes.map((probe) => probe.id === "timeout_abort" ? { ...probe, actionIds: [] } : probe),
    });
    expect(wrongAction.passed).toBe(false);
  });

  test("detects report mutation and changes requirements by authority and authentication", () => {
    const value = manifest({ type: "none", scopes: [] });
    const { staticReport, runtimeReport } = reports(value);
    expect(runtimeReport.requiredProbeIds).not.toContain("auth_confusion");
    expect(runtimeReport.requiredProbeIds).toContain("wallet_only_simulation");
    expect(verifyCryptoAppRuntimeCertificationReport(
      { ...runtimeReport, policyVersion: "policy-2" },
      value,
      staticReport,
    )).toBe(false);
    expect(verifyCryptoAppRuntimeCertificationReport(
      { ...runtimeReport, reportHash: "0".repeat(64) },
      value,
      staticReport,
    )).toBe(false);
  });

  test("rejects duplicate probe identifiers", () => {
    const value = manifest();
    const staticReport = reports(value).staticReport;
    const probe = {
      id: "authority_boundary" as const,
      passed: true,
      evidenceHash: sha256("evidence"),
      actionIds: ["prepare_transfer"],
    };
    expect(() => buildCryptoAppRuntimeCertificationReport(value, staticReport, { probes: [probe, probe] }))
      .toThrow("crypto_app_runtime_probe_duplicate:authority_boundary");
  });
});
