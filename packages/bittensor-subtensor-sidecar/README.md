# Matterhorn Bittensor Subtensor Sidecar

This package provides the sidecar contract used by Matterhorn's chat-first Bittensor tools.

The sidecar is separate from the main Matterhorn server because Bittensor live-chain access is SDK/runtime-specific, while Matterhorn must stay non-custodial and never receive seed phrases, mnemonics, private keys, keyfiles, SURI strings, or wallet exports.

## Run

```bash
pnpm --dir packages/bittensor-subtensor-sidecar start
```

Defaults:

- host: `127.0.0.1`
- port: `9876`
- mode: `mock`
- network: `finney`

Connect Matterhorn to it:

```bash
export BITTENSOR_SUBTENSOR_SIDECAR_URL=http://127.0.0.1:9876
```

## Modes

### Mock Mode

Default mode. It provides deterministic development responses for:

- sidecar health
- subnet metagraph
- wallet snapshot
- Dynamic TAO-style quote shape
- unsigned extrinsic preview

It does not broadcast signed extrinsics.

### Python SDK Mode

Set:

```bash
export BITTENSOR_SIDECAR_MODE=python
```

This mode calls `python_bridge.py`, which expects the official `bittensor` Python package to be installed in the selected Python environment.

The bridge currently supports public metagraph and wallet-balance reads defensively. Dynamic TAO exact quote expansion and signed-payload submission are intentionally conservative until SDK-version-specific tests are added.

## Endpoints

### `GET /health`

Returns sanitized sidecar status. Does not expose endpoint URLs or secrets.

### `GET /status`

Alias for `/health`.

### `GET /subnets/:netuid/metagraph`

Returns metagraph-style data:

- `network`
- `netuid`
- `block`
- `n`
- `neurons[]`

Each neuron may include:

- `uid`
- `hotkey`
- `coldkey`
- `stake`
- `trust`
- `validator_trust`
- `dividends`
- `emission`
- `active`
- `validator_permit`

### `GET /wallet/:ss58Address`

Returns a watch-only wallet snapshot. The address must be a public SS58 address.

### `POST /extrinsics/quote`

Returns quote shape compatible with Matterhorn:

- `action`
- `netuid`
- `amountTao`
- `expectedAlpha`
- `feeTao`
- `slippageBps`
- `warnings`
- `requiresExternalSignature`

### `POST /extrinsics/prepare`

Returns an unsigned payload for external signing. The request and response are rejected if they contain secret-shaped fields.

### `POST /submit`

Disabled by default. In mock mode this returns `501`.

Future SDK submission must only accept already-signed payloads and must include signed-payload verification tests before being enabled.

## Safety Rules

- Never pass seed phrases, mnemonics, private keys, keyfiles, SURI strings, or wallet exports into the sidecar.
- Sidecar output must not contain secret-shaped fields.
- Mock mode must never pretend to broadcast.
- Matterhorn remains non-custodial.
- Every signed Bittensor action must be reviewed and signed externally.

