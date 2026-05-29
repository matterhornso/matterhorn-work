# EigenLayer

## What this skill does
EigenLayer is an Ethereum restaking protocol that allows users to deposit liquid staking tokens (LSTs) to secure additional networks (AVSs) and earn additional yield. This skill teaches an AI agent how to deposit LSTs, delegate to operators, and manage restaking positions.

## Supported chains
- Ethereum

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum | StrategyManager | 0x858646372CC42E1A627fcE94aa0333A1039A5A97 |
| Ethereum | DelegationManager | 0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A |
| Ethereum | EigenPodManager | 0x91E677b94F4af38727a2f6E44Bd0b1f8a8b9f7d3 |
| Ethereum | RewardsCoordinator | 0x7750d328b314EfFa365A0402CcfD489B80B0D8Ef |
| Ethereum | StrategyBase (stETH) | 0x93c4b944D05dfe6ab7645A86cddD7845f2B9c1e2 |
| Ethereum | StrategyBase (rETH) | 0x1BeE69b7dFFfA4E2d53C2a2DF135C388AD25dcD2 |

## Common operations
### Depositing LSTs
1. Identify supported LSTs by querying `getSupportedTokens()` on the StrategyManager contract — this returns an array of LST token addresses currently accepted for restaking.
2. For the chosen LST, check the user's balance via `balanceOf(user)` and existing allowance via `allowance(user, strategyManagerAddress)`.
3. If allowance is insufficient, first submit an `approve(strategyManagerAddress, amount)` transaction on the LST token contract.
4. Encode `depositIntoStrategy(strategyAddress, tokenAddress, amount)` on the StrategyManager contract, where `strategyAddress` corresponds to the LST's associated strategy contract.
5. Submit via `wallet_sendTransaction`. Upon success, the user receives restaked shares representing their deposit. The strategy contract mints shares proportional to the underlying token amount.

### Delegating to an Operator
1. Query available operators from the EigenLayer API or directly from the DelegationManager's registered operator list.
2. Present operator details to the user: name, total restaked value, number of stakers, commission rate, and which AVSs the operator serves.
3. To delegate, encode `delegateTo(operatorAddress, approverSignatureAndExpiry, approverSalt)` on the DelegationManager contract. If the user is delegating for the first time, they must also submit an `approverSignature` — typically null for self-delegation.
4. Submit via `wallet_sendTransaction`. Delegation is all-or-nothing: all of the user's restaked positions are delegated to the chosen operator.
5. To undelegate, call `undelegate()` on the DelegationManager. Note that undelegation has a withdrawal delay (typically 7 days) before funds can be withdrawn.

### Withdrawing and Rewards
1. Before withdrawing, the user must undelegate if delegated. Wait for the escrow period to pass.
2. Encode `queueWithdrawal(strategyAddresses, shares)` on the StrategyManager to initiate the withdrawal process. This queues shares for withdrawal with a completion time.
3. After the withdrawal delay, call `completeQueuedWithdrawal(withdrawal, tokens, middlewareTimesIndex, receiveAsTokens)` to finalize and receive the underlying tokens. Pass `receiveAsTokens=true` to get LSTs back, or `false` to keep EigenLayer shares.
4. To claim AVS rewards, call `claimRewards()` on the RewardsCoordinator. Rewards accrue from the AVSs served by the user's delegated operator.
5. Check unclaimed rewards via `getUnclaimedRewards(user)` on the RewardsCoordinator before submitting the claim transaction.

### Native ETH Restaking (EigenPod)
1. For native ETH restaking (no liquid staking token), users interact with the EigenPodManager. Deploy a new EigenPod via `createPod()`.
2. Set the withdrawal credentials of a Beacon Chain validator to the EigenPod address to enable native restaking of that validator's 32 ETH.
3. Verify the EigenPod balance and validator status via `eigenPodManager.getPod(podOwner)` and the Beacon Chain API.
4. Native restaking cannot be delegated in the same way as LST restaking — the EigenPod itself serves as the restaking vehicle.
5. To withdraw from a native restaking position, call `withdrawBeforeRestaking()` on the EigenPod.
