import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const source = readFileSync(
  new URL("../src/react-app/domains/crypto-apps/crypto-evidence-route.tsx", import.meta.url),
  "utf8",
);

describe("encrypted evidence verification UI", () => {
  test("shows durable automatic status while retaining an explicit user refresh", () => {
    expect(source).toContain("result?.verification ?? item.lastVerification");
    expect(source).toContain("Integrity check pending");
    expect(source).toContain("Integrity checked ${formatDate(verification.verifiedAt)}");
    expect(source).toContain('"Check now"');
  });

  test("keeps the safety boundary explicit and avoids autonomous publication language", () => {
    expect(source).toContain("Nothing published automatically");
    expect(source).toContain("No agent wallet authority");
    expect(source).toContain("Only encrypted bytes go to the public Walrus test network");
    expect(source).toContain("only your connected wallet can sign and submit it");
    expect(source).not.toContain("Publish automatically");
    expect(source).not.toContain("Sign and publish");
  });
});
