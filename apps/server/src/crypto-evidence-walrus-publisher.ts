import { createHash, timingSafeEqual } from "node:crypto";

import {
  MATTERHORN_WALRUS_PROOF_VERSION,
  type MatterhornWalrusProof,
  validateMatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoEvidenceRecord } from "./crypto-evidence-store.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  type MatterhornAdapterDnsResolver,
  resolvePublicCryptoAdapterEndpoint,
} from "./crypto-app-egress.js";
import {
  createPinnedBytesRequester,
  type MatterhornPinnedBytesRequester,
} from "./crypto-app-https-transport.js";
import { serializeMatterhornWalrusCiphertext } from "./walrus-evidence-envelope.js";
import {
  buildMatterhornEvidenceMerkleBatch,
  verifyMatterhornEvidenceMerkleProof,
} from "./walrus-evidence-merkle.js";

export const MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE =
  "application/vnd.matterhorn.walrus-ciphertext.v1+json";

const JSON_CONTENT_TYPE = "application/json";
const OCTET_STREAM_CONTENT_TYPE = "application/octet-stream";
const DEFAULT_MAX_EVIDENCE_BYTES = 384 * 1024;
const DEFAULT_STORAGE_EPOCHS = 5;
const MAX_QUILT_PATCHES = 64;

export type MatterhornWalrusUpload = {
  blobId: string;
  suiObjectId: string;
  declaredEndEpoch: number;
};

export type MatterhornWalrusQuiltUpload = MatterhornWalrusUpload & {
  patches: Array<{
    ciphertextHash: string;
    quiltPatchId: string;
  }>;
};

export type MatterhornWalrusCertification = {
  network: "testnet";
  blobId: string;
  suiObjectId: string;
  certifiedEpoch: number;
  currentEpoch: number;
  validUntilEpoch: number;
  deletable: boolean;
  suiTransactionDigest: string | null;
};

export type MatterhornWalrusCertificationVerifier = (input: {
  network: "testnet";
  blobId: string;
  suiObjectId: string;
  signal: AbortSignal;
}) => Promise<MatterhornWalrusCertification>;

export interface MatterhornWalrusEvidenceTransport {
  publish(input: {
    bytes: Uint8Array;
    ciphertextHash: string;
    storageEpochs: number;
    signal: AbortSignal;
  }): Promise<MatterhornWalrusUpload>;
  readByObjectId(input: {
    suiObjectId: string;
    signal: AbortSignal;
  }): Promise<Buffer>;
  publishQuilt?(input: {
    patches: Array<{
      bytes: Uint8Array;
      ciphertextHash: string;
    }>;
    storageEpochs: number;
    signal: AbortSignal;
  }): Promise<MatterhornWalrusQuiltUpload>;
  readByQuiltPatchId?(input: {
    quiltPatchId: string;
    signal: AbortSignal;
  }): Promise<Buffer>;
}

export type MatterhornWalrusEvidencePublisherOptions = {
  publisherUrl: string;
  aggregatorUrl: string;
  bearerToken: string;
  storageEpochs?: number;
  maxEvidenceBytes?: number;
  resolver?: MatterhornAdapterDnsResolver;
  requestBytes?: MatterhornPinnedBytesRequester;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function boundedPositiveInteger(value: number, code: string, maximum = 10_000): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(code);
  return value;
}

function baseEndpoint(value: string, code: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(code);
  }
  if (endpoint.protocol !== "https:"
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash) throw new Error(code);
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return endpoint;
}

function endpointPath(base: URL, path: string): URL {
  const endpoint = new URL(base.href);
  endpoint.pathname = `${base.pathname}${path}`;
  return endpoint;
}

function stringField(value: unknown, maximum: number): string | null {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(value)
    ? value.trim()
    : null;
}

function epochField(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isSafeInteger(number) && Number(number) >= 0 ? Number(number) : null;
}

