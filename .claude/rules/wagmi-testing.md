# Wagmi Testing

How to test wagmi-based wallet code in vitest — without a real wallet or browser.

## Mocking wagmi

Wagmi uses React hooks (useAccount, useConnect, useDisconnect). These cannot be tested directly — mock them in vitest with vi.mock().

### Mock useAccount

```typescript
import { vi } from "vitest";

// Mock a connected wallet
vi.mock("wagmi", async () => {
  const actual = await vi.importActual("wagmi");
  return {
    ...actual,
    useAccount: () => ({
      address: "0x1234567890123456789012345678901234567890",
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      chainId: 84532,
      connector: { name: "MockConnector" },
    }),
    useConnect: () => ({
      connect: vi.fn(),
      connectors: [{ name: "MockConnector", id: "mock" }],
      isPending: false,
    }),
    useDisconnect: () => ({
      disconnect: vi.fn(),
    }),
    useChainId: () => 84532,
    useSwitchChain: () => ({
      switchChain: vi.fn(),
    }),
    useBalance: () => ({
      data: { value: BigInt("1000000000000000000"), decimals: 18, symbol: "ETH" },
    }),
  };
});
```

### Mock useAccount — disconnected state

```typescript
vi.mock("wagmi", async () => {
  const actual = await vi.importActual("wagmi");
  return {
    ...actual,
    useAccount: () => ({
      address: undefined,
      isConnected: false,
      isConnecting: false,
      isDisconnected: true,
      chainId: undefined,
      connector: undefined,
    }),
    useConnect: () => ({
      connect: vi.fn(),
      connectors: [{ name: "MockConnector", id: "mock" }],
      isPending: false,
    }),
    useDisconnect: () => ({
      disconnect: vi.fn(),
    }),
    useChainId: () => undefined,
    useSwitchChain: () => ({
      switchChain: vi.fn(),
    }),
    useBalance: () => ({
      data: undefined,
    }),
  };
});
```

## Testing the wallet store

The wallet-store.ts uses a Zustand-like subscribe/getSnapshot pattern, NOT wagmi hooks. This makes it testable without mocking wagmi at all — the store is a plain object factory.

### Test pattern

```typescript
import { describe, it, expect } from "vitest";
import { createWalletStore } from "./wallet-store";

describe("walletStore", () => {
  it("starts disconnected", () => {
    const store = createWalletStore();
    const snapshot = store.getSnapshot();
    expect(snapshot.isConnected).toBe(false);
    expect(snapshot.address).toBeNull();
    expect(snapshot.chainId).toBeNull();
  });

  it("tracks transactions", () => {
    const store = createWalletStore();
    store.addTransaction({
      hash: "0xabc",
      to: "0x123",
      value: "1.0",
      status: "pending",
      timestamp: Date.now(),
      chainId: 84532,
    });
    const snapshot = store.getSnapshot();
    expect(snapshot.transactions.length).toBe(1);
    expect(snapshot.transactions[0].hash).toBe("0xabc");
  });
});
```

## Testing chains.ts and contracts.ts

These are pure data modules — no mocks needed:

```typescript
import { describe, it, expect } from "vitest";
import { MATTERHORN_CHAINS, DEFAULT_CHAIN } from "../infra/chains";
import { USDC_BY_CHAIN, USDC_DECIMALS, ERC20_TRANSFER_ABI } from "../infra/contracts";

describe("chains", () => {
  it("has Base Sepolia as default", () => {
    expect(DEFAULT_CHAIN.id).toBe(84532);
  });
});

describe("contracts", () => {
  it("has USDC on Base Sepolia", () => {
    expect(USDC_BY_CHAIN[84532]).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  });

  it("USDC uses 6 decimals", () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it("has ERC-20 transfer ABI", () => {
    const transferFn = ERC20_TRANSFER_ABI.find((item) => item.name === "transfer");
    expect(transferFn).toBeDefined();
    expect(transferFn?.inputs[0].name).toBe("to");
    expect(transferFn?.inputs[1].name).toBe("amount");
  });
});
```

## Pitfalls

- Do NOT import wagmi hooks inside the wallet store — the store is testable without them
- Use vi.mock() at the top of the test file, before imports
- Wagmi's useBalance returns BigInt — not a number. Use BigInt("...") in mocks
- The `@matterhorn-work/app` filter works for pnpm workspace scripts
