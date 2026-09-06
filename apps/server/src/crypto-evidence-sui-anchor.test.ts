import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bcs } from "@mysten/sui/bcs";
import type { SuiClientTypes } from "@mysten/sui/client";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddress, normalizeSuiObjectId } from "@mysten/sui/utils";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";
import { afterEach, describe, expect, test } from "bun:test";

import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import {
  createPinnedSuiEvidenceAnchorTransactionVerifier,
  MatterhornCryptoEvidenceSuiAnchorService,
  type MatterhornSuiEvidenceAnchorProjection,
  type MatterhornSuiEvidenceAnchorTransactionBuilder,
  type MatterhornSuiEvidenceAnchorTransactionVerifier,
} from "./crypto-evidence-sui-anchor.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import type { MatterhornWalrusCertification } from "./crypto-evidence-walrus-publisher.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const roots: string[] = [];
const ENDPOINT = new URL("https://fullnode.testnet.sui.io:443");
const PEER = "8.8.8.8";
const DIGEST = "3".repeat(44);
const SIGNER = normalizeSuiAddress("0x1");
const PACKAGE = normalizeSuiObjectId("0x2");
const WALRUS_OBJECT = normalizeSuiObjectId("0x3");
const ANCHOR_OBJECT = normalizeSuiObjectId("0x4");
const ROOT = "a".repeat(64);
const BATCH = "b".repeat(64);

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});
function pure(schema: { serialize(value: unknown): { toBytes(): Uint8Array } }, value: unknown) {
  return {
    $kind: "Pure",
    Pure: { bytes: Buffer.from(schema.serialize(value).toBytes()).toString("base64") },
  };
}

function createdAnchor(overrides: Partial<SuiClientTypes.ChangedObject> = {}): SuiClientTypes.ChangedObject {
  return {
    objectId: ANCHOR_OBJECT,
    inputState: "DoesNotExist",
    inputVersion: null,
    inputDigest: null,
    inputOwner: null,
    outputState: "ObjectWrite",
    outputVersion: "1",
    outputDigest: "4".repeat(44),
    outputOwner: { $kind: "Immutable", Immutable: true },
    idOperation: "Created",
    ...overrides,
  };
}

function projection(overrides: Partial<MatterhornSuiEvidenceAnchorProjection> = {}): MatterhornSuiEvidenceAnchorProjection {
  return {
    digest: DIGEST,
    success: true,
    sender: SIGNER,
    gasOwner: SIGNER,
    inputs: [
      pure(bcs.vector(bcs.U8), Buffer.from(BATCH, "hex")),
      pure(bcs.vector(bcs.U8), Buffer.from(ROOT, "hex")),
      pure(bcs.Address, WALRUS_OBJECT),
      pure(bcs.U64, 10n),
      pure(bcs.U64, 15n),
    ],
    commands: [{
      $kind: "MoveCall",
      MoveCall: {
        package: PACKAGE,
        module: "evidence_anchor",
        function: "anchor",
        typeArguments: [],
        arguments: Array.from({ length: 5 }, (_, index) => ({ $kind: "Input", Input: index })),
      },
    }],
    changedObjects: [createdAnchor()],
    objectTypes: { [ANCHOR_OBJECT]: `${PACKAGE}::evidence_anchor::EvidenceAnchor` },
    epoch: "12",
    ...overrides,
  };
}

function verifier(value: MatterhornSuiEvidenceAnchorProjection = projection()) {
  const calls: unknown[] = [];
  const verify = createPinnedSuiEvidenceAnchorTransactionVerifier({
    endpoint: ENDPOINT,
    resolver: async () => [{ address: PEER, family: 4 }],
    now: () => new Date("2026-09-03T00:00:00.000Z"),
    createClient: (input) => ({
      async getTransaction(request) {
        calls.push({ input, request });
        return structuredClone(value);
      },
    }),
  });
  return { calls, verify };
}

