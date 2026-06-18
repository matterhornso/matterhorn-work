# Market Official SDK Operator Artifacts

Use this guide when an operator wants to validate Hyperliquid and Polymarket
preview templates against official clients without giving Matterhorn custody or
live submission power.

## Safety Rules

- Run official SDK clients outside Matterhorn in an operator-owned throwaway
  testnet environment.
- Export only public/redacted JSON order or typed-data shapes.
- Never place seed phrases, private keys, API secrets, raw signatures, signed
  payloads, wallet exports, keyfiles, or real customer funds in the artifact
  directory.
- Matterhorn validates and hashes public artifacts only. It does not run private
  SDK signing, compute final signatures, or submit orders.
- Matterhorn does not run private SDK signing, compute final signatures, or submit orders.

## Directory Shape

Create a directory such as `/tmp/operator-public-artifacts` with:

```text
hyperliquid-official-public.json
polymarket-official-public.json
```

The checked example is:

```text
qa-fixtures/market-official-sdk/operator-owned-testnet-example/
```

## Hyperliquid Public Artifact

Export a public order action from the operator-owned `hyperliquid-python-sdk`
testnet run. Keep only:

- `type: "order"`
- `grouping`
- `orders[].a` asset index
- `orders[].b` side boolean
- `orders[].p` price string
- `orders[].s` size string
- `orders[].r` reduce-only boolean
- `orders[].t` order type
- optional `operatorRedaction` notes

Do not export nonce, connection id, signatures, API secrets, wallet material, or
submission envelopes.

## Polymarket Public Artifact

Export public EIP-712 order typed data from an operator-owned
`@polymarket/clob-client-v2` or `@polymarket/clob-client` Amoy run. Keep only:

- `domain.name`
- `domain.version`
- `domain.chainId`
- `domain.verifyingContract`
- `primaryType: "Order"`
- `types.Order`
- public `message` fields such as `makerAmount`, `takerAmount`, `side`, and
  `signatureType`
- optional `operatorRedaction` notes

Do not export API keys, wallet secrets, signatures, signed payloads, or exchange
submission responses.

## Validate The Public Artifacts

```bash
matterhorn-work crypto sdk-validate-public \
  --mode operator_owned_testnet \
  --input-dir /tmp/operator-public-artifacts \
  --output-dir /tmp/matterhorn-market-sdk-public-validation \
  --hyperliquid-network hyperliquid-testnet \
  --hyperliquid-package-version <hyperliquid-python-sdk-version> \
  --polymarket-network polygon-amoy \
  --polymarket-chain-id 80002 \
  --polymarket-exchange-address <public-amoy-exchange-address> \
  --polymarket-package-version <clob-client-version> \
  --strict --json
```

Expected outputs:

- `matterhorn-market-sdk-evidence.json`
- `matterhorn-market-sdk-public-validation.json`
- `matterhorn-market-sdk-public-validation.md`
- `matterhorn-market-sdk-public-validation.sha256`
- normalized Hyperliquid and Polymarket public artifacts

Attach these public/redacted outputs to the customer evidence bundle only after
the command exits successfully.

## Local Example Check

```bash
pnpm test:market-official-sdk-operator-artifacts
```

This test validates the checked operator-owned testnet example and proves the
example contains no credential-shaped fields.
