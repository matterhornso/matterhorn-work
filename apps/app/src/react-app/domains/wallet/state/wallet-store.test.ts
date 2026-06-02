import { describe, it, expect } from "vitest";
import { createWalletStore } from "./wallet-store";

describe("wallet-store", () => {
  it("starts in disconnected state", () => {
    const store = createWalletStore();
    const snap = store.getSnapshot();
    expect(snap.isConnected).toBe(false);
    expect(snap.address).toBeNull();
    expect(snap.chainId).toBeNull();
    expect(snap.isConnecting).toBe(false);
  });

  it("sets connecting state", () => {
    const store = createWalletStore();
    store.setConnecting(true);
    expect(store.getSnapshot().isConnecting).toBe(true);
    expect(store.getSnapshot().isConnected).toBe(false);
  });

  it("sets connected state with address and chain", () => {
    const store = createWalletStore();
    store.setConnected("0x1234567890abcdef1234567890abcdef12345678", 84532, "metaMask");
    const snap = store.getSnapshot();
    expect(snap.isConnected).toBe(true);
    expect(snap.address).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(snap.chainId).toBe(84532);
    expect(snap.connector).toBe("metaMask");
    expect(snap.isConnecting).toBe(false);
  });

  it("disconnects and clears state", () => {
    const store = createWalletStore();
    store.setConnected("0x1234567890abcdef1234567890abcdef12345678", 84532, "metaMask");
    store.setBalances("1.5", "100.00");
    store.disconnect();
    const snap = store.getSnapshot();
    expect(snap.isConnected).toBe(false);
    expect(snap.address).toBeNull();
    expect(snap.ethBalance).toBeNull();
    expect(snap.usdcBalance).toBeNull();
  });

  it("sets balances", () => {
    const store = createWalletStore();
    store.setBalances("2.5", "500.00");
    expect(store.getSnapshot().ethBalance).toBe("2.5");
    expect(store.getSnapshot().usdcBalance).toBe("500.00");
  });

  it("switches chain", () => {
    const store = createWalletStore();
    store.setConnected("0x1234567890abcdef1234567890abcdef12345678", 84532, "metaMask");
    store.setChainId(8453);
    expect(store.getSnapshot().chainId).toBe(8453);
  });

  it("adds and limits transactions", () => {
    const store = createWalletStore();
    for (let i = 0; i < 60; i++) {
      store.addTransaction({
        hash: `0x${i.toString(16).padStart(64, "0")}` as `0x${string}`,
        to: "0x1234567890abcdef1234567890abcdef12345678",
        value: "0.01",
        status: "pending",
        timestamp: Date.now(),
        chainId: 84532,
        proposedBy: "user_manual",
        riskLevel: "low",
      });
    }
    expect(store.getSnapshot().transactions.length).toBe(50); // max 50
  });

  it("updates transaction status", () => {
    const store = createWalletStore();
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
    store.addTransaction({
      hash,
      to: "0x1234567890abcdef1234567890abcdef12345678",
      value: "0.01",
      status: "pending",
      timestamp: Date.now(),
      chainId: 84532,
      proposedBy: "user_manual",
      riskLevel: "low",
    });
    store.updateTransaction(hash, "confirmed");
    const tx = store.getSnapshot().transactions.find((t) => t.hash === hash);
    expect(tx?.status).toBe("confirmed");
  });

  it("handles approval requests", () => {
    const store = createWalletStore();
    store.requestApproval("0xto", "0.01", "0xdata", 84532, "user_manual", "low");
    expect(store.getSnapshot().pendingApproval).toEqual({
      to: "0xto",
      value: "0.01",
      data: "0xdata",
      chainId: 84532,
      proposedBy: "user_manual",
      riskLevel: "low",
    });
    store.clearApproval();
    expect(store.getSnapshot().pendingApproval).toBeNull();
  });

  it("handles errors", () => {
    const store = createWalletStore();
    store.setError("Connection failed");
    expect(store.getSnapshot().error).toBe("Connection failed");
    store.setError(null);
    expect(store.getSnapshot().error).toBeNull();
  });

  it("notifies subscribers on changes", () => {
    const store = createWalletStore();
    let called = 0;
    const unsub = store.subscribe(() => {
      called++;
    });
    store.setConnecting(true);
    store.setConnected("0x1234567890abcdef1234567890abcdef12345678", 84532, "metaMask");
    expect(called).toBe(2);
    unsub();
  });
});
