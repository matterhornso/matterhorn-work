import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Wallet approval security contract", () => {
  test("approved transactions are submitted on the reviewed chain", () => {
    const source = readAppSource("domains/wallet/useSessionWallet.ts");

    expect(source).toContain("chainId: approval.chainId");
    expect(source).toContain("chainId: targetChainId");
    expect(source).toContain("Switch your wallet to");
  });

  test("approval modal displays normalized ETH value instead of raw wei", () => {
    const source = readAppSource("domains/wallet/TransactionApproval.tsx");

    expect(source).toContain("formatTxValueEth(pending.value)");
    expect(source).not.toContain("{pending.value} ETH");
  });

  test("ENS resolution cannot reuse a stale previous recipient", () => {
    const hookSource = readAppSource("domains/wallet/hooks/useEnsResolution.ts");
    const transferSource = readAppSource("domains/wallet/pages/TransferPanel.tsx");
    const bridgeSource = readAppSource("domains/wallet/pages/BridgePanel.tsx");

    expect(hookSource).toContain("requestIdRef");
    expect(hookSource).toContain("requestId === requestIdRef.current");
    expect(transferSource).toContain("resolvedFor === normalizedRecipient");
    expect(bridgeSource).toContain("resolvedFor === normalizedRecipient");
  });
});
