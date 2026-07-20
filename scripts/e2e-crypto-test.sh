#!/usr/bin/env bash
# e2e-crypto-test.sh — validate all server tools + MCPs actually WORK
# Run: bash scripts/e2e-crypto-test.sh

set -uo pipefail
CWD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CWD"

FAIL=0
PASS=0
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
check() {
  local label="$1" cmd="$2"
  printf '  %-60s ' "$label"
  result=$(eval "$cmd" 2>&1)
  if [ $? -eq 0 ]; then
    green "PASS"
    PASS=$((PASS + 1))
    return 0
  else
    red "FAIL"
    FAIL=$((FAIL + 1))
    echo "    → $result" >&2
    return 1
  fi
}

echo ""
echo "========================================"
echo "  Matterhorn Desks — E2E Crypto Tests"
echo "========================================"
echo ""

# ============================================================
# Phase A: Chain Client
# ============================================================
echo "[Phase A] Server Chain Client"

check "  chain-client gets Base block number" \
  "node -e \"import('./apps/server/src/infra/chain-client.js').then(m => m.baseClient.getBlockNumber().then(b => { console.log('block:', b); if (b < 1) process.exit(1) }))\""

check "  chain-client gets Sepolia block number" \
  "node -e \"import('./apps/server/src/infra/chain-client.js').then(m => m.baseSepoliaClient.getBlockNumber().then(b => { console.log('block:', b); if (b < 1) process.exit(1) }))\""

check "  token-registry resolves USDC on Base" \
  "node -e \"import('./apps/server/src/infra/token-registry.js').then(m => { const t = m.tokensForChain(8453)?.USDC; console.log(t.address); process.exit(t.address === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' ? 0 : 1) })\""

check "  token-registry resolves WETH on Sepolia" \
  "node -e \"import('./apps/server/src/infra/token-registry.js').then(m => { const t = m.tokensForChain(84532)?.WETH; console.log(t.address); process.exit(t.address === '0x4200000000000000000000000000000000000006' ? 0 : 1) })\""

# ============================================================
# Phase B: Research Tools
# ============================================================
echo ""
echo "[Phase B] Research Tools"

check "  CoinGecko search for ethereum" \
  "node -e \"import('./apps/server/src/tools/coingecko.js').then(m => m.searchCoins('ethereum')).then(r => { console.log('found', r.length); process.exit(r.length > 0 ? 0 : 1) })\""

check "  CoinGecko getPrices for bitcoin,ethereum" \
  "node -e \"import('./apps/server/src/tools/coingecko.js').then(m => m.getPrices(['bitcoin','ethereum'])).then(r => { console.log('prices', r.length); process.exit(r.length === 2 && r[0].price > 0 ? 0 : 1) })\""

check "  CoinGecko trending" \
  "node -e \"import('./apps/server/src/tools/coingecko.js').then(m => m.trending()).then(r => { console.log('trending', r.length); process.exit(r.length > 0 ? 0 : 1) })\""

check "  DeFiLlama yields for Base" \
  "node -e \"import('./apps/server/src/tools/defillama.js').then(m => m.getYields('Base', undefined, 5)).then(r => { console.log('pools', r.length); process.exit(r.length > 0 ? 0 : 1) })\""

echo ""
echo "[Phase B] V2 Research — Hyperliquid"

check "  Hyperliquid getMarkets" \
  "node -e \"import('./apps/server/src/tools/hyperliquid-research.js').then(m => m.hl_getMarkets()).then(r => { console.log('markets', r.length); process.exit(r.length > 0 ? 0 : 1) })\""

check "  Hyperliquid getFundingRates ETH-PERP" \
  "node -e \"import('./apps/server/src/tools/hyperliquid-research.js').then(m => m.hl_getFundingRates('ETH-PERP')).then(r => { console.log('fundingRate', r.fundingRate); process.exit(typeof r.fundingRate === 'number' ? 0 : 1) })\""

check "  Hyperliquid getOrderbook ETH-PERP" \
  "node -e \"import('./apps/server/src/tools/hyperliquid-research.js').then(m => m.hl_getOrderbook('ETH-PERP', 5)).then(r => { console.log('bids', r.bids.length, 'asks', r.asks.length); process.exit(r.bids.length > 0 || r.asks.length > 0 ? 0 : 1) })\""

echo ""
echo "[Phase B] V2 Research — Polymarket"

check "  Polymarket searchEvents 'crypto'" \
  "node -e \"import('./apps/server/src/tools/polymarket-research.js').then(m => m.pm_searchEvents('crypto', 5)).then(r => { console.log('events', r.length); process.exit(r.length >= 0 ? 0 : 1) })\""

