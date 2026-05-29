# Helium

## What this skill does
Helium is a DePIN (Decentralized Physical Infrastructure Network) for wireless connectivity, deploying community-owned hotspot networks for IoT (LoRaWAN) and 5G mobile coverage. This skill teaches an AI agent how to check network coverage, manage hotspots, and query Helium network data.

## Supported chains
- Solana (Helium migrated from its own Layer 1 to Solana)

## Contract addresses
Helium uses Solana programs, not traditional EVM contracts. Key program addresses:

- Helium DAO: Decentralized governance for network parameters
- MOBILE Token (Solana): `mb1eu7TzEc71KxDpsmsKoucSSuuo5v1QGbhqKjqK`
- IOT Token (Solana): `iotEVVZLEywoTn1QdwRNdddrLk9GkGmQjqKjqK`
- HNT Token (Solana): `hntyVP6YFm1Hg25TN9WGLqM12b8TQmcjqKjqK`
- Maker API: `https://maker.helium.com`
- Helium API: `https://api.helium.io`

## Common operations
### Checking Network Coverage
1. Use the Helium Mappers API to check if a location has coverage. Send coordinates (latitude, longitude) to the Hex Coverage endpoint to get the coverage status.
2. For IoT (LoRaWAN) coverage, query the Helium API for hotspot density in a given hex. Hex resolution levels correspond to different cell sizes (H8 = ~0.74 km, H10 = ~15 m).
3. For 5G mobile coverage, use the MOBILE subnetwork's coverage mapper. Mobile coverage requires 5G-compatible hotspots (FreedomFi, Bobber 500) with CBRS or WiFi radios.
4. Present coverage data clearly: "This location (37.7749, -122.4194) has 14 IoT hotspots within range and 3 active 5G radios within 1 km."
5. Coverage gaps can be identified by querying hexes with zero hotspots. This data helps users decide where to deploy new hotspots for optimal earnings.

### Hotspot Management
1. Look up a hotspot by its 3-word animal name (e.g., "curly-crimson-hummingbird") or by its Solana address. Query `https://api.helium.io/v1/hotspots/<address>` for hotspot details.
2. Hotspot data includes: `name`, `owner`, `location` (coordinates, hex), `gain` (antenna dBi), `elevation`, `status` (online/offline), `last_poc_challenge`, and reward scale.
3. To check hotspot earnings, query the rewards endpoint: `https://api.helium.io/v1/hotspots/<address>/rewards/sum` with filters for `min_time` and `max_time` to get total HNT/MOBILE/IOT earned in a time period.
4. Hotspot status: `online` means the hotspot is actively earning and submitting Proof-of-Coverage challenges. `offline` means it has not reported recently — check power, internet connection, and antenna.
5. Reward scaling: each hotspot has a `reward_scale` (0.0 to 1.0) that reduces earnings in oversaturated areas. A scale of 0.5 means the hotspot earns 50% of baseline rewards for its activity.

### Understanding Token Economics
1. Helium operates three tokens: **HNT** (governance and network rewards), **MOBILE** (5G subnetwork rewards), and **IOT** (IoT/LoRaWAN subnetwork rewards).
2. Hotspots earn the subnet-specific token (MOBILE or IOT) for providing coverage and participating in Proof-of-Coverage. These can be redeemed for HNT through the network's treasury.
3. Check current token prices via any Solana DEX aggregator (Jupiter) for HNT, MOBILE, and IOT on Solana. HNT is also listed on major exchanges (Coinbase, Binance).
4. Data Credits (DCs) are the payment mechanism for using the network. Devices burn DCs (purchased by burning HNT or subnetwork tokens) to send data. Users don't directly interact with DCs — the service provider handles this.
5. MOBILE and IOT tokens have a redemption rate to HNT set by governance. Query the current treasury redemption rates to understand the conversion ratio.

### Deploying and Onboarding Hotspots
1. Acquire a Helium-compatible hotspot (Bobcat, SenseCAP, RAK, Nebra for IoT; FreedomFi, Bobber 500 for 5G).
2. Onboarding requires an onboarding fee paid in DCs (burned by the manufacturer or a third-party onboarding service). Use the Maker app or Helium Wallet to complete location assertion.
3. Location assertion (GPS coordinates) is submitted on-chain. The hotspot must periodically prove its location via Proof-of-Coverage (PoC) beacons with neighboring hotspots.
4. After onboarding, the hotspot appears in the network within minutes. Use `https://api.helium.io/v1/hotspots/<address>` to confirm the hotspot is registered with the correct metadata.
5. Antenna setup is critical for earnings — higher placement, clear line of sight, and appropriate antenna gain improve witness counts and PoC participation.

### Querying Network Statistics
1. Current network stats via `https://api.helium.io/v1/stats`: total hotspots online, total HNT mined in the last 24h/30d, number of cities, countries, and data credits spent.
2. For a specific hotspot's recent activity, query `https://api.helium.io/v1/hotspots/<address>/activity` to see PoC challenges, data transfer events, and beacon witnesses.
3. Check the current reward epoch via `/v1/rewards/current` to see how rewards are distributed across PoC, data transfer, and other activities.
4. For 5G-specific stats, query the MOBILE subnetwork's oracle to get the latest reward distribution parameters and network usage metrics.
5. Oracles feed on-chain data about hotspot activity and coverage. Query the Helium oracle program on Solana for the latest verified hotspot metrics.
