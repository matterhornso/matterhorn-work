import { randomBytes } from "node:crypto";

import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
  ReEncryptCommand,
  type DecryptCommandOutput,
  type GenerateDataKeyCommandOutput,
  type ReEncryptCommandOutput,
} from "@aws-sdk/client-kms";

import type {
  MatterhornEvidenceDataKeyLease,
  MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import { sha256 } from "./guarded-runtime-crypto.js";

const MAX_WRAPPED_KEY_BYTES = 16 * 1_024;
const CONTEXT_PATTERN = /^[a-f0-9]{64}$/;

type KmsTransport = {
  send(command: unknown): Promise<unknown>;
};

function kmsEncryptionContext(input: {
  workspaceId: string;
  runId: string;
  keyContext: string;
}): Record<string, string> {
  if (!input.workspaceId.trim() || !input.runId.trim() || !CONTEXT_PATTERN.test(input.keyContext)) {
    throw new Error("evidence_kms_context_invalid");
  }
  return {
    "matterhorn-purpose": "crypto-evidence-v1",
    // AWS records encryption context in CloudTrail. Publish only a per-key,
    // nonce-bound digest rather than a workspace, account, run, or wallet ID.
    "matterhorn-binding": sha256({
      domain: "matterhorn:evidence-kms-binding:v1",
      nonce: input.keyContext,
      workspaceId: input.workspaceId,
      runId: input.runId,
    }),
  };
}

function decodeWrappedKey(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("evidence_wrapped_key_invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > MAX_WRAPPED_KEY_BYTES || bytes.toString("base64") !== value) {
    throw new Error("evidence_wrapped_key_invalid");
  }
  return bytes;
}

function exactRecipients(value: string[]): string[] {
  const recipients = [...new Set(value.map((entry) => entry.trim()).filter(Boolean))].sort();
  if (recipients.length < 1 || recipients.length > 32) throw new Error("evidence_recipient_required");
  return recipients;
}

export class AwsKmsMatterhornEvidenceKeyManager implements MatterhornEvidenceKeyManager {
  readonly #client: KmsTransport;
  readonly #keyId: string;

  constructor(input: { region: string; keyId: string; client?: KmsTransport }) {
    const region = input.region.trim();
    const keyId = input.keyId.trim();
    if (!region || !keyId) throw new Error("evidence_kms_configuration_invalid");
    this.#client = input.client ?? (new KMSClient({ region }) as unknown as KmsTransport);
    this.#keyId = keyId;
  }

  async createDataKey(input: {
    workspaceId: string;
    runId: string;
    recipientKeyIds: string[];
  }): Promise<MatterhornEvidenceDataKeyLease> {
    const recipientKeyIds = exactRecipients(input.recipientKeyIds);
    const keyContext = randomBytes(32).toString("hex");
    const response = await this.#client.send(new GenerateDataKeyCommand({
      KeyId: this.#keyId,
      KeySpec: "AES_256",
      EncryptionContext: kmsEncryptionContext({ ...input, keyContext }),
    })) as GenerateDataKeyCommandOutput;
    const plaintextSource = response.Plaintext;
    const wrappedSource = response.CiphertextBlob;
    try {
      if (!(plaintextSource instanceof Uint8Array) || plaintextSource.byteLength !== 32
        || !(wrappedSource instanceof Uint8Array) || wrappedSource.byteLength < 1
        || wrappedSource.byteLength > MAX_WRAPPED_KEY_BYTES
        || typeof response.KeyId !== "string" || !response.KeyId.trim()) {
        throw new Error("evidence_kms_response_invalid");
      }
      return {
        plaintextKey: Buffer.from(plaintextSource),
        keyReference: response.KeyId,
        wrappedKey: Buffer.from(wrappedSource).toString("base64"),
        keyContext,
        recipientKeyIds,
      };
    } finally {
      plaintextSource?.fill(0);
      wrappedSource?.fill(0);
    }
  }

  async decryptDataKey(input: {
    workspaceId: string;
    runId: string;
    keyReference: string;
    wrappedKey: string;
    keyContext: string;
  }): Promise<Buffer> {
    if (!input.keyReference.trim()) throw new Error("evidence_key_reference_invalid");
    const wrappedKey = decodeWrappedKey(input.wrappedKey);
    let response: DecryptCommandOutput;
    try {
      response = await this.#client.send(new DecryptCommand({
        CiphertextBlob: wrappedKey,
        KeyId: input.keyReference,
        EncryptionContext: kmsEncryptionContext(input),
      })) as DecryptCommandOutput;
    } finally {
      wrappedKey.fill(0);
    }
    const plaintextSource = response.Plaintext;
    try {
      if (!(plaintextSource instanceof Uint8Array) || plaintextSource.byteLength !== 32
        || response.KeyId !== input.keyReference) {
        throw new Error("evidence_kms_response_invalid");
      }
      return Buffer.from(plaintextSource);
    } finally {
      plaintextSource?.fill(0);
    }
  }

  async rotateDataKey(input: {
    workspaceId: string;
    runId: string;
    keyReference: string;
    wrappedKey: string;
    keyContext: string;
  }): Promise<{ keyReference: string; wrappedKey: string }> {
    if (!input.keyReference.trim()) throw new Error("evidence_key_reference_invalid");
    const wrappedKey = decodeWrappedKey(input.wrappedKey);
    const encryptionContext = kmsEncryptionContext(input);
    let response: ReEncryptCommandOutput;
    try {
      response = await this.#client.send(new ReEncryptCommand({
        CiphertextBlob: wrappedKey,
        SourceKeyId: input.keyReference,
        DestinationKeyId: this.#keyId,
        SourceEncryptionContext: encryptionContext,
        DestinationEncryptionContext: encryptionContext,
      })) as ReEncryptCommandOutput;
    } finally {
      wrappedKey.fill(0);
    }
    const rotatedSource = response.CiphertextBlob;
    try {
      if (!(rotatedSource instanceof Uint8Array) || rotatedSource.byteLength < 1
        || rotatedSource.byteLength > MAX_WRAPPED_KEY_BYTES
        || typeof response.KeyId !== "string" || !response.KeyId.trim()
        || (response.SourceKeyId !== undefined && response.SourceKeyId !== input.keyReference)) {
        throw new Error("evidence_kms_response_invalid");
      }
      return {
        keyReference: response.KeyId,
        wrappedKey: Buffer.from(rotatedSource).toString("base64"),
      };
    } finally {
      rotatedSource?.fill(0);
    }
  }

  async destroyKey(input: { workspaceId: string; keyReference: string }): Promise<void> {
    if (!input.workspaceId.trim() || !input.keyReference.trim()) throw new Error("evidence_key_reference_invalid");
    // AWS KMS data keys do not exist as independently deletable KMS objects.
    // The durable evidence store performs cryptographic erasure by deleting
    // the only CiphertextBlob plus its context after this lifecycle hook.
  }
}

export function awsKmsEvidenceKeyManagerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AwsKmsMatterhornEvidenceKeyManager | null {
  const region = env.MATTERHORN_EVIDENCE_KMS_REGION?.trim() ?? "";
  const keyId = env.MATTERHORN_EVIDENCE_KMS_KEY_ID?.trim() ?? "";
  if (!region && !keyId) return null;
  if (!region || !keyId) throw new Error("evidence_kms_configuration_incomplete");
  return new AwsKmsMatterhornEvidenceKeyManager({ region, keyId });
}

export function evidenceKmsRotationDaysFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MATTERHORN_EVIDENCE_KMS_ROTATION_DAYS?.trim();
  if (!raw) return 90;
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3_650) {
    throw new Error("evidence_kms_rotation_days_invalid");
  }
  return days;
}
