import { describe, expect, test } from "bun:test";

import {
  buildDirectResponseSystemPrompt,
  buildMatterhornOrientationSystemPrompt,
} from "../src/react-app/domains/wallet/prompts/crypto-system-prompt";

describe("direct response prompt", () => {
  test("prevents request narration and references to hidden instructions", () => {
    const prompt = buildDirectResponseSystemPrompt();

    expect(prompt).toContain("Answer the person directly");
    expect(prompt).toContain("Never narrate the request");
    expect(prompt).toContain("AGENTS.md");
  });

  test("orientation instructions do not describe the user in the third person", () => {
    const prompt = buildMatterhornOrientationSystemPrompt();

    expect(prompt).not.toContain("The user is asking");
    expect(prompt).not.toContain("Let me");
    expect(prompt).toContain("Give a concise Matterhorn Desks orientation");
  });
});
