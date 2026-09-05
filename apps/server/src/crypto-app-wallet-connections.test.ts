import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, test } from "bun:test";
import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { MatterhornCryptoAppWalletConnections } from "./crypto-app-wallet-connections.js";
import { MatterhornCryptoAppRegistry, canonicalCryptoAppManifestPayload } from "./crypto-app-registry.js";

const publisherKeys = generateKeyPairSync("ed25519");
const CONNECTION_INTEGRITY_SECRET = "test-connection-integrity-secret-at-least-32-bytes";

function manifest(protocol: "ethereum" | "sui", chainId: string): MatterhornCryptoAppManifest {
  const value: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    appId: `partner.${protocol}`,
    displayName: protocol === "sui" ? "Partner Sui" : "Partner EVM",
    description: "A wallet-connected testnet app.",
    manifestRevision: "1.0.0",
    publisher: { id: "partner", keyId: "publisher-1", algorithm: "ed25519", signature: "pending" },
    transport: { kind: "mcp_http", endpoint: `https://${protocol}.partner.example/v1` },
    authentication: { type: "wallet_connection", scopes: ["wallet:read", "wallet:prepare"] },
    networks: [{ protocol, chainId, environment: "testnet" }],
    actions: [
      {
        id: "read_balance",
        title: "Read balance",
        description: "Read a public balance for the connected wallet.",
        access: "read",
        risk: "private_data",
        inputSchema: { type: "object", additionalProperties: false },
        outputProjectionSchema: { type: "object", additionalProperties: false },
        requiredScopes: ["wallet:read"],
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
        description: "Prepare a transfer for a separate wallet review.",
        access: "prepare",
        risk: "financial_high",
        inputSchema: { type: "object", additionalProperties: false },
        outputProjectionSchema: { type: "object", additionalProperties: false },
        requiredScopes: ["wallet:prepare"],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 10_000,
        simulationRequired: true,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
    ],
    support: {
      privacyPolicyUrl: "https://partner.example/privacy",
      securityContact: "security@partner.example",
      statusUrl: null,
    },
  };
  value.publisher.signature = sign(
    null,
    Buffer.from(canonicalCryptoAppManifestPayload(value)),
    publisherKeys.privateKey,
  ).toString("base64url");
  return value;
}

function registryFor(value: MatterhornCryptoAppManifest): MatterhornCryptoAppRegistry {
  const registry = new MatterhornCryptoAppRegistry({
    publisherKeys: [{
      publisherId: "partner",
      keyId: "publisher-1",
      algorithm: "ed25519",
      publicKey: publisherKeys.publicKey,
    }],
    policyVersion: "policy-1",
    now: () => new Date("2026-09-02T12:00:00.000Z"),
  });
  registry.register(value);
  const report = runCryptoAppManifestConformance(value, {
    publisherKey: publisherKeys.publicKey,
    policyVersion: "policy-1",
    targetEnvironment: "testnet",
    now: () => new Date("2026-09-02T12:00:00.000Z"),
  });
  registry.updateCertification({
    appId: value.appId,
    manifestRevision: value.manifestRevision,
    state: "certified_testnet",
    report,
    runtimeReport: passingCryptoAppRuntimeReportForTest(value, report),
  });
  return registry;
}

function fixture(protocol: "ethereum" | "sui", chainId: string, path?: string) {
  const value = manifest(protocol, chainId);
  const registry = registryFor(value);
  const dbPath = path ?? join(mkdtempSync(join(tmpdir(), "matterhorn-wallet-proof-")), "connections.db");
  const store = new MatterhornCryptoAppConnectionStore(dbPath, CONNECTION_INTEGRITY_SECRET);
  const clock = { now: new Date("2026-09-02T12:00:00.000Z") };
  let connectionSequence = 0;
  let challengeSequence = 0;
  let proofSequence = 0;
  const connections = new MatterhornCryptoAppConnections({
    registry,
    store,
    now: () => clock.now,
    id: () => `cxc_${++connectionSequence}`,
  });
  const walletConnections = new MatterhornCryptoAppWalletConnections({
    connections,
    store,
    secret: "wallet-proof-test-secret-with-at-least-32-characters",
    now: () => clock.now,
    challengeId: () => `cwc_${++challengeSequence}`,
    proofId: () => `cwp_${++proofSequence}`,
  });
  const request = {
    workspaceId: "ws_a",
    accountId: "account_a",
    appId: value.appId,
    grantedActionIds: ["read_balance", "prepare_transfer"],
    grantedScopes: ["wallet:read", "wallet:prepare"],
    grantedNetworks: [chainId],
  };
  return { clock, connections, dbPath, registry, request, store, walletConnections };
}

