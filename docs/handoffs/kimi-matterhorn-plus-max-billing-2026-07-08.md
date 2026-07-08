# Kimi Handoff: Matterhorn Plus / Matterhorn Max Billing Foundation

Date: 2026-07-08
Repo: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`
Base branch: latest `origin/dev`
Suggested branch: `kimi/matterhorn-plus-max-billing`

## Context

Matterhorn now has a stronger backend control plane, project data ledger, model catalog visibility, generated-image support, and Sui NFT draft/publish scaffolding. The next product/business layer is paid plans:

- Matterhorn Plus: `$9.99/month`
- Matterhorn Max: `$89.99/month`

The goal is not to bolt random checkout buttons into the app. The goal is to add a trustworthy billing and entitlement spine so the product can safely answer:

- What plan is this user/org/workspace on?
- Which paid features are available?
- Which limits are close to being reached?
- How does the user upgrade, downgrade, cancel, or open invoices?
- Which features are unavailable because billing is not configured?

Use Stripe Billing as the first payment provider. Stripe's current SaaS docs recommend modeling products/prices, using Checkout for subscriptions, using Customer Portal for subscription management, using webhooks for subscription lifecycle changes, and using entitlements for feature access:

- Stripe SaaS overview: https://docs.stripe.com/saas
- Subscriptions integration: https://docs.stripe.com/billing/subscriptions/build-subscriptions
- Customer portal: https://docs.stripe.com/customer-management
- Subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Pricing models: https://docs.stripe.com/products-prices/pricing-models
- Entitlements: https://docs.stripe.com/billing/entitlements

## Product Positioning

Keep plan names simple:

- `Free`
- `Matterhorn Plus`
- `Matterhorn Max`

Avoid using both `Pro` and `Max` in UI. If code needs a stable enum, use `max`; if copy needs a friendly label, use `Matterhorn Max`.

### Draft Plan Matrix

This matrix is a starting point, not a final pricing promise.

| Area | Free | Plus - $9.99/mo | Max - $89.99/mo |
| --- | --- | --- | --- |
| Local workspaces | Yes | Yes | Yes |
| Bring-your-own model keys | Yes | Yes | Yes |
| Matterhorn-managed model routing | Preview / limited | Included with monthly fair-use credits | Larger monthly fair-use credits + priority routing |
| Project notes/memory | Local only | Local + export/readiness surfaces | Local + team/shared workspace readiness |
| Project evidence ledger | Local preview | Full local ledger/export | Full ledger/export + team audit readiness |
| Desk workflows | Basic/local | Full workflow receipts and outputs | Higher workflow limits + priority workflow runs |
| Image generation | Mock/BYO only or low trial allowance | Included monthly image allowance | Larger image allowance + batch/history |
| Sui NFT publishing | Draft preview | Preview + user-signed publish when configured | Higher publish limits + marketplace workflow tools |
| Team collaboration | Not included | Not included or 1 collaborator preview | Team seats / shared workspace readiness |
| Support | Community/self-serve | Standard | Priority |

Important margin rule: do not promise unlimited managed LLM or image usage at these prices. If Matterhorn pays provider costs, every paid plan needs explicit fair-use limits or credit accounting. Bring-your-own-key usage can be ungated separately because Matterhorn is not paying provider usage.

## Recommended Architecture

### Source of Truth

Use a hosted Billing Control Plane as the source of truth for Stripe secrets, subscriptions, and entitlements.

The local Matterhorn Work engine should never hold Stripe secret keys or receive raw card data. Desktop/web should open Stripe-hosted Checkout or Customer Portal URLs, then refresh a signed entitlement snapshot from the control plane.

For local development, implement a mock/local billing provider that reports `not_configured`, `mock_free`, `mock_plus`, or `mock_max` without real charges.

### Data Flow

1. User opens Settings > Billing or hits an upgrade prompt.
2. App asks local server for `/api/billing/status` or workspace-scoped billing status.
3. Local server either:
   - returns mock/local entitlement status, or
   - proxies to hosted billing control plane using authenticated user/org/workspace identity.
4. User clicks Upgrade.
5. Server creates a Stripe Checkout Session for the selected price lookup key.
6. App opens Checkout externally.
7. Stripe sends webhook to hosted control plane.
8. Control plane verifies Stripe signature, handles idempotency, updates subscription/entitlement snapshot.
9. App refreshes billing status and gates features based on entitlements.
10. User manages plan through Stripe Customer Portal.

### Required Shared Types

Add a billing type module, likely:

- `packages/types/src/billing.ts`

Suggested shape:

```ts
export type MatterhornPlanId = "free" | "plus" | "max" | "enterprise";
export type MatterhornBillingProvider = "mock" | "stripe";
export type MatterhornBillingStatus =
  | "not_configured"
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unknown";

