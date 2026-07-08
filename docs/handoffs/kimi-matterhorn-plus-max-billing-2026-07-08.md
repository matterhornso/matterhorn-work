# Kimi Handoff: Matterhorn Plus / Max Billing Foundation

Date: 2026-07-08
Owner: Kimi
Branch: `kimi/matterhorn-plus-max-billing`
Base: latest `origin/dev`

## Summary

Phase 0 billing foundation for Matterhorn Plus ($9.99/month) and Matterhorn Max ($89.99/month), plus safe Phase 1 Stripe test-mode scaffolding. No live payments are enabled.

## Files Changed

### Shared types
- `packages/types/src/billing.ts` — billing plan, subscription, usage, capability, checkout/portal/webhook contracts.
- `packages/types/src/backend-capabilities.ts` — added `billing` capability and `"billing"` settings section.
- `packages/types/src/index.ts` — re-exported `./billing`.
- `packages/types/package.json` — added `./billing` export.

### Server
- `apps/server/src/billing.ts` — static plan definitions, entitlement limits, mock billing provider, snapshot builders, env config resolution.
- `apps/server/src/billing-routes.ts` — safe routes:
  - `GET /api/billing/plans`
  - `GET /api/billing/status`
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/webhook/stripe`
- `apps/server/src/server.ts` — wired billing routes, capability, and settings section.

### App
- `apps/app/src/app/lib/matterhorn-server.ts` — added `billingPlans`, `billingStatus`, `billingCheckout`, `billingPortal` client methods.
- `apps/app/src/app/types.ts` — added `"billing"` to `SettingsTab`.
- `apps/app/src/react-app/domains/billing/entitlements.ts` — feature-gate helper (`checkEntitlement`, `isEntitlementAllowed`, formatters).
- `apps/app/src/react-app/domains/settings/pages/billing-view.tsx` — Settings > Billing UI with current plan, plan cards, usage placeholders, manage/upgrade actions.
- `apps/app/src/react-app/domains/settings/shell/settings-page.tsx` — billing tab icon, label, group, capability mapping.
- `apps/app/src/react-app/shell/settings-route.tsx` — billing view routing.
- `apps/app/src/react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts` — added billing capability and settings section fixture.

### Tests
- `apps/server/src/billing-routes.e2e.test.ts` — route and capability tests.
- `apps/app/tests/billing-ui-contract.test.ts` — UI contract, fixture, and entitlement helper tests.

## Verification

```bash
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
# TYPECHECK OK

bun test apps/server/src/billing-routes.e2e.test.ts
bun test apps/app/tests/billing-ui-contract.test.ts
bun test apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/app/tests/settings-overview-ui.test.ts
# all pass

bun test apps/app/tests
# 368 pass, 0 fail

bun test apps/server/src
# 609 pass, 0 fail
```

## Design Decisions

- **Plans**: Free, Plus ($9.99/mo), Max ($89.99/mo).
- **Entitlements**: image_generation, image_editing, nft_mint_preview, nft_marketplace_listing, walrus_storage, cloud_sync, team_members, memory_global_scope, priority_support, api_access, extended_outputs.
- **Free limits**: 10 images/month, no NFT mint/listing, 1 team member.
- **Plus limits**: 100 images, 50 edits, 20 NFT mint previews, 1 team member.
- **Max limits**: unlimited for most entitlements, 10 team members.
- **Billing mode**: `phase0_mock` by default. `phase1_stripe_test` when `MATTERHORN_BILLING_PROVIDER=stripe` or `MATTERHORN_BILLING_MODE=phase1_stripe_test`. `live` mode is recognized but explicitly blocked from checkout/portal.
- **Live payments**: always disabled (`isLivePaymentsEnabled: false`). Checkout/portal routes reject `live` mode.
- **Stripe webhook**: accepts signatures only in `phase1_stripe_test`; never reports `livemode: true`.
- **No raw card data, no real Stripe keys, no hardcoded live price IDs**.
- **Feature gates**: `checkEntitlement` helper; local notes, memory, and reading local data are never gated.

## Open Decisions / Next Steps

1. **Real Stripe integration**: when ready, implement `createStripeBillingProvider` using `@stripe/stripe-node` in test mode first.
2. **Price IDs**: configure `MATTERHORN_STRIPE_PRICE_ID_PLUS` and `MATTERHORN_STRIPE_PRICE_ID_MAX` for test products.
3. **Usage tracking**: current usage is a placeholder snapshot. Wire to actual image/NFT/team counters.
4. **Subscription persistence**: current plan is env-driven. Add workspace or user-level persistence.
5. **Cloud account linkage**: billing should eventually be tied to Matterhorn Cloud account, not just local env.
6. **Feature-gate integration**: apply `isEntitlementAllowed` to image generation, NFT previews, and team flows.
7. **Upgrade prompts**: surface plan upgrade CTAs when entitlements hit limits.
8. **Browser smoke**: manually verify Settings > Billing loads and plan selection opens mock checkout.

## Safety Checklist

- [x] No live payments enabled by default.
- [x] Live mode explicitly rejected at checkout/portal.
- [x] No raw card data handling.
- [x] No real Stripe keys required for Phase 0.
- [x] Webhook endpoint never reports livemode true.
- [x] Local notes/memory/reads are not gated.
- [x] Viewer tokens cannot start checkout or open portal.