function verifyRequest(overrides: Record<string, unknown> = {}) {
  return {
    network: "sui:testnet" as const,
    digest: DIGEST,
    signer: SIGNER,
    packageId: PACKAGE,
    batchId: BATCH,
    merkleRoot: ROOT,
    walrusObjectId: WALRUS_OBJECT,
    certifiedEpoch: 10,
    validUntilEpoch: 15,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("pinned Sui evidence anchor verifier", () => {
  test("accepts exactly one immutable anchor object from the exact reviewed call", async () => {
    const fixture = verifier();
    await expect(fixture.verify(verifyRequest())).resolves.toEqual({
      objectId: ANCHOR_OBJECT,
      observedAt: "2026-09-03T00:00:00.000Z",
    });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]).toMatchObject({
      input: { endpoint: ENDPOINT, approvedAddresses: [PEER] },
      request: { digest: DIGEST },
    });
  });

  test("rejects sender, gas owner, package, argument, hidden command, type, and ownership mutation", async () => {
    const cases: Array<[MatterhornSuiEvidenceAnchorProjection, string]> = [
      [projection({ sender: normalizeSuiAddress("0x9") }), "crypto_evidence_sui_anchor_signer_mismatch"],
      [projection({ gasOwner: null }), "crypto_evidence_sui_anchor_signer_mismatch"],
      [projection({ commands: [{ ...projection().commands[0], MoveCall: {
        ...(projection().commands[0]!.MoveCall as object), package: normalizeSuiObjectId("0x9"),
      } }] }), "crypto_evidence_sui_anchor_commands_mismatch"],
      [projection({ inputs: [
        pure(bcs.vector(bcs.U8), Buffer.from("c".repeat(64), "hex")),
        ...projection().inputs.slice(1),
      ] }), "crypto_evidence_sui_anchor_inputs_mismatch"],
      [projection({ commands: [...projection().commands, {
        $kind: "MoveCall",
        MoveCall: { package: PACKAGE, module: "evil", function: "submit", typeArguments: [], arguments: [] },
      }] }), "crypto_evidence_sui_anchor_commands_mismatch"],
      [projection({ objectTypes: { [ANCHOR_OBJECT]: `${PACKAGE}::evidence_anchor::Other` } }), "crypto_evidence_sui_anchor_created_object_mismatch"],
      [projection({ changedObjects: [createdAnchor({ outputOwner: { $kind: "AddressOwner", AddressOwner: SIGNER } })] }), "crypto_evidence_sui_anchor_created_object_mismatch"],
      [projection({ changedObjects: [createdAnchor(), createdAnchor({ objectId: normalizeSuiObjectId("0x5") })] }), "crypto_evidence_sui_anchor_created_object_mismatch"],
    ];
    for (const [candidate, code] of cases) {
      await expect(verifier(candidate).verify(verifyRequest())).rejects.toThrow(code);
    }
  });

  test("fails before lookup for malformed digests, endpoints, networks, and aborts", async () => {
    const fixture = verifier();
    await expect(fixture.verify(verifyRequest({ digest: "bad" })))
      .rejects.toThrow("crypto_evidence_sui_anchor_transaction_invalid");
    await expect(fixture.verify(verifyRequest({ network: "sui:mainnet" })))
      .rejects.toThrow("crypto_evidence_sui_anchor_mainnet_disabled");
    const controller = new AbortController();
    controller.abort();
    await expect(fixture.verify(verifyRequest({ signal: controller.signal })))
      .rejects.toThrow("crypto_evidence_sui_anchor_aborted");
    expect(fixture.calls).toHaveLength(0);
    expect(() => createPinnedSuiEvidenceAnchorTransactionVerifier({
      endpoint: new URL("https://user:pass@example.com"),
    })).toThrow("crypto_evidence_sui_anchor_endpoint_invalid");
  });
});

function receipt(): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "receipt_anchor",
    runId: "run_anchor",
    workspaceId: "workspace_alpha",
    sessionId: "session_anchor",
    status: "success",
    startedAt: "2026-09-02T22:00:00.000Z",
    completedAt: "2026-09-02T22:00:01.000Z",
    responseDurationMs: 1_000,
    provider: { id: "local", name: "Local", modelId: "model", privacyStatus: "local_processing", trainingUse: "none", retentionDays: 0, policyUrl: null },
    privacy: { mode: "public_research", dataCategories: ["public"], redactionCount: 0, consent: "not_required", dataLeavesMatterhorn: false },
    usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0, toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 } },
    tools: [],
    memory: { readIds: [], writtenIds: [] },
    capabilities: [],
    reviewedActions: [],
    integrity: { previousHash: null, recordHash: "record" },
  };
}

