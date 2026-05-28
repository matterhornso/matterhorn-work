// test-helpers.ts — pre-built mocks for crypto feature tests
// Import this in any vitest test file to get pre-configured wagmi mocks.
//
// Usage in test file:
//   import { mockWagmiConnected, mockWagmiDisconnected, clearWagmiMocks } from "./test-helpers";
//
//   describe("MyComponent", () => {
//     beforeEach(() => clearWagmiMocks());
//
//     it("shows address when connected", () => {
//       mockWagmiConnected("0x1234567890123456789012345678901234567890", 84532);
//       // ... test component
//     });
//   });

import { vi } from "vitest";

const MOCK_ADDRESS = "0x1234567890123456789012345678901234567890" as const;
const MOCK_CHAIN_ID = 84532;

// ── Connected wallet ──────────────────────────────────────────
export function mockWagmiConnected(
  address: `0x${string}` = MOCK_ADDRESS,
  chainId: number = MOCK_CHAIN_ID,
) {
  vi.mock("wagmi", async () => {
    const actual = await vi.importActual("wagmi");
    return {
      ...actual,
      useAccount: () => ({
        address,
        addresses: [address],
        isConnected: true,
        isConnecting: false,
        isDisconnected: false,
        isReconnecting: false,
        chainId,
        connector: { id: "mock", name: "MockConnector", type: "injected" },
        status: "connected",
      }),
      useConnect: () => ({
        connect: vi.fn(),
        connectAsync: vi.fn(),
        connectors: [
          { id: "mock", name: "MockConnector", type: "injected", ready: true },
        ],
        isPending: false,
      }),
      useDisconnect: () => ({
        disconnect: vi.fn(),
        disconnectAsync: vi.fn(),
      }),
      useChainId: () => chainId,
      useSwitchChain: () => ({
        switchChain: vi.fn(),
        switchChainAsync: vi.fn(),
        chains: [],
        isPending: false,
      }),
      useBalance: () => ({
        data: {
          value: BigInt("1000000000000000000"),
          decimals: 18,
          symbol: "ETH",
          formatted: "1.0",
        },
        isLoading: false,
        isError: false,
      }),
    };
  });
}

// ── Disconnected wallet ───────────────────────────────────────
export function mockWagmiDisconnected() {
  vi.mock("wagmi", async () => {
    const actual = await vi.importActual("wagmi");
    return {
      ...actual,
      useAccount: () => ({
        address: undefined,
        addresses: undefined,
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        chainId: undefined,
        connector: undefined,
        status: "disconnected",
      }),
      useConnect: () => ({
        connect: vi.fn(),
        connectAsync: vi.fn(),
        connectors: [
          { id: "mock", name: "MockConnector", type: "injected", ready: true },
        ],
        isPending: false,
      }),
      useDisconnect: () => ({
        disconnect: vi.fn(),
        disconnectAsync: vi.fn(),
      }),
      useChainId: () => undefined,
      useSwitchChain: () => ({
        switchChain: vi.fn(),
        switchChainAsync: vi.fn(),
        chains: [],
        isPending: false,
      }),
      useBalance: () => ({
        data: undefined,
        isLoading: false,
        isError: false,
      }),
    };
  });
}

// ── Clear mocks between tests ─────────────────────────────────
export function clearWagmiMocks() {
  vi.clearAllMocks();
  vi.unmock("wagmi");
}

// ── Wallet store test helpers ─────────────────────────────────
// These don't need mocks — wal-store.ts uses subscribe/getSnapshot, not wagmi hooks

import type { TxRecord } from "../domains/wallet/state/wallet-store";

export function makeTx(overrides: Partial<TxRecord> = {}): TxRecord {
  return {
    hash: "0xabc123def456",
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: "0.01",
    status: "pending",
    timestamp: Date.now(),
    chainId: 84532,
    ...overrides,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