function parseJsonObject(bytes: Buffer): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("crypto_evidence_walrus_response_invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("crypto_evidence_walrus_response_invalid");
  }
  return payload as Record<string, unknown>;
}

function parseNewlyCreatedUpload(response: Record<string, unknown>): MatterhornWalrusUpload {
  if (response.newlyCreated && typeof response.newlyCreated === "object" && !Array.isArray(response.newlyCreated)) {
    const created = response.newlyCreated as Record<string, unknown>;
    if (created.blobObject && typeof created.blobObject === "object" && !Array.isArray(created.blobObject)) {
      const blob = created.blobObject as Record<string, unknown>;
      const storage = blob.storage && typeof blob.storage === "object" && !Array.isArray(blob.storage)
        ? blob.storage as Record<string, unknown>
        : {};
      const blobId = stringField(blob.blobId, 512);
      const suiObjectId = stringField(blob.id, 256);
      const declaredEndEpoch = epochField(storage.endEpoch);
      if (blobId && suiObjectId && declaredEndEpoch !== null) {
        return { blobId, suiObjectId, declaredEndEpoch };
      }
    }
  }
  // A certified duplicate response does not identify the exact Blob object.
  // Evidence publication fails closed instead of guessing an object or reading
  // by a caller-controlled destination.
  throw new Error("crypto_evidence_walrus_object_binding_missing");
}

function parsePublisherResponse(bytes: Buffer): MatterhornWalrusUpload {
  return parseNewlyCreatedUpload(parseJsonObject(bytes));
}

function quiltIdentifier(ciphertextHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(ciphertextHash)) throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
  return `e-${ciphertextHash}`;
}

function serializeQuiltMultipart(patches: Array<{
  bytes: Uint8Array;
  ciphertextHash: string;
}>): { body: Buffer; boundary: string } {
  if (patches.length < 2 || patches.length > MAX_QUILT_PATCHES) {
    throw new Error("crypto_evidence_walrus_batch_size_invalid");
  }
  const identifiers = patches.map((patch) => quiltIdentifier(patch.ciphertextHash));
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error("crypto_evidence_walrus_batch_duplicate");
  }
  const boundary = `matterhorn-${sha256(Buffer.from(identifiers.join(":"))).slice(0, 40)}`;
  const chunks: Buffer[] = [];
  for (let index = 0; index < patches.length; index += 1) {
    const patch = patches[index]!;
    const identifier = identifiers[index]!;
    if (patch.bytes.byteLength < 1 || sha256(patch.bytes) !== patch.ciphertextHash) {
      throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
    }
    chunks.push(Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${identifier}"; filename="${identifier}"\r\n`
      + `Content-Type: ${MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE}\r\n\r\n`,
      "utf8",
    ));
    chunks.push(Buffer.from(patch.bytes));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(chunks), boundary };
}

function parseQuiltPublisherResponse(
  bytes: Buffer,
  ciphertextHashes: string[],
): MatterhornWalrusQuiltUpload {
  const response = parseJsonObject(bytes);
  if (!response.blobStoreResult
    || typeof response.blobStoreResult !== "object"
    || Array.isArray(response.blobStoreResult)) {
    throw new Error("crypto_evidence_walrus_object_binding_missing");
  }
  const upload = parseNewlyCreatedUpload(response.blobStoreResult as Record<string, unknown>);
  if (!Array.isArray(response.storedQuiltBlobs)
    || response.storedQuiltBlobs.length !== ciphertextHashes.length) {
    throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
  }
  const expected = new Map(ciphertextHashes.map((ciphertextHash) => [quiltIdentifier(ciphertextHash), ciphertextHash]));
  const patches = response.storedQuiltBlobs.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
    }
    const patch = value as Record<string, unknown>;
    const identifier = stringField(patch.identifier, 512);
    const quiltPatchId = stringField(patch.quiltPatchId, 512);
    const ciphertextHash = identifier ? expected.get(identifier) : null;
    if (!ciphertextHash || !quiltPatchId) {
      throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
    }
    expected.delete(identifier!);
    return { ciphertextHash, quiltPatchId };
  });
  if (expected.size > 0 || new Set(patches.map((patch) => patch.quiltPatchId)).size !== patches.length) {
    throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
  }
  return { ...upload, patches };
}

