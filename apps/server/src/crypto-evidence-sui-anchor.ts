import { randomUUID } from "node:crypto";

import { bcs } from "@mysten/sui/bcs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import {
  fromBase64,
  isValidSuiAddress,
  isValidSuiObjectId,
  isValidTransactionDigest,
  normalizeSuiAddress,
  normalizeSuiObjectId,
  normalizeStructTag,
} from "@mysten/sui/utils";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import {
  MATTERHORN_CRYPTO_EVIDENCE_SUI_ANCHOR_VERSION,
  MATTERHORN_SUI_EVIDENCE_ANCHOR_VERSION,
  type MatterhornCryptoEvidenceSuiAnchorConfirmResponse,
  type MatterhornCryptoEvidenceSuiAnchorPrepareResponse,
  type MatterhornCryptoEvidenceSuiAnchorPreview,
  type MatterhornSuiEvidenceAnchor,
} from "@matterhorn-work/types/crypto-coworkers";

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
import type { MatterhornWalrusCertificationVerifier } from "./crypto-evidence-walrus-publisher.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const STATE_KIND = "crypto_evidence_sui_anchor_intent";
const INTENT_TTL_MS = 5 * 60_000;
const MAX_TRANSACTION_BYTES = 256 * 1_024;
const SUI_TESTNET_NETWORK = "sui:testnet" as const;
const ANCHOR_MODULE = "evidence_anchor";
const ANCHOR_FUNCTION = "anchor";

type AnchorIntentRecord = {
  workspaceId: string;
  ownerId: string;
  claimId: string;
  preview: MatterhornCryptoEvidenceSuiAnchorPreview;
};

type SuiArgument = {
  $kind?: "GasCoin" | "Input" | "Result" | "NestedResult";
  GasCoin?: true;
  Input?: number;
  Result?: number;
  NestedResult?: [number, number];
};

type SuiCommand = { $kind?: string; [key: string]: unknown };

export type MatterhornSuiEvidenceAnchorProjection = {
  digest: string;
  success: boolean;
  sender: string;
  gasOwner: string | null;
  commands: SuiCommand[];
  inputs: unknown[];
  changedObjects: SuiClientTypes.ChangedObject[];
  objectTypes: Record<string, string>;
  epoch: string | null;
};

export type MatterhornSuiEvidenceAnchorTransactionBuilder = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  signer: string;
  packageId: string;
  batchId: string;
  merkleRoot: string;
  walrusObjectId: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
  signal: AbortSignal;
}) => Promise<{
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
}>;

export type MatterhornSuiEvidenceAnchorTransactionVerifier = (input: {
  network: typeof SUI_TESTNET_NETWORK;
  digest: string;
  signer: string;
  packageId: string;
  batchId: string;
  merkleRoot: string;
  walrusObjectId: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
  signal: AbortSignal;
}) => Promise<{
  objectId: string;
  observedAt: string;
}>;

type SuiAnchorReadClient = {
  getTransaction(input: {
    digest: string;
    signal: AbortSignal;
  }): Promise<MatterhornSuiEvidenceAnchorProjection>;
};

export class MatterhornCryptoEvidenceSuiAnchorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoEvidenceSuiAnchorError";
  }
}

function fail(code: string): never {
  throw new MatterhornCryptoEvidenceSuiAnchorError(code);
}

function canonicalSigner(value: string): string {
  try {
    const normalized = normalizeSuiAddress(value);
    if (!isValidSuiAddress(normalized)) return fail("crypto_evidence_sui_anchor_signer_invalid");
    return normalized;
  } catch {
    return fail("crypto_evidence_sui_anchor_signer_invalid");
  }
}

function canonicalObjectId(value: string, code: string): string {
  try {
    const normalized = normalizeSuiObjectId(value);
    if (!isValidSuiObjectId(normalized)) return fail(code);
    return normalized;
  } catch {
    return fail(code);
  }
}

