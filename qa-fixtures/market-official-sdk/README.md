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
- `polymarket-normalized-typed-data.fixture.json`: public Polymarket CLOB V2
  order typed-data normalization from `@polymarket/clob-client-v2` or
  `py-clob-client-v2` style output. Legacy V1 output is not accepted.

The negative fixtures are intentionally invalid:

- `hyperliquid-forbidden-raw-signature.fixture.json` proves raw signatures are
  rejected.
- `polymarket-mismatched-domain.fixture.json` proves the declared chain/exchange
  evidence must match the normalized EIP-712 domain.
- `polymarket-legacy-v1.fixture.json` proves retired CLOB V1 domain and signed
  fields cannot be used to certify a CLOB V2 release.

The `operator-owned-testnet-example` directory contains public/redacted example
artifacts named `hyperliquid-official-public.json` and
`polymarket-official-public.json`. Use it with
`pnpm test:market-official-sdk-operator-artifacts` to prove the
`operator_owned_testnet` import path without running official clients, signing,
or submitting orders.

Do not add private keys, seed phrases, API secrets, raw signatures, signed
payloads, or wallet exports to this directory.
