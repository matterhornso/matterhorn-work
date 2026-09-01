import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { MatterhornCryptoDeveloperPortal } from "./crypto-app-developer-portal.js";
import { MatterhornCryptoDeveloperPortalStore } from "./crypto-app-developer-portal-store.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";
import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";

const roots: string[] = [];

function harness(now = new Date("2026-09-01T00:00:00.000Z")) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-developer-"));
  roots.push(root);
  const path = join(root, "developer.db");
  const store = new MatterhornCryptoDeveloperPortalStore(path);
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

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("invite-only crypto developer portal", () => {
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
    portal.submitManifest("account-a", manifest, "testnet");
    store.close();

    const reopenedStore = new MatterhornCryptoDeveloperPortalStore(path);
    const newPolicy = new MatterhornCryptoDeveloperPortal({
      store: reopenedStore,
      policyVersion: "policy-2",
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(() => newPolicy.requestCertification("account-a", manifest.appId, manifest.manifestRevision))
      .toThrowError(expect.objectContaining({ code: "developer_submission_policy_stale" }));
    reopenedStore.close();
  });
});
