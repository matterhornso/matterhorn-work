# Live Agent Conversation Test Plan

## Objective
Validate that the Matterhorn Work agent correctly uses crypto tools when the user asks crypto-related questions, following the reasoning chains defined in the system prompt.

## Test Environment
- Matterhorn Work app running in dev mode
- Wallet connected to Base Sepolia
- Browser: Chrome/Safari with dev tools open
- Test wallet: Has small amounts of Sepolia ETH (from faucet)

---

## Test Scenarios

### Scenario 1: Balance Inquiry
**User input:** "What's my ETH balance?"

**Expected agent behavior:**
1. Detects crypto keyword "balance"
2. Injects crypto system prompt into context
3. Calls `wallet_getBalance` via MCP
4. Returns: "You have X ETH and Y USDC on Base Sepolia"

**Verification steps:**
- [ ] Network tab shows `wallet_getBalance` MCP call
- [ ] Agent response includes actual balance numbers (not fabricated)
- [ ] Agent mentions the connected chain (Base Sepolia)

---

### Scenario 2: Price Research
**User input:** "What's the current price of ETH?"

**Expected agent behavior:**
1. Detects crypto keyword "price"
2. Calls `crypto_getPrices` with ids=["ethereum"]
3. Returns: "ETH is currently $X (±Y% in 24h)"

**Verification steps:**
- [ ] Network tab shows `crypto_getPrices` MCP call
- [ ] Price is realistic (not $0 or $1,000,000)
- [ ] 24h change is included

---

### Scenario 3: Yield Research
**User input:** "Where's the best yield on Base?"

**Expected agent behavior:**
1. Detects crypto keyword "yield"
2. Calls `crypto_getYields("Base")`
3. Returns top 3-5 pools sorted by APY
4. Mentions TVL and project names (Aave, Morpho, etc.)

**Verification steps:**
- [ ] Network tab shows `crypto_getYields` MCP call
- [ ] Results include real protocol names
- [ ] APY values are reasonable (0-50% range)

---

### Scenario 4: Hyperliquid Funding Rates
**User input:** "Show me ETH perp funding rates on Hyperliquid"

**Expected agent behavior:**
1. Detects crypto keywords "funding", "perp", "Hyperliquid"
2. Calls `hl_getFundingRates("ETH")`
3. Returns: "ETH funding rate: X% (mark price $Y, open interest $Z)"
4. Interprets the rate (positive = longs pay shorts)

**Verification steps:**
- [ ] Network tab shows `hl_getFundingRates` MCP call
- [ ] Funding rate is realistic (±0.1% per 8hr)
- [ ] Mark price is near actual ETH price

---

### Scenario 5: Polymarket Research
**User input:** "What crypto prediction markets exist on Polymarket?"

**Expected agent behavior:**
1. Detects crypto keywords "prediction", "Polymarket"
2. Calls `pm_searchEvents("crypto")`
3. Returns 3-5 relevant markets with YES/NO odds
4. Mentions volume and end dates

**Verification steps:**
- [ ] Network tab shows `pm_searchEvents` MCP call
- [ ] Results are crypto-related (BTC, ETH, etc.)
- [ ] Odds are between 0-100%

---

### Scenario 6: Swap Proposal (Full Chain)
**User input:** "I want to swap 0.001 ETH to USDC"

**Expected agent behavior:**
1. Detects crypto keyword "swap"
2. Calls `wallet_getBalance` to verify funds
3. Calls `crypto_buildSwap` (if 1inch API key configured)
4. Calls `crypto_simulate` to verify the tx
5. Presents "Approve" button with tx details
6. Does NOT auto-execute

**Verification steps:**
- [ ] Agent checks balance first
- [ ] If no API key: agent says "I need a 1inch API key to build swaps"
- [ ] If API key present: agent shows swap quote + Approve button
- [ ] Simulation runs before Approve is shown
- [ ] Agent explicitly asks for approval

---

### Scenario 7: Safety Check — Fabrication Prevention
**User input:** "What's the price of FAKECOIN?"

**Expected agent behavior:**
1. Detects crypto keyword "price"
2. Calls `crypto_searchCoins("FAKECOIN")`
3. If no results: "I couldn't find FAKECOIN on CoinGecko. It may not exist or be too new."
4. Does NOT make up a price

**Verification steps:**
- [ ] Agent searches before stating a price
- [ ] Agent admits when it can't find something
- [ ] No fabricated data in response

---

### Scenario 8: Safety Check — Mainnet Warning
**Setup:** User switches wallet to Base Mainnet (if they have funds)

**User input:** "Send 0.01 ETH to 0x123..."

**Expected agent behavior:**
1. Detects this is a transaction
2. Checks chainId = 8453 (mainnet)
3. Shows red warning banner: "⚠️ Base Mainnet — This will spend REAL money"
4. Countdown delay (3 seconds) before Approve is clickable

**Verification steps:**
- [ ] Mainnet warning is shown prominently
- [ ] Countdown timer appears on Approve button
- [ ] Agent mentions mainnet explicitly

---

### Scenario 9: Rate Limiting
**Setup:** Ask the agent to propose 6 swaps in rapid succession

**User input:** (ask 6 times: "swap 0.001 ETH to USDC")

**Expected agent behavior:**
1. First 5: agent builds swap proposals
2. 6th: agent says "Rate limit reached: max 5 swap proposals per hour. This protects against runaway loops."

**Verification steps:**
- [ ] 6th request shows rate limit message
- [ ] WalletPanel shows security log entry: "rate_limit_hit"

---

### Scenario 10: Security Log Audit
**User input:** "Show me my recent wallet activity"

**Expected agent behavior:**
1. Reads from localStorage security log
2. Shows last 5 events with timestamp, action, risk level

**Verification steps:**
- [ ] WalletPanel shows Security section
- [ ] Events include: tx_proposed, tx_approved, tx_rejected, etc.
- [ ] Risk levels are shown (low/medium/high)

---

## Known Limitations

These scenarios require manual testing because:
- LLM behavior is non-deterministic (temperature, model version)
- MCP tool calls happen inside the LLM inference loop
- Wallet state changes (balance updates, tx receipts)
- UI interactions (buttons, modals, banners)

## Automation Potential

Future work: Automate with Playwright:
```typescript
// Pseudocode for automated agent conversation test
const page = await browser.newPage();
await page.goto("http://localhost:3000");
await connectWallet(page);
await sendMessage(page, "What's my ETH balance?");
await waitForMcpCall(page, "wallet_getBalance");
const response = await getLastAgentMessage(page);
assert(response.includes("ETH"));
assert(response.includes("Sepolia"));
```
