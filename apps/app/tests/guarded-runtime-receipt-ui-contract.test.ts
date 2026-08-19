import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url),
  "utf8",
);

describe("guarded runtime receipt UI contract", () => {
  test("exposes privacy, usage, tool, capability, and reviewed-action facts", () => {
    expect(source).toContain(">Privacy<");
    expect(source).toContain("provider.policyUrl");
    expect(source).toContain("input ·");
    expect(source).toContain("Estimated cost");
    expect(source).toContain("Budget:");
    expect(source).toContain("capability decision");
    expect(source).toContain(">Wallet review<");
    expect(source).toContain("simulationReference");
    expect(source).toContain("publicReceipt");
  });

  test("does not render raw prompt or capability bearer fields", () => {
    expect(source).not.toContain("receipt.rawPrompt");
    expect(source).not.toContain("receipt.capabilityToken");
    expect(source).not.toContain("receipt.toolArguments");
  });
});
