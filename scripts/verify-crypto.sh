#!/usr/bin/env bash
# verify-crypto.sh — single-command verification for all crypto features
# Run: bash scripts/verify-crypto.sh
# Exit 0 = all checks pass, Exit 1+ = something failed

set -euo pipefail
FAIL=0
PASS=0
CWD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CWD"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
check() {
  local label="$1" cmd="$2"
  printf '  %-55s ' "$label"
  if eval "$cmd" >/dev/null 2>&1; then
    green "PASS"
    PASS=$((PASS + 1))
    return 0
  else
    red "FAIL"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

echo ""
echo "========================================"
echo "  Matterhorn Desks — Crypto Verification"
echo "========================================"
echo ""

# ── F1: INFRASTRUCTURE ──────────────────────────────────────
echo "[F1] Infrastructure files"

check "  chains.ts exists"           "test -f apps/app/src/react-app/infra/chains.ts"
check "  contracts.ts exists"        "test -f apps/app/src/react-app/infra/contracts.ts"
check "  wagmi in deps"              "node -e \"const p=require('./apps/app/package.json');process.exit(p.dependencies?.wagmi?0:1)\""
check "  viem in deps"               "node -e \"const p=require('./apps/app/package.json');process.exit(p.dependencies?.viem?0:1)\""
check "  @tanstack/react-query"      "node -e \"const p=require('./apps/app/package.json');process.exit(p.dependencies?.['@tanstack/react-query']?0:1)\""
check "  chains.ts exports OK"       "node -e \"import('./apps/app/src/react-app/infra/chains.ts').then(m=>process.exit(Object.keys(m).length?0:1))\""
check "  contracts.ts exports OK"    "node -e \"import('./apps/app/src/react-app/infra/contracts.ts').then(m=>process.exit(Object.keys(m).length?0:1))\""
check "  USDC Base Sepolia addr"     "node -e \"import('./apps/app/src/react-app/infra/contracts.ts').then(m=>process.exit(m.USDC_BY_CHAIN?.[84532]==='0x036CbD53842c5426634e7929541eC2318f3dCF7e'?0:1))\""
check "  USDC decimals = 6"          "node -e \"import('./apps/app/src/react-app/infra/contracts.ts').then(m=>process.exit(m.USDC_DECIMALS===6?0:1))\""
check "  ERC20_TRANSFER_ABI exists"  "node -e \"import('./apps/app/src/react-app/infra/contracts.ts').then(m=>process.exit(Array.isArray(m.ERC20_TRANSFER_ABI)?0:1))\""
echo ""

# ── F1: WALLET STORE ──────────────────────────────────────────
echo "[F1] Wallet store"

WALLET_STORE="apps/app/src/react-app/domains/wallet/state/wallet-store.ts"
if test -f "$WALLET_STORE"; then
  check "  wallet-store.ts exists"  "true"
  check "  store exports factory"   "node -e \"import('$PWD/$WALLET_STORE').then(m=>process.exit(typeof m.createWalletStore==='function'?0:1))\""
  check "  store starts disconnected" "node -e \"import('$PWD/$WALLET_STORE').then(m=>{const s=m.createWalletStore();const snap=s.getSnapshot();process.exit(snap.isConnected===false&&snap.address===null?0:1)})\""
else
  echo "  (skipped — wallet-store.ts not found yet)"
fi
echo ""

# ── F1: UI COMPONENTS ─────────────────────────────────────────
echo "[F1] UI components"

check "  WalletConnect.tsx exists"      "test -f apps/app/src/react-app/domains/wallet/WalletConnect.tsx"
check "  WalletPanel.tsx exists"        "test -f apps/app/src/react-app/domains/wallet/WalletPanel.tsx"
check "  TransactionApproval.tsx"       "test -f apps/app/src/react-app/domains/wallet/TransactionApproval.tsx"
echo ""

# ── V1 ENGINE ────────────────────────────────────────────────
echo "[V1] Core engine (Phase A, B, C)"

SV="apps/server/src"
check "  server chain-client.ts exists"    "test -f $SV/infra/chain-client.ts"
check "  server token-registry.ts exists"  "test -f $SV/infra/token-registry.ts"
check "  server chain-tools.ts exists"     "test -f $SV/tools/chain-tools.ts"
check "  server api-client.ts exists"      "test -f $SV/tools/api-client.ts"
check "  server coingecko.ts exists"       "test -f $SV/tools/coingecko.ts"
check "  server defillama.ts exists"       "test -f $SV/tools/defillama.ts"
check "  server swap-builder.ts exists"    "test -f $SV/tools/swap-builder.ts"
check "  server transaction-simulation.ts exists" "test -f $SV/tools/transaction-simulation.ts"
check "  viem in server deps"              "node -e \"const p=require('./apps/server/package.json');process.exit(p.dependencies?.viem?0:1)\""
check "  chain-client fetches real block"  "node -e \"import('./apps/server/dist/infra/chain-client.js').then(m=>m.baseClient.getBlockNumber().then(n=>process.exit(n>0n?0:1)))\""
check "  token-registry resolves USDC"     "node -e \"import('./apps/server/dist/infra/token-registry.js').then(m=>process.exit(m.tokensForChain(8453)?.USDC?.decimals===6?0:1))\""
check "  coingecko search works"           "node -e \"import('./apps/server/dist/tools/coingecko.js').then(async m=>{const r=await m.searchCoins('ethereum');process.exit(r.length>0?0:1)})\""
check "  defillama yields work"            "node -e \"import('./apps/server/dist/tools/defillama.js').then(async m=>{const r=await m.getYields('Base');process.exit(r.length>0?0:1)})\""
echo ""

# ── V2 ENGINE ────────────────────────────────────────────────
echo "[V2] Advanced research (Hyperliquid + Polymarket)"

check "  server hyperliquid-research.ts"   "test -f $SV/tools/hyperliquid-research.ts"
check "  server hyperliquid-execution.ts"  "test -f $SV/tools/hyperliquid-execution.ts"
check "  server polymarket-research.ts"  "test -f $SV/tools/polymarket-research.ts"
echo ""

# ── F1: WALLET MCP ────────────────────────────────────────────
echo "[F1] Wallet MCP server"

MCP_PATH="packages/matterhorn-work-wallet-mcp/index.mjs"
if test -f "$MCP_PATH"; then
  check "  MCP index.mjs exists"        "true"
  check "  MCP server starts"           "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}' | timeout 3 node '$MCP_PATH' 2>&1 | grep -q 'result'"
  check "  MCP lists wallet_connect"    "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"0.1.0\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n' | timeout 5 node '$MCP_PATH' 2>&1 | python3 -c \"import sys;text=sys.stdin.read();sys.exit(0 if 'wallet_connect' in text else 1)\""
  check "  MCP lists wallet_sendTx"     "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"0.1.0\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n' | timeout 5 node '$MCP_PATH' 2>&1 | python3 -c \"import sys;text=sys.stdin.read();sys.exit(0 if 'wallet_sendTransaction' in text else 1)\""
  check "  MCP lists wallet_signMsg"    "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"0.1.0\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n' | timeout 5 node '$MCP_PATH' 2>&1 | python3 -c \"import sys;text=sys.stdin.read();sys.exit(0 if 'wallet_signMessage' in text else 1)\""
  check "  MCP lists wallet_getBal"     "printf '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"0.1.0\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n' | timeout 5 node '$MCP_PATH' 2>&1 | python3 -c \"import sys;text=sys.stdin.read();sys.exit(0 if 'wallet_getBalance' in text else 1)\""
else
  echo "  (skipped — MCP server not found yet)"
fi
echo ""

# ── F2: SESSION CONTEXT ───────────────────────────────────────
echo "[F2] Session context"

if test -f apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx; then
  check "  SessionContextProvider exists" "true"
else
  echo "  (skipped — not built yet)"
fi
echo ""

# ── F4: WEB3 SKILLS ───────────────────────────────────────────
echo "[F4] Web3 skills"

SKILL_DIR=".opencode/skills/web3"
if test -d "$SKILL_DIR"; then
  SKILL_COUNT=$(ls "$SKILL_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  check "  skill files ($SKILL_COUNT total)" "test $SKILL_COUNT -ge 1"
  check "  INDEX.md exists"              "test -f $SKILL_DIR/INDEX.md"
  check "  usdc-transfer.md exists"      "test -f $SKILL_DIR/usdc-transfer.md"
else
  echo "  (skipped — web3 skills dir not found)"
fi
echo ""

# ── F5: MARKETPLACE ───────────────────────────────────────────
echo "[F5] Agent marketplace"

if test -f apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx; then
  check "  marketplace-view.tsx exists"  "true"
  check "  marketplace-store.ts exists"  "test -f apps/app/src/react-app/domains/settings/state/marketplace-store.ts"
  check "  agent-blueprints.ts exists"   "test -f apps/app/src/react-app/domains/settings/data/agent-blueprints.ts"
  BP_COUNT=$(node -e "import('$PWD/apps/app/src/react-app/domains/settings/data/agent-blueprints.ts').then(m=>{const b=m.agentBlueprints||m.default||[];console.log(b.length)})" 2>/dev/null || echo "0")
  check "  blueprints count ($BP_COUNT)" "test ${BP_COUNT:-0} -ge 1"
else
  echo "  (skipped — marketplace not built yet)"
fi
echo ""

# ── FULL BUILD ─────────────────────────────────────────────────
echo "[BUILD] TypeScript + Vite"

check "  pnpm typecheck"  "pnpm --filter @matterhorn-work/app typecheck 2>&1"
check "  pnpm build"      "pnpm --filter @matterhorn-work/app build 2>&1"
echo ""

# ── SUMMARY ────────────────────────────────────────────────────
echo "========================================"
printf "  PASS: %d  FAIL: %d\n" "$PASS" "$FAIL"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  red "VERIFICATION FAILED — fix the FAILed checks above and re-run"
  exit 1
else
  green "VERIFICATION PASSED — all checks green"
  exit 0
fi
