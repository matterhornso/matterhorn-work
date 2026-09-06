import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import type { MatterhornCoworkerRunBinding } from "./agent-capability.js";
import { sealFinalizedCoworkerRunEvidence } from "./crypto-evidence-finalizer.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

function receipt(workspaceId = "workspace_finalizer"): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "receipt_finalizer",
    runId: "run_finalizer",
    workspaceId,
    sessionId: "session_finalizer",
    status: "success",
    startedAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:00:01.000Z",
    responseDurationMs: 1_000,
    provider: {
      id: "cudos",
      name: "CUDOS / ASI:Cloud",
      modelId: "asi1-mini",
      privacyStatus: "opt_in_training",
      trainingUse: "opt_in_only",
      retentionDays: null,
      policyUrl: null,
    },
    privacy: {
      mode: "public_research",
      dataCategories: ["public_market_data"],
      redactionCount: 0,
      consent: "not_required",
      dataLeavesMatterhorn: true,
    },
    usage: {
      inputTokens: 120,
      outputTokens: 45,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0.001,
      toolCallBudget: { reads: 4, preparesPerFamily: 0, submits: 0 },
    },
    tools: [],
    memory: { readIds: [], writtenIds: [] },
    capabilities: [],
    reviewedActions: [],
    integrity: { previousHash: null, recordHash: "receipt-hash" },
  };
}

function coworker(workspaceId = "workspace_finalizer"): MatterhornCoworkerRunBinding {
  return {
    id: "coworker_finalizer",
    workspaceId,
    ownerId: "owner_private_finalizer",
    revision: 1,
    policyVersion: "coworker-policy-1",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    automaticAuthorities: ["read"],
    actionBindings: [{
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
      proxyToolName: "matterhorn_sui_get_balance",
      access: "read",
    }],
    allowedDataLabels: ["public", "untrusted_external"],
    allowUnverifiedProviderConsent: false,
    maxReadCallsPerRun: 4,
    maxPrepareCallsPerFamily: 0,
  };
}

describe("finalized coworker evidence", () => {
  test("seals once, stays local, and exposes no raw tenant identity in encrypted publication bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-finalizer-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    const sourceKey = Buffer.alloc(32, 17);
    let keyLeases = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => {
        keyLeases += 1;
        return {
          plaintextKey: Buffer.from(sourceKey),
          keyReference: "kms://finalizer",
          wrappedKey: Buffer.from("wrapped-finalizer-key").toString("base64"),
          keyContext: "b".repeat(64),
          recipientKeyIds,
        };
      },
      decryptDataKey: async () => Buffer.from(sourceKey),
      destroyKey: async () => undefined,
    };
    try {
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      const finalizedRun = { receipt: receipt(), coworker: coworker() };
      const first = await sealFinalizedCoworkerRunEvidence({ finalizedRun, store, keyManager });
      const repeated = await sealFinalizedCoworkerRunEvidence({ finalizedRun, store, keyManager });

      expect(first.created).toBe(true);
      expect(repeated.created).toBe(false);
      expect(repeated.record.id).toBe(first.record.id);
      expect(keyLeases).toBe(1);
      expect(store.list({
        workspaceId: "workspace_finalizer",
        ownerId: "owner_private_finalizer",
      })).toHaveLength(1);
      expect(first.record.state).toBe("sealed");
      expect(first.record.walrusProof).toBeNull();

      const publicEnvelope = JSON.stringify(first.record.envelope);
      expect(publicEnvelope).not.toContain("workspace_finalizer");
      expect(publicEnvelope).not.toContain("owner_private_finalizer");
      expect(publicEnvelope).not.toContain("coworker_finalizer");
      expect(publicEnvelope).not.toContain("wrapped-finalizer-key");
      const bundle = await store.decrypt({
        workspaceId: "workspace_finalizer",
        ownerId: "owner_private_finalizer",
        coworkerId: "coworker_finalizer",
        evidenceId: first.record.id,
      });
      expect(bundle.receipt).toMatchObject({ status: "success", inputTokens: 120, outputTokens: 45 });
    } finally {
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects a workspace substitution before creating encryption material", async () => {
    let keyLeases = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async () => {
        keyLeases += 1;
        throw new Error("should_not_run");
      },
      decryptDataKey: async () => Buffer.alloc(32),
      destroyKey: async () => undefined,
    };
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-finalizer-tenant-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    try {
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      await expect(sealFinalizedCoworkerRunEvidence({
        finalizedRun: { receipt: receipt("workspace_receipt"), coworker: coworker("workspace_other") },
        store,
        keyManager,
      })).rejects.toThrow("crypto_evidence_tenant_binding_mismatch");
      expect(keyLeases).toBe(0);
      expect(store.list({ workspaceId: "workspace_receipt", ownerId: "owner_private_finalizer" })).toEqual([]);
    } finally {
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
