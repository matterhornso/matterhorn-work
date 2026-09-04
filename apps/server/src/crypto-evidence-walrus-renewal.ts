import { randomUUID } from "node:crypto";

import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  MATTERHORN_CRYPTO_EVIDENCE_WALRUS_RENEWAL_VERSION,
  type MatterhornCryptoEvidenceWalrusRenewalConfirmResponse,
  type MatterhornCryptoEvidenceWalrusRenewalPrepareResponse,
  type MatterhornCryptoEvidenceWalrusRenewalPreview,
  type MatterhornEvidenceVerificationStatus,
  type MatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";

import type {
  MatterhornSuiTransactionStatusVerifier,
  MatterhornWalrusRenewalTransactionBuilder,
} from "./agent-file-walrus-renewal.js";
import { cryptoEvidenceAccountPacket } from "./crypto-evidence-verification.js";
import type { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  matterhornWalrusOwnerAddressHash,
  type MatterhornWalrusCertificationVerifier,
} from "./crypto-evidence-walrus-publisher.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import { assessMatterhornWalrusStorageLifecycle } from "./walrus-storage-lifecycle.js";

const STATE_KIND = "crypto_evidence_renewal_intent";
const INTENT_TTL_MS = 5 * 60_000;
const MAX_TRANSACTION_BYTES = 256 * 1_024;
const SUI_TESTNET_NETWORK = "sui:testnet" as const;

type RenewalIntentRecord = {
  workspaceId: string;
  ownerId: string;
  claimId: string;
  preview: MatterhornCryptoEvidenceWalrusRenewalPreview;
};

export class MatterhornCryptoEvidenceWalrusRenewalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoEvidenceWalrusRenewalError";
  }
}

function fail(code: string): never {
  throw new MatterhornCryptoEvidenceWalrusRenewalError(code);
}

function canonicalSigner(value: string): string {
  try {
    const normalized = normalizeSuiAddress(value);
    if (!isValidSuiAddress(normalized)) return fail("crypto_evidence_walrus_renewal_signer_invalid");
    return normalized;
  } catch {
    return fail("crypto_evidence_walrus_renewal_signer_invalid");
  }
}

function canonicalTransactionBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return fail("crypto_evidence_walrus_renewal_transaction_invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength < 1
    || bytes.byteLength > MAX_TRANSACTION_BYTES
    || bytes.toString("base64") !== value) {
    bytes.fill(0);
    return fail("crypto_evidence_walrus_renewal_transaction_invalid");
  }
  return bytes;
}

function transactionDigest(value: string): string {
  const digest = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(digest)) {
    return fail("crypto_evidence_walrus_renewal_transaction_invalid");
  }
  return digest;
}

function intentHashPayload(
  preview: Omit<MatterhornCryptoEvidenceWalrusRenewalPreview, "intentHash">,
) {
  return {
    domain: "matterhorn:crypto-evidence-walrus-renewal:v1",
    version: preview.version,
    intentId: preview.intentId,
    evidenceId: preview.evidenceId,
    evidenceRevision: preview.evidenceRevision,
    network: preview.network,
    signer: preview.signer,
    blobId: preview.blobId,
    suiObjectId: preview.suiObjectId,
    currentEpoch: preview.currentEpoch,
    previousValidUntilEpoch: preview.previousValidUntilEpoch,
    extensionEpochs: preview.extensionEpochs,
    targetValidUntilEpoch: preview.targetValidUntilEpoch,
    transactionDigest: preview.transactionDigest,
    simulationReference: preview.simulationReference,
    simulatedAt: preview.simulatedAt,
    expiresAt: preview.expiresAt,
    walletAuthority: preview.walletAuthority,
  };
}