export function createPinnedWalrusEvidenceTransport(
  options: MatterhornWalrusEvidencePublisherOptions,
): MatterhornWalrusEvidenceTransport {
  const publisher = baseEndpoint(options.publisherUrl, "crypto_evidence_walrus_publisher_invalid");
  const aggregator = baseEndpoint(options.aggregatorUrl, "crypto_evidence_walrus_aggregator_invalid");
  const bearerToken = options.bearerToken.trim();
  if (!bearerToken || /[\r\n\0]/.test(bearerToken) || bearerToken.length > 8_192) {
    throw new Error("crypto_evidence_walrus_auth_required");
  }
  const storageEpochs = boundedPositiveInteger(
    options.storageEpochs ?? DEFAULT_STORAGE_EPOCHS,
    "crypto_evidence_walrus_epochs_invalid",
    53,
  );
  const maxEvidenceBytes = boundedPositiveInteger(
    options.maxEvidenceBytes ?? DEFAULT_MAX_EVIDENCE_BYTES,
    "crypto_evidence_walrus_size_limit_invalid",
    16 * 1024 * 1024,
  );
  const requestBytes = options.requestBytes ?? createPinnedBytesRequester({ maxResponseBytes: maxEvidenceBytes });
  const resolver = options.resolver;

  return {
    async publish(input): Promise<MatterhornWalrusUpload> {
      if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
      if (input.storageEpochs !== storageEpochs) throw new Error("crypto_evidence_walrus_epochs_override_forbidden");
      if (input.bytes.byteLength < 1 || input.bytes.byteLength > maxEvidenceBytes) {
        throw new Error("crypto_evidence_walrus_size_invalid");
      }
      if (!/^[a-f0-9]{64}$/.test(input.ciphertextHash)
        || sha256(input.bytes) !== input.ciphertextHash) {
        throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
      }
      const endpoint = endpointPath(publisher, "/v1/blobs");
      endpoint.searchParams.set("epochs", String(storageEpochs));
      const resolved = await resolvePublicCryptoAdapterEndpoint(endpoint.href, resolver);
      const response = await requestBytes({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        method: "PUT",
        body: input.bytes,
        signal: input.signal,
        headers: {
          accept: JSON_CONTENT_TYPE,
          authorization: `Bearer ${bearerToken}`,
          "content-type": MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE,
          "x-matterhorn-ciphertext-sha256": input.ciphertextHash,
        },
        acceptedResponseTypes: [JSON_CONTENT_TYPE],
      });
      return parsePublisherResponse(response.bytes);
    },

    async readByObjectId(input): Promise<Buffer> {
      if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
      const objectId = stringField(input.suiObjectId, 256);
      if (!objectId || !/^0x[a-fA-F0-9]+$/.test(objectId)) {
        throw new Error("crypto_evidence_walrus_object_id_invalid");
      }
      const endpoint = endpointPath(aggregator, `/v1/blobs/by-object-id/${encodeURIComponent(objectId)}`);
      endpoint.searchParams.set("strict_consistency_check", "true");
      const resolved = await resolvePublicCryptoAdapterEndpoint(endpoint.href, resolver);
      const response = await requestBytes({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        method: "GET",
        body: null,
        signal: input.signal,
        headers: { accept: MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE },
        acceptedResponseTypes: [MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE],
      });
      if (response.bytes.length < 1 || response.bytes.length > maxEvidenceBytes) {
        throw new Error("crypto_evidence_walrus_readback_size_invalid");
      }
      return response.bytes;
    },

    async publishQuilt(input): Promise<MatterhornWalrusQuiltUpload> {
      if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
      if (input.storageEpochs !== storageEpochs) throw new Error("crypto_evidence_walrus_epochs_override_forbidden");
      const serialized = serializeQuiltMultipart(input.patches);
      if (serialized.body.length > maxEvidenceBytes) throw new Error("crypto_evidence_walrus_size_invalid");
      const endpoint = endpointPath(publisher, "/v1/quilts");
      endpoint.searchParams.set("epochs", String(storageEpochs));
      const resolved = await resolvePublicCryptoAdapterEndpoint(endpoint.href, resolver);
      const response = await requestBytes({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        method: "PUT",
        body: serialized.body,
        signal: input.signal,
        headers: {
          accept: JSON_CONTENT_TYPE,
          authorization: `Bearer ${bearerToken}`,
          "content-type": `multipart/form-data; boundary=${serialized.boundary}`,
        },
        acceptedResponseTypes: [JSON_CONTENT_TYPE],
      });
      return parseQuiltPublisherResponse(response.bytes, input.patches.map((patch) => patch.ciphertextHash));
    },

    async readByQuiltPatchId(input): Promise<Buffer> {
      if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
      const patchId = stringField(input.quiltPatchId, 512);
      if (!patchId) throw new Error("crypto_evidence_walrus_quilt_patch_id_invalid");
      const endpoint = endpointPath(aggregator, `/v1/blobs/by-quilt-patch-id/${encodeURIComponent(patchId)}`);
      const resolved = await resolvePublicCryptoAdapterEndpoint(endpoint.href, resolver);
      const response = await requestBytes({
        endpoint: resolved.endpoint,
        approvedAddresses: resolved.approvedAddresses,
        method: "GET",
        body: null,
        signal: input.signal,
        headers: { accept: MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE },
        acceptedResponseTypes: [MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE, OCTET_STREAM_CONTENT_TYPE],
      });
      if (response.bytes.length < 1 || response.bytes.length > maxEvidenceBytes) {
        throw new Error("crypto_evidence_walrus_readback_size_invalid");
      }
      return response.bytes;
    },
  };
}

