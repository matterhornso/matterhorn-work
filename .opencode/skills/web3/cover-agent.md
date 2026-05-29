# CoverAgent

## What this skill does
CoverAgent provides on-chain insurance coverage for autonomous AI agents, protecting against smart contract exploits, operational failures, and unexpected losses incurred during automated DeFi and on-chain operations. This skill teaches an AI agent how to buy coverage, check claim status, and manage insurance policies for agent wallets.

## Supported chains
- Ethereum
- Base

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Coverage Pool | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.coveragent.xyz) |
| Ethereum | Coverage Pool | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.coveragent.xyz) |
| Base | Claims Manager | 0x0000000000000000000000000000000000000000 (placeholder) |
| Ethereum | Claims Manager | 0x0000000000000000000000000000000000000000 (placeholder) |
| Base | Risk Assessor | 0x0000000000000000000000000000000000000000 (placeholder) |
| Base | USDC | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |

## Common operations
### Understanding Coverage Types
1. CoverAgent offers parametric and discretionary coverage for AI agent operations:
   - **Smart Contract Cover**: Losses from exploits, hacks, or bugs in protocols the agent interacts with (e.g., an Aave exploit draining agent's deposited funds).
   - **Operational Cover**: Losses from agent misconfiguration, incorrect strategy parameters, or execution errors (e.g., agent places a swap with 100% slippage).
   - **Slashing Cover**: For agents running validators or restaking, coverage against slashing events on EigenLayer, Lido, etc.
   - **Custody Cover**: Losses from private key compromise, wallet drain, or unauthorized access to the agent's signing keys.
2. Each coverage type has different premium rates based on the risk profile. Smart Contract cover is generally cheapest (pooled risk). Operational cover is most expensive (idiosyncratic risk to the agent's configuration).
3. Policies are denominated in USDC. Claims pay out in USDC. Premiums are paid upfront for the coverage term.
4. Present policy options: "Your agent wallet 0x... manages $50,000 in Aave positions. A Smart Contract policy for $50,000 costs 2.5% annually ($1,250), ~$104/month."

### Buying Coverage
1. To purchase coverage, encode `buyPolicy(policyType, coverAmount, termDuration, agentWallet)` on the Coverage Pool contract:
   - `policyType`: uint8 enum (0=SmartContract, 1=Operational, 2=Slashing, 3=Custody)
   - `coverAmount`: Maximum coverage amount in USDC (6 decimals)
   - `termDuration`: Policy term in seconds (e.g., 31536000 for 1 year, 2592000 for 1 month)
   - `agentWallet`: The wallet address being insured (must be registered as an agent)
2. The contract calculates the premium based on the coverage type, amount, term, and the agent's risk score. Pay the premium in USDC as part of the transaction (approve Coverage Pool for premium amount first).
3. Submit via `wallet_sendTransaction` targeting the Coverage Pool. The policy NFT (if applicable) is minted to the buyer's wallet, representing the active coverage.
4. The policy has a waiting period (typically 7 days for Smart Contract cover, 14 days for Operational cover) before claims can be filed. This prevents retroactive coverage on known incidents.
5. Present the policy summary: "Policy #1234 purchased: $50,000 Smart Contract Cover for wallet 0x... on Base. Premium: 1,250 USDC. Effective: June 4, 2026. Expires: June 4, 2027."

### Checking Coverage Status
1. Query active policies for a wallet via `getActivePolicies(agentWallet)` on the Coverage Pool. Returns an array of policy IDs with their types, amounts, remaining terms, and claim status.
2. For a specific policy, call `getPolicy(policyId)` to get: `policyType`, `coverAmount`, `remainingCover` (deducted by claims), `premiumPaid`, `startTime`, `endTime`, `active` (bool), and `claims` (array of filed claim IDs).
3. Check the cooling-off status: if the policy is still within its waiting period, `getPolicy(policyId).effectiveTime > block.timestamp` means claims are not yet accepted.
4. For multi-agent or DAO setups, list all policies under management by calling `getPoliciesByOwner(ownerWallet)` where the owner is the human/DAO that purchased coverage for multiple agent wallets.
5. Near expiry, the Coverage Pool emits a `PolicyExpiring(policyId, endTime)` event 30 days before expiry. Monitor this to remind users to renew.

### Filing a Claim
1. If a covered loss occurs, file a claim via `fileClaim(policyId, claimAmount, evidence)` on the Claims Manager contract:
   - `policyId`: The active policy covering the loss
   - `claimAmount`: Amount claimed in USDC (cannot exceed `remainingCover`)
   - `evidence`: IPFS hash or URI pointing to evidence (transaction hashes, exploit reports, loss calculations)
2. Claims are assessed by CoverAgent's risk assessors (or a decentralized claims committee, depending on the policy). Parametric claims (Smart Contract cover triggered by a certified exploit report) are auto-approved. Discretionary claims (Operational cover) require assessor review.
3. Call `submitEvidence(claimId, evidence)` to add supplementary evidence after filing. Multiple evidence submissions are allowed during the review period.
4. Check claim status via `getClaim(claimId)`: returns `policyId`, `claimant`, `claimAmount`, `status` (0=Pending, 1=Approved, 2=Denied, 3=PaidOut), `assessmentDeadline`, and `assessorNotes`.
5. Present the claim status: "Claim #567 for Policy #1234: $12,500 for Aave V4 pool exploit on Base. Status: Pending review. Expected assessment by June 10, 2026."

### Claim Assessment and Payout
1. Parametric claims resolve automatically based on on-chain data:
   - Smart Contract Cover: If a protocol is listed as exploited on the certified exploit registry, claims referencing that exploit are auto-approved.
   - Slashing Cover: If a slashing event is detected on the validator contract (EigenLayer, Lido), claims are auto-approved up to the slashed amount.
2. Discretionary claims enter a 14-day review period during which risk assessors analyze the evidence, agent logs, and on-chain events to determine if the loss is covered.
3. Approved claims: the Claims Manager transfers USDC from the Coverage Pool to the claimant's wallet. The `remainingCover` on the policy is reduced by the paid amount.
4. Denied claims: the policyholder can appeal within 7 days by calling `appealClaim(claimId, additionalEvidence)`. Appeals are reviewed by a higher-tier assessment committee.
5. Post-claim, the policy continues if `remainingCover > 0`. If `remainingCover == 0`, the policy is exhausted and marked inactive.

### Policy Renewal and Risk Assessment
1. To renew a policy before expiry, call `renewPolicy(policyId, newTermDuration)`. The premium is recalculated based on the current risk assessment, which may have changed since the policy was first bought.
2. The Risk Assessor contract computes an agent's risk score (0-100) based on:
   - Agent's operational history (has it had losses before?)
   - Protocols the agent interacts with (are they audited? exploited before?)
   - Maximum drawdown the agent has experienced
   - TVL managed by the agent
   - Wallet hygiene (is it a multi-sig? is there a time delay on transactions?)
3. Risk score affects premium: a score of 10 = 1.5% annual premium, 50 = 3% annual premium, 90 = 8% annual premium for Smart Contract cover. Higher-risk agents pay proportionally more.
4. Query the agent's risk score via `getRiskScore(agentWallet)` on the Risk Assessor before renewing to anticipate pricing changes.
5. Present renewal information: "Policy #1234 renewal: your agent's risk score improved from 35 to 28 due to 6 months of loss-free operation. Renewal premium: 2.1% ($1,050/year), down from the original 2.5%."