async function builtTransaction() {
  const transaction = new Transaction();
  transaction.setSender(SIGNER);
  transaction.setGasOwner(SIGNER);
  transaction.setGasPrice(1);
  transaction.setGasBudget(1);
  transaction.setGasPayment([]);
  transaction.setExpiration({ Epoch: 20 });
  const bytes = await transaction.build();
  return {
    transactionBytesBase64: Buffer.from(bytes).toString("base64"),
    transactionDigest: TransactionDataBuilder.getDigestFromBytes(bytes),
    simulationReference: sha256({ test: "sui-anchor-simulation" }),
    simulatedAt: "2026-09-03T00:00:00.000Z",
  };
}

async function serviceFixture(input: {
  onBuild?: () => void | Promise<void>;
  onVerify?: () => void | Promise<void>;
  now?: () => Date;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-evidence-anchor-"));
  roots.push(root);
  const statePath = join(root, "state.db");
  const state = new MatterhornGuardedRuntimeStateStore(statePath);
  const key = Buffer.alloc(32, 7);
  const keyManager: MatterhornEvidenceKeyManager = {
    createDataKey: async ({ recipientKeyIds }) => ({
      plaintextKey: Buffer.from(key),
      keyReference: "kms:test:evidence-anchor",
      wrappedKey: Buffer.from("wrapped-evidence-anchor").toString("base64"),
      keyContext: "a".repeat(64),
      recipientKeyIds,
    }),
    decryptDataKey: async () => Buffer.from(key),
    destroyKey: async () => undefined,
  };
  const sealed = await sealMatterhornRunEvidence({
    receipt: receipt(),
    coworkerId: "coworker_alpha",
    recipientKeyIds: ["recipient_alpha"],
    keyManager,
    now: new Date("2026-09-02T23:00:00.000Z"),
    correlationSalt: Buffer.alloc(32, 8),
    idEntropy: Buffer.alloc(24, 9),
  });
  const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
  const created = store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    runId: "run_anchor",
    coworkerId: "coworker_alpha",
    sealed,
    now: new Date("2026-09-02T23:00:00.000Z"),
  });
  const publication = store.beginWalrusPublication({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    coworkerId: "coworker_alpha",
    evidenceId: created.id,
    expectedRevision: created.revision,
    now: new Date("2026-09-02T23:01:00.000Z"),
  });
  const published = store.attachVerifiedWalrusProof({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    coworkerId: "coworker_alpha",
    evidenceId: created.id,
    expectedRevision: created.revision,
    claimId: publication.claimId,
    proof: {
      version: "matterhorn.walrus-proof.v1",
      network: "testnet",
      blobId: "test-blob-id",
      suiObjectId: WALRUS_OBJECT,
      certifiedEpoch: 10,
      validUntilEpoch: 15,
      quiltPatchId: null,
      merkleRoot: created.index.merkleLeaf,
      merkleProof: [],
      suiTransactionDigest: null,
    },
    now: new Date("2026-09-02T23:01:00.000Z"),
  });
  const built = await builtTransaction();
  const buildCalls: unknown[] = [];
  const verifyCalls: unknown[] = [];
  const build: MatterhornSuiEvidenceAnchorTransactionBuilder = async (request) => {
    buildCalls.push(structuredClone({ ...request, signal: undefined }));
    await input.onBuild?.();
    return built;
  };
  const verify: MatterhornSuiEvidenceAnchorTransactionVerifier = async (request) => {
    verifyCalls.push(structuredClone({ ...request, signal: undefined }));
    await input.onVerify?.();
    return { objectId: ANCHOR_OBJECT, observedAt: "2026-09-03T00:01:00.000Z" };
  };
  const certification = async (): Promise<MatterhornWalrusCertification> => ({
    network: "testnet",
    blobId: "test-blob-id",
    suiObjectId: WALRUS_OBJECT,
    certifiedEpoch: 10,
    currentEpoch: 12,
    validUntilEpoch: 15,
    deletable: true,
    suiTransactionDigest: null,
  });
  const service = new MatterhornCryptoEvidenceSuiAnchorService(
    store, state, testDurableStateAuthority(), PACKAGE, build, verify, certification, input.now,
  );
  return {
    state,
    statePath,
    keyManager,
    store,
    service,
    published,
    built,
    build,
    verify,
    certification,
    buildCalls,
    verifyCalls,
  };
}

