import { randomUUID } from "node:crypto";

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { walrus } from "@mysten/walrus";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import {
  MATTERHORN_AGENT_FILE_WALRUS_RENEWAL_VERSION,
  type MatterhornAgentFileWalrusRenewalConfirmResponse,
  type MatterhornAgentFileWalrusRenewalPrepareResponse,
  type MatterhornAgentFileWalrusRenewalPreview,
  type MatterhornAgentFileWalrusVerification,
  type MatterhornAgentFileWalrusPublication,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornAgentFileStore } from "./agent-file-store.js";
import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
import {
  type MatterhornAdapterDnsResolver,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";
import type { MatterhornWalrusCertificationVerifier } from "./crypto-evidence-walrus-publisher.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import { assessMatterhornWalrusStorageLifecycle } from "./walrus-storage-lifecycle.js";

const STATE_KIND = "agent_file_renewal_intent";
const INTENT_TTL_MS = 5 * 60_000;
const MAX_TRANSACTION_BYTES = 256 * 1_024;
const SUI_TESTNET_NETWORK = "sui:testnet" as const;

type RenewalIntentRecord = {
  workspaceId: string;
  ownerId: string;
  preview: MatterhornAgentFileWalrusRenewalPreview;
};

export type MatterhornWalrusRenewalTransactionBuilder = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  signer: string;
  blobObjectId: string;
  extensionEpochs: number;
  signal: AbortSignal;
}) => Promise<{
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
}>;

export type MatterhornSuiTransactionStatusVerifier = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  digest: string;
  signer: string;
  signal: AbortSignal;
}) => Promise<{
  digest: string;
  signer: string;
  status: "confirmed" | "failed";
  observedAt: string;
}>;

export class MatterhornAgentFileWalrusRenewalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatterhornAgentFileWalrusRenewalError";
  }
}

function fail(code: string): never {
  throw new MatterhornAgentFileWalrusRenewalError(code);
}

function canonicalSigner(value: string): string {
  try {
    const normalized = normalizeSuiAddress(value);
    if (!isValidSuiAddress(normalized)) return fail("agent_file_walrus_renewal_signer_invalid");
    return normalized;
  } catch {
    return fail("agent_file_walrus_renewal_signer_invalid");
  }
}

function canonicalTransactionBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return fail("agent_file_walrus_renewal_transaction_invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength < 1
    || bytes.byteLength > MAX_TRANSACTION_BYTES
    || bytes.toString("base64") !== value) {
    bytes.fill(0);
    return fail("agent_file_walrus_renewal_transaction_invalid");
  }
  return bytes;
}

function transactionDigest(value: string): string {
  const digest = value.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(digest)) {
    return fail("agent_file_walrus_renewal_transaction_invalid");
  }
  return digest;
}

