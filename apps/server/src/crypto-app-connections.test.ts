import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
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
  registry.updateCertification({
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    state: "certified_testnet",
    report: runCryptoAppManifestConformance(manifest, {
      publisherKey: keys.publicKey,
      policyVersion: "policy-1",
      targetEnvironment: "testnet",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    }),
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
});

