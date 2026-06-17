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
- Official-client normalized action with public order-action fields: `type: "order"`, `grouping`, `orders[].a`, `orders[].b`, `orders[].p`, `orders[].s`, `orders[].r`, and `orders[].t`.
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
- Official-client normalized typed-data/order with public fields: `domain.chainId`, `domain.verifyingContract`, `primaryType: "Order"`, `types.Order`, `message.makerAmount`, `message.takerAmount`, and `message.signatureType`.
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

For `status: "validated"` evidence, the validator also checks the normalized
official-client artifact itself. Hyperliquid artifacts must be public order
actions, not cancel/submit envelopes or signature-bearing exchange payloads.
Polymarket artifacts must expose the public EIP-712 order structure and the
declared `domain.chainId` / `domain.verifyingContract` must match the evidence
environment. This is intentionally stricter than the pending sample bundle:
pending evidence can document the validation plan, but validated evidence must
prove the SDK-normalized public shape.

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

## Validation Doctor

Before running official SDK clients or importing captured artifacts, run the
doctor against the operator environment:

```bash
export MARKET_OFFICIAL_SDK_VALIDATION_MODE=operator_owned_testnet
export HYPERLIQUID_VALIDATION_NETWORK=hyperliquid-testnet
export HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION=<hyperliquid-python-sdk-version>
export POLYMARKET_VALIDATION_NETWORK=polygon-amoy
export POLYMARKET_CHAIN_ID=80002
export POLYMARKET_EXCHANGE_ADDRESS=<public-amoy-exchange-address>
export POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION=<clob-client-version>

node scripts/market-official-sdk-validation-doctor.mjs --strict --json
```

The doctor checks public validation metadata and rejects market-scoped
credential-shaped environment keys such as `HYPERLIQUID_PRIVATE_KEY`,
`POLYMARKET_API_SECRET`, wallet exports, raw signatures, and signed payloads. It
does not print secret values, import official SDK packages, sign, submit,
broadcast, or call remote endpoints. A strict run is considered ready only when:

- validation mode is `operator_owned_testnet`, `operator_owned_fixture`, or
  `fixture`;
- Hyperliquid points at testnet or fixture evidence and declares the official
  SDK package version;
- Polymarket points at Polygon Amoy or fixture evidence, declares chain id
  `80002`, declares the public exchange address, and declares the official CLOB
  package version; and
- no market-scoped credential-shaped env keys are present in the process
  environment.

## Operator-Owned Normalization

Official SDKs should run in an operator-owned throwaway environment, not inside
the Matterhorn server. Export only public official-client JSON, then normalize it
into the artifact shape accepted by the capture harness:

```bash
node scripts/market-official-sdk-normalize.mjs \
  --venue hyperliquid \
  --input /tmp/operator-hyperliquid-official-client-public.json \
  --output /tmp/hyperliquid-official-normalized-action.json

node scripts/market-official-sdk-normalize.mjs \
  --venue polymarket \
  --input /tmp/operator-polymarket-official-client-public.json \
  --output /tmp/polymarket-official-normalized-typed-data.json
```

The normalizer accepts public/redacted JSON only. It rejects credential-shaped
fields such as `privateKey`, `apiSecret`, `rawSignature`, `signature`, and
`signedPayload`, except Polymarket's public `signatureType` metadata. It does not
import official SDK packages, run exchange clients, sign, submit, broadcast, or
call remote endpoints. It only extracts public order/action fields:

- Hyperliquid: `type`, `grouping`, `orders[].a`, `orders[].b`, `orders[].p`,
  `orders[].s`, `orders[].r`, and `orders[].t`.
- Polymarket: `domain`, `primaryType`, `types.Order`, and public `message`
  fields such as `makerAmount`, `takerAmount`, `side`, and `signatureType`.

Then capture the normalized artifacts:

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

## One-Command Operator Loop

For a copy-pasteable offline rehearsal, run the fixture-backed loop:

```bash
matterhorn-work crypto sdk-loop \
  --fixture \
  --output-dir /tmp/matterhorn-market-sdk-loop \
  --json
```

