import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppResult } from "@matterhorn-work/types/crypto-coworkers";

import { cryptoAppEvidenceIdentity, verifyCryptoAppResultEvidence } from "./crypto-app-evidence-identity.js";

function certifiedResult(): MatterhornCryptoAppResult {
  const candidate: MatterhornCryptoAppResult = {
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.sui-testnet", manifestRevision: "1.0.0", connectionId: "cxc_sui" },
    action: { id: "sui_account_read", access: "read", network: "sui:testnet" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.020Z",
      durationMs: 20,
    },
    observation: {
      source: "Sui testnet gRPC",
      observedAt: "2026-09-01T12:00:00.000Z",
      blockOrVersion: "123",
      ageMs: 0,
      freshnessMaxAgeMs: 30_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"a".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_sui" },
    result: { balanceAtomic: "10" },
  };
  Object.assign(candidate.provenance, cryptoAppEvidenceIdentity({
    appId: candidate.app.id,
    manifestRevision: candidate.app.manifestRevision,
    actionId: candidate.action.id,
    network: candidate.action.network,
    result: candidate.result,
    observation: candidate.observation,
  }));
  return candidate;
}

describe("crypto app evidence identity", () => {
  test("verifies the exact app, action, network, result, source, block and observation time", () => {
    expect(verifyCryptoAppResultEvidence(certifiedResult())).toBe(true);
    const mutations: Array<(result: MatterhornCryptoAppResult) => void> = [
      (result) => { result.app.id = "matterhorn.other"; },
      (result) => { result.app.manifestRevision = "1.0.1"; },
      (result) => { result.action.id = "sui_object_read"; },
      (result) => { result.action.network = "sui:mainnet"; },
      (result) => { (result.result as { balanceAtomic: string }).balanceAtomic = "11"; },
      (result) => { result.observation.source = "other source"; },
      (result) => { result.observation.blockOrVersion = "124"; },
      (result) => { result.observation.observedAt = "2026-09-01T12:00:01.000Z"; },
    ];
    for (const mutate of mutations) {
      const candidate = certifiedResult();
      mutate(candidate);
      expect(verifyCryptoAppResultEvidence(candidate)).toBe(false);
    }
  });

  test("rejects missing, partial and malformed modern proofs", () => {
    const missing = certifiedResult();
    delete missing.provenance.projectionHash;
    delete missing.provenance.observationHash;
    expect(verifyCryptoAppResultEvidence(missing)).toBe(false);

    const partial = certifiedResult();
    delete partial.provenance.observationHash;
    expect(verifyCryptoAppResultEvidence(partial)).toBe(false);

    const malformed = certifiedResult();
    malformed.provenance.projectionHash = "A".repeat(64);
    expect(verifyCryptoAppResultEvidence(malformed)).toBe(false);
  });

  test("keeps identity stable across cache-age and runtime metadata changes", () => {
    const candidate = certifiedResult();
    const before = {
      projectionHash: candidate.provenance.projectionHash,
      observationHash: candidate.provenance.observationHash,
    };
    candidate.observation.ageMs = 15_000;
    candidate.timing.durationMs = 1;
    candidate.metering.costMicros = 10;
    expect(verifyCryptoAppResultEvidence(candidate)).toBe(true);
    expect({
      projectionHash: candidate.provenance.projectionHash,
      observationHash: candidate.provenance.observationHash,
    }).toEqual(before);
  });
});
