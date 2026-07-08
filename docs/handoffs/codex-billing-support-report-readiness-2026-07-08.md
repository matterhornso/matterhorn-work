# Billing Support Report Readiness

Date: 2026-07-08
Branch: `codex/billing-support-report-readiness`
Base: `origin/dev` at `fa97df42` (`Polish Matterhorn platform UX surfaces (#815)`)

## Summary

This pass extends the backend support report so Matterhorn Plus / Max billing has the same production-readiness visibility as generated media, Sui, memory, notes, and the project data ledger.

The support report now includes a redacted `billing` section with:

- backend capability status for billing;
- the current billing status snapshot;
- mode/provider/plan diagnostics;
- checkout, portal, webhook, and test-readiness flags;
- current workspace usage counts for generated images, NFT drafts, team members, and cloud storage placeholder bytes;
- setup checks with sanitized descriptions;
- pending checkout metadata without leaking the provider session id;
- safety flags proving diagnostics do not charge cards, create provider sessions, handle raw card data, or return secrets;
- recommended actions derived from failed or missing setup checks.

## Files Changed

- `packages/types/src/backend-support-report.ts`
  - Adds the typed `billing` support-report contract.
- `apps/server/src/backend-support-report.ts`
  - Builds billing diagnostics from env config, workspace billing account state, image usage, NFT draft usage, and local team-token counts.
  - Redacts Stripe-related setup text and forbidden marker names.
  - Adds a support-report warning that billing diagnostics are read-only.
- `apps/server/src/backend-control-plane.e2e.test.ts`
  - Covers mock billing diagnostics.
  - Covers Stripe test-mode billing readiness.
  - Asserts support reports do not leak Stripe env var names, test secret values, provider session ids, or authorization markers.

## Verification

Passed:

- `bun test apps/server/src/backend-control-plane.e2e.test.ts`
- `bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/billing-routes.e2e.test.ts`
- `bun test apps/server/src/billing-routes.e2e.test.ts apps/app/tests/billing-ui-contract.test.ts`
- `./apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit`
- `./apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit`

## Safety Contract

- Live payments remain disabled.
- The support report does not call Stripe APIs or any provider write path.
- The support report does not create checkout sessions, portals, subscriptions, invoices, or charges.
- Stripe secret keys, webhook secrets, price ids, customer ids, bearer tokens, host tokens, and authorization markers are excluded from report output.
- Pending checkout state is represented only by safe metadata plus `providerSessionIdPresent`.

## Remaining Work

- Add real production Stripe provider enablement once live payment policy and account linkage are ready.
- Persist cloud account linkage beyond local workspace billing accounts.
- Add durable usage counters for future server-side quota enforcement.
- Apply Plus / Max entitlements to additional high-cost flows as those flows leave preview.
- Add a user-facing support-report download UI once the report shape is stable.
