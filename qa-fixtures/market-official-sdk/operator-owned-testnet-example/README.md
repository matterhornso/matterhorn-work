# Operator-Owned Testnet Public Artifact Example

This directory models the public/redacted output an operator can export after
running Hyperliquid and Polymarket official clients in a throwaway testnet
environment.

Validate the example with:

```bash
matterhorn-work crypto sdk-validate-public \
  --mode operator_owned_testnet \
  --input-dir qa-fixtures/market-official-sdk/operator-owned-testnet-example \
  --output-dir /tmp/matterhorn-market-sdk-public-validation \
  --hyperliquid-network hyperliquid-testnet \
  --hyperliquid-package-version fixture-hyperliquid-python-sdk \
  --polymarket-network polygon-amoy \
  --polymarket-chain-id 80002 \
  --polymarket-exchange-address 0x0000000000000000000000000000000000000001 \
  --polymarket-package-version fixture-@polymarket/clob-client-v2 \
  --strict --json
```

The JSON files are public examples only. They must not contain private keys,
seed phrases, API secrets, raw signatures, signed payloads, wallet exports, or
real customer funds.
