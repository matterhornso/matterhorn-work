# Handoff → Codex Build Coordinator: Wellness Services Bridge

**From:** Claude (Wellness Creator Pilot owner)
**Date:** 2026-06-19
**Repo:** `matterhornso/matterhorn-work` (default branch `dev`)

Describes **exactly what was built** in this change. Descriptive only.

## 1. PR / branch state

- **PR #400 — OPEN, CI green.** Branch `claude/wellness-services-bridge`, base `dev`. Branched from latest `dev` (after PR #395 merged, so dev already had the full go-live pilot).
- Docs + the existing offline gate only. No runtime routes, no funds, no on-chain side effects.
- CI: `customer-crypto-gates`, `i18n-audit`, `openwork-tests (blacksmith-4vcpu-ubuntu-2204)`, `openwork-tests (macos-14)` — all pass.

## 2. What it does

Adds a **"Matterhorn Services Bridge"** to the Wellness Creator Pilot, framing it as the first **non-trading** customer use case by mapping each wellness workflow to a future **first-party Matterhorn service**. Every mapping is **planned, not live** — nothing is enabled, and the doc/gate enforce that the app never claims any of these services is active.

## 3. Files changed (3 — all pre-existing on dev)

| File | Change |
|---|---|
| `docs/wellness-creator-pilot.md` | New section **"Matterhorn Services Bridge (Planned — Not Live)"** inserted between "Future Web3 Hooks" and "How This Demonstrates Matterhorn Work". |
| `docs/handoffs/hermes-wellness-creator-qa.md` | New **"Matterhorn Services Bridge Honesty Tests"** QA section + one Evidence Matrix row + one Red Line + updated Sign-Off. |
| `scripts/wellness-creator-pilot.test.mjs` | Extended the existing `test:wellness-creator-pilot` gate with three new assertion blocks (§16–18). **No new package scripts; `package.json` untouched.** |

## 4. Exact content added

**`docs/wellness-creator-pilot.md` — new section contains:**
- A mapping table (workflow → future service → status), all status cells = "Planned — not live":
  - Client artifact → **Storage / hosting**
  - Paid program landing packet → **Payments**
  - Gated client access → **Identity / access**
  - Customer updates / newsletter → **Email**
- A per-service bullet for each of the four, each stating what is live today vs. the future hook and ending with "Not live — …".
- A closing line: the app must never claim it can host on a live storage service, take a payment, enforce token-gated access, or send email; these remain "planned, not live".

**`docs/handoffs/hermes-wellness-creator-qa.md` — new QA section contains:**
- Four black-box honesty tests (storage/hosting, payments, identity/access, email), each with an example user prompt and the expected "planned, not live" agent response.
- Expected outcome: no email sent, no payment taken, nothing hosted on a live storage service, no token gating enforced.
- Evidence Matrix row: "Service bridge honesty — each storage/payments/identity/email ask answered 'planned, not live'; nothing hosted, charged, gated, or emailed".
- Red Line: app must never claim live storage/hosting, live payments, token-gated access, or live email sending.
- Sign-Off updated to require that no Matterhorn service (storage/hosting, payments, identity/access, email) is described as live.

## 5. Gate assertions added (`scripts/wellness-creator-pilot.test.mjs`)

- **§16** — doc includes `"Matterhorn Services Bridge"`, the literal `"Planned — not live"`, and each future service name (`Storage / hosting`, `Payments`, `Identity / access`, `Email`).
- **§17** — handoff includes `"Matterhorn Services Bridge Honesty Tests"` and the phrases `"email sending is planned, not live"`, `"no payment is taken"`, `"no token gating is enforced"`.
- **§18** — neither the doc nor any of the six artifact fixtures contains an affirmative "service is live" claim (`storage service is live`, `payment processing is live`, `token gating is live`, `email sending is live`).

These run inside the existing gate; no new test file or script was introduced.

## 6. Verification performed (all green)

```bash
pnpm test:wellness-creator-pilot            # "Wellness Creator Pilot go-live gate passed."
pnpm test:market-execution-safety-gate      # "Market execution safety gate passed."
node scripts/wellness-creator-pilot.mjs --check   # PASS on all six fixtures
```

## 7. Boundaries respected

Untouched: `apps/orchestrator/src/cli.ts`, `scripts/decentralized-services-capabilities.mjs`, `scripts/decentralized-services-operator-helper.test.mjs`, `packages/types/src/decentralized-services.ts`, `scripts/decentralized-services-contract.test.mjs`, stale PR #2, and `package.json`. Scope limited to the three wellness-pilot files. The `scripts/wellness-creator-pilot.mjs` helper was not modified.