describe("Sui evidence anchor wallet airlock", () => {
  test("rejects a restored anchor intent with changed expiry before chain verification", async () => {
    const fixture = await serviceFixture();
    try {
      const prepared = await fixture.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
        expectedRevision: fixture.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-03T00:00:00.000Z"),
      });
      const row = fixture.state.getRecord<unknown>(
        "crypto_evidence_sui_anchor_intent",
        fixture.published.id,
        new Date("2026-09-03T00:01:00.000Z").getTime(),
      )!;
      fixture.state.put({
        kind: row.kind,
        key: row.key,
        workspaceId: row.workspaceId,
        sessionId: row.sessionId,
        value: row.value,
        expiresAtMs: (row.expiresAtMs ?? 0) + 60_000,
        nowMs: row.updatedAtMs,
      });
      await expect(fixture.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-03T00:01:00.000Z"),
      })).rejects.toThrow("crypto_evidence_sui_anchor_intent_integrity_invalid");
      expect(fixture.verifyCalls).toHaveLength(0);
    } finally {
      fixture.state.close();
    }
  });

  test("serializes anchor preparation across SQLite connections and protects replacement claims", async () => {
    let releaseBuild!: () => void;
    let buildStarted!: () => void;
    const buildGate = new Promise<void>((resolve) => { releaseBuild = resolve; });
    const started = new Promise<void>((resolve) => { buildStarted = resolve; });
    const fixture = await serviceFixture({
      onBuild: async () => {
        buildStarted();
        await buildGate;
      },
    });
    const secondState = new MatterhornGuardedRuntimeStateStore(fixture.statePath);
    try {
      const secondStore = new MatterhornCryptoEvidenceStore(secondState, fixture.keyManager, {}, null, testDurableStateAuthority());
      const secondService = new MatterhornCryptoEvidenceSuiAnchorService(
        secondStore,
        secondState,
        testDurableStateAuthority(),
        PACKAGE,
        fixture.build,
        fixture.verify,
        fixture.certification,
      );
      const request = {
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
        expectedRevision: fixture.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-03T00:00:00.000Z"),
      };
      const firstPrepare = fixture.service.prepare(request);
      await started;
      await expect(secondService.prepare(request)).rejects.toThrow(
        "crypto_evidence_operation_in_progress",
      );
      expect(() => secondStore.beginWalrusDeletion({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: request.now,
      })).toThrow("crypto_evidence_operation_in_progress");
      expect(fixture.buildCalls).toHaveLength(1);
      releaseBuild();
      const prepared = await firstPrepare;
      await expect(secondService.prepare(request)).resolves.toEqual(prepared);
      expect(fixture.buildCalls).toHaveLength(1);

      const firstClaim = fixture.store.beginSuiAnchor({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-03T00:06:00.000Z"),
      });
      const replacement = secondStore.beginSuiAnchor({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-03T00:12:00.000Z"),
      });
      expect(fixture.store.endSuiAnchor({
        workspaceId: request.workspaceId,
        evidenceId: request.evidenceId,
        claimId: firstClaim.claimId,
        now: new Date("2026-09-03T00:12:00.000Z"),
      })).toBe(false);
      expect(secondStore.hasSuiAnchorClaim({
        workspaceId: request.workspaceId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        claimId: replacement.claimId,
        now: new Date("2026-09-03T00:12:00.000Z"),
      })).toBe(true);
    } finally {
      releaseBuild?.();
      secondState.close();
      fixture.state.close();
    }
  });

  test("rejects a wallet confirmation that expires during public-chain verification", async () => {
    const verificationTimes = [
      new Date("2026-09-03T00:04:59.000Z"),
      new Date("2026-09-03T00:05:01.000Z"),
    ];
    const fixture = await serviceFixture({
      now: () => verificationTimes.shift() ?? new Date("2026-09-03T00:05:01.000Z"),
    });
    try {
      const prepared = await fixture.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
        expectedRevision: fixture.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-03T00:00:00.000Z"),
      });
      await expect(fixture.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
      })).rejects.toThrow("crypto_evidence_sui_anchor_expired_or_replayed");
      expect(fixture.verifyCalls).toHaveLength(1);
      expect(fixture.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: fixture.published.id,
      })?.suiAnchor).toBeNull();
    } finally {
      fixture.state.close();
    }
  });

  test("prepares, hash-binds, verifies, and atomically attaches one immutable anchor", async () => {
    const fixture = await serviceFixture();
    const prepared = await fixture.service.prepare({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      expectedRevision: fixture.published.revision,
      signer: SIGNER,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:00:00.000Z"),
    });
    expect(prepared.disclosure).toEqual({
      network: "testnet",
      walletAction: "create_immutable_evidence_anchor",
      signingAndSubmission: "connected_wallet_only",
      agentAuthority: "none",
      publicTransactionIsPermanent: true,
      publicContent: "non_identifying_hashes_only",
    });
    expect(prepared.preview).toMatchObject({
      evidenceId: fixture.published.id,
      evidenceRevision: fixture.published.revision,
      signer: SIGNER,
      packageId: PACKAGE,
      merkleRoot: fixture.published.walrusProof!.merkleRoot,
      walrusObjectId: WALRUS_OBJECT,
      transactionDigest: fixture.built.transactionDigest,
      walletAuthority: "connected_wallet_only",
    });
    expect(fixture.buildCalls).toHaveLength(1);

    const confirmed = await fixture.service.confirm({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      intentId: prepared.preview.intentId,
      intentHash: prepared.preview.intentHash,
      transactionDigest: prepared.preview.transactionDigest,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:01:00.000Z"),
    });
    expect(confirmed.anchor).toMatchObject({
      objectId: ANCHOR_OBJECT,
      transactionDigest: fixture.built.transactionDigest,
      merkleRoot: fixture.published.walrusProof!.merkleRoot,
      walrusObjectId: WALRUS_OBJECT,
    });
    expect(confirmed.item.anchor).toEqual(confirmed.anchor);
    expect(fixture.verifyCalls).toHaveLength(1);
    expect(fixture.store.get({ workspaceId: "workspace_alpha", ownerId: "owner_alpha", evidenceId: fixture.published.id })?.suiAnchor)
      .toEqual(confirmed.anchor);

    await expect(fixture.service.confirm({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      intentId: prepared.preview.intentId,
      intentHash: prepared.preview.intentHash,
      transactionDigest: prepared.preview.transactionDigest,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:01:01.000Z"),
    })).rejects.toThrow("crypto_evidence_sui_anchor_expired_or_replayed");
  });

  test("rejects cross-tenant access, mutation, duplicate anchors, and expired intent replay", async () => {
    const fixture = await serviceFixture();
    const prepared = await fixture.service.prepare({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      expectedRevision: fixture.published.revision,
      signer: SIGNER,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:00:00.000Z"),
    });
    await expect(fixture.service.prepare({
      workspaceId: "workspace_alpha",
      ownerId: "owner_beta",
      evidenceId: fixture.published.id,
      expectedRevision: fixture.published.revision,
      signer: SIGNER,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:00:01.000Z"),
    })).rejects.toThrow("crypto_evidence_not_found");
    await expect(fixture.service.confirm({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      intentId: prepared.preview.intentId,
      intentHash: "f".repeat(64),
      transactionDigest: prepared.preview.transactionDigest,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:01:00.000Z"),
    })).rejects.toThrow("crypto_evidence_sui_anchor_intent_mismatch");
    await expect(fixture.service.confirm({
      workspaceId: "workspace_alpha",
      ownerId: "owner_alpha",
      evidenceId: fixture.published.id,
      intentId: prepared.preview.intentId,
      intentHash: prepared.preview.intentHash,
      transactionDigest: prepared.preview.transactionDigest,
      signal: new AbortController().signal,
      now: new Date("2026-09-03T00:06:00.000Z"),
    })).rejects.toThrow("crypto_evidence_sui_anchor_expired_or_replayed");
  });
});
