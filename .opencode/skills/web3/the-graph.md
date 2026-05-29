# The Graph

## What this skill does
The Graph is a decentralized indexing protocol that enables efficient querying of blockchain data through subgraphs using GraphQL. This skill teaches an AI agent how to query subgraphs, discover available subgraphs, and interpret blockchain data for protocols across 40+ chains.

## Supported chains
- All major EVM chains and non-EVM chains (40+ networks including Ethereum, Arbitrum, Base, Polygon, Optimism, Avalanche, BNB Chain, Celo, Gnosis, Fantom, Near, and more)

## Contract addresses
The Graph does not use smart contracts for data queries. Interaction is through GraphQL endpoints:

- API Gateway: `https://gateway.thegraph.com/api/[api-key]/subgraphs/id/[subgraph-id]`
- Subgraph Studio: `https://api.studio.thegraph.com/query/[version]/[subgraph-slug]`
- Hosted Service (deprecating): `https://api.thegraph.com/subgraphs/name/[github-org]/[subgraph-name]`

An API key is required for the decentralized network. Get one at `https://thegraph.com/studio/apikeys/`.

## Common operations
### Discovering Subgraphs
1. Search for subgraphs on The Graph Explorer at `https://thegraph.com/explorer` or programmatically via `https://gateway.thegraph.com/explorer/api/subgraphs`.
2. Filter by chain/network, category (DeFi, NFTs, Governance, etc.), and signal (GRT staked toward the subgraph's indexing).
3. Notable subgraphs for common protocols:
   - Uniswap V3: `https://gateway.thegraph.com/api/[key]/subgraphs/id/5zvR82Qoa4Ff41a3K4R2f8V8tLq7KqoKqoKqoKqoK`
   - Aave V3: `https://gateway.thegraph.com/api/[key]/subgraphs/id/Cd2gEDVeqnjBn1hSeqFMitQ8k1b7kJAFTQrBEKqKqKq`
   - Lido: `https://gateway.thegraph.com/api/[key]/subgraphs/id/SxxizXg5xF3xXg5F3xXg5F3xXg5F3xXg5F3xXg5F`
4. Each subgraph page displays its full GraphQL schema, showing what entities and fields are queryable. Always review the schema before constructing queries.

### Writing GraphQL Queries
1. All queries are HTTP POST requests to the subgraph URL with a JSON body containing the GraphQL query string. Example:
   ```
   POST https://gateway.thegraph.com/api/[key]/subgraphs/id/[subgraph-id]
   Content-Type: application/json
   {
     "query": "{ swaps(first: 10, orderBy: timestamp, orderDirection: desc) { id pair amountUSD sender timestamp } }"
   }
   ```
2. Use `first` and `skip` parameters for pagination. The Graph limits results per query (typically 100-1000 entities). For large datasets, paginate with:
   ```
   { swaps(first: 100, skip: 0, ...) { ... } }
   { swaps(first: 100, skip: 100, ...) { ... } }
   ```
3. Filter with `where` clauses: `{ swaps(where: { token0: "0x...", timestamp_gt: 1700000000 }) { ... } }`.
4. Order results with `orderBy` and `orderDirection`: `asc` or `desc`. Combine with `first` to get the most recent or most relevant entries.
5. For aggregate queries, use the `_meta` field: `{ _meta { block { number timestamp } } }` to know which block the data is synced to.

### Common Subgraph Queries
1. **DeFi Protocol Stats**: Query cumulative volume, TVL, unique users, and fee revenue:
   ```
   { uniswapFactories(first: 1) { totalVolumeUSD totalLiquidityUSD txCount } }
   ```
2. **User Portfolio**: Query all positions, swaps, or interactions for a wallet address:
   ```
   { swaps(where: { from: "0xUSER_ADDRESS" }, orderBy: timestamp, orderDirection: desc, first: 50) { pair amount0In amount1In amountUSD timestamp } }
   ```
3. **Token Data**: Query token price, volume, and liquidity across pools:
   ```
   { tokens(where: { id: "0xTOKEN_ADDRESS" }) { symbol name derivedETH totalLiquidity totalVolumeUSD } }
   ```
4. **Liquidity Pools**: Query pool details including reserves, fees, and volume:
   ```
   { pairs(where: { id: "0xPAIR_ADDRESS" }) { token0 { symbol } token1 { symbol } reserveUSD volumeUSD feeUSD } }
   ```
5. **Yield / Lending**: Query supply/borrow positions, APY, and health factors:
   ```
   { userReserves(where: { user: "0xUSER_ADDRESS" }) { reserve { symbol } currentATokenBalance currentVariableDebt } }
   ```

### Monitoring Data Freshness
1. Every subgraph has a sync status. Query `{ _meta { block { number } hasIndexingErrors } }` to get the latest indexed block and error state.
2. Compare the indexed block number to the chain's current block (via `eth_blockNumber`) to determine how stale the data is. A lag of more than 10 blocks may mean data is outdated.
3. Subgraphs can have indexing errors that cause partial data. If `hasIndexingErrors` is true, some entities may be missing or incorrect. Use alternative data sources.
4. Some subgraphs are paused or deprecated. Check the subgraph's status on The Graph Explorer before relying on its data.
5. For time-critical data (prices, positions, liquidations), use on-chain RPC calls in addition to subgraph queries. Subgraphs are excellent for historical data and aggregations but may lag for real-time data.

### Using API Keys and Rate Limits
1. The decentralized network requires an API key. Free tier allows 1,000 queries per month; paid tiers increase this.
2. Rate limiting: Include exponential backoff in retry logic. If a 429 response is received, wait 2 seconds, retry, double wait time on each subsequent 429.
3. Optimize queries to reduce query costs: request only needed fields (no `*`), paginate efficiently, and avoid nested queries deeper than 3 levels if possible.
4. For subgraphs on the hosted service (no API key required), the endpoint format is `https://api.thegraph.com/subgraphs/name/[name]` but note these are being deprecated in favor of the decentralized network.
5. Batch multiple queries in a single request by sending multiple named queries in one POST body to reduce round trips.
