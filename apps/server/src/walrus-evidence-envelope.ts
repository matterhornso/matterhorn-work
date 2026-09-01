import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type {
  MatterhornEncryptedEvidenceEnvelope,
  MatterhornEvidenceBundle,
  MatterhornWalrusCiphertext,
} from "@matterhorn-work/types/crypto-coworkers";
import {
  MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION,
  MATTERHORN_WALRUS_CIPHERTEXT_VERSION,
  validateMatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 256 * 1_024;

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function encryptionAad(input: {
  keyReference: string;
  payloadHash: string;
}): Buffer {
  return Buffer.from(canonicalJson({
    version: MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyReference: input.keyReference,
    payloadHash: input.payloadHash,
  }));
}

function publicCiphertext(envelope: Pick<
  MatterhornEncryptedEvidenceEnvelope,
  "algorithm" | "iv" | "authenticationTag" | "ciphertext"
>): MatterhornWalrusCiphertext {
  return {
    version: MATTERHORN_WALRUS_CIPHERTEXT_VERSION,
    algorithm: envelope.algorithm,
    iv: envelope.iv,
    authenticationTag: envelope.authenticationTag,
    ciphertext: envelope.ciphertext,
  };
}

function decodeBase64(value: string, field: string, maximum: number): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`evidence_${field}_invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > maximum || bytes.toString("base64") !== value) {
    throw new Error(`evidence_${field}_invalid`);
  }
  return bytes;
}

/**
 * Returns the only bytes an authenticated Walrus publisher may receive.
 * Local key references and plaintext hashes are deliberately excluded.
 */
export function serializeMatterhornWalrusCiphertext(
  envelope: MatterhornEncryptedEvidenceEnvelope,
): Buffer {
  if (envelope.version !== MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION
    || envelope.algorithm !== ALGORITHM) {
    throw new Error("evidence_envelope_invalid");
  }
  const iv = decodeBase64(envelope.iv, "iv", IV_BYTES);
  const tag = decodeBase64(envelope.authenticationTag, "authentication_tag", TAG_BYTES);
  decodeBase64(envelope.ciphertext, "ciphertext", MAX_CIPHERTEXT_BYTES);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("evidence_envelope_invalid");
  const bytes = Buffer.from(canonicalJson(publicCiphertext(envelope)));
  if (digest(bytes) !== envelope.ciphertextHash) throw new Error("evidence_ciphertext_hash_mismatch");
  return bytes;
}

/**
 * Encrypts the closed evidence projection before any publisher can receive it.
 * This function performs no network call and never returns the encryption key.
 */
export function encryptMatterhornEvidenceBundle(input: {
  bundle: MatterhornEvidenceBundle;
  key: Buffer;
}): MatterhornEncryptedEvidenceEnvelope {
  const issues = validateMatterhornEvidenceBundle(input.bundle);
  if (issues.length > 0) throw new Error(`evidence_bundle_invalid:${issues.join(",")}`);
  if (input.bundle.encryption.algorithm !== ALGORITHM) throw new Error("evidence_encryption_algorithm_not_supported");
  if (input.key.length !== KEY_BYTES) throw new Error("evidence_encryption_key_invalid");

  const plaintext = Buffer.from(canonicalJson(input.bundle));
  const payloadHash = digest(plaintext);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, input.key, iv);
  cipher.setAAD(encryptionAad({ keyReference: input.bundle.encryption.keyReference, payloadHash }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();
  const partial: MatterhornEncryptedEvidenceEnvelope = {
    version: MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyReference: input.bundle.encryption.keyReference,
    payloadHash,
    ciphertextHash: "",
    merkleLeaf: "",
    iv: iv.toString("base64"),
    authenticationTag: authenticationTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  const ciphertextHash = digest(Buffer.from(canonicalJson(publicCiphertext(partial))));
  return {
    ...partial,
    ciphertextHash,
    merkleLeaf: sha256(`matterhorn:evidence-leaf:v1:${ciphertextHash}`),
  };
}

/** Test/verification helper. Production callers must resolve the key through KMS. */
export function decryptMatterhornEvidenceEnvelope(input: {
  envelope: MatterhornEncryptedEvidenceEnvelope;
  key: Buffer;
}): MatterhornEvidenceBundle {
  if (input.key.length !== KEY_BYTES) throw new Error("evidence_encryption_key_invalid");
  serializeMatterhornWalrusCiphertext(input.envelope);
  const iv = decodeBase64(input.envelope.iv, "iv", IV_BYTES);
  const authenticationTag = decodeBase64(input.envelope.authenticationTag, "authentication_tag", TAG_BYTES);
  const ciphertext = decodeBase64(input.envelope.ciphertext, "ciphertext", MAX_CIPHERTEXT_BYTES);

  const decipher = createDecipheriv(ALGORITHM, input.key, iv);
  decipher.setAAD(encryptionAad({
    keyReference: input.envelope.keyReference,
    payloadHash: input.envelope.payloadHash,
  }));
  decipher.setAuthTag(authenticationTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (digest(plaintext) !== input.envelope.payloadHash) throw new Error("evidence_payload_hash_mismatch");
  const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
  const issues = validateMatterhornEvidenceBundle(parsed);
  if (issues.length > 0) throw new Error(`evidence_bundle_invalid:${issues.join(",")}`);
  return parsed as MatterhornEvidenceBundle;
}