export class MatterhornTestnetWalrusEvidencePublisher {
  constructor(
    private readonly store: MatterhornCryptoEvidenceStore,
    private readonly transport: MatterhornWalrusEvidenceTransport,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
    private readonly storageEpochs = DEFAULT_STORAGE_EPOCHS,
  ) {
    boundedPositiveInteger(storageEpochs, "crypto_evidence_walrus_epochs_invalid", 53);
  }

  async publish(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
    expectedRevision: number;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceRecord> {
    if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
    const record = this.store.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    if (record.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    if (record.state !== "sealed" || !record.envelope) {
      throw new Error("crypto_evidence_walrus_publish_state_invalid");
    }
    const publicBytes = serializeMatterhornWalrusCiphertext(record.envelope);
    if (sha256(publicBytes) !== record.index.ciphertextHash) {
      throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
    }
    const merkle = buildMatterhornEvidenceMerkleBatch([record.envelope])[0];
    if (!merkle) throw new Error("crypto_evidence_walrus_merkle_missing");
    const upload = await this.transport.publish({
      bytes: publicBytes,
      ciphertextHash: record.index.ciphertextHash,
      storageEpochs: this.storageEpochs,
      signal: input.signal,
    });
    const certification = await this.verifyCertification({
      network: "testnet",
      blobId: upload.blobId,
      suiObjectId: upload.suiObjectId,
      signal: input.signal,
    });
    if (certification.network !== "testnet"
      || certification.blobId !== upload.blobId
      || certification.suiObjectId !== upload.suiObjectId
      || certification.validUntilEpoch !== upload.declaredEndEpoch
      || certification.certifiedEpoch > certification.currentEpoch
      || certification.currentEpoch >= certification.validUntilEpoch) {
      throw new Error("crypto_evidence_walrus_certification_invalid");
    }
    const readback = await this.transport.readByObjectId({
      suiObjectId: upload.suiObjectId,
      signal: input.signal,
    });
    if (readback.length !== publicBytes.length || !timingSafeEqual(readback, publicBytes)) {
      throw new Error("crypto_evidence_walrus_readback_mismatch");
    }
    const proof: MatterhornWalrusProof = {
      version: MATTERHORN_WALRUS_PROOF_VERSION,
      network: "testnet",
      blobId: upload.blobId,
      suiObjectId: upload.suiObjectId,
      certifiedEpoch: certification.certifiedEpoch,
      validUntilEpoch: certification.validUntilEpoch,
      quiltPatchId: null,
      merkleRoot: merkle.root,
      merkleProof: merkle.proof,
      suiTransactionDigest: certification.suiTransactionDigest,
    };
    return this.store.attachVerifiedWalrusProof({
      ...input,
      proof,
    });
  }

  async publishBatch(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidence: Array<{ evidenceId: string; expectedRevision: number }>;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceRecord[]> {
    if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
    if (input.evidence.length < 2 || input.evidence.length > MAX_QUILT_PATCHES) {
      throw new Error("crypto_evidence_walrus_batch_size_invalid");
    }
    if (!this.transport.publishQuilt || !this.transport.readByQuiltPatchId) {
      throw new Error("crypto_evidence_walrus_quilt_unavailable");
    }
    if (new Set(input.evidence.map((item) => item.evidenceId)).size !== input.evidence.length) {
      throw new Error("crypto_evidence_walrus_batch_duplicate");
    }
    const records = input.evidence.map((item) => {
      const record = this.store.get({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        coworkerId: input.coworkerId,
        evidenceId: item.evidenceId,
      });
      if (!record) throw new Error("crypto_evidence_not_found");
      if (record.revision !== item.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
      if (record.state !== "sealed" || !record.envelope) {
        throw new Error("crypto_evidence_walrus_publish_state_invalid");
      }
      const bytes = serializeMatterhornWalrusCiphertext(record.envelope);
      if (sha256(bytes) !== record.index.ciphertextHash) {
        throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
      }
      return { record, bytes };
    });
    const merkle = buildMatterhornEvidenceMerkleBatch(records.map(({ record }) => record.envelope!));
    const merkleByHash = new Map(merkle.map((proof) => [proof.ciphertextHash, proof]));
    const upload = await this.transport.publishQuilt({
      patches: records.map(({ record, bytes }) => ({
        bytes,
        ciphertextHash: record.index.ciphertextHash,
      })),
      storageEpochs: this.storageEpochs,
      signal: input.signal,
    });
    const certification = await this.verifyCertification({
      network: "testnet",
      blobId: upload.blobId,
      suiObjectId: upload.suiObjectId,
      signal: input.signal,
    });
    if (certification.network !== "testnet"
      || certification.blobId !== upload.blobId
      || certification.suiObjectId !== upload.suiObjectId
      || certification.validUntilEpoch !== upload.declaredEndEpoch
      || certification.certifiedEpoch > certification.currentEpoch
      || certification.currentEpoch >= certification.validUntilEpoch) {
      throw new Error("crypto_evidence_walrus_certification_invalid");
    }
    const patchByHash = new Map(upload.patches.map((patch) => [patch.ciphertextHash, patch.quiltPatchId]));
    if (patchByHash.size !== records.length) throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
    for (const { record, bytes } of records) {
      const patchId = patchByHash.get(record.index.ciphertextHash);
      if (!patchId) throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
      const readback = await this.transport.readByQuiltPatchId({ quiltPatchId: patchId, signal: input.signal });
      if (readback.length !== bytes.length || !timingSafeEqual(readback, bytes)) {
        throw new Error("crypto_evidence_walrus_readback_mismatch");
      }
    }
    return this.store.attachVerifiedWalrusProofBatch({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      entries: records.map(({ record }) => {
        const patchId = patchByHash.get(record.index.ciphertextHash);
        const inclusion = merkleByHash.get(record.index.ciphertextHash);
        if (!patchId || !inclusion) throw new Error("crypto_evidence_walrus_quilt_patch_binding_invalid");
        return {
          evidenceId: record.id,
          expectedRevision: record.revision,
          proof: {
            version: MATTERHORN_WALRUS_PROOF_VERSION,
            network: "testnet",
            blobId: upload.blobId,
            suiObjectId: upload.suiObjectId,
            certifiedEpoch: certification.certifiedEpoch,
            validUntilEpoch: certification.validUntilEpoch,
            quiltPatchId: patchId,
            merkleRoot: inclusion.root,
            merkleProof: inclusion.proof,
            suiTransactionDigest: certification.suiTransactionDigest,
          },
        };
      }),
      ...(input.now ? { now: input.now } : {}),
    });
  }

  /**
   * Re-checks an existing publication without mutating tenant state or
   * contacting the publisher. The exact stored Blob object is authenticated
   * through pinned Sui gRPC and the encrypted bytes are read back from the
   * pinned Walrus aggregator before success is returned.
   */
  async verify(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    signal: AbortSignal;
  }): Promise<{ certification: MatterhornWalrusCertification }> {
    if (input.signal.aborted) throw new Error("crypto_evidence_walrus_aborted");
    const record = this.store.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    if (record.state !== "published" || !record.envelope || !record.walrusProof) {
      throw new Error("crypto_evidence_walrus_verify_state_invalid");
    }
    if (validateMatterhornWalrusProof(record.walrusProof).length > 0
      || record.walrusProof.network !== "testnet") {
      throw new Error("crypto_evidence_walrus_proof_invalid");
    }
    const publicBytes = serializeMatterhornWalrusCiphertext(record.envelope);
    if (sha256(publicBytes) !== record.index.ciphertextHash) {
      throw new Error("crypto_evidence_walrus_ciphertext_mismatch");
    }
    if (!verifyMatterhornEvidenceMerkleProof({
      ciphertextHash: record.index.ciphertextHash,
      leaf: record.index.merkleLeaf,
      root: record.walrusProof.merkleRoot,
      proof: record.walrusProof.merkleProof,
    })) {
      throw new Error("crypto_evidence_walrus_merkle_proof_mismatch");
    }
    const certification = await this.verifyCertification({
      network: "testnet",
      blobId: record.walrusProof.blobId,
      suiObjectId: record.walrusProof.suiObjectId,
      signal: input.signal,
    });
    if (certification.network !== "testnet"
      || certification.blobId !== record.walrusProof.blobId
      || certification.suiObjectId !== record.walrusProof.suiObjectId
      || certification.certifiedEpoch !== record.walrusProof.certifiedEpoch
      || certification.validUntilEpoch !== record.walrusProof.validUntilEpoch
      || certification.certifiedEpoch > certification.currentEpoch
      || certification.currentEpoch >= certification.validUntilEpoch) {
      throw new Error("crypto_evidence_walrus_certification_invalid");
    }
    let readback: Buffer;
    if (record.walrusProof.quiltPatchId) {
      if (!this.transport.readByQuiltPatchId) {
        throw new Error("crypto_evidence_walrus_quilt_unavailable");
      }
      readback = await this.transport.readByQuiltPatchId({
        quiltPatchId: record.walrusProof.quiltPatchId,
        signal: input.signal,
      });
    } else {
      readback = await this.transport.readByObjectId({
        suiObjectId: record.walrusProof.suiObjectId,
        signal: input.signal,
      });
    }
    if (readback.length !== publicBytes.length || !timingSafeEqual(readback, publicBytes)) {
      throw new Error("crypto_evidence_walrus_readback_mismatch");
    }
    return { certification };
  }
}
