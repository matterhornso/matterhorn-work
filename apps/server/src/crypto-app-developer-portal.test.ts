import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { MatterhornCryptoDeveloperPortal } from "./crypto-app-developer-portal.js";
import { MatterhornCryptoDeveloperPortalStore } from "./crypto-app-developer-portal-store.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";
import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";
import {
  buildCryptoAppRuntimeCertificationReport,
  expectedCryptoAppRuntimeProbeActionIds,
  requiredCryptoAppRuntimeCertificationProbes,
} from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";

const roots: string[] = [];
const DEVELOPER_INTEGRITY_SECRET = "developer-portal-test-integrity-secret-at-least-32-bytes";

function harness(now = new Date("2026-09-01T00:00:00.000Z")) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-developer-"));
  roots.push(root);
  const path = join(root, "developer.db");
  const store = new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET);
  const portal = new MatterhornCryptoDeveloperPortal({
    store,
    policyVersion: "policy-1",
    now: () => now,
  });
  return { root, path, store, portal };
}

function signedManifest(publisherId: string, keyId: string, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]) {
  return buildMatterhornFirstPartyTestnetManifests({
    publisherId,
    publisherKeyId: keyId,
    sign: (payload) => sign(null, Buffer.from(payload), privateKey).toString("base64url"),
    suiTestnetEndpoint: "https://developer-adapter.example/v1/sui",
    hyperliquidTestnetEndpoint: "https://developer-adapter.example/v1/hyperliquid",
    privacyPolicyUrl: "https://developer.example/privacy",
    statusUrl: "https://status.developer.example",
    securityContact: "security@developer.example",
  })[0]!;
}

