# Market Submit/Sign Phase 0 Contract

Phase 0 defines the security contract for future Hyperliquid and Polymarket execution through Matterhorn Desks chat. It does not enable live submission, signing, custody, or order broadcast.

The current product remains read, preview, external-signer handoff, and public receipt import only. Future execution work must pass this contract before any route is allowed to submit a signed order.

## Official Sources

- Hyperliquid exchange endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- Polymarket order creation: https://docs.polymarket.com/trading/orders/create
- Polymarket authentication: https://docs.polymarket.com/api-reference/authentication

These docs imply two different execution models:

- Hyperliquid order and cancel requests go to the exchange endpoint with an externally produced signed action, nonce, and optional expiry.
- Polymarket orders are created and signed by the user's wallet/client, then posted through authenticated CLOB flows that require L2 headers. Those headers must not become long-lived Matterhorn custody.

## Phase 0 Non-Goals

- No live market submission route.
- No route that signs with a private key.
- No route that stores API credentials.
- No route that accepts a seed phrase, mnemonic, private key, wallet export, or long-lived API secret.
- No Matterhorn-controlled final signature computation.
- No mainnet enablement.

## Future Route Names

Future implementation may add route names in this order, behind an explicit execution mode and kill switch:

- `hyperliquid.orders.sign_request`
- `hyperliquid.orders.submit_signed`
- `hyperliquid.orders.cancel_sign_request`
- `hyperliquid.orders.cancel_submit_signed`
- `polymarket.orders.sign_request`
- `polymarket.orders.submit_signed`
- `polymarket.orders.cancel_sign_request`
- `polymarket.orders.cancel_submit_signed`

These names are contract identifiers, not active routes in Phase 0.

## Execution Modes

Every future execution endpoint must require one explicit mode:

- `disabled`: default everywhere.
- `testnet_external_signer`: first enabled mode, limited to operator-owned testnet accounts and public/redacted artifacts.
- `mainnet_external_signer`: blocked until a separate security review, limits review, incident plan, and customer warning pass.

Any unspecified mode is treated as `disabled`.

## Signed Submission Envelope

Future `submit-signed` endpoints must accept only `matterhorn.market.signed-submission-envelope.v1`.

The envelope binds:

- venue, network, action, and route name;
- preview SHA-256;
- handoff SHA-256;
- unsigned payload SHA-256;
- signed artifact public hash;
- signer public address;
- operator confirmation text;
- expiry;
- compliance status;
- source/freshness data;
- redacted warnings.

The envelope may carry enough public/redacted proof to submit or audit the action, but it must not contain custody material.

## Hash And Freshness Rules

Future routes must reject:

- missing preview hash;
- missing handoff hash;
- stale preview;
- stale handoff;
- hash mismatch;
- route/venue/network mismatch;
- signer mismatch;
- compliance changed from allowed to blocked;
- price, size, leverage, market, asset, side, or reduce-only changes after the user-confirmed preview.

## Credential Rules

Always forbidden in Matterhorn request bodies, MCP arguments, CLI flags, logs, evidence bundles, and docs examples:

- no private key;
- no seed phrase;
- no mnemonic;
- no wallet export;
- no stored API secret;
- no long-lived API secret;
- no password or keyfile;
- no unscoped raw signing material.

Signed artifacts are allowed only in a future signed-submission envelope, only after explicit testnet enablement, and only with public hashes plus redacted audit records. Existing handoff and receipt routes must continue to reject signed artifacts.

## Venue-Specific Policy

### Hyperliquid

Future Matterhorn flow:

1. Chat creates a read-backed preview.
2. Matterhorn creates a sign request with a preview hash and expiry.
3. The user's external Hyperliquid-compatible client signs the exchange action.
4. Matterhorn accepts a signed-submission envelope and validates hashes, nonce, expiry, route, network, signer, and action shape.
5. Only an explicitly enabled `testnet_external_signer` route may forward to Hyperliquid exchange.
6. Matterhorn writes a redacted audit record and imports the public exchange result as a receipt.

### Polymarket

Polymarket has an extra CLOB authentication layer. Future execution must choose one of two explicit models:

1. client-submit receipt-only: Matterhorn creates a preview and handoff; the user's own Polymarket client signs and posts; Matterhorn imports the public receipt.
2. Matterhorn-submit signed order: only after a separate review, only with short-lived operator-owned testnet L2 headers provided through a redacted execution environment, never stored, never logged, and never accepted through chat/MCP/CLI arguments.

Mainnet Polymarket submit through Matterhorn is blocked until a separate compliance and custody review.

## Audit Record

Every future accepted or rejected execution attempt must write `matterhorn.market.execution-audit.v1` with:

- preview hash;
- handoff hash;
- signed artifact public hash when present;
- route name;
- venue;
- status;
- rejection reason when blocked;
- receipt hash when available;
- redacted flag;
- timestamp.

Audit records must not contain seeds, private keys, raw API secrets, wallet exports, unredacted signatures, or signed payload bodies.

## Required Gates

Future submit/sign work must keep these green:

```bash
pnpm test:market-submit-sign-contract-phase0
pnpm test:market-execution-readiness-gate
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
```

Phase 0 passes only if the codebase still has no active Hyperliquid or Polymarket market execution route.
