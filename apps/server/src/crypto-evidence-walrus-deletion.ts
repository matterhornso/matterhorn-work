import { randomUUID } from "node:crypto";

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { walrus } from "@mysten/walrus";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import {
  MATTERHORN_CRYPTO_EVIDENCE_WALRUS_DELETION_VERSION,
  type MatterhornCryptoEvidenceWalrusDeletionConfirmResponse,
  type MatterhornCryptoEvidenceWalrusDeletionPrepareResponse,
  type MatterhornCryptoEvidenceWalrusDeletionPreview,
  type MatterhornEvidenceVerificationStatus,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornSuiTransactionStatusVerifier } from "./agent-file-walrus-renewal.js";
import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
import {
  type MatterhornAdapterDnsResolver,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";
import type { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { cryptoEvidenceAccountPacket } from "./crypto-evidence-verification.js";
import {
  matterhornWalrusOwnerAddressHash,
  type MatterhornWalrusCertificationVerifier,
} from "./crypto-evidence-walrus-publisher.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import { assessMatterhornWalrusStorageLifecycle } from "./walrus-storage-lifecycle.js";

const STATE_KIND = "crypto_evidence_deletion_intent";
const INTENT_TTL_MS = 5 * 60_000;
const MAX_TRANSACTION_BYTES = 256 * 1_024;
const SUI_TESTNET_NETWORK = "sui:testnet" as const;

type DeletionIntentRecord = {
  workspaceId: string;
  ownerId: string;
  claimId: string;
  preview: MatterhornCryptoEvidenceWalrusDeletionPreview;
};

export type MatterhornWalrusDeletionTransactionBuilder = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  signer: string;
  blobObjectId: string;
  signal: AbortSignal;
}) => Promise<{
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
}>;

export class MatterhornCryptoEvidenceWalrusDeletionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoEvidenceWalrusDeletionError";
  }
}

function fail(code: string): never {
  throw new MatterhornCryptoEvidenceWalrusDeletionError(code);
}

function canonicalSigner(value: string): string {
  try {
    const normalized = normalizeSuiAddress(value);
    if (!isValidSuiAddress(normalized)) return fail("crypto_evidence_walrus_deletion_signer_invalid");
    return normalized;
  } catch {
    return fail("crypto_evidence_walrus_deletion_signer_invalid");
  }
}

function canonicalTransactionBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return fail("crypto_evidence_walrus_deletion_transaction_invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength < 1
    || bytes.byteLength > MAX_TRANSACTION_BYTES
    || bytes.toString("base64") !== value) {
    bytes.fill(0);
    return fail("crypto_evidence_walrus_deletion_transaction_invalid");
  }
  return bytes;
}

function transactionDigest(value: string): string {
  const digest = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(digest)) {
    return fail("crypto_evidence_walrus_deletion_transaction_invalid");
  }
  return digest;
}

function intentHashPayload(
  preview: Omit<MatterhornCryptoEvidenceWalrusDeletionPreview, "intentHash">,
) {
  return {
    domain: "matterhorn:crypto-evidence-walrus-deletion:v1",
    version: preview.version,
    intentId: preview.intentId,
    evidenceId: preview.evidenceId,
    evidenceRevision: preview.evidenceRevision,
    network: preview.network,
    signer: preview.signer,
    blobId: preview.blobId,
    suiObjectId: preview.suiObjectId,
    ciphertextSha256: preview.ciphertextSha256,
    transactionDigest: preview.transactionDigest,
    simulationReference: preview.simulationReference,
    simulatedAt: preview.simulatedAt,
    expiresAt: preview.expiresAt,
    walletAuthority: preview.walletAuthority,
  };
}

