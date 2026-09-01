import { createPublicKey, verify, type KeyObject } from "node:crypto";

import {
  type MatterhornCryptoAppManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";

export type MatterhornCryptoAppCertificationState =
  | "pending"
  | "certified_testnet"
  | "certified_mainnet"
  | "suspended"
  | "revoked";

export type MatterhornTrustedPublisherKey = {
  publisherId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKey: KeyObject | string | Buffer;
};

export type MatterhornCryptoAppRegistryEntry = {
  appId: string;
  manifestRevision: string;
  manifestHash: string;
  manifest: MatterhornCryptoAppManifest;
  certification: {
    state: MatterhornCryptoAppCertificationState;
    reportHash: string | null;
    policyVersion: string;
    reason: string | null;
    updatedAt: string;
  };
  registeredAt: string;
};

export class MatterhornCryptoAppRegistryError extends Error {
  constructor(
    public readonly code:
      | "manifest_invalid"
      | "publisher_key_untrusted"
      | "manifest_signature_invalid"
      | "manifest_revision_conflict"
      | "manifest_not_found"
      | "certification_transition_invalid",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppRegistryError";
  }
}

type RegistryOptions = {
  publisherKeys: MatterhornTrustedPublisherKey[];
  policyVersion: string;
  now?: () => Date;
};

type CertificationUpdate = {
  appId: string;
  manifestRevision: string;
  state: Exclude<MatterhornCryptoAppCertificationState, "pending">;
  reportHash?: string | null;
  reason?: string | null;
};

const RESOLVABLE_STATES = new Set<MatterhornCryptoAppCertificationState>([
  "certified_testnet",
  "certified_mainnet",
]);

const TRANSITIONS: Record<MatterhornCryptoAppCertificationState, ReadonlySet<MatterhornCryptoAppCertificationState>> = {
  pending: new Set(["certified_testnet", "suspended", "revoked"]),
  certified_testnet: new Set(["certified_mainnet", "suspended", "revoked"]),
  certified_mainnet: new Set(["suspended", "revoked"]),
  suspended: new Set(["certified_testnet", "certified_mainnet", "revoked"]),
  revoked: new Set(),
};

function registryKey(appId: string, manifestRevision: string): string {
  return `${appId}\u0000${manifestRevision}`;
}

function publisherKey(publisherId: string, keyId: string): string {
  return `${publisherId}\u0000${keyId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

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

export function verifyCryptoAppManifestSignature(
  manifest: MatterhornCryptoAppManifest,
  publicKey: MatterhornTrustedPublisherKey["publicKey"],
): boolean {
  const signature = decodeSignature(manifest.publisher.signature);
  const key = normalizePublicKey(publicKey);
  if (!signature || !key) return false;
  return verify(null, Buffer.from(canonicalCryptoAppManifestPayload(manifest), "utf8"), key, signature);
}

/**
 * Phase 1 registry core. It deliberately exposes no HTTP route and performs no
 * upstream calls. Durable storage and operator routes will wrap this boundary
 * in a later slice; production behavior remains unchanged while the gateway is
 * off.
 */
export class MatterhornCryptoAppRegistry {
  readonly #publisherKeys = new Map<string, MatterhornTrustedPublisherKey>();
  readonly #entries = new Map<string, MatterhornCryptoAppRegistryEntry>();
  readonly #currentRevision = new Map<string, string>();
  readonly #policyVersion: string;
  readonly #now: () => Date;

  constructor(options: RegistryOptions) {
    this.#policyVersion = options.policyVersion;
    this.#now = options.now ?? (() => new Date());
    for (const key of options.publisherKeys) {
      if (key.algorithm !== "ed25519" || !normalizePublicKey(key.publicKey)) continue;
      this.#publisherKeys.set(publisherKey(key.publisherId, key.keyId), key);
    }
  }

  register(manifest: MatterhornCryptoAppManifest): MatterhornCryptoAppRegistryEntry {
    const issues = validateMatterhornCryptoAppManifest(manifest);
    if (issues.length > 0) throw new MatterhornCryptoAppRegistryError("manifest_invalid", issues);

    const trustedKey = this.#publisherKeys.get(publisherKey(manifest.publisher.id, manifest.publisher.keyId));
    if (!trustedKey) throw new MatterhornCryptoAppRegistryError("publisher_key_untrusted");
    if (!verifyCryptoAppManifestSignature(manifest, trustedKey.publicKey)) {
      throw new MatterhornCryptoAppRegistryError("manifest_signature_invalid");
    }

    const key = registryKey(manifest.appId, manifest.manifestRevision);
    const manifestHash = cryptoAppManifestHash(manifest);
    const existing = this.#entries.get(key);
    if (existing) {
      if (existing.manifestHash !== manifestHash || existing.manifest.publisher.signature !== manifest.publisher.signature) {
        throw new MatterhornCryptoAppRegistryError("manifest_revision_conflict");
      }
      return clone(existing);
    }

    const now = this.#now().toISOString();
    const entry: MatterhornCryptoAppRegistryEntry = {
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      manifestHash,
      manifest: clone(manifest),
      certification: {
        state: "pending",
        reportHash: null,
        policyVersion: this.#policyVersion,
        reason: null,
        updatedAt: now,
      },
      registeredAt: now,
    };
    this.#entries.set(key, entry);
    return clone(entry);
  }

  updateCertification(input: CertificationUpdate): MatterhornCryptoAppRegistryEntry {
    const key = registryKey(input.appId, input.manifestRevision);
    const existing = this.#entries.get(key);
    if (!existing) throw new MatterhornCryptoAppRegistryError("manifest_not_found");
    if (!TRANSITIONS[existing.certification.state].has(input.state)) {
      throw new MatterhornCryptoAppRegistryError("certification_transition_invalid");
    }

    existing.certification = {
      state: input.state,
      reportHash: input.reportHash ?? null,
      policyVersion: this.#policyVersion,
      reason: input.reason?.trim() || null,
      updatedAt: this.#now().toISOString(),
    };
    if (RESOLVABLE_STATES.has(input.state)) this.#currentRevision.set(input.appId, input.manifestRevision);
    else if (this.#currentRevision.get(input.appId) === input.manifestRevision) this.#currentRevision.delete(input.appId);
    return clone(existing);
  }

  get(appId: string, manifestRevision: string): MatterhornCryptoAppRegistryEntry | null {
    const entry = this.#entries.get(registryKey(appId, manifestRevision));
    return entry ? clone(entry) : null;
  }

  resolve(appId: string): MatterhornCryptoAppRegistryEntry | null {
    const revision = this.#currentRevision.get(appId);
    if (!revision) return null;
    const entry = this.#entries.get(registryKey(appId, revision));
    if (!entry || !RESOLVABLE_STATES.has(entry.certification.state)) return null;
    return clone(entry);
  }

  list(): MatterhornCryptoAppRegistryEntry[] {
    return [...this.#entries.values()]
      .map((entry) => clone(entry))
      .sort((left, right) => left.appId.localeCompare(right.appId)
        || left.manifestRevision.localeCompare(right.manifestRevision));
  }
}
