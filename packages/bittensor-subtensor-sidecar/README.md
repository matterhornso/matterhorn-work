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
export BITTENSOR_NETWORK=test
export BITTENSOR_SUBTENSOR_SIDECAR_URL=http://127.0.0.1:9876
```

The certified Crypto App contract is testnet-only and rejects a sidecar that
reports `finney` or `local`. Keep a separate legacy Finney sidecar if operator
work still needs mainnet public reads.

## Modes

### Mock Mode

Default mode. It provides deterministic development responses for:

- sidecar health
- subnet list
- Dynamic TAO subnet info
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

The bridge supports public read paths defensively:

- sidecar health and SDK availability
- subnet list via SDK subnet metadata where available
- Dynamic TAO subnet info
- metagraph reads
- wallet balance and stake-position reads where the installed SDK exposes them
- Dynamic TAO quote enrichment where the installed SDK exposes conversion helpers

Signed-payload submission is not part of the bridge. The connected wallet owns
signing and broadcast after Matterhorn's reviewed-action handoff.

## Endpoints

### `GET /liveness`

Returns a fast process-level readiness response without doing a live Subtensor RPC.
The Matterhorn server uses this first so Finney RPC latency does not make a
running sidecar appear unreachable.

### `GET /health`

Returns sanitized sidecar status. Does not expose endpoint URLs or secrets.
In Python SDK mode, SDK health is cached briefly so repeated health probes do
not re-fetch the chain head on every request.

Submission is reported as disabled in this milestone. The sidecar is for live reads and unsigned previews first.

### `GET /status`

Alias for `/health`.

### `GET /subnets`

Returns live-shaped subnet metadata:

- `network`
- `source`
- `fetchedAt`
- `block`
- `freshness`
- `subnets[]`

Each subnet may include Dynamic TAO fields such as `priceTao`, `emission`, `tempo`, `alphaIn`, `alphaOut`, and `taoIn`.

### `GET /subnets/:netuid/dynamic`

Returns Dynamic TAO-style metadata for one subnet, including source and freshness fields.

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

The response may include `source`, `block`, `freshness`, `freeTao`, `stakedTao`, `stakePositions[]`, and `warnings`.

### `POST /extrinsics/quote`

Returns quote shape compatible with Matterhorn:

- `action`
- `netuid`
- `amountTao`
- `priceTao`
- `idealAlpha`
- `expectedAlpha`
- `networkFeeTao`
- `swapFeeTao`
- `slippageBps`
- `rateTolerance`
- `source`
- `block`
- `freshness`
- `warnings`
- `requiresExternalSignature`

### `POST /extrinsics/prepare`

Returns an unsigned payload for external signing. The request and response are rejected if they contain secret-shaped fields.

### `POST /submit`

Permanently returns `501 wallet_airlock_required`. There is no Python bridge
handler, environment switch, or SDK path that can enable submission. Review,
sign, and broadcast happen only in the connected wallet.

## Safety Rules

- Never pass seed phrases, mnemonics, private keys, keyfiles, SURI strings, or wallet exports into the sidecar.
- Sidecar output must not contain secret-shaped fields.
- Mock mode must never pretend to broadcast.
- Matterhorn remains non-custodial.
- Every signed Bittensor action must be reviewed and signed externally.
