import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { canonicalCryptoAppManifestPayload, cryptoAppManifestHash } from "./crypto-app-signature.js";
import {
  MatterhornCryptoAppRegistryStore,
  MatterhornCryptoAppRegistryStoreError,
} from "./crypto-app-registry-store.js";

const keys = generateKeyPairSync("ed25519");

function manifest(): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.sui",
    displayName: "Sui",
    description: "Sui testnet reads and wallet-reviewed preparation.",
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
  value.publisher.signature = sign(null, Buffer.from(canonicalCryptoAppManifestPayload(value)), keys.privateKey).toString("base64url");
  return value;
}

function databasePath(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `matterhorn-crypto-registry-${label}-`)), "registry.db");
}

describe("durable crypto app registry store", () => {
  test("adds runtime report columns to a legacy registry without weakening certification", () => {
    const path = databasePath("legacy-migration");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE crypto_app_manifests (
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        PRIMARY KEY (app_id, manifest_revision)
      );
      CREATE TABLE crypto_app_certification_history (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        state TEXT NOT NULL,
        report_json TEXT,
        report_hash TEXT,
        policy_version TEXT NOT NULL,
        reason TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (app_id, manifest_revision)
          REFERENCES crypto_app_manifests(app_id, manifest_revision)
      );
    `);
    legacy.close();

    const value = manifest();
    const store = new MatterhornCryptoAppRegistryStore(path);
    store.putManifest({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      manifestHash: cryptoAppManifestHash(value),
      manifest: value,
      registeredAt: "2026-09-01T12:00:00.000Z",
    });
    const event = store.appendCertification({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      state: "suspended",
      report: null,
      reportHash: null,
      runtimeReport: null,
      runtimeReportHash: null,
      policyVersion: "policy-1",
      reason: "awaiting runtime recertification",
      updatedAt: "2026-09-01T12:01:00.000Z",
      expectedPreviousState: "pending",
    });
    expect(event.runtimeReport).toBeNull();
    expect(store.listCertificationHistory(value.appId, value.manifestRevision)[0]?.runtimeReportHash).toBeNull();
    store.close();
  });

  test("persists immutable manifests and append-only certification history", () => {
    const path = databasePath("persist");
    const value = manifest();
    const report = runCryptoAppManifestConformance(value, {
      publisherKey: keys.publicKey,
      policyVersion: "policy-1",
      targetEnvironment: "testnet",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    const runtimeReport = passingCryptoAppRuntimeReportForTest(value, report);
    const first = new MatterhornCryptoAppRegistryStore(path);
    expect(first.putManifest({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      manifestHash: cryptoAppManifestHash(value),
      manifest: value,
      registeredAt: "2026-09-01T12:00:00.000Z",
    })).toBe("inserted");
    first.appendCertification({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      state: "certified_testnet",
      report,
      reportHash: report.reportHash,
      runtimeReport,
      runtimeReportHash: runtimeReport.reportHash,
      policyVersion: "policy-1",
      reason: null,
      updatedAt: "2026-09-01T12:01:00.000Z",
      expectedPreviousState: "pending",
    });
    first.appendCertification({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      state: "revoked",
      report: null,
      reportHash: null,
      runtimeReport: null,
      runtimeReportHash: null,
      policyVersion: "policy-1",
      reason: "publisher key compromise",
      updatedAt: "2026-09-01T12:02:00.000Z",
      expectedPreviousState: "certified_testnet",
    });
    first.close();

    const second = new MatterhornCryptoAppRegistryStore(path);
    expect(second.listManifests()).toHaveLength(1);
    const history = second.listCertificationHistory(value.appId, value.manifestRevision);
    expect(history.map((item) => item.state))
      .toEqual(["certified_testnet", "revoked"]);
    expect(history[0]?.runtimeReportHash).toBe(runtimeReport.reportHash);
    expect(history[0]?.runtimeReport?.probes.every((probe) => probe.evidenceHash.length === 64)).toBe(true);
    expect(history[1]?.runtimeReport).toBeNull();
    second.close();
  });

  test("rejects revision mutation without overwriting the original", () => {
    const store = new MatterhornCryptoAppRegistryStore(databasePath("immutable"));
    const value = manifest();
    const record = {
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      manifestHash: cryptoAppManifestHash(value),
      manifest: value,
      registeredAt: "2026-09-01T12:00:00.000Z",
    };
    expect(store.putManifest(record)).toBe("inserted");
    expect(store.putManifest(record)).toBe("existing");
    expect(() => store.putManifest({
      ...record,
      manifestHash: "different",
    })).toThrowError(MatterhornCryptoAppRegistryStoreError);
    expect(store.listManifests()[0]?.manifestHash).toBe(record.manifestHash);
    store.close();
  });

  test("serializes competing certification transitions", () => {
    const path = databasePath("race");
    const value = manifest();
    const first = new MatterhornCryptoAppRegistryStore(path);
    const second = new MatterhornCryptoAppRegistryStore(path);
    first.putManifest({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      manifestHash: cryptoAppManifestHash(value),
      manifest: value,
      registeredAt: "2026-09-01T12:00:00.000Z",
    });
    first.appendCertification({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      state: "suspended",
      report: null,
      reportHash: null,
      runtimeReport: null,
      runtimeReportHash: null,
      policyVersion: "policy-1",
      reason: "health circuit open",
      updatedAt: "2026-09-01T12:01:00.000Z",
      expectedPreviousState: "pending",
    });
    expect(() => second.appendCertification({
      appId: value.appId,
      manifestRevision: value.manifestRevision,
      state: "revoked",
      report: null,
      reportHash: null,
      runtimeReport: null,
      runtimeReportHash: null,
      policyVersion: "policy-1",
      reason: "stale concurrent decision",
      updatedAt: "2026-09-01T12:01:00.000Z",
      expectedPreviousState: "pending",
    })).toThrowError(expect.objectContaining({ code: "crypto_app_certification_state_conflict" }));
    expect(first.listCertificationHistory(value.appId, value.manifestRevision)).toHaveLength(1);
    first.close();
    second.close();
  });
});
