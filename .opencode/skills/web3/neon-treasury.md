# Neon Treasury

## What this skill does
Neon Treasury provides DAO treasury management infrastructure enabling automated disbursements, multi-signature controls, and treasury operations on Ethereum and Base. This skill teaches an AI agent how to automate treasury payouts, manage multi-sig approvals, and monitor treasury health.

## Supported chains
- Ethereum
- Base

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Treasury Manager | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.neon.treasury) |
| Ethereum | Treasury Manager | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.neon.treasury) |
| Base | MultiSig Wallet Factory | 0x0000000000000000000000000000000000000000 (placeholder) |
| Ethereum | MultiSig Wallet Factory | 0x0000000000000000000000000000000000000000 (placeholder) |

## Common operations
### Setting Up Automated Disbursements
1. Neon Treasury enables DAOs and organizations to set up rule-based automated payments — contributor salaries, grant distributions, operational expenses, and recurring payouts.
2. Encode a disbursement rule using the Treasury Manager contract's `createDisbursement` function:
   - `recipient`: The wallet address receiving the payment
   - `token`: ERC-20 token address for the disbursement
   - `amount`: Payment amount in the token's smallest unit
   - `schedule`: Time-based schedule (cron-like) or condition-based (e.g., on approval)
   - `vesting`: Optional vesting parameters (cliff, duration) for grant-style distributions
   - `maxExecutions`: Total number of times this disbursement can execute
   - `approverCount`: Number of multi-sig signers required to authorize each execution
3. Submit via `wallet_sendTransaction` targeting the Treasury Manager contract. The disbursement ID is returned via the `DisbursementCreated` event.
4. Present the setup clearly: "Creating a monthly 5,000 USDC contributor payment to 0x... with 3-of-5 multi-sig approval. The first payment will be available on June 1, 2026, and will repeat monthly until cancelled."

### Multi-Signature Workflows
1. Neon Treasury integrates a multi-sig wallet system where treasury operations require M-of-N signers to approve. This prevents any single key from unilaterally moving funds.
2. To deploy a multi-sig wallet, call the MultiSig Wallet Factory's `createWallet` function with the list of signer addresses and the threshold `m`. The factory deploys a new multi-sig wallet contract owned by the DAO.
3. Submitting a transaction proposal: encode the target contract call (e.g., transferring funds) and submit as a proposal to the multi-sig wallet via `submitTransaction(destination, value, data)`. The proposal gets a `txIndex`.
4. Signers confirm via `confirmTransaction(txIndex)`. The wallet tracks confirmations — once `m` confirmations are reached, anyone can call `executeTransaction(txIndex)` to execute the proposal.
5. Check pending proposals via `getTransactionCount(true, false)` (pending count) and `getTransactionIds(from, to, true, false)` to list pending transaction indices. For each, call `getTransaction(txIndex)` to see the destination, value, data, and current confirmation count.
6. Revoke a prior confirmation via `revokeConfirmation(txIndex)` if a signer changes their mind before execution.
7. Present multi-sig status: "Proposal #12 (send 5,000 USDC to 0x... for Q2 grant) has 2 of 3 required confirmations. Waiting on Alice (0x...) to sign."

### Treasury Reporting & Health
1. Query the DAO's full treasury balance across all tokens by aggregating `balanceOf(treasuryAddress)` on each tracked token contract. Also query native ETH via `eth_getBalance`.
2. Track treasury inflows (revenue, token sales, protocol fees) and outflows (disbursements, grants, expenses). Use the Treasury Manager's event logs to build a cash-flow statement: filter `DisbursementExecuted` for outflows and look for inbound transfers to the treasury address for inflows.
3. Calculate key metrics:
   - **Runway**: Total treasury value / Monthly burn rate. "The DAO treasury has a 14-month runway at the current burn rate."
   - **Diversification**: Percentage of treasury in stablecoins vs. volatile assets vs. protocol tokens.
   - **Upcoming liabilities**: Sum of all scheduled disbursements in the next 30/90/180 days.
4. Set up balance alerts: when a specific token balance drops below a threshold, trigger a notification. This can be done via contract events (`Transfer` from treasury address) or by periodic API polling.
5. For DAOs with governance tokens in their treasury, monitor price impact risk: "Your treasury holds 5M GOVERN tokens ($1.2M at current price). Liquidating more than 100K would cause >2% slippage on available DEX liquidity."

### Grant and Vesting Management
1. Grants are a special disbursement type with vesting schedules. Use `createGrant(recipient, token, totalAmount, cliffDuration, vestingDuration, startTime)` on the Treasury Manager.
2. Vesting mechanics:
   - **Cliff**: A period where no tokens unlock. After the cliff, a lump sum for the cliff period is released.
   - **Linear vesting**: After the cliff, tokens unlock linearly over the vesting duration.
   - **Example**: 12,000 TOKEN grant with 3-month cliff and 12-month vesting = 0 for first 3 months, then 1,000/month for 12 months.
3. To claim vested tokens, the grant recipient calls `claimGrant(grantId)` on the Treasury Manager. The contract calculates the claimable amount based on the time elapsed and the vesting schedule.
4. Check claimable amount: `getClaimableAmount(grantId)` returns how many tokens are currently available to claim. The difference between total granted and (claimed + claimable) = unvested.
5. Cancel a grant via `revokeGrant(grantId)` — typically requires multi-sig approval. Only the unvested portion is returned to the treasury. Already vested tokens remain claimable by the recipient.

### Expense Policy and Spending Limits
1. Set spending limits: the Treasury Manager can enforce per-payee, per-token, and per-time-period spending caps to prevent abuse.
2. Configure via `setSpendingLimit(payee, token, amountPerMonth)` — the contract tracks cumulative disbursements to each payee and rejects those exceeding the limit.
3. Spending limits reset at the start of each period (monthly default, configurable). The contract uses `block.timestamp` modulo the period to determine the current window.
4. For emergency spending beyond limits, use the multi-sig override: a proposal that explicitly bypasses the spending limit check, requiring higher-than-usual signer confirmation (e.g., 5-of-7 instead of 3-of-5).
5. Present spending status: "Payee 0x... has spent 4,200 of their 5,000 USDC monthly limit (84% utilized). 800 USDC remaining until next reset on June 1."