# ============================================================
# Phase C: Transaction Tools
# ============================================================
echo ""
echo "[Phase C] Transaction Tools"

check "  chain-tools getBalance on Base Sepolia" \
  "node -e \"import('./apps/server/src/tools/chain-tools.js').then(m => m.getBalance({ address: '0x0000000000000000000000000000000000000000', chainId: 84532 })).then(r => { console.log('native', r.native); process.exit(r.native === '0' && r.usdc === '0' ? 0 : 1) })\""

check "  transaction-simulation rejects bad chain" \
  "node -e \"import('./apps/server/src/tools/transaction-simulation.js').then(m => m.simulateTransaction({ chainId: 999, to: '0x0000000000000000000000000000000000000000', data: '0x', from: '0x0000000000000000000000000000000000000000' })).then(r => { console.log('error', r.error); process.exit(r.error && r.success === false ? 0 : 1) })\""

# Swap builder needs API key — skip if not configured
if [ -n "${ONE_INCH_API_KEY:-}" ]; then
  echo ""
  echo "[Phase C] 1inch Swap (API key detected)"
  check "  swap-builder quote ETH→USDC" \
    "node -e \"import('./apps/server/src/tools/swap-builder.js').then(m => m.getQuote({ chainId: 84532, fromToken: 'WETH', toToken: 'USDC', amount: '1000000000000000' })).then(r => { console.log('toAmount', r.toAmount); process.exit(r.toAmount ? 0 : 1) })\""
else
  echo ""
  echo "[Phase C] 1inch Swap — SKIP (ONE_INCH_API_KEY not set)"
fi

# ============================================================
# Phase D: MCP Servers
# ============================================================
echo ""
echo "[Phase D] MCP Servers"

# Wallet MCP
check "  Wallet MCP starts and lists tools" \
  "bash -c 'cd packages/matterhorn-work-wallet-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"initialize\\\",\\\"id\\\":1}' | timeout 3 node index.mjs 2>/dev/null | grep -q wallet_connect'"

check "  Wallet MCP getBalance works" \
  "bash -c 'cd packages/matterhorn-work-wallet-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"tools/call\\\",\\\"params\\\":{\\\"name\\\":\\\"wallet_getBalance\\\",\\\"arguments\\\":{\\\"address\\\":\\\"0x0000000000000000000000000000000000000000\\\",\\\"chainId\\\":84532}},\\\"id\\\":2}' | timeout 5 node index.mjs 2>/dev/null | grep -q \"native\"'"

# Crypto MCP
check "  Crypto MCP starts and lists tools" \
  "bash -c 'cd packages/matterhorn-work-crypto-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"initialize\\\",\\\"id\\\":1}' | timeout 3 node index.mjs 2>/dev/null | grep -q crypto_searchCoins'"

check "  Crypto MCP coingecko search works" \
  "bash -c 'cd packages/matterhorn-work-crypto-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"tools/call\\\",\\\"params\\\":{\\\"name\\\":\\\"crypto_searchCoins\\\",\\\"arguments\\\":{\\\"query\\\":\\\"ethereum\\\"}},\\\"id\\\":2}' | timeout 5 node index.mjs 2>/dev/null | grep -q ethereum'"

check "  Crypto MCP hyperliquid funding works" \
  "bash -c 'cd packages/matterhorn-work-crypto-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"tools/call\\\",\\\"params\\\":{\\\"name\\\":\\\"hl_getFundingRates\\\",\\\"arguments\\\":{\\\"symbol\\\":\\\"ETH-PERP\\\"}},\\\"id\\\":2}' | timeout 5 node index.mjs 2>/dev/null | grep -q fundingRate'"

check "  Crypto MCP polymarket search works" \
  "bash -c 'cd packages/matterhorn-work-crypto-mcp && echo '{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"method\\\":\\\"tools/call\\\",\\\"params\\\":{\\\"name\\\":\\\"pm_searchEvents\\\",\\\"arguments\\\":{\\\"query\\\":\\\"crypto\\\"}},\\\"id\\\":2}' | timeout 5 node index.mjs 2>/dev/null | grep -q title'"

# ============================================================
# Summary
# ============================================================
echo ""
echo "========================================"
printf "  PASS: %d  FAIL: %d\n" "$PASS" "$FAIL"
echo "========================================"

if [ $FAIL -eq 0 ]; then
  green "ALL TESTS PASSED — crypto tools are working end-to-end"
  exit 0
else
  red "SOME TESTS FAILED — review output above"
  exit 1
fi
