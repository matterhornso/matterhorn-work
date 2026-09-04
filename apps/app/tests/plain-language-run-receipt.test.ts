import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
  privacyCategoryLabel,
  privacyModeLabel,
  receiptStatusLabel,
} from "../src/react-app/domains/session/surface/agent-run-receipt-disclosure";

const source = readFileSync(
  new URL("../src/react-app/domains/session/surface/agent-run-receipt-disclosure.tsx", import.meta.url),
  "utf8",
);

describe("plain-language response details", () => {
  test("translates stored privacy values into language users can understand", () => {
    expect(privacyModeLabel("public_research")).toBe("Public research");
    expect(privacyModeLabel("private_workspace")).toBe("Private workspace");
    expect(privacyModeLabel("transaction")).toBe("Wallet request");

    expect(privacyCategoryLabel("public")).toBe("public information");
    expect(privacyCategoryLabel("workspace_private")).toBe("workspace information");
    expect(privacyCategoryLabel("wallet_private")).toBe("wallet-related information");
    expect(privacyCategoryLabel("untrusted_external")).toBe("app and market data");
    expect(privacyCategoryLabel("secret")).toBe("secret");
  });

  test("gives every run state a direct status label", () => {
    expect(receiptStatusLabel("pending")).toBe("In progress");
    expect(receiptStatusLabel("success")).toBe("Completed");
    expect(receiptStatusLabel("partial")).toBe("Partially completed");
    expect(receiptStatusLabel("cancelled")).toBe("Cancelled");
    expect(receiptStatusLabel("error")).toBe("Failed");
  });

  test("leads with privacy, time, app, and wallet explanations", () => {
    expect(source).toContain("Response details");
    expect(source).toContain("Time and usage");
    expect(source).toContain("Apps and data");
    expect(source).toContain("No wallet action was prepared.");
    expect(source).toContain("Your connected wallet is the only place that can approve and send a transaction.");
    expect(source).toContain("That approval cannot be reused.");
    expect(source).toContain("Matterhorn blocked a secret before sharing this request.");
    expect(source).toContain('.filter((category) => category !== "secret")');
    expect(source).not.toContain("Data left Matterhorn");
    expect(source).not.toContain("capability decision");
    expect(source).not.toContain("Run receipt");
  });

  test("keeps security proofs available only after an explicit technical disclosure", () => {
    const technicalDetails = source.indexOf("Technical details");
    expect(technicalDetails).toBeGreaterThan(0);
    expect(source.indexOf("Request proof:")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Receipt proof:")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Exact app calls")).toBeGreaterThan(technicalDetails);
    expect(source.indexOf("Wallet-action proofs")).toBeGreaterThan(technicalDetails);
  });
});
