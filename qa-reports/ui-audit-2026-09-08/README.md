# Matterhorn Desks end-to-end QA — 2026-09-08

## Release under test

- Hosted frontend: `https://matterhorn-desks-canary.vercel.app`
- Hosted backend: `https://control-plane-production-d46b.up.railway.app`
- Deployed commit: `e4fad1f71ac1b39779153970594c5b112b0c98a3`
- Guarded runtime: `shadow`
- Public signup: paused

## Executive result

The deployed product core is healthy. The strict deployment probe, the complete ten-stage platform safety gate, application and server type checks, production build, bundle budget, dependency audit, and secret scan pass. Real hosted model completions also pass for Private AI, Bittensor, Hyperliquid, Polymarket, and Sui.

The product is not ready for open public signup yet. Transactional email, password reset, verified backups, two-account hosted isolation, real-wallet lifecycle acceptance, and the remaining cross-browser/manual accessibility checks are not complete.

## Automated verification

| Area | Result | Notes |
| --- | --- | --- |
| Platform safety gate | Pass | All ten stages passed. |
| Application tests | Pass | 1,091 tests, 0 failures. |
| Server tests | Pass | 1,653 tests, 0 failures on the release candidate. |
| App type check | Pass | TypeScript emitted no errors. |
| Server type check | Pass | TypeScript emitted no errors. |
| Production web build | Pass with warnings | Build succeeded; large optional wallet/highlighter chunks and one circular chunk warning remain. |
| Bundle budget | Pass | Public entry graph is 2,979 bytes; route and wallet budgets pass. |
| Dependency audit | Pass | 1,457 locked versions; no low-or-higher advisories. |
| Secret scan | Pass | 1,176 source files; 0 findings. |
| Strict hosted deployment probe | Pass | Exact frontend/backend commit, HTTPS, headers, readiness, CORS, and unauthenticated API boundaries pass. |

## Real hosted model acceptance

The live QA path exercised session creation, authoritative privacy preflight, exact-request consent where required, host approval, model dispatch, assistant response polling, session cleanup, file access, and approval APIs. No credentials or consent bearer values were printed.

| Experience | Agent | Result | Response proof |
| --- | --- | --- | --- |
| Private AI | Default private/general agent | Pass | One completed assistant response. |
| Bittensor | `matterhorn-bittensor` | Pass | One completed assistant response. |
| Hyperliquid | `matterhorn-hyperliquid` | Pass | One completed assistant response. |
| Polymarket | `matterhorn-polymarket` | Pass | One completed assistant response. |
| Sui | `matterhorn-sui` | Pass | One completed assistant response. |

Public crypto prompts remained in `public_research`. The general hosted workspace prompt correctly escalated to `private_workspace` and required exact-request consent. This confirms the privacy firewall is active rather than decorative.

## UI and UX sweep

### Hosted sign-in

- Stable responsive two-column sign-in presentation.
- Email and password fields, Sign in, Security, and Privacy have accessible names.
- Create account and Forgot password are disabled with an honest paused-state explanation.
- The state is correct for the current launch configuration, but it is a launch blocker until email and reset are ready.

Screenshot: [hosted sign-in](./07-hosted-auth-signup-paused.jpg)

### Model setup

- The page clearly distinguishes selecting a model from connecting a provider.
- Free-beta allowance and provider-policy disclosure are visible.
- Local development correctly reports that ASI:Cloud and usage protection are unavailable instead of pretending they are live.
- Hosted inference is live, as confirmed by the five completion probes.

Screenshot: [model setup](./01-model-setup.jpg)

### Private AI

- Selecting Private AI now opens a blank chat directly.
- It does not force the user through a protocol-desk picker.
- The composer has a clear Private AI placeholder and model/private-mode recovery actions.

Screenshot: [Private AI direct chat](./02-private-ai-direct-chat.jpg)

### Bittensor

- Clear desk identity, primary blank-chat action, and three compact starter tasks.
- The live-provider warning is specific and does not block fallback research.
- Real Bittensor-agent completion passed on the hosted backend.

Screenshot: [Bittensor desk](./03-bittensor-desk.jpg)

### Hyperliquid

- Clear task hierarchy and wallet-review language.
- Blank chat remains available for users who do not want a prescribed workflow.
- Real Hyperliquid-agent completion passed on the hosted backend.

Screenshot: [Hyperliquid desk](./04-hyperliquid-desk.jpg)

### Polymarket

- Clear distinction between market research and wallet-reviewed actions.
- Kalshi and Manifold coverage is visible, reducing dependence on Polymarket availability.
- This desk is the most information-dense of the four and should be watched in moderated testing.
- Real Polymarket-agent completion passed on the hosted backend.

Screenshot: [Polymarket desk](./05-polymarket-desk.jpg)

### Sui

- Clear blank-chat action and three starter tasks.
- The remaining vague receipt wording has been changed to “transaction receipt” and “Files and outputs” in the pending local patch.
- The safety disclosure opens as a labelled dialog and keeps wallet signing explicit.
- Real Sui-agent completion passed on the hosted backend.

Screenshot: [Sui desk before the wording patch](./06-sui-desk.jpg)

## Findings and fixes made during this pass

1. **Live-QA false failure fixed.** The QA harness previously waited on a long-lived event stream and could report an aborted request after the model had already replied. It now supports exact privacy preflight, one-request consent, scoped host approval, desk-agent selection, and explicit assistant-message polling.
2. **Vague Sui receipt copy fixed.** User-facing references now say “transaction receipt” and “Files and outputs.” Internal route, type, and compatibility identifiers remain unchanged.
3. **Private AI direct-chat flow verified.** Selecting Private AI goes directly to an empty chat composer.
4. **Desk presentation verified.** Each crypto desk has a named landmark, meaningful logo, one primary chat action, three initial task choices, progressive disclosure, and named right-rail controls.
5. **Redundant desk helper text removed.** Bittensor, Hyperliquid, and Sui no longer repeat that the agent is already selected beneath the primary chat action. Polymarket retains its action-specific compliance cue.

## Open release blockers

### Stop-ship before invite signup

1. Configure a real transactional email transport and test signup verification, resend, expiration, bounce/complaint handling, and password reset.
2. Configure encrypted host backups and produce a recent successful restore marker.
3. Run hosted two-account isolation with two real accounts across chats, Memory, Files, receipts, wallet timelines, and guarded runtime state.
4. Connect real testnet wallets and execute reject, expire, tamper, regenerate, approve, and receipt-import flows for each supported transaction family.

### Acceptance still required

1. Safari and Firefox end-to-end passes. Firefox is not installed in the current environment; Safari was not taken over while it was actively in use.
2. Manual keyboard-only and screen-reader review. Automated accessible-name, landmark, focus, dialog, target-size, reduced-motion, and virtual-keyboard contracts pass, but they do not replace manual assistive-technology testing.
3. Live Core Web Vitals/Lighthouse measurement. The bundle budget passes, but the required Chrome DevTools integration is not available in this task environment.
4. Account-facing hosted model completion. The trusted hosted backend path passes; a real hosted account credential is still needed to repeat the flow through the signed-in Vercel UI.

## Release recommendation

Keep signup paused. Merge and deploy the QA/copy patch after review, then close email, backup, two-account, wallet, cross-browser, accessibility, and live-performance acceptance in that order. Move to invite-only signup only after every stop-ship item passes; do not open unrestricted public registration on the current state.
