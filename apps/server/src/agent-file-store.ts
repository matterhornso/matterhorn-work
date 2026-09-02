import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION,
  MATTERHORN_STORED_AGENT_FILE_VERSION,
  MATTERHORN_WALRUS_CIPHERTEXT_VERSION,
  type MatterhornAgentFileContextProjection,
  type MatterhornAgentFileDescriptor,
  type MatterhornAgentFileWalrusPublication,
  type MatterhornStoredAgentFile,
  type MatterhornWalrusCiphertext,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentPrivacyPart } from "@matterhorn-work/types/guarded-agent-runtime";

import {
  compileMatterhornAgentFileContext,
  scanMatterhornAgentFile,
} from "./agent-file-boundary.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const STATE_KIND = "agent_file_record";
const ENVELOPE_VERSION = "matterhorn.agent-file-envelope.v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 10 * 1_024 * 1_024 + TAG_BYTES;
const FILE_ID = /^agent_file_[a-f0-9]{32}$/;

type AgentFileEnvelope = {
  version: typeof ENVELOPE_VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  authenticationTag: string;
  ciphertext: string;
  ciphertextSha256: string;
};

export type MatterhornAgentFileRecord = {
  version: typeof MATTERHORN_STORED_AGENT_FILE_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
  revision: number;
  file: MatterhornAgentFileDescriptor;
  publication: MatterhornAgentFileWalrusPublication | null;
  envelope: AgentFileEnvelope;
  key: {
    keyReference: string;
    wrappedKey: string;
    keyContext: string;
  };
  createdAt: string;
  updatedAt: string;
};

