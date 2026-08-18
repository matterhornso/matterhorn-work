import { describe, expect, test } from "bun:test";
import {
  assertReviewedActionReceiptBinding,
  buildReviewedActionHandoffV2,
  validateReviewedActionHandoffV2,
} from "./reviewed-action-airlock.js";
import type { ReviewedActionDraftHandoff } from "@matterhorn-work/types/reviewed-actions";

const preparedAt = new Date("2026-08-18T08:00:00.000Z");
const draft: ReviewedActionDraftHandoff = {
  version: "matterhorn.reviewed-action-handoff.v1",
  protocol: "sui",
  source: "agent-card",
  draft: {
    operation: "transfer_sui",
    network: "testnet",
    sender: `0x${"1".repeat(64)}`,
    recipient: `0x${"2".repeat(64)}`,
    amount: "1.25",
    coinType: null,
    objectId: null,
    transfers: [],
  },
};

describe("reviewed action transaction airlock", () => {
  test("hash-binds exact action, policy, expiry and simulation", () => {
    const handoff = buildReviewedActionHandoffV2({
      handoff: draft,
      runId: "run_sui_1",
      simulation: { reference: "sui-dry-run:abc", block: "checkpoint:100", simulatedAt: preparedAt },
      preparedAt,
      expiresAt: new Date("2026-08-18T08:05:00.000Z"),
    });
    expect(handoff.capabilityClass).toBe("wallet_review_only");
    expect(handoff.intentHash).toHaveLength(64);
    expect(validateReviewedActionHandoffV2({
      handoff,
      currentDraft: draft,
      now: new Date("2026-08-18T08:00:30.000Z"),
    })).toEqual([]);
  });

  test("detects field mutation, stale simulation, expiry and receipt mismatch", () => {
    const handoff = buildReviewedActionHandoffV2({
      handoff: draft,
      runId: "run_sui_2",
      simulation: { reference: "sui-dry-run:def", simulatedAt: preparedAt },
      preparedAt,
      expiresAt: new Date("2026-08-18T08:01:00.000Z"),
    });
    const tampered = structuredClone(handoff);
    if (tampered.protocol !== "sui" || tampered.draft.operation !== "transfer_sui") {
      throw new Error("unexpected reviewed action fixture");
    }
    tampered.draft.amount = "2";
    expect(validateReviewedActionHandoffV2({
      handoff: tampered,
      now: new Date("2026-08-18T08:02:00.000Z"),
    })).toEqual(expect.arrayContaining(["intent_hash_mismatch", "expired", "simulation_stale"]));
    expect(() => assertReviewedActionReceiptBinding({ handoff, receiptIntentHash: "wrong" }))
      .toThrow("reviewed_action_receipt_intent_mismatch");
  });
});
