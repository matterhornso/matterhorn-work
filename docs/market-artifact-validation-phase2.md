# Market Artifact Validation Phase 2

Phase 2 validates public/redacted signed-artifact metadata produced outside Matterhorn after a Phase 1 external sign request. It still does not add live submission, Matterhorn signing, raw signature intake, signed payload intake, API-secret storage, custody, or exchange broadcast.

## What Phase 2 Adds

- `POST /api/hyperliquid/orders/external-artifact/validate`
- `POST /api/polymarket/orders/external-artifact/validate`
- `matterhorn_hyperliquid_validate_external_artifact`
- `matterhorn_polymarket_validate_external_artifact`
- `matterhorn-work hyperliquid validate-artifact --sign-request-file <path> --artifact-file <path>`
- `matterhorn-work polymarket validate-artifact --sign-request-file <path> --artifact-file <path>`

Each path validates a `matterhorn.market.redacted-signed-artifact-envelope.v1` object against a `matterhorn.market.external-sign-request.v1` object and returns `matterhorn.market.artifact-validation.v1`.

## Accepted Input

The artifact envelope must contain public/redacted metadata only:

- sign-request SHA-256;
- preview SHA-256;
- handoff SHA-256;
- unsigned payload SHA-256;
- signed-artifact public SHA-256;
- optional public signer address;
- optional produced-at timestamp;
- `signedArtifactRedacted: true`;
- `canSubmit: false`;
- `liveSubmissionEnabled: false`.

Matterhorn verifies the artifact envelope matches the sign request and rejects stale or mismatched metadata.

## Rejected Input

The validation routes, MCP tools, and CLI commands reject:

- seed phrase;
- private key;
- API secret;
- passphrase;
- raw signature;
- signed payload;
- signed order;
- exchange payload;
- wallet export;
- executable submission payloads.

Raw artifact material must stay in the operator-owned wallet/client. Matterhorn only sees a public hash.

## Output

On success, Matterhorn returns:

- `status: accepted_public_metadata`;
- `matchesSignRequest: true`;
- `signedArtifactAccepted: false`;
- `submitSignedAllowedByContract: false`;
- `canSubmit: false`;
- `liveSubmissionEnabled: false`;
- a `matterhorn.market.receipt.v1` public audit receipt candidate.

The receipt candidate is not proof of exchange submission. It only proves that redacted public metadata matched the sign request.

## Still Forbidden

- `/api/hyperliquid/orders/submit`
- `/api/polymarket/orders/submit`
- `/api/hyperliquid/orders/sign`
- `/api/polymarket/orders/sign`
- `/api/hyperliquid/exchange/submit`
- `/api/polymarket/exchange/submit`
- accepting raw signatures or signed payloads through HTTP, MCP, CLI, docs, fixtures, logs, or evidence bundles.

## Required Gates

```bash
pnpm test:market-artifact-validation-phase2
pnpm test:market-sign-request-phase1
pnpm test:market-submit-sign-contract-phase0
pnpm test:market-execution-readiness-gate
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
```

Phase 3 can add customer-visible artifact validation UX only after these gates stay green.
