# Build & Test Commands

These are the exact commands to verify your work after each task. Claude Code cannot skip verification — if a step fails, stop and fix before continuing.

## Prerequisites

```bash
# Install deps (first time only)
pnpm install --frozen-lockfile

# If --frozen-lockfile fails (you added deps):
pnpm install
```

## Build Verification

```bash
# TypeScript type check — catches import errors, type mismatches, missing deps
pnpm --filter @matterhorn-work/app typecheck

# Full Vite build — catches bundling errors, import resolution failures
pnpm --filter @matterhorn-work/app build

# If typecheck fails: read the error, fix it, re-run. Do NOT proceed without a passing typecheck.
# If build fails: same — read error, fix, re-run.
```

## Quick Smoke Tests (per feature)

### After Task 1.1 (chains.ts + contracts.ts):
```bash
# Verify files exist and have correct exports
node -e "
import('${PWD}/apps/app/src/react-app/infra/chains.ts').then(m => console.log(Object.keys(m)))
import('${PWD}/apps/app/src/react-app/infra/contracts.ts').then(m => console.log(Object.keys(m)))
" 2>&1 || echo "ESM import test failed — check export syntax"
```

### After Task 1.2 (install wagmi):
```bash
# Verify wagmi is in deps
node -e "const p = require('./apps/app/package.json'); console.log(p.dependencies.wagmi ? 'wagmi OK' : 'MISSING')"
```

### After Task 1.7 (wallet MCP):
```bash
# Start the MCP server and send an initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1 | head -1
# Expected: JSON response with server info (not a crash)
```

### After Task 1.3-1.6 (wallet UI components):
```bash
# TypeScript must pass — wagmi imports need correct types
pnpm --filter @matterhorn-work/app typecheck
```

## Running Unit Tests

```bash
# Single test file
pnpm --filter @matterhorn-work/app exec vitest run path/to/test.ts

# All tests matching a pattern
pnpm --filter @matterhorn-work/app exec vitest run -- --grep "wallet"
```

## What Claude Code CAN Verify

- Files exist at the right paths (`ls path/to/file.ts`)
- TypeScript compiles (`pnpm typecheck`)
- Vite bundles (`pnpm build`)
- MCP server starts and responds to initialize (`node index.mjs` with stdin JSON)
- Node can import ESM modules (`node -e "import('...')"`)
- Package.json has correct deps (`grep wagmi package.json`)

## What Claude Code CANNOT Verify (manual only)

- Browser wallet connections (MetaMask requires real browser)
- Actual transaction signing (requires real wallet with funds)
- UI rendering (needs Electron + display)
- Chain RPC calls (needs network access to Base Sepolia)
