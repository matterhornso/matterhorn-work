import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  type MatterhornCryptoAppManifest,
  validateMatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { runCryptoAppManifestConformance, verifyCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import {
  cryptoAppManifestHash,
  cryptoAppPublisherKeyFingerprint,
  isTrustedEd25519PublisherKey,
  verifyCryptoAppManifestSignature,
} from "./crypto-app-signature.js";
import {
  MatterhornCryptoDeveloperPortalStore,
  MatterhornCryptoDeveloperStoreError,
  type MatterhornCryptoDeveloperProfile,
  type MatterhornCryptoDeveloperInviteMaintenanceResult,
  type MatterhornCryptoDeveloperPublisherKey,
  type MatterhornCryptoDeveloperSubmission,
} from "./crypto-app-developer-portal-store.js";
import {
  type MatterhornCryptoAppRuntimeCertificationReport,
  verifyCryptoAppRuntimeCertificationOutcome,
} from "./crypto-app-runtime-certification.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._&'()-]{0,79}$/u;
const INVITE_TOKEN_PATTERN = /^mhdi_[A-Za-z0-9_-]{40,96}$/;
const MAX_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const INVITE_METADATA_RETENTION_DAYS = 365;

export type MatterhornCryptoDeveloperProfileView = Omit<MatterhornCryptoDeveloperProfile, "accountId"> & {
  keys: Array<Omit<MatterhornCryptoDeveloperPublisherKey, "developerId" | "publicKeyPem">>;
};

export type MatterhornCryptoDeveloperSubmissionView = Omit<
  MatterhornCryptoDeveloperSubmission,
  "developerId" | "manifest" | "runtimeReport"
> & {
  manifest: Pick<MatterhornCryptoAppManifest, "appId" | "displayName" | "description" | "manifestRevision">;
  runtimeReview: null | {
    version: "matterhorn.crypto-developer-runtime-review.v1";
    passed: boolean;
    generatedAt: string;
    reportHash: string;
    probes: Array<{ id: string; passed: boolean; actionIds: string[] }>;
  };
};

export type MatterhornCryptoDeveloperHostSubmission = MatterhornCryptoDeveloperSubmission & {
  publisherKey: MatterhornCryptoDeveloperPublisherKey;
};

export type MatterhornCryptoDeveloperStatus = {
  version: "matterhorn.crypto-developer-status.v1";
  policyVersion: string;
  enrolled: boolean;
  publisherKeyReady: boolean;
  supportedEnvironments: ["testnet"];
  mainnetAvailable: false;
  runtimeCertificationRequired: true;
  submissionCounts: {
    staticFailed: number;
    staticPassed: number;
    certificationRequested: number;
    certificationPassed: number;
    certificationFailed: number;
  };
  nextStep:
    | "enroll"
    | "register_public_key"
    | "submit_testnet_manifest"
    | "fix_static_conformance"
    | "request_testnet_certification"
    | "await_certification_review"
    | "fix_runtime_certification"
    | "certification_complete";
};

export class MatterhornCryptoDeveloperPortalError extends Error {
  constructor(
    public readonly code:
      | "developer_invite_invalid"
      | "developer_invite_expired"
      | "developer_invite_consumed"
      | "developer_input_invalid"
      | "developer_publisher_conflict"
      | "developer_not_enrolled"
      | "developer_publisher_key_invalid"
      | "developer_publisher_key_conflict"
      | "developer_manifest_invalid"
      | "developer_manifest_signature_invalid"
      | "developer_manifest_publisher_mismatch"
      | "developer_submission_conflict"
      | "developer_submission_not_found"
      | "developer_submission_not_certifiable"
      | "developer_submission_policy_stale"
      | "developer_submission_state_conflict"
      | "developer_runtime_report_invalid"
      | "developer_mainnet_unavailable"
      | "developer_store_unavailable",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoDeveloperPortalError";
  }
}

type PortalOptions = {
  store: MatterhornCryptoDeveloperPortalStore;
  policyVersion: string;
  now?: () => Date;
};

function inviteHash(token: string): string {
  return createHash("sha256").update(`matterhorn.crypto-developer-invite.v1\u0000${token}`).digest("hex");
}

function mapStoreError(error: unknown): never {
  if (!(error instanceof MatterhornCryptoDeveloperStoreError)) throw error;
  const known = new Set<MatterhornCryptoDeveloperPortalError["code"]>([
    "developer_invite_invalid",
    "developer_invite_expired",
    "developer_invite_consumed",
    "developer_publisher_conflict",
    "developer_publisher_key_conflict",
    "developer_submission_conflict",
    "developer_submission_not_found",
    "developer_submission_not_certifiable",
    "developer_submission_state_conflict",
    "developer_runtime_report_invalid",
  ]);
  if (known.has(error.code as MatterhornCryptoDeveloperPortalError["code"])) {
    throw new MatterhornCryptoDeveloperPortalError(error.code as MatterhornCryptoDeveloperPortalError["code"]);
  }
  if (error.code === "developer_not_found") {
    throw new MatterhornCryptoDeveloperPortalError("developer_not_enrolled");
  }
  throw new MatterhornCryptoDeveloperPortalError("developer_store_unavailable");
}

function submissionView(item: MatterhornCryptoDeveloperSubmission): MatterhornCryptoDeveloperSubmissionView {
  return {
    appId: item.appId,
    manifestRevision: item.manifestRevision,
    manifestHash: item.manifestHash,
    manifest: {
      appId: item.manifest.appId,
      displayName: item.manifest.displayName,
      description: item.manifest.description,
      manifestRevision: item.manifest.manifestRevision,
    },
    publisherKeyFingerprint: item.publisherKeyFingerprint,
    targetEnvironment: item.targetEnvironment,
    staticReport: structuredClone(item.staticReport),
    state: item.state,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    certificationRequestedAt: item.certificationRequestedAt,
    certificationDecidedAt: item.certificationDecidedAt,
    runtimeReview: item.runtimeReport ? {
      version: "matterhorn.crypto-developer-runtime-review.v1",
      passed: item.runtimeReport.passed,
      generatedAt: item.runtimeReport.generatedAt,
      reportHash: item.runtimeReport.reportHash,
      probes: item.runtimeReport.probes.map((probe) => ({
        id: probe.id,
        passed: probe.passed,
        actionIds: [...probe.actionIds],
      })),
    } : null,
  };
}

/**
 * Invite-only staging boundary. Developer keys are verified but never added to
 * the trusted production registry by this service. Certification and promotion
 * remain host-only operations backed by independent runtime reports.
 */
export class MatterhornCryptoDeveloperPortal {
  readonly #store: MatterhornCryptoDeveloperPortalStore;
  readonly #policyVersion: string;
  readonly #now: () => Date;

  constructor(options: PortalOptions) {
    this.#store = options.store;
    this.#policyVersion = options.policyVersion;
    this.#now = options.now ?? (() => new Date());
  }

  issueInvite(ttlMs = 24 * 60 * 60 * 1_000): { token: string; expiresAt: string } {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > MAX_INVITE_TTL_MS) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const now = this.#now();
    const token = `mhdi_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    try {
      this.#store.issueInvite(inviteHash(token), expiresAt, now.toISOString());
    } catch (error) {
      mapStoreError(error);
    }
    return { token, expiresAt };
  }

  enroll(accountId: string, input: {
    inviteToken: string;
    publisherId: string;
    displayName: string;
  }): MatterhornCryptoDeveloperProfileView {
    const publisherId = input.publisherId.trim();
    const displayName = input.displayName.trim();
    if (!accountId.trim()
      || accountId.length > 200
      || !INVITE_TOKEN_PATTERN.test(input.inviteToken)
      || !IDENTIFIER_PATTERN.test(publisherId)
      || !DISPLAY_NAME_PATTERN.test(displayName)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const now = this.#now().toISOString();
    try {
      const profile = this.#store.consumeInvite({
        inviteHash: inviteHash(input.inviteToken),
        now,
        developer: {
          id: `dev_${randomUUID().replaceAll("-", "")}`,
          accountId,
          publisherId,
          displayName,
          createdAt: now,
        },
      });
      return this.#profileView(profile);
    } catch (error) {
      mapStoreError(error);
    }
  }

  getProfile(accountId: string): MatterhornCryptoDeveloperProfileView | null {
    const profile = this.#store.getDeveloperByAccount(accountId);
    return profile ? this.#profileView(profile) : null;
  }

  getStatus(accountId: string): MatterhornCryptoDeveloperStatus {
    const profile = this.#store.getDeveloperByAccount(accountId);
    const keys = profile ? this.#store.listPublisherKeys(profile.id) : [];
    const submissions = profile ? this.#store.listSubmissions(profile.id) : [];
    const submissionCounts = {
      staticFailed: submissions.filter((item) => item.state === "static_failed").length,
      staticPassed: submissions.filter((item) => item.state === "static_passed").length,
      certificationRequested: submissions.filter((item) => item.state === "certification_requested").length,
      certificationPassed: submissions.filter((item) => item.state === "certification_passed").length,
      certificationFailed: submissions.filter((item) => item.state === "certification_failed").length,
    };
    const nextStep: MatterhornCryptoDeveloperStatus["nextStep"] = !profile
      ? "enroll"
      : keys.length === 0
        ? "register_public_key"
        : submissions.length === 0
          ? "submit_testnet_manifest"
          : submissionCounts.certificationRequested > 0
            ? "await_certification_review"
            : submissionCounts.staticPassed > 0
              ? "request_testnet_certification"
              : submissionCounts.certificationPassed > 0
                ? "certification_complete"
                : submissionCounts.certificationFailed > 0
                  ? "fix_runtime_certification"
                  : "fix_static_conformance";
    return {
      version: "matterhorn.crypto-developer-status.v1",
      policyVersion: this.#policyVersion,
      enrolled: Boolean(profile),
      publisherKeyReady: keys.length > 0,
      supportedEnvironments: ["testnet"],
      mainnetAvailable: false,
      runtimeCertificationRequired: true,
      submissionCounts,
      nextStep,
    };
  }

  registerPublisherKey(accountId: string, input: {
    keyId: string;
    algorithm: "ed25519";
    publicKeyPem: string;
  }): MatterhornCryptoDeveloperProfileView {
    const profile = this.#requireDeveloper(accountId);
    const keyId = input.keyId.trim();
    const publicKeyPem = input.publicKeyPem.trim();
    const fingerprint = publicKeyPem.length <= 4_096 && input.algorithm === "ed25519"
      ? cryptoAppPublisherKeyFingerprint(publicKeyPem)
      : null;
    if (!IDENTIFIER_PATTERN.test(keyId)
      || !fingerprint
      || !isTrustedEd25519PublisherKey(publicKeyPem)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_publisher_key_invalid");
    }
    try {
      this.#store.putPublisherKey({
        developerId: profile.id,
        publisherId: profile.publisherId,
        keyId,
        publicKeyPem,
        fingerprint,
        createdAt: this.#now().toISOString(),
      });
      return this.#profileView(profile);
    } catch (error) {
      mapStoreError(error);
    }
  }

  submitManifest(
    accountId: string,
    manifest: MatterhornCryptoAppManifest,
    targetEnvironment: "testnet" | "mainnet",
  ): MatterhornCryptoDeveloperSubmissionView {
    if (targetEnvironment === "mainnet") {
      throw new MatterhornCryptoDeveloperPortalError("developer_mainnet_unavailable");
    }
    const profile = this.#requireDeveloper(accountId);
    const issues = validateMatterhornCryptoAppManifest(manifest);
    if (issues.length > 0) {
      throw new MatterhornCryptoDeveloperPortalError("developer_manifest_invalid", issues);
    }
    if (manifest.publisher.id !== profile.publisherId) {
      throw new MatterhornCryptoDeveloperPortalError("developer_manifest_publisher_mismatch");
    }
    const key = this.#store.getPublisherKey(manifest.publisher.id, manifest.publisher.keyId);
    if (!key || key.developerId !== profile.id) {
      throw new MatterhornCryptoDeveloperPortalError("developer_publisher_key_invalid");
    }
    if (!verifyCryptoAppManifestSignature(manifest, key.publicKeyPem)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_manifest_signature_invalid");
    }
    const staticReport = runCryptoAppManifestConformance(manifest, {
      publisherKey: key.publicKeyPem,
      policyVersion: this.#policyVersion,
      targetEnvironment: "testnet",
      now: this.#now,
    });
    const now = this.#now().toISOString();
    try {
      return submissionView(this.#store.putSubmission({
        developerId: profile.id,
        appId: manifest.appId,
        manifestRevision: manifest.manifestRevision,
        manifestHash: cryptoAppManifestHash(manifest),
        manifest: structuredClone(manifest),
        publisherKeyFingerprint: key.fingerprint,
        targetEnvironment: "testnet",
        staticReport,
        state: staticReport.passed ? "static_passed" : "static_failed",
        createdAt: now,
        updatedAt: now,
        certificationRequestedAt: null,
        runtimeReport: null,
        certificationDecidedAt: null,
      }));
    } catch (error) {
      mapStoreError(error);
    }
  }

  requestCertification(accountId: string, appId: string, manifestRevision: string) {
    const profile = this.#requireDeveloper(accountId);
    if (!IDENTIFIER_PATTERN.test(appId) || !IDENTIFIER_PATTERN.test(manifestRevision)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const existing = this.#store.getSubmission(appId, manifestRevision);
    if (existing
      && existing.developerId === profile.id
      && (existing.staticReport.policyVersion !== this.#policyVersion
        || !verifyCryptoAppConformanceReport(existing.staticReport))) {
      throw new MatterhornCryptoDeveloperPortalError("developer_submission_policy_stale");
    }
    try {
      return submissionView(this.#store.requestCertification(
        profile.id,
        appId,
        manifestRevision,
        this.#now().toISOString(),
      ));
    } catch (error) {
      mapStoreError(error);
    }
  }

  listMySubmissions(accountId: string): MatterhornCryptoDeveloperSubmissionView[] {
    const profile = this.#requireDeveloper(accountId);
    return this.#store.listSubmissions(profile.id).map(submissionView);
  }

  assertOwnsSubmission(accountId: string, appId: string, manifestRevision: string): void {
    const profile = this.#requireDeveloper(accountId);
    if (!IDENTIFIER_PATTERN.test(appId) || !IDENTIFIER_PATTERN.test(manifestRevision)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const submission = this.#store.getSubmission(appId, manifestRevision);
    if (!submission || submission.developerId !== profile.id) {
      // Cross-account guesses are intentionally indistinguishable from a
      // missing revision.
      throw new MatterhornCryptoDeveloperPortalError("developer_submission_not_found");
    }
  }

  listCertificationRequests(): MatterhornCryptoDeveloperHostSubmission[] {
    return this.#store.listCertificationRequests().map((item) => this.#hostSubmission(item));
  }

  recordCertificationOutcome(
    appId: string,
    manifestRevision: string,
    runtimeReport: MatterhornCryptoAppRuntimeCertificationReport,
  ): MatterhornCryptoDeveloperHostSubmission {
    if (!IDENTIFIER_PATTERN.test(appId) || !IDENTIFIER_PATTERN.test(manifestRevision)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const current = this.#store.getSubmission(appId, manifestRevision);
    if (!current) throw new MatterhornCryptoDeveloperPortalError("developer_submission_not_found");
    if (current.staticReport.policyVersion !== this.#policyVersion) {
      throw new MatterhornCryptoDeveloperPortalError("developer_submission_policy_stale");
    }
    if (!verifyCryptoAppRuntimeCertificationOutcome(runtimeReport, current.manifest, current.staticReport)) {
      throw new MatterhornCryptoDeveloperPortalError("developer_runtime_report_invalid");
    }
    try {
      return this.#hostSubmission(this.#store.recordCertificationOutcome(
        appId,
        manifestRevision,
        runtimeReport,
        this.#now().toISOString(),
      ));
    } catch (error) {
      mapStoreError(error);
    }
  }

  inspectSubmission(appId: string, manifestRevision: string): MatterhornCryptoDeveloperHostSubmission | null {
    const item = this.#store.getSubmission(appId, manifestRevision);
    return item ? this.#hostSubmission(item) : null;
  }

  purgeAccount(accountId: string): { developers: number; keys: number; submissions: number } {
    try {
      return this.#store.purgeAccount(accountId);
    } catch (error) {
      mapStoreError(error);
    }
  }

  pruneExpiredInviteMetadata(
    retentionDays = INVITE_METADATA_RETENTION_DAYS,
  ): MatterhornCryptoDeveloperInviteMaintenanceResult {
    if (!Number.isSafeInteger(retentionDays)
      || retentionDays < 1
      || retentionDays > INVITE_METADATA_RETENTION_DAYS) {
      throw new MatterhornCryptoDeveloperPortalError("developer_input_invalid");
    }
    const before = new Date(
      this.#now().getTime() - retentionDays * 24 * 60 * 60 * 1_000,
    ).toISOString();
    try {
      return this.#store.pruneInviteMetadata(before);
    } catch (error) {
      mapStoreError(error);
    }
  }

  #hostSubmission(item: MatterhornCryptoDeveloperSubmission): MatterhornCryptoDeveloperHostSubmission {
    const key = this.#store.getPublisherKey(item.manifest.publisher.id, item.manifest.publisher.keyId);
    if (!key || key.fingerprint !== item.publisherKeyFingerprint) {
      throw new MatterhornCryptoDeveloperPortalError("developer_store_unavailable");
    }
    return { ...structuredClone(item), publisherKey: key };
  }

  #requireDeveloper(accountId: string): MatterhornCryptoDeveloperProfile {
    const profile = this.#store.getDeveloperByAccount(accountId);
    if (!profile) throw new MatterhornCryptoDeveloperPortalError("developer_not_enrolled");
    return profile;
  }

  #profileView(profile: MatterhornCryptoDeveloperProfile): MatterhornCryptoDeveloperProfileView {
    return {
      id: profile.id,
      publisherId: profile.publisherId,
      displayName: profile.displayName,
      createdAt: profile.createdAt,
      keys: this.#store.listPublisherKeys(profile.id).map(({ developerId: _developerId, publicKeyPem: _pem, ...key }) => key),
    };
  }
}
