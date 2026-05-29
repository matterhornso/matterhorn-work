# Livepeer

## What this skill does
Livepeer is a decentralized video transcoding network that enables cost-effective video streaming by distributing transcoding tasks across a network of node operators. This skill teaches an AI agent how to manage transcoding jobs, query network statistics, and interact with Livepeer's infrastructure.

## Supported chains
- Ethereum
- Arbitrum

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum | BondingManager | 0x35Bcf3c30594198D57431B4e4bAe0B8b9F08e6b1 |
| Ethereum | Controller | 0xf96d54E490317c036A8a61D482A9b5e2bD3F4D3A |
| Ethereum | LivepeerToken (LPT) | 0x58b6A8A3302369DAEC383334672404Ee733aB239 |
| Arbitrum | BondingManager | 0x35Bcf3c30594198D57431B4e4bAe0B8b9F08e6b1 |
| Arbitrum | LivepeerToken (LPT) | 0x289bA1701C2F088cf0faf8B370bD6334D7E6C2FC |

## Common operations
### Understanding Livepeer's Role
1. Livepeer provides decentralized video transcoding — converting raw video into multiple bitrates and formats (HLS, MP4) for adaptive bitrate streaming (ABR).
2. Orchestrators run transcoding nodes, stake LPT, and earn fees from broadcasters who pay for transcoding. The BondingManager contract manages stake and delegation.
3. Broadcasters submit video transcoding jobs to Orchestrators via the Livepeer API. They pay in ETH (on Ethereum) or LPT depending on the payment model.
4. Delegators stake their LPT to Orchestrators to earn a share of transcoding fees. This is the primary way for passive participants to earn yield from the network.
5. The Livepeer API (and studio.livepeer.com) abstracts most of the transcoding complexity, providing a RESTful interface for video upload, transcoding, playback, and webhook notifications.

### Transcoding a Video via the Livepeer API
1. The Livepeer Studio API at `https://livepeer.studio/api` is the primary interface for broadcasters. An API key is required — register at livepeer.studio.
2. Upload a video for transcoding via POST `/asset/import` with the source video URL. The API returns an `assetId` and starts ingestion.
3. The transcoding pipeline automatically generates multiple renditions (240p, 360p, 480p, 720p, 1080p, and higher) with HLS packaging for adaptive bitrate streaming.
4. Check asset status via GET `/asset/<assetId>` — the status progresses through `waiting`, `processing`, `ready`, or `failed`. When `ready`, the playback URL is available.
5. Retrieve the playback URL from the `playbackUrl` field for HLS streaming, or the `downloadUrl` for direct MP4 downloads. Present the available renditions to the user.
6. For live streaming, use POST `/stream` to create a new stream. The API returns a `streamKey` to configure in the broadcaster's OBS/streaming software. Viewers consume the stream via the `playbackUrl`.

### Webhooks and Automation
1. Configure webhooks in the Livepeer Studio dashboard to receive notifications on asset status changes. Events include `asset.created`, `asset.ready`, `asset.failed`, `stream.started`, `stream.idle`.
2. The webhook payload includes the `assetId`, `playbackUrl`, and `status` fields. Use this to automate downstream workflows (e.g., storing the playback URL in a database, notifying users when a video is ready).
3. For AI agents, set up a webhook listener to trigger actions when transcoding completes — e.g., pin the output to IPFS, post to social media, or index the video in a content system.
4. Error handling: if `asset.failed`, the webhook includes an error reason. Common issues include unsupported codecs, corrupt source files, or excessive file sizes.
5. Rate limits apply based on the Livepeer Studio plan tier. Check the `X-RateLimit-Remaining` header on API responses to avoid 429 errors.

### Querying Orchestrator and Delegation Data
1. Query the current round and network statistics via the BondingManager: `currentRound()`, `getTotalBonded()`, and `getTranscoderPoolSize()`.
2. List active Orchestrators by calling `getTranscoders()` or fetching from the Livepeer subgraph on The Graph. Each Orchestrator has a `rewardCut` (fee percentage), `feeShare` (fee split with delegators), and `totalStake`.
3. For a specific Orchestrator, query `getTranscoder(orchAddress)` to read `rewardCut`, `feeShare`, `totalStake`, `delegatedStake`, and the activation/deactivation rounds.
4. To check a delegator's stake, call `getDelegator(delAddress)` which returns `bondedAmount`, `delegateAddress` (the Orchestrator), and `unbondingLocks`. Unbonding has a 7-round waiting period.
5. Calculate projected yield: `(projectedAnnualFees * rewardCut * feeShare) / totalStake` for a rough APY estimate. Actual returns vary widely based on network usage.

### Staking and Delegating LPT
1. To become a delegator, the user must hold LPT tokens. Acquire LPT on Uniswap or other DEXs (Ethereum mainnet or Arbitrum).
2. Approve the BondingManager to spend LPT, then encode `bond(amount, delegateAddress)` on the BondingManager contract. The `delegateAddress` is the Orchestrator to delegate stake to.
3. Submit via `wallet_sendTransaction`. The bonded LPT is locked and starts earning rewards from the next round.
4. To switch Orchestrators, use `rebond(unbondingLockId)` after the unbonding period, or call `bond` with a new delegate if no unbonding is pending.
5. To unbond, call `unbond(amount)`. The LPT enters a 7-round (approximately 7-day) unbonding period. After the period, call `withdrawStake(unbondingLockId)` to receive the LPT back.
6. Claim rewards with `claimEarnings(endRound)` — rewards accrue each round and are paid in ETH (on Ethereum) or LPT. Check pending rewards via `pendingStake(delegatorAddress)` and `pendingFees(delegatorAddress)`.