function intentHashPayload(preview: Omit<MatterhornAgentFileWalrusRenewalPreview, "intentHash">) {
  return {
    domain: "matterhorn:agent-file-walrus-renewal:v1",
    version: preview.version,
    intentId: preview.intentId,
    fileId: preview.fileId,
    fileRevision: preview.fileRevision,
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

function assertPreview(value: MatterhornAgentFileWalrusRenewalPreview): void {
  if (value.version !== MATTERHORN_AGENT_FILE_WALRUS_RENEWAL_VERSION
    || !/^agent_file_renewal_[a-f0-9]{32}$/.test(value.intentId)
    || !/^agent_file_[a-f0-9]{32}$/.test(value.fileId)
    || !Number.isSafeInteger(value.fileRevision) || value.fileRevision < 1
    || value.network !== "testnet"
    || !value.blobId || value.blobId.length > 256
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
    fail("agent_file_walrus_renewal_intent_invalid");
  }
  canonicalSigner(value.signer);
  const bytes = canonicalTransactionBytes(value.transactionBytesBase64);
  try {
    const digest = transactionDigest(value.transactionDigest);
    if (TransactionDataBuilder.getDigestFromBytes(bytes) !== digest) {
      fail("agent_file_walrus_renewal_transaction_invalid");
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
    fail("agent_file_walrus_renewal_intent_invalid");
  }
  const { intentHash: _, ...withoutHash } = value;
  if (sha256(intentHashPayload(withoutHash)) !== value.intentHash) {
    fail("agent_file_walrus_renewal_intent_invalid");
  }
}

function assertIntentTenant(record: RenewalIntentRecord, input: {
  workspaceId: string;
  ownerId: string;
  fileId: string;
}): void {
  assertPreview(record.preview);
  if (record.workspaceId !== input.workspaceId
    || record.ownerId !== input.ownerId
    || record.preview.fileId !== input.fileId) {
    fail("agent_file_not_found");
  }
}

function verification(input: {
  publication: MatterhornAgentFileWalrusPublication;
  currentEpoch: number;
  verifiedAt: string;
}): MatterhornAgentFileWalrusVerification {
  return {
    verified: true,
    network: "testnet",
    blobId: input.publication.blobId,
    suiObjectId: input.publication.suiObjectId,
    ciphertextSha256: input.publication.ciphertextSha256,
    certifiedEpoch: input.publication.certifiedEpoch,
    currentEpoch: input.currentEpoch,
    validUntilEpoch: input.publication.validUntilEpoch,
    verifiedAt: input.verifiedAt,
    lifecycle: assessMatterhornWalrusStorageLifecycle({
      currentEpoch: input.currentEpoch,
      validUntilEpoch: input.publication.validUntilEpoch,
    }),
  };
}

export function createPinnedWalrusRenewalTransactionBuilder(options: {
  endpoint: string;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): MatterhornWalrusRenewalTransactionBuilder {
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) fail("agent_file_walrus_mainnet_disabled");
    if (input.signal.aborted) fail("agent_file_walrus_aborted");
    const signer = canonicalSigner(input.signer);
    if (!Number.isSafeInteger(input.extensionEpochs)
      || input.extensionEpochs < 1
      || input.extensionEpochs > 53) fail("agent_file_walrus_renewal_epochs_invalid");
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
    const transaction = await client.walrus.extendBlobTransaction({
      blobObjectId: input.blobObjectId,
      epochs: input.extensionEpochs,
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
      fail("agent_file_walrus_renewal_simulation_failed");
    }
    const simulatedAt = now();
    if (!Number.isFinite(simulatedAt.getTime())) fail("agent_file_time_invalid");
    return {
      transactionBytesBase64: Buffer.from(bytes).toString("base64"),
      transactionDigest: digest,
      simulationReference: sha256({
        domain: "matterhorn:walrus-renewal-simulation:v1",
        transactionDigest: digest,
        status: "success",
      }),
      simulatedAt: simulatedAt.toISOString(),
    };
  };
}

export function createPinnedSuiTransactionStatusVerifier(options: {
  endpoint: string;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): MatterhornSuiTransactionStatusVerifier {
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) fail("agent_file_walrus_mainnet_disabled");
    if (input.signal.aborted) fail("agent_file_walrus_aborted");
    const expectedDigest = transactionDigest(input.digest);
    const expectedSigner = canonicalSigner(input.signer);
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
    const client = new SuiGrpcClient({ network: "testnet", transport });
    const result = await client.getTransaction({
      digest: expectedDigest,
      include: { transaction: true, effects: true },
      signal: input.signal,
    });
    const observed = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
    const sender = observed.transaction?.sender;
    if (observed.digest !== expectedDigest || !sender || canonicalSigner(sender) !== expectedSigner) {
      fail("agent_file_walrus_renewal_transaction_mismatch");
    }
    const observedAt = now();
    if (!Number.isFinite(observedAt.getTime())) fail("agent_file_time_invalid");
    return {
      digest: observed.digest,
      signer: expectedSigner,
      status: observed.status.success ? "confirmed" : "failed",
      observedAt: observedAt.toISOString(),
    };
  };
}

export class MatterhornAgentFileWalrusRenewalService {
  constructor(
    private readonly store: MatterhornAgentFileStore,
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly buildTransaction: MatterhornWalrusRenewalTransactionBuilder,
    private readonly verifyTransaction: MatterhornSuiTransactionStatusVerifier,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
    private readonly extensionEpochs = 5,
  ) {
    if (!Number.isSafeInteger(extensionEpochs) || extensionEpochs < 1 || extensionEpochs > 53) {
      fail("agent_file_walrus_renewal_epochs_invalid");
    }
  }

  async prepare(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision: number;
    signer: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornAgentFileWalrusRenewalPrepareResponse> {
    if (input.signal.aborted) fail("agent_file_walrus_aborted");
    const signer = canonicalSigner(input.signer);
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("agent_file_time_invalid");
    const existing = this.stateStore.get<RenewalIntentRecord>(STATE_KIND, input.fileId, now.getTime());
    if (existing) {
      assertIntentTenant(existing, input);
      if (existing.preview.fileRevision !== input.expectedRevision
        || existing.preview.signer !== signer
        || existing.preview.extensionEpochs !== this.extensionEpochs) {
        fail("agent_file_walrus_renewal_in_progress");
      }
      return this.prepareResponse(existing.preview);
    }
    this.stateStore.delete(STATE_KIND, input.fileId);
    const candidate = this.store.publicationCandidate({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      fileId: input.fileId,
      expectedRevision: input.expectedRevision,
      now,
    });
    try {
      const publication = candidate.item.publication;
      if (!publication) fail("agent_file_walrus_not_published");
      if (candidate.ciphertextSha256 !== publication.ciphertextSha256) {
        fail("agent_file_walrus_ciphertext_mismatch");
      }
      const certification = await this.verifyCertification({
        network: "testnet",
        blobId: publication.blobId,
        suiObjectId: publication.suiObjectId,
        signal: input.signal,
      });
      if (certification.network !== "testnet"
        || certification.blobId !== publication.blobId
        || certification.suiObjectId !== publication.suiObjectId
        || certification.certifiedEpoch !== publication.certifiedEpoch
        || certification.validUntilEpoch !== publication.validUntilEpoch
        || certification.suiTransactionDigest !== publication.suiTransactionDigest) {
        fail("agent_file_walrus_certification_changed");
      }
      const lifecycle = assessMatterhornWalrusStorageLifecycle({
        currentEpoch: certification.currentEpoch,
        validUntilEpoch: certification.validUntilEpoch,
      });
      if (lifecycle.status === "expired") fail("agent_file_walrus_certification_expired");
      if (lifecycle.status !== "renewal_due") fail("agent_file_walrus_renewal_not_due");
      const targetValidUntilEpoch = certification.validUntilEpoch + this.extensionEpochs;
      if (targetValidUntilEpoch - certification.currentEpoch > 53) {
        fail("agent_file_walrus_renewal_epochs_invalid");
      }
      const built = await this.buildTransaction({
        network: SUI_TESTNET_NETWORK,
        signer,
        blobObjectId: publication.suiObjectId,
        extensionEpochs: this.extensionEpochs,
        signal: input.signal,
      });
      const transactionBytes = canonicalTransactionBytes(built.transactionBytesBase64);
      try {
        if (TransactionDataBuilder.getDigestFromBytes(transactionBytes)
          !== transactionDigest(built.transactionDigest)) {
          fail("agent_file_walrus_renewal_transaction_invalid");
        }
      } finally {
        transactionBytes.fill(0);
      }
      if (!/^[a-f0-9]{64}$/.test(built.simulationReference)
        || !Number.isFinite(Date.parse(built.simulatedAt))
        || Math.abs(Date.parse(built.simulatedAt) - now.getTime()) > 30_000) {
        fail("agent_file_walrus_renewal_simulation_invalid");
      }
      const previewWithoutHash: Omit<MatterhornAgentFileWalrusRenewalPreview, "intentHash"> = {
        version: MATTERHORN_AGENT_FILE_WALRUS_RENEWAL_VERSION,
        intentId: `agent_file_renewal_${randomUUID().replaceAll("-", "")}`,
        fileId: input.fileId,
        fileRevision: input.expectedRevision,
        network: "testnet",
        signer,
        blobId: publication.blobId,
        suiObjectId: publication.suiObjectId,
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
      const preview: MatterhornAgentFileWalrusRenewalPreview = {
        ...previewWithoutHash,
        intentHash: sha256(intentHashPayload(previewWithoutHash)),
      };
      assertPreview(preview);
      const record: RenewalIntentRecord = { workspaceId: input.workspaceId, ownerId: input.ownerId, preview };
      if (!this.stateStore.putIfAbsent({
        kind: STATE_KIND,
        key: input.fileId,
        workspaceId: input.workspaceId,
        value: record,
        expiresAtMs: Date.parse(preview.expiresAt),
        nowMs: now.getTime(),
      })) fail("agent_file_walrus_renewal_in_progress");
      return this.prepareResponse(preview);
    } finally {
      candidate.bytes.fill(0);
    }
  }

  async confirm(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    intentId: string;
    intentHash: string;
    transactionDigest: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornAgentFileWalrusRenewalConfirmResponse> {
    if (input.signal.aborted) fail("agent_file_walrus_aborted");
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("agent_file_time_invalid");
    const record = this.stateStore.get<RenewalIntentRecord>(STATE_KIND, input.fileId, now.getTime());
    if (!record) fail("agent_file_walrus_renewal_expired_or_replayed");
    assertIntentTenant(record, input);
    const preview = record.preview;
    if (preview.intentId !== input.intentId
      || preview.intentHash !== input.intentHash
      || preview.transactionDigest !== transactionDigest(input.transactionDigest)) {
      fail("agent_file_walrus_renewal_intent_mismatch");
    }
    const transaction = await this.verifyTransaction({
      network: SUI_TESTNET_NETWORK,
      digest: preview.transactionDigest,
      signer: preview.signer,
      signal: input.signal,
    });
    if (transaction.digest !== preview.transactionDigest
      || canonicalSigner(transaction.signer) !== preview.signer) {
      fail("agent_file_walrus_renewal_transaction_mismatch");
    }
    if (transaction.status !== "confirmed") fail("agent_file_walrus_renewal_transaction_failed");
    const certification = await this.verifyCertification({
      network: "testnet",
      blobId: preview.blobId,
      suiObjectId: preview.suiObjectId,
      signal: input.signal,
    });
    if (certification.network !== "testnet"
      || certification.blobId !== preview.blobId
      || certification.suiObjectId !== preview.suiObjectId
      || certification.validUntilEpoch !== preview.targetValidUntilEpoch
      || certification.currentEpoch >= certification.validUntilEpoch) {
      fail("agent_file_walrus_renewal_certification_mismatch");
    }
    const currentItem = this.store.get({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      fileId: input.fileId,
      now,
    });
    const currentPublication = currentItem?.publication;
    if (!currentPublication) fail("agent_file_walrus_not_published");
    const renewedPublication: MatterhornAgentFileWalrusPublication = {
      ...currentPublication,
      validUntilEpoch: certification.validUntilEpoch,
      renewalTransactionDigest: transaction.digest,
      renewedAt: transaction.observedAt,
      verifiedAt: now.toISOString(),
    };
    const item = this.stateStore.transaction(() => {
      const consumed = this.stateStore.take<RenewalIntentRecord>(STATE_KIND, input.fileId, now.getTime());
      if (!consumed) fail("agent_file_walrus_renewal_expired_or_replayed");
      assertIntentTenant(consumed, input);
      if (canonicalJson(consumed.preview) !== canonicalJson(preview)) {
        fail("agent_file_walrus_renewal_intent_mismatch");
      }
      return this.store.renewWalrusPublication({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        fileId: input.fileId,
        expectedRevision: preview.fileRevision,
        expectedBlobId: preview.blobId,
        expectedSuiObjectId: preview.suiObjectId,
        expectedCiphertextSha256: currentPublication.ciphertextSha256,
        expectedPreviousValidUntilEpoch: preview.previousValidUntilEpoch,
        publication: renewedPublication,
        now,
      });
    });
    return {
      item,
      verification: verification({
        publication: renewedPublication,
        currentEpoch: certification.currentEpoch,
        verifiedAt: now.toISOString(),
      }),
    };
  }

  private prepareResponse(preview: MatterhornAgentFileWalrusRenewalPreview): MatterhornAgentFileWalrusRenewalPrepareResponse {
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
