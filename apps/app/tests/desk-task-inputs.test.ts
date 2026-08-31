import { describe, expect, test } from "bun:test";

import {
  buildDeskTaskPromptWithInput,
  buildDeskTaskPromptRequestingInput,
  getDeskTaskInputRequirement,
  validateDeskTaskInput,
} from "../src/react-app/domains/session/workflows/desk-task-inputs";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
const VALID_SUI_ADDRESS = `0x${"1".repeat(64)}`;

describe("desk task required inputs", () => {
  test("detects SS58 placeholders and replaces them before launch", () => {
    const prompt = "Show my TAO balance for this SS58 public address: <paste public SS58 address>.";
    const requirement = getDeskTaskInputRequirement(prompt);

    expect(requirement?.kind).toBe("ss58");
    expect(requirement?.label).toBe("Public SS58 address");
    expect(validateDeskTaskInput(requirement!, VALID_SS58)).toBeNull();
    expect(buildDeskTaskPromptWithInput(prompt, requirement!, VALID_SS58)).toContain(VALID_SS58);
    expect(buildDeskTaskPromptWithInput(prompt, requirement!, VALID_SS58)).not.toContain("<paste");
  });

  test("rejects secret-looking values even when a public field is requested", () => {
    const requirement = getDeskTaskInputRequirement("Read wallet <paste public Sui address>");

    expect(requirement?.kind).toBe("sui_address");
    expect(validateDeskTaskInput(requirement!, "seed phrase correct horse battery staple")).toBe(requirement?.invalidMessage);
  });

  test("validates Sui public addresses and transaction digests", () => {
    const addressRequirement = getDeskTaskInputRequirement("Read wallet <paste public Sui address>");
    const digestRequirement = getDeskTaskInputRequirement("Import receipt <paste transaction digest>");

    expect(validateDeskTaskInput(addressRequirement!, VALID_SUI_ADDRESS)).toBeNull();
    expect(validateDeskTaskInput(addressRequirement!, "sui-address")).toBe(addressRequirement?.invalidMessage);
    expect(validateDeskTaskInput(digestRequirement!, "9".repeat(48))).toBeNull();
  });

  test("allows tasks without placeholders to launch immediately", () => {
    expect(getDeskTaskInputRequirement("Find useful Bittensor subnets for image generation.")).toBeNull();
  });

  test("starts placeholder tasks and asks for missing context in the main chat", () => {
    const prompt = "Find Polymarket markets about <paste research topic>.";
    const requirement = getDeskTaskInputRequirement(prompt)!;
    const builtPrompt = buildDeskTaskPromptRequestingInput("Discover markets", requirement);

    expect(builtPrompt).toContain("Let's start “Discover markets.”");
    expect(builtPrompt).toContain("What research topic should I use?");
    expect(builtPrompt).toContain("Ask me:");
    expect(builtPrompt).not.toContain("Find Polymarket markets about");
    expect(builtPrompt).not.toContain("[waiting for");
    expect(builtPrompt).not.toContain("<paste research topic>");
  });

  test("accepts a natural-language market request and keeps a URL optional", () => {
    const prompt = "Check compliance for <describe market or trade, or paste a Polymarket URL>.";
    const requirement = getDeskTaskInputRequirement(prompt);
    const naturalLanguageRequest = "Preview YES on a September rate cut with $50";
    const builtPrompt = buildDeskTaskPromptWithInput(prompt, requirement!, naturalLanguageRequest);

    expect(requirement?.kind).toBe("market");
    expect(requirement?.actionLabel).toBe("Describe market");
    expect(requirement?.label).toBe("Describe the market or trade");
    expect(validateDeskTaskInput(requirement!, naturalLanguageRequest)).toBeNull();
    expect(validateDeskTaskInput(requirement!, "will-bitcoin-reach-150000-in-2026")).toBeNull();
    expect(validateDeskTaskInput(requirement!, "https://polymarket.com/event/fed-rate-cut")).toBeNull();
    expect(validateDeskTaskInput(requirement!, "")).toBe(requirement?.missingMessage);
    expect(builtPrompt).toContain(naturalLanguageRequest);
    expect(builtPrompt).toContain("Search the current public Polymarket catalog");
    expect(builtPrompt).toContain("show at most three concise choices");
    expect(builtPrompt).toContain("Agent draft must remain non-submittable");
    expect(builtPrompt).toContain("separate connected-wallet trade ticket");
    expect(builtPrompt).toContain("Never auto-sign, auto-submit, or place a bet");
  });
});
