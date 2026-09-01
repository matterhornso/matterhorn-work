import { createPublicKey, verify, type KeyObject } from "node:crypto";

import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

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
  return canonicalJson({
    ...manifest,
    publisher: {
      id: manifest.publisher.id,
      keyId: manifest.publisher.keyId,
      algorithm: manifest.publisher.algorithm,
    },
  });
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

export function verifyCryptoAppManifestSignature(
  manifest: MatterhornCryptoAppManifest,
  publicKey: MatterhornTrustedPublisherKey["publicKey"],
): boolean {
  const signature = decodeSignature(manifest.publisher.signature);
  const key = normalizePublicKey(publicKey);
  if (!signature || !key) return false;
  return verify(null, Buffer.from(canonicalCryptoAppManifestPayload(manifest), "utf8"), key, signature);
}