export type MatterhornEntitlementKey =
  | "model.managed"
  | "model.byo"
  | "workflow.standard"
  | "workflow.priority"
  | "generated_media.create"
  | "generated_media.history"
  | "nft.sui.preview"
  | "nft.sui.publish"
  | "memory.project"
  | "evidence.export"
  | "team.workspace";

export type MatterhornPlanLimit = {
  key: string;
  label: string;
  included: number | "unlimited" | "byo";
  used?: number;
  resetAt?: string;
};

export type MatterhornBillingPlan = {
  id: MatterhornPlanId;
  name: string;
  priceUsdMonthly: number | null;
  stripeLookupKey?: string;
  description: string;
  entitlements: MatterhornEntitlementKey[];
  limits: MatterhornPlanLimit[];
};

export type MatterhornBillingSnapshot = {
  version: "matterhorn.billing.v1";
  provider: MatterhornBillingProvider;
  configured: boolean;
  status: MatterhornBillingStatus;
  plan: MatterhornBillingPlan;
  availablePlans: MatterhornBillingPlan[];
  customer?: {
    id?: string;
    email?: string;
    organizationId?: string;
  };
  subscription?: {
    id?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  };
  capabilities: {
    checkout: "working" | "needs_setup" | "not_supported";
    portal: "working" | "needs_setup" | "not_supported";
    webhooks: "working" | "needs_setup" | "not_supported";
    entitlements: "working" | "needs_setup" | "preview";
  };
  security: {
    stripeSecretsServerOnly: boolean;
    webhookSignatureVerification: "working" | "needs_setup";
    cardDataHandledByStripeOnly: boolean;
  };
};
```

Export this from `packages/types/src/index.ts`.

### Backend Routes

Add a small billing module instead of placing all logic in `server.ts`.

Suggested files:

- `apps/server/src/billing.ts`
- `apps/server/src/billing-routes.e2e.test.ts`
- `apps/server/src/billing.test.ts`

Routes:

- `GET /api/billing/plans`
- `GET /api/billing/status`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook/stripe`

If workspace-scoped gating is already expected in UI, also expose:

- `GET /workspace/:id/billing/status`

For Phase 0, these can return mock/provider-not-configured data. The shape should be stable and tested.

### Environment Variables

Do not hardcode Stripe price IDs.

Suggested env names:

- `MATTERHORN_BILLING_PROVIDER=mock|stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PLUS_PRICE_LOOKUP_KEY=matterhorn_plus_monthly`
- `STRIPE_MAX_PRICE_LOOKUP_KEY=matterhorn_max_monthly`
- `MATTERHORN_BILLING_SUCCESS_URL`
- `MATTERHORN_BILLING_CANCEL_URL`
- `MATTERHORN_BILLING_PORTAL_RETURN_URL`

Use lookup keys where possible so test/live price IDs can vary.

### Backend Capabilities Integration

Update the backend capability/control-plane response to include billing readiness:

- Billing provider configured or not.
- Checkout status.
- Portal status.
- Webhook status.
- Entitlement status.
- Current plan label.

This should let Settings/Profile say "Billing not configured", "Free", "Plus", or "Max" truthfully.

### Project Data Ledger

Record redacted billing events only. Do not log card data, raw Stripe payloads, full email addresses, or billing addresses.

Suggested event kinds:

- `billing.checkout_started`
- `billing.portal_opened`
- `billing.subscription_updated`
- `billing.entitlements_updated`
- `billing.payment_failed`

Payload should be redacted:

```ts
{
  planId: "plus",
  provider: "stripe",
  status: "active",
  subscriptionIdHash: "...",
  invoiceIdHash: "...",
}
```

