import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { MatterhornCryptoAppCatalog, MatterhornCryptoAppCatalogError } from "./crypto-app-catalog.js";
import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import {
  buildMatterhornFirstPartyTestnetManifests,
} from "./first-party-crypto-apps.js";

const keys = generateKeyPairSync("ed25519");
const CONNECTION_INTEGRITY_SECRET = "test-connection-integrity-secret-at-least-32-bytes";

function fixture(mode: "off" | "shadow" | "enforce" = "shadow") {
  const manifests = buildMatterhornFirstPartyTestnetManifests({
    publisherId: "matterhorn",
    publisherKeyId: "publisher-1",
    sign: (payload) => sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
    suiTestnetEndpoint: "https://sui-certification.internal.example/v1",
    hyperliquidTestnetEndpoint: "https://hyperliquid-certification.internal.example/v1",
    privacyPolicyUrl: "https://matterhorn.so/privacy",
    statusUrl: "https://status.matterhorn.so",
    securityContact: "security-private@matterhorn.so",
  });
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
  for (const manifest of manifests) {
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
  }
  const store = new MatterhornCryptoAppConnectionStore(join(
    mkdtempSync(join(tmpdir(), "matterhorn-catalog-")),
    "connections.db",
  ), CONNECTION_INTEGRITY_SECRET);
  let id = 0;
  const connections = new MatterhornCryptoAppConnections({
    registry,
    store,
    id: () => `cxc_${++id}`,
    now: () => new Date("2026-09-01T12:01:00.000Z"),
  });
  return {
    catalog: new MatterhornCryptoAppCatalog({ registry, connections, mode }),
    registry,
    manifests,
    store,
  };
}

describe("account-safe crypto app catalog", () => {
  test("lists only current certified projections without transport or publisher internals", () => {
    const { catalog, store } = fixture();
    const apps = catalog.list();
    expect(apps.map((app) => app.appId)).toEqual([
      "matterhorn.hyperliquid-testnet",
      "matterhorn.sui-testnet",
    ]);
    expect(apps.every((app) => app.certification.runtimeReportHash.length === 64)).toBe(true);
    expect(apps.every((app) => app.actions.every((action) => action.walletSubmissionOnly && !action.agentMaySubmit)))
      .toBe(true);
    const hyperliquid = apps.find((app) => app.appId === "matterhorn.hyperliquid-testnet")!;
    expect(hyperliquid.actions.filter((action) => action.access === "read"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "hyperliquid_market_read", cachePolicy: "block_bound_public" }),
        expect.objectContaining({ id: "hyperliquid_orderbook_read", cachePolicy: "block_bound_public" }),
        expect.objectContaining({ id: "hyperliquid_account_exposure", cachePolicy: null }),
      ]));
    expect(hyperliquid.actions.find((action) => action.id === "hyperliquid_preview_order")?.cachePolicy)
      .toBeNull();
    expect(apps.find((app) => app.appId === "matterhorn.sui-testnet")?.actions
      .every((action) => action.cachePolicy === null)).toBe(true);
    const serialized = JSON.stringify(apps);
    expect(serialized).not.toContain("certification.internal.example");
    expect(serialized).not.toContain("publisher-1");
    expect(serialized).not.toContain("signature");
    expect(serialized).not.toContain("security-private@matterhorn.so");
    expect(serialized).not.toContain("authorizationServer");
    store.close();
  });

  test("searches and filters certified actions and returns closed schemas on detail", () => {
    const { catalog, store } = fixture();
    expect(catalog.list({ query: "orderbook" }).map((app) => app.appId))
      .toEqual(["matterhorn.hyperliquid-testnet"]);
    expect(catalog.list({ access: "prepare" })).toHaveLength(2);
    expect(catalog.list({ risk: "private_data", environment: "testnet" })).toHaveLength(2);
    expect(catalog.list({ environment: "mainnet" })).toEqual([]);
    const sui = catalog.get("matterhorn.sui-testnet");
    expect(sui?.actionSchemas).toHaveLength(2);
    expect(sui?.actionSchemas.every((item) => item.inputSchema.additionalProperties === false)).toBe(true);
    expect(() => catalog.list({ query: "x".repeat(121) }))
      .toThrowError(expect.objectContaining({ code: "crypto_app_catalog_query_invalid" }));
    store.close();
  });

  test("removes suspended revisions immediately from discovery", () => {
    const { catalog, registry, manifests, store } = fixture();
    const sui = manifests.find((app) => app.appId === "matterhorn.sui-testnet")!;
    registry.updateCertification({
      appId: sui.appId,
      manifestRevision: sui.manifestRevision,
      state: "suspended",
      reason: "runtime health circuit open",
    });
    expect(catalog.get(sui.appId)).toBeNull();
    expect(catalog.list().map((app) => app.appId)).toEqual(["matterhorn.hyperliquid-testnet"]);
    store.close();
  });

  test("creates and transitions only tenant-scoped redacted connection views", () => {
    const { catalog, store } = fixture();
    const view = catalog.createConnection({
      workspaceId: "ws_a",
      createdBy: "account_a",
      appId: "matterhorn.sui-testnet",
      grantedActionIds: ["sui_account_read", "sui_transfer_preview"],
      grantedScopes: [],
      grantedNetworks: ["sui:testnet"],
      credential: { type: "none" },
    });
    expect(view).toMatchObject({ id: "cxc_1", workspaceId: "ws_a", credential: { connected: true } });
    expect(catalog.listConnections("ws_b")).toEqual([]);
    expect(catalog.transitionConnection("ws_a", view.id, "paused").state).toBe("paused");
    expect(() => catalog.transitionConnection("ws_b", view.id, "revoked"))
      .toThrowError(expect.objectContaining({ code: "connection_not_found" }));
    store.close();
  });

  test("fails every catalog and connection surface closed while gateway mode is off", () => {
    const { catalog, store } = fixture("off");
    expect(() => catalog.list()).toThrowError(MatterhornCryptoAppCatalogError);
    expect(() => catalog.get("matterhorn.sui-testnet"))
      .toThrowError(expect.objectContaining({ code: "crypto_app_gateway_disabled" }));
    expect(() => catalog.listConnections("ws_a"))
      .toThrowError(expect.objectContaining({ code: "crypto_app_gateway_disabled" }));
    store.close();
  });
});
