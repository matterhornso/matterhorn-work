import {
  type MatterhornCryptoAppManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import { verifyCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import {
  canonicalCryptoAppManifestPayload,
  cryptoAppManifestHash,
  isTrustedEd25519PublisherKey,
  verifyCryptoAppManifestSignature,
  type MatterhornTrustedPublisherKey,
} from "./crypto-app-signature.js";
import {
  MatterhornCryptoAppRegistryStoreError,
  type MatterhornCryptoAppRegistryStore,
  type PersistedCryptoAppCertification,
} from "./crypto-app-registry-store.js";

export {
  canonicalCryptoAppManifestPayload,
  cryptoAppManifestHash,
  verifyCryptoAppManifestSignature,
  type MatterhornTrustedPublisherKey,
} from "./crypto-app-signature.js";

export type MatterhornCryptoAppCertificationState =
  | "pending"
  | "certified_testnet"
  | "certified_mainnet"
  | "suspended"
  | "revoked";

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
      | "certification_transition_invalid"
      | "certification_metadata_invalid"
      | "certification_state_conflict"
      | "persisted_registry_state_invalid",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppRegistryError";
  }
}

type RegistryOptions = {
  publisherKeys: MatterhornTrustedPublisherKey[];
  policyVersion: string;
  store?: MatterhornCryptoAppRegistryStore;
  now?: () => Date;
};

