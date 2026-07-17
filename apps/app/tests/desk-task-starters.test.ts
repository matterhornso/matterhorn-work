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
      "apps/app/src/react-app/domains/session/chat/session-page.tsx",
      "utf8",
    );
    const sessionDeskSource = readFileSync(
      "apps/app/src/react-app/domains/session/surface/session-surface.tsx",
      "utf8",
    );

    expect(focusedDeskSource).toContain("MATTERHORN_DESK_TASK_STARTERS");
    expect(sessionDeskSource).toContain("MATTERHORN_DESK_TASK_STARTERS");
    expect(focusedDeskSource).not.toContain("PROTOCOL_DESK_SUGGESTED_PROMPTS");
    expect(sessionDeskSource).not.toContain("MATTERHORN_DESK_EMPTY_PROMPTS");
  });

  test("keeps market and wallet starter tasks within their declared safety boundaries", () => {
    const polymarketPrompts = MATTERHORN_DESK_TASK_STARTERS.polymarket.map((starter) => starter.prompt).join(" ");
    const hyperliquidPrompts = MATTERHORN_DESK_TASK_STARTERS.hyperliquid.map((starter) => starter.prompt).join(" ");
    const bittensorPrompts = MATTERHORN_DESK_TASK_STARTERS.bittensor.map((starter) => starter.prompt).join(" ");
    const suiPrompts = MATTERHORN_DESK_TASK_STARTERS.sui.map((starter) => starter.prompt).join(" ");

    expect(polymarketPrompts).toContain("Live submission: Off");
    expect(polymarketPrompts).toContain("do not place a bet");
    expect(hyperliquidPrompts).toContain("dedicated trade ticket");
    expect(hyperliquidPrompts).toContain("connected-wallet approval");
    expect(bittensorPrompts).toContain("external Bittensor-compatible signer");
    expect(suiPrompts).toContain("connected Sui wallet on web");
  });
});