function runtimeReport(
  manifest: ReturnType<typeof signedManifest>,
  staticReport: ReturnType<MatterhornCryptoDeveloperPortal["submitManifest"]>["staticReport"],
  failedProbe?: string,
) {
  return buildCryptoAppRuntimeCertificationReport(manifest, staticReport, {
    probes: requiredCryptoAppRuntimeCertificationProbes(manifest).map((id) => ({
      id,
      passed: id !== failedProbe,
      evidenceHash: sha256({ id, evidence: "redacted" }),
      actionIds: expectedCryptoAppRuntimeProbeActionIds(manifest, id),
    })),
    now: () => new Date("2026-09-01T00:01:00.000Z"),
  });
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("invite-only crypto developer portal", () => {
  test("migrates an existing staging database without dropping submissions", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-developer-legacy-"));
    roots.push(root);
    const path = join(root, "developer.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE crypto_developer_submissions (
        developer_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        publisher_key_fingerprint TEXT NOT NULL,
        target_environment TEXT NOT NULL,
        static_report_json TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        certification_requested_at TEXT,
        PRIMARY KEY (app_id, manifest_revision)
      );
    `);
    legacy.close();

    const store = new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET);
    store.close();
    const migrated = new Database(path, { readonly: true });
    const columns = (migrated.query("PRAGMA table_info(crypto_developer_submissions)").all() as Array<{ name: string }>)
      .map((column) => column.name);
    migrated.close();
    expect(columns).toContain("runtime_report_json");
    expect(columns).toContain("certification_decided_at");
  });

  test("backfills authenticated authority seals only for structurally valid legacy rows", () => {
    const { path, store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    const keys = generateKeyPairSync("ed25519");
    portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    const manifest = signedManifest("acme.crypto", "key-1", keys.privateKey);
    portal.submitManifest("account-a", manifest, "testnet");
    store.close();

    const legacy = new Database(path);
    legacy.exec(`
      DROP TRIGGER crypto_developer_invite_seal_insert;
      DROP TRIGGER crypto_developer_invite_seal_update;
      DROP TRIGGER crypto_developer_profile_seal_insert;
      DROP TRIGGER crypto_developer_profile_seal_update;
      DROP TRIGGER crypto_developer_key_seal_insert;
      DROP TRIGGER crypto_developer_key_seal_update;
      DROP TRIGGER crypto_developer_submission_seal_insert;
      DROP TRIGGER crypto_developer_submission_seal_update;
      ALTER TABLE crypto_developer_invites DROP COLUMN authority_seal;
      ALTER TABLE crypto_developers DROP COLUMN authority_seal;
      ALTER TABLE crypto_developer_publisher_keys DROP COLUMN authority_seal;
      ALTER TABLE crypto_developer_submissions DROP COLUMN authority_seal;
    `);
    legacy.close();

    const migrated = new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET);
    expect(migrated.getDeveloperByAccount("account-a")?.publisherId).toBe("acme.crypto");
    expect(migrated.getSubmission(manifest.appId, manifest.manifestRevision)?.manifestHash).toHaveLength(64);
    migrated.close();
    const database = new Database(path, { readonly: true });
    for (const table of [
      "crypto_developer_invites",
      "crypto_developers",
      "crypto_developer_publisher_keys",
      "crypto_developer_submissions",
    ]) {
      const seals = database.query(`SELECT authority_seal FROM ${table}`).all() as Array<{ authority_seal: string }>;
      expect(seals).not.toHaveLength(0);
      expect(seals.every((row) => /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/.test(row.authority_seal))).toBe(true);
    }
    database.close();
  });

  test("fails closed when restored invite, owner, publisher-key, or submission authority is mutated", () => {
    const mutations = [
      {
        trigger: "crypto_developer_invite_seal_update",
        sql: "UPDATE crypto_developer_invites SET expires_at = '2026-09-07T01:00:00.000Z'",
      },
      {
        trigger: "crypto_developer_profile_seal_update",
        sql: "UPDATE crypto_developers SET account_id = 'account-b'",
      },
      {
        trigger: "crypto_developer_key_seal_update",
        sql: "UPDATE crypto_developer_publisher_keys SET created_at = '2026-09-01T00:00:01.000Z'",
      },
      {
        trigger: "crypto_developer_submission_seal_update",
        sql: "UPDATE crypto_developer_submissions SET updated_at = '2026-09-01T00:00:01.000Z'",
      },
    ] as const;
    for (const mutation of mutations) {
      const { path, store, portal } = harness();
      const invite = portal.issueInvite();
      portal.enroll("account-a", {
        inviteToken: invite.token,
        publisherId: "acme.crypto",
        displayName: "Acme Crypto",
      });
      const keys = generateKeyPairSync("ed25519");
      portal.registerPublisherKey("account-a", {
        keyId: "key-1",
        algorithm: "ed25519",
        publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
      });
      portal.submitManifest("account-a", signedManifest("acme.crypto", "key-1", keys.privateKey), "testnet");
      store.close();
      const database = new Database(path);
      database.exec(`DROP TRIGGER ${mutation.trigger}; ${mutation.sql};`);
      database.close();
      expect(() => new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET))
        .toThrowError(expect.objectContaining({ code: "developer_store_corrupt" }));
    }
  });

  test("rejects the wrong restore key and re-verifies live rows before account access", () => {
    const { path, store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    store.close();
    expect(() => new MatterhornCryptoDeveloperPortalStore(
      path,
      "different-developer-integrity-secret-at-least-32-bytes",
    )).toThrowError(expect.objectContaining({ code: "developer_store_corrupt" }));

    const live = new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET);
    const database = new Database(path);
    database.exec(`
      UPDATE crypto_developers
      SET account_id = 'account-b', authority_seal = 'AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
      WHERE account_id = 'account-a'
    `);
    database.close();
    expect(() => live.getDeveloperByAccount("account-b"))
      .toThrowError(expect.objectContaining({ code: "developer_store_corrupt" }));
    live.close();
  });

  test("stores only a one-way invite hash and consumes the invite once", () => {
    const { path, store, portal } = harness();
    const invite = portal.issueInvite(60_000);
    const persisted = [path, `${path}-wal`]
      .filter((candidate) => {
        try { readFileSync(candidate); return true; } catch { return false; }
      })
      .map((candidate) => readFileSync(candidate).toString("utf8"))
      .join("\n");
    expect(persisted).not.toContain(invite.token);

    const profile = portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    expect(profile).toMatchObject({ publisherId: "acme.crypto", displayName: "Acme Crypto", keys: [] });
    expect(JSON.stringify(profile)).not.toContain("account-a");
    expect(portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "ignored-on-safe-retry",
      displayName: "Ignored Retry",
    })).toEqual(profile);
    expect(() => portal.enroll("account-b", {
      inviteToken: invite.token,
      publisherId: "other.crypto",
      displayName: "Other Crypto",
    })).toThrowError(expect.objectContaining({ code: "developer_invite_consumed" }));
    store.close();
  });

  test("rejects expired invites and private publisher keys", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const { store, portal } = harness(now);
    const invite = portal.issueInvite(60_000);
    now.setTime(now.getTime() + 60_001);
    expect(() => portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    })).toThrowError(expect.objectContaining({ code: "developer_invite_expired" }));

    const fresh = portal.issueInvite(60_000);
    portal.enroll("account-a", {
      inviteToken: fresh.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    const keys = generateKeyPairSync("ed25519");
    expect(() => portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    })).toThrowError(expect.objectContaining({ code: "developer_publisher_key_invalid" }));
    store.close();
  });

  test("expires consumed and unused invite metadata after 365 days", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const { path, store, portal } = harness(now);
    const consumed = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: consumed.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    portal.issueInvite(60_000);
    now.setTime(new Date("2027-09-02T00:00:00.000Z").getTime());
    expect(portal.pruneExpiredInviteMetadata()).toEqual({ invitesDeleted: 2 });
    const database = new Database(path, { readonly: true });
    try {
      expect(database.query("SELECT COUNT(*) AS count FROM crypto_developer_invites").get())
        .toEqual({ count: 0 });
    } finally {
      database.close();
    }
    expect(() => portal.pruneExpiredInviteMetadata(366))
      .toThrowError(expect.objectContaining({ code: "developer_input_invalid" }));
    store.close();
  });

  test("verifies a signed testnet manifest and queues certification without trusting it", () => {
    const { store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    const keys = generateKeyPairSync("ed25519");
    const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const profile = portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem,
    });
    expect(profile.keys).toHaveLength(1);
    expect(JSON.stringify(profile)).not.toContain("BEGIN PUBLIC KEY");

    const manifest = signedManifest("acme.crypto", "key-1", keys.privateKey);
    const submitted = portal.submitManifest("account-a", manifest, "testnet");
    expect(submitted).toMatchObject({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "static_passed",
      targetEnvironment: "testnet",
      staticReport: { passed: true },
    });
    expect(JSON.stringify(submitted)).not.toContain("BEGIN PUBLIC KEY");
    const requested = portal.requestCertification("account-a", manifest.appId, manifest.manifestRevision);
    expect(requested.state).toBe("certification_requested");
    expect(portal.requestCertification("account-a", manifest.appId, manifest.manifestRevision)).toEqual(requested);

    const queue = portal.listCertificationRequests();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.publisherKey.publicKeyPem).toBe(publicKeyPem.trim());
    expect(queue[0]?.state).toBe("certification_requested");
    // Staging does not expose any method that certifies or registers the app.
    expect("updateCertification" in portal).toBe(false);
    expect("register" in portal).toBe(false);
    store.close();
  });

  test("records immutable failed and passed runtime outcomes without promoting an app", () => {
    const { store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", { inviteToken: invite.token, publisherId: "acme.crypto", displayName: "Acme" });
    const keys = generateKeyPairSync("ed25519");
    portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    const first = signedManifest("acme.crypto", "key-1", keys.privateKey);
    const firstSubmitted = portal.submitManifest("account-a", first, "testnet");
    portal.requestCertification("account-a", first.appId, first.manifestRevision);
    const failed = runtimeReport(first, firstSubmitted.staticReport, "egress_boundary");
    const failedOutcome = portal.recordCertificationOutcome(first.appId, first.manifestRevision, failed);
    expect(failedOutcome.state).toBe("certification_failed");
    expect(portal.listCertificationRequests()).toEqual([]);
    const failedView = portal.listMySubmissions("account-a")[0]!;
    expect(failedView.runtimeReview?.probes.find((probe) => probe.id === "egress_boundary")?.passed).toBe(false);
    expect(JSON.stringify(failedView)).not.toContain(failed.probes[0]!.evidenceHash);
    expect(portal.getStatus("account-a")).toMatchObject({
      nextStep: "fix_runtime_certification",
      submissionCounts: { certificationFailed: 1, certificationPassed: 0 },
    });
    expect(portal.recordCertificationOutcome(first.appId, first.manifestRevision, failed).runtimeReport?.reportHash)
      .toBe(failed.reportHash);
    expect(() => portal.recordCertificationOutcome(first.appId, first.manifestRevision, {
      ...failed,
      reportHash: "0".repeat(64),
    })).toThrowError(expect.objectContaining({ code: "developer_runtime_report_invalid" }));

    const second = structuredClone(first);
    second.manifestRevision = "revision-2";
    second.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(second)),
      keys.privateKey,
    ).toString("base64url");
    const secondSubmitted = portal.submitManifest("account-a", second, "testnet");
    portal.requestCertification("account-a", second.appId, second.manifestRevision);
    const passed = runtimeReport(second, secondSubmitted.staticReport);
    expect(portal.recordCertificationOutcome(second.appId, second.manifestRevision, passed).state)
      .toBe("certification_passed");
    expect(portal.getStatus("account-a")).toMatchObject({
      nextStep: "certification_complete",
      submissionCounts: { certificationFailed: 1, certificationPassed: 1 },
    });
    expect("updateCertification" in portal).toBe(false);
    expect("register" in portal).toBe(false);
    store.close();
  });

  test("fails closed for bad signatures, publisher substitution, mainnet and failed conformance", () => {
    const { store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    const keys = generateKeyPairSync("ed25519");
    portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    const manifest = signedManifest("acme.crypto", "key-1", keys.privateKey);
    expect(() => portal.submitManifest("account-a", manifest, "mainnet"))
      .toThrowError(expect.objectContaining({ code: "developer_mainnet_unavailable" }));
    expect(() => portal.submitManifest("account-a", {
      ...manifest,
      publisher: { ...manifest.publisher, signature: "A".repeat(86) },
    }, "testnet")).toThrowError(expect.objectContaining({ code: "developer_manifest_signature_invalid" }));
    expect(() => portal.submitManifest("account-a", {
      ...manifest,
      publisher: { ...manifest.publisher, id: "other.crypto" },
    }, "testnet")).toThrowError(expect.objectContaining({ code: "developer_manifest_publisher_mismatch" }));

    const failed = structuredClone(manifest);
    failed.manifestRevision = "failed-1";
    failed.networks = failed.networks.map((network) => ({ ...network, environment: "mainnet" }));
    failed.publisher.signature = sign(
      null,
      Buffer.from(canonicalCryptoAppManifestPayload(failed)),
      keys.privateKey,
    ).toString("base64url");
    const failedSubmission = portal.submitManifest("account-a", failed, "testnet");
    expect(failedSubmission.state).toBe("static_failed");
    expect(failedSubmission.staticReport.passed).toBe(false);
    expect(() => portal.requestCertification("account-a", failed.appId, failed.manifestRevision))
      .toThrowError(expect.objectContaining({ code: "developer_submission_not_certifiable" }));
    store.close();
  });

  test("keeps submissions isolated and immutable across developer accounts", () => {
    const { store, portal } = harness();
    const aInvite = portal.issueInvite();
    const bInvite = portal.issueInvite();
    portal.enroll("account-a", { inviteToken: aInvite.token, publisherId: "acme.crypto", displayName: "Acme" });
    portal.enroll("account-b", { inviteToken: bInvite.token, publisherId: "beta.crypto", displayName: "Beta" });
    const aKeys = generateKeyPairSync("ed25519");
    const bKeys = generateKeyPairSync("ed25519");
    portal.registerPublisherKey("account-a", {
      keyId: "key-a", algorithm: "ed25519",
      publicKeyPem: aKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    portal.registerPublisherKey("account-b", {
      keyId: "key-b", algorithm: "ed25519",
      publicKeyPem: bKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    const manifest = signedManifest("acme.crypto", "key-a", aKeys.privateKey);
    portal.submitManifest("account-a", manifest, "testnet");
    expect(portal.listMySubmissions("account-a")).toHaveLength(1);
    expect(portal.listMySubmissions("account-b")).toEqual([]);

    const collision = signedManifest("beta.crypto", "key-b", bKeys.privateKey);
    expect(collision.appId).toBe(manifest.appId);
    expect(() => portal.submitManifest("account-b", collision, "testnet"))
      .toThrowError(expect.objectContaining({ code: "developer_submission_conflict" }));
    expect(portal.purgeAccount("account-a")).toEqual({ developers: 1, keys: 1, submissions: 1 });
    expect(portal.getProfile("account-a")).toBeNull();
    expect(portal.getProfile("account-b")?.publisherId).toBe("beta.crypto");
    expect(portal.purgeAccount("account-a")).toEqual({ developers: 0, keys: 0, submissions: 0 });
    store.close();
  });

  test("requires resubmission under the current version-pinned policy", () => {
    const { path, store, portal } = harness();
    const invite = portal.issueInvite();
    portal.enroll("account-a", {
      inviteToken: invite.token,
      publisherId: "acme.crypto",
      displayName: "Acme Crypto",
    });
    const keys = generateKeyPairSync("ed25519");
    portal.registerPublisherKey("account-a", {
      keyId: "key-1",
      algorithm: "ed25519",
      publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });
    const manifest = signedManifest("acme.crypto", "key-1", keys.privateKey);
    const submitted = portal.submitManifest("account-a", manifest, "testnet");
    portal.requestCertification("account-a", manifest.appId, manifest.manifestRevision);
    const report = runtimeReport(manifest, submitted.staticReport);
    store.close();

    const reopenedStore = new MatterhornCryptoDeveloperPortalStore(path, DEVELOPER_INTEGRITY_SECRET);
    const newPolicy = new MatterhornCryptoDeveloperPortal({
      store: reopenedStore,
      policyVersion: "policy-2",
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(() => newPolicy.requestCertification("account-a", manifest.appId, manifest.manifestRevision))
      .toThrowError(expect.objectContaining({ code: "developer_submission_policy_stale" }));
    expect(() => newPolicy.recordCertificationOutcome(manifest.appId, manifest.manifestRevision, report))
      .toThrowError(expect.objectContaining({ code: "developer_submission_policy_stale" }));
    reopenedStore.close();
  });
});
