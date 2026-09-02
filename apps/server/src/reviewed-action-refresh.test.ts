import { describe, expect, test } from "bun:test";
import type { ReviewedActionDraftHandoff } from "@matterhorn-work/types/reviewed-actions";
import {
  assertReviewedActionReceiptBinding,
  buildReviewedActionHandoffV2,
  validateReviewedActionHandoffV2,
} from "./reviewed-action-airlock.js";
import { refreshReviewedActionHandoffV2 } from "./reviewed-action-refresh.js";
import { bittensorReviewedNetworkMatches } from "./reviewed-action-protocol-refresh.js";

function suiDraft(amount = "1"): ReviewedActionDraftHandoff {
  return {
    version: "matterhorn.reviewed-action-handoff.v1",
    protocol: "sui",
    source: "agent-card",
    draft: {
      operation: "transfer_sui",
      network: "testnet",
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amount,
      coinType: null,
      objectId: null,
      transfers: [],
    },
  };
}

function reviewedSuiAction() {
  return buildReviewedActionHandoffV2({
    handoff: suiDraft(),
    runId: "run_refresh_sui",
    signer: `0x${"1".repeat(64)}`,
    simulation: {
      reference: "initial_simulation",
      simulatedAt: new Date("2026-08-20T10:00:00.000Z"),
    },
    preparedAt: new Date("2026-08-20T10:00:00.000Z"),
    expiresAt: new Date("2026-08-20T10:10:00.000Z"),
  });
}

describe("reviewed action protocol refresh", () => {
  test("keeps Bittensor test and Finney reviews on their exact networks", () => {
    expect(bittensorReviewedNetworkMatches("bittensor:test", "test")).toBe(true);
    expect(bittensorReviewedNetworkMatches("bittensor:test", "finney")).toBe(false);
    expect(bittensorReviewedNetworkMatches("bittensor:finney", "finney")).toBe(true);
    expect(bittensorReviewedNetworkMatches("finney", "finney")).toBe(true);
    expect(bittensorReviewedNetworkMatches("mainnet", "finney")).toBe(false);
  });
  test("returns a newly simulated and hash-bound handoff for wallet signing", async () => {
    const result = await refreshReviewedActionHandoffV2({
      handoff: reviewedSuiAction(),
      currentDraft: suiDraft(),
      now: new Date("2026-08-20T10:00:30.000Z"),
      refresh: async () => ({
        reference: "fresh_sui_dry_run",
        block: "checkpoint_42",
        observedAt: new Date("2026-08-20T10:00:29.000Z"),
      }),
    });
    expect(result).toMatchObject({
      valid: true,
      issues: [],
      requiresRegeneration: false,
      refreshedSimulation: { reference: "fresh_sui_dry_run", block: "checkpoint_42" },
      freshness: { status: "fresh" },
    });
    expect(result.refreshedHandoff?.intentHash).not.toBe(reviewedSuiAction().intentHash);
    expect(validateReviewedActionHandoffV2({
      handoff: result.refreshedHandoff!,
      currentDraft: suiDraft(),
      now: new Date("2026-08-20T10:00:30.000Z"),
    })).toEqual([]);
    expect(() => assertReviewedActionReceiptBinding({
      handoff: result.refreshedHandoff!,
      receiptIntentHash: reviewedSuiAction().intentHash,
    })).toThrow("reviewed_action_receipt_intent_mismatch");
  });

  test("fails before refresh when a reviewed field changes", async () => {
    let calls = 0;
    const result = await refreshReviewedActionHandoffV2({
      handoff: reviewedSuiAction(),
      currentDraft: suiDraft("2"),
      now: new Date("2026-08-20T10:00:30.000Z"),
      refresh: async () => {
        calls += 1;
        return { reference: "must_not_run" };
      },
    });
    expect(result).toMatchObject({ valid: false, issues: ["material_change"], requiresRegeneration: true });
    expect(calls).toBe(0);
  });

  test("fails closed when current protocol state invalidates the action", async () => {
    const result = await refreshReviewedActionHandoffV2({
      handoff: reviewedSuiAction(),
      currentDraft: suiDraft(),
      now: new Date("2026-08-20T10:00:30.000Z"),
      refresh: async () => ({
        reference: "failed_state",
        materialChangeReasons: ["The source object changed version."],
      }),
    });
    expect(result).toMatchObject({
      valid: false,
      issues: ["simulation_state_changed"],
      refreshedHandoff: null,
      invalidationReasons: ["The source object changed version."],
    });
  });

  test("fails closed when the live adapter is unavailable", async () => {
    const result = await refreshReviewedActionHandoffV2({
      handoff: reviewedSuiAction(),
      currentDraft: suiDraft(),
      now: new Date("2026-08-20T10:00:30.000Z"),
      refresh: async () => {
        throw new Error("Sui fullnode unavailable");
      },
    });
    expect(result).toMatchObject({
      valid: false,
      issues: ["simulation_refresh_failed"],
      freshness: { status: "unavailable" },
      invalidationReasons: ["Sui fullnode unavailable"],
    });
  });
});
