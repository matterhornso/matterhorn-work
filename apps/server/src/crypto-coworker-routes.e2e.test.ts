import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type {
  MatterhornAgentPrivacyPreflightResponse,
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
import type {
  MatterhornWalrusCertification,
  MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import type { ServerConfig } from "./types.js";

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

const TOKEN = "owt_coworker_route_token";
const HOST_TOKEN = "owt_coworker_route_host_token";
const PASSWORD = "matterhorn-coworker-test-password";
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
  "MATTERHORN_GUARDED_RUNTIME_DB",
  "MATTERHORN_AGENT_FILES_MODE",
  "MATTERHORN_EVIDENCE_KMS_REGION",
  "MATTERHORN_EVIDENCE_KMS_KEY_ID",
  "MATTERHORN_WALRUS_EVIDENCE_MODE",
  "MATTERHORN_WALRUS_PUBLISHER_URL",
  "MATTERHORN_WALRUS_AGGREGATOR_URL",
  "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
  "MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT",
] as const;
const priorEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

function config(port: number, root: string): ServerConfig {
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
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
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

  async publish(input: { bytes: Uint8Array }): Promise<{
    blobId: string;
    suiObjectId: string;
    declaredEndEpoch: number;
  }> {
    this.publishCalls += 1;
    this.publishedBytes = Buffer.from(input.bytes);
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
    suiTransactionDigest: "route-agent-file-testnet-transaction",
  };
}

async function boot(
  mode: "off" | "internal",
  options: { agentFiles?: boolean; walrus?: boolean } = {},
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
  process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = "off";
  process.env.MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT = "1";
  if (options.agentFiles) {
    process.env.MATTERHORN_AGENT_FILES_MODE = "encrypted";
    process.env.MATTERHORN_EVIDENCE_KMS_REGION = "us-east-1";
    process.env.MATTERHORN_EVIDENCE_KMS_KEY_ID = "alias/route-test-agent-files";
  } else {
    delete process.env.MATTERHORN_AGENT_FILES_MODE;
    delete process.env.MATTERHORN_EVIDENCE_KMS_REGION;
    delete process.env.MATTERHORN_EVIDENCE_KMS_KEY_ID;
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
  const keyManager = options.agentFiles ? new RouteTestKeyManager() : null;
  const walrusTransport = options.walrus ? new RouteTestWalrusTransport() : null;
  let walrusCurrentEpoch = 11;
  const dependencies: MatterhornServerDependencies = {};
  if (keyManager) dependencies.evidenceKeyManager = keyManager;
  if (walrusTransport) {
    dependencies.agentFileWalrusTransport = walrusTransport;
    dependencies.agentFileWalrusCertificationVerifier = async () => ({
      ...routeTestCertification(),
      currentEpoch: walrusCurrentEpoch,
    });
  }
  const server = await startServer(
    config(await freePort(), root),
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
    stop,
  };
}

async function request(base: string, path: string, options: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  cookie?: string;
  bearer?: string;
} = {}) {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
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

function watchInput() {
  return {
    profileRevision: 1,
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
      body: coworkerInput(),
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

    const fileId = String(created.payload.item.id);
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
      body: coworkerInput(),
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
      body: coworkerInput(),
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
    const evidence = await request(server.base, "/workspace/ws_coworker/crypto-evidence", { bearer: TOKEN });
    expect(evidence.response.status).toBe(200);
    expect(evidence.payload).toEqual({ mode: "off", available: false, items: [] });
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
    expect(ownEvidence.payload).toEqual({ mode: "off", available: false, items: [] });
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

    const createdWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: watchInput(),
    });
    expect(createdWatch.response.status).toBe(201);
    expect(createdWatch.payload.watch).toMatchObject({ state: "active", profileRevision: 1 });
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
