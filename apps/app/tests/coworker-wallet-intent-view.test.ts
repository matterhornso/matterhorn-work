import { describe, expect, test } from "bun:test";

import type { MatterhornCoworkerWalletIntentView } from "../src/app/lib/matterhorn-server";
import {
  canCancelCoworkerWalletIntent,
  canOpenCoworkerWalletIntent,
  coworkerWalletIntentStatus,
  coworkerWalletReviewUnavailableReason,
  coworkerWalletReceiptStatus,
  isActiveCoworkerWalletIntent,
  sortCoworkerWalletIntents,
} from "../src/react-app/domains/coworkers/coworker-wallet-intent-view";

function intent(
  state: MatterhornCoworkerWalletIntentView["state"],
  updatedAt = "2026-08-20T10:00:00.000Z",
): MatterhornCoworkerWalletIntentView {
  return {
    state,
    updatedAt,
    receipt: null,
  } as MatterhornCoworkerWalletIntentView;
}

describe("coworker wallet intent presentation", () => {
  test("keeps only pre-submission states cancellable and wallet-review states openable", () => {
    for (const state of [
      "wallet_review",
      "refreshing",
      "regeneration_required",
      "wallet_approved",
    ] as const) {
      expect(canCancelCoworkerWalletIntent(intent(state))).toBe(true);
    }
    for (const state of [
      "submitted",
      "confirmed",
      "failed",
      "expired",
      "cancelled",
    ] as const) {
      expect(canCancelCoworkerWalletIntent(intent(state))).toBe(false);
    }
    expect(canOpenCoworkerWalletIntent(intent("wallet_review"))).toBe(true);
    expect(canOpenCoworkerWalletIntent(intent("wallet_approved"))).toBe(true);
    expect(canOpenCoworkerWalletIntent(intent("submitted"))).toBe(false);
  });

  test("distinguishes active work, wallet reports, and independently verified receipts", () => {
    expect(isActiveCoworkerWalletIntent(intent("submitted"))).toBe(true);
    expect(isActiveCoworkerWalletIntent(intent("confirmed"))).toBe(false);

    const reported = intent("submitted");
    reported.receipt = {
      verification: {
        kind: "wallet_reported_public_metadata",
        chainVerified: false,
      },
    } as MatterhornCoworkerWalletIntentView["receipt"];
    expect(coworkerWalletIntentStatus(reported)).toBe("Sent by wallet");
    expect(coworkerWalletReceiptStatus(reported)).toBe(
      "Wallet-reported result; not independently verified",
    );

    const verified = intent("confirmed");
    verified.receipt = {
      verification: { kind: "public_chain", chainVerified: true },
    } as MatterhornCoworkerWalletIntentView["receipt"];
    expect(coworkerWalletIntentStatus(verified)).toBe("Verified on chain");
    expect(coworkerWalletReceiptStatus(verified)).toBe(
      "Verified against the public chain",
    );
  });

  test("never opens a Bittensor test intent in the Finney-only connected wallet", () => {
    const testnet = intent("wallet_review");
    testnet.intent = { protocol: "bittensor", network: "bittensor:test" } as MatterhornCoworkerWalletIntentView["intent"];
    testnet.reviewedAction = { protocol: "bittensor", network: "bittensor:test" } as MatterhornCoworkerWalletIntentView["reviewedAction"];
    expect(canOpenCoworkerWalletIntent(testnet)).toBe(false);
    expect(coworkerWalletIntentStatus(testnet)).toBe("Wallet network unavailable");
    expect(coworkerWalletReviewUnavailableReason(testnet)).toContain("will not switch networks");

    testnet.state = "wallet_approved";
    expect(canOpenCoworkerWalletIntent(testnet)).toBe(false);
    expect(coworkerWalletIntentStatus(testnet)).toBe("Wallet network unavailable");

    const finney = structuredClone(testnet);
    finney.intent.network = "bittensor:finney";
    finney.reviewedAction.network = "bittensor:finney";
    expect(canOpenCoworkerWalletIntent(finney)).toBe(true);
    expect(coworkerWalletReviewUnavailableReason(finney)).toBeNull();
  });

  test("sorts wallet activity by latest update without mutating server data", () => {
    const older = intent("cancelled", "2026-08-20T10:00:00.000Z");
    const newer = intent("wallet_review", "2026-08-20T11:00:00.000Z");
    const source = [older, newer];
    expect(sortCoworkerWalletIntents(source)).toEqual([newer, older]);
    expect(source).toEqual([older, newer]);
  });
});