export class MatterhornAgentFileStoreError extends Error {
  constructor(readonly code: string, readonly issues: string[] = []) {
    super(code);
    this.name = "MatterhornAgentFileStoreError";
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactBase64(value: string, label: string, maxBytes: number): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new MatterhornAgentFileStoreError(`agent_file_${label}_invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes || bytes.toString("base64") !== value) {
    bytes.fill(0);
    throw new MatterhornAgentFileStoreError(`agent_file_${label}_invalid`);
  }
  return bytes;
}

function additionalData(record: Pick<MatterhornAgentFileRecord, "id" | "workspaceId" | "ownerId" | "file">): Buffer {
  return Buffer.from(canonicalJson({
    domain: "matterhorn:agent-file-envelope:v1",
    id: record.id,
    workspaceId: record.workspaceId,
    ownerId: record.ownerId,
    file: record.file,
  }));
}

function encryptFile(input: {
  id: string;
  workspaceId: string;
  ownerId: string;
  file: MatterhornAgentFileDescriptor;
  bytes: Uint8Array;
  key: Buffer;
}): AgentFileEnvelope {
  const iv = randomBytes(IV_BYTES);
  const aad = additionalData(input);
  try {
    const cipher = createCipheriv(ALGORITHM, input.key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(input.bytes), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    try {
      return {
        version: ENVELOPE_VERSION,
        algorithm: ALGORITHM,
        iv: iv.toString("base64"),
        authenticationTag: authenticationTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        ciphertextSha256: digest(ciphertext),
      };
    } finally {
      ciphertext.fill(0);
      authenticationTag.fill(0);
    }
  } finally {
    iv.fill(0);
    aad.fill(0);
  }
}

function decryptFile(record: MatterhornAgentFileRecord, key: Buffer): Buffer {
  if (record.envelope.version !== ENVELOPE_VERSION || record.envelope.algorithm !== ALGORITHM) {
    throw new MatterhornAgentFileStoreError("agent_file_envelope_invalid");
  }
  const iv = exactBase64(record.envelope.iv, "iv", IV_BYTES);
  const tag = exactBase64(record.envelope.authenticationTag, "authentication_tag", TAG_BYTES);
  const ciphertext = exactBase64(record.envelope.ciphertext, "ciphertext", MAX_CIPHERTEXT_BYTES);
  const aad = additionalData(record);
  try {
    if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES
      || digest(ciphertext) !== record.envelope.ciphertextSha256) {
      throw new MatterhornAgentFileStoreError("agent_file_envelope_invalid");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    if (error instanceof MatterhornAgentFileStoreError) throw error;
    throw new MatterhornAgentFileStoreError("agent_file_decrypt_failed");
  } finally {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    aad.fill(0);
  }
}

function accountView(record: MatterhornAgentFileRecord): MatterhornStoredAgentFile {
  return {
    version: record.version,
    id: record.id,
    revision: record.revision,
    file: structuredClone(record.file),
    publication: record.publication ? structuredClone(record.publication) : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function walrusBytes(record: MatterhornAgentFileRecord): Buffer {
  if (record.envelope.version !== ENVELOPE_VERSION || record.envelope.algorithm !== ALGORITHM) {
    throw new MatterhornAgentFileStoreError("agent_file_envelope_invalid");
  }
  const iv = exactBase64(record.envelope.iv, "iv", IV_BYTES);
  const tag = exactBase64(record.envelope.authenticationTag, "authentication_tag", TAG_BYTES);
  const ciphertext = exactBase64(record.envelope.ciphertext, "ciphertext", MAX_CIPHERTEXT_BYTES);
  try {
    if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES
      || digest(ciphertext) !== record.envelope.ciphertextSha256) {
      throw new MatterhornAgentFileStoreError("agent_file_envelope_invalid");
    }
    const payload: MatterhornWalrusCiphertext = {
      version: MATTERHORN_WALRUS_CIPHERTEXT_VERSION,
      algorithm: ALGORITHM,
      iv: record.envelope.iv,
      authenticationTag: record.envelope.authenticationTag,
      ciphertext: record.envelope.ciphertext,
    };
    return Buffer.from(canonicalJson(payload));
  } finally {
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

function validPublicReference(value: string, maximum: number): boolean {
  return value.length > 0 && value.length <= maximum && /^[A-Za-z0-9._:@/-]+$/.test(value);
}

function validatePublication(value: MatterhornAgentFileWalrusPublication): void {
  const publishedAt = Date.parse(value.publishedAt);
  const verifiedAt = Date.parse(value.verifiedAt);
  if (value.version !== MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION
    || value.network !== "testnet"
    || !validPublicReference(value.blobId, 256)
    || !/^0x[a-fA-F0-9]+$/.test(value.suiObjectId)
    || !/^[a-f0-9]{64}$/.test(value.ciphertextSha256)
    || !Number.isSafeInteger(value.certifiedEpoch)
    || value.certifiedEpoch < 0
    || !Number.isSafeInteger(value.validUntilEpoch)
    || value.validUntilEpoch <= value.certifiedEpoch
    || (value.suiTransactionDigest !== null
      && !validPublicReference(value.suiTransactionDigest, 256))
    || !Number.isFinite(publishedAt)
    || !Number.isFinite(verifiedAt)
    || verifiedAt < publishedAt) {
    throw new MatterhornAgentFileStoreError("agent_file_publication_invalid");
  }
}

function assertTenant(record: MatterhornAgentFileRecord, input: { workspaceId: string; ownerId: string }): void {
  if (record.workspaceId !== input.workspaceId || record.ownerId !== input.ownerId) {
    throw new MatterhornAgentFileStoreError("agent_file_not_found");
  }
}

export class MatterhornAgentFileStore {
  private readonly activePublications = new Set<string>();

  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly keyManager: MatterhornEvidenceKeyManager,
  ) {}

  async create(input: {
    workspaceId: string;
    ownerId: string;
    request: unknown;
    bytes: Uint8Array;
    now?: Date;
  }): Promise<MatterhornStoredAgentFile> {
    if (!input.workspaceId.trim() || !input.ownerId.trim()) {
      throw new MatterhornAgentFileStoreError("agent_file_identity_invalid");
    }
    const scan = scanMatterhornAgentFile({ request: input.request, bytes: input.bytes, now: input.now });
    if (!scan.descriptor) throw new MatterhornAgentFileStoreError("agent_file_blocked", scan.issues);
    const id = `agent_file_${randomUUID().replaceAll("-", "")}`;
    const recipient = `agent-file-owner:${sha256({ workspaceId: input.workspaceId, ownerId: input.ownerId })}`;
    const lease = await this.keyManager.createDataKey({
      workspaceId: input.workspaceId,
      runId: id,
      recipientKeyIds: [recipient],
    });
    try {
      if (!Buffer.isBuffer(lease.plaintextKey) || lease.plaintextKey.byteLength !== 32
        || !lease.keyReference.trim() || !lease.wrappedKey.trim() || !lease.keyContext.trim()) {
        throw new MatterhornAgentFileStoreError("agent_file_key_invalid");
      }
      const now = input.now ?? new Date();
      if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
      const record: MatterhornAgentFileRecord = {
        version: MATTERHORN_STORED_AGENT_FILE_VERSION,
        id,
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        revision: 1,
        file: scan.descriptor,
        publication: null,
        envelope: encryptFile({
          id,
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          file: scan.descriptor,
          bytes: input.bytes,
          key: lease.plaintextKey,
        }),
        key: {
          keyReference: lease.keyReference,
          wrappedKey: lease.wrappedKey,
          keyContext: lease.keyContext,
        },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      this.stateStore.put({
        kind: STATE_KIND,
        key: record.id,
        workspaceId: record.workspaceId,
        value: record,
        nowMs: now.getTime(),
      });
      return accountView(record);
    } finally {
      lease.plaintextKey.fill(0);
    }
  }

  list(input: { workspaceId: string; ownerId: string; now?: Date }): MatterhornStoredAgentFile[] {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
    return this.stateStore.list<MatterhornAgentFileRecord>(STATE_KIND, { workspaceId: input.workspaceId })
      .filter((record) => record.ownerId === input.ownerId
        && (!record.file.retention.expiresAt || Date.parse(record.file.retention.expiresAt) > now.getTime()))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(accountView);
  }

  get(input: { workspaceId: string; ownerId: string; fileId: string; now?: Date }): MatterhornStoredAgentFile | null {
    if (!FILE_ID.test(input.fileId)) throw new MatterhornAgentFileStoreError("agent_file_id_invalid");
    const record = this.stateStore.get<MatterhornAgentFileRecord>(STATE_KIND, input.fileId);
    if (!record) return null;
    assertTenant(record, input);
    const expiresAt = record.file.retention.expiresAt;
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
    if (expiresAt && Date.parse(expiresAt) <= now.getTime()) return null;
    return accountView(record);
  }

  async readContext(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    fileId: string;
    now?: Date;
  }): Promise<{ projection: MatterhornAgentFileContextProjection; part: MatterhornAgentPrivacyPart }> {
    if (!FILE_ID.test(input.fileId)) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    const record = this.stateStore.get<MatterhornAgentFileRecord>(STATE_KIND, input.fileId);
    if (!record) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    assertTenant(record, input);
    const key = await this.keyManager.decryptDataKey({
      workspaceId: record.workspaceId,
      runId: record.id,
      keyReference: record.key.keyReference,
      wrappedKey: record.key.wrappedKey,
      keyContext: record.key.keyContext,
    });
    try {
      const bytes = decryptFile(record, key);
      try {
        return compileMatterhornAgentFileContext({
          descriptor: record.file,
          bytes,
          coworkerId: input.coworkerId,
          now: input.now,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "agent_file_context_failed";
        throw new MatterhornAgentFileStoreError(code);
      } finally {
        bytes.fill(0);
      }
    } finally {
      key.fill(0);
    }
  }

  publicationCandidate(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision?: number;
    now?: Date;
  }): {
    item: MatterhornStoredAgentFile;
    bytes: Buffer;
    ciphertextSha256: string;
  } {
    if (!FILE_ID.test(input.fileId)) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    const record = this.stateStore.get<MatterhornAgentFileRecord>(STATE_KIND, input.fileId);
    if (!record) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    assertTenant(record, input);
    if (input.expectedRevision !== undefined && record.revision !== input.expectedRevision) {
      throw new MatterhornAgentFileStoreError("agent_file_revision_conflict");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
    if (record.file.retention.expiresAt
      && Date.parse(record.file.retention.expiresAt) <= now.getTime()) {
      throw new MatterhornAgentFileStoreError("agent_file_expired");
    }
    const bytes = walrusBytes(record);
    return { item: accountView(record), bytes, ciphertextSha256: digest(bytes) };
  }

  beginWalrusPublication(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision: number;
    now?: Date;
  }): ReturnType<MatterhornAgentFileStore["publicationCandidate"]> {
    if (this.activePublications.has(input.fileId)) {
      throw new MatterhornAgentFileStoreError("agent_file_walrus_publication_in_progress");
    }
    const candidate = this.publicationCandidate(input);
    this.activePublications.add(input.fileId);
    return candidate;
  }

  endWalrusPublication(fileId: string): void {
    this.activePublications.delete(fileId);
  }

  attachWalrusPublication(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision: number;
    publication: MatterhornAgentFileWalrusPublication;
    now?: Date;
  }): MatterhornStoredAgentFile {
    validatePublication(input.publication);
    const candidate = this.publicationCandidate(input);
    try {
      if (candidate.item.publication) {
        throw new MatterhornAgentFileStoreError("agent_file_already_published");
      }
      if (candidate.ciphertextSha256 !== input.publication.ciphertextSha256) {
        throw new MatterhornAgentFileStoreError("agent_file_publication_hash_mismatch");
      }
    } finally {
      candidate.bytes.fill(0);
    }
    const record = this.stateStore.get<MatterhornAgentFileRecord>(STATE_KIND, input.fileId);
    if (!record) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    assertTenant(record, input);
    if (record.revision !== input.expectedRevision || record.publication) {
      throw new MatterhornAgentFileStoreError("agent_file_revision_conflict");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
    const next: MatterhornAgentFileRecord = {
      ...record,
      revision: record.revision + 1,
      publication: structuredClone(input.publication),
      updatedAt: now.toISOString(),
    };
    this.stateStore.put({
      kind: STATE_KIND,
      key: next.id,
      workspaceId: next.workspaceId,
      value: next,
      nowMs: now.getTime(),
    });
    return accountView(next);
  }

  async delete(input: {
    workspaceId: string;
    ownerId: string;
    fileId: string;
    expectedRevision: number;
  }): Promise<void> {
    if (!FILE_ID.test(input.fileId)) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    const record = this.stateStore.get<MatterhornAgentFileRecord>(STATE_KIND, input.fileId);
    if (!record) throw new MatterhornAgentFileStoreError("agent_file_not_found");
    assertTenant(record, input);
    if (this.activePublications.has(record.id)) {
      throw new MatterhornAgentFileStoreError("agent_file_walrus_publication_in_progress");
    }
    if (record.revision !== input.expectedRevision) {
      throw new MatterhornAgentFileStoreError("agent_file_revision_conflict");
    }
    await this.keyManager.destroyKey({ workspaceId: record.workspaceId, keyReference: record.key.keyReference });
    this.stateStore.delete(STATE_KIND, record.id);
    this.stateStore.secureCheckpoint();
  }

  async destroyExpired(now = new Date()): Promise<{ checked: number; destroyed: number; failures: string[] }> {
    if (!Number.isFinite(now.getTime())) throw new MatterhornAgentFileStoreError("agent_file_time_invalid");
    const records = this.stateStore.list<MatterhornAgentFileRecord>(STATE_KIND);
    const due = records.filter((record) => record.file.retention.expiresAt
      && Date.parse(record.file.retention.expiresAt) <= now.getTime());
    let destroyed = 0;
    const failures: string[] = [];
    for (const record of due) {
      try {
        await this.delete({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          fileId: record.id,
          expectedRevision: record.revision,
        });
        destroyed += 1;
      } catch {
        failures.push(record.id);
      }
    }
    return { checked: due.length, destroyed, failures };
  }

  async destroyWorkspace(input: { workspaceId: string }): Promise<{ checked: number; destroyed: number; failures: string[] }> {
    const records = this.stateStore.list<MatterhornAgentFileRecord>(STATE_KIND, { workspaceId: input.workspaceId });
    let destroyed = 0;
    const failures: string[] = [];
    for (const record of records) {
      try {
        await this.delete({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          fileId: record.id,
          expectedRevision: record.revision,
        });
        destroyed += 1;
      } catch {
        failures.push(record.id);
      }
    }
    return { checked: records.length, destroyed, failures };
  }
}
