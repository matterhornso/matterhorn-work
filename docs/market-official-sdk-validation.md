# Market Official SDK Validation Track

Matterhorn Work currently supports Hyperliquid and Polymarket as read, preview, external-signer handoff, and public-receipt surfaces only. This validation track exists so future execution work cannot quietly treat Matterhorn's templates as final signed payloads.

## Scope

- Hyperliquid: validate the L1 order-action template against Hyperliquid's official SDK on testnet.
- Polymarket: validate the EIP-712 order typed-data template against `@polymarket/clob-client` on a testnet or official client fixture.
- Bittensor remains separate: Bittensor uses Subtensor/SDK read and unsigned-preview flows, with signing outside Matterhorn.

## Non-Negotiable Rules

- Matterhorn must not ask for, store, log, transmit, or import seed phrases, private keys, API secrets, wallet exports, raw signatures, signed payloads, or signed extrinsics.
- Matterhorn must not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`.
- Market previews and handoffs must keep `canSubmit: false` and `externalSignerOnly: true` where a handoff exists.
- Template payloads must keep `requiresClientValidation: true` until official SDK validation evidence is attached.
- Testnet validation must happen outside Matterhorn's server process with an operator-owned wallet/client. Matterhorn records public evidence only.

## Hyperliquid Validation Checklist

Validate with Hyperliquid's official SDK or official signing docs before any real-funds use:

- Asset index mapping for the selected market.
- L1 order-action shape: `type`, `orders`, `a`, `b`, `p`, `s`, `r`, `t.limit.tif`, and `grouping`.
- Price and size rounding/tick behavior.
- Agent EIP-712 domain: `Exchange`, version `1`, chain id `1337`, zero verifying contract.
- `connectionId` computation from msgpack action hash over action, nonce, and vault.
- Nonce construction and SDK submission format.
- Confirmation that Matterhorn never computes the final `connectionId`, never signs, and never submits.

Evidence to save:

- SDK/package version.
- Testnet or fixture environment.
- Redacted action template.
- Official-client normalized action.
- Public receipt/status if an operator submits externally on testnet.
- Differences found and whether Matterhorn's template was corrected.

## Polymarket Validation Checklist

Validate with `@polymarket/clob-client` or official CLOB client fixtures before any real-funds use:

- EIP-712 domain name, version, chain id, and verifying contract.
- `Order` type layout and field order.
- Maker/taker amount rounding, token id, side, fee rate, expiration, nonce, salt, maker, signer, and signature type.
- Outcome token handling for Yes/No markets.
- Compliance/geoblock behavior before preview/handoff.
- Confirmation that Matterhorn never fills wallet-owned fields, never signs, and never submits.

Evidence to save:

- `@polymarket/clob-client` version.
- Exchange address and chain id used for validation.
- Redacted Matterhorn typed-data template.
- Official-client normalized typed-data/order.
- Public receipt/status if an operator submits externally on testnet.
- Differences found and whether Matterhorn's template was corrected.

## Local Gate

Run:

```bash
pnpm test:market-official-sdk-validation-track
```

This gate does not perform live SDK submission. It verifies that the source code and docs still require official SDK validation, preserve `requiresClientValidation: true`, preserve `canSubmit: false`, and do not introduce submit routes or secret-bearing schemas.
