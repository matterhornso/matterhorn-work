import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import type { MatterhornCoworkerRunBinding } from "./agent-capability.js";
import type { MatterhornCryptoEvidenceRecord, MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  sealMatterhornRunEvidence,
  type MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import { sha256 } from "./guarded-runtime-crypto.js";

export type MatterhornFinalizedCoworkerRun = {
  receipt: MatterhornAgentRunReceipt;
  coworker: MatterhornCoworkerRunBinding;
};

export type MatterhornFinalizedCoworkerEvidenceResult = {
  record: MatterhornCryptoEvidenceRecord;
  created: boolean;
};

function recipientKeyId(input: MatterhornFinalizedCoworkerRun): string {
  return `recipient_${sha256({
    domain: "matterhorn:coworker-evidence-recipient:v1",
    workspaceId: input.receipt.workspaceId,
    ownerId: input.coworker.ownerId,
    coworkerId: input.coworker.id,
  })}`;
}

/**
 * Seals a finalized coworker receipt into local tenant storage. Publication is
 * deliberately separate and still requires the explicit Walrus flow.
 */
export async function sealFinalizedCoworkerRunEvidence(input: {
  finalizedRun: MatterhornFinalizedCoworkerRun;
  store: MatterhornCryptoEvidenceStore;
  keyManager: MatterhornEvidenceKeyManager;
  retentionDays?: number;
  now?: Date;
}): Promise<MatterhornFinalizedCoworkerEvidenceResult> {
  const { receipt, coworker } = input.finalizedRun;
  if (receipt.workspaceId !== coworker.workspaceId) {
    throw new Error("crypto_evidence_tenant_binding_mismatch");
  }
  const identity = {
    workspaceId: receipt.workspaceId,
    ownerId: coworker.ownerId,
    coworkerId: coworker.id,
    runId: receipt.runId,
  };
  const existing = input.store.findByRun(identity);
  if (existing) return { record: existing, created: false };

  const sealed = await sealMatterhornRunEvidence({
    receipt,
    coworkerId: coworker.id,
    recipientKeyIds: [recipientKeyId(input.finalizedRun)],
    keyManager: input.keyManager,
    retentionDays: input.retentionDays ?? 365,
    ...(input.now ? { now: input.now } : {}),
  });
  try {
    try {
      return {
        record: input.store.create({ ...identity, sealed, ...(input.now ? { now: input.now } : {}) }),
        created: true,
      };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "crypto_evidence_already_exists") throw error;
      const raced = input.store.findByRun(identity);
      if (!raced) throw error;
      return { record: raced, created: false };
    }
  } finally {
    sealed.walrusCiphertext.fill(0);
  }
}