function canonicalHash(value: string, code: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function canonicalDigest(value: string): string {
  const digest = value.trim();
  if (!isValidTransactionDigest(digest)) fail("crypto_evidence_sui_anchor_transaction_invalid");
  return digest;
}

function canonicalEpoch(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function canonicalTransactionBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail("crypto_evidence_sui_anchor_transaction_invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength < 1
    || bytes.byteLength > MAX_TRANSACTION_BYTES
    || bytes.toString("base64") !== value) {
    bytes.fill(0);
    fail("crypto_evidence_sui_anchor_transaction_invalid");
  }
  return bytes;
}

function batchId(input: {
  merkleRoot: string;
  blobId: string;
  walrusObjectId: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
}): string {
  return sha256({
    domain: "matterhorn:sui-evidence-anchor-batch:v1",
    network: "testnet",
    merkleRoot: input.merkleRoot,
    blobId: input.blobId,
    walrusObjectId: input.walrusObjectId,
    certifiedEpoch: input.certifiedEpoch,
    validUntilEpoch: input.validUntilEpoch,
  });
}

function intentHashPayload(preview: Omit<MatterhornCryptoEvidenceSuiAnchorPreview, "intentHash">) {
  const { transactionBytesBase64: _, ...bound } = preview;
  return {
    domain: "matterhorn:crypto-evidence-sui-anchor:v1",
    ...bound,
  };
}

function assertPreview(value: MatterhornCryptoEvidenceSuiAnchorPreview): void {
  if (value.version !== MATTERHORN_CRYPTO_EVIDENCE_SUI_ANCHOR_VERSION
    || !/^crypto_evidence_anchor_[a-f0-9]{32}$/.test(value.intentId)
    || !/^evidence_[A-Za-z0-9_-]{1,120}$/.test(value.evidenceId)
    || !Number.isSafeInteger(value.evidenceRevision) || value.evidenceRevision < 1
    || value.network !== "testnet"
    || value.walletAuthority !== "connected_wallet_only") {
    fail("crypto_evidence_sui_anchor_intent_invalid");
  }
  canonicalSigner(value.signer);
  canonicalObjectId(value.packageId, "crypto_evidence_sui_anchor_package_invalid");
  canonicalHash(value.batchId, "crypto_evidence_sui_anchor_batch_invalid");
  canonicalHash(value.merkleRoot, "crypto_evidence_sui_anchor_merkle_root_invalid");
  canonicalObjectId(value.walrusObjectId, "crypto_evidence_sui_anchor_walrus_object_invalid");
  const certifiedEpoch = canonicalEpoch(value.certifiedEpoch, "crypto_evidence_sui_anchor_epoch_invalid");
  const validUntilEpoch = canonicalEpoch(value.validUntilEpoch, "crypto_evidence_sui_anchor_epoch_invalid");
  if (validUntilEpoch <= certifiedEpoch || validUntilEpoch - certifiedEpoch > 53) {
    fail("crypto_evidence_sui_anchor_epoch_invalid");
  }
  canonicalHash(value.intentHash, "crypto_evidence_sui_anchor_intent_invalid");
  canonicalHash(value.simulationReference, "crypto_evidence_sui_anchor_simulation_invalid");
  const bytes = canonicalTransactionBytes(value.transactionBytesBase64);
  try {
    if (TransactionDataBuilder.getDigestFromBytes(bytes) !== canonicalDigest(value.transactionDigest)) {
      fail("crypto_evidence_sui_anchor_transaction_invalid");
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
    fail("crypto_evidence_sui_anchor_intent_invalid");
  }
  const { intentHash: _, ...withoutHash } = value;
  if (sha256(intentHashPayload(withoutHash)) !== value.intentHash) {
    fail("crypto_evidence_sui_anchor_intent_invalid");
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function enumKind(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  const present = allowed.filter((key) => Object.hasOwn(value, key));
  if (typeof value.$kind === "string") {
    if (!allowed.includes(value.$kind) || present.length !== 1 || present[0] !== value.$kind) return null;
    return value.$kind;
  }
  return present.length === 1 ? present[0]! : null;
}

function inputIndex(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("crypto_evidence_sui_anchor_commands_mismatch");
  }
  const argument = value as SuiArgument;
  if (enumKind(argument as Record<string, unknown>, ["GasCoin", "Input", "Result", "NestedResult"]) !== "Input"
    || !hasOnlyKeys(argument as Record<string, unknown>, ["$kind", "Input"])
    || !Number.isSafeInteger(argument.Input)
    || Number(argument.Input) < 0) {
    fail("crypto_evidence_sui_anchor_commands_mismatch");
  }
  return Number(argument.Input);
}

function pureBytes(inputs: unknown[], index: number): Uint8Array {
  const candidate = inputs[index];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("crypto_evidence_sui_anchor_inputs_mismatch");
  }
  const pure = candidate as { $kind?: unknown; Pure?: unknown };
  if (pure.$kind !== "Pure"
    || !hasOnlyKeys(pure as Record<string, unknown>, ["$kind", "Pure"])
    || !pure.Pure || typeof pure.Pure !== "object" || Array.isArray(pure.Pure)
    || !hasOnlyKeys(pure.Pure as Record<string, unknown>, ["bytes"])
    || typeof (pure.Pure as { bytes?: unknown }).bytes !== "string") {
    fail("crypto_evidence_sui_anchor_inputs_mismatch");
  }
  try {
    return fromBase64((pure.Pure as { bytes: string }).bytes);
  } catch {
    return fail("crypto_evidence_sui_anchor_inputs_mismatch");
  }
}

function assertExactAnchorCall(input: {
  transaction: MatterhornSuiEvidenceAnchorProjection;
  packageId: string;
  batchId: string;
  merkleRoot: string;
  walrusObjectId: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
}): string {
  if (input.transaction.commands.length !== 1 || input.transaction.inputs.length !== 5) {
    fail("crypto_evidence_sui_anchor_commands_mismatch");
  }
  const command = input.transaction.commands[0];
  if (!command
    || enumKind(command, ["SplitCoins", "TransferObjects", "MoveCall", "MergeCoins", "Publish", "MakeMoveVec", "Upgrade", "$Intent"]) !== "MoveCall"
    || !hasOnlyKeys(command, ["$kind", "MoveCall"])
    || !command.MoveCall || typeof command.MoveCall !== "object" || Array.isArray(command.MoveCall)) {
    fail("crypto_evidence_sui_anchor_commands_mismatch");
  }
  const move = command.MoveCall as Record<string, unknown>;
  if (!hasOnlyKeys(move, ["package", "module", "function", "typeArguments", "arguments"])
    || canonicalObjectId(String(move.package), "crypto_evidence_sui_anchor_package_mismatch") !== input.packageId
    || move.module !== ANCHOR_MODULE
    || move.function !== ANCHOR_FUNCTION
    || !Array.isArray(move.typeArguments) || move.typeArguments.length !== 0
    || !Array.isArray(move.arguments) || move.arguments.length !== 5) {
    fail("crypto_evidence_sui_anchor_commands_mismatch");
  }
  const indices = move.arguments.map(inputIndex);
  if (indices.some((value, index) => value !== index)) {
    fail("crypto_evidence_sui_anchor_inputs_mismatch");
  }
  try {
    const observedBatch = Buffer.from(bcs.vector(bcs.U8).parse(pureBytes(input.transaction.inputs, 0))).toString("hex");
    const observedRoot = Buffer.from(bcs.vector(bcs.U8).parse(pureBytes(input.transaction.inputs, 1))).toString("hex");
    const observedWalrusObject = normalizeSuiObjectId(bcs.Address.parse(pureBytes(input.transaction.inputs, 2)));
    const observedCertifiedEpoch = BigInt(bcs.U64.parse(pureBytes(input.transaction.inputs, 3)));
    const observedValidUntilEpoch = BigInt(bcs.U64.parse(pureBytes(input.transaction.inputs, 4)));
    if (observedBatch !== input.batchId
      || observedRoot !== input.merkleRoot
      || observedWalrusObject !== input.walrusObjectId
      || observedCertifiedEpoch !== BigInt(input.certifiedEpoch)
      || observedValidUntilEpoch !== BigInt(input.validUntilEpoch)) {
      fail("crypto_evidence_sui_anchor_inputs_mismatch");
    }
  } catch (error) {
    if (error instanceof MatterhornCryptoEvidenceSuiAnchorError) throw error;
    fail("crypto_evidence_sui_anchor_inputs_mismatch");
  }

  const expectedType = normalizeStructTag(`${input.packageId}::${ANCHOR_MODULE}::EvidenceAnchor`);
  const created = input.transaction.changedObjects.filter((change) => change.idOperation === "Created");
  if (created.length !== 1) fail("crypto_evidence_sui_anchor_created_object_mismatch");
  const object = created[0]!;
  const owner = object.outputOwner as Record<string, unknown> | null;
  if (!owner
    || enumKind(owner, ["AddressOwner", "ObjectOwner", "Shared", "Immutable", "ConsensusAddressOwner", "Unknown"]) !== "Immutable"
    || !hasOnlyKeys(owner, ["$kind", "Immutable"])
    || owner.Immutable !== true
    || normalizeStructTag(input.transaction.objectTypes[object.objectId] ?? "") !== expectedType) {
    fail("crypto_evidence_sui_anchor_created_object_mismatch");
  }
  return canonicalObjectId(object.objectId, "crypto_evidence_sui_anchor_object_invalid");
}

function defaultReadClient(input: {
  endpoint: URL;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): SuiAnchorReadClient {
  const transport = new GrpcWebFetchTransport({
    baseUrl: input.endpoint.href.replace(/\/$/, ""),
    format: "binary",
    fetch: createPinnedSuiGrpcWebFetch({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      outerSignal: input.signal,
      onObservation: input.onObservation,
    }),
  });
  const client = new SuiGrpcClient({ network: "testnet", transport });
  return {
    async getTransaction(request) {
      const result = await client.getTransaction({
        digest: request.digest,
        include: { transaction: true, effects: true, objectTypes: true },
        signal: request.signal,
      });
      const transaction = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
      if (!transaction.transaction?.sender || !transaction.effects) {
        fail("crypto_evidence_sui_anchor_transaction_data_missing");
      }
      return {
        digest: transaction.digest,
        success: transaction.status.success,
        sender: transaction.transaction.sender,
        gasOwner: transaction.transaction.gasData.owner,
        commands: transaction.transaction.commands as unknown as SuiCommand[],
        inputs: transaction.transaction.inputs,
        changedObjects: transaction.effects.changedObjects,
        objectTypes: transaction.objectTypes ?? {},
        epoch: transaction.epoch,
      };
    },
  };
}

export function createPinnedSuiEvidenceAnchorTransactionBuilder(options: {
  endpoint: string;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
}): MatterhornSuiEvidenceAnchorTransactionBuilder {
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) fail("crypto_evidence_sui_anchor_mainnet_disabled");
    if (input.signal.aborted) fail("crypto_evidence_sui_anchor_aborted");
    const signer = canonicalSigner(input.signer);
    const packageId = canonicalObjectId(input.packageId, "crypto_evidence_sui_anchor_package_invalid");
    const walrusObjectId = canonicalObjectId(input.walrusObjectId, "crypto_evidence_sui_anchor_walrus_object_invalid");
    const batch = Buffer.from(canonicalHash(input.batchId, "crypto_evidence_sui_anchor_batch_invalid"), "hex");
    const root = Buffer.from(canonicalHash(input.merkleRoot, "crypto_evidence_sui_anchor_merkle_root_invalid"), "hex");
    const certifiedEpoch = canonicalEpoch(input.certifiedEpoch, "crypto_evidence_sui_anchor_epoch_invalid");
    const validUntilEpoch = canonicalEpoch(input.validUntilEpoch, "crypto_evidence_sui_anchor_epoch_invalid");
    if (validUntilEpoch <= certifiedEpoch || validUntilEpoch - certifiedEpoch > 53) {
      fail("crypto_evidence_sui_anchor_epoch_invalid");
    }
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
    const transaction = new Transaction();
    transaction.setSender(signer);
    transaction.moveCall({
      target: `${packageId}::${ANCHOR_MODULE}::${ANCHOR_FUNCTION}`,
      arguments: [
        transaction.pure.vector("u8", batch),
        transaction.pure.vector("u8", root),
        transaction.pure.address(walrusObjectId),
        transaction.pure.u64(certifiedEpoch),
        transaction.pure.u64(validUntilEpoch),
      ],
    });
    try {
      const bytes = await transaction.build({ client });
      const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
      const simulated = await client.simulateTransaction({
        transaction: bytes,
        include: { effects: true, objectTypes: true },
        signal: input.signal,
      });
      if (simulated.$kind === "FailedTransaction") {
        fail("crypto_evidence_sui_anchor_simulation_failed");
      }
      const simulatedAt = now();
      if (!Number.isFinite(simulatedAt.getTime())) fail("crypto_evidence_time_invalid");
      return {
        transactionBytesBase64: Buffer.from(bytes).toString("base64"),
        transactionDigest: digest,
        simulationReference: sha256({
          domain: "matterhorn:sui-evidence-anchor-simulation:v1",
          transactionDigest: digest,
          createdObjectTypes: simulated.Transaction.objectTypes ?? {},
          effects: simulated.Transaction.effects ?? null,
        }),
        simulatedAt: simulatedAt.toISOString(),
      };
    } finally {
      batch.fill(0);
      root.fill(0);
    }
  };
}

export function createPinnedSuiEvidenceAnchorTransactionVerifier(options: {
  endpoint: URL;
  resolver?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  createClient?: typeof defaultReadClient;
}): MatterhornSuiEvidenceAnchorTransactionVerifier {
  if (options.endpoint.protocol !== "https:"
    || options.endpoint.username
    || options.endpoint.password
    || options.endpoint.search
    || options.endpoint.hash) fail("crypto_evidence_sui_anchor_endpoint_invalid");
  const now = options.now ?? (() => new Date());
  const createClient = options.createClient ?? defaultReadClient;
  return async (input) => {
    if (input.network !== SUI_TESTNET_NETWORK) fail("crypto_evidence_sui_anchor_mainnet_disabled");
    if (input.signal.aborted) fail("crypto_evidence_sui_anchor_aborted");
    const digest = canonicalDigest(input.digest);
    const signer = canonicalSigner(input.signer);
    const packageId = canonicalObjectId(input.packageId, "crypto_evidence_sui_anchor_package_invalid");
    const resolved = await resolvePublicCryptoAdapterEndpoint(options.endpoint.href, options.resolver);
    let transaction: MatterhornSuiEvidenceAnchorProjection;
    try {
      transaction = await createClient({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        signal: input.signal,
        onObservation: options.onObservation,
      }).getTransaction({ digest, signal: input.signal });
    } catch (error) {
      if (error instanceof MatterhornCryptoEvidenceSuiAnchorError) throw error;
      if (input.signal.aborted) fail("crypto_evidence_sui_anchor_aborted");
      fail("crypto_evidence_sui_anchor_lookup_failed");
    }
    if (transaction.digest !== digest) fail("crypto_evidence_sui_anchor_transaction_mismatch");
    if (canonicalSigner(transaction.sender) !== signer
      || typeof transaction.gasOwner !== "string"
      || canonicalSigner(transaction.gasOwner) !== signer) {
      fail("crypto_evidence_sui_anchor_signer_mismatch");
    }
    if (!transaction.success) fail("crypto_evidence_sui_anchor_transaction_failed");
    if (typeof transaction.epoch !== "string" || !/^(?:0|[1-9][0-9]{0,19})$/.test(transaction.epoch)) {
      fail("crypto_evidence_sui_anchor_epoch_invalid");
    }
    const objectId = assertExactAnchorCall({
      transaction,
      packageId,
      batchId: canonicalHash(input.batchId, "crypto_evidence_sui_anchor_batch_invalid"),
      merkleRoot: canonicalHash(input.merkleRoot, "crypto_evidence_sui_anchor_merkle_root_invalid"),
      walrusObjectId: canonicalObjectId(input.walrusObjectId, "crypto_evidence_sui_anchor_walrus_object_invalid"),
      certifiedEpoch: canonicalEpoch(input.certifiedEpoch, "crypto_evidence_sui_anchor_epoch_invalid"),
      validUntilEpoch: canonicalEpoch(input.validUntilEpoch, "crypto_evidence_sui_anchor_epoch_invalid"),
    });
    const observedAt = now();
    if (!Number.isFinite(observedAt.getTime())) fail("crypto_evidence_time_invalid");
    return { objectId, observedAt: observedAt.toISOString() };
  };
}

export class MatterhornCryptoEvidenceSuiAnchorService {
  constructor(
    private readonly store: MatterhornCryptoEvidenceStore,
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly packageId: string,
    private readonly buildTransaction: MatterhornSuiEvidenceAnchorTransactionBuilder,
    private readonly verifyTransaction: MatterhornSuiEvidenceAnchorTransactionVerifier,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
  ) {
    this.packageId = canonicalObjectId(packageId, "crypto_evidence_sui_anchor_package_invalid");
  }

  async prepare(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    signer: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceSuiAnchorPrepareResponse> {
    if (input.signal.aborted) fail("crypto_evidence_sui_anchor_aborted");
    const signer = canonicalSigner(input.signer);
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const existing = this.stateStore.get<AnchorIntentRecord>(STATE_KIND, input.evidenceId, now.getTime());
    if (existing) {
      assertPreview(existing.preview);
      if (existing.workspaceId !== input.workspaceId
        || existing.ownerId !== input.ownerId
        || existing.preview.evidenceId !== input.evidenceId) fail("crypto_evidence_not_found");
      if (existing.preview.evidenceRevision !== input.expectedRevision
        || existing.preview.signer !== signer
        || existing.preview.packageId !== this.packageId) {
        fail("crypto_evidence_sui_anchor_in_progress");
      }
      return this.prepareResponse(existing.preview);
    }
    this.stateStore.delete(STATE_KIND, input.evidenceId);
    const claimed = this.store.beginSuiAnchor({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      evidenceId: input.evidenceId,
      expectedRevision: input.expectedRevision,
      now,
    });
    try {
      const proof = claimed.record.walrusProof!;
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
        || certification.currentEpoch >= certification.validUntilEpoch) {
        fail("crypto_evidence_sui_anchor_certification_changed");
      }
      const canonicalWalrusObjectId = canonicalObjectId(proof.suiObjectId, "crypto_evidence_sui_anchor_walrus_object_invalid");
      const exactBatchId = batchId({
        merkleRoot: proof.merkleRoot,
        blobId: proof.blobId,
        walrusObjectId: canonicalWalrusObjectId,
        certifiedEpoch: proof.certifiedEpoch,
        validUntilEpoch: proof.validUntilEpoch,
      });
      const built = await this.buildTransaction({
        network: SUI_TESTNET_NETWORK,
        signer,
        packageId: this.packageId,
        batchId: exactBatchId,
        merkleRoot: proof.merkleRoot,
        walrusObjectId: canonicalWalrusObjectId,
        certifiedEpoch: proof.certifiedEpoch,
        validUntilEpoch: proof.validUntilEpoch,
        signal: input.signal,
      });
      const transactionBytes = canonicalTransactionBytes(built.transactionBytesBase64);
      try {
        if (TransactionDataBuilder.getDigestFromBytes(transactionBytes) !== canonicalDigest(built.transactionDigest)) {
          fail("crypto_evidence_sui_anchor_transaction_invalid");
        }
      } finally {
        transactionBytes.fill(0);
      }
      if (!/^[a-f0-9]{64}$/.test(built.simulationReference)
        || !Number.isFinite(Date.parse(built.simulatedAt))
        || Math.abs(Date.parse(built.simulatedAt) - now.getTime()) > 30_000) {
        fail("crypto_evidence_sui_anchor_simulation_invalid");
      }
      const previewWithoutHash: Omit<MatterhornCryptoEvidenceSuiAnchorPreview, "intentHash"> = {
        version: MATTERHORN_CRYPTO_EVIDENCE_SUI_ANCHOR_VERSION,
        intentId: `crypto_evidence_anchor_${randomUUID().replaceAll("-", "")}`,
        evidenceId: input.evidenceId,
        evidenceRevision: input.expectedRevision,
        network: "testnet",
        signer,
        packageId: this.packageId,
        batchId: exactBatchId,
        merkleRoot: proof.merkleRoot,
        walrusObjectId: canonicalWalrusObjectId,
        certifiedEpoch: proof.certifiedEpoch,
        validUntilEpoch: proof.validUntilEpoch,
        transactionBytesBase64: built.transactionBytesBase64,
        transactionDigest: built.transactionDigest,
        simulationReference: built.simulationReference,
        simulatedAt: built.simulatedAt,
        expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
        walletAuthority: "connected_wallet_only",
      };
      const preview: MatterhornCryptoEvidenceSuiAnchorPreview = {
        ...previewWithoutHash,
        intentHash: sha256(intentHashPayload(previewWithoutHash)),
      };
      assertPreview(preview);
      const intent: AnchorIntentRecord = {
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        claimId: claimed.claimId,
        preview,
      };
      if (!this.stateStore.putIfAbsent({
        kind: STATE_KIND,
        key: input.evidenceId,
        workspaceId: input.workspaceId,
        value: intent,
        expiresAtMs: Date.parse(preview.expiresAt),
        nowMs: now.getTime(),
      })) fail("crypto_evidence_sui_anchor_in_progress");
      return this.prepareResponse(preview);
    } catch (error) {
      this.store.endSuiAnchor({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now,
      });
      throw error;
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
  }): Promise<MatterhornCryptoEvidenceSuiAnchorConfirmResponse> {
    if (input.signal.aborted) fail("crypto_evidence_sui_anchor_aborted");
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) fail("crypto_evidence_time_invalid");
    const record = this.stateStore.get<AnchorIntentRecord>(STATE_KIND, input.evidenceId, now.getTime());
    if (!record) fail("crypto_evidence_sui_anchor_expired_or_replayed");
    assertPreview(record.preview);
    if (record.workspaceId !== input.workspaceId
      || record.ownerId !== input.ownerId
      || record.preview.evidenceId !== input.evidenceId) fail("crypto_evidence_not_found");
    const preview = record.preview;
    if (preview.intentId !== input.intentId
      || preview.intentHash !== input.intentHash
      || preview.transactionDigest !== canonicalDigest(input.transactionDigest)) {
      fail("crypto_evidence_sui_anchor_intent_mismatch");
    }
    const verified = await this.verifyTransaction({
      network: SUI_TESTNET_NETWORK,
      digest: preview.transactionDigest,
      signer: preview.signer,
      packageId: preview.packageId,
      batchId: preview.batchId,
      merkleRoot: preview.merkleRoot,
      walrusObjectId: preview.walrusObjectId,
      certifiedEpoch: preview.certifiedEpoch,
      validUntilEpoch: preview.validUntilEpoch,
      signal: input.signal,
    });
    const anchor: MatterhornSuiEvidenceAnchor = {
      version: MATTERHORN_SUI_EVIDENCE_ANCHOR_VERSION,
      network: "testnet",
      packageId: preview.packageId,
      objectId: verified.objectId,
      transactionDigest: preview.transactionDigest,
      batchId: preview.batchId,
      merkleRoot: preview.merkleRoot,
      walrusObjectId: preview.walrusObjectId,
      certifiedEpoch: preview.certifiedEpoch,
      validUntilEpoch: preview.validUntilEpoch,
      anchoredAt: verified.observedAt,
    };
    const item = this.stateStore.transaction(() => {
      const consumed = this.stateStore.take<AnchorIntentRecord>(STATE_KIND, input.evidenceId, now.getTime());
      if (!consumed) fail("crypto_evidence_sui_anchor_expired_or_replayed");
      if (canonicalJson(consumed) !== canonicalJson(record)) fail("crypto_evidence_sui_anchor_intent_mismatch");
      const attached = this.store.attachVerifiedSuiAnchor({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        evidenceId: input.evidenceId,
        expectedRevision: preview.evidenceRevision,
        expectedBlobId: this.store.get(input)?.walrusProof?.blobId ?? "",
        expectedWalrusObjectId: preview.walrusObjectId,
        anchor,
        now,
      });
      if (!this.store.completeSuiAnchorClaimInTransaction({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: consumed.claimId,
        now,
      })) fail("crypto_evidence_sui_anchor_claim_mismatch");
      return cryptoEvidenceAccountPacket(attached, null);
    });
    return { item, anchor };
  }

  private prepareResponse(
    preview: MatterhornCryptoEvidenceSuiAnchorPreview,
  ): MatterhornCryptoEvidenceSuiAnchorPrepareResponse {
    return {
      preview: structuredClone(preview),
      disclosure: {
        network: "testnet",
        walletAction: "create_immutable_evidence_anchor",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
        publicTransactionIsPermanent: true,
        publicContent: "non_identifying_hashes_only",
      },
    };
  }
}
