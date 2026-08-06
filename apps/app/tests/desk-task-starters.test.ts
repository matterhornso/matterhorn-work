import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  MATTERHORN_DESK_TASK_STARTERS,
  type MatterhornDeskTaskStarterDesk,
} from "../src/react-app/domains/session/workflows/desk-task-starters";

const LAUNCHER_DESKS: MatterhornDeskTaskStarterDesk[] = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
];

describe("desk task starters", () => {
  test.each(LAUNCHER_DESKS)("gives %s at least ten distinct useful launchers", (desk) => {
    const starters = MATTERHORN_DESK_TASK_STARTERS[desk];

    expect(starters.length).toBeGreaterThanOrEqual(10);
    expect(new Set(starters.map((starter) => starter.id)).size).toBe(starters.length);
    expect(new Set(starters.map((starter) => starter.title)).size).toBe(starters.length);
    expect(starters.every((starter) => starter.detail.trim().length > 0)).toBe(true);
    expect(starters.every((starter) => starter.prompt.trim().length > 0)).toBe(true);
  });

  test("uses one catalog for focused desks and in-session desk launches", () => {
    const focusedDeskSource = readFileSync(
      new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url),
      "utf8",
    );
    const sessionDeskSource = readFileSync(
      new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url),
      "utf8",
    );

    expect(focusedDeskSource).toContain("MATTERHORN_DESK_TASK_STARTERS");
    expect(sessionDeskSource).toContain("MATTERHORN_DESK_TASK_STARTERS");
    expect(focusedDeskSource).not.toContain("PROTOCOL_DESK_SUGGESTED_PROMPTS");
    expect(sessionDeskSource).not.toContain("MATTERHORN_DESK_EMPTY_PROMPTS");
  });

  test("routes serious desk actions to reviewed tickets without requiring a model", () => {
    expect(MATTERHORN_DESK_TASK_STARTERS.hyperliquid.find((starter) => starter.id === "order-preview")).toMatchObject({ reviewedAction: "hyperliquid", reviewedActionOperation: "place_order" });
    expect(MATTERHORN_DESK_TASK_STARTERS.hyperliquid.find((starter) => starter.id === "cancel-order")).toMatchObject({ reviewedAction: "hyperliquid", reviewedActionOperation: "cancel_order" });
    expect(MATTERHORN_DESK_TASK_STARTERS.hyperliquid.find((starter) => starter.id === "modify-order")).toMatchObject({ reviewedAction: "hyperliquid", reviewedActionOperation: "modify_order" });
    expect(MATTERHORN_DESK_TASK_STARTERS.hyperliquid.find((starter) => starter.id === "close-position")).toMatchObject({ reviewedAction: "hyperliquid", reviewedActionOperation: "close_position" });
    expect(MATTERHORN_DESK_TASK_STARTERS.polymarket.find((starter) => starter.id === "preview-trade")).toMatchObject({ reviewedAction: "polymarket", reviewedActionOperation: "buy" });
    expect(MATTERHORN_DESK_TASK_STARTERS.polymarket.find((starter) => starter.id === "sell-shares")).toMatchObject({ reviewedAction: "polymarket", reviewedActionOperation: "sell" });
    expect(MATTERHORN_DESK_TASK_STARTERS.polymarket.find((starter) => starter.id === "cancel-order")).toMatchObject({ reviewedAction: "polymarket", reviewedActionOperation: "cancel" });
    expect(MATTERHORN_DESK_TASK_STARTERS.polymarket.find((starter) => starter.id === "discover-markets")?.reviewedAction).toBeUndefined();
    expect(MATTERHORN_DESK_TASK_STARTERS.bittensor.find((starter) => starter.id === "stake-preview")).toMatchObject({ reviewedAction: "bittensor", reviewedActionOperation: "stake" });
    expect(MATTERHORN_DESK_TASK_STARTERS.bittensor.find((starter) => starter.id === "unstake-preview")).toMatchObject({ reviewedAction: "bittensor", reviewedActionOperation: "unstake" });
    expect(MATTERHORN_DESK_TASK_STARTERS.bittensor.find((starter) => starter.id === "transfer-preview")).toMatchObject({ reviewedAction: "bittensor", reviewedActionOperation: "transfer" });
    expect(MATTERHORN_DESK_TASK_STARTERS.sui.find((starter) => starter.id === "sui-transfer-preview")).toMatchObject({ reviewedAction: "sui", reviewedActionOperation: "transfer_sui" });
    expect(MATTERHORN_DESK_TASK_STARTERS.sui.find((starter) => starter.id === "token-transfer-preview")).toMatchObject({ reviewedAction: "sui", reviewedActionOperation: "transfer_coin" });
    expect(MATTERHORN_DESK_TASK_STARTERS.sui.find((starter) => starter.id === "object-transfer")).toMatchObject({ reviewedAction: "sui", reviewedActionOperation: "transfer_object" });
    expect(MATTERHORN_DESK_TASK_STARTERS.sui.find((starter) => starter.id === "batch-transfer")).toMatchObject({ reviewedAction: "sui", reviewedActionOperation: "batch_transfer_sui" });

    const focusedDeskSource = readFileSync(
      new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url),
      "utf8",
    );
    expect(focusedDeskSource).toContain("const draft = reviewedActionChatDraft(item)");
    expect(focusedDeskSource).toContain("startTask(draft, item.title, { sendImmediately: false })");
    expect(focusedDeskSource).toContain("openReviewedAction={reviewedActionEntryProtocol === visibleSidePanel}");
    expect(focusedDeskSource).toContain("actionDisabled={Boolean(launchingTaskTitle) || startTaskBlocked}");
    expect(focusedDeskSource).toContain(`const startTaskBlocked = Boolean(
    !matterhornServerClient ||
    !readinessWorkspaceId ||
    (startTaskFeature && !startTaskFeature.ready),
  );`);
  });

  test("keeps market and wallet starter tasks within their declared safety boundaries", () => {
    const polymarketPrompts = MATTERHORN_DESK_TASK_STARTERS.polymarket.map((starter) => starter.prompt).join(" ");
    const hyperliquidPrompts = MATTERHORN_DESK_TASK_STARTERS.hyperliquid.map((starter) => starter.prompt).join(" ");
    const bittensorPrompts = MATTERHORN_DESK_TASK_STARTERS.bittensor.map((starter) => starter.prompt).join(" ");
    const suiPrompts = MATTERHORN_DESK_TASK_STARTERS.sui.map((starter) => starter.prompt).join(" ");

    expect(polymarketPrompts).toContain("Agent draft non-submittable");
    expect(polymarketPrompts).toContain("connected-wallet trade ticket");
    expect(polymarketPrompts).toContain("Polymarket SELL order");
    expect(polymarketPrompts).toContain("Polymarket order cancellation");
    expect(polymarketPrompts).toContain("Never place or auto-execute a bet");
    expect(polymarketPrompts).toContain("describe market or trade");
    expect(polymarketPrompts).not.toContain("<paste market URL or slug>");
    expect(hyperliquidPrompts).toContain("dedicated trade ticket");
    expect(hyperliquidPrompts).toContain("connected-wallet approval");
    expect(hyperliquidPrompts).toContain("Cancel a Hyperliquid order");
    expect(hyperliquidPrompts).toContain("Modify a Hyperliquid order");
    expect(hyperliquidPrompts).toContain("Close a Hyperliquid position");
    expect(bittensorPrompts).toContain("Bittensor stake transaction");
    expect(bittensorPrompts).toContain("Bittensor unstake transaction");
    expect(bittensorPrompts).toContain("installed wallet reviews, signs, and broadcasts");
    expect(suiPrompts).toContain("connected Sui wallet on web");
    expect(suiPrompts).toContain("Sui object transfer");
    expect(suiPrompts).toContain("batch SUI transfer");
  });
});
