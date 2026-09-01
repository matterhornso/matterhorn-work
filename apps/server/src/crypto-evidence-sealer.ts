import type { MatterhornEncryptedEvidenceEnvelope } from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import { compileMatterhornEvidenceBundle } from "./crypto-evidence-compiler.js";
import {
  encryptMatterhornEvidenceBundle,
  serializeMatterhornWalrusCiphertext,
} from "./walrus-evidence-envelope.js";

export type MatterhornEvidenceDataKeyLease = {
  /** Plaintext data key exists only for the duration of one seal operation. */
  plaintextKey: Buffer;
  /** Opaque KMS or accepted recipient-wrapping reference; never sent to Walrus. */
  keyReference: string;
  recipientKeyIds: string[];
};

export interface MatterhornEvidenceKeyManager {
  createDataKey(input: {
    workspaceId: string;
    runId: string;
    recipientKeyIds: string[];
  }): Promise<MatterhornEvidenceDataKeyLease>;
  destroyKey(input: { workspaceId: string; keyReference: string }): Promise<void>;
}

export type MatterhornSealedEvidence = {
  envelope: MatterhornEncryptedEvidenceEnvelope;
  /** The only bytes eligible for the authenticated Walrus relay. */
  walrusCiphertext: Buffer;
  localIndex: {
    evidenceId: string;
    workspaceIdHash: string;
    runIdHash: string;
    coworkerIdHash: string;
    keyReference: string;
    ciphertextHash: string;
    merkleLeaf: string;
    createdAt: string;
    expiresAt: string | null;
    deletable: boolean;
  };
};

/**
 * Compiles and encrypts one finalized run. The plaintext key is zeroed in a
 * finally block even when validation or encryption fails.
 */
export async function sealMatterhornRunEvidence(input: {
  receipt: MatterhornAgentRunReceipt;
  coworkerId: string;
  recipientKeyIds: string[];
  keyManager: MatterhornEvidenceKeyManager;
  retentionDays?: number | null;
  now?: Date;
  correlationSalt?: Buffer;
  idEntropy?: Buffer;
}): Promise<MatterhornSealedEvidence> {
  const requestedRecipients = [...new Set(input.recipientKeyIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (requestedRecipients.length < 1) throw new Error("evidence_recipient_required");
  const lease = await input.keyManager.createDataKey({
    workspaceId: input.receipt.workspaceId,
    runId: input.receipt.runId,
    recipientKeyIds: requestedRecipients,
  });
  try {
    if (!Buffer.isBuffer(lease.plaintextKey) || lease.plaintextKey.length !== 32) {
      throw new Error("evidence_encryption_key_invalid");
    }
    const actualRecipients = [...new Set(lease.recipientKeyIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (actualRecipients.length !== requestedRecipients.length
      || actualRecipients.some((id, index) => id !== requestedRecipients[index])) {
      throw new Error("evidence_key_recipient_mismatch");
    }
    const bundle = compileMatterhornEvidenceBundle({
      receipt: input.receipt,
      coworkerId: input.coworkerId,
      keyReference: lease.keyReference,
      recipientKeyIds: actualRecipients,
      retentionDays: input.retentionDays,
      now: input.now,
      correlationSalt: input.correlationSalt,
      idEntropy: input.idEntropy,
    });
    const envelope = encryptMatterhornEvidenceBundle({ bundle, key: lease.plaintextKey });
    const walrusCiphertext = serializeMatterhornWalrusCiphertext(envelope);
    return {
      envelope,
      walrusCiphertext,
      localIndex: {
        evidenceId: bundle.id,
        workspaceIdHash: bundle.workspaceIdHash,
        runIdHash: bundle.runIdHash,
        coworkerIdHash: bundle.coworkerIdHash,
        keyReference: envelope.keyReference,
        ciphertextHash: envelope.ciphertextHash,
        merkleLeaf: envelope.merkleLeaf,
        createdAt: bundle.createdAt,
        expiresAt: bundle.retention.expiresAt,
        deletable: bundle.retention.deletable,
      },
    };
  } finally {
    if (Buffer.isBuffer(lease.plaintextKey)) lease.plaintextKey.fill(0);
  }
}
