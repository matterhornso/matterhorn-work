import { createHash, timingSafeEqual } from "node:crypto";

import {
  MATTERHORN_WALRUS_PROOF_VERSION,
  type MatterhornWalrusProof,
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
import { buildMatterhornEvidenceMerkleBatch } from "./walrus-evidence-merkle.js";

export const MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE =
  "application/vnd.matterhorn.walrus-ciphertext.v1+json";

const JSON_CONTENT_TYPE = "application/json";
const DEFAULT_MAX_EVIDENCE_BYTES = 384 * 1024;
const DEFAULT_STORAGE_EPOCHS = 5;

export type MatterhornWalrusUpload = {
  blobId: string;
  suiObjectId: string;
  declaredEndEpoch: number;
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

function parsePublisherResponse(bytes: Buffer): MatterhornWalrusUpload {
  let payload: unknown;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("crypto_evidence_walrus_response_invalid");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("crypto_evidence_walrus_response_invalid");
  }
  const response = payload as Record<string, unknown>;
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
    10 * 1024 * 1024,
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
}
