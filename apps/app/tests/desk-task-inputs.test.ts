import { describe, expect, test } from "bun:test";

import {
  buildDeskTaskPromptWithInput,
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
});
