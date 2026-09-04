import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { afterEach, describe, expect, test } from "bun:test";

import type {
  MatterhornAgentPrivacyPreflightResponse,
  MatterhornAgentRunReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";
import type {
  MatterhornCryptoAppResult,
  MatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornAgentRunReceiptStore } from "./agent-run-receipts.js";
import {
  compileCertifiedCryptoIntent,
  cryptoIntentToReviewedActionHandoffV2,
} from "./crypto-transaction-coordinator.js";
import { MatterhornPendingCryptoIntentStore } from "./crypto-pending-intent-store.js";
import { startServer, type MatterhornServerDependencies } from "./server.js";
import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import { MatterhornCoworkers } from "./crypto-coworkers.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import type {
  MatterhornEvidenceDataKeyLease,
  MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { MatterhornCryptoAppRegistryStore } from "./crypto-app-registry-store.js";
import { passingCryptoAppRuntimeReportForTest } from "./crypto-app-runtime-certification-test-support.js";
import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";
import type {
  MatterhornWalrusCertification,
  MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import type { ServerConfig } from "./types.js";

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

const TOKEN = "owt_coworker_route_token";
const HOST_TOKEN = "owt_coworker_route_host_token";
const PASSWORD = "matterhorn-coworker-test-password";
const ROUTE_SIGNER = normalizeSuiAddress("0x1");
const ENV_KEYS = [
  "MATTERHORN_AUTH_DB",
  "MATTERHORN_WORK_DATA_DIR",
  "MATTERHORN_WORK_MEMORY_ROOT",
  "MATTERHORN_SIGNUPS_ENABLED",
  "MATTERHORN_EMAIL_VERIFICATION_REQUIRED",
  "MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED",
  "MATTERHORN_COWORKER_MODE",
  "MATTERHORN_COWORKER_POLICY_VERSION",
  "MATTERHORN_COWORKER_DB",
  "MATTERHORN_CRYPTO_APP_GATEWAY_MODE",
  "MATTERHORN_CRYPTO_APP_POLICY_VERSION",
  "MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON",
  "MATTERHORN_CRYPTO_APP_REGISTRY_DB",
  "MATTERHORN_CRYPTO_APP_CONNECTION_DB",
  "MATTERHORN_CRYPTO_APP_DEVELOPER_DB",
  "MATTERHORN_CRYPTO_APP_OPERATIONAL_DB",
  "MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET",
  "MATTERHORN_GUARDED_RUNTIME_MODE",
  "MATTERHORN_CAPABILITY_SIGNING_SECRET",
  "MATTERHORN_GUARDED_RUNTIME_DB",
  "MATTERHORN_AGENT_FILES_MODE",
  "MATTERHORN_EVIDENCE_KMS_REGION",
  "MATTERHORN_EVIDENCE_KMS_KEY_ID",
  "MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET",
  "MATTERHORN_ERASURE_LEDGER_DB",
  "MATTERHORN_WALRUS_EVIDENCE_MODE",
  "MATTERHORN_WALRUS_PUBLISHER_URL",
  "MATTERHORN_WALRUS_AGGREGATOR_URL",
  "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
  "MATTERHORN_EVIDENCE_ANCHOR_PACKAGE_ID",
  "MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT",
] as const;
const priorEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

function config(port: number, root: string, opencodeBaseUrl?: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_coworker",
      name: "Coworker acceptance workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
      ...(opencodeBaseUrl ? { baseUrl: opencodeBaseUrl } : {}),
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
    ...(opencodeBaseUrl ? { opencodeBaseUrl } : {}),
  } as ServerConfig;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

class RouteTestKeyManager implements MatterhornEvidenceKeyManager {
  readonly keys = new Map<string, Buffer>();

  async createDataKey(input: { runId: string; recipientKeyIds: string[] }): Promise<MatterhornEvidenceDataKeyLease> {
    const keyReference = `route-test-${input.runId}`;
    const plaintextKey = randomBytes(32);
    this.keys.set(keyReference, Buffer.from(plaintextKey));
    return {
      plaintextKey,
      keyReference,
      wrappedKey: Buffer.from(keyReference).toString("base64"),
      keyContext: randomBytes(32).toString("hex"),
      recipientKeyIds: [...input.recipientKeyIds],
    };
  }

  async decryptDataKey(input: { keyReference: string }): Promise<Buffer> {
    const key = this.keys.get(input.keyReference);
    if (!key) throw new Error("route_test_key_missing");
    return Buffer.from(key);
  }

  async destroyKey(input: { keyReference: string }): Promise<void> {
    this.keys.delete(input.keyReference);
  }
}

class RouteTestWalrusTransport implements MatterhornWalrusEvidenceTransport {
  publishedBytes = Buffer.alloc(0);
  publishCalls = 0;
  ownerAddress: string | null = null;

  async publish(input: { bytes: Uint8Array; ownerAddress?: string }): Promise<{
    blobId: string;
    suiObjectId: string;
    declaredEndEpoch: number;
  }> {
    this.publishCalls += 1;
    this.publishedBytes = Buffer.from(input.bytes);
    this.ownerAddress = input.ownerAddress ?? null;
    return { blobId: "route-agent-file-blob", suiObjectId: "0x1234", declaredEndEpoch: 15 };
  }

  async readByObjectId(): Promise<Buffer> {
    return Buffer.from(this.publishedBytes);
  }
}

function routeTestCertification(): MatterhornWalrusCertification {
  return {
    network: "testnet",
    blobId: "route-agent-file-blob",
    suiObjectId: "0x1234",
    certifiedEpoch: 10,
    currentEpoch: 11,
    validUntilEpoch: 15,
    deletable: true,
    ownerAddress: ROUTE_SIGNER,
    suiTransactionDigest: "route-agent-file-testnet-transaction",
  };
}

async function boot(
  mode: "off" | "internal" | "invite",
  options: {
    agentFiles?: boolean;
    walrus?: boolean;
    anchor?: boolean;
    anchorVerificationFailure?: boolean;
    opencodeBaseUrl?: string;
    seedCryptoApps?: boolean;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-routes-"));
  roots.push(root);
  process.env.MATTERHORN_WORK_DATA_DIR = join(root, "data");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(root, "memory");
  process.env.MATTERHORN_AUTH_DB = join(root, "auth.db");
  process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
  process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
  process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
  process.env.MATTERHORN_COWORKER_MODE = mode;
  process.env.MATTERHORN_COWORKER_POLICY_VERSION = "coworker-policy-1";
  const coworkerDb = join(root, "coworkers.db");
  const guardedDb = join(root, "guarded-runtime.db");
  process.env.MATTERHORN_COWORKER_DB = coworkerDb;
  process.env.MATTERHORN_GUARDED_RUNTIME_DB = guardedDb;
  process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = mode === "invite" ? "enforce" : "off";
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = mode === "invite" ? "enforce" : "off";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "coworker-route-capability-secret-at-least-32-characters";
  if (mode === "invite") {
    const publisherKeys = generateKeyPairSync("ed25519");
    process.env.MATTERHORN_CRYPTO_APP_POLICY_VERSION = "crypto-app-policy-1";
    process.env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = JSON.stringify([{
      publisherId: "matterhorn",
      keyId: "route-publisher-1",
      algorithm: "ed25519",
      publicKeyPem: publisherKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    }]);
    process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB = join(root, "crypto-app-registry.db");
    process.env.MATTERHORN_CRYPTO_APP_CONNECTION_DB = join(root, "crypto-app-connections.db");
    process.env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB = join(root, "crypto-app-developers.db");
    process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB = join(root, "crypto-app-operations.db");
    process.env.MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET = "route-wallet-proof-secret-at-least-32-characters";
    if (options.seedCryptoApps) {
      const registryStore = new MatterhornCryptoAppRegistryStore(process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB);
      try {
        const registry = new MatterhornCryptoAppRegistry({
          publisherKeys: [{
            publisherId: "matterhorn",
            keyId: "route-publisher-1",
            algorithm: "ed25519",
            publicKey: publisherKeys.publicKey,
          }],
          policyVersion: "crypto-app-policy-1",
          store: registryStore,
        });
        const manifests = buildMatterhornFirstPartyTestnetManifests({
          publisherId: "matterhorn",
          publisherKeyId: "route-publisher-1",
          sign: (payload) => sign(null, Buffer.from(payload), publisherKeys.privateKey).toString("base64url"),
          suiTestnetEndpoint: "https://sui-route-test.example/v1",
          hyperliquidTestnetEndpoint: "https://hyperliquid-route-test.example/v1",
          privacyPolicyUrl: "https://matterhorn.so/privacy",
          statusUrl: "https://status.matterhorn.so",
          securityContact: "security@matterhorn.so",
        });
        for (const manifest of manifests) {
          registry.register(manifest);
          const report = runCryptoAppManifestConformance(manifest, {
            publisherKey: publisherKeys.publicKey,
            policyVersion: "crypto-app-policy-1",
            targetEnvironment: "testnet",
          });
          registry.updateCertification({
            appId: manifest.appId,
            manifestRevision: manifest.manifestRevision,
            state: "certified_testnet",
            report,
            runtimeReport: passingCryptoAppRuntimeReportForTest(manifest, report),
          });
        }
      } finally {
        registryStore.close();
      }
    }
  } else {
    delete process.env.MATTERHORN_CRYPTO_APP_POLICY_VERSION;
    delete process.env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON;
    delete process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB;
    delete process.env.MATTERHORN_CRYPTO_APP_CONNECTION_DB;
    delete process.env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB;
    delete process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB;
    delete process.env.MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET;
  }
  process.env.MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT = "1";
  if (options.agentFiles) {
    process.env.MATTERHORN_AGENT_FILES_MODE = "encrypted";
    process.env.MATTERHORN_EVIDENCE_KMS_REGION = "us-east-1";
    process.env.MATTERHORN_EVIDENCE_KMS_KEY_ID = "alias/route-test-agent-files";
    process.env.MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET = "route-test-erasure-ledger-secret-32-bytes";
    process.env.MATTERHORN_ERASURE_LEDGER_DB = join(root, "erasure-ledger.db");
  } else {
    delete process.env.MATTERHORN_AGENT_FILES_MODE;
    delete process.env.MATTERHORN_EVIDENCE_KMS_REGION;
    delete process.env.MATTERHORN_EVIDENCE_KMS_KEY_ID;
    delete process.env.MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET;
    delete process.env.MATTERHORN_ERASURE_LEDGER_DB;
  }
  if (options.walrus) {
    process.env.MATTERHORN_WALRUS_EVIDENCE_MODE = "testnet";
    process.env.MATTERHORN_WALRUS_PUBLISHER_URL = "https://publisher.example";
    process.env.MATTERHORN_WALRUS_AGGREGATOR_URL = "https://aggregator.example";
    process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN = "route-test-publisher-token";
  } else {
    delete process.env.MATTERHORN_WALRUS_EVIDENCE_MODE;
    delete process.env.MATTERHORN_WALRUS_PUBLISHER_URL;
    delete process.env.MATTERHORN_WALRUS_AGGREGATOR_URL;
    delete process.env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN;
  }
  if (options.anchor) {
    process.env.MATTERHORN_EVIDENCE_ANCHOR_PACKAGE_ID = `0x${"8".repeat(64)}`;
  } else {
    delete process.env.MATTERHORN_EVIDENCE_ANCHOR_PACKAGE_ID;
  }
  const keyManager = options.agentFiles ? new RouteTestKeyManager() : null;
  const walrusTransport = options.walrus ? new RouteTestWalrusTransport() : null;
  let walrusCurrentEpoch = 11;
  let walrusValidUntilEpoch = 15;
  let walrusRenewalTransactionStatus: "confirmed" | "failed" = "confirmed";
  const dependencies: MatterhornServerDependencies = {};
  if (keyManager) dependencies.evidenceKeyManager = keyManager;
  if (walrusTransport) {
    dependencies.cryptoEvidenceWalrusTransport = walrusTransport;
    dependencies.cryptoEvidenceWalrusCertificationVerifier = async () => ({
      ...routeTestCertification(),
      currentEpoch: walrusCurrentEpoch,
      validUntilEpoch: walrusValidUntilEpoch,
    });
    dependencies.agentFileWalrusTransport = walrusTransport;
    dependencies.agentFileWalrusCertificationVerifier = async () => ({
      ...routeTestCertification(),
      currentEpoch: walrusCurrentEpoch,
      validUntilEpoch: walrusValidUntilEpoch,
    });
    const signer = ROUTE_SIGNER;
    const renewalTransaction = new Transaction();
    renewalTransaction.setSender(signer);
    renewalTransaction.setGasOwner(signer);
    renewalTransaction.setGasPrice(1);
    renewalTransaction.setGasBudget(1);
    renewalTransaction.setGasPayment([]);
    renewalTransaction.setExpiration({ Epoch: 20 });
    const renewalBytes = await renewalTransaction.build();
    const renewalDigest = TransactionDataBuilder.getDigestFromBytes(renewalBytes);
    dependencies.agentFileWalrusRenewalTransactionBuilder = async (input) => {
      expect(input.network).toBe("sui:testnet");
      expect(input.signer).toBe(signer);
      expect(input.blobObjectId).toBe("0x1234");
      expect(input.extensionEpochs).toBe(5);
      return {
        transactionBytesBase64: Buffer.from(renewalBytes).toString("base64"),
        transactionDigest: renewalDigest,
        simulationReference: sha256({ test: "route-walrus-renewal" }),
        simulatedAt: new Date().toISOString(),
      };
    };
    dependencies.cryptoEvidenceWalrusDeletionTransactionBuilder = async (input) => {
      expect(input.network).toBe("sui:testnet");
      expect(input.signer).toBe(signer);
      expect(input.blobObjectId).toBe("0x1234");
      return {
        transactionBytesBase64: Buffer.from(renewalBytes).toString("base64"),
        transactionDigest: renewalDigest,
        simulationReference: sha256({ test: "route-walrus-deletion" }),
        simulatedAt: new Date().toISOString(),
      };
    };
    dependencies.agentFileWalrusTransactionStatusVerifier = async (input) => ({
      digest: input.digest,
      signer: input.signer,
      status: walrusRenewalTransactionStatus,
      observedAt: new Date().toISOString(),
    });
    if (options.anchor) {
      dependencies.cryptoEvidenceSuiAnchorPackageVerifier = async () => {
        if (options.anchorVerificationFailure) {
          throw new Error("simulated package substitution");
        }
        return {
          network: "testnet",
          moduleName: "evidence_anchor",
          moduleSha256: "539ced005bc0305c990729c8f0c7f29db271fde69ed043e68e03cb5930735ce2",
          verifiedAt: new Date().toISOString(),
        };
      };
      dependencies.cryptoEvidenceSuiAnchorTransactionBuilder = async (input) => {
        expect(input.network).toBe("sui:testnet");
        expect(input.signer).toBe(signer);
        expect(input.packageId).toBe(`0x${"8".repeat(64)}`);
        expect(input.walrusObjectId).toBe(normalizeSuiAddress("0x1234"));
        return {
          transactionBytesBase64: Buffer.from(renewalBytes).toString("base64"),
          transactionDigest: renewalDigest,
          simulationReference: sha256({ test: "route-sui-evidence-anchor" }),
          simulatedAt: new Date().toISOString(),
        };
      };
      dependencies.cryptoEvidenceSuiAnchorTransactionVerifier = async (input) => {
        expect(input.network).toBe("sui:testnet");
        expect(input.signer).toBe(signer);
        expect(input.packageId).toBe(`0x${"8".repeat(64)}`);
        return {
          objectId: normalizeSuiAddress("0x9"),
          observedAt: new Date().toISOString(),
        };
      };
    }
  }
  const server = await startServer(
    config(await freePort(), root, options.opencodeBaseUrl),
    dependencies,
  ) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return {
    base: `http://127.0.0.1:${server.port}`,
    coworkerDb,
    guardedDb,
    keyManager,
    walrusTransport,
    setWalrusCurrentEpoch: (value: number) => {
      walrusCurrentEpoch = value;
    },
    setWalrusValidUntilEpoch: (value: number) => {
      walrusValidUntilEpoch = value;
    },
    setWalrusRenewalTransactionStatus: (value: "confirmed" | "failed") => {
      walrusRenewalTransactionStatus = value;
    },
    stop,
  };
}

async function request(base: string, path: string, options: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  cookie?: string;
  bearer?: string;
  host?: boolean;
} = {}) {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
  if (options.host) headers.set("x-matterhorn-host-token", HOST_TOKEN);
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json().catch(() => null) as any };
}

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";
  if (!value.startsWith("mh_session=")) throw new Error("missing_test_session_cookie");
  return value;
}