function assertPreview(value: MatterhornCryptoEvidenceWalrusRenewalPreview): void {
  if (value.version !== MATTERHORN_CRYPTO_EVIDENCE_WALRUS_RENEWAL_VERSION
    || !/^crypto_evidence_renewal_[a-f0-9]{32}$/.test(value.intentId)
    || !/^evidence_[A-Za-z0-9_-]{1,120}$/.test(value.evidenceId)
    || !Number.isSafeInteger(value.evidenceRevision) || value.evidenceRevision < 1
    || value.network !== "testnet"
    || !value.blobId || value.blobId.length > 512
    || !/^0x[a-f0-9]+$/.test(value.suiObjectId)
    || !Number.isSafeInteger(value.currentEpoch) || value.currentEpoch < 0
    || !Number.isSafeInteger(value.previousValidUntilEpoch)
    || !Number.isSafeInteger(value.extensionEpochs) || value.extensionEpochs < 1 || value.extensionEpochs > 53
    || value.targetValidUntilEpoch !== value.previousValidUntilEpoch + value.extensionEpochs
    || value.targetValidUntilEpoch <= value.currentEpoch
    || value.targetValidUntilEpoch - value.currentEpoch > 53
    || !/^[a-f0-9]{64}$/.test(value.intentHash)
    || !/^[a-f0-9]{64}$/.test(value.simulationReference)
    || value.walletAuthority !== "connected_wallet_only") {
    fail("crypto_evidence_walrus_renewal_intent_invalid");
  }
  canonicalSigner(value.signer);
  const bytes = canonicalTransactionBytes(value.transactionBytesBase64);
  try {
    if (TransactionDataBuilder.getDigestFromBytes(bytes) !== transactionDigest(value.transactionDigest)) {
      fail("crypto_evidence_walrus_renewal_transaction_invalid");
    }
  } finally {
    bytes.fill(0);
  }
  const simulatedAt = Date.parse(value.simulatedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(simulatedAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= simulatedAt
    || expiresAt - simulatedAt > INTENT_TTL_MS) {
    fail("crypto_evidence_walrus_renewal_intent_invalid");
  }
  const { intentHash: _, ...withoutHash } = value;
  if (sha256(intentHashPayload(withoutHash)) !== value.intentHash) {
    fail("crypto_evidence_walrus_renewal_intent_invalid");
  }
}

function assertIntentTenant(record: RenewalIntentRecord, input: {
  workspaceId: string;
  ownerId: string;
  evidenceId: string;
}): void {
  assertPreview(record.preview);
  if (record.workspaceId !== input.workspaceId
    || record.ownerId !== input.ownerId
    || record.preview.evidenceId !== input.evidenceId) {
    fail("crypto_evidence_not_found");
  }
}

function translateDependencyError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith("agent_file_")) {
    fail(error.message.replace(/^agent_file_/, "crypto_evidence_"));
  }
  throw error;
}

export class MatterhornCryptoEvidenceWalrusRenewalService {
  constructor(
    private readonly store: MatterhornCryptoEvidenceStore,
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly buildTransaction: MatterhornWalrusRenewalTransactionBuilder,
    private readonly verifyTransaction: MatterhornSuiTransactionStatusVerifier,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
    private readonly extensionEpochs = 5,
  ) {
    if (!Number.isSafeInteger(extensionEpochs) || extensionEpochs < 1 || extensionEpochs > 53) {
      fail("crypto_evidence_walrus_renewal_epochs_invalid");
    }
  }

