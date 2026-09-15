# Matterhorn solo build block — 15 September 2026

## Ownership and time boundary

The user has assigned all remaining development and QA to Codex alone. No subagents or CTO delegation. This supersedes the ownership split in the earlier CTO delivery plan, not its security requirements. Previously CTO-owned server integration, email and backup diagnostics are now Codex work; missing credentials or infrastructure authority must still be reported rather than invented.

Window: **2026-09-15 17:07–20:07 UTC** (22:37 IST to 01:37 IST on 16 September). Follow-ups resume this same task; stop new changes at the deadline, summarize and pause the heartbeat. A scheduler is best-effort and does not guarantee uninterrupted execution while the host is unavailable.

Workspace: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime`.
Starting branch: `codex/opencode-1-18-31`; PR #1017 into `dev`; initial head `701d6a3021bb0190e0cc4df2d2e011748b37ad25`.

## Scope and controls

Build reproducible fixes, test, commit and push updates to the existing draft PR. No merge, deployment, signup activation, production-secret changes, paid resource creation or wallet signatures without applicable explicit approval. Read-only production diagnostics and local isolated tests are in scope. Preserve unrelated untracked handoffs and QA artifacts.

Prioritize security and usable core beta over new product surface area. Do not disable audits or privacy checks to turn failures green. Do not claim simulation results as live acceptance. No global runtime replacement is required.

## Execution plan

| Window | Implementation and checks | Exit condition |
| --- | --- | --- |
| 0–35 min | Update the locked Rust dependency affected by RUSTSEC-2026-0285; inspect accompanying warnings; add a regression check if needed; compile the locked example; push the focused change and inspect CI. | Vulnerable rustls version removed; compilation and relevant guards pass. |
| 35–85 min | Determine available authenticated browser/test-account access; trace preflight, message acceptance, engine dispatch, provider output and UI delivery. Test Private AI plus Bittensor, Hyperliquid, Polymarket and Sui with harmless read-only prompts. Test selected-memory attachment. Fix failures only after identifying their boundary. | Per-desk result with version/model, status and sanitized timing; distinguish real inference from fixtures. |
| 85–125 min | Exercise login/logout, password-reset contracts, two-account access denial, privacy proof expiry, memory deletion and usage reservation/reconciliation. Test pending/error/retry UX without weakening controls. | Reproducible defects patched with regression tests; unavailable real-account acceptance explicitly blocked. |
| 125–155 min | Inspect current readiness and existing email/backup implementations. Validate environment names and presence without values where access permits. Test local email contracts and backup/restore against disposable data. | Verified delivery/restore when authorized infrastructure permits, otherwise exact missing capability and safe setup steps. |
| 155–180 min | Review all changes, run affected tests plus release safety checks, inspect remote CI, update draft PR and final report. | Tested commits pushed, CI state recorded, concrete user needs and release decision documented. |

If an external dependency blocks a workstream, move to the next safe local item; do not spend the whole window polling. Reserve the last 25 minutes for verification. If a change cannot be validated, keep it out of the ready release scope.

## Deferred from this timebox

Full multi-project/worker provisioning, arbitrary executable hosted extensions, automatic cross-chat memory retrieval, third-party crypto gateway activation and the 1,255-file OpenWork 0.18.47 migration require separate scoped releases. OpenCode 1.18.31 is already the PR candidate. Do not label OpenWork as upgraded.

## Required report

- PR/head and tests with exact pass/fail or blocked outcomes.
- Live versus local/fixture coverage for each desk, memory and authentication.
- Security findings and what was changed (never secret values).
- Email, reset, backup and restore verification status.
- Remaining owner decisions/access needed from the user, since there is no separate CTO.
- No-go versus invite-only readiness; signup remains paused unless separately authorized after acceptance.

## Progress

- Started: confirmed clean tracked tree and sole-agent ownership.
- Initial remote CI: ten checks passed; Rust dependency security failed on rustls 0.23.37. Official advisory identifies 0.23.45 or later as patched. Local cargo-audit is not installed; use CI and a temporary local installation if needed.
- Security implementation: locked rustls updated to 0.23.45, with its resolved aws-lc and webpki updates. Added a fail-closed dependency-graph check: a failed cargo lookup can no longer be mistaken for an unreachable vulnerable dependency. Six regression tests cover patched/unaffected versions, vulnerable duplicates, RSA/LRU reachability and command failures.
- Verification: `cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets` passed (temporary target directory, two build jobs); `node scripts/rust-dependency-policy.mjs` passed on the actual all-target graph; six policy tests and `pnpm test:security-workflow-contract` passed; secret scan found zero issues. Remote audit remains the authority for the current complete advisory database.
- Source: [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285.html). Existing audit warnings for unmaintained proc-macro-error2/rustls-pemfile and yanked chacha20/spin are not fixed by the rustls patch; they need separate dependency-path review. No additional advisory exemptions were added.
- Sixteen local tests passed across public-launch readiness, host-backup readiness, auth email outbox and email transport. These use fixtures and do not prove real SES delivery or cloud restoration.
- Fresh hosted `/health/ready`: ready, guarded runtime off. `/health/launch`: not ready; email delivery/events/transport, password reset and backup configuration/freshness are false. Inference configuration reports true, which is not proof of a real model response.
- Browser tab 4 is open on the canonical sign-in page and marked for handoff; signup is paused and Forgot password is disabled. Requested that the user sign in with a disposable test account; no credentials were requested in chat. No authenticated acceptance has run yet.