function assertPreview(value: MatterhornCryptoEvidenceWalrusDeletionPreview): void {
  if (value.version !== MATTERHORN_CRYPTO_EVIDENCE_WALRUS_DELETION_VERSION
    || !/^crypto_evidence_deletion_[a-f0-9]{32}$/.test(value.intentId)
    || !/^evidence_[A-Za-z0-9_-]{1,120}$/.test(value.evidenceId)
    || !Number.isSafeInteger(value.evidenceRevision) || value.evidenceRevision < 1
    || value.network !== "testnet"
    || !value.blobId || value.blobId.length > 512
    || !/^0x[a-f0-9]+$/.test(value.suiObjectId)
    || !/^[a-f0-9]{64}$/.test(value.ciphertextSha256)
    || !/^[a-f0-9]{64}$/.test(value.intentHash)
    || !/^[a-f0-9]{64}$/.test(value.simulationReference)
    || value.walletAuthority !== "connected_wallet_only") {
    fail("crypto_evidence_walrus_deletion_intent_invalid");
  }
  canonicalSigner(value.signer);
  const bytes = canonicalTransactionBytes(value.transactionBytesBase64);
  try {
    if (TransactionDataBuilder.getDigestFromBytes(bytes) !== transactionDigest(value.transactionDigest)) {
      fail("crypto_evidence_walrus_deletion_transaction_invalid");
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
    fail("crypto_evidence_walrus_deletion_intent_invalid");
  }
  const { intentHash: _, ...withoutHash } = value;
  if (sha256(intentHashPayload(withoutHash)) !== value.intentHash) {
    fail("crypto_evidence_walrus_deletion_intent_invalid");
  }
}

function assertIntentTenant(record: DeletionIntentRecord, input: {
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

export function createPinnedWalrusDeletionTransactionBuilder(options: {
  endpoint: string;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): MatterhornWalrusDeletionTransactionBuilder {
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) fail("crypto_evidence_walrus_mainnet_disabled");
    if (input.signal.aborted) fail("crypto_evidence_walrus_aborted");
    const signer = canonicalSigner(input.signer);
    const resolved = await resolvePublicCryptoAdapterEndpoint(options.endpoint, options.resolver);
    const transport = new GrpcWebFetchTransport({
      baseUrl: resolved.endpoint.href.replace(/\/$/, ""),
      format: "binary",
      fetch: createPinnedSuiGrpcWebFetch({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        outerSignal: input.signal,
        onObservation: options.onObservation,
      }),
    });
    const client = new SuiGrpcClient({ network: "testnet", transport }).$extend(walrus());
    const transaction = client.walrus.deleteBlobTransaction({
      blobObjectId: input.blobObjectId,
      owner: signer,
    });
    transaction.setSender(signer);
    const bytes = await transaction.build({ client });
    const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
    const simulated = await client.simulateTransaction({
      transaction: bytes,
      include: { effects: true },
      signal: input.signal,
    });
    if (simulated.$kind === "FailedTransaction") {
      fail("crypto_evidence_walrus_deletion_simulation_failed");
    }
    const simulatedAt = now();
    if (!Number.isFinite(simulatedAt.getTime())) fail("crypto_evidence_time_invalid");
    return {
      transactionBytesBase64: Buffer.from(bytes).toString("base64"),
      transactionDigest: digest,
      simulationReference: sha256({
        domain: "matterhorn:walrus-deletion-simulation:v1",
        transactionDigest: digest,
        status: "success",
      }),
      simulatedAt: simulatedAt.toISOString(),
    };
  };
}

export class MatterhornCryptoEvidenceWalrusDeletionService {
  private readonly intentState: MatterhornDurableAuthorizedState;

  constructor(
    private readonly store: MatterhornCryptoEvidenceStore,
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    authority: MatterhornDurableStateAuthority,
    private readonly buildTransaction: MatterhornWalrusDeletionTransactionBuilder,
    private readonly verifyTransaction: MatterhornSuiTransactionStatusVerifier,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
  ) {
    const integrityCode = "crypto_evidence_walrus_deletion_intent_integrity_invalid";
    this.intentState = new MatterhornDurableAuthorizedState(
      stateStore,
      authority,
      STATE_KIND,
      integrityCode,
      () => new MatterhornCryptoEvidenceWalrusDeletionError(integrityCode),
    );
  }

  async prepare(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    signer: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceWalrusDeletionPrepareResponse> {
    if (input.signal.aborted) fail("crypto_evidence_walrus_aborted");
    const signer = canonicalSigner(input.signer);
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const existing = this.intentState.get<DeletionIntentRecord>(input.evidenceId, now.getTime());
    if (existing) {
      assertIntentTenant(existing, input);
      if (!this.store.hasWalrusDeletionClaim({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        expectedRevision: existing.preview.evidenceRevision,
        claimId: existing.claimId,
        now,
      })) {
        this.intentState.delete(input.evidenceId);
      } else {
        if (existing.preview.evidenceRevision !== input.expectedRevision
          || existing.preview.signer !== signer) {
          fail("crypto_evidence_walrus_deletion_in_progress");
        }
        return this.prepareResponse(existing.preview);
      }
    }
    this.intentState.delete(input.evidenceId);
    const candidate = this.store.beginWalrusDeletion({
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
      const certification = await this.verifyCertification({
        network: "testnet",
        blobId: proof.blobId,
        suiObjectId: proof.suiObjectId,
        signal: input.signal,
      });
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
      if (!certification.deletable) fail("crypto_evidence_walrus_not_deletable");
      const lifecycle = assessMatterhornWalrusStorageLifecycle({
        currentEpoch: certification.currentEpoch,
        validUntilEpoch: certification.validUntilEpoch,
      });
      if (lifecycle.status === "expired") fail("crypto_evidence_walrus_certification_expired");
      const built = await this.buildTransaction({
        network: SUI_TESTNET_NETWORK,
        signer,
        blobObjectId: proof.suiObjectId,
        signal: input.signal,
      });
      const transactionBytes = canonicalTransactionBytes(built.transactionBytesBase64);
      try {
        if (TransactionDataBuilder.getDigestFromBytes(transactionBytes)
          !== transactionDigest(built.transactionDigest)) {
          fail("crypto_evidence_walrus_deletion_transaction_invalid");
        }
      } finally {
        transactionBytes.fill(0);
      }
      if (!/^[a-f0-9]{64}$/.test(built.simulationReference)
        || !Number.isFinite(Date.parse(built.simulatedAt))
        || Math.abs(Date.parse(built.simulatedAt) - now.getTime()) > 30_000) {
        fail("crypto_evidence_walrus_deletion_simulation_invalid");
      }
      const previewWithoutHash: Omit<MatterhornCryptoEvidenceWalrusDeletionPreview, "intentHash"> = {
        version: MATTERHORN_CRYPTO_EVIDENCE_WALRUS_DELETION_VERSION,
        intentId: `crypto_evidence_deletion_${randomUUID().replaceAll("-", "")}`,
        evidenceId: input.evidenceId,
        evidenceRevision: input.expectedRevision,
        network: "testnet",
        signer,
        blobId: proof.blobId,
        suiObjectId: proof.suiObjectId,
        ciphertextSha256: record.index.ciphertextHash,
        transactionBytesBase64: built.transactionBytesBase64,
        transactionDigest: built.transactionDigest,
        simulationReference: built.simulationReference,
        simulatedAt: built.simulatedAt,
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
        walletAuthority: "connected_wallet_only",
      };
      const preview: MatterhornCryptoEvidenceWalrusDeletionPreview = {
        ...previewWithoutHash,
        intentHash: sha256(intentHashPayload(previewWithoutHash)),
      };
      assertPreview(preview);
      if (!this.intentState.putIfAbsent({
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
      })) fail("crypto_evidence_walrus_deletion_in_progress");
      retainedClaim = true;
      return this.prepareResponse(preview);
    } finally {
      if (!retainedClaim) {
        this.store.endWalrusDeletion({
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
  }): Promise<MatterhornCryptoEvidenceWalrusDeletionConfirmResponse> {
    if (input.signal.aborted) fail("crypto_evidence_walrus_aborted");
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const record = this.intentState.get<DeletionIntentRecord>(input.evidenceId, now.getTime());
    if (!record) fail("crypto_evidence_walrus_deletion_expired_or_replayed");
    assertIntentTenant(record, input);
    const preview = record.preview;
    if (preview.intentId !== input.intentId
      || preview.intentHash !== input.intentHash
      || preview.transactionDigest !== transactionDigest(input.transactionDigest)) {
      fail("crypto_evidence_walrus_deletion_intent_mismatch");
    }
    if (!this.store.hasWalrusDeletionClaim({
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
      expectedRevision: preview.evidenceRevision,
      claimId: record.claimId,
      now,
    })) fail("crypto_evidence_walrus_deletion_expired_or_replayed");
    const transaction = await this.verifyTransaction({
      network: SUI_TESTNET_NETWORK,
      digest: preview.transactionDigest,
      signer: preview.signer,
      signal: input.signal,
    });
    if (transaction.digest !== preview.transactionDigest
      || canonicalSigner(transaction.signer) !== preview.signer) {
      fail("crypto_evidence_walrus_deletion_transaction_mismatch");
    }
    if (transaction.status !== "confirmed") fail("crypto_evidence_walrus_deletion_transaction_failed");
    const finalizedAt = input.now ?? new Date();
    if (!Number.isFinite(finalizedAt.getTime())) fail("crypto_evidence_time_invalid");
    const item = await this.store.destroyKey({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      evidenceId: input.evidenceId,
      expectedRevision: preview.evidenceRevision,
      walrusDeletion: {
        expectedBlobId: preview.blobId,
        expectedSuiObjectId: preview.suiObjectId,
        transactionDigest: transaction.digest,
        deletedAt: transaction.observedAt,
      },
      claimId: record.claimId,
      now: finalizedAt,
    });
    const consumed = this.stateStore.transaction(() => {
      const current = this.intentState.take<DeletionIntentRecord>(
        input.evidenceId,
        finalizedAt.getTime(),
      );
      if (!current) fail("crypto_evidence_walrus_deletion_expired_or_replayed");
      assertIntentTenant(current, input);
      if (canonicalJson(current.preview) !== canonicalJson(preview)) {
        fail("crypto_evidence_walrus_deletion_intent_mismatch");
      }
      return current;
    });
    if (!consumed) fail("crypto_evidence_walrus_deletion_expired_or_replayed");
    const verification: MatterhornEvidenceVerificationStatus = {
      status: "deleted",
      verifiedAt: finalizedAt.toISOString(),
      checks: {
        tenantScope: true,
        ciphertextHash: true,
        merkleInclusion: true,
        suiCertification: true,
        walrusReadback: false,
      },
      currentEpoch: null,
      reason: "wallet_walrus_deletion_verified",
    };
    this.store.recordVerificationStatus({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      evidenceId: input.evidenceId,
      expectedRevision: item.revision,
      verification,
    });
    return {
      item: cryptoEvidenceAccountPacket(item, verification),
      verification,
      deletion: {
        walrusDeletionConfirmed: true,
        recoveryKeyDestroyed: true,
        contentRecoverable: false,
        publicTransactionMayRemain: true,
      },
    };
  }

  private prepareResponse(
    preview: MatterhornCryptoEvidenceWalrusDeletionPreview,
  ): MatterhornCryptoEvidenceWalrusDeletionPrepareResponse {
    return {
      preview: structuredClone(preview),
      disclosure: {
        network: "testnet",
        walletAction: "delete_walrus_blob",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
        recoveryKeyDestroyedAfterConfirmation: true,
        publicTransactionMayRemain: true,
      },
    };
  }
}
