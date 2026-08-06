import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_DESK_TASK_STARTERS,
  reviewedActionChatDraft,
} from "../src/react-app/domains/session/workflows/desk-task-starters";

describe("desk transaction chat starters", () => {
  test("gives every reviewed transaction an editable chat request", () => {
    const transactionStarters = Object.values(MATTERHORN_DESK_TASK_STARTERS)
      .flat()
      .filter((item) => item.reviewedAction);

    expect(transactionStarters.length).toBeGreaterThan(0);
    for (const item of transactionStarters) {
      const draft = reviewedActionChatDraft(item);
      expect(draft, `${item.reviewedAction}:${item.reviewedActionOperation}`).not.toBeNull();
      expect(draft).toMatch(/[.!]$/);
    }
  });

  test("keeps research tasks on their normal agent prompts", () => {
    const researchStarters = Object.values(MATTERHORN_DESK_TASK_STARTERS)
      .flat()
      .filter((item) => !item.reviewedAction);

    for (const item of researchStarters) {
      expect(reviewedActionChatDraft(item)).toBeNull();
    }
  });

  test("uses plain transaction language and visible placeholders for missing terms", () => {
    const hyperliquid = MATTERHORN_DESK_TASK_STARTERS.hyperliquid.find(
      (item) => item.reviewedActionOperation === "place_order",
    );
    const polymarket = MATTERHORN_DESK_TASK_STARTERS.polymarket.find(
      (item) => item.reviewedActionOperation === "buy",
    );
    const bittensor = MATTERHORN_DESK_TASK_STARTERS.bittensor.find(
      (item) => item.reviewedActionOperation === "transfer",
    );
    const sui = MATTERHORN_DESK_TASK_STARTERS.sui.find(
      (item) => item.reviewedActionOperation === "transfer_sui",
    );

    expect(reviewedActionChatDraft(hyperliquid!)).toBe(
      "Buy <size> BTC on Hyperliquid testnet as a market order with 100 bps max slippage.",
    );
    expect(reviewedActionChatDraft(polymarket!)).toBe(
      "Buy Yes for $<amount> on Polymarket market <market URL or ID>.",
    );
    expect(reviewedActionChatDraft(bittensor!)).toBe(
      "Send <amount> TAO to <recipient SS58 address>.",
    );
    expect(reviewedActionChatDraft(sui!)).toBe(
      "Send <amount> SUI to <recipient address> on testnet.",
    );
  });
});