function startCoworkerSessionServer(sessionIds: string[]): Served {
  const allowed = new Set(sessionIds);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const match = /^\/session\/([^/]+)$/.exec(url.pathname);
      const sessionId = match ? decodeURIComponent(match[1] ?? "") : "";
      if (request.method !== "GET" || !allowed.has(sessionId)) {
        return Response.json({ code: "not_found", message: "Not found" }, { status: 404 });
      }
      return Response.json({
        id: sessionId,
        title: `Chat ${sessionId}`,
        slug: sessionId,
        directory: request.headers.get("x-opencode-directory") ?? "",
        time: { created: 100, updated: 100 },
      });
    },
  }) as Served;
  stops.push(() => server.stop(true));
  return server;
}

function coworkerInput() {
  return {
    name: "Market Analyst",
    role: "market_analyst",
    mission: "Research approved public crypto evidence and cite every conclusion.",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read", "write_note"],
    limits: {
      perActionUsd: 0,
      dailyUsd: 0,
      weeklyUsd: 0,
      maxSlippageBps: 0,
      maxLeverage: 1,
      minimumReserveUsd: 0,
      maxActiveWatches: 0,
      maxReadCallsPerRun: 12,
      maxPrepareCallsPerFamily: 0,
    },
    privacy: {
      allowedDataLabels: ["public", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
  };
}

function privateCoworkerInput() {
  return {
    ...coworkerInput(),
    privacy: {
      allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
  };
}

function workingStateInput() {
  return {
    expectedRevision: 0,
    profileRevision: 1,
    decisions: [],
    positions: [],
    unresolvedRisks: [{
      id: "risk_refresh",
      severity: "medium",
      summary: "Refresh the approved public balance before making a decision.",
      evidenceReferenceIds: ["ev_balance"],
      openedAt: "2026-09-01T12:00:00.000Z",
    }],
    pendingActions: [],
    evidenceReferences: [{
      id: "ev_balance",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      referenceHash: "a".repeat(64),
      freshness: "fresh",
      observedAt: "2026-09-01T12:00:00.000Z",
    }],
    approvedMemoryIds: [],
  };
}

function watchCoworkerInput() {
  const profile = coworkerInput();
  return {
    ...profile,
    name: "Risk Monitor",
    role: "risk_monitor",
    automaticAuthorities: ["read", "watch"],
    limits: { ...profile.limits, maxActiveWatches: 1 },
  };
}

function transactionCoworkerInput() {
  const profile = coworkerInput();
  return {
    ...profile,
    name: "Sui wallet reviewer",
    mission: "Prepare exact Sui transfer terms for connected-wallet review.",
    allowedActionIds: ["sui_transfer_preview"],
    automaticAuthorities: ["read", "prepare"],
    limits: { ...profile.limits, maxPrepareCallsPerFamily: 1 },
  };
}

function certifiedSuiResult(now: Date): MatterhornCryptoAppResult {
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: {
      id: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui_route",
    },
    action: { id: "sui_transfer_preview", access: "prepare", network: "sui:testnet" },
    timing: {
      startedAt: new Date(now.getTime() - 300).toISOString(),
      completedAt: new Date(now.getTime() - 100).toISOString(),
      durationMs: 200,
    },
    observation: {
      source: "certified Sui testnet simulation",
      observedAt: new Date(now.getTime() - 200).toISOString(),
      blockOrVersion: "checkpoint:route-test",
      ageMs: 100,
      freshnessMaxAgeMs: 15_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"e".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_route" },
    result: {
      preparedActionId: "sui_preview_route",
      network: "sui:testnet",
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amountSui: "1.25",
      estimatedGasMist: "1000",
      simulationReference: `sha256:${"b".repeat(64)}`,
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    },
  };
}

async function seedPendingSuiIntent(input: {
  guardedDb: string;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  runId: string;
}) {
  const now = new Date();
  const policyHash = "a".repeat(64);
  const result = certifiedSuiResult(now);
  const canonicalArguments = {
    sender: `0x${"1".repeat(64)}`,
    recipient: `0x${"2".repeat(64)}`,
    amountSui: "1.25",
  };
  const intent = compileCertifiedCryptoIntent({
    workspaceId: input.workspaceId,
    runId: input.runId,
    coworkerId: input.coworkerId,
    policyHash,
    canonicalRequestArguments: canonicalArguments,
    result,
    now,
  });
  const policyDecision: MatterhornPolicyDecision = {
    version: "matterhorn.policy-decision.v1",
    runId: intent.runId,
    intentHash: intent.intentHash,
    decision: "wallet_review_required",
    reasonCodes: ["wallet_review_required"],
    evaluatedPolicyHashes: [policyHash],
    evaluatedAt: now.toISOString(),
    limits: [],
  };
  const reviewedAction = cryptoIntentToReviewedActionHandoffV2(intent, policyDecision);
  const state = new MatterhornGuardedRuntimeStateStore(input.guardedDb);
  try {
    const pending = new MatterhornPendingCryptoIntentStore(state).create({
      workspaceId: input.workspaceId,
      sessionId: `ses_${input.runId}`,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      intent,
      policyDecision,
      reviewedAction,
    });
    const preflight: MatterhornAgentPrivacyPreflightResponse = {
      version: "matterhorn.agent-privacy-preflight.v1",
      requestHash: "c".repeat(64),
      workspaceId: input.workspaceId,
      sessionId: pending.sessionId,
      requestedMode: "transaction",
      effectiveMode: "transaction",
      decision: "allow",
      provider: {
        id: "matterhorn-deterministic-runtime",
        name: "Matterhorn deterministic runtime",
        modelId: "none",
        privacyStatus: "local_processing",
        trainingUse: "none",
        retentionDays: 0,
        policyUrl: null,
        dataLeavesMatterhorn: false,
      },
      detectedData: {
        labels: ["wallet_private", "untrusted_external"],
        categories: ["wallet_address", "transaction_intent"],
        redactionCount: 0,
      },
      reason: "Exact transaction terms remain inside the guarded runtime until wallet review.",
    };
    const receipts = new MatterhornAgentRunReceiptStore(state);
    await receipts.start({
      runId: intent.runId,
      workspaceId: input.workspaceId,
      sessionId: pending.sessionId,
      preflight,
      consentUsed: false,
      now,
    });
    await receipts.addReviewedAction({
      runId: intent.runId,
      intentHash: reviewedAction.intentHash,
      policyHash: reviewedAction.policyHash,
      simulationReference: reviewedAction.simulation.reference,
      now,
    });
    return pending;
  } finally {
    state.close();
  }
}

function completedEvidenceReceipt(input: {
  workspaceId: string;
  sessionId: string;
  runId: string;
}): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: `receipt_${input.runId}`,
    runId: input.runId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    status: "success",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.500Z",
    responseDurationMs: 500,
    provider: {
      id: "local",
      name: "Local",
      modelId: "none",
      privacyStatus: "local_processing",
      trainingUse: "none",
      retentionDays: 0,
      policyUrl: null,
    },
    privacy: {
      mode: "private_workspace",
      dataCategories: ["workspace_content"],
      redactionCount: 0,
      consent: "not_required",
      dataLeavesMatterhorn: false,
    },
    usage: {
      inputTokens: 12,
      outputTokens: 8,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0,
      toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 },
    },
    tools: [],
    memory: { readIds: [], writtenIds: [] },
    capabilities: [],
    reviewedActions: [],
    integrity: { previousHash: null, recordHash: "route-test-record-hash" },
  };
}