  async prepare(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    signer: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceWalrusRenewalPrepareResponse> {
    if (input.signal.aborted) fail("crypto_evidence_walrus_aborted");
    const signer = canonicalSigner(input.signer);
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const existing = this.stateStore.get<RenewalIntentRecord>(STATE_KIND, input.evidenceId, now.getTime());
    if (existing) {
      assertIntentTenant(existing, input);
      if (!this.store.hasWalrusRenewalClaim({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        expectedRevision: existing.preview.evidenceRevision,
        claimId: existing.claimId,
        now,
      })) {
        this.stateStore.delete(STATE_KIND, input.evidenceId);
      } else {
        if (existing.preview.evidenceRevision !== input.expectedRevision
          || existing.preview.signer !== signer
          || existing.preview.extensionEpochs !== this.extensionEpochs) {
          fail("crypto_evidence_walrus_renewal_in_progress");
        }
        return this.prepareResponse(existing.preview);
      }
    }
    this.stateStore.delete(STATE_KIND, input.evidenceId);
    const candidate = this.store.beginWalrusRenewal({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      evidenceId: input.evidenceId,
      expectedRevision: input.expectedRevision,
      now,
    });
    let retainedClaim = false;
    try {
      const record = candidate.record;
      const proof = record.walrusProof;
      if (!record.walrusOwnerAddressHash
        || record.walrusOwnerAddressHash !== matterhornWalrusOwnerAddressHash(signer)) {
        fail("crypto_evidence_walrus_wallet_owner_required");
      }
      let certification;
      try {
        certification = await this.verifyCertification({
          network: "testnet",
          blobId: proof.blobId,
          suiObjectId: proof.suiObjectId,
          signal: input.signal,
        });
      } catch (error) {
        return translateDependencyError(error);
      }
      if (certification.network !== "testnet"
        || proof.network !== "testnet"
        || certification.blobId !== proof.blobId
        || certification.suiObjectId !== proof.suiObjectId
        || certification.certifiedEpoch !== proof.certifiedEpoch
        || certification.validUntilEpoch !== proof.validUntilEpoch
        || certification.suiTransactionDigest !== proof.suiTransactionDigest
        || certification.ownerAddress !== signer) {
        fail("crypto_evidence_walrus_certification_changed");
      }
      const lifecycle = assessMatterhornWalrusStorageLifecycle({
        currentEpoch: certification.currentEpoch,
        validUntilEpoch: certification.validUntilEpoch,
      });
      if (lifecycle.status === "expired") fail("crypto_evidence_walrus_certification_expired");
      if (lifecycle.status !== "renewal_due") fail("crypto_evidence_walrus_renewal_not_due");
      const targetValidUntilEpoch = certification.validUntilEpoch + this.extensionEpochs;
      if (targetValidUntilEpoch - certification.currentEpoch > 53) {
        fail("crypto_evidence_walrus_renewal_epochs_invalid");
      }
      let built;
      try {
        built = await this.buildTransaction({
          network: SUI_TESTNET_NETWORK,
          signer,
          blobObjectId: proof.suiObjectId,
          extensionEpochs: this.extensionEpochs,
          signal: input.signal,
        });
      } catch (error) {
        return translateDependencyError(error);
      }
      const transactionBytes = canonicalTransactionBytes(built.transactionBytesBase64);
      try {
        if (TransactionDataBuilder.getDigestFromBytes(transactionBytes)
          !== transactionDigest(built.transactionDigest)) {
          fail("crypto_evidence_walrus_renewal_transaction_invalid");
        }
      } finally {
        transactionBytes.fill(0);
      }
      if (!/^[a-f0-9]{64}$/.test(built.simulationReference)
        || !Number.isFinite(Date.parse(built.simulatedAt))
        || Math.abs(Date.parse(built.simulatedAt) - now.getTime()) > 30_000) {
        fail("crypto_evidence_walrus_renewal_simulation_invalid");
      }
      const previewWithoutHash: Omit<MatterhornCryptoEvidenceWalrusRenewalPreview, "intentHash"> = {
        version: MATTERHORN_CRYPTO_EVIDENCE_WALRUS_RENEWAL_VERSION,
        intentId: `crypto_evidence_renewal_${randomUUID().replaceAll("-", "")}`,
        evidenceId: input.evidenceId,
        evidenceRevision: input.expectedRevision,
        network: "testnet",
        signer,
        blobId: proof.blobId,
        suiObjectId: proof.suiObjectId,
        currentEpoch: certification.currentEpoch,
        previousValidUntilEpoch: certification.validUntilEpoch,
        extensionEpochs: this.extensionEpochs,
        targetValidUntilEpoch,
        transactionBytesBase64: built.transactionBytesBase64,
        transactionDigest: built.transactionDigest,
        simulationReference: built.simulationReference,
        simulatedAt: built.simulatedAt,
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
        walletAuthority: "connected_wallet_only",
      };
      const preview: MatterhornCryptoEvidenceWalrusRenewalPreview = {
        ...previewWithoutHash,
        intentHash: sha256(intentHashPayload(previewWithoutHash)),
      };
      assertPreview(preview);
      if (!this.stateStore.putIfAbsent({
        kind: STATE_KIND,
        key: input.evidenceId,
        workspaceId: input.workspaceId,
        value: {
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          claimId: candidate.claimId,
          preview,
        },
        expiresAtMs: Date.parse(preview.expiresAt),
        nowMs: now.getTime(),
      })) fail("crypto_evidence_walrus_renewal_in_progress");
      retainedClaim = true;
      return this.prepareResponse(preview);
    } finally {
      if (!retainedClaim) {
        this.store.endWalrusRenewal({
          workspaceId: input.workspaceId,
          evidenceId: input.evidenceId,
          claimId: candidate.claimId,
          now,
        });
      }
    }
  }

  async confirm(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    intentId: string;
    intentHash: string;
    transactionDigest: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceWalrusRenewalConfirmResponse> {
    if (input.signal.aborted) fail("crypto_evidence_walrus_aborted");
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const record = this.stateStore.get<RenewalIntentRecord>(STATE_KIND, input.evidenceId, now.getTime());
    if (!record) fail("crypto_evidence_walrus_renewal_expired_or_replayed");
    assertIntentTenant(record, input);
    const preview = record.preview;
    if (preview.intentId !== input.intentId
      || preview.intentHash !== input.intentHash
      || preview.transactionDigest !== transactionDigest(input.transactionDigest)) {
      fail("crypto_evidence_walrus_renewal_intent_mismatch");
    }
    if (!this.store.hasWalrusRenewalClaim({
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
      expectedRevision: preview.evidenceRevision,
      claimId: record.claimId,
      now,
    })) fail("crypto_evidence_walrus_renewal_expired_or_replayed");
    let transaction;
    try {
      transaction = await this.verifyTransaction({
        network: SUI_TESTNET_NETWORK,
        digest: preview.transactionDigest,
        signer: preview.signer,
        signal: input.signal,
      });
    } catch (error) {
      return translateDependencyError(error);
    }
    if (transaction.digest !== preview.transactionDigest
      || canonicalSigner(transaction.signer) !== preview.signer) {
      fail("crypto_evidence_walrus_renewal_transaction_mismatch");
    }
    if (transaction.status !== "confirmed") fail("crypto_evidence_walrus_renewal_transaction_failed");
    let certification;
    try {
      certification = await this.verifyCertification({
        network: "testnet",
        blobId: preview.blobId,
        suiObjectId: preview.suiObjectId,
        signal: input.signal,
      });
    } catch (error) {
      return translateDependencyError(error);
    }
    if (certification.network !== "testnet"
      || certification.blobId !== preview.blobId
      || certification.suiObjectId !== preview.suiObjectId
      || certification.validUntilEpoch !== preview.targetValidUntilEpoch
      || certification.currentEpoch >= certification.validUntilEpoch
      || certification.ownerAddress !== preview.signer) {
      fail("crypto_evidence_walrus_renewal_certification_mismatch");
    }
    const current = this.store.get(input);
    const currentProof = current?.walrusProof;
    if (!current || !currentProof) fail("crypto_evidence_walrus_renewal_state_invalid");
    if (current.walrusOwnerAddressHash !== matterhornWalrusOwnerAddressHash(preview.signer)) {
      fail("crypto_evidence_walrus_wallet_owner_required");
    }
    const finalizedAt = input.now ?? new Date();
    if (!Number.isFinite(finalizedAt.getTime())) fail("crypto_evidence_time_invalid");
    const renewedProof: MatterhornWalrusProof = {
      ...currentProof,
      validUntilEpoch: certification.validUntilEpoch,
      renewalTransactionDigest: transaction.digest,
      renewedAt: transaction.observedAt,
    };
    const verification: MatterhornEvidenceVerificationStatus = {
      status: "verified",
      verifiedAt: finalizedAt.toISOString(),
      checks: {
        tenantScope: true,
        ciphertextHash: true,
        merkleInclusion: true,
        suiCertification: true,
        walrusReadback: true,
      },
      currentEpoch: certification.currentEpoch,
      reason: null,
    };
    const item = this.stateStore.transaction(() => {
      const consumed = this.stateStore.take<RenewalIntentRecord>(
        STATE_KIND,
        input.evidenceId,
        finalizedAt.getTime(),
      );
      if (!consumed) fail("crypto_evidence_walrus_renewal_expired_or_replayed");
      assertIntentTenant(consumed, input);
      if (canonicalJson(consumed.preview) !== canonicalJson(preview)) {
        fail("crypto_evidence_walrus_renewal_intent_mismatch");
      }
      const renewed = this.store.renewVerifiedWalrusProof({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        evidenceId: input.evidenceId,
        expectedRevision: preview.evidenceRevision,
        expectedBlobId: preview.blobId,
        expectedSuiObjectId: preview.suiObjectId,
        expectedCiphertextSha256: current.index.ciphertextHash,
        expectedPreviousValidUntilEpoch: preview.previousValidUntilEpoch,
        claimId: consumed.claimId,
        proof: renewedProof,
        now: finalizedAt,
      });
      this.store.recordVerificationStatus({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        evidenceId: input.evidenceId,
        expectedRevision: renewed.revision,
        verification,
      });
      return cryptoEvidenceAccountPacket(renewed, verification);
    });
    return { item, verification };
  }

  private prepareResponse(
    preview: MatterhornCryptoEvidenceWalrusRenewalPreview,
  ): MatterhornCryptoEvidenceWalrusRenewalPrepareResponse {
    return {
      preview: structuredClone(preview),
      disclosure: {
        network: "testnet",
        paymentAsset: "WAL",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
      },
    };
  }
}
