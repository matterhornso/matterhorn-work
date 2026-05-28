# Vitest Testing

How to run tests in the matterhorn-work monorepo. Vitest is the test runner. Tests live alongside source files with `.test.ts` or `.test.tsx` extension.

## Running Tests

```bash
# Run a specific test file
pnpm --filter @matterhorn-work/app exec vitest run path/to/test.ts

# Run tests matching a pattern
pnpm --filter @matterhorn-work/app exec vitest run -- -t "wallet"

# Run all tests
pnpm --filter @matterhorn-work/app exec vitest run

# Watch mode (for development)
pnpm --filter @matterhorn-work/app exec vitest
```

## Test File Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("componentName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes the specific behavior", () => {
    // Arrange
    // Act
    // Assert
    expect(actual).toBe(expected);
  });
});
```

## Mocking Modules

```typescript
// Mock a module entirely
vi.mock("wagmi", async () => {
  const actual = await vi.importActual("wagmi");
  return { ...actual, useAccount: () => ({ address: "0x...", isConnected: true }) };
});

// Mock a single function
const mockFn = vi.fn().mockReturnValue("result");

// Spy on an existing function
const spy = vi.spyOn(console, "log");
```

## Testing Zustand Stores

The wallet store uses subscribe/getSnapshot — test it without React:

```typescript
import { createWalletStore } from "./wallet-store";

describe("wallet store", () => {
  it("starts in disconnected state", () => {
    const store = createWalletStore();
    expect(store.getSnapshot().isConnected).toBe(false);
  });

  it("subscribers are notified on changes", () => {
    const store = createWalletStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.connect("mock");
    expect(listener).toHaveBeenCalled();
  });
});
```

## Testing React Components (with wagmi mocks)

When testing components that use wagmi hooks, mock wagmi BEFORE imports:

```typescript
import { vi, describe, it, expect } from "vitest";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual("wagmi");
  return {
    ...actual,
    useAccount: () => ({ address: "0xabc", isConnected: true, chainId: 84532 }),
    useConnect: () => ({ connect: vi.fn(), connectors: [], isPending: false }),
    useDisconnect: () => ({ disconnect: vi.fn() }),
    useChainId: () => 84532,
    useSwitchChain: () => ({ switchChain: vi.fn() }),
  };
});

// Import AFTER mock
import { WalletConnect } from "./WalletConnect";

describe("WalletConnect", () => {
  it("renders connected address", () => {
    // render component, check output
  });
});
```

## Pitfalls

- Always `vi.clearAllMocks()` in beforeEach to prevent test pollution
- Mock wagmi at the TOP of the file, before any imports that use wagmi
- `pnpm exec vitest` not just `vitest` — ensures the right vitest version
- BigInt mocks: use `BigInt("1000000000000000000")` not `1000000000000000000n` (JSON-safe)
- The `--filter` flag targets the pnpm workspace package, not vitest filtering
