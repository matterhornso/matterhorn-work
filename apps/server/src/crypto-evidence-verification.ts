import { createHash } from "node:crypto";

import {
  MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
  type MatterhornEvidenceVerificationPacket,
  type MatterhornEvidenceVerificationResult,
  type MatterhornEvidenceVerificationStatus,
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
  lastVerification: MatterhornEvidenceVerificationStatus | null = null,
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
    walletLifecycleReady: Boolean(record.walrusOwnerAddressHash),
    publication: record.walrusProof ? structuredClone(record.walrusProof) : null,
    anchor: record.suiAnchor ? structuredClone(record.suiAnchor) : null,
    lastVerification: lastVerification ? structuredClone(lastVerification) : null,
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
    return this.store.list(input).map((record) => cryptoEvidenceAccountPacket(
      record,
      this.store.getVerificationStatus({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        evidenceId: record.id,
      }),
    ));
  }

  private persistResult(
    record: MatterhornCryptoEvidenceRecord,
    verification: MatterhornEvidenceVerificationStatus,
  ): MatterhornEvidenceVerificationResult {
    this.store.recordVerificationStatus({
      workspaceId: record.workspaceId,
      ownerId: record.ownerId,
      evidenceId: record.id,
      expectedRevision: record.revision,
      verification,
    });
    return {
      version: MATTERHORN_EVIDENCE_VERIFICATION_VERSION,
      evidence: cryptoEvidenceAccountPacket(record, verification),
      verification,
    };
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
    const local = localChecks(record);
    const baseChecks: MatterhornEvidenceVerificationResult["verification"]["checks"] = {
      tenantScope: true,
      ciphertextHash: local.ciphertextHash,
      merkleInclusion: local.merkleInclusion,
      suiCertification: false,
      walrusReadback: false,
    };
    if (record.state === "key_destroyed" && record.walrusProof?.deletionTransactionDigest) {
      return this.persistResult(record, {
        status: "deleted",
        verifiedAt: verifiedAt.toISOString(),
        checks: {
          ...baseChecks,
          suiCertification: true,
        },
        currentEpoch: null,
        reason: "wallet_walrus_deletion_verified",
      });
    }
    if (record.state === "key_destroyed") {
      return this.persistResult(record, {
        status: "key_destroyed",
        verifiedAt: verifiedAt.toISOString(),
        checks: baseChecks,
        currentEpoch: null,
        reason: "recovery_material_deleted",
      });
    }
    if (record.state === "sealed") {
      return this.persistResult(record, {
        status: "sealed_local",
        verifiedAt: verifiedAt.toISOString(),
        checks: baseChecks,
        currentEpoch: null,
        reason: "walrus_publication_not_attached",
      });
    }
    if (!this.liveVerify) {
      return this.persistResult(record, {
        status: "failed",
        verifiedAt: verifiedAt.toISOString(),
        checks: baseChecks,
        currentEpoch: null,
        reason: "live_verification_unavailable",
      });
    }
    try {
      const { certification } = await this.liveVerify(input);
      return this.persistResult(record, {
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
      });
    } catch (error) {
      const reason = safeFailureReason(error);
      return this.persistResult(record, {
        status: reason === "crypto_evidence_walrus_certification_expired" ? "expired" : "failed",
        verifiedAt: verifiedAt.toISOString(),
        checks: baseChecks,
        currentEpoch: null,
        reason,
      });
    }
  }

  async verifyDue(input: {
    limit?: number;
    concurrency?: number;
    minimumIntervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}): Promise<{
    checked: number;
    verified: number;
    expired: number;
    failed: number;
  }> {
    if (!this.liveVerify) return { checked: 0, verified: 0, expired: 0, failed: 0 };
    const limit = input.limit ?? 25;
    const concurrency = input.concurrency ?? 4;
    const minimumIntervalMs = input.minimumIntervalMs ?? 6 * 60 * 60 * 1_000;
    const timeoutMs = input.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new Error("crypto_evidence_verification_concurrency_invalid");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new Error("crypto_evidence_verification_timeout_invalid");
    }
    const candidates = this.store.listPublishedForVerification({
      limit,
      minimumIntervalMs,
      now: this.now(),
    });
    let nextIndex = 0;
    const totals = { checked: 0, verified: 0, expired: 0, failed: 0 };
    const worker = async () => {
      while (nextIndex < candidates.length && !input.signal?.aborted) {
        const candidate = candidates[nextIndex];
        nextIndex += 1;
        if (!candidate) continue;
        const controller = new AbortController();
        const abort = () => controller.abort();
        input.signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, timeoutMs);
        timeout.unref?.();
        totals.checked += 1;
        try {
          const result = await this.verify({ ...candidate, signal: controller.signal });
          if (result.verification.status === "verified") totals.verified += 1;
          else if (result.verification.status === "expired") totals.expired += 1;
          else totals.failed += 1;
        } catch {
          totals.failed += 1;
        } finally {
          clearTimeout(timeout);
          input.signal?.removeEventListener("abort", abort);
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(concurrency, candidates.length) },
      () => worker(),
    ));
    return totals;
  }
}
