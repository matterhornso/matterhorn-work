# Escrow3

## What this skill does
Escrow3 provides smart escrow agreements on Base, enabling trustless deposit, conditional release, and dispute resolution for peer-to-peer transactions, service agreements, and milestone-based payments. This skill teaches an AI agent how to create escrows, release funds on conditions, and manage disputes.

## Supported chains
- Base

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Escrow3 Factory | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.escrow3.xyz) |
| Base | Escrow3 Router | 0x0000000000000000000000000000000000000000 (placeholder) |
| Base | Arbitration Registry | 0x0000000000000000000000000000000000000000 (placeholder) |
| Base | USDC | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |

## Common operations
### Creating an Escrow Agreement
1. Escrow3's Factory contract deploys a new escrow instance for each agreement. Call `createEscrow(params)` where the params struct includes:
   - `payer`: Wallet address depositing funds
   - `payee`: Wallet address receiving funds on successful completion
   - `token`: ERC-20 token for payment (typically USDC on Base)
   - `amount`: Total escrow amount in the token's smallest unit
   - `arbitrator`: Address of the designated arbitrator (can be a multi-sig, DAO, or Escrow3's default arbitrator)
   - `arbitratorFee`: Fee in basis points (e.g., 100 = 1%) paid to the arbitrator if a dispute arises
   - `milestones`: Array of milestone amounts and descriptions
   - `timeoutBlock`: Block number after which funds auto-release to the payee (for abandonment protection)
   - `metadataURI`: IPFS hash or URI pointing to the off-chain agreement terms (legal contract, SOW, deliverables list)
2. The factory deploys a new escrow contract and returns its address. Both parties must agree to the terms before the payer deposits.
3. Present the escrow summary: "Creating an escrow for 10,000 USDC between Payer (0x...) and Payee (0x...). 30% up front (3,000 USDC), 70% on delivery (7,000 USDC). Arbitrator: Escrow3 Default. Agreement: ipfs://Qm... Timeout: 30 days."

### Depositing Funds
1. After the escrow contract is deployed, the payer must deposit the full amount. Encode `deposit()` on the escrow contract — the function transfers the escrowed amount from the payer's wallet to the escrow contract.
2. Before depositing, the payer must approve the escrow contract address (not the factory) for the full escrow amount. Use `approve(escrowAddress, amount)` on the ERC-20 token.
3. The deposit can be made in one lump sum or in milestone-aligned portions (if the escrow was configured for milestone deposits). For milestone deposits, call `depositMilestone(milestoneIndex)` for each milestone as work progresses.
4. Submit via `wallet_sendTransaction`. The escrow contract emits a `Funded(amount)` or `MilestoneFunded(milestoneIndex, amount)` event.
5. The full escrow balance is visible via `getBalance()` on the escrow contract. Verify it matches the expected total: deposited amount equals the agreed escrow amount.

### Releasing Funds (Happy Path)
1. Funds are released when the payer or both parties agree the conditions are met. There are three release mechanisms:
   - **Payer Release**: The payer calls `releaseMilestone(milestoneIndex)` to release funds for a specific milestone to the payee.
   - **Mutual Release**: Both parties sign a release message. Either party can call `mutualRelease(milestoneIndex, payerSig, payeeSig)` which transfers the milestone amount to the payee.
   - **Timeout Release**: If the `timeoutBlock` is reached without a dispute, the payee can call `timeoutRelease()` to release all remaining funds to themselves (abandonment protection).
2. For milestone-based escrows, call `releaseMilestone(milestoneIndex)` once the payee has delivered the milestone deliverable. The payer manually approves each milestone.
3. For single-release escrows (one payment on completion), call `release()` to transfer the full amount to the payee.
4. Submit via `wallet_sendTransaction`. The escrow contract emits a `Released(payee, amount)` event and transfers the USDC.
5. After all funds are released, the escrow contract can be closed via `close()` to recover any remaining gas refunds. The contract is then read-only and no further actions are possible.

### Dispute Resolution
1. If either party disagrees about milestone completion, they initiate a dispute. Call `raiseDispute(milestoneIndex, reason)` on the escrow contract:
   - `milestoneIndex`: The disputed milestone
   - `reason`: A string or IPFS hash describing the dispute (e.g., "Deliverable does not meet the specification defined in the agreement")
2. Once a dispute is raised, the milestone's funds are locked — neither party can release them without the arbitrator. The `arbitratorFee` is also locked as the arbitrator's compensation.
3. The arbitrator reviews the dispute by examining the off-chain agreement (metadataURI), on-chain evidence, and any communications between parties. The arbitrator calls `resolveDispute(milestoneIndex, payeeShare, payerShare)` to split the locked funds:
   - `payeeShare`: Amount (in basis points, 0-10000) to pay the payee
   - `payerShare`: Amount to return to the payer
   - The arbitrator fee is deducted from the total: `(payeeShare + payerShare) * arbitratorFee / 10000`
4. Both parties must accept the arbitrator's resolution. The arbitrator fee is sent to the arbitrator address.
5. If the disputed milestone has other non-disputed milestones after it, they remain unaffected and can proceed normally.

### Refunds and Cancellation
1. If the agreement is cancelled before any funds are released, the payer can request a refund. Call `requestRefund()` on the escrow contract. The payee must either accept (`acceptRefund()`) or dispute.
2. Mutual refund: both parties sign a refund message and call `mutualRefund(payerSig, payeeSig)` to return all deposited funds to the payer.
3. Partial refund: for partially completed work, the payer can call `partialRefund(refundAmount)` to return a specified amount to themselves and release the remainder to the payee. This requires payee approval unless configured otherwise.
4. Abandonment: if the payee becomes unresponsive, the payer can wait until the `timeoutBlock` plus an additional cooling-off period, then call `abandonmentRefund()` to recover their funds. This is only available if the escrow was configured with this protection.
5. Submit refund transactions via `wallet_sendTransaction`. Present the net result: "Refund of 10,000 USDC accepted by both parties. Funds returned to payer 0x... Escrow #42 is now closed."

### Multi-Signature and DAO Escrows
1. For DAO treasury or multi-party escrows, the escrow can be configured with a multi-sig payer or multi-sig arbitrator. Use Escrow3's integration with Safe (Gnosis Safe) multi-sig wallets.
2. DAO escrows: the payer is a DAO treasury multi-sig, and releases require M-of-N DAO signers to approve. Each milestone release is a multi-sig proposal that signers confirm.
3. Community arbitration: instead of a single arbitrator, configure a panel of arbitrators (e.g., 3-of-5 arbitrators must agree on a dispute resolution). This distributes trust and reduces single-point-of-failure risk.
4. For high-value escrows, Escrow3 supports phased arbitration: minor disputes (<$5,000) go to a single arbitrator, major disputes (>$5,000) go to a panel, and maximum disputes (>$50,000) go to a bonded arbitration DAO.
5. Always check the arbitrator configuration before creating an escrow. Present the dispute resolution path: "Disputes under $5,000 resolved by Escrow3 Default Arbitrator. Disputes over $5,000 require a 3-of-5 arbitrator panel. The current arbitrator panel is: ..."
