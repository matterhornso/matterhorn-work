import { randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  type MatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";

import { encryptMatterhornEvidenceBundle } from "./walrus-evidence-envelope.js";
import {
  buildMatterhornEvidenceMerkleBatch,
  verifyMatterhornEvidenceMerkleProof,
} from "./walrus-evidence-merkle.js";

function bundle(id: string): MatterhornEvidenceBundle {
  return {
    version: MATTERHORN_EVIDENCE_BUNDLE_VERSION,
    id: `evidence_${id}`,
    workspaceIdHash: "a".repeat(64),
    runIdHash: "b".repeat(64),
    coworkerIdHash: "c".repeat(64),
    createdAt: "2026-09-01T00:00:00.000Z",
    retention: { contentClass: "encrypted_user_evidence", deletable: true, expiresAt: null },
    encryption: {
      algorithm: "aes-256-gcm",
      keyReference: `kms://matterhorn/evidence/${id}`,
      recipientKeyIds: ["recipient"],
    },
    receipt: {
      status: "success",
      providerId: "local",
      modelId: "model",
      privacyMode: "transaction",
      consent: "not_required",
      dataCategoryHashes: [],
      redactionCount: 0,
      policyHash: "d".repeat(64),
      toolOutcomeHashes: [],
      evidenceReferenceHashes: [],
      reviewedIntentHashes: [],
      publicChainReceiptHashes: [],
      inputTokens: 1,
      outputTokens: 1,
      responseDurationMs: 1,
    },
  };
}

describe("Walrus evidence Merkle batch", () => {
  test("builds order-independent proofs that verify for odd-sized batches", () => {
    const key = randomBytes(32);
    const envelopes = ["one", "two", "three"].map((id) => encryptMatterhornEvidenceBundle({ bundle: bundle(id), key }));
    const proofs = buildMatterhornEvidenceMerkleBatch(envelopes);
    const reversed = buildMatterhornEvidenceMerkleBatch([...envelopes].reverse());
    expect(new Set(proofs.map((proof) => proof.root)).size).toBe(1);
    expect(proofs.every(verifyMatterhornEvidenceMerkleProof)).toBe(true);
    expect(reversed.map((proof) => proof.root)).toEqual(proofs.map((proof) => proof.root));

    const tampered = { ...proofs[0]!, proof: [...proofs[0]!.proof] };
    tampered.proof[0] = "f".repeat(64);
    expect(verifyMatterhornEvidenceMerkleProof(tampered)).toBe(false);
  });

  test("rejects duplicate ciphertext and declared-leaf mutation", () => {
    const envelope = encryptMatterhornEvidenceBundle({ bundle: bundle("one"), key: randomBytes(32) });
    expect(() => buildMatterhornEvidenceMerkleBatch([envelope, envelope])).toThrow("evidence_merkle_duplicate_ciphertext");
    expect(() => buildMatterhornEvidenceMerkleBatch([{ ...envelope, merkleLeaf: "0".repeat(64) }])).toThrow(
      "evidence_merkle_leaf_mismatch",
    );
  });
});
