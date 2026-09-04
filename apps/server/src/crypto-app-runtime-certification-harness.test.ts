import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import {
  runCryptoAppRuntimeCertificationHarness,
  type MatterhornCryptoAppRuntimeProbeDriver,
} from "./crypto-app-runtime-certification-harness.js";
import { verifyCryptoAppRuntimeCertificationReport } from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";

const keys = generateKeyPairSync("ed25519");

function manifest(): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.sui",
    displayName: "Sui",
    description: "Sui testnet transaction preparation.",
    manifestRevision: "1.0.0",
    publisher: { id: "matterhorn", keyId: "publisher-1", algorithm: "ed25519", signature: "pending" },
    transport: { kind: "matterhorn_sdk", endpoint: "https://gateway.matterhorn.so/apps/sui" },
    authentication: { type: "wallet_connection", scopes: ["sui:prepare"] },
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [{
      id: "prepare_transfer",
      title: "Prepare transfer",
      description: "Prepare and simulate a transfer for wallet review.",
      access: "prepare",
      risk: "financial_high",
      inputSchema: { type: "object", additionalProperties: false },
      outputProjectionSchema: { type: "object", additionalProperties: false },
      requiredScopes: ["sui:prepare"],
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

function fixture() {
  const value = manifest();
  const staticReport = runCryptoAppManifestConformance(value, {
    publisherKey: keys.publicKey,
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  return { value, staticReport };
}

function passingDriver(seen: string[] = []): MatterhornCryptoAppRuntimeProbeDriver {
  return {
    runProbe: async ({ probeId, expectedActionIds, signal }) => {
      expect(signal.aborted).toBe(false);
      seen.push(probeId);
      return {
        assertions: [{
          id: `${probeId}_passed`,
          passed: true,
          observationHash: sha256({ probeId, expectedActionIds, result: "pass" }),
        }],
      };
    },
  };
}

describe("crypto app runtime certification harness", () => {
  test("runs every required probe and emits only hash-bound evidence", async () => {
    const { value, staticReport } = fixture();
    const seen: string[] = [];
    const report = await runCryptoAppRuntimeCertificationHarness({
      manifest: value,
      staticReport,
      driver: passingDriver(seen),
      now: () => new Date("2026-09-01T12:01:00.000Z"),
    });
    expect(seen).toEqual(report.requiredProbeIds);
    expect(report.passed).toBe(true);
    expect(verifyCryptoAppRuntimeCertificationReport(report, value, staticReport)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("result");
    expect(report.probes.every((probe) => probe.evidenceHash.length === 64)).toBe(true);
  });

  test("fails the report for a failed or malformed probe without storing raw errors", async () => {
    const { value, staticReport } = fixture();
    const report = await runCryptoAppRuntimeCertificationHarness({
      manifest: value,
      staticReport,
      driver: {
        runProbe: async ({ probeId }) => {
          if (probeId === "schema_drift") return {
            assertions: [{ id: "schema_rejected", passed: false, observationHash: sha256("rejected") }],
          };
          if (probeId === "untrusted_output") throw new Error("raw secret should never be retained");
          return passingDriver().runProbe({
            probeId,
            manifest: value,
            expectedActionIds: ["prepare_transfer"],
            signal: new AbortController().signal,
          });
        },
      },
    });
    expect(report.passed).toBe(false);
    expect(report.probes.find((probe) => probe.id === "schema_drift")?.passed).toBe(false);
    expect(report.probes.find((probe) => probe.id === "untrusted_output")?.passed).toBe(false);
    expect(JSON.stringify(report)).not.toContain("raw secret");
  });

  test("aborts a timed-out probe and continues with a failed bounded result", async () => {
    const { value, staticReport } = fixture();
    let aborted = false;
    const report = await runCryptoAppRuntimeCertificationHarness({
      manifest: value,
      staticReport,
      probeTimeoutMs: 5,
      driver: {
        runProbe: async ({ probeId, signal }) => {
          if (probeId !== "timeout_abort") return {
            assertions: [{ id: "bounded", passed: true, observationHash: sha256(probeId) }],
          };
          return new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              resolve({ assertions: [{ id: "aborted", passed: true, observationHash: sha256("aborted") }] });
            }, { once: true });
          });
        },
      },
    });
    expect(aborted).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.probes.find((probe) => probe.id === "timeout_abort")?.passed).toBe(false);
  });

  test("does not execute runtime probes for an invalid static report", async () => {
    const { value, staticReport } = fixture();
    let calls = 0;
    await expect(runCryptoAppRuntimeCertificationHarness({
      manifest: value,
      staticReport: { ...staticReport, manifestHash: "0".repeat(64) },
      driver: { runProbe: async () => { calls += 1; return { assertions: [] }; } },
    })).rejects.toEqual(expect.objectContaining({
      code: "static_report_invalid",
    }));
    expect(calls).toBe(0);
  });
});
