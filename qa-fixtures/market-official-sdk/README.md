# Market Official SDK Validation Fixtures

These fixtures exercise Matterhorn's official SDK validation evidence flow
without running official clients, signing orders, submitting orders, or touching
real funds.

Use them to verify the capture and evidence pipeline:

```bash
pnpm test:market-official-sdk-validation-fixtures
```

The valid fixtures model the public, redacted JSON shape an operator should
export from official-client/testnet validation:

- `hyperliquid-normalized-action.fixture.json`: public Hyperliquid order-action
  normalization from `hyperliquid-python-sdk` style output.
- `polymarket-normalized-typed-data.fixture.json`: public Polymarket EIP-712
  order typed-data normalization from `@polymarket/clob-client-v2` or
  `@polymarket/clob-client` style output.

The negative fixtures are intentionally invalid:

- `hyperliquid-forbidden-raw-signature.fixture.json` proves raw signatures are
  rejected.
- `polymarket-mismatched-domain.fixture.json` proves the declared chain/exchange
  evidence must match the normalized EIP-712 domain.

Do not add private keys, seed phrases, API secrets, raw signatures, signed
payloads, or wallet exports to this directory.
