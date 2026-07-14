import { afterEach, describe, expect, test } from "bun:test";
import {
  appendSecurityLog,
  configureSecurityLogReporter,
  getSecurityLog,
  type SecurityLogEntry,
} from "../src/react-app/domains/wallet/state/security-log";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

function installWindow() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const localStorage = new MemoryStorage();
  const fakeWindow = {
    localStorage,
    addEventListener: (name: string, listener: (event: Event) => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeEventListener: (name: string, listener: (event: Event) => void) => {
      listeners.get(name)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
    writable: true,
  });
  return fakeWindow;
}

function entry(overrides: Partial<SecurityLogEntry> = {}): SecurityLogEntry {
  return {
    timestamp: 1_783_607_000_000,
    action: "chain_mismatch",
    chainId: 84532,
    to: "0x0000000000000000000000000000000000000001",
    valueUSD: 12.35,
    riskLevel: "high",
    reason: "Blocked because the connected wallet was on Base mainnet.",
    ...overrides,
  };
}

afterEach(() => {
  configureSecurityLogReporter(null);
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
  }
});

describe("wallet security log reporter", () => {
  test("keeps local logging while reporting safety events to the active workspace ledger", async () => {
    installWindow();
    const reports: SecurityLogEntry[] = [];
    const cleanup = configureSecurityLogReporter({
      workspaceId: "ws_test",
      report: (value) => {
        reports.push(value);
      },
    });

    const first = entry();
    appendSecurityLog(first);
    await Promise.resolve();

    expect(getSecurityLog(1)).toEqual([first]);
    expect(reports).toEqual([first]);

    cleanup();
    appendSecurityLog(entry({ action: "tx_rejected", reason: "User rejected the request." }));
    await Promise.resolve();

    expect(getSecurityLog(2).map((item) => item.action)).toEqual(["tx_rejected", "chain_mismatch"]);
    expect(reports).toEqual([first]);
  });

  test("does not throw when ledger reporting fails", async () => {
    installWindow();
    configureSecurityLogReporter({
      workspaceId: "ws_test",
      report: () => Promise.reject(new Error("offline")),
    });

    const value = entry({ action: "wallet_unavailable", reason: "Wallet was disconnected." });
    appendSecurityLog(value);
    await Promise.resolve();
    await Promise.resolve();

    expect(getSecurityLog(1)).toEqual([value]);
  });
});
