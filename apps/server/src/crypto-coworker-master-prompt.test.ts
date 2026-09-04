import { describe, expect, test } from "bun:test";

import { listMatterhornCoworkerTemplates } from "./crypto-coworker-templates.js";
import {
  MATTERHORN_COWORKER_MASTER_PROMPT_VERSION,
  buildMatterhornCoworkerMasterPrompt,
} from "./crypto-coworker-master-prompt.js";

describe("crypto coworker master prompts", () => {
  test("gives every product role a concise, wallet-only instruction layer", () => {
    for (const template of listMatterhornCoworkerTemplates()) {
      const prompt = buildMatterhornCoworkerMasterPrompt(template.profile);
      expect(prompt.length).toBeLessThanOrEqual(1_024);
      expect(prompt).toContain(MATTERHORN_COWORKER_MASTER_PROMPT_VERSION);
      expect(prompt).toContain("connected-wallet review");
      expect(prompt).toContain("untrusted data");
      expect(prompt).toContain("Never request secrets");
      expect(prompt).toContain("What I found, What it means, Done, Review needed, What I need from you");
      expect(prompt).toContain("Hide internal app ids");
      expect(prompt).not.toContain(template.profile.mission);
    }
  });

  test("requires exact user terms for preparation roles", () => {
    for (const role of ["transaction_coordinator", "treasury_coworker"]) {
      const prompt = buildMatterhornCoworkerMasterPrompt({ role });
      expect(prompt).toContain("exact user-supplied terms");
    }
  });

  test("keeps treasury transfer instructions aligned with its certified profile", () => {
    const prompt = buildMatterhornCoworkerMasterPrompt({ role: "treasury_coworker" });
    expect(prompt).toContain("Sui or Bittensor testnet transfer");
    expect(prompt).not.toContain("Prepare a Sui transfer only");
  });

  test("keeps custom roles on the narrow fallback", () => {
    const prompt = buildMatterhornCoworkerMasterPrompt({ role: "custom_researcher" });
    expect(prompt).toContain("narrowest available read-only path");
    expect(prompt).not.toContain("Create at most one exact wallet review");
  });
});
