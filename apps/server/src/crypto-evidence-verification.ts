import { createHash } from "node:crypto";

import {
  MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
  type MatterhornEvidenceVerificationPacket,
  type MatterhornEvidenceVerificationResult,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoEvidenceRecord } from "./crypto-evidence-store.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import type { MatterhornWalrusCertification } from "./crypto-evidence-walrus-publisher.js";
import { serializeMatterhornWalrusCiphertext } from "./walrus-evidence-envelope.js";
import { verifyMatterhornEvidenceMerkleProof } from "./walrus-evidence-merkle.js";

export type MatterhornLiveEvidenceVerifier = (input: {
  workspaceId: string;
  ownerId: string;
  evidenceId: string;
  signal: AbortSignal;
}) => Promise<{ certification: MatterhornWalrusCertification }>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Closed projection: adding any tenant or key field here requires a review. */
export function cryptoEvidenceAccountPacket(
  record: MatterhornCryptoEvidenceRecord,
): MatterhornEvidenceVerificationPacket {
  return {
    version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
    evidenceId: record.id,
    state: record.state,
    revision: record.revision,
    ciphertextSha256: record.index.ciphertextHash,
    merkleLeaf: record.index.merkleLeaf,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    retention: {
      deletable: record.index.deletable,
      expiresAt: record.index.expiresAt,
      keyAvailable: record.state !== "key_destroyed",
    },
    publication: record.walrusProof ? structuredClone(record.walrusProof) : null,
  };
}

function localChecks(record: MatterhornCryptoEvidenceRecord): {
  ciphertextHash: boolean;
  merkleInclusion: boolean;
} {
  if (!record.envelope) return { ciphertextHash: false, merkleInclusion: false };
  const ciphertextHash = sha256(serializeMatterhornWalrusCiphertext(record.envelope))
    === record.index.ciphertextHash;
  const proof = record.walrusProof;
  const merkleInclusion = Boolean(proof) && verifyMatterhornEvidenceMerkleProof({
    ciphertextHash: record.index.ciphertextHash,
    leaf: record.index.merkleLeaf,
    root: proof?.merkleRoot ?? "",
    proof: proof?.merkleProof ?? [],
  });
  return { ciphertextHash, merkleInclusion };
}

function safeFailureReason(error: unknown): string {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
  const allowed = new Set([
    "crypto_evidence_walrus_aborted",
    "crypto_evidence_walrus_certification_expired",
    "crypto_evidence_walrus_certification_invalid",
    "crypto_evidence_walrus_ciphertext_mismatch",
    "crypto_evidence_walrus_merkle_proof_mismatch",
    "crypto_evidence_walrus_not_certified",
    "crypto_evidence_walrus_readback_mismatch",
  ]);
  return allowed.has(code) ? code : "crypto_evidence_verification_failed";
}

export class MatterhornCryptoEvidenceVerificationService {
  constructor(
    private readonly store: MatterhornCryptoEvidenceStore,
    private readonly liveVerify: MatterhornLiveEvidenceVerifier | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(input: { workspaceId: string; ownerId: string }): MatterhornEvidenceVerificationPacket[] {
    return this.store.list(input).map(cryptoEvidenceAccountPacket);
  }

  async verify(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    signal: AbortSignal;
  }): Promise<MatterhornEvidenceVerificationResult> {
    const record = this.store.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    const verifiedAt = this.now();
    if (!Number.isFinite(verifiedAt.getTime())) throw new Error("crypto_evidence_time_invalid");
    const evidence = cryptoEvidenceAccountPacket(record);
    const local = localChecks(record);
    const baseChecks: MatterhornEvidenceVerificationResult["verification"]["checks"] = {
      tenantScope: true,
      ciphertextHash: local.ciphertextHash,
      merkleInclusion: local.merkleInclusion,
      suiCertification: false,
      walrusReadback: false,
    };
    if (record.state === "key_destroyed") {
      return {
        version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
        evidence,
        verification: {
          status: "key_destroyed",
          verifiedAt: verifiedAt.toISOString(),
          checks: baseChecks,
          currentEpoch: null,
          reason: "recovery_material_deleted",
        },
      };
    }
    if (record.state === "sealed") {
      return {
        version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
        evidence,
        verification: {
          status: "sealed_local",
          verifiedAt: verifiedAt.toISOString(),
          checks: baseChecks,
          currentEpoch: null,
          reason: "walrus_publication_not_attached",
        },
      };
    }
    if (!this.liveVerify) {
      return {
        version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
        evidence,
        verification: {
          status: "failed",
          verifiedAt: verifiedAt.toISOString(),
          checks: baseChecks,
          currentEpoch: null,
          reason: "live_verification_unavailable",
        },
      };
    }
    try {
      const { certification } = await this.liveVerify(input);
      return {
        version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
        evidence,
        verification: {
          status: "verified",
          verifiedAt: verifiedAt.toISOString(),
          checks: {
            tenantScope: true,
            ciphertextHash: true,
            merkleInclusion: true,
            suiCertification: true,
            walrusReadback: true,
          },
          currentEpoch: certification.currentEpoch,
          reason: null,
        },
      };
    } catch (error) {
      const reason = safeFailureReason(error);
      return {
        version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
        evidence,
        verification: {
          status: reason === "crypto_evidence_walrus_certification_expired" ? "expired" : "failed",
          verifiedAt: verifiedAt.toISOString(),
          checks: baseChecks,
          currentEpoch: null,
          reason,
        },
      };
    }
  }
}
