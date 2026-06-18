# Market Sign Request Phase 1

Phase 1 adds disabled-by-default external sign-request generation for Hyperliquid and Polymarket. It still does not add live submission, Matterhorn signing, signed-payload intake, custody, API-secret storage, or exchange broadcast.

Official references:

- Hyperliquid exchange endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- Polymarket order creation: https://docs.polymarket.com/trading/orders/create
- Polymarket authentication: https://docs.polymarket.com/api-reference/authentication

## What Phase 1 Adds

- `POST /api/hyperliquid/orders/external-sign-request`
- `POST /api/polymarket/orders/external-sign-request`
- `matterhorn_hyperliquid_create_sign_request`
- `matterhorn_polymarket_create_sign_request`
- `matterhorn-work hyperliquid sign-request --execution-mode testnet_external_signer ...`
- `matterhorn-work polymarket sign-request --execution-mode testnet_external_signer ...`

Each path returns `matterhorn.market.external-sign-request.v1`.

## Required Mode

Sign requests are fail-closed unless the caller passes:

```text
executionMode=testnet_external_signer
```

Mainnet mode is not accepted in Phase 1.

## Sign Request Contract

The request includes:

- venue;
- route name;
- testnet execution mode;
- preview SHA-256;
- handoff SHA-256;
- unsigned payload SHA-256;
- sign-request SHA-256;
- ready-to-sign state;
- explicit external-signer instructions;
- expiry;
- warnings;
- `canSubmit: false`;
- `liveSubmissionEnabled: false`;
- `submitSignedAllowedByContract: false`;
- `signedArtifactAccepted: false`.

The request may include an unsigned signing payload template. It must not include a signature, signed order, API secret, private key, seed phrase, mnemonic, passphrase, or wallet export.

## Venue Behavior

### Hyperliquid

Matterhorn builds the existing order preview and handoff, resolves the asset index when possible, then wraps the unsigned Hyperliquid L1 action template into the sign-request envelope.

The user must validate the payload with Hyperliquid's official tooling on testnet before signing. Matterhorn does not compute `connectionId`, nonce, or signature.

### Polymarket

Matterhorn builds the existing order preview and handoff, runs the compliance gate, then wraps the EIP-712 order typed-data template when a validated exchange address is configured.

Polymarket CLOB posting needs L2 authentication headers. Phase 1 does not accept, store, or proxy those headers. It only creates a local external-sign request for operator-owned testnet validation.

## Still Forbidden

- `/api/hyperliquid/orders/submit`
- `/api/polymarket/orders/submit`
- `/api/hyperliquid/orders/sign`
- `/api/polymarket/orders/sign`
- `/api/hyperliquid/exchange/submit`
- `/api/polymarket/exchange/submit`
- any request body, CLI flag, MCP argument, log, or evidence file containing a seed phrase, private key, wallet export, API secret, passphrase, raw signature, signed order, or signed payload.

## Required Gates

```bash
pnpm test:market-sign-request-phase1
pnpm test:market-submit-sign-contract-phase0
pnpm test:market-execution-readiness-gate
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
```

Phase 2 can add signed-artifact envelope validation only after these gates stay green.