### Frontend UX

Add a clean Settings > Billing section. Keep it calm and product-native, not a marketing landing page.

Surfaces:

- Settings overview: compact billing status row.
- Settings > Billing: plan cards, current plan, usage/limits, manage billing button.
- Profile/settings popover: current plan badge.
- Feature gates: small upgrade prompt where the paid feature lives.

Do not add a giant pricing hero inside the app. This is a work app, not a marketing site.

Use existing shadcn/Base UI components and Matterhorn tokens. Keep radii around 8-12px, avoid heavy outlines, avoid decorative gradients, avoid nested cards.

### Feature Gates

The first useful gates should be honest and low-risk:

- Managed model routing beyond local/BYO.
- Generated image creation when Matterhorn pays provider costs.
- Sui NFT publish flow when backend config is present.
- Team/shared workspace mode.
- Larger run history / evidence export limits.

Do not block local user-owned workspace data, notes, exports, or BYO provider usage unless we explicitly decide to.

## Security and Compliance Guardrails

- Use Stripe Checkout/Customer Portal so Matterhorn does not handle card data.
- Stripe secret keys stay on hosted backend/control plane only, not desktop/local app.
- Verify Stripe webhook signatures before processing.
- Make webhook handling idempotent.
- Never log raw Stripe webhook bodies after verification except in secure debug mode.
- Redact emails, subscription IDs, invoice IDs, and customer IDs in project ledger events.
- Never expose price IDs/secrets that are sensitive; publish only plan/lookup metadata needed by UI.
- Handle `past_due`, `incomplete`, `canceled`, and `unpaid` states clearly.
- Add test mode only first. Live mode should be a later explicit switch.

## Phase Plan

### Phase 0 - Billing Contract and Mock Entitlements

Build:

- Shared billing types.
- Static plan definitions for Free, Plus, Max.
- Mock billing provider returning a `MatterhornBillingSnapshot`.
- Backend routes for plans/status/checkout/portal returning safe `needs_setup` or mock URLs.
- Backend capabilities/control plane includes billing readiness.
- Settings > Billing UI reads backend status and renders current plan/available plans.
- Feature gate helper function: `hasEntitlement(snapshot, key)`.

Acceptance:

- No Stripe package required yet unless needed for type-safe webhook scaffolding.
- No live payments.
- Tests cover plan prices, entitlements, not-configured states, and UI contract.

### Phase 1 - Stripe Test Mode Checkout and Portal

Build:

- Stripe server adapter behind `MATTERHORN_BILLING_PROVIDER=stripe`.
- Checkout session creation using configured lookup keys.
- Customer portal session creation.
- Webhook endpoint with signature verification.
- Subscription/entitlement snapshot persistence in the hosted/control-plane path or local test store, depending on current repo architecture.
- Test webhook fixtures for subscription created/updated/deleted and invoice payment failed.

Acceptance:

- Test mode only.
- No raw card handling.
- Stripe webhook signature verification test.
- Idempotency test.
- App can open Checkout and Portal URLs.

### Phase 2 - Entitlement Gates in Product Surfaces

Build:

- Gate managed model usage.
- Gate generated image provider usage when not BYO/mock.
- Gate Sui NFT publish action behind `nft.sui.publish`.
- Gate team/shared workspace controls.
- Add upgrade prompt components that are small, contextual, and dismissible.

Acceptance:

- Gates never block reading existing local data.
- Gates never hide the reason something is unavailable.
- UI says exactly what unlocks the action.

### Phase 3 - Usage Ledger and Limits

Build:

- Usage accounting for managed model requests, image generations, NFT publish attempts, and workflow runs.
- Monthly reset window.
- Limit display in Settings > Billing.
- Soft warning at 80%, hard stop at 100% unless overage is explicitly enabled.

Acceptance:

- No accidental overage billing.
- BYO usage can be recorded as `byo` without consuming Matterhorn credits.
- Redacted project ledger events.

### Phase 4 - Team / Organization Billing

Build only after team model is clarified:

- Organization/customer mapping.
- Seat count.
- Team invites and roles.
- Billing admin role.
- Per-seat or included-seat model for Max.

