import { describe, expect, test } from "bun:test";

import {
  buildDefaultWorkspaceBlueprint,
  defaultBlueprintStartersForPreset,
} from "../src/app/lib/workspace-blueprints";

describe("Matterhorn workspace blueprints", () => {
  test("default starter cards are Matterhorn protocol desks", () => {
    const starters = defaultBlueprintStartersForPreset("starter");

    expect(starters.map((starter) => starter.id)).toEqual([
      "bittensor-desk",
      "hyperliquid-desk",
      "polymarket-desk",
    ]);
    expect(starters.map((starter) => starter.title).join(" ")).toContain("Bittensor");
    expect(starters.map((starter) => starter.title).join(" ")).toContain("Hyperliquid");
    expect(starters.map((starter) => starter.title).join(" ")).toContain("Polymarket");
    expect(starters.every((starter) => starter.kind === "prompt")).toBe(true);
    expect(starters.some((starter) => starter.action === "connect-openai")).toBe(false);
  });

  test("default empty session copy does not show generic automation examples", () => {
    const blueprint = buildDefaultWorkspaceBlueprint("starter");
    const copy = JSON.stringify(blueprint);

    for (const forbidden of [
      "Edit a CSV",
      "Automate a browser task",
      "Search Craigslist",
      "Create a sample spreadsheet",
      "Connect an extension",
      "sync contacts to Notion",
      "only limit is your imagination",
    ]) {
      expect(copy).not.toContain(forbidden);
    }
  });
});
