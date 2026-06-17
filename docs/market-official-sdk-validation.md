# Market Official SDK Validation Track

Matterhorn Work currently supports Hyperliquid and Polymarket as read, preview, external-signer handoff, and public-receipt surfaces only. This validation track exists so future execution work cannot quietly treat Matterhorn's templates as final signed payloads.

## Scope

- Hyperliquid: validate the L1 order-action template against Hyperliquid's official SDK (`hyperliquid-python-sdk`) on testnet. Hyperliquid's docs list TypeScript SDKs as community SDKs, so they can provide supplemental parity evidence but not replace official Python SDK evidence.
- Polymarket: validate the EIP-712 order typed-data template against `@polymarket/clob-client-v2` / `@polymarket/clob-client` on Polygon Amoy or an official client fixture.
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
- Evidence file accepted by `node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path>`.
- Evidence captured with `node scripts/market-official-sdk-validation-capture.mjs --hyperliquid-normalized <redacted-action.json> --hyperliquid-package-version <version>`.

## Polymarket Validation Checklist

Validate with `@polymarket/clob-client-v2`, `@polymarket/clob-client`, or official CLOB client fixtures before any real-funds use:

- EIP-712 domain name, version, chain id, and verifying contract.
- `Order` type layout and field order.
- Maker/taker amount rounding, token id, side, fee rate, expiration, nonce, salt, maker, signer, and signature type.
- Outcome token handling for Yes/No markets.
- Compliance/geoblock behavior before preview/handoff.
- Confirmation that Matterhorn never fills wallet-owned fields, never signs, and never submits.

Evidence to save:

- `@polymarket/clob-client-v2` or `@polymarket/clob-client` version.
- Exchange address and chain id used for validation.
- Redacted Matterhorn typed-data template.
- Official-client normalized typed-data/order.
- Public receipt/status if an operator submits externally on testnet.
- Differences found and whether Matterhorn's template was corrected.
- Evidence file accepted by `node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path>`.
- Evidence captured with `node scripts/market-official-sdk-validation-capture.mjs --polymarket-normalized <redacted-typed-data.json> --polymarket-package-version <version>`.

## Evidence JSON Contract

Matterhorn records only redacted official-client/testnet evidence. The evidence must use:

```json
{
  "version": "matterhorn.market.official-sdk-validation.v1",
  "safety": {
    "nonCustodial": true,
    "liveSubmissionEnabled": false,
    "asksForSecrets": false,
    "storesSecrets": false
  },
  "venues": [
    {
      "venue": "hyperliquid",
      "officialClient": { "name": "hyperliquid-python-sdk" },
      "matterhornTemplate": {
        "requiresClientValidation": true,
        "canSubmit": false,
        "externalSignerOnly": true,
        "clientMustCompute": ["nonce", "connectionId", "signature"]
      }
    },
    {
      "venue": "polymarket",
      "officialClient": { "name": "@polymarket/clob-client-v2" },
      "matterhornTemplate": {
        "requiresClientValidation": true,
        "canSubmit": false,
        "externalSignerOnly": true,
        "walletMustSet": ["maker", "signer", "salt", "nonce", "expiration"]
      }
    }
  ]
}
```

The validator rejects credential-shaped fields such as `seed`, `privateKey`, `apiSecret`, `signature`, `rawSignature`, and `signedPayload`. Polymarket's public `signatureType` metadata is allowed because it is not a signature.

## Redacted Capture Harness

Operators can turn official-client output into Matterhorn evidence without
installing official SDKs inside Matterhorn or sharing any credentials with
Matterhorn:

```bash
node scripts/market-official-sdk-validation-capture.mjs \
  --hyperliquid-normalized /tmp/hyperliquid-official-normalized-action.json \
  --hyperliquid-package-version <hyperliquid-python-sdk-version> \
  --polymarket-normalized /tmp/polymarket-official-normalized-typed-data.json \
  --polymarket-package-version <clob-client-version> \
  --polymarket-exchange-address <public-exchange-address> \
  --polymarket-chain-id <chain-id> \
  --output /tmp/matterhorn-market-sdk-evidence.json
```

The normalized files must be redacted, public JSON from an operator-owned
testnet/fixture run. The capture harness records public hashes and normalized
content, validates the evidence contract, and rejects credential-shaped fields
such as raw signatures, private keys, API secrets, signed payloads, and wallet
exports. It does not execute official SDK code, sign orders, submit orders, or
authorize live execution.

## Local Gate

Run:

```bash
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-evidence
pnpm test:market-official-sdk-validation-capture
pnpm test:market-customer-evidence-bundle
node scripts/market-official-sdk-validation-evidence.mjs --sample --json
node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path> --json
node scripts/market-official-sdk-validation-capture.mjs --json
node scripts/market-customer-evidence-bundle.mjs --customer-ready-smoke <smoke.json> --official-sdk-validation <sdk-evidence.json> --output <bundle.md> --json-output <bundle.json>
```

This gate does not perform live SDK submission. It verifies that the source code and docs still require official SDK validation, preserve `requiresClientValidation: true`, preserve `canSubmit: false`, and do not introduce submit routes or secret-bearing schemas. The evidence validator lets an operator attach public, redacted official-client/testnet evidence later without importing keys or secrets into Matterhorn.

Sources: Hyperliquid API docs (`hyperliquid-python-sdk`, testnet URL), Polymarket trading overview (`@polymarket/clob-client-v2`, EIP-712 orders, API credential separation).
