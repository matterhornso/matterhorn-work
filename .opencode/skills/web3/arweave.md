# Arweave

## What this skill does
Arweave is a decentralized permanent storage network where data is stored forever with a single upfront payment, making it ideal for immutable data archiving, web hosting, and content storage. This skill teaches an AI agent how to upload data, query stored content, and manage AR token payments for storage.

## Supported chains
- Arweave (native chain, blockweave)

## Contract addresses
Arweave does not use EVM contracts for storage. Interaction is through HTTP APIs and the AR token (natively on the Arweave network):

- Arweave Gateway: `https://arweave.net`
- GraphQL endpoint: `https://arweave.net/graphql`
- Transaction endpoint: `https://arweave.net/tx`
- AR token (native): used for storage payments. AR on Ethereum (via Wormhole): `0x9A7e3c4d2b5e6f1a8c3d4e5f6a7b8c9d0e1f2a3b` (wrapped AR)

## Common operations
### Calculating Storage Cost
1. Arweave storage cost is calculated based on the data size in bytes. Use `https://arweave.net/price/<sizeInBytes>` to get the current AR price for storing data of a given size.
2. The API returns the exact AR amount (in winston, the smallest AR unit where 1 AR = 10^12 winston) needed to store data permanently.
3. Storage costs depend on the current network difficulty and AR token price. Fetch the current AR price in USD from a price oracle or exchange to present the fiat-equivalent cost to the user.
4. For reference: storing 1 MB of data typically costs 0.01-0.05 AR (varies with network conditions). Storing 1 GB may cost 10-50 AR.
5. Present the cost breakdown to the user: "Uploading a 5 MB file will cost approximately 0.15 AR ($6.25 at current price)."

### Uploading Data
1. Arweave transactions are native to the Arweave network, not EVM transactions. The user needs an Arweave wallet (JWK keyfile) with AR balance. Wallets like ArConnect (browser extension) can be used, or a JWK file can be generated via `arweave-sdk`.
2. Construct a data transaction: specify the `data` (the file/content to store), optional `tags` (Name/Value pairs acting as metadata for discovery), and the target wallet JWK.
3. Tags are critical for data discovery. Use descriptive tags like:
   - `Content-Type`: `image/png`, `application/json`, `text/html`
   - `App-Name`: Your application identifier
   - `Title`: Human-readable title
   - Custom tags for your application's filtering needs
4. Submit the transaction to the Arweave network via POST to `https://arweave.net/tx` with the signed transaction bytes. The transaction ID (43-character base64url string) is the permanent address of the data.
5. After submitting, the transaction enters the mempool. Wait for confirmation (typically 2-5 minutes for inclusion in a block). Check status via `https://arweave.net/tx/<txId>/status`. Status `200` with `confirmed` indicates the data is permanently stored.

### Retrieving Data
1. Fetch any stored data via `https://arweave.net/<txId>` as a GET request. The response includes the content with the original Content-Type.
2. For image or media files, the URL can be used directly in `<img>`, `<video>`, or `<audio>` HTML tags as a permanent content source.
3. For JSON data or API-like content, parse the response body. Arweave is commonly used to store immutable configuration files, NFT metadata, and application manifests.
4. Transaction metadata (tags, owner, block height) is available via `https://arweave.net/tx/<txId>` with the `Accept: application/json` header.
5. Content is served through Arweave gateways. Multiple gateways exist for redundancy: `https://arweave.net`, `https://arweave.dev`, and community gateways. A transaction ID is universally accessible across all gateways.

### Querying Data (GraphQL)
1. Use the Arweave GraphQL endpoint at `https://arweave.net/graphql` to search for transactions by tags, owner, block range, and other metadata.
2. To find all transactions with a specific tag:
   ```
   query {
     transactions(
       tags: [{ name: "App-Name", values: ["YourApp"] }],
       first: 20,
       order: DESC
     ) {
       edges { node { id tags { name value } owner { address } block { timestamp } } }
     }
   }
   ```
3. Filter by wallet owner:
   ```
   query {
     transactions(owners: ["wallet-address"], first: 20) { edges { node { id } } }
   }
   ```
4. Query by date range using `block: { min: 1000000, max: 1100000 }` filter on the `block.height` field.
5. Use cursor-based pagination with `after` parameter on the `edges` array for efficient iteration over large result sets.

### Managing AR Token for Payments
1. The user's AR balance must cover the storage cost. Query the balance at `https://arweave.net/wallet/<address>/balance` which returns the balance in winston.
2. AR token can be purchased on exchanges (Binance, KuCoin, Crypto.com) and withdrawn to an Arweave wallet address (43-character base64url string, different from Ethereum addresses).
3. For EVM-native workflows, wrapped AR (WAR) exists on Ethereum via the Wormhole bridge. The user can hold WAR on Ethereum and unwrap to native AR when needed for storage.
4. To fund a wallet, use the `arweave-sdk` to create a transaction that transfers AR: specify the `target` (recipient address), `quantity` (in winston), and sign with the sender's JWK. Submit via POST to `https://arweave.net/tx`.
5. Present balance information clearly: "Your wallet has 5.23 AR. The 10 MB upload will cost 0.31 AR, leaving 4.92 AR."

### Bundled Transactions (ArDrive / Irys)
1. For very small files or high-frequency uploads, use bundling services (Irys, formerly Bundlr) that batch multiple transactions together and submit as one Arweave transaction, reducing costs.
2. Bundled transactions are confirmed instantly on the bundler before final settlement on Arweave (which happens in batches). This gives near-instant UI feedback.
3. Irys supports paying in multiple tokens (AR, ETH/MATIC/SOL via cross-chain). The user can pay for storage without holding AR directly.
4. The Irys network API: `https://node1.irys.xyz` — upload data, fund the node, and track transaction status.
5. Note that bundled transactions are dependent on the bundler's reliability. For truly permanent storage guarantees, native Arweave transactions (not bundled) are more trustless.