describe("crypto app wallet connection proof", () => {
  test("creates an EVM connection from one exact, single-use challenge", async () => {
    const setup = fixture("ethereum", "eip155:84532");
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = setup.walletConnections.issue({
      ...setup.request,
      walletFamily: "evm",
      walletAddress: account.address,
    });
    expect(challenge).toMatchObject({
      challengeId: "cwc_1",
      walletFamily: "evm",
      notice: "proves_wallet_control_only",
    });
    expect(challenge.message).toContain("does not authorize spending");
    expect(challenge.message).toContain("Every transaction still requires a separate review");
    const signature = await account.signMessage({ message: challenge.message });
    const connection = await setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature,
    });
    expect(connection).toMatchObject({
      id: "cxc_1",
      workspaceId: "ws_a",
      credential: { type: "wallet_connection", connected: true },
    });
    expect(setup.store.resolveWalletProof({
      workspaceId: "ws_a",
      walletConnectionId: "cwp_1",
      connectionId: "cxc_1",
      appId: setup.request.appId,
      manifestRevision: "1.0.0",
    })?.walletFamily).toBe("evm");
    expect(setup.store.resolveWalletProof({
      workspaceId: "ws_a",
      walletConnectionId: "cwp_1",
      connectionId: "cxc_other",
      appId: setup.request.appId,
      manifestRevision: "1.0.0",
    })).toBeNull();
    await expect(setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature,
    })).rejects.toMatchObject({ code: "wallet_challenge_invalid" });
    setup.store.close();
  });

  test("verifies Sui personal-message proofs without persisting raw wallet material", async () => {
    const setup = fixture("sui", "sui:testnet");
    const keypair = Ed25519Keypair.generate();
    const address = keypair.getPublicKey().toSuiAddress();
    const challenge = setup.walletConnections.issue({
      ...setup.request,
      walletFamily: "sui",
      walletAddress: address,
    });
    const signed = await keypair.signPersonalMessage(new TextEncoder().encode(challenge.message));
    await setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: address,
      signature: signed.signature,
    });
    setup.store.close();
    for (const candidate of [setup.dbPath, `${setup.dbPath}-wal`, `${setup.dbPath}-shm`]) {
      if (!existsSync(candidate)) continue;
      const bytes = readFileSync(candidate);
      expect(bytes.includes(Buffer.from(address))).toBe(false);
      expect(bytes.includes(Buffer.from(signed.signature))).toBe(false);
      expect(bytes.includes(Buffer.from(challenge.message))).toBe(false);
    }
  });

  test("fails closed for wrong tenant, signer, wallet family, expiry and replay", async () => {
    const setup = fixture("ethereum", "eip155:84532");
    const account = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    expect(() => setup.walletConnections.issue({
      ...setup.request,
      walletFamily: "sui",
      walletAddress: account.address,
    })).toThrowError(expect.objectContaining({ code: "wallet_family_mismatch" }));

    const challenge = setup.walletConnections.issue({
      ...setup.request,
      walletFamily: "evm",
      walletAddress: account.address,
    });
    const attackerSignature = await attacker.signMessage({ message: challenge.message });
    await expect(setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_b",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature: attackerSignature,
    })).rejects.toMatchObject({ code: "wallet_challenge_invalid" });
    await expect(setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature: attackerSignature,
    })).rejects.toMatchObject({ code: "wallet_signature_invalid" });

    setup.clock.now = new Date("2026-09-02T12:05:00.001Z");
    const validSignature = await account.signMessage({ message: challenge.message });
    await expect(setup.walletConnections.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature: validSignature,
    })).rejects.toMatchObject({ code: "wallet_challenge_expired" });
    expect(setup.connections.list("ws_a")).toEqual([]);
    setup.store.close();
  });

  test("survives restart and binds proof to the certified app revision", async () => {
    const setup = fixture("ethereum", "eip155:84532");
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = setup.walletConnections.issue({
      ...setup.request,
      walletFamily: "evm",
      walletAddress: account.address,
    });
    const signature = await account.signMessage({ message: challenge.message });
    setup.store.close();

    const restartedStore = new MatterhornCryptoAppConnectionStore(
      setup.dbPath,
      CONNECTION_INTEGRITY_SECRET,
    );
    const restartedConnections = new MatterhornCryptoAppConnections({
      registry: setup.registry,
      store: restartedStore,
      now: () => setup.clock.now,
      id: () => "cxc_restarted",
    });
    const restartedWallets = new MatterhornCryptoAppWalletConnections({
      connections: restartedConnections,
      store: restartedStore,
      secret: "wallet-proof-test-secret-with-at-least-32-characters",
      now: () => setup.clock.now,
      proofId: () => "cwp_restarted",
    });
    expect(await restartedWallets.confirm({
      workspaceId: "ws_a",
      accountId: "account_a",
      challengeId: challenge.challengeId,
      walletAddress: account.address,
      signature,
    })).toMatchObject({ id: "cxc_restarted", state: "active" });
    expect(restartedStore.resolveWalletProof({
      workspaceId: "ws_a",
      walletConnectionId: "cwp_restarted",
      connectionId: "cxc_restarted",
      appId: setup.request.appId,
      manifestRevision: "2.0.0",
    })).toBeNull();
    restartedStore.close();
  });
});
