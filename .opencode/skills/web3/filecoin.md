# Filecoin

## What this skill does
Filecoin is a decentralized storage network where users pay storage providers to store data with cryptographic proofs ensuring data integrity, creating a verifiable marketplace for storage. This skill teaches an AI agent how to store data, check storage deals, and interact with Filecoin's storage marketplace.

## Supported chains
- Filecoin (native network)

## Contract addresses
Filecoin operates on its own blockchain, not EVM-based (though it has an FEVM layer for EVM compatibility). Key endpoints:

- Lotus Node API: `https://api.node.glif.io/rpc/v1` (public endpoint)
- Filecoin API: Standard JSON-RPC at the Lotus node endpoint
- FIL Token: Native token for gas and storage payments
- Wrapped FIL on Ethereum: `0x0Ae38f7E10A43B5b2fB064B4B5b5b5b5b5b5b5` (various bridge implementations available)
- Filecoin deal tracking: `https://filfox.info` or CID check via `https://cid.contact`

## Common operations
### Understanding Filecoin Storage Deals
1. A storage deal is a contractual agreement between a client (data owner) and a storage provider (miner). The client pays FIL, and the miner stores data for an agreed duration, proving storage continuously via Proofs of Spacetime (PoSt).
2. Deal parameters: `pieceSize` (padded to the next power of 2), `duration` (in epochs, where 1 epoch = 30 seconds, typically 180-540 days), `storagePricePerEpoch` (in attoFIL = 10^-18 FIL), `providerCollateral`, and `clientCollateral`.
3. Storage pricing: providers set their asking price. Query `https://api.filecoin.io/v1/storage/ask/<providerAddress>` to get a specific provider's rates. Typical costs are $0.01-0.05/GB/month at current FIL prices.
4. Data is stored as a "deal" on-chain. Once the deal is active, the provider must submit WindowPoSt proofs every 24 hours proving data is still stored. If proofs fail, the provider is slashed (loses collateral).
5. Present storage costs clearly: "Storing a 10 GB file for 180 days with Provider f01234 will cost approximately 2.5 FIL ($12.50 at current price)."

### Storing Data via Lotus API
1. Use the Lotus JSON-RPC API to interact with the Filecoin network. The public endpoint `https://api.node.glif.io/rpc/v1` (or a local Lotus node) provides full network access.
2. Prepare the data by creating a CAR (Content Addressable Archive) file. Generate the CAR file from the data payload, compute the CommP (Piece Commitment), and the data CID (Content Identifier).
3. Find storage providers via `Filecoin.StateListMiners` to get active miners, then `Filecoin.ClientQueryAsk` for each miner to get their storage price, minimum deal size, and maximum duration.
4. To make a deal, call `Filecoin.ClientStartDeal` with the deal proposal: `Data` (the CAR file or data ref), `Wallet` (client address), `Miner` (provider address), `EpochPrice`, `MinBlocksDuration`, `ProviderCollateral`, `VerifiedDeal` (whether using Filecoin Plus verified data), and `FastRetrieval` (whether the provider should keep an unsealed copy for fast access).
5. Submit the deal. The deal ID is returned and can be tracked. The deal goes through states: `Unknown`, `WaitingForData`, `Transferring`, `VerifyingDeal`, `ProposalAccepted`, `Active` (storage confirmed), `Expired`, `Slashed`.

### Monitoring Storage Deals
1. Check deal status via `Filecoin.ClientGetDealInfo(dealId)` which returns the deal metadata, provider, state, and duration.
2. Query deal state via `Filecoin.ClientListDeals` to get all deals for the client wallet, including active, expired, and pending deals.
3. Verify data integrity: query the deal's `PieceCID` periodically and verify it matches the original data's CommP. Providers submit proofs daily; failed proofs are visible in the deal state.
4. Check expiration status via the deal's `EndEpoch` relative to the current chain height (`Filecoin.ChainHead`). Before the deal expires, the user should retrieve the data (see retrieval below) or extend the deal.
5. Deal renewal: Call `Filecoin.ClientStartDeal` for the same data CID to extend storage with the same or a different provider. Start renewal at least 1-2 weeks before the current deal expires.

### Retrieving Data
1. Query the data CID via the Filecoin retrieval market. Use `Filecoin.ClientRetrieve` with the `Data` (CID), `PieceCID`, and `Miner` address.
2. Retrieval pricing: most providers offer free or very low-cost retrieval for deals they're actively storing. Paid retrieval is negotiated off-chain between client and provider.
3. For fast retrieval-enabled deals, the provider keeps an unsealed copy of the data and can serve it immediately. Non-fast-retrieval deals require the provider to unseal the sector first (hours to days).
4. Alternative: use third-party gateways (nft.storage, web3.storage, lighthouse.storage) that provide HTTP access to Filecoin-stored data via IPFS gateways with caching layers.
5. Check if data is available via a gateway at `https://<cid>.ipfs.w3s.link` or `https://ipfs.io/ipfs/<cid>` for IPFS-accessible content that's also stored on Filecoin.

### Working with FEVM (Filecoin EVM)
1. The Filecoin EVM (FEVM) allows deploying EVM-compatible smart contracts on the Filecoin network with FIL as the native gas token.
2. FEVM contract addresses use standard Ethereum address format (0x...) deployed on Filecoin chain ID 314. Use `eth_call` and `eth_sendRawTransaction` through a Filecoin RPC endpoint (e.g., `https://api.node.glif.io/rpc/v1`).
3. FEVM enables smart contracts that programmatically manage Filecoin storage deals, data onboarding, and storage provider interactions.
4. Key FEVM contracts include the DataCap contract (for Filecoin Plus verified data allocation), the Storage Market Actor, and Miner Actor proxies.
5. For agents, this means Filecoin storage deals can be created, managed, and automated entirely through Solidity contracts on FEVM, enabling programmable storage workflows.

### Filecoin Plus (Verified Data)
1. Filecoin Plus (Fil+) is a program that allocates DataCap to clients storing valuable/verified data. DataCap multiplies a storage provider's quality adjusted power by 10x, incentivizing them to accept Fil+ deals at lower prices.
2. To get DataCap, apply to a Fil+ allocator (governed by community). DataCap is allocated to client addresses on-chain and can be spent on verified deals.
3. Check the client's DataCap balance via the Filecoin state at the client's address. Verified deals use DataCap instead of paying in FIL, though providers still expect some FIL payment.
4. Verified deals are tracked on-chain with the `VerifiedDeal` flag set to true in the deal proposal. Providers earn more block rewards from Fil+ deals, so they often accept them at below-market FIL rates or even for free.
5. For agents managing storage: if the user has DataCap, prioritize Fil+ verified deals for the best rates. Without DataCap, the agent should present the paid storage deal cost.
