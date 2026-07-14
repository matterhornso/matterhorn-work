import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("wallet address book contract", () => {
  test("transfer panel exposes the local address book instead of leaving the hook unreachable", () => {
    const transferSource = readAppSource("domains/wallet/pages/TransferPanel.tsx");
    const hookSource = readAppSource("domains/wallet/hooks/useAddressBook.ts");

    expect(hookSource).toContain("matterhorn_address_book");
    expect(hookSource).toContain("lookupEnsName");
    expect(transferSource).toContain("const { addresses, add, toggleFavorite } = useAddressBook()");
    expect(transferSource).toContain("setShowAddressBook((value) => !value)");
    expect(transferSource).toContain("Label this recipient");
    expect(transferSource).toContain("handleSaveRecipient");
    expect(transferSource).toContain("Still review the wallet approval before signing.");
  });

  test("saved recipients are not promoted to protocol whitelisted contracts", () => {
    const transferSource = readAppSource("domains/wallet/pages/TransferPanel.tsx");
    const whitelistSource = readAppSource("domains/wallet/infra/whitelist.ts");
    const approvalSource = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(transferSource).not.toContain("isWhitelistedAddress");
    expect(transferSource).not.toContain("whitelist");
    expect(whitelistSource).not.toContain("matterhorn_address_book");
    expect(approvalSource).toContain("This contract is not on the known protocol whitelist.");
  });
});
