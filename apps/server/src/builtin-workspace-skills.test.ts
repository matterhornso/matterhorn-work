import { describe, expect, test } from "bun:test";
import { MATTERHORN_DESK_CONNECTOR_RECOMMENDATIONS, MATTERHORN_PRELOADED_WORKSPACE_SKILLS, getMatterhornBuiltinDeskGuidance } from "./builtin-workspace-skills.js";

describe("desk skill coverage and connector claims", () => {
  const desks = [
    ["matterhorn", "## Private AI workflows"],
    ["matterhorn-bittensor", "## Bittensor research"],
    ["matterhorn-hyperliquid", "## Hyperliquid research"],
    ["matterhorn-polymarket", "## Polymarket research"],
    ["matterhorn-sui", "## Sui research"],
  ] as const;

  for (const [id, heading] of desks) {
    test(`${id} receives only its own relevant pack and shared safety rules`, () => {
      const guidance = getMatterhornBuiltinDeskGuidance(id);
      expect(guidance).toContain("## Evidence and safe execution");
      expect(guidance).toContain(heading);
      for (const [otherId, otherHeading] of desks) {
        if (otherId !== id) expect(guidance).not.toContain(otherHeading);
      }
      expect(guidance).toContain("does not add tools, grant access, change the selected model");
      expect(guidance).toContain("Do not silently attach memories or files");
      expect(guidance).not.toContain("## Connection setup and catalog");
    });
  }

  test("unknown, custom and internal agents do not receive guessed routing", () => {
    for (const id of ["", "sui", "matterhorn-compaction", "matterhorn-sui-custom", "../matterhorn"]) {
      expect(getMatterhornBuiltinDeskGuidance(id)).toBe("");
    }
  });

  test("catalog distinguishes existing adapters, optional consent and future work", () => {
    const entries = MATTERHORN_DESK_CONNECTOR_RECOMMENDATIONS;
    expect(entries).toHaveLength(13);
    expect(entries.filter((entry) => entry.availability === "built-in guarded adapter")).toHaveLength(5);
    expect(entries.filter((entry) => entry.availability === "optional connection")).toHaveLength(7);
    expect(entries.filter((entry) => entry.availability === "future adapter")).toHaveLength(1);
    for (const entry of entries) {
      const source = new URL(entry.source);
      expect(source.protocol).toBe("https:");
      expect(source.username).toBe("");
      expect(source.search).toBe("");
      expect(entry.setup.length).toBeGreaterThan(30);
    }
    const setup = MATTERHORN_PRELOADED_WORKSPACE_SKILLS.find((skill) => skill.name === "matterhorn-connector-setup")?.body ?? "";
    expect(setup).toContain("not a list of connected accounts");
    expect(setup).toContain("Never copy the developer's Codex/ChatGPT plugin account");
    expect(setup).toContain("Preloading never activates Jev, STM");
    expect(setup).toContain("Source/license review and pinned executable artifacts");
  });
});
