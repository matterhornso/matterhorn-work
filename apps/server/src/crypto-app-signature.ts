import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

import { canonicalCryptoAppManifestPayload as sdkCanonicalCryptoAppManifestPayload } from "@matterhorn-work/crypto-app-sdk";
import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import { sha256 } from "./guarded-runtime-crypto.js";

export type MatterhornTrustedPublisherKey = {
  publisherId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKey: KeyObject | string | Buffer;
};

/**
 * Returns the exact canonical bytes a publisher signs. The detached signature
 * is excluded; publisher identity, key id and algorithm remain bound.
 */
export function canonicalCryptoAppManifestPayload(manifest: MatterhornCryptoAppManifest): string {
  return sdkCanonicalCryptoAppManifestPayload(manifest);
}

export function cryptoAppManifestHash(manifest: MatterhornCryptoAppManifest): string {
  return sha256(canonicalCryptoAppManifestPayload(manifest));
}

function decodeSignature(signature: string): Buffer | null {
  try {
    const decoded = Buffer.from(signature, "base64url");
    return decoded.length === 64 ? decoded : null;
  } catch {
    return null;
  }
}

function normalizePublicKey(value: MatterhornTrustedPublisherKey["publicKey"]): KeyObject | null {
  try {
    const key = typeof value === "object"
      && value !== null
      && "asymmetricKeyType" in value
      && "export" in value
      ? value as KeyObject
      : createPublicKey(value);
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}

export function isTrustedEd25519PublisherKey(value: MatterhornTrustedPublisherKey["publicKey"]): boolean {
  return normalizePublicKey(value) !== null;
}

export function cryptoAppPublisherKeyFingerprint(
  value: MatterhornTrustedPublisherKey["publicKey"],
): string | null {
  if ((typeof value === "string" && /PRIVATE KEY/i.test(value))
    || (Buffer.isBuffer(value) && /PRIVATE KEY/i.test(value.toString("utf8")))) return null;
  const key = normalizePublicKey(value);
  if (!key) return null;
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
}

export function verifyCryptoAppManifestSignature(
  manifest: MatterhornCryptoAppManifest,
  publicKey: MatterhornTrustedPublisherKey["publicKey"],
): boolean {
  const signature = decodeSignature(manifest.publisher.signature);
  const key = normalizePublicKey(publicKey);
  if (!signature || !key) return false;
  return verify(null, Buffer.from(canonicalCryptoAppManifestPayload(manifest), "utf8"), key, signature);
}
