# Product Hunt Release Execution Ledger - 2026-07-17

This is the active execution ledger for the Product Hunt candidate on
`codex/product-hunt-hardening-2026-07-21`. It complements, but does not
override, [Friday Beta and Product Hunt Launch Sequence](friday-beta-and-product-hunt-launch-sequence-2026-07-16.md)
and [Friday Production Go-Live Readiness](friday-production-go-live-readiness-2026-07-17.md).

## Current Decision

**Product Hunt: NO-GO until the external evidence gates are complete.**

The release is under scope freeze. Only correctness, recovery, accessibility,
security, performance, release evidence, and launch-operation work is allowed.
Do not add customer capabilities during this phase.

## 1. Scope Freeze And Dirty-Tree Ownership

Baseline taken on July 17 before the reload recovery fix:

| Path | Ownership | Action |
|---|---|---|
| `.opencode/package-lock.json` | Pre-existing local integration work | Preserve; never stage or rewrite in this release pass. |
| `.matterhorn-work/` | Local runtime data | Preserve; never stage, copy, or delete. |
| `notes/` | Untracked local/parallel-agent notes | Preserve; never stage, rename, or delete in this release pass. |
| `qa-reports/product-hunt-launch-audit-2026-07-17.md` | Independent QA evidence | Preserve unchanged unless its author updates it. |
| `qa-reports/matterhorn-*-2026-07-17*/` | Generated local QA evidence | Preserve for review; reference selected green summaries from this ledger rather than staging the report directories. |

This release pass owns only the reload recovery source, its focused test, this
ledger, and browser-smoke contract corrections. Generated evidence stays
untracked unless a release owner explicitly asks to archive it in Git.
Re-inventory before staging. A clean-looking Git tree is not a reason to remove
scratch, runtime data, or historical QA evidence.

### Release-Critical Fix In This Pass

- Engine reload now has a dedicated 30-second client deadline instead of the
  generic 10-second request deadline.
- Provider-list reconnection no longer blocks a successful engine reload. It
  retries briefly in the background while the user returns to a usable session.
- The reload toast no longer exposes the raw `Request timed out.` transport
  string. It keeps a normal retry action if the engine cannot confirm reload.

## 2. Human Acceptance

### Completed Locally

- Fresh-browser reload recovery smoke: local workspace engine reload completes,
  the toast clears, the session remains visible, and raw timeout text is absent.

### Still Requires A Named Human Owner

These checks cannot be truthfully automated from this local workstation:

1. MetaMask and Coinbase Wallet: connect, reject, approve a minimal testnet
   action, receipt, reload, disconnect, and no-signature persistence.
2. Phantom/Sui: connect, reject and approve external handoff, receipt, reload,
   disconnect, and no-signature persistence.
3. Hyperliquid testnet: reject, approve, public receipt/open order or fill,
   replay block, expiry block, limit block, kill-switch block, and disconnect.
4. Every visible OAuth connector: connect, cancel, reload, invoke a safe tool,
   disconnect, and verify token/error redaction. Disable any connector that
   cannot pass and label it `Coming soon` before tagging.
5. Two-person deployed acceptance: a new user and a returning user complete
   Home, chat, a desk, note, output, recovery, and sign-out/reopen journeys.

Record those results in
[`docs/product-hunt-acceptance-evidence.example.json`](product-hunt-acceptance-evidence.example.json)
using a redacted evidence path for every pass or fail.

## 3. Production-Like Release Rehearsal

Run from the exact candidate commit, never from a modified working directory:

```bash
pnpm exec bun test apps/app --timeout 30000 --reporter dots
pnpm exec bun test apps/server/src --timeout 30000 --max-concurrency 1 --reporter dots
pnpm --filter @matterhorn-work/app typecheck
pnpm build
pnpm audit:dependencies
pnpm test:matterhorn-platform-safety
```

Then repeat the local browser suite and the authenticated API probes against the
restarted candidate. The local run proves regression resistance only; it is not
proof of the deployed public domain, HTTPS, CORS, CSP, monitoring, backup, or
rollback behavior.

### Candidate-Local Results - 2026-07-17

All of the following completed against the local candidate on this branch:

| Gate | Result |
|---|---|
| App suite | 658 passing, 0 failing tests across 83 files. |
| Server suite | 715 passing, 0 failing tests across 58 files. |
| App typecheck | Pass. |
| Production build | Pass. Vite reported only its non-blocking large-chunk advisory. |
| Dependency audit | Pass: 1,341 locked versions, no low-or-higher advisories. |
| Matterhorn platform safety | Pass: all 10 stages, covering wallet approval, money-path security, local router and desktop perimeter, error boundaries, design, browser contracts, CORS, and product readiness. |
| Product browser smoke | Pass: 20 user-facing stages, with no network failures. Summary: `qa-reports/matterhorn-product-browser-smoke-2026-07-17-rerun-6/summary.json`. |
| Full platform browser audit | Pass: 104 surfaces, 11 interactions, 3,319 controls, and zero P0/P1 findings. Summary: `qa-reports/matterhorn-full-platform-browser-audit-2026-07-17-rerun-5/summary.json`. |

The browser checks include desktop, compact laptop, tablet, and mobile layouts;
all desk launches, session restoration, notes, memory, outputs, wallet settings,
AI/MCP settings, and launch-policy fallbacks for deliberately hidden billing,
generated-media, and cloud-account routes.

## 4. Pull Request And Candidate Consolidation

Current pull request: [#831](https://github.com/matterhornso/matterhorn-work/pull/831)
against `codex/friday-beta-rc1-2026-07-17`.

Before changing it from draft to ready:

1. Re-run the complete safety gate after the final release-hardening commit.
2. Stage only this pass's reviewed source, tests, and release documentation.
3. Confirm the preserved paths in section 1 remain unstaged.
4. Add exact commands, commit SHA, and evidence paths to the PR description.
5. Require a release-owner review of the scope boundary and an explicit
   confirmation that unavailable external services remain hidden or disabled.

No source result can convert Product Hunt to GO without the operator-owned
evidence below.

## 5. Launch Operations

The release owner must attach the exact immutable candidate SHA to the
machine-readable channel evidence, then run the gate in strict mode:

```bash
node scripts/launch-channel-readiness.mjs \
  --channel product-hunt \
  --evidence <redacted-evidence.json> \
  --strict --json
```

The remaining Product Hunt owners must supply evidence for:

- an immutable stable tag and exact HTTPS deployment;
- production-origin CORS, CSP/security headers, error/latency/provider-failure
  monitoring, alerts, backup/restore, and rollback drill;
- signed, notarized, stapled macOS distribution plus clean-install/update
  verification;
- public copy, privacy, terms, support links, staffed launch room, and incident
  escalation;
- the wallet, connector, and deployed two-user acceptance described above.

Use [`docs/product-hunt-operations-evidence.example.json`](product-hunt-operations-evidence.example.json)
for operations evidence. Missing, stale, or empty evidence is a blocking
NO-GO, not a soft warning.

## Evidence Log

| UTC timestamp | Workstream | Result | Evidence |
|---|---|---|---|
| 2026-07-17 | Reload recovery | Pass locally | Fresh-storage Playwright smoke against `http://127.0.0.1:5194`; toast dismissed after actual engine reload and no raw timeout was present. |
| 2026-07-17 | Code, browser, security, build | Pass locally | App 658/0, server 715/0, typecheck, build, dependency audit, and all 10 Matterhorn platform-safety stages passed. Green browser summaries are recorded in section 3. |
| Pending external owners | Devices, OAuth, deployment, distribution, operations | Blocking | Attach redacted evidence to the machine-readable channel packet. |