For real operator-owned public artifacts, run:

```bash
matterhorn-work crypto sdk-loop \
  --hyperliquid-official-public /tmp/operator-hyperliquid-official-client-public.json \
  --polymarket-official-public /tmp/operator-polymarket-official-client-public.json \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --output-dir /tmp/matterhorn-market-sdk-loop \
  --json
```

The loop runs the validation doctor, normalizes public artifacts, captures
official SDK evidence, and optionally writes a customer evidence bundle. It does
not run official SDK packages, sign, submit, broadcast, call exchanges, or accept
secret-bearing artifacts.

Every run writes `matterhorn-market-sdk-operator-summary.md` in the output
directory. Hand that Markdown file to Hermes or a customer reviewer first; it
summarizes readiness, safety invariants, doctor checks, venue validation status,
and generated evidence paths without including signatures, payload secrets, API
keys, seed phrases, or wallet exports.

The lower-level script remains available for debugging:
`node scripts/market-official-sdk-operator-loop.mjs`.

## Fixture-Backed Operator Loop

Before running real official clients, use the checked-in fixtures to verify the
entire Matterhorn evidence path:

```bash
pnpm test:market-official-sdk-validation-fixtures
```

The fixture gate:

- captures validated evidence from
  `qa-fixtures/market-official-sdk/hyperliquid-normalized-action.fixture.json`
  and
  `qa-fixtures/market-official-sdk/polymarket-normalized-typed-data.fixture.json`;
- proves the evidence validator accepts the capture output wrapper and the raw
  evidence object;
- builds a strict customer evidence bundle with
  `--require-official-sdk-validated`;
- proves `hyperliquid-forbidden-raw-signature.fixture.json` is rejected; and
- proves `polymarket-mismatched-domain.fixture.json` is rejected when the
  normalized EIP-712 domain does not match the declared chain/exchange evidence.

When replacing fixtures with real operator-owned testnet output, preserve the
same public JSON shape and keep all wallet-owned signing material outside
Matterhorn. The files should contain normalized order/action fields only, never
private keys, API secrets, raw signatures, signed payloads, or wallet exports.

## Local Gate

Run:

```bash
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-evidence
pnpm test:market-official-sdk-validation-capture
pnpm test:market-official-sdk-validation-doctor
pnpm test:market-official-sdk-normalize
pnpm test:market-official-sdk-operator-loop
pnpm test:market-official-sdk-validation-fixtures
pnpm test:market-customer-evidence-bundle
node scripts/market-official-sdk-validation-doctor.mjs --strict --json
node scripts/market-official-sdk-normalize.mjs --venue hyperliquid --input qa-fixtures/market-official-sdk/hyperliquid-normalized-action.fixture.json --json
node scripts/market-official-sdk-normalize.mjs --venue polymarket --input qa-fixtures/market-official-sdk/polymarket-normalized-typed-data.fixture.json --json
node scripts/market-official-sdk-operator-loop.mjs --fixture --output-dir /tmp/matterhorn-market-sdk-loop --json
node scripts/market-official-sdk-validation-evidence.mjs --sample --json
node scripts/market-official-sdk-validation-evidence.mjs --evidence-file <path> --json
node scripts/market-official-sdk-validation-capture.mjs --json
matterhorn-work crypto evidence-bundle --customer-ready-smoke <smoke.json> --official-sdk-validation <sdk-evidence.json> --operator-summary <operator-summary.md> --output <bundle.md> --json-output <bundle.json>
```

This gate does not perform live SDK submission. It verifies that the source code and docs still require official SDK validation, preserve `requiresClientValidation: true`, preserve `canSubmit: false`, and do not introduce submit routes or secret-bearing schemas. The evidence validator lets an operator attach public, redacted official-client/testnet evidence later without importing keys or secrets into Matterhorn.

Sources: Hyperliquid API docs (`hyperliquid-python-sdk`, testnet URL), Polymarket trading overview (`@polymarket/clob-client-v2`, EIP-712 orders, API credential separation).