## Open Product Decisions for Abhinav

1. Should the paid plan be named `Matterhorn Max` everywhere, or should checkout/product catalog use `Matterhorn Pro`?
2. Should Plus include any Matterhorn-paid model/image credits, or should Plus be mostly BYO with better UX/features?
3. Should Max include team seats by default? If yes, how many?
4. Should NFT publishing be included in Plus, Max only, or credit-based?
5. Should we support annual pricing immediately, or monthly only for beta?
6. Should India/GST tax setup be considered at launch, or should Stripe Tax handle launch geographies first?
7. Should cancellation immediately downgrade, or keep access until period end?

## Suggested Kimi Build Scope

Please take Phase 0 first. If that is done cleanly and tests pass, continue into Phase 1 scaffolding but keep live Stripe disabled by default.

Do not implement live charges in this PR without explicit approval.

Do not delete scratch/runtime files.

Do not hardcode real Stripe keys or price IDs.

Do not refactor unrelated Settings/Profile surfaces.

## Suggested Tests

Server:

- `billing.test.ts`
  - builds Free/Plus/Max plan definitions
  - maps `$9.99` to 999 cents and `$89.99` to 8999 cents where needed
  - validates entitlement keys
  - rejects unknown plan IDs
- `billing-routes.e2e.test.ts`
  - `GET /api/billing/plans`
  - `GET /api/billing/status`
  - `POST /api/billing/checkout` returns `needs_setup` in mock/not-configured mode
  - `POST /api/billing/portal` returns `needs_setup` in mock/not-configured mode
  - webhook rejects missing/invalid signatures in Stripe mode

App:

- billing UI contract test for Settings route wiring
- plan card render test
- entitlement helper test
- feature gate copy test

Broad:

- app typecheck
- server typecheck
- focused server/app tests

## Paste-Ready Prompt for Kimi

```text
You are continuing the Matterhorn Work build in:
/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest

Read this handoff first:
docs/handoffs/kimi-matterhorn-plus-max-billing-2026-07-08.md

Create branch:
kimi/matterhorn-plus-max-billing
from latest origin/dev.

Goal:
Build Phase 0 of the Matterhorn Plus / Matterhorn Max billing foundation. If Phase 0 is clean and tested, continue into safe Phase 1 Stripe test-mode scaffolding, but do not enable live payments.

Product plans:
- Free
- Matterhorn Plus: $9.99/month
- Matterhorn Max: $89.99/month

Implementation requirements:
1. Add shared billing types, likely packages/types/src/billing.ts, and export them.
2. Add static plan definitions and entitlement keys for Free / Plus / Max.
3. Add a mock billing provider / snapshot builder on the server.
4. Add safe routes:
   - GET /api/billing/plans
   - GET /api/billing/status
   - POST /api/billing/checkout
   - POST /api/billing/portal
   - POST /api/billing/webhook/stripe
   Workspace-scoped status is welcome if it matches current route patterns.
5. Integrate billing readiness into backend capabilities/control-plane responses.
6. Add Settings > Billing UI that shows current plan, available plans, usage/limits placeholders, and Manage billing / Upgrade actions.
7. Add a small feature-gate helper for entitlements. Do not gate local notes, local memory, or reading existing local data.
8. Use Stripe-safe design:
   - no raw card data
   - no real Stripe keys
   - no hardcoded live price IDs
   - webhook signature verification when Stripe mode is enabled
   - hosted Checkout/Customer Portal only
9. Add tests:
   - plan definitions and entitlement helper
   - billing routes
   - capability/control-plane billing readiness
   - Settings Billing UI contract
10. Run focused tests, app/server typechecks, and any relevant broad tests you can reasonably run.

Constraints:
- Do not delete untracked scratch/runtime files.
- Keep UI clean and Matterhorn-native. Use existing shadcn/Base UI components and tokens. Avoid giant pricing hero sections, decorative gradients, nested cards, and heavy outlines.
- Keep Stripe live charging disabled by default.
- Leave a handoff doc with files changed, tests run, open decisions, and next steps.

Expected deliverable:
A branch with Phase 0 complete, tests passing, and a handoff doc. If you reach Phase 1, it should be test-mode scaffolding only.
```