async function seedCryptoEvidence(input: {
  guardedDb: string;
  keyManager: MatterhornEvidenceKeyManager;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  runId: string;
}) {
  const state = new MatterhornGuardedRuntimeStateStore(input.guardedDb);
  const store = new MatterhornCryptoEvidenceStore(state, input.keyManager);
  const sealed = await sealMatterhornRunEvidence({
    receipt: completedEvidenceReceipt({
      workspaceId: input.workspaceId,
      sessionId: `ses_${input.runId}`,
      runId: input.runId,
    }),
    coworkerId: input.coworkerId,
    recipientKeyIds: ["recipient_route_test"],
    keyManager: input.keyManager,
  });
  try {
    return store.create({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      runId: input.runId,
      coworkerId: input.coworkerId,
      sealed,
    });
  } finally {
    sealed.walrusCiphertext.fill(0);
    state.close();
  }
}

function watchInput() {
  return {
    profileRevision: 1,
    connectionId: "cxc_sui_route",
    name: "Sui balance change",
    appId: "matterhorn.sui-testnet",
    actionId: "sui_account_read",
    network: "sui:testnet",
    parameters: { address: "0x1234" },
    schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
    budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
    conditions: [{ id: "balance_changed", metric: "totalBalance", operator: "changed", value: null }],
  };
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const value = priorEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("crypto coworker HTTP boundary", () => {
  test("requires a one-time account invite and applies revocation immediately", async () => {
    const server = await boot("invite");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-invite-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-invite-b@example.com", password: PASSWORD },
    });
    expect(signupA.response.status).toBe(200);
    expect(signupB.response.status).toBe(200);
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);

    expect((await request(server.base, "/coworker-access", { bearer: TOKEN })).payload.code)
      .toBe("coworker_account_session_required");
    expect((await request(server.base, "/coworker-access", { cookie: cookieA })).payload.status)
      .toMatchObject({ allowed: false, acceptedAt: null });
    const denied = await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA });
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("coworker_access_required");

    const issued = await request(server.base, "/operator/coworker-access/invites", {
      host: true,
      body: { ttlMinutes: 60 },
    });
    expect(issued.response.status).toBe(201);
    expect(issued.response.headers.get("cache-control")).toBe("no-store");
    const invite = String(issued.payload.invite.token);

    const accepted = await request(server.base, "/coworker-access/accept", {
      cookie: cookieA,
      body: { inviteToken: invite },
    });
    expect(accepted.response.status).toBe(200);
    expect(accepted.payload.status).toMatchObject({ allowed: true });
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA })).response.status)
      .toBe(200);
    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    expect(created.response.status).toBe(201);
    const coworkerId = String(created.payload.coworker.id);

    const directStore = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      const directCoworkers = new MatterhornCoworkers({
        store: directStore,
        policyVersion: "coworker-policy-1",
      });
      const resources = directCoworkers.setResourceScope(
        workspaceA,
        String(signupA.payload.user.id),
        coworkerId,
        {
          expectedRevision: 0,
          profileRevision: 1,
          agentFiles: [],
          memories: [],
          connections: [{
            id: "cxc_sui_bound_route",
            appId: "matterhorn.sui-testnet",
            manifestRevision: "1.0.0",
            actionIds: ["sui_account_read"],
            networks: ["sui:testnet"],
          }],
        },
      );
      const binding = directCoworkers.bindSession(
        workspaceA,
        String(signupA.payload.user.id),
        "ses_bound_coworker",
        { coworkerId, coworkerRevision: 1, expectedRevision: 0 },
      );
      expect(binding.resourceScopeHash).toBe(resources.scopeHash);
    } finally {
      directStore.close();
    }
    const substituted = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_bound_coworker/messages/preflight`,
      {
        cookie: cookieA,
        body: {
          coworkerId: "cw_substitution_attempt",
          parts: [{ type: "text", text: "Read approved Sui testnet state." }],
          executionMode: "work",
        },
      },
    );
    expect(substituted.response.status).toBe(409);
    expect(substituted.payload.code).toBe("coworker_session_binding_conflict");

    const replay = await request(server.base, "/coworker-access/accept", {
      cookie: cookieB,
      body: { inviteToken: invite },
    });
    expect(replay.response.status).toBe(409);
    expect(replay.payload.code).toBe("coworker_access_invite_consumed");

    const accessList = await request(server.base, "/operator/coworker-access", { host: true });
    expect(accessList.response.status).toBe(200);
    expect(accessList.payload.accounts).toHaveLength(1);
    expect(JSON.stringify(accessList.payload)).not.toContain(String(signupA.payload.user.id));
    expect(JSON.stringify(accessList.payload)).not.toContain("coworker-invite-a@example.com");
    const accessId = String(accessList.payload.accounts[0].accessId);
    expect(accessId).toMatch(/^mhca_[A-Za-z0-9_-]{20,64}$/);

    const revoked = await request(server.base, "/operator/coworker-access/revoke", {
      host: true,
      body: { accessId },
    });
    expect(revoked.response.status).toBe(200);
    expect(revoked.payload.status).toMatchObject({ allowed: false, acceptedAt: null });
    const blockedAfterRevoke = await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA });
    expect(blockedAfterRevoke.response.status).toBe(403);
    expect(blockedAfterRevoke.payload.code).toBe("coworker_access_required");
    const blockedMessage = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_revoked_coworker/messages/preflight`,
      {
        cookie: cookieA,
        body: {
          coworkerId,
          parts: [{ type: "text", text: "Read approved Sui testnet state." }],
          executionMode: "work",
        },
      },
    );
    expect(blockedMessage.response.status).toBe(403);
    expect(blockedMessage.payload.code).toBe("coworker_access_required");

    const replacementInvite = await request(server.base, "/operator/coworker-access/invites", {
      host: true,
      body: { ttlMinutes: 60 },
    });
    const restored = await request(server.base, "/coworker-access/accept", {
      cookie: cookieA,
      body: { inviteToken: String(replacementInvite.payload.invite.token) },
    });
    expect(restored.response.status).toBe(200);
    expect(restored.payload.status).toMatchObject({ allowed: true });
    const replacementAccessList = await request(server.base, "/operator/coworker-access", { host: true });
    const replacementAccessId = String(replacementAccessList.payload.accounts[0].accessId);
    expect(replacementAccessId).not.toBe(accessId);

    const staleRevoke = await request(server.base, "/operator/coworker-access/revoke", {
      host: true,
      body: { accessId },
    });
    expect(staleRevoke.response.status).toBe(404);
    expect(staleRevoke.payload.code).toBe("coworker_access_not_found");
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA })).response.status)
      .toBe(200);

    const deleted = await request(server.base, "/api/auth/account", {
      method: "DELETE",
      cookie: cookieA,
      body: { confirmationEmail: "coworker-invite-a@example.com", password: PASSWORD },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.status).toBe("deleted");
    const afterDeletion = await request(server.base, "/operator/coworker-access", { host: true });
    expect(afterDeletion.payload.accounts).toEqual([]);
    const coworkerStore = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      expect(coworkerStore.getAccountAccess(String(signupA.payload.user.id))).toBeNull();
    } finally {
      coworkerStore.close();
    }
  });

  test("stores encrypted Agent Files for the selected tenant and coworker only", async () => {
    const server = await boot("internal", { agentFiles: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-files-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-files-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const workspaceB = String((await request(server.base, "/workspaces", { cookie: cookieB })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: privateCoworkerInput(),
    });
    const coworkerId = String(coworker.payload.coworker.id);
    expect((await request(server.base, `/workspace/${workspaceA}/agent-files`)).response.status).toBe(401);

    const privateText = "Use a maximum 20% TAO allocation and review weekly.";
    const created = await request(server.base, `/workspace/${workspaceA}/agent-files`, {
      cookie: cookieA,
      body: {
        name: "portfolio-policy.md",
        mimeType: "text/markdown",
        coworkerIds: [coworkerId],
        expiresAt: "2026-10-01T00:00:00.000Z",
        contentBase64: Buffer.from(privateText).toString("base64"),
      },
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.item).toMatchObject({
      revision: 1,
      file: {
        name: "portfolio-policy.md",
        dataLabel: "workspace_private",
        access: { coworkerIds: [coworkerId], readOnly: true },
        security: { walletAuthority: "none" },
      },
    });
    expect(JSON.stringify(created.payload)).not.toContain(privateText);
    const ownList = await request(server.base, `/workspace/${workspaceA}/agent-files`, { cookie: cookieA });
    expect(ownList.payload).toMatchObject({ mode: "encrypted", available: true });
    expect(ownList.payload.items).toHaveLength(1);
    expect((await request(server.base, `/workspace/${workspaceA}/agent-files`, { cookie: cookieB })).response.status)
      .toBe(404);
    expect((await request(server.base, `/workspace/${workspaceB}/agent-files`, { cookie: cookieB })).payload.items)
      .toEqual([]);

    const publicCoworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    const incompatible = await request(server.base, `/workspace/${workspaceA}/agent-files`, {
      cookie: cookieA,
      body: {
        name: "public-role-private-file.md",
        mimeType: "text/markdown",
        coworkerIds: [String(publicCoworker.payload.coworker.id)],
        expiresAt: null,
        contentBase64: Buffer.from(privateText).toString("base64"),
      },
    });
    expect(incompatible.response.status).toBe(400);
    expect(incompatible.payload.code).toBe("agent_file_coworker_incompatible");

    const fileId = String(created.payload.item.id);
    const recommendationPath = `/workspace/${workspaceA}/coworkers/${coworkerId}/resources/recommendation`;
    expect((await request(server.base, recommendationPath)).response.status).toBe(401);
    expect((await request(server.base, recommendationPath, { cookie: cookieB })).response.status).toBe(404);
    const recommendation = await request(server.base, recommendationPath, { cookie: cookieA });
    expect(recommendation.response.status).toBe(200);
    expect(recommendation.response.headers.get("cache-control")).toBe("no-store");
    expect(recommendation.payload.recommendation).toMatchObject({
      workspaceId: workspaceA,
      coworkerId,
      profileRevision: 1,
      expectedScopeRevision: 0,
      agentFiles: [{
        id: fileId,
        revision: 1,
        name: "portfolio-policy.md",
        reason: "assigned_to_this_coworker",
      }],
      memories: [],
      connections: [],
      approval: {
        required: true,
        automaticGrant: false,
        walletSubmission: "connected_wallet_only",
      },
    });
    expect(recommendation.payload.recommendation.recommendationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(recommendation.payload)).not.toContain(privateText);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      { cookie: cookieA },
    )).payload.resources).toBeNull();
    const changedRecommendation = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 0,
          profileRevision: 1,
          agentFileIds: [],
          memoryIds: [],
          connectionIds: [],
          recommendationHash: recommendation.payload.recommendation.recommendationHash,
        },
      },
    );
    expect(changedRecommendation.response.status).toBe(409);
    expect(changedRecommendation.payload.code).toBe("coworker_resource_recommendation_stale");
    const scoped = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 0,
          profileRevision: 1,
          agentFileIds: [fileId],
          memoryIds: [],
          connectionIds: [],
          recommendationHash: recommendation.payload.recommendation.recommendationHash,
        },
      },
    );
    expect(scoped.response.status).toBe(200);
    expect(scoped.payload).toMatchObject({
      active: true,
      resources: {
        agentFiles: [{ id: fileId, revision: 1 }],
        privacy: { mode: "private_workspace", unverifiedProviderConsent: false },
      },
    });
    expect(JSON.stringify(scoped.payload)).not.toContain(privateText);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      { cookie: cookieA },
    )).payload.active).toBe(true);

    const secretRejected = await request(server.base, `/workspace/${workspaceA}/agent-files`, {
      cookie: cookieA,
      body: {
        name: "wallet.txt",
        mimeType: "text/plain",
        coworkerIds: [coworkerId],
        expiresAt: null,
        contentBase64: Buffer.from(
          "private key: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ).toString("base64"),
      },
    });
    expect(secretRejected.response.status).toBe(400);
    expect(secretRejected.payload).toMatchObject({
      code: "agent_file_blocked",
      details: { issues: expect.arrayContaining(["agent_file_secret_content_blocked"]) },
    });
    expect((await request(server.base, `/workspace/${workspaceA}/agent-files`, { cookie: cookieA })).payload.items)
      .toHaveLength(1);

    const recovered = await fetch(`${server.base}/workspace/${workspaceA}/agent-files/${fileId}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("cache-control")).toContain("no-store");
    expect(recovered.headers.get("content-type")).toContain("text/markdown");
    expect(recovered.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''portfolio-policy.md",
    );
    expect(recovered.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await recovered.text()).toBe(privateText);
    const crossTenantRecovery = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/recover`,
      { cookie: cookieB, body: { expectedRevision: 1 } },
    );
    expect(crossTenantRecovery.response.status).toBe(404);
    const staleRecovery = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/recover`,
      { cookie: cookieA, body: { expectedRevision: 2 } },
    );
    expect(staleRecovery.response.status).toBe(409);
    const staleDelete = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 2 },
    });
    expect(staleDelete.response.status).toBe(409);
    const deleted = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 1 },
    });
    expect(deleted.response.status).toBe(200);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      { cookie: cookieA },
    )).payload.active).toBe(false);
    expect((await request(server.base, `/workspace/${workspaceA}/agent-files`, { cookie: cookieA })).payload.items)
      .toEqual([]);
    expect(server.keyManager?.keys.size).toBe(0);
  });

  test("requires explicit consent before ciphertext-only Walrus testnet backup", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-file-walrus-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-file-walrus-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: privateCoworkerInput(),
    });
    const coworkerId = String(coworker.payload.coworker.id);
    const privateText = "Private portfolio policy: keep 70% liquid.";
    const created = await request(server.base, `/workspace/${workspaceA}/agent-files`, {
      cookie: cookieA,
      body: {
        name: "private-policy.md",
        mimeType: "text/markdown",
        coworkerIds: [coworkerId],
        expiresAt: null,
        contentBase64: Buffer.from(privateText).toString("base64"),
      },
    });
    const fileId = String(created.payload.item.id);

    const missingConsent = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/publish`,
      { cookie: cookieA, body: { expectedRevision: 1, network: "testnet" } },
    );
    expect(missingConsent.response.status).toBe(400);
    expect(missingConsent.payload.code).toBe("agent_file_walrus_confirmation_required");
    expect(server.walrusTransport?.publishCalls).toBe(0);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/publish`,
      {
        cookie: cookieB,
        body: { expectedRevision: 1, network: "testnet", acknowledgePublicCiphertext: true },
      },
    )).response.status).toBe(404);

    const published = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/publish`,
      {
        cookie: cookieA,
        body: { expectedRevision: 1, network: "testnet", acknowledgePublicCiphertext: true },
      },
    );
    expect(published.response.status).toBe(200);
    expect(published.payload).toMatchObject({
      item: {
        revision: 2,
        publication: { network: "testnet", blobId: "route-agent-file-blob" },
      },
      disclosure: {
        stored: "encrypted_bytes_only",
        publicBytesMayRemainAfterDeletion: true,
        deletionDestroysRecoveryKey: true,
      },
    });
    expect(server.walrusTransport?.publishCalls).toBe(1);
    const publicPayload = server.walrusTransport?.publishedBytes.toString("utf8") ?? "";
    expect(publicPayload).toContain("matterhorn.walrus-ciphertext.v1");
    for (const forbidden of [privateText, "private-policy.md", coworkerId, workspaceA]) {
      expect(publicPayload).not.toContain(forbidden);
    }
    expect(JSON.stringify(published.payload)).not.toContain(privateText);
    expect(JSON.stringify(published.payload)).not.toContain('"ciphertext":"');

    const verified = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/verify`,
      { cookie: cookieA, method: "POST" },
    );
    expect(verified.payload).toMatchObject({
      verified: true,
      network: "testnet",
      blobId: "route-agent-file-blob",
      currentEpoch: 11,
      lifecycle: { status: "healthy", remainingEpochs: 4 },
    });
    server.setWalrusCurrentEpoch(15);
    const expired = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/verify`,
      { cookie: cookieA, method: "POST" },
    );
    expect(expired.response.status).toBe(410);
    expect(expired.payload.code).toBe("agent_file_walrus_certification_expired");
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/verify`,
      { method: "POST" },
    )).response.status).toBe(401);
    const replay = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/publish`,
      {
        cookie: cookieA,
        body: { expectedRevision: 2, network: "testnet", acknowledgePublicCiphertext: true },
      },
    );
    expect(replay.response.status).toBe(409);
    expect(server.walrusTransport?.publishCalls).toBe(1);

    const deleted = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 2 },
    });
    expect(deleted.response.status).toBe(200);
    expect(server.keyManager?.keys.size).toBe(0);
  });

  test("renews Walrus backup through a tenant-bound connected-wallet airlock", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-file-renewal-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "agent-file-renewal-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: privateCoworkerInput(),
    });
    const created = await request(server.base, `/workspace/${workspaceA}/agent-files`, {
      cookie: cookieA,
      body: {
        name: "renewal-policy.md",
        mimeType: "text/markdown",
        coworkerIds: [String(coworker.payload.coworker.id)],
        expiresAt: null,
        contentBase64: Buffer.from("Private renewal policy.").toString("base64"),
      },
    });
    const fileId = String(created.payload.item.id);
    const published = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/publish`, {
      cookie: cookieA,
      body: { expectedRevision: 1, network: "testnet", acknowledgePublicCiphertext: true },
    });
    expect(published.response.status).toBe(200);
    server.setWalrusCurrentEpoch(13);
    const list = await request(server.base, `/workspace/${workspaceA}/agent-files`, { cookie: cookieA });
    expect(list.payload.cloudBackup).toMatchObject({ network: "testnet", renewalAvailable: true });

    const missingWalletConsent = await request(
      server.base,
      `/workspace/${workspaceA}/agent-files/${fileId}/renew`,
      {
        cookie: cookieA,
        body: { expectedRevision: 2, network: "testnet", signer: "0x1" },
      },
    );
    expect(missingWalletConsent.response.status).toBe(400);
    expect(missingWalletConsent.payload.code).toBe("agent_file_walrus_renewal_confirmation_required");
    expect((await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/renew`, {
      cookie: cookieB,
      body: {
        expectedRevision: 2,
        network: "testnet",
        signer: "0x1",
        acknowledgeWalletPayment: true,
      },
    })).response.status).toBe(404);

    const prepared = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/renew`, {
      cookie: cookieA,
      body: {
        expectedRevision: 2,
        network: "testnet",
        signer: "0x1",
        acknowledgeWalletPayment: true,
      },
    });
    expect(prepared.response.status).toBe(200);
    expect(prepared.payload).toMatchObject({
      preview: {
        fileId,
        fileRevision: 2,
        network: "testnet",
        signer: normalizeSuiAddress("0x1"),
        previousValidUntilEpoch: 15,
        targetValidUntilEpoch: 20,
        walletAuthority: "connected_wallet_only",
      },
      disclosure: {
        paymentAsset: "WAL",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
      },
    });
    expect(prepared.payload.preview.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.payload.preview.transactionBytesBase64).toBeString();

    const tampered = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/renew/confirm`, {
      cookie: cookieA,
      body: {
        intentId: prepared.payload.preview.intentId,
        intentHash: "0".repeat(64),
        transactionDigest: prepared.payload.preview.transactionDigest,
      },
    });
    expect(tampered.response.status).toBe(409);
    expect(tampered.payload.code).toBe("agent_file_walrus_renewal_intent_mismatch");

    server.setWalrusValidUntilEpoch(20);
    const confirmed = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/renew/confirm`, {
      cookie: cookieA,
      body: {
        intentId: prepared.payload.preview.intentId,
        intentHash: prepared.payload.preview.intentHash,
        transactionDigest: prepared.payload.preview.transactionDigest,
      },
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload).toMatchObject({
      item: {
        revision: 3,
        publication: {
          validUntilEpoch: 20,
          renewalTransactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
      verification: { verified: true, validUntilEpoch: 20 },
    });
    const replay = await request(server.base, `/workspace/${workspaceA}/agent-files/${fileId}/renew/confirm`, {
      cookie: cookieA,
      body: {
        intentId: prepared.payload.preview.intentId,
        intentHash: prepared.payload.preview.intentHash,
        transactionDigest: prepared.payload.preview.transactionDigest,
      },
    });
    expect(replay.response.status).toBe(410);
    expect(replay.payload.code).toBe("agent_file_walrus_renewal_expired_or_replayed");
  });

  test("destroys Agent File recovery keys before account deletion completes", async () => {
    const server = await boot("internal", { agentFiles: true });
    const email = "agent-files-delete@example.com";
    const signup = await request(server.base, "/api/auth/sign-up/email", {
      body: { email, password: PASSWORD },
    });
    const sessionCookie = cookie(signup.response);
    const workspaceId = String(
      (await request(server.base, "/workspaces", { cookie: sessionCookie })).payload.items[0].id,
    );
    const coworker = await request(server.base, `/workspace/${workspaceId}/coworkers`, {
      cookie: sessionCookie,
      body: privateCoworkerInput(),
    });
    expect((await request(server.base, `/workspace/${workspaceId}/agent-files`, {
      cookie: sessionCookie,
      body: {
        name: "delete-with-account.md",
        mimeType: "text/markdown",
        coworkerIds: [String(coworker.payload.coworker.id)],
        expiresAt: null,
        contentBase64: Buffer.from("Delete this private context with the account.").toString("base64"),
      },
    })).response.status).toBe(201);
    expect(server.keyManager?.keys.size).toBe(1);

    const deleted = await request(server.base, "/api/auth/account", {
      method: "DELETE",
      cookie: sessionCookie,
      body: { confirmationEmail: email, password: PASSWORD },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.status).toBe("deleted");
    expect(server.keyManager?.keys.size).toBe(0);
    const state = new MatterhornGuardedRuntimeStateStore(server.guardedDb);
    try {
      expect(state.list("agent_file_record", { workspaceId })).toEqual([]);
    } finally {
      state.close();
    }
  });

  test("is authenticated and disabled without touching account state", async () => {
    const server = await boot("off");
    expect((await request(server.base, "/workspace/ws_coworker/coworkers")).response.status).toBe(401);
    expect((await request(server.base, "/workspace/ws_coworker/crypto-evidence")).response.status).toBe(401);
    const disabled = await request(server.base, "/workspace/ws_coworker/coworkers", { bearer: TOKEN });
    expect(disabled.response.status).toBe(503);
    expect(disabled.payload.code).toBe("coworker_runtime_disabled");
    const forkDisabled = await request(
      server.base,
      "/workspace/ws_coworker/sessions/source_session/coworker/fork",
      { bearer: TOKEN, body: { targetSessionId: "target_session" } },
    );
    expect(forkDisabled.response.status).toBe(503);
    expect(forkDisabled.payload.code).toBe("coworker_runtime_disabled");
    const evidence = await request(server.base, "/workspace/ws_coworker/crypto-evidence", { bearer: TOKEN });
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload).toEqual({
      mode: "off",
      available: false,
      publicationAvailable: false,
      renewalAvailable: false,
      deletionAvailable: false,
      anchorAvailable: false,
      anchorPackageStatus: "disabled",
      items: [],
    });
  });

  test("inherits a chat coworker only from the tenant's exact active source binding", async () => {
    const opencode = startCoworkerSessionServer([
      "ses_source",
      "ses_fork",
      "ses_injected",
    ]);
    const server = await boot("invite", {
      opencodeBaseUrl: `http://127.0.0.1:${opencode.port}`,
      seedCryptoApps: true,
    });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-fork-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-fork-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const workspaceB = String((await request(server.base, "/workspaces", { cookie: cookieB })).payload.items[0].id);
    const invite = await request(server.base, "/operator/coworker-access/invites", {
      host: true,
      body: { ttlMinutes: 60 },
    });
    expect((await request(server.base, "/coworker-access/accept", {
      cookie: cookieA,
      body: { inviteToken: String(invite.payload.invite.token) },
    })).response.status).toBe(200);
    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    const coworkerId = String(created.payload.coworker.id);
    const connection = await request(server.base, `/workspace/${workspaceA}/crypto-app-connections`, {
      cookie: cookieA,
      body: {
        appId: "matterhorn.sui-testnet",
        grantedActionIds: ["sui_account_read"],
        grantedScopes: [],
        grantedNetworks: ["sui:testnet"],
      },
    });
    expect(connection.response.status).toBe(201);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 0,
          profileRevision: 1,
          agentFileIds: [],
          memoryIds: [],
          connectionIds: [String(connection.payload.connection.id)],
        },
      },
    )).response.status).toBe(200);
    const bound = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_source/coworker`,
      {
        method: "PUT",
        cookie: cookieA,
        body: { coworkerId, coworkerRevision: 1, expectedRevision: 0 },
      },
    );
    expect(bound.response.status).toBe(200);

    const inherited = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_source/coworker/fork`,
      { cookie: cookieA, body: { targetSessionId: "ses_fork" } },
    );
    expect(inherited.response.status).toBe(201);
    expect(inherited.response.headers.get("cache-control")).toBe("no-store");
    expect(inherited.payload).toMatchObject({
      active: true,
      binding: {
        sessionId: "ses_fork",
        coworkerId,
        coworkerRevision: 1,
        revision: 1,
      },
      coworker: { id: coworkerId, revision: 1, state: "active" },
    });
    expect(inherited.payload.binding.ownerId).toBeUndefined();
    const restored = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_fork/coworker`,
      { cookie: cookieA },
    );
    expect(restored.payload).toMatchObject({
      active: true,
      binding: { coworkerId, revision: 1 },
    });

    const replay = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_source/coworker/fork`,
      { cookie: cookieA, body: { targetSessionId: "ses_fork" } },
    );
    expect(replay.response.status).toBe(409);
    expect(replay.payload.code).toBe("coworker_session_binding_conflict");
    const injected = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_source/coworker/fork`,
      {
        cookie: cookieA,
        body: { targetSessionId: "ses_injected", coworkerId: "cw_caller_selected" },
      },
    );
    expect(injected.response.status).toBe(400);
    expect(injected.payload.code).toBe("coworker_session_binding_invalid");
    const otherTenant = await request(
      server.base,
      `/workspace/${workspaceB}/sessions/ses_source/coworker/fork`,
      { cookie: cookieA, body: { targetSessionId: "ses_injected" } },
    );
    expect(otherTenant.response.status).toBe(404);
    expect(otherTenant.payload.code).toBe("workspace_not_found");
  });

  test("publishes completed coworker evidence only after exact owner confirmation", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-publish-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-publish-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    const coworkerId = String(coworker.payload.coworker.id);
    const ownerId = String(signupA.payload.user.id);
    const runId = "run_route_private_evidence";
    if (!server.keyManager) throw new Error("route_test_key_manager_missing");
    const record = await seedCryptoEvidence({
      guardedDb: server.guardedDb,
      keyManager: server.keyManager,
      workspaceId: workspaceA,
      ownerId,
      coworkerId,
      runId,
    });

    const before = await request(server.base, `/workspace/${workspaceA}/crypto-evidence`, { cookie: cookieA });
    expect(before.payload).toMatchObject({
      mode: "testnet",
      available: true,
      publicationAvailable: true,
      items: [{ evidenceId: record.id, revision: 1, state: "sealed", publication: null }],
    });
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      { cookie: cookieA, body: { expectedRevision: 1, network: "testnet" } },
    )).payload.code).toBe("crypto_evidence_walrus_confirmation_required");
    expect(server.walrusTransport?.publishCalls).toBe(0);
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieB,
        body: { expectedRevision: 1, network: "testnet", acknowledgePublicCiphertext: true },
      },
    )).response.status).toBe(404);
    expect(server.walrusTransport?.publishCalls).toBe(0);

    const invalidOwner = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: "not-a-sui-address",
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(invalidOwner.response.status).toBe(400);
    expect(invalidOwner.payload.code).toBe("crypto_evidence_walrus_owner_invalid");
    expect(server.walrusTransport?.publishCalls).toBe(0);

    const published = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(published.response.status).toBe(200);
    expect(published.payload).toMatchObject({
      item: {
        evidenceId: record.id,
        revision: 2,
        state: "published",
        publication: { network: "testnet", blobId: "route-agent-file-blob" },
      },
      disclosure: {
        network: "testnet",
        stored: "encrypted_bytes_only",
        ownership: "connected_wallet_only",
        publicBytesMayRemainAfterDeletion: true,
        deletionDestroysRecoveryKey: true,
      },
    });
    expect(server.walrusTransport?.publishCalls).toBe(1);
    expect(server.walrusTransport?.ownerAddress).toBe(ROUTE_SIGNER);
    const publicPayload = server.walrusTransport?.publishedBytes.toString("utf8") ?? "";
    expect(publicPayload).toContain("matterhorn.walrus-ciphertext.v1");
    for (const privateValue of [workspaceA, ownerId, coworkerId, runId, `route-test-${runId}`]) {
      expect(publicPayload).not.toContain(privateValue);
      expect(JSON.stringify(published.payload)).not.toContain(privateValue);
    }
    expect(JSON.stringify(published.payload)).not.toContain('"ciphertext"');

    const staleReplay = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(staleReplay.response.status).toBe(409);
    expect(staleReplay.payload.code).toBe("crypto_evidence_revision_conflict");
    expect(server.walrusTransport?.publishCalls).toBe(1);

    const verified = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/verify`,
      { cookie: cookieA, method: "POST" },
    );
    expect(verified.payload.verification).toMatchObject({
      status: "verified",
      checks: {
        tenantScope: true,
        ciphertextHash: true,
        merkleInclusion: true,
        suiCertification: true,
        walrusReadback: true,
      },
    });

    const missingDeletionConfirmation = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/recovery-key`,
      { cookie: cookieA, method: "DELETE", body: { expectedRevision: 2 } },
    );
    expect(missingDeletionConfirmation.response.status).toBe(400);
    expect(missingDeletionConfirmation.payload.code).toBe("crypto_evidence_key_destruction_confirmation_required");
    expect(server.keyManager.keys.size).toBe(1);

    const crossTenantDeletion = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/recovery-key`,
      {
        cookie: cookieB,
        method: "DELETE",
        body: { expectedRevision: 2, confirm: `destroy-recovery-key:${record.id}` },
      },
    );
    expect(crossTenantDeletion.response.status).toBe(404);
    expect(server.keyManager.keys.size).toBe(1);

    const staleDeletion = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/recovery-key`,
      {
        cookie: cookieA,
        method: "DELETE",
        body: { expectedRevision: 1, confirm: `destroy-recovery-key:${record.id}` },
      },
    );
    expect(staleDeletion.response.status).toBe(409);
    expect(staleDeletion.payload.code).toBe("crypto_evidence_revision_conflict");
    expect(server.keyManager.keys.size).toBe(1);

    const deleted = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/recovery-key`,
      {
        cookie: cookieA,
        method: "DELETE",
        body: { expectedRevision: 2, confirm: `destroy-recovery-key:${record.id}` },
      },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload).toMatchObject({
      item: {
        evidenceId: record.id,
        revision: 3,
        state: "key_destroyed",
        retention: { keyAvailable: false },
      },
      deletion: {
        recoveryKeyDestroyed: true,
        contentRecoverable: false,
        publicCiphertextMayRemain: true,
      },
    });
    expect(server.keyManager.keys.size).toBe(0);
    expect(JSON.stringify(deleted.payload)).not.toContain(workspaceA);
    expect(JSON.stringify(deleted.payload)).not.toContain(ownerId);
    expect(JSON.stringify(deleted.payload)).not.toContain(coworkerId);
    expect(JSON.stringify(deleted.payload)).not.toContain(runId);
    expect(JSON.stringify(deleted.payload)).not.toContain('"ciphertext"');

    const verifiedAfterDeletion = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/verify`,
      { cookie: cookieA, method: "POST" },
    );
    expect(verifiedAfterDeletion.payload.verification).toMatchObject({
      status: "key_destroyed",
      reason: "recovery_material_deleted",
    });

    const publishAfterDeletion = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 3,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(publishAfterDeletion.response.status).toBe(409);
    expect(publishAfterDeletion.payload.code).toBe("crypto_evidence_walrus_publish_state_invalid");
  });

  test("fails readiness and keeps anchoring unavailable when configured package provenance fails", async () => {
    const server = await boot("internal", {
      agentFiles: true,
      walrus: true,
      anchor: true,
      anchorVerificationFailure: true,
    });
    const readiness = await request(server.base, "/health/ready");
    expect(readiness.response.status).toBe(503);
    expect(readiness.payload.checks).toMatchObject({
      cryptoEvidenceSuiAnchorPackageConfigured: true,
      cryptoEvidenceSuiAnchorPackageVerified: false,
      cryptoEvidenceSuiAnchorPackageStatus: "verification_failed",
      cryptoEvidenceSuiAnchorPackageReady: false,
    });

    const signup = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-anchor-failed@example.com", password: PASSWORD },
    });
    const sessionCookie = cookie(signup.response);
    const workspaceId = String(
      (await request(server.base, "/workspaces", { cookie: sessionCookie })).payload.items[0].id,
    );
    const listed = await request(
      server.base,
      `/workspace/${workspaceId}/crypto-evidence`,
      { cookie: sessionCookie },
    );
    expect(listed.payload.anchorAvailable).toBe(false);
    expect(listed.payload.anchorPackageStatus).toBe("verification_failed");
    const unavailable = await request(
      server.base,
      `/workspace/${workspaceId}/crypto-evidence/evidence_valid_test_id/anchor`,
      {
        cookie: sessionCookie,
        body: {
          expectedRevision: 1,
          network: "testnet",
          signer: ROUTE_SIGNER,
          acknowledgePermanentPublicAnchor: true,
        },
      },
    );
    expect(unavailable.response.status).toBe(503);
    expect(unavailable.payload.code).toBe("crypto_evidence_sui_anchor_unavailable");
  });

  test("anchors published evidence only through one exact connected-wallet transaction", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true, anchor: true });
    const readiness = await request(server.base, "/health/ready");
    expect(readiness.response.status).toBe(200);
    expect(readiness.payload.checks).toMatchObject({
      cryptoEvidenceSuiAnchorPackageConfigured: true,
      cryptoEvidenceSuiAnchorPackageVerified: true,
      cryptoEvidenceSuiAnchorPackageStatus: "verified",
      cryptoEvidenceSuiAnchorPackageReady: true,
    });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-anchor-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-anchor-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    if (!server.keyManager) throw new Error("route_test_key_manager_missing");
    const record = await seedCryptoEvidence({
      guardedDb: server.guardedDb,
      keyManager: server.keyManager,
      workspaceId: workspaceA,
      ownerId: String(signupA.payload.user.id),
      coworkerId: String(coworker.payload.coworker.id),
      runId: "run_route_sui_anchor_evidence",
    });
    const published = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(published.response.status).toBe(200);

    const listed = await request(server.base, `/workspace/${workspaceA}/crypto-evidence`, { cookie: cookieA });
    expect(listed.payload.anchorAvailable).toBe(true);
    expect(listed.payload.anchorPackageStatus).toBe("verified");
    expect(listed.payload.items[0].anchor).toBeNull();

    const missingAcknowledgement = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor`,
      { cookie: cookieA, body: { expectedRevision: 2, network: "testnet", signer: ROUTE_SIGNER } },
    );
    expect(missingAcknowledgement.response.status).toBe(400);
    expect(missingAcknowledgement.payload.code).toBe("crypto_evidence_sui_anchor_confirmation_required");

    const crossTenant = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor`,
      {
        cookie: cookieB,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: ROUTE_SIGNER,
          acknowledgePermanentPublicAnchor: true,
        },
      },
    );
    expect(crossTenant.response.status).toBe(404);

    const prepared = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: ROUTE_SIGNER,
          acknowledgePermanentPublicAnchor: true,
        },
      },
    );
    expect(prepared.response.status).toBe(200);
    expect(prepared.payload).toMatchObject({
      preview: {
        evidenceId: record.id,
        evidenceRevision: 2,
        network: "testnet",
        walletAuthority: "connected_wallet_only",
      },
      disclosure: {
        walletAction: "create_immutable_evidence_anchor",
        publicTransactionIsPermanent: true,
        publicContent: "non_identifying_hashes_only",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
      },
    });
    const serialized = JSON.stringify(prepared.payload);
    expect(serialized).not.toContain(String(signupA.payload.user.id));
    expect(serialized).not.toContain(workspaceA);

    const mutated = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: "0".repeat(64),
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(mutated.response.status).toBe(409);
    expect(mutated.payload.code).toBe("crypto_evidence_sui_anchor_intent_mismatch");

    const confirmed = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload).toMatchObject({
      item: {
        revision: 3,
        anchor: {
          network: "testnet",
          objectId: normalizeSuiAddress("0x9"),
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    });
    expect(JSON.stringify(confirmed.payload)).not.toContain(String(signupA.payload.user.id));

    const replay = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/anchor/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(replay.response.status).toBe(410);
    expect(replay.payload.code).toBe("crypto_evidence_sui_anchor_expired_or_replayed");
  });

  test("renews published evidence only through one exact connected-wallet transaction", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-renew-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-renew-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    if (!server.keyManager) throw new Error("route_test_key_manager_missing");
    const record = await seedCryptoEvidence({
      guardedDb: server.guardedDb,
      keyManager: server.keyManager,
      workspaceId: workspaceA,
      ownerId: String(signupA.payload.user.id),
      coworkerId: String(coworker.payload.coworker.id),
      runId: "run_route_renewal_evidence",
    });
    const published = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(published.response.status).toBe(200);
    server.setWalrusCurrentEpoch(13);

    const missingWalletConfirmation = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew`,
      { cookie: cookieA, body: { expectedRevision: 2, network: "testnet", signer: "0x1" } },
    );
    expect(missingWalletConfirmation.response.status).toBe(400);
    expect(missingWalletConfirmation.payload.code).toBe("crypto_evidence_walrus_renewal_confirmation_required");

    const crossTenant = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew`,
      {
        cookie: cookieB,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: "0x1",
          acknowledgeWalletPayment: true,
        },
      },
    );
    expect(crossTenant.response.status).toBe(404);

    const prepared = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: "0x1",
          acknowledgeWalletPayment: true,
        },
      },
    );
    expect(prepared.response.status).toBe(200);
    expect(prepared.payload).toMatchObject({
      preview: {
        evidenceId: record.id,
        evidenceRevision: 2,
        currentEpoch: 13,
        previousValidUntilEpoch: 15,
        targetValidUntilEpoch: 20,
        walletAuthority: "connected_wallet_only",
      },
      disclosure: {
        network: "testnet",
        paymentAsset: "WAL",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
      },
    });
    expect(JSON.stringify(prepared.payload)).not.toContain(String(signupA.payload.user.id));

    const mutated = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: "0".repeat(64),
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(mutated.response.status).toBe(409);
    expect(mutated.payload.code).toBe("crypto_evidence_walrus_renewal_intent_mismatch");

    server.setWalrusValidUntilEpoch(20);
    const confirmed = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload).toMatchObject({
      item: {
        revision: 3,
        publication: {
          validUntilEpoch: 20,
          renewalTransactionDigest: prepared.payload.preview.transactionDigest,
        },
        lastVerification: { status: "verified", currentEpoch: 13 },
      },
      verification: { status: "verified", currentEpoch: 13 },
    });

    const replay = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/renew/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(replay.response.status).toBe(410);
    expect(replay.payload.code).toBe("crypto_evidence_walrus_renewal_expired_or_replayed");
  });

  test("deletes published Walrus evidence only through one exact connected-wallet transaction", async () => {
    const server = await boot("internal", { agentFiles: true, walrus: true });
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-delete-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "evidence-delete-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const coworker = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    if (!server.keyManager) throw new Error("route_test_key_manager_missing");
    const ownerId = String(signupA.payload.user.id);
    const coworkerId = String(coworker.payload.coworker.id);
    const runId = "run_route_deletion_evidence";
    const record = await seedCryptoEvidence({
      guardedDb: server.guardedDb,
      keyManager: server.keyManager,
      workspaceId: workspaceA,
      ownerId,
      coworkerId,
      runId,
    });
    const published = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/publish`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          network: "testnet",
          ownerAddress: ROUTE_SIGNER,
          acknowledgePublicCiphertext: true,
        },
      },
    );
    expect(published.response.status).toBe(200);
    const list = await request(server.base, `/workspace/${workspaceA}/crypto-evidence`, { cookie: cookieA });
    expect(list.payload).toMatchObject({ deletionAvailable: true });

    const missingConfirmation = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete`,
      {
        cookie: cookieA,
        body: { expectedRevision: 2, network: "testnet", signer: "0x1" },
      },
    );
    expect(missingConfirmation.response.status).toBe(400);
    expect(missingConfirmation.payload.code).toBe("crypto_evidence_walrus_deletion_confirmation_required");
    expect(server.keyManager.keys.size).toBe(1);

    const crossTenant = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete`,
      {
        cookie: cookieB,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: "0x1",
          confirm: `delete-walrus-copy:${record.id}`,
        },
      },
    );
    expect(crossTenant.response.status).toBe(404);
    expect(server.keyManager.keys.size).toBe(1);

    const prepared = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete`,
      {
        cookie: cookieA,
        body: {
          expectedRevision: 2,
          network: "testnet",
          signer: "0x1",
          confirm: `delete-walrus-copy:${record.id}`,
        },
      },
    );
    expect(prepared.response.status).toBe(200);
    expect(prepared.payload).toMatchObject({
      preview: {
        evidenceId: record.id,
        evidenceRevision: 2,
        network: "testnet",
        signer: normalizeSuiAddress("0x1"),
        blobId: "route-agent-file-blob",
        suiObjectId: "0x1234",
        walletAuthority: "connected_wallet_only",
      },
      disclosure: {
        network: "testnet",
        walletAction: "delete_walrus_blob",
        signingAndSubmission: "connected_wallet_only",
        agentAuthority: "none",
        recoveryKeyDestroyedAfterConfirmation: true,
        publicTransactionMayRemain: true,
      },
    });
    const preparedJson = JSON.stringify(prepared.payload);
    for (const privateValue of [workspaceA, ownerId, coworkerId, runId]) {
      expect(preparedJson).not.toContain(privateValue);
    }
    expect(preparedJson).not.toContain('"ciphertext"');
    expect(preparedJson).not.toContain('"wrappedKey"');
    expect(preparedJson).not.toContain('"keyReference"');

    const mutated = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: "0".repeat(64),
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(mutated.response.status).toBe(409);
    expect(mutated.payload.code).toBe("crypto_evidence_walrus_deletion_intent_mismatch");
    expect(server.keyManager.keys.size).toBe(1);

    const confirmed = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload).toMatchObject({
      item: {
        evidenceId: record.id,
        revision: 3,
        state: "key_destroyed",
        retention: { keyAvailable: false },
        publication: {
          blobId: "route-agent-file-blob",
          suiObjectId: "0x1234",
          deletionTransactionDigest: prepared.payload.preview.transactionDigest,
        },
        lastVerification: {
          status: "deleted",
          reason: "wallet_walrus_deletion_verified",
        },
      },
      verification: {
        status: "deleted",
        reason: "wallet_walrus_deletion_verified",
      },
      deletion: {
        walrusDeletionConfirmed: true,
        recoveryKeyDestroyed: true,
        contentRecoverable: false,
        publicTransactionMayRemain: true,
      },
    });
    expect(server.keyManager.keys.size).toBe(0);

    const replay = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/delete/confirm`,
      {
        cookie: cookieA,
        body: {
          intentId: prepared.payload.preview.intentId,
          intentHash: prepared.payload.preview.intentHash,
          transactionDigest: prepared.payload.preview.transactionDigest,
        },
      },
    );
    expect(replay.response.status).toBe(410);
    expect(replay.payload.code).toBe("crypto_evidence_walrus_deletion_expired_or_replayed");

    const verified = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/${record.id}/verify`,
      { cookie: cookieA, method: "POST" },
    );
    expect(verified.response.status).toBe(200);
    expect(verified.payload.verification).toMatchObject({
      status: "deleted",
      reason: "wallet_walrus_deletion_verified",
    });
  });

  test("creates, isolates, revisions, pauses and deletes account-owned coworkers", async () => {
    const server = await boot("internal");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-b@example.com", password: PASSWORD },
    });
    expect(signupA.response.status).toBe(200);
    expect(signupB.response.status).toBe(200);
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspacesA = await request(server.base, "/workspaces", { cookie: cookieA });
    const workspacesB = await request(server.base, "/workspaces", { cookie: cookieB });
    const workspaceA = String(workspacesA.payload.items[0].id);
    const workspaceB = String(workspacesB.payload.items[0].id);

    const ownEvidence = await request(server.base, `/workspace/${workspaceA}/crypto-evidence`, { cookie: cookieA });
    expect(ownEvidence.response.status).toBe(200);
    expect(ownEvidence.payload).toEqual({
      mode: "off",
      available: false,
      publicationAvailable: false,
      renewalAvailable: false,
      deletionAvailable: false,
      anchorAvailable: false,
      anchorPackageStatus: "disabled",
      items: [],
    });
    expect((await request(server.base, `/workspace/${workspaceA}/crypto-evidence`, { cookie: cookieB })).response.status)
      .toBe(404);
    const unavailableVerification = await request(
      server.base,
      `/workspace/${workspaceA}/crypto-evidence/evidence_valid_test_id/verify`,
      { method: "POST", cookie: cookieA },
    );
    expect(unavailableVerification.response.status).toBe(503);
    expect(unavailableVerification.payload.code).toBe("crypto_evidence_unavailable");

    const templates = await request(server.base, `/workspace/${workspaceA}/coworker-templates`, { cookie: cookieA });
    expect(templates.response.status).toBe(200);
    expect(templates.payload.templates.map((item: any) => item.id)).toEqual([
      "market_analyst",
      "risk_monitor",
      "transaction_coordinator",
      "treasury_coworker",
    ]);
    const fromTemplate = await request(server.base, `/workspace/${workspaceA}/coworkers/from-template`, {
      cookie: cookieA,
      body: { templateId: "risk_monitor", name: "My risk monitor" },
    });
    expect(fromTemplate.response.status).toBe(201);
    expect(fromTemplate.payload).toMatchObject({
      templateId: "risk_monitor",
      coworker: { name: "My risk monitor", state: "active", revision: 1 },
    });
    expect(fromTemplate.payload.coworker.automaticAuthorities).not.toContain("prepare");
    const transactionTemplate = await request(server.base, `/workspace/${workspaceA}/coworkers/from-template`, {
      cookie: cookieA,
      body: { templateId: "transaction_coordinator" },
    });
    expect(transactionTemplate.response.status).toBe(201);
    expect(transactionTemplate.payload).toMatchObject({
      templateId: "transaction_coordinator",
      coworker: {
        role: "transaction_coordinator",
        state: "active",
        escalation: { walletSubmission: "connected_wallet_only" },
      },
    });
    expect(transactionTemplate.payload.coworker.automaticAuthorities).toContain("prepare");
    expect(transactionTemplate.payload.coworker.allowedNetworks).toEqual([
      "sui:testnet",
      "hyperliquid:testnet",
      "bittensor:test",
    ]);

    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("cache-control")).toBe("no-store");
    expect(created.payload.mode).toBe("internal");
    expect(created.payload.coworker).toMatchObject({
      revision: 1,
      policyVersion: "coworker-policy-1",
      state: "active",
      escalation: { walletSubmission: "connected_wallet_only" },
    });
    expect(created.payload.coworker.ownerId).toBeUndefined();
    const coworkerId = String(created.payload.coworker.id);

    const storedResources = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 0,
          profileRevision: 1,
          agentFileIds: [],
          memoryIds: [],
          connectionIds: [],
        },
      },
    );
    expect(storedResources.response.status).toBe(200);
    expect(storedResources.response.headers.get("cache-control")).toBe("no-store");
    expect(storedResources.payload).toMatchObject({
      active: true,
      resources: {
        revision: 1,
        profileRevision: 1,
        privacy: { mode: "private_workspace", unverifiedProviderConsent: false },
      },
    });
    expect(storedResources.payload.resources.ownerId).toBeUndefined();
    expect((await request(
      server.base,
      `/workspace/${workspaceB}/coworkers/${coworkerId}/resources`,
      { cookie: cookieB },
    )).response.status).toBe(404);
    const injectedResources = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          profileRevision: 1,
          agentFileIds: [],
          memoryIds: [],
          connectionIds: [],
          ownerId: signupB.payload.user.id,
        },
      },
    );
    expect(injectedResources.response.status).toBe(400);
    expect(injectedResources.payload.code).toBe("coworker_resource_scope_invalid");

    const storedState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      method: "PUT",
      cookie: cookieA,
      body: workingStateInput(),
    });
    expect(storedState.response.status).toBe(200);
    expect(storedState.payload.state).toMatchObject({ revision: 1, profileRevision: 1 });
    expect(storedState.payload.state.ownerId).toBeUndefined();
    const ownState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      cookie: cookieA,
    });
    expect(ownState.payload.state.unresolvedRisks[0].id).toBe("risk_refresh");
    const isolatedState = await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/state`, {
      cookie: cookieB,
    });
    expect(isolatedState.response.status).toBe(404);
    const secretState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      method: "PUT",
      cookie: cookieA,
      body: {
        ...workingStateInput(),
        expectedRevision: 1,
        unresolvedRisks: [{
          ...workingStateInput().unresolvedRisks[0],
          summary: "Remember this private key for later.",
        }],
      },
    });
    expect(secretState.response.status).toBe(400);
    expect(secretState.payload.code).toBe("coworker_working_state_invalid");

    const blockedExecution = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_coworker/messages/preflight`,
      {
        cookie: cookieA,
        body: {
          coworkerId,
          parts: [{ type: "text", text: "Read approved Sui state" }],
          executionMode: "work",
        },
      },
    );
    expect(blockedExecution.response.status).toBe(503);
    expect(blockedExecution.payload.code).toBe("coworker_execution_not_ready");

    const ownList = await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA });
    const otherList = await request(server.base, `/workspace/${workspaceB}/coworkers`, { cookie: cookieB });
    expect(ownList.payload.coworkers).toHaveLength(3);
    expect(ownList.payload.coworkers.map((item: any) => item.id)).toEqual(expect.arrayContaining([
      fromTemplate.payload.coworker.id,
      transactionTemplate.payload.coworker.id,
      coworkerId,
    ]));
    expect(otherList.payload.coworkers).toEqual([]);
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieB })).response.status).toBe(404);
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}`, { cookie: cookieB })).response.status).toBe(404);

    const injected = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: { ...coworkerInput(), ownerId: signupB.payload.user.id },
    });
    expect(injected.response.status).toBe(400);
    expect(injected.payload.code).toBe("coworker_input_invalid");

    const updated = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 1, mission: "Compare Sui evidence and retain cited decisions." },
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.coworker.revision).toBe(2);
    const staleResources = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      { cookie: cookieA },
    );
    expect(staleResources.payload).toMatchObject({
      active: false,
      resources: { revision: 1, profileRevision: 1 },
    });
    const reboundResources = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/resources`,
      {
        method: "PUT",
        cookie: cookieA,
        body: {
          expectedRevision: 1,
          profileRevision: 2,
          agentFileIds: [],
          memoryIds: [],
          connectionIds: [],
        },
      },
    );
    expect(reboundResources.payload).toMatchObject({
      active: true,
      resources: { revision: 2, profileRevision: 2 },
    });
    const reboundState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      cookie: cookieA,
    });
    expect(reboundState.payload.state).toMatchObject({ revision: 2, profileRevision: 2, pendingActions: [] });
    const stale = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 1, name: "Stale update" },
    });
    expect(stale.response.status).toBe(409);
    expect(stale.payload.code).toBe("coworker_revision_conflict");

    const paused = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 2, state: "paused" },
    });
    expect(paused.payload.coworker).toMatchObject({ state: "paused", revision: 3 });
    const deleted = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 3 },
    });
    expect(deleted.payload).toEqual({ deleted: true });
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, { cookie: cookieA })).response.status).toBe(404);
  });

  test("exposes bounded watches and a tenant-scoped alert inbox without an account alert-injection route", async () => {
    const server = await boot("internal");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "watch-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "watch-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const workspaceB = String((await request(server.base, "/workspaces", { cookie: cookieB })).payload.items[0].id);
    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: watchCoworkerInput(),
    });
    expect(created.response.status).toBe(201);
    const coworkerId = String(created.payload.coworker.id);
    const resourceStore = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      const resourceCoworkers = new MatterhornCoworkers({
        store: resourceStore,
        policyVersion: "coworker-policy-1",
      });
      resourceCoworkers.setResourceScope(
        workspaceA,
        String(signupA.payload.user.id),
        coworkerId,
        {
          expectedRevision: 0,
          profileRevision: 1,
          agentFiles: [],
          memories: [],
          connections: [{
            id: "cxc_sui_route",
            appId: "matterhorn.sui-testnet",
            manifestRevision: "1.0.0",
            actionIds: ["sui_account_read"],
            networks: ["sui:testnet"],
          }],
        },
      );
    } finally {
      resourceStore.close();
    }

    const createdWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: watchInput(),
    });
    expect(createdWatch.response.status).toBe(201);
    expect(createdWatch.payload.watch).toMatchObject({
      state: "active",
      profileRevision: 1,
      connectionBinding: { connectionId: "cxc_sui_route", manifestRevision: "1.0.0" },
    });
    expect(createdWatch.payload.watch.ownerId).toBeUndefined();
    const watchId = String(createdWatch.payload.watch.id);
    const watchList = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, { cookie: cookieA });
    expect(watchList.payload.watches).toHaveLength(1);
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/watches`, { cookie: cookieB })).response.status)
      .toBe(404);
    const overLimit = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: { ...watchInput(), name: "Second watch" },
    });
    expect(overLimit.response.status).toBe(409);
    expect(overLimit.payload.code).toBe("coworker_watch_limit");
    const secretWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: { ...watchInput(), parameters: { privateKey: "secret material" } },
    });
    expect(secretWatch.response.status).toBe(400);
    expect(secretWatch.payload.code).toBe("coworker_watch_invalid");

    const directStore = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      const directCoworkers = new MatterhornCoworkers({
        store: directStore,
        policyVersion: "coworker-policy-1",
        now: () => new Date("2026-09-01T12:05:00.000Z"),
        inboxItemId: () => "cinbox_route_alert",
      });
      directCoworkers.createInboxItem(workspaceA, String(signupA.payload.user.id), coworkerId, {
        watchId,
        kind: "alert",
        severity: "medium",
        title: "Sui balance changed",
        summary: "The observed Sui balance changed since the previous approved check.",
        reasonCodes: ["balance_changed"],
        source: {
          appId: "matterhorn.sui-testnet",
          actionId: "sui_account_read",
          evidenceReferenceHash: "c".repeat(64),
          freshness: "fresh",
          observedAt: "2026-09-01T12:05:00.000Z",
        },
        budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 1_000 },
        nextSafeAction: { kind: "review", label: "Review the fresh balance evidence" },
      });
    } finally {
      directStore.close();
    }
    const inbox = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox`, { cookie: cookieA });
    expect(inbox.response.status).toBe(200);
    expect(inbox.payload.items).toHaveLength(1);
    expect(inbox.payload.items[0]).toMatchObject({ id: "cinbox_route_alert", state: "unread", watchId });
    expect(inbox.payload.items[0].ownerId).toBeUndefined();
    const unreadSummary = await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA });
    expect(unreadSummary.payload.inbox).toEqual({
      totalUnread: 1,
      byCoworker: [{
        coworkerId,
        unreadCount: 1,
        latestUnreadAt: "2026-09-01T12:05:00.000Z",
      }],
    });
    expect(JSON.stringify(unreadSummary.payload.inbox)).not.toContain("Sui balance changed");
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers`, { cookie: cookieB })).payload.inbox)
      .toEqual({ totalUnread: 0, byCoworker: [] });
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/inbox`, { cookie: cookieB })).response.status)
      .toBe(404);
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox`, {
      method: "POST",
      cookie: cookieA,
      body: { title: "Injected alert" },
    })).response.status).toBe(404);

    const read = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox/cinbox_route_alert`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "read", expectedState: "unread" },
    });
    expect(read.response.status).toBe(200);
    expect(read.payload.item.state).toBe("read");
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA })).payload.inbox)
      .toEqual({ totalUnread: 0, byCoworker: [] });
    const staleInbox = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox/cinbox_route_alert`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "dismissed", expectedState: "unread" },
    });
    expect(staleInbox.response.status).toBe(409);
    expect(staleInbox.payload.code).toBe("coworker_inbox_state_conflict");

    const paused = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches/${watchId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "paused", expectedRevision: 1 },
    });
    expect(paused.payload.watch).toMatchObject({ state: "paused", pauseReason: "user_paused", revision: 2 });
    const deletedWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches/${watchId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 2 },
    });
    expect(deletedWatch.payload).toEqual({ deleted: true });
  });

  test("exposes tenant-scoped wallet review and reconciles public metadata without submission authority", async () => {
    const server = await boot("internal");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "wallet-review-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "wallet-review-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const workspaceB = String((await request(server.base, "/workspaces", { cookie: cookieB })).payload.items[0].id);
    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: transactionCoworkerInput(),
    });
    expect(created.response.status).toBe(201);
    const coworkerId = String(created.payload.coworker.id);
    const pending = await seedPendingSuiIntent({
      guardedDb: server.guardedDb,
      workspaceId: workspaceA,
      ownerId: String(signupA.payload.user.id),
      coworkerId,
      runId: "run_route_receipt",
    });

    const list = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents`,
      { cookie: cookieA },
    );
    expect(list.response.status).toBe(200);
    expect(list.response.headers.get("cache-control")).toBe("no-store");
    expect(list.payload.items).toHaveLength(1);
    expect(list.payload.items[0]).toMatchObject({
      id: pending.id,
      state: "wallet_review",
      policy: { decision: "wallet_review_required" },
    });
    expect(list.payload.items[0].ownerId).toBeUndefined();
    expect(list.payload.items[0].policyDecision).toBeUndefined();
    expect((await request(
      server.base,
      `/workspace/${workspaceB}/coworkers/${coworkerId}/wallet-intents`,
      { cookie: cookieB },
    )).response.status).toBe(404);

    const digest = "3".repeat(44);
    const receiptBody = {
      expectedRevision: 1,
      status: "submitted",
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: pending.intent.network,
      signer: pending.intent.signer,
      operation: pending.intent.operation,
      authorizedArgumentsHash: pending.intent.authorizedArgumentsHash,
    };
    const rejectedSecret = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${pending.id}/receipt`,
      {
        cookie: cookieA,
        body: { ...receiptBody, publicId: "Use this private key: fake-secret-12345" },
      },
    );
    expect(rejectedSecret.response.status).toBe(400);
    expect(rejectedSecret.payload.code).toBe("pending_crypto_receipt_secret_rejected");

    const crossAccountReceipt = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${pending.id}/receipt`,
      { cookie: cookieB, body: receiptBody },
    );
    expect(crossAccountReceipt.response.status).toBe(404);

    const reconciled = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${pending.id}/receipt`,
      { cookie: cookieA, body: receiptBody },
    );
    expect(reconciled.response.status).toBe(200);
    expect(reconciled.payload.item).toMatchObject({
      id: pending.id,
      revision: 2,
      state: "submitted",
      receipt: {
        publicId: digest,
        transactionHash: digest,
        verification: {
          kind: "wallet_reported_public_metadata",
          chainVerified: false,
        },
      },
    });
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${pending.id}/receipt`,
      { cookie: cookieA, body: receiptBody },
    )).response.status).toBe(200);
    const runReceipt = await request(
      server.base,
      `/workspace/${workspaceA}/agent-run-receipts/${pending.intent.runId}`,
      { cookie: cookieA },
    );
    expect(runReceipt.payload.item.reviewedActions).toContainEqual(expect.objectContaining({
      intentHash: pending.reviewedAction.intentHash,
      publicReceipt: digest,
    }));

    const cancellable = await seedPendingSuiIntent({
      guardedDb: server.guardedDb,
      workspaceId: workspaceA,
      ownerId: String(signupA.payload.user.id),
      coworkerId,
      runId: "run_route_cancel",
    });
    expect((await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${cancellable.id}/cancel`,
      { cookie: cookieB, body: { expectedRevision: 1 } },
    )).response.status).toBe(404);
    const cancelled = await request(
      server.base,
      `/workspace/${workspaceA}/coworkers/${coworkerId}/wallet-intents/${cancellable.id}/cancel`,
      { cookie: cookieA, body: { expectedRevision: 1 } },
    );
    expect(cancelled.response.status).toBe(200);
    expect(cancelled.payload.item).toMatchObject({ state: "cancelled", revision: 2 });
  });

  test("purges durable coworkers before completing account deletion", async () => {
    const server = await boot("internal");
    const email = "coworker-delete@example.com";
    const signup = await request(server.base, "/api/auth/sign-up/email", {
      body: { email, password: PASSWORD },
    });
    expect(signup.response.status).toBe(200);
    const sessionCookie = cookie(signup.response);
    const workspaces = await request(server.base, "/workspaces", { cookie: sessionCookie });
    const workspaceId = String(workspaces.payload.items[0].id);
    expect((await request(server.base, `/workspace/${workspaceId}/coworkers`, {
      cookie: sessionCookie,
      body: coworkerInput(),
    })).response.status).toBe(201);

    const deleted = await request(server.base, "/api/auth/account", {
      method: "DELETE",
      cookie: sessionCookie,
      body: { confirmationEmail: email, password: PASSWORD },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.status).toBe("deleted");

    const store = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      expect(store.purgeWorkspace(workspaceId)).toBe(0);
    } finally {
      store.close();
    }
  });
});