type CertificationUpdate = {
  appId: string;
  manifestRevision: string;
  state: Exclude<MatterhornCryptoAppCertificationState, "pending">;
  report?: MatterhornCryptoAppConformanceReport | null;
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
 * Phase 1 registry core. It deliberately exposes no HTTP route and performs no
 * upstream calls. Durable storage and operator routes will wrap this boundary
 * in a later slice; production behavior remains unchanged while the gateway is
 * off.
 */
export class MatterhornCryptoAppRegistry {
  readonly #publisherKeys = new Map<string, MatterhornTrustedPublisherKey>();
  readonly #entries = new Map<string, MatterhornCryptoAppRegistryEntry>();
  readonly #currentRevision = new Map<string, string>();
  readonly #history = new Map<string, PersistedCryptoAppCertification[]>();
  readonly #policyVersion: string;
  readonly #now: () => Date;
  readonly #store: MatterhornCryptoAppRegistryStore | null;

  constructor(options: RegistryOptions) {
    this.#policyVersion = options.policyVersion;
    this.#now = options.now ?? (() => new Date());
    this.#store = options.store ?? null;
    for (const key of options.publisherKeys) {
      if (key.algorithm !== "ed25519" || !isTrustedEd25519PublisherKey(key.publicKey)) continue;
      this.#publisherKeys.set(publisherKey(key.publisherId, key.keyId), key);
    }
    this.#hydrate();
  }

  #hydrate(): void {
    if (!this.#store) return;
    for (const stored of this.#store.listManifests()) {
      const issues = validateMatterhornCryptoAppManifest(stored.manifest);
      const trustedKey = this.#publisherKeys.get(publisherKey(
        stored.manifest.publisher.id,
        stored.manifest.publisher.keyId,
      ));
      if (issues.length > 0
        || !trustedKey
        || !verifyCryptoAppManifestSignature(stored.manifest, trustedKey.publicKey)
        || cryptoAppManifestHash(stored.manifest) !== stored.manifestHash
        || stored.manifest.appId !== stored.appId
        || stored.manifest.manifestRevision !== stored.manifestRevision) {
        throw new MatterhornCryptoAppRegistryError("persisted_registry_state_invalid", issues);
      }

      const key = registryKey(stored.appId, stored.manifestRevision);
      const entry: MatterhornCryptoAppRegistryEntry = {
        appId: stored.appId,
        manifestRevision: stored.manifestRevision,
        manifestHash: stored.manifestHash,
        manifest: clone(stored.manifest),
        certification: {
          state: "pending",
          reportHash: null,
          policyVersion: this.#policyVersion,
          reason: null,
          updatedAt: stored.registeredAt,
        },
        registeredAt: stored.registeredAt,
      };
      const history = this.#store.listCertificationHistory(stored.appId, stored.manifestRevision);
      let previousState: MatterhornCryptoAppCertificationState = "pending";
      for (const event of history) {
        if (!TRANSITIONS[previousState].has(event.state)
          || !certificationMetadataValid(entry, event, event.policyVersion)) {
          throw new MatterhornCryptoAppRegistryError("persisted_registry_state_invalid");
        }
        entry.certification = {
          state: event.state,
          reportHash: event.reportHash,
          policyVersion: event.policyVersion,
          reason: event.reason,
          updatedAt: event.updatedAt,
        };
        previousState = event.state;
      }
      this.#entries.set(key, entry);
      this.#history.set(key, history.map((event) => clone(event)));
    }
    for (const current of this.#store.listCurrentRevisions()) {
      const entry = this.#entries.get(registryKey(current.appId, current.manifestRevision));
      if (!entry
        || !RESOLVABLE_STATES.has(entry.certification.state)
        || entry.certification.policyVersion !== this.#policyVersion) continue;
      this.#currentRevision.set(current.appId, current.manifestRevision);
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
    try {
      this.#store?.putManifest({
        appId: entry.appId,
        manifestRevision: entry.manifestRevision,
        manifestHash: entry.manifestHash,
        manifest: entry.manifest,
        registeredAt: entry.registeredAt,
      });
    } catch (error) {
      if (error instanceof MatterhornCryptoAppRegistryStoreError
        && error.code === "crypto_app_manifest_revision_conflict") {
        throw new MatterhornCryptoAppRegistryError("manifest_revision_conflict");
      }
      throw error;
    }
    this.#entries.set(key, entry);
    this.#history.set(key, []);
    return clone(entry);
  }

  updateCertification(input: CertificationUpdate): MatterhornCryptoAppRegistryEntry {
    const key = registryKey(input.appId, input.manifestRevision);
    const existing = this.#entries.get(key);
    if (!existing) throw new MatterhornCryptoAppRegistryError("manifest_not_found");
    if (!TRANSITIONS[existing.certification.state].has(input.state)) {
      throw new MatterhornCryptoAppRegistryError("certification_transition_invalid");
    }

    if (!certificationMetadataValid(existing, {
      ...input,
      reportHash: input.report?.reportHash ?? null,
      policyVersion: this.#policyVersion,
    }, this.#policyVersion)) {
      throw new MatterhornCryptoAppRegistryError("certification_metadata_invalid");
    }

    const updatedAt = this.#now().toISOString();
    const event = {
      appId: existing.appId,
      manifestRevision: existing.manifestRevision,
      state: input.state,
      report: input.report ?? null,
      reportHash: input.report?.reportHash ?? null,
      policyVersion: this.#policyVersion,
      reason: input.reason?.trim() || null,
      updatedAt,
    };
    let persistedEvent: PersistedCryptoAppCertification = {
      ...event,
      sequence: (this.#history.get(key)?.at(-1)?.sequence ?? 0) + 1,
    };
    try {
      persistedEvent = this.#store?.appendCertification({
        ...event,
        expectedPreviousState: existing.certification.state,
      }) ?? persistedEvent;
    } catch (error) {
      if (error instanceof MatterhornCryptoAppRegistryStoreError
        && error.code === "crypto_app_certification_state_conflict") {
        throw new MatterhornCryptoAppRegistryError("certification_state_conflict");
      }
      throw error;
    }

    existing.certification = {
      state: input.state,
      reportHash: input.report?.reportHash ?? null,
      policyVersion: this.#policyVersion,
      reason: input.reason?.trim() || null,
      updatedAt,
    };
    this.#history.set(key, [...(this.#history.get(key) ?? []), clone(persistedEvent)]);
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

  certificationHistory(appId: string, manifestRevision: string): PersistedCryptoAppCertification[] {
    return (this.#history.get(registryKey(appId, manifestRevision)) ?? []).map((event) => clone(event));
  }
}

function certificationMetadataValid(
  entry: MatterhornCryptoAppRegistryEntry,
  input: {
    state: Exclude<MatterhornCryptoAppCertificationState, "pending">;
    report?: MatterhornCryptoAppConformanceReport | null;
    reportHash: string | null;
    policyVersion: string;
    reason?: string | null;
  },
  expectedPolicyVersion: string,
): boolean {
  const certifiedState = input.state === "certified_testnet" || input.state === "certified_mainnet";
  const targetEnvironment = input.state === "certified_mainnet" ? "mainnet" : "testnet";
  if (certifiedState) {
    return Boolean(input.report
      && verifyCryptoAppConformanceReport(input.report)
      && input.report.passed
      && input.report.reportHash === input.reportHash
      && input.report.targetEnvironment === targetEnvironment
      && input.report.appId === entry.appId
      && input.report.manifestRevision === entry.manifestRevision
      && input.report.manifestHash === entry.manifestHash
      && input.report.policyVersion === expectedPolicyVersion
      && input.policyVersion === expectedPolicyVersion);
  }
  return Boolean((input.state === "suspended" || input.state === "revoked")
    && input.reason?.trim()
    && input.report == null
    && input.reportHash === null
    && input.policyVersion === expectedPolicyVersion);
}
