import { describe, expect, test } from "bun:test";

import {
  validateMatterhornEvidenceBundle,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import { compileMatterhornEvidenceBundle } from "./crypto-evidence-compiler.js";

function finalizedReceipt(): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "run_receipt_run_1",
    runId: "run_private_alpha",
    workspaceId: "workspace_private_alpha",
    sessionId: "session_private_alpha",
    status: "success",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:01.000Z",
    responseDurationMs: 1_000,
    provider: {
      id: "cudos",
      name: "ASI:Cloud",
      modelId: "asi1-mini",
      privacyStatus: "unverified",
      trainingUse: "unknown",
      retentionDays: null,
      policyUrl: "https://provider.example/privacy",
    },
    privacy: {
      mode: "transaction",
      dataCategories: ["wallet_private", "untrusted_external"],
      redactionCount: 2,
      consent: "single_request",
      dataLeavesMatterhorn: true,
    },
    usage: {
      inputTokens: 500,
      outputTokens: 125,
      reasoningTokens: 0,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0.01,
      toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 },
    },
    tools: [{
      name: "matterhorn-work_sui_simulate_transfer",
      access: "prepare",
      outcome: "success",
      latencyMs: 88,
      source: "https://source.example/?credential=must-not-survive-projection",
      freshness: "checkpoint:123",
      trust: "untrusted_external",
    }],
    memory: {
      readIds: ["memory_private_user_preference"],
      writtenIds: ["memory_private_decision"],
    },
    capabilities: [{
      toolName: "matterhorn-work_sui_simulate_transfer",
      access: "prepare",
      decision: "allowed",
      reason: "internal capability detail must-not-survive-projection",
      callId: "call_private_alpha",
      decidedAt: "2026-09-01T00:00:00.500Z",
      latencyMs: 2,
    }],
    reviewedActions: [{
      intentHash: "intent_private_alpha",
      policyHash: "policy_private_alpha",
      simulationReference: "simulation_private_alpha",
      publicReceipt: "wallet_reported_digest_private_alpha",
    }],
    integrity: {
      previousHash: null,
      recordHash: "receipt_record_hash",
    },
  };
}

describe("crypto evidence compiler", () => {
  test("projects a finalized run into a closed receipt without raw tenant or wallet-linked context", () => {
    const bundle = compileMatterhornEvidenceBundle({
      receipt: finalizedReceipt(),
      coworkerId: "coworker_private_alpha",
      keyReference: "kms://matterhorn/evidence/key-1",
      recipientKeyIds: ["workspace-recipient-1"],
      now: new Date("2026-09-01T01:00:00.000Z"),
      correlationSalt: Buffer.alloc(32, 1),
      idEntropy: Buffer.alloc(24, 2),
    });

    expect(validateMatterhornEvidenceBundle(bundle)).toEqual([]);
    expect(bundle.receipt.status).toBe("success");
    expect(bundle.receipt.toolOutcomeHashes).toHaveLength(1);
    expect(bundle.receipt.evidenceReferenceHashes).toHaveLength(1);
    expect(bundle.receipt.reviewedIntentHashes).toHaveLength(1);
    expect(bundle.receipt.publicChainReceiptHashes).toHaveLength(1);
    const serialized = JSON.stringify(bundle);
    for (const forbidden of [
      "workspace_private_alpha",
      "run_private_alpha",
      "coworker_private_alpha",
      "session_private_alpha",
      "credential=must-not-survive-projection",
      "memory_private_user_preference",
      "internal capability detail",
      "wallet_reported_digest_private_alpha",
    ]) expect(serialized).not.toContain(forbidden);
  });

  test("uses per-bundle entropy so identity hashes cannot become stable public correlators", () => {
    const base = {
      receipt: finalizedReceipt(),
      coworkerId: "coworker_private_alpha",
      keyReference: "kms://matterhorn/evidence/key-1",
      recipientKeyIds: ["workspace-recipient-1"],
      now: new Date("2026-09-01T01:00:00.000Z"),
      idEntropy: Buffer.alloc(24, 2),
    };
    const first = compileMatterhornEvidenceBundle({ ...base, correlationSalt: Buffer.alloc(32, 1) });
    const second = compileMatterhornEvidenceBundle({ ...base, correlationSalt: Buffer.alloc(32, 3) });
    expect(first.workspaceIdHash).not.toBe(second.workspaceIdHash);
    expect(first.runIdHash).not.toBe(second.runIdHash);
    expect(first.coworkerIdHash).not.toBe(second.coworkerIdHash);
  });

  test("refuses pending receipts and evidence schemas with forbidden or unknown content fields", () => {
    const pending = { ...finalizedReceipt(), status: "pending", completedAt: null, responseDurationMs: null } as MatterhornAgentRunReceipt;
    expect(() => compileMatterhornEvidenceBundle({
      receipt: pending,
      coworkerId: "coworker",
      keyReference: "kms://matterhorn/evidence/key-1",
      recipientKeyIds: ["recipient"],
    })).toThrow("evidence_run_receipt_not_finalized");

    const safe = compileMatterhornEvidenceBundle({
      receipt: finalizedReceipt(),
      coworkerId: "coworker",
      keyReference: "kms://matterhorn/evidence/key-1",
      recipientKeyIds: ["recipient"],
    });
    expect(validateMatterhornEvidenceBundle({ ...safe, rawPrompt: "secret" })).toEqual(expect.arrayContaining([
      "evidence_forbidden_content_field",
      "evidence_unknown_field",
    ]));
  });
});
