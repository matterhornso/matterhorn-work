import { randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";

import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import {
  type MatterhornEvidenceKeyManager,
  sealMatterhornRunEvidence,
} from "./crypto-evidence-sealer.js";
import { decryptMatterhornEvidenceEnvelope } from "./walrus-evidence-envelope.js";

function receipt(): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "receipt_run_seal",
    runId: "run_seal",
    workspaceId: "workspace_seal",
    sessionId: "session_seal",
    status: "success",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.500Z",
    responseDurationMs: 500,
    provider: {
      id: "local",
      name: "Local",
      modelId: "model",
      privacyStatus: "local_processing",
      trainingUse: "none",
      retentionDays: 0,
      policyUrl: null,
    },
    privacy: {
      mode: "transaction",
      dataCategories: ["wallet_private"],
      redactionCount: 0,
      consent: "not_required",
      dataLeavesMatterhorn: false,
    },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
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
    integrity: { previousHash: null, recordHash: "record" },
  };
}

describe("crypto evidence sealer", () => {
  test("gives the publisher only opaque bytes and zeroes the plaintext data key", async () => {
    const plaintextKey = randomBytes(32);
    const decryptionCopy = Buffer.from(plaintextKey);
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async () => ({
        plaintextKey,
        keyReference: "kms://matterhorn/private/workspace-seal/key-1",
        recipientKeyIds: ["recipient-1"],
      }),
      destroyKey: async () => undefined,
    };
    const sealed = await sealMatterhornRunEvidence({
      receipt: receipt(),
      coworkerId: "coworker-seal",
      recipientKeyIds: ["recipient-1"],
      keyManager,
      now: new Date("2026-09-01T00:01:00.000Z"),
      correlationSalt: Buffer.alloc(32, 3),
      idEntropy: Buffer.alloc(24, 4),
    });

    expect([...plaintextKey]).toEqual(Array.from({ length: 32 }, () => 0));
    const publicText = sealed.walrusCiphertext.toString("utf8");
    expect(publicText).not.toContain("kms://");
    expect(publicText).not.toContain("workspace-seal");
    expect(publicText).not.toContain(sealed.envelope.payloadHash);
    expect(sealed.localIndex.keyReference).toContain("kms://matterhorn/private/");
    const decrypted = decryptMatterhornEvidenceEnvelope({ envelope: sealed.envelope, key: decryptionCopy });
    expect(decrypted.id).toBe(sealed.localIndex.evidenceId);
  });

  test("fails closed and still zeroes the data key when the key manager broadens recipients", async () => {
    const plaintextKey = randomBytes(32);
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async () => ({
        plaintextKey,
        keyReference: "kms://matterhorn/private/key-2",
        recipientKeyIds: ["recipient-1", "unrequested-recipient"],
      }),
      destroyKey: async () => undefined,
    };
    await expect(sealMatterhornRunEvidence({
      receipt: receipt(),
      coworkerId: "coworker-seal",
      recipientKeyIds: ["recipient-1"],
      keyManager,
    })).rejects.toThrow("evidence_key_recipient_mismatch");
    expect([...plaintextKey]).toEqual(Array.from({ length: 32 }, () => 0));
  });
});
