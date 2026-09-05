import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  MatterhornCryptoAppConnectionStore,
  MatterhornCryptoAppConnectionStoreError,
} from "./crypto-app-connection-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { MatterhornCryptoAppRegistry, canonicalCryptoAppManifestPayload } from "./crypto-app-registry.js";

const keys = generateKeyPairSync("ed25519");

function signedManifest(): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: "matterhorn.sui",
    displayName: "Sui",
    description: "Sui testnet reads and wallet-reviewed preparation.",
    manifestRevision: "1.0.0",
    publisher: { id: "matterhorn", keyId: "publisher-1", algorithm: "ed25519", signature: "pending" },
    transport: { kind: "matterhorn_sdk", endpoint: "https://gateway.matterhorn.so/apps/sui" },
    authentication: { type: "wallet_connection", scopes: ["sui:read", "sui:prepare"] },
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [
      {
        id: "read_balance",
        title: "Read balance",
        description: "Read a public Sui balance.",
        access: "read",
        risk: "informational",
        inputSchema: { type: "object", additionalProperties: false },
        outputProjectionSchema: { type: "object", additionalProperties: false },
        requiredScopes: ["sui:read"],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "prepare_transfer",
        title: "Prepare transfer",
        description: "Prepare and simulate a transfer for wallet review.",
        access: "prepare",
        risk: "financial_high",
        inputSchema: { type: "object", additionalProperties: false },
        outputProjectionSchema: { type: "object", additionalProperties: false },
        requiredScopes: ["sui:prepare"],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 15_000,
        simulationRequired: true,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
    ],
    support: { privacyPolicyUrl: "https://matterhorn.so/privacy", securityContact: "security@matterhorn.so", statusUrl: null },
  };
  value.publisher.signature = sign(null, Buffer.from(canonicalCryptoAppManifestPayload(value)), keys.privateKey).toString("base64url");
  return value;
}

