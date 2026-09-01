import { randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  type MatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  decryptMatterhornEvidenceEnvelope,
  encryptMatterhornEvidenceBundle,
  serializeMatterhornWalrusCiphertext,
} from "./walrus-evidence-envelope.js";

function evidenceBundle(): MatterhornEvidenceBundle {
  return {
    version: MATTERHORN_EVIDENCE_BUNDLE_VERSION,
    id: "evidence_synthetic_testnet_1",
    workspaceIdHash: "a".repeat(64),
    runIdHash: "b".repeat(64),
    coworkerIdHash: "c".repeat(64),
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
      status: "success",
      providerId: "synthetic-provider",
      modelId: "synthetic-model",
      privacyMode: "transaction",
      consent: "not_required",
      dataCategoryHashes: ["d".repeat(64)],
      redactionCount: 0,
      policyHash: "e".repeat(64),
      toolOutcomeHashes: ["f".repeat(64)],
      evidenceReferenceHashes: ["1".repeat(64)],
      reviewedIntentHashes: ["2".repeat(64)],
      publicChainReceiptHashes: [],
      inputTokens: 10,
      outputTokens: 5,
      responseDurationMs: 50,
    },
  };
}

describe("Walrus evidence envelope", () => {
  test("encrypts a canonical bundle before any publisher can receive it", () => {
    const bundle = evidenceBundle();
    const key = randomBytes(32);
    const envelope = encryptMatterhornEvidenceBundle({ bundle, key });

    expect(envelope.version).toBe("matterhorn.encrypted-evidence-envelope.v1");
    expect(envelope.ciphertext).not.toContain(bundle.coworkerIdHash);
    expect(envelope.ciphertext).not.toContain(bundle.receipt.providerId);
    expect(envelope.ciphertextHash).toHaveLength(64);
    expect(envelope.merkleLeaf).toHaveLength(64);
    const publicBytes = serializeMatterhornWalrusCiphertext(envelope);
    expect(publicBytes.toString("utf8")).not.toContain(envelope.keyReference);
    expect(publicBytes.toString("utf8")).not.toContain(envelope.payloadHash);
    expect(decryptMatterhornEvidenceEnvelope({ envelope, key })).toEqual(bundle);
  });

  test("fails authentication with the wrong key or modified ciphertext", () => {
    const key = randomBytes(32);
    const envelope = encryptMatterhornEvidenceBundle({ bundle: evidenceBundle(), key });
    expect(() => decryptMatterhornEvidenceEnvelope({ envelope, key: randomBytes(32) })).toThrow();

    const replacement = envelope.ciphertext[0] === "A" ? "B" : "A";
    const modified = { ...envelope, ciphertext: `${replacement}${envelope.ciphertext.slice(1)}` };
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
