import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = ["session-surface.tsx", "agent-run-receipt-disclosure.tsx"]
  .map((fileName) => readFileSync(
    new URL(`../src/react-app/domains/session/surface/${fileName}`, import.meta.url),
    "utf8",
  ))
  .join("\n");

describe("guarded runtime receipt UI contract", () => {
  test("leads with plain-language facts and preserves the complete technical record", () => {
    expect(source).toContain('lazy(() => import("./agent-run-receipt-disclosure")');
    expect(source).toContain("Response details");
    expect(source).toContain(">Privacy<");
    expect(source).toContain("provider.policyUrl");
    expect(source).toContain("input token");
    expect(source).toContain("Estimated cost");
    expect(source).toContain("Run limit:");
    expect(source).toContain("authorization check");
    expect(source).toContain(">Wallet<");
    expect(source).toContain("Technical details");
    expect(source).toContain("tool.access");
    expect(source).toContain("tool.trust");
    expect(source).toContain("simulationReference");
    expect(source).toContain("publicReceipt");
    expect(source).toContain("receipt.privacy.requestHash");
    expect(source).toContain("Request proof:");
    expect(source).toContain("Used for this answer:");
    expect(source).toContain("coworkerFiles");
    expect(source).toContain("savedMemories");
    expect(source).toContain("Your connected wallet is the only place that can approve and send a transaction.");
    expect(source).not.toContain("capability decision");
    expect(source).not.toContain("Data left Matterhorn");
  });

  test("does not render raw prompt or capability bearer fields", () => {
    expect(source).not.toContain("receipt.rawPrompt");
    expect(source).not.toContain("receipt.capabilityToken");
    expect(source).not.toContain("receipt.toolArguments");
  });
});