function certifiedRegistry() {
  const registry = new MatterhornCryptoAppRegistry({
    publisherKeys: [{
      publisherId: "matterhorn",
      keyId: "publisher-1",
      algorithm: "ed25519",
      publicKey: keys.publicKey,
    }],
    policyVersion: "policy-1",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  const manifest = signedManifest();
  registry.register(manifest);
  const report = runCryptoAppManifestConformance(manifest, {
    publisherKey: keys.publicKey,
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  registry.updateCertification({
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    state: "certified_testnet",
    report,
    runtimeReport: passingCryptoAppRuntimeReportForTest(manifest, report),
  });
  return { registry, manifest };
}

function fixture(path?: string) {
  const { registry, manifest } = certifiedRegistry();
  const store = new MatterhornCryptoAppConnectionStore(path ?? join(
    mkdtempSync(join(tmpdir(), "matterhorn-crypto-connections-")),
    "connections.db",
  ));
  let sequence = 0;
  const service = new MatterhornCryptoAppConnections({
    registry,
    store,
    id: () => `cxc_${++sequence}`,
    now: () => new Date(`2026-09-01T12:0${sequence}:00.000Z`),
  });
  return { registry, manifest, store, service };
}

function createInput() {
  return {
    workspaceId: "ws_a",
    createdBy: "account_a",
    appId: "matterhorn.sui",
    grantedActionIds: ["read_balance", "prepare_transfer"],
    grantedScopes: ["sui:read", "sui:prepare"],
    grantedNetworks: ["sui:testnet"],
    credential: { type: "wallet_connection" as const, walletConnectionId: "wallet_connection_a" },
  };
}

describe("workspace-scoped crypto app connections", () => {
  test("creates a narrow connection and redacts the wallet reference from account views", () => {
    const { service, store } = fixture();
    const view = service.create(createInput());
    expect(view).toMatchObject({
      id: "cxc_1",
      workspaceId: "ws_a",
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      availability: "available",
      credential: { type: "wallet_connection", connected: true },
    });
    expect(JSON.stringify(view)).not.toContain("wallet_connection_a");
    expect(service.resolveActive("ws_a", view.id)?.credential).toEqual({
      type: "wallet_connection",
      walletConnectionId: "wallet_connection_a",
    });
    store.close();
  });

  test("rejects action, scope, network and credential broadening", () => {
    const { service, store } = fixture();
    expect(() => service.create({ ...createInput(), grantedActionIds: ["submit_transfer"] }))
      .toThrowError(expect.objectContaining({ code: "connection_action_not_allowed" }));
    expect(() => service.create({ ...createInput(), grantedScopes: ["sui:admin"] }))
      .toThrowError(expect.objectContaining({ code: "connection_scope_not_allowed" }));
    expect(() => service.create({ ...createInput(), grantedNetworks: ["sui:mainnet"] }))
      .toThrowError(expect.objectContaining({ code: "connection_network_not_allowed" }));
    expect(() => service.create({
      ...createInput(),
      credential: { type: "wallet_connection", walletConnectionId: "x", apiKey: "secret" } as never,
    })).toThrowError(expect.objectContaining({ code: "connection_credential_invalid" }));
    expect(() => service.create({ ...createInput(), workspaceId: "ws_a\nother" }))
      .toThrowError(expect.objectContaining({ code: "connection_input_invalid" }));
    expect(() => service.create({ ...createInput(), grantedActionIds: [" read_balance"] }))
      .toThrowError(expect.objectContaining({ code: "connection_input_invalid" }));
    expect(() => service.create({
      ...createInput(),
      grantedNetworks: Array.from({ length: 65 }, (_, index) => `sui:testnet-${index}`),
    })).toThrowError(expect.objectContaining({ code: "connection_input_invalid" }));
    store.close();
  });

  test("cannot access or transition another workspace connection", () => {
    const { service, store } = fixture();
    const connection = service.create(createInput());
    expect(service.get("ws_b", connection.id)).toBeNull();
    expect(service.list("ws_b")).toEqual([]);
    expect(service.resolveActive("ws_b", connection.id)).toBeNull();
    expect(() => service.transition("ws_b", connection.id, "paused"))
      .toThrowError(expect.objectContaining({ code: "connection_not_found" }));
    store.close();
  });

  test("persists pause/resume and makes revocation terminal", () => {
    const path = join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-connection-restart-")), "connections.db");
    const first = fixture(path);
    const connection = first.service.create(createInput());
    expect(first.service.transition("ws_a", connection.id, "paused").state).toBe("paused");
    expect(first.service.resolveActive("ws_a", connection.id)).toBeNull();
    first.store.close();

    const secondStore = new MatterhornCryptoAppConnectionStore(path);
    const second = new MatterhornCryptoAppConnections({
      registry: first.registry,
      store: secondStore,
      now: () => new Date("2026-09-01T13:00:00.000Z"),
    });
    expect(second.transition("ws_a", connection.id, "active").state).toBe("active");
    expect(second.transition("ws_a", connection.id, "revoked").state).toBe("revoked");
    expect(() => second.transition("ws_a", connection.id, "active"))
      .toThrowError(expect.objectContaining({ code: "connection_transition_invalid" }));
    secondStore.close();
  });

  test("migrates and seals a valid legacy connection without widening it", () => {
    const path = join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-connection-migration-")), "connections.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE crypto_app_connections (
        workspace_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        state TEXT NOT NULL,
        action_ids_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        networks_json TEXT NOT NULL,
        credential_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, connection_id)
      );
    `);
    legacy.query(`
      INSERT INTO crypto_app_connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ws_a",
      "cxc_legacy",
      "matterhorn.sui",
      "1.0.0",
      "active",
      JSON.stringify(["read_balance"]),
      JSON.stringify(["sui:read"]),
      JSON.stringify(["sui:testnet"]),
      JSON.stringify({ type: "wallet_connection", walletConnectionId: "wallet_connection_a" }),
      "account_a",
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:00.000Z",
    );
    legacy.close();

    const migrated = new MatterhornCryptoAppConnectionStore(path);
    try {
      expect(migrated.get("ws_a", "cxc_legacy")).toMatchObject({
        id: "cxc_legacy",
        grantedActionIds: ["read_balance"],
      });
    } finally {
      migrated.close();
    }
    const inspected = new Database(path);
    try {
      const row = inspected.query(`
        SELECT authority_digest FROM crypto_app_connections WHERE connection_id = ?
      `).get("cxc_legacy") as { authority_digest: string };
      expect(row.authority_digest).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      inspected.close();
    }
  });

  test("never treats a missing digest in an already migrated store as legacy authority", () => {
    const path = join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-connection-null-digest-")), "connections.db");
    const database = new Database(path);
    database.exec(`
      CREATE TABLE crypto_app_connections (
        workspace_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        state TEXT NOT NULL,
        action_ids_json TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        networks_json TEXT NOT NULL,
        credential_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        authority_digest TEXT,
        PRIMARY KEY (workspace_id, connection_id)
      );
    `);
    database.query(`
      INSERT INTO crypto_app_connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ws_a",
      "cxc_missing_digest",
      "matterhorn.sui",
      "1.0.0",
      "active",
      JSON.stringify(["read_balance"]),
      JSON.stringify(["sui:read"]),
      JSON.stringify(["sui:testnet"]),
      JSON.stringify({ type: "wallet_connection", walletConnectionId: "wallet_connection_a" }),
      "account_a",
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:00.000Z",
      null,
    );
    database.close();

    expect(() => new MatterhornCryptoAppConnectionStore(path))
      .toThrow(new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt"));
  });

  test("rejects restored connection authority mutation before it can resolve", () => {
    const path = join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-connection-integrity-")), "connections.db");
    const first = fixture(path);
    const connection = first.service.create({
      ...createInput(),
      grantedActionIds: ["read_balance"],
    });
    first.store.close();

    const database = new Database(path);
    const original = database.query(`
      SELECT action_ids_json, scopes_json, networks_json, credential_json, updated_at
      FROM crypto_app_connections WHERE workspace_id = ? AND connection_id = ?
    `).get("ws_a", connection.id) as Record<string, string>;
    database.close();

    const mutations = [
      // prepare_transfer is valid for this manifest, but the user did not grant it.
      ["action_ids_json", JSON.stringify(["read_balance", "prepare_transfer"])],
      ["scopes_json", JSON.stringify(["sui:read", "sui:prepare", "sui:admin"])],
      ["networks_json", JSON.stringify(["sui:testnet", "sui:mainnet"])],
      ["credential_json", JSON.stringify({
        type: "wallet_connection",
        walletConnectionId: "wallet_connection_a",
        submitAuthority: true,
      })],
      ["updated_at", "2026-08-31T11:59:59.000Z"],
    ] as const;

    for (const [column, value] of mutations) {
      const editor = new Database(path);
      editor.query(`UPDATE crypto_app_connections SET ${column} = ? WHERE workspace_id = ? AND connection_id = ?`)
        .run(value, "ws_a", connection.id);
      editor.close();

      expect(() => new MatterhornCryptoAppConnectionStore(path))
        .toThrow(new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt"));

      const restore = new Database(path);
      restore.query(`UPDATE crypto_app_connections SET ${column} = ? WHERE workspace_id = ? AND connection_id = ?`)
        .run(original[column]!, "ws_a", connection.id);
      restore.close();
    }

    const reopenedStore = new MatterhornCryptoAppConnectionStore(path);
    try {
      const reopened = new MatterhornCryptoAppConnections({ registry: first.registry, store: reopenedStore });
      expect(reopened.resolveActive("ws_a", connection.id)?.id).toBe(connection.id);
    } finally {
      reopenedStore.close();
    }
  });

  test("rejects malformed restored setup and token records", () => {
    const path = join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-setup-integrity-")), "connections.db");
    const { store } = fixture(path);
    store.createWalletChallenge({
      workspaceId: "ws_a",
      challengeId: "cwc_integrity",
      accountId: "account_a",
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      walletFamily: "sui",
      addressDigest: "a".repeat(64),
      actionIds: ["read_balance"],
      scopes: ["sui:read"],
      networks: ["sui:testnet"],
      issuedAt: "2026-09-01T11:00:00.000Z",
      expiresAt: "2026-09-01T11:05:00.000Z",
      state: "pending",
      consumedAt: null,
    });
    store.createOAuthFlow({
      workspaceId: "ws_a",
      flowId: "flow_integrity",
      accountId: "account_a",
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      bindingId: "SUI_BINDING",
      stateDigest: "b".repeat(64),
      verifierEnvelope: "encrypted-verifier",
      actionIds: ["read_balance"],
      scopes: ["sui:read"],
      networks: ["sui:testnet"],
      issuer: "https://issuer.example/",
      resource: "https://api.example/",
      audience: "matterhorn",
      redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
      issuedAt: "2026-09-01T11:00:00.000Z",
      expiresAt: "2026-09-01T11:10:00.000Z",
      state: "pending",
      errorCode: null,
      connectionId: null,
      consumedAt: null,
    });
    store.close();

    const database = new Database(path);
    database.query("UPDATE crypto_app_wallet_challenges SET action_ids_json = ? WHERE challenge_id = ?")
      .run(JSON.stringify(["read_balance", { submit: true }]), "cwc_integrity");
    database.query("UPDATE crypto_app_oauth_flows SET issuer = ? WHERE flow_id = ?")
      .run("https://127.0.0.1/", "flow_integrity");
    database.query(`
      INSERT INTO crypto_app_oauth_tokens(
        workspace_id, oauth_token_id, connection_id, account_id, app_id,
        manifest_revision, binding_id, resource, audience, token_envelope,
        scopes_json, expires_at, refreshable, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ws_a",
      "token_integrity",
      "connection_integrity",
      "account_a",
      "matterhorn.sui",
      "1.0.0",
      "SUI_BINDING",
      "https://api.example/",
      "matterhorn",
      "encrypted-token",
      JSON.stringify(["sui:read"]),
      "2026-09-01T12:00:00.000Z",
      2,
      "2026-09-01T11:00:00.000Z",
      "2026-09-01T11:00:00.000Z",
    );
    database.close();

    const reopened = new MatterhornCryptoAppConnectionStore(path);
    try {
      expect(() => reopened.getWalletChallenge("ws_a", "account_a", "cwc_integrity"))
        .toThrow(new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt"));
      expect(() => reopened.getOAuthFlow("ws_a", "account_a", "flow_integrity"))
        .toThrow(new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt"));
      expect(() => reopened.resolveOAuthToken({
        workspaceId: "ws_a",
        connectionId: "connection_integrity",
        oauthTokenId: "token_integrity",
        appId: "matterhorn.sui",
        manifestRevision: "1.0.0",
      })).toThrow(new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt"));
    } finally {
      reopened.close();
    }
  });

  test("registry revocation immediately disables active connections", () => {
    const { service, store, registry, manifest } = fixture();
    const connection = service.create(createInput());
    registry.updateCertification({
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      state: "revoked",
      reason: "publisher compromise",
    });
    expect(service.get("ws_a", connection.id)?.availability).toBe("certification_unavailable");
    expect(service.resolveActive("ws_a", connection.id)).toBeNull();
    store.close();
  });

  test("workspace purge deletes only that tenant's connections", () => {
    const { service, store } = fixture();
    service.create(createInput());
    service.create({ ...createInput(), workspaceId: "ws_b", createdBy: "account_b" });
    expect(service.purgeWorkspace("ws_a")).toBe(1);
    expect(service.list("ws_a")).toEqual([]);
    expect(service.list("ws_b")).toHaveLength(1);
    store.close();
  });

  test("removes expired setup records and clears expired OAuth verifier material", () => {
    const { store } = fixture();
    const walletChallenge = {
      workspaceId: "ws_a",
      accountId: "account_a",
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      walletFamily: "sui" as const,
      addressDigest: "a".repeat(64),
      actionIds: ["read_balance"],
      scopes: ["sui:read"],
      networks: ["sui:testnet"],
      issuedAt: "2026-09-01T11:00:00.000Z",
      state: "pending" as const,
      consumedAt: null,
    };
    store.createWalletChallenge({
      ...walletChallenge,
      challengeId: "cwc_old",
      expiresAt: "2026-09-01T11:05:00.000Z",
    });
    store.createWalletChallenge({
      ...walletChallenge,
      challengeId: "cwc_recent",
      expiresAt: "2026-09-03T11:59:00.000Z",
    });
    const oauthFlow = {
      workspaceId: "ws_a",
      accountId: "account_a",
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      bindingId: "SUI_BINDING",
      actionIds: ["read_balance"],
      scopes: ["sui:read"],
      networks: ["sui:testnet"],
      issuer: "https://issuer.example/",
      resource: "https://api.example/",
      audience: "matterhorn",
      redirectUri: "https://matterhorn.example/oauth/crypto-apps/callback",
      issuedAt: "2026-09-01T11:00:00.000Z",
      state: "pending" as const,
      errorCode: null,
      connectionId: null,
      consumedAt: null,
    };
    store.createOAuthFlow({
      ...oauthFlow,
      flowId: "flow_old",
      stateDigest: "b".repeat(64),
      verifierEnvelope: "encrypted-old-verifier",
      expiresAt: "2026-09-01T11:10:00.000Z",
    });
    store.createOAuthFlow({
      ...oauthFlow,
      flowId: "flow_recent",
      stateDigest: "c".repeat(64),
      verifierEnvelope: "encrypted-recent-verifier",
      expiresAt: "2026-09-03T11:59:00.000Z",
    });

    expect(store.pruneSetupMetadata({
      now: "2026-09-03T12:00:00.000Z",
      deleteBefore: "2026-09-02T12:00:00.000Z",
    })).toEqual({
      walletChallengesDeleted: 1,
      oauthFlowsDeleted: 1,
      oauthVerifiersCleared: 1,
    });
    expect(store.getWalletChallenge("ws_a", "account_a", "cwc_old")).toBeNull();
    expect(store.getWalletChallenge("ws_a", "account_a", "cwc_recent")).not.toBeNull();
    expect(store.getOAuthFlow("ws_a", "account_a", "flow_old")).toBeNull();
    expect(store.getOAuthFlow("ws_a", "account_a", "flow_recent")?.verifierEnvelope).toBe("");
    store.close();
  });
});
