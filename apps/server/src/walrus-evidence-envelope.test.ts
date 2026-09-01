import { randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  type MatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  decryptMatterhornEvidenceEnvelope,
  encryptMatterhornEvidenceBundle,
} from "./walrus-evidence-envelope.js";

function evidenceBundle(): MatterhornEvidenceBundle {
  return {
    version: MATTERHORN_EVIDENCE_BUNDLE_VERSION,
    id: "evidence_synthetic_testnet_1",
    workspaceIdHash: "sha256:workspace",
    runIdHash: "sha256:run",
    coworkerId: "coworker_risk_monitor",
    createdAt: "2026-09-01T00:00:00.000Z",
    retention: {
      contentClass: "encrypted_user_evidence",
      deletable: true,
      expiresAt: "2027-09-01T00:00:00.000Z",
    },
    encryption: {
      algorithm: "aes-256-gcm",
      keyReference: "kms://matterhorn/synthetic-testnet-key",
      recipientKeyIds: ["synthetic-recipient"],
    },
    receipt: {
      providerId: "synthetic-provider",
      modelId: "synthetic-model",
      privacyMode: "transaction",
      policyHash: "sha256:policy",
      toolOutcomeHashes: ["sha256:tool"],
      evidenceReferenceHashes: ["sha256:source"],
      reviewedIntentHashes: ["sha256:intent"],
      publicChainReceiptHashes: [],
      inputTokens: 10,
      outputTokens: 5,
      responseDurationMs: 50,
    },
    ciphertextHash: "pending-before-envelope",
    walrus: null,
  };
}

describe("Walrus evidence envelope", () => {
  test("encrypts a canonical bundle before any publisher can receive it", () => {
    const bundle = evidenceBundle();
    const key = randomBytes(32);
    const envelope = encryptMatterhornEvidenceBundle({ bundle, key });

    expect(envelope.version).toBe("matterhorn.encrypted-evidence-envelope.v1");
    expect(envelope.ciphertext).not.toContain(bundle.coworkerId);
    expect(envelope.ciphertext).not.toContain(bundle.receipt.providerId);
    expect(envelope.ciphertextHash).toHaveLength(64);
    expect(envelope.merkleLeaf).toHaveLength(64);
    expect(decryptMatterhornEvidenceEnvelope({ envelope, key })).toEqual(bundle);
  });

  test("fails authentication with the wrong key or modified ciphertext", () => {
    const key = randomBytes(32);
    const envelope = encryptMatterhornEvidenceBundle({ bundle: evidenceBundle(), key });
    expect(() => decryptMatterhornEvidenceEnvelope({ envelope, key: randomBytes(32) })).toThrow();

    const modified = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
    expect(() => decryptMatterhornEvidenceEnvelope({ envelope: modified, key })).toThrow("evidence_ciphertext_hash_mismatch");
  });

  test("rejects forbidden plaintext fields before encryption", () => {
    const unsafe = {
      ...evidenceBundle(),
      receipt: {
        ...evidenceBundle().receipt,
        rawPrompt: "sensitive prompt",
      },
    };
    expect(() => encryptMatterhornEvidenceBundle({ bundle: unsafe, key: randomBytes(32) })).toThrow("evidence_forbidden_content_field");
  });
});
