import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type {
  MatterhornEncryptedEvidenceEnvelope,
  MatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";
import { validateMatterhornEvidenceBundle } from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

const ENVELOPE_VERSION = "matterhorn.encrypted-evidence-envelope.v1";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function encryptionAad(input: {
  keyReference: string;
  payloadHash: string;
}): Buffer {
  return Buffer.from(canonicalJson({
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyReference: input.keyReference,
    payloadHash: input.payloadHash,
  }));
}

/**
 * Produces ciphertext suitable for a future authenticated Walrus publisher.
 * The function performs no network call and never returns the encryption key.
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
  const ciphertextHash = digest(Buffer.concat([iv, authenticationTag, ciphertext]));

  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyReference: input.bundle.encryption.keyReference,
    payloadHash,
    ciphertextHash,
    merkleLeaf: sha256(`matterhorn:evidence-leaf:v1:${ciphertextHash}`),
    iv: iv.toString("base64"),
    authenticationTag: authenticationTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** Test/verification helper. Production callers must resolve the key through KMS. */
export function decryptMatterhornEvidenceEnvelope(input: {
  envelope: MatterhornEncryptedEvidenceEnvelope;
  key: Buffer;
}): unknown {
  if (input.key.length !== KEY_BYTES) throw new Error("evidence_encryption_key_invalid");
  const iv = Buffer.from(input.envelope.iv, "base64");
  const authenticationTag = Buffer.from(input.envelope.authenticationTag, "base64");
  const ciphertext = Buffer.from(input.envelope.ciphertext, "base64");
  const observedCiphertextHash = digest(Buffer.concat([iv, authenticationTag, ciphertext]));
  if (observedCiphertextHash !== input.envelope.ciphertextHash) throw new Error("evidence_ciphertext_hash_mismatch");

  const decipher = createDecipheriv(ALGORITHM, input.key, iv);
  decipher.setAAD(encryptionAad({
    keyReference: input.envelope.keyReference,
    payloadHash: input.envelope.payloadHash,
  }));
  decipher.setAuthTag(authenticationTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (digest(plaintext) !== input.envelope.payloadHash) throw new Error("evidence_payload_hash_mismatch");
  const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
  return parsed;
}
