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

  test("keeps market and wallet starter tasks within their declared safety boundaries", () => {
    const polymarketPrompts = MATTERHORN_DESK_TASK_STARTERS.polymarket.map((starter) => starter.prompt).join(" ");
    const hyperliquidPrompts = MATTERHORN_DESK_TASK_STARTERS.hyperliquid.map((starter) => starter.prompt).join(" ");
    const bittensorPrompts = MATTERHORN_DESK_TASK_STARTERS.bittensor.map((starter) => starter.prompt).join(" ");
    const suiPrompts = MATTERHORN_DESK_TASK_STARTERS.sui.map((starter) => starter.prompt).join(" ");

    expect(polymarketPrompts).toContain("Agent draft non-submittable");
    expect(polymarketPrompts).toContain("separate connected-wallet trade ticket");
    expect(polymarketPrompts).toContain("eligible EOA BUY order");
    expect(polymarketPrompts).toContain("Never place or auto-execute a bet");
    expect(polymarketPrompts).toContain("describe market or trade");
    expect(polymarketPrompts).not.toContain("<paste market URL or slug>");
    expect(hyperliquidPrompts).toContain("dedicated trade ticket");
    expect(hyperliquidPrompts).toContain("connected-wallet approval");
    expect(bittensorPrompts).toContain("external Bittensor-compatible signer");
    expect(suiPrompts).toContain("connected Sui wallet on web");
  });
});
