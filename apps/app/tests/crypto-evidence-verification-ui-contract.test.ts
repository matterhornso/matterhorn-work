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
    expect(source).toContain("Nothing stored publicly without your approval");
    expect(source).toContain("Coworkers cannot use your wallet");
    expect(source).toContain("Only encrypted bytes go to the public Walrus test network");
    expect(source).toContain("only your connected wallet can sign and submit it");
    expect(source).not.toContain("Publish automatically");
    expect(source).not.toContain("Sign and publish");
  });

  test("leads with plain-language records and keeps cryptographic terms in details", () => {
    expect(source).toContain("Secure records");
    expect(source).toContain("Keep a private record of completed coworker work");
    expect(source).toContain("Readable only by you");
    expect(source).toContain("View details");
    expect(source).toContain("Technical proof");
    expect(source).toContain("Encrypted data matches");
    expect(source).not.toContain("Ciphertext only");
    expect(source).not.toContain("Owner-scoped access");
    expect(source).not.toContain("Evidence proof");
  });

  test("keeps Walrus deletion wallet-only, explicit, and irreversible", () => {
    expect(source).toContain("snapshot.deletionAvailable");
    expect(source).toContain("item.walletLifecycleReady");
    expect(source).toContain("The Blob object will be assigned to your connected Sui wallet");
    expect(source).toContain("deleteCryptoEvidenceWalrusCopy");
    expect(source).toContain("confirmCryptoEvidenceWalrusDeletion");
    expect(source).toContain("Delete encrypted copy");
    expect(source).toContain("Delete in wallet");
    expect(source).toContain("This cannot be undone.");
    expect(source).toContain("The public Sui transaction may remain");
    expect(source).toContain("await transaction.getDigest() !== prepared.preview.transactionDigest");
    expect(source).not.toContain("agentDeleteWalrus");
  });
});
