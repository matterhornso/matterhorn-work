import { timingSafeEqual } from "node:crypto";

import {
  MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION,
  type MatterhornAgentFileWalrusPublication,
  type MatterhornAgentFileWalrusVerification,
  type MatterhornStoredAgentFile,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornAgentFileStore } from "./agent-file-store.js";
import type {
  MatterhornWalrusCertification,
  MatterhornWalrusCertificationVerifier,
  MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";

const DEFAULT_STORAGE_EPOCHS = 5;

function validEpochs(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateCertification(input: {
  certification: MatterhornWalrusCertification;
  blobId: string;
  suiObjectId: string;
  declaredEndEpoch: number;
}): void {
  const value = input.certification;
  if (value.network !== "testnet"
    || value.blobId !== input.blobId
    || value.suiObjectId !== input.suiObjectId
    || value.validUntilEpoch !== input.declaredEndEpoch
    || !validEpochs(value.certifiedEpoch)
    || !validEpochs(value.currentEpoch)
    || !validEpochs(value.validUntilEpoch)
    || value.certifiedEpoch > value.currentEpoch
    || value.currentEpoch >= value.validUntilEpoch) {
    throw new Error("agent_file_walrus_certification_invalid");
  }
}

function verification(
  publication: MatterhornAgentFileWalrusPublication,
  certification: MatterhornWalrusCertification,
  now: Date,
): MatterhornAgentFileWalrusVerification {
  return {
    verified: true,
    network: "testnet",
    blobId: publication.blobId,
    suiObjectId: publication.suiObjectId,
    ciphertextSha256: publication.ciphertextSha256,
    certifiedEpoch: certification.certifiedEpoch,
    currentEpoch: certification.currentEpoch,
    validUntilEpoch: certification.validUntilEpoch,
    verifiedAt: now.toISOString(),
  };
}

/**
 * User-confirmed testnet backup boundary. The transport receives only the
 * public AES-GCM envelope; file metadata, tenant identity, wrapped keys, and
 * plaintext never cross this class.
 */
export class MatterhornAgentFileWalrusPublisher {
  constructor(
    private readonly store: MatterhornAgentFileStore,
    private readonly transport: MatterhornWalrusEvidenceTransport,
    private readonly verifyCertification: MatterhornWalrusCertificationVerifier,
    private readonly storageEpochs = DEFAULT_STORAGE_EPOCHS,
  ) {
    if (!Number.isSafeInteger(storageEpochs) || storageEpochs < 1 || storageEpochs > 53) {
      throw new Error("agent_file_walrus_epochs_invalid");
    }
  }

  async publish(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision: number;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornStoredAgentFile> {
    if (input.signal.aborted) throw new Error("agent_file_walrus_aborted");
    let candidate: ReturnType<MatterhornAgentFileStore["publicationCandidate"]> | null = null;
    let publicationStarted = false;
    try {
      candidate = this.store.beginWalrusPublication(input);
      publicationStarted = true;
      if (candidate.item.publication) throw new Error("agent_file_already_published");
      const upload = await this.transport.publish({
        bytes: candidate.bytes,
        ciphertextHash: candidate.ciphertextSha256,
        storageEpochs: this.storageEpochs,
        signal: input.signal,
      });
      const certification = await this.verifyCertification({
        network: "testnet",
        blobId: upload.blobId,
        suiObjectId: upload.suiObjectId,
        signal: input.signal,
      });
      validateCertification({
        certification,
        blobId: upload.blobId,
        suiObjectId: upload.suiObjectId,
        declaredEndEpoch: upload.declaredEndEpoch,
      });
      const readback = await this.transport.readByObjectId({
        suiObjectId: upload.suiObjectId,
        signal: input.signal,
      });
      try {
        if (readback.length !== candidate.bytes.length || !timingSafeEqual(readback, candidate.bytes)) {
          throw new Error("agent_file_walrus_readback_mismatch");
        }
      } finally {
        readback.fill(0);
      }
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) throw new Error("agent_file_time_invalid");
      const publication: MatterhornAgentFileWalrusPublication = {
        version: MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION,
        network: "testnet",
        blobId: upload.blobId,
        suiObjectId: upload.suiObjectId,
        ciphertextSha256: candidate.ciphertextSha256,
        certifiedEpoch: certification.certifiedEpoch,
        validUntilEpoch: certification.validUntilEpoch,
        suiTransactionDigest: certification.suiTransactionDigest,
        publishedAt: now.toISOString(),
        verifiedAt: now.toISOString(),
      };
      return this.store.attachWalrusPublication({ ...input, publication, now });
    } finally {
      candidate?.bytes.fill(0);
      if (publicationStarted) this.store.endWalrusPublication(input.fileId);
    }
  }

  async verify(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    signal: AbortSignal;
    now?: Date;
  }): Promise<MatterhornAgentFileWalrusVerification> {
    if (input.signal.aborted) throw new Error("agent_file_walrus_aborted");
    const candidate = this.store.publicationCandidate(input);
    try {
      const publication = candidate.item.publication;
      if (!publication) throw new Error("agent_file_walrus_not_published");
      if (candidate.ciphertextSha256 !== publication.ciphertextSha256) {
        throw new Error("agent_file_walrus_ciphertext_mismatch");
      }
      const certification = await this.verifyCertification({
        network: "testnet",
        blobId: publication.blobId,
        suiObjectId: publication.suiObjectId,
        signal: input.signal,
      });
      validateCertification({
        certification,
        blobId: publication.blobId,
        suiObjectId: publication.suiObjectId,
        declaredEndEpoch: publication.validUntilEpoch,
      });
      if (certification.certifiedEpoch !== publication.certifiedEpoch
        || certification.suiTransactionDigest !== publication.suiTransactionDigest) {
        throw new Error("agent_file_walrus_certification_changed");
      }
      const readback = await this.transport.readByObjectId({
        suiObjectId: publication.suiObjectId,
        signal: input.signal,
      });
      try {
        if (readback.length !== candidate.bytes.length || !timingSafeEqual(readback, candidate.bytes)) {
          throw new Error("agent_file_walrus_readback_mismatch");
        }
      } finally {
        readback.fill(0);
      }
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) throw new Error("agent_file_time_invalid");
      return verification(publication, certification, now);
    } finally {
      candidate.bytes.fill(0);
    }
  }
}
