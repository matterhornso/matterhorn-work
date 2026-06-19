# Handoff → Codex Build Coordinator: Wellness Creator Pilot

**From:** Claude (Wellness Creator Pilot owner)
**Date:** 2026-06-19
**Repo:** `matterhornso/matterhorn-work` (default branch `dev`)
**Scope:** the "Wellness Creator Pilot" use case — chat-first work creation for wellness creators (personal trainers, gym instructors, dieticians, yoga instructors). Non-trading. Demonstrates Matterhorn Work beyond crypto markets.

This handoff describes **exactly what has been built so far**. It is descriptive only.

## 1. PR / branch state

- **PR #389 — MERGED to `dev`** (squash-merge, 2026-06-19 12:31 UTC, merge commit `c174efa`). Docs-only baseline: pilot doc, Hermes QA handoff, a static gate, and the `package.json` script line. Live in `dev` now.
- **PR #395 — OPEN, CI green.** Branch `claude/wellness-creator-pilot-golive`, base `dev`. The go-live-ready expansion: runnable offline helper + gate, six reproducible artifact fixtures, full go-live runbook, hardened test.
- The original source branch `claude/wellness-creator-pilot` (behind merged #389) still exists on the remote; it is superseded by #395.
- #395 was branched from post-merge `dev`, so it applies cleanly and does not duplicate #389's content.

## 2. What the pilot does

A creator chats six canonical prompts and gets shareable client artifacts — no wallet, chain, file host, or payment account required. Web3 (decentralized storage, on-chain payments, token-gated access, creator subscriptions) is documented as **planned, not live**, never as a live capability.

**Canonical prompts (the gate pins these exact strings):**
1. `Create a 4-week fat-loss plan for a beginner`
2. `Turn this plan into client handouts`
3. `Create scripts for 10 short training videos`
4. `Create a client-facing artifact I can share`
5. `Prepare a paid program landing packet`
6. `Package this as a Matterhorn artifact / MCP workflow`

## 3. Files

**In `dev` already (from #389):**
- `package.json` — adds the script `"test:wellness-creator-pilot": "node scripts/wellness-creator-pilot.test.mjs"`. #395 does **not** modify `package.json`.

**In PR #395:**

| File | What it contains |
|---|---|
| `docs/wellness-creator-pilot.md` | Full spec + go-live runbook: target personas, end-to-end chat workflow, canonical prompts, live outputs, mandatory non-medical safety disclaimers, Web3-planned hooks, a reproducible-fixtures table, a "Pilot Contract (Offline Helper)" section, acceptance criteria, a go-live checklist, an operator demo script, success metrics, and a rollout/rollback section. |
| `docs/handoffs/hermes-wellness-creator-qa.md` | Black-box QA handoff: setup, happy-path workflow tests, medical-boundary refusal tests, Web3-honesty tests, an evidence matrix, offline gate commands, a P0–P3 issue ledger, red lines, and a sign-off gate. |
| `docs/wellness-creator-pilot/README.md` | Index of the artifact fixtures + a prompt→file table. |
| `docs/wellness-creator-pilot/01-training-plan.md` | 4-week beginner fat-loss plan (3 sessions/week, dumbbell + bodyweight), week-by-week progression. Carries the general disclaimer. |
| `docs/wellness-creator-pilot/02-client-handouts.md` | Per-session client handout cards derived from the plan. Carries the general disclaimer. |
| `docs/wellness-creator-pilot/03-nutrition-guide.md` | General healthy-eating guide: five habits, grocery list, meal-prep ideas. Carries the general disclaimer **and** the nutrition-specific disclaimer. |
| `docs/wellness-creator-pilot/04-video-scripts.md` | Ten short-form video scripts (hook / demo / cue / CTA) mapped to the plan. Carries the general disclaimer. |
| `docs/wellness-creator-pilot/05-client-artifact.md` | One combined, branded, client-facing artifact. Carries the general disclaimer. |
| `docs/wellness-creator-pilot/06-landing-packet.md` | Paid program landing packet with **placeholder** pricing/checkout (no payment taken). Carries the no-guarantee disclaimer and explicit "does not process payments" / "not live" framing. |
| `scripts/wellness-creator-pilot.mjs` | Offline planner + go-live gate (see §4). |
| `scripts/wellness-creator-pilot.test.mjs` | The `test:wellness-creator-pilot` gate (see §5). |

All six fixtures are generated for one worked example (the 4-week beginner program) so a live demo run can be compared against a known-good reference.

## 4. The offline helper — `scripts/wellness-creator-pilot.mjs`

Pure offline (no network, wallet, key, or payment). Modes:

- `--json` → emits a versioned contract `matterhorn.wellness.creator-pilot.v1` containing: personas, prompts (with expected outputs and their fixture filenames), the three disclaimers, the refusal policy, the four Web3 hooks (each `status:"planned"`, `live:false`), the go-live checklist, success metrics, and a `safety` object.
- `--check` → reads every fixture and validates each carries its required disclaimer marker, contains **no** medical diagnosis/prescription/cure/guarantee claim, and claims **no** Web3 rail is live; also asserts every Web3 hook is planned-not-live in the contract. Prints `PASS`/`FAIL` per fixture and **exits non-zero on any violation**.
- Rejects credential-shaped flags (`--private-key`, `--api-secret`, `--seed-phrase`, `--mnemonic`, etc.) with a non-zero exit and an explanatory message.

The contract's `safety` object is pinned to: `acceptsSecrets:false`, `givesMedicalAdvice:false`, `web3PaymentsLive:false`, `web3StorageLive:false`, `movesFunds:false`.

## 5. The gate — `scripts/wellness-creator-pilot.test.mjs`

`pnpm test:wellness-creator-pilot` asserts:
- docs, helper, and all seven fixture files exist;
- `package.json` exposes `test:wellness-creator-pilot`;
- all six canonical prompts appear in both the doc and the handoff;
- personas, outputs, and the go-live runbook section headers are present in the doc;
- all mandatory disclaimers are present in the doc;
- the doc **and every fixture** contain no affirmative medical/guarantee claim and no "Web3 rail is live" claim;
- each fixture carries its required disclaimer marker; the landing packet keeps pricing as placeholder and states no payment is processed;
- the handoff contains its safety/Web3-honesty/evidence-matrix sections;
- the helper emits the expected contract with the pinned safety flags, lists all canonical prompts, and has four planned-not-live Web3 hooks;
- the helper's `--check` exits 0 over the fixtures;
- the helper rejects a credential-shaped flag.

## 6. Verification performed (all green)

```bash
pnpm test:wellness-creator-pilot                  # "Wellness Creator Pilot go-live gate passed."
node scripts/wellness-creator-pilot.mjs --check   # PASS on all six fixtures, exit 0
pnpm test:market-execution-safety-gate            # passed
pnpm test:customer-ready-crypto-smoke             # passed
```

**CI on #395:** `customer-crypto-gates`, `i18n-audit`, `openwork-tests (blacksmith-4vcpu-ubuntu-2204)`, `openwork-tests (macos-14)` — all pass.

## 7. Boundaries respected

No changes to: `apps/server/src/server.ts`, `apps/server/src/tools/hyperliquid.ts`, `apps/server/src/tools/polymarket.ts`, `packages/matterhorn-work-mcp/index.mjs`, market safety gates, or submit/sign route code. No Hyperliquid/Polymarket/Bittensor backend routes were modified. The work is docs + an offline gate only — no runtime routes, no funds, no on-chain side effects; reverting #395 removes it cleanly.
