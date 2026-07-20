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

The July 17 desktop artifacts remain tied to
`a2382305277e5b7b946ea14a61e79ebf53da8034`. The current tracked base is
`05bde6c446e75edb330f5add04e02d0428689790`, with reviewed July 18
release-hardening changes still present as an intentionally dirty working-tree
diff. It is therefore not yet an immutable candidate. Draft
[PR #831](https://github.com/matterhornso/matterhorn-work/pull/831) targets
`dev`; the final approved PR head and a fresh machine-readable readiness packet
are authoritative for release.

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
| App suite | 659 passing, 0 failing tests across 83 files. |
| Server suite | 715 passing, 0 failing tests across 58 files. |
| App typecheck | Pass. |
| Production build | Pass. Vite reported only its non-blocking large-chunk advisory. |
| Dependency audit | Pass: 1,341 locked versions, no low-or-higher advisories. |
| Matterhorn platform safety | Pass: all 10 stages, covering wallet approval, money-path security, local router and desktop perimeter, error boundaries, design, browser contracts, CORS, and product readiness. |
| Product browser smoke | Pass: 20 user-facing stages, with no network failures. Summary: `qa-reports/friday-production-go-live-2026-07-17/current-candidate/product-browser-smoke-final2/summary.json`. |
| Full platform browser audit | Pass: 104 surfaces, 11 interactions, 3,329 controls, and zero findings. Summary: `qa-reports/friday-production-go-live-2026-07-17/current-candidate/full-platform-browser-audit-final/summary.json`. |

The browser checks include desktop, compact laptop, tablet, and mobile layouts;
all desk launches, session restoration, notes, memory, outputs, wallet settings,
AI/MCP settings, and launch-policy fallbacks for deliberately hidden billing,
generated-media, and cloud-account routes.

### Local QA Stack Requirement

Browser task starts require a connected agent engine. For local QA, use the
supported managed-engine mode rather than starting the HTTP server by itself:

```bash
OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local
```

For this run, the same requirement was satisfied by starting the server with
`OPENWORK_MANAGE_OPENCODE=1` and the bundled OpenCode sidecar. A server can
answer `/health` while still returning `opencode_unconfigured` for task routes;
the required readiness check is the workspace control-plane response reporting
`opencode_connection: working` and `start_desk_task: ready`.

## 4. Pull Request And Candidate Consolidation

Current pull request: [#831](https://github.com/matterhornso/matterhorn-work/pull/831)
against `dev`.

Before changing it from draft to ready:

1. Re-run the complete safety gate after the final release-hardening commit.
2. Stage only this pass's reviewed source, tests, and release documentation.
3. Confirm the preserved paths in section 1 remain unstaged.
4. Add exact commands, commit SHA, and evidence paths to the PR description.
5. Require a release-owner review of the scope boundary and an explicit
   confirmation that unavailable external services remain hidden or disabled.

No source result can convert Product Hunt to GO without the operator-owned
evidence below.

## July 18 Final QA And Hardening Update

The scope freeze remains active. This update records the comprehensive
UI/UX, frontend, backend, security, recovery, and DevOps pass performed on the
current hardening tree without replacing the historical July 17 results above.

### Current Local Results

| Gate | Result |
|---|---|
| App suite | Pass: 601 tests, 0 failures, 3,930 expectations across 82 files. |
| Server suite | Pass: 733 tests, 0 failures, 5,156 expectations across 61 files. |
| Standalone typechecks | Pass: app, server, and Electron. |
| Production build | Pass: web, server, and desktop bridge. |
| Dependency audit | Pass: 1,341 locked versions and no low-or-higher advisories. |
| Secret-pattern scan | Pass for tracked and source-like untracked files. The Cudos key previously shared in conversation must still be rotated before launch. |
| Matterhorn platform safety | Pass: all 10 stages. |
| Product browser smoke | Pass: all 20 stages and zero network failures. |
| Full browser audit | Pass: 104 surfaces, 11 interactions, 3,293 controls, zero findings, zero console/page errors, and zero failed requests. |
| Dark responsive acceptance | Pass: desktop and mobile home/chat, no overflow or errors. |
| Persistence | Pass across managed-engine restart for session, notes, and memory. |
| Backup and restore | Pass: restore applied and verified with an exact portable-digest match. |
| Public sign-in Lighthouse | Pass: desktop performance 0.83, mobile 0.98, accessibility 1.00, best practices 0.96, and SEO 1.00. |
| Docker artifact | Not built locally because Docker is unavailable; config and syntax contracts pass and CI must build it. |

### Hardening Added

- The public sign-in route is separated from the authenticated app shell.
- Wallet and experimental translation runtimes are deferred from first load.
- Public Cloud session discovery uses a cookie-backed `/v1/me` check instead of
  browser bearer credentials.
- Public web readiness requires an authenticated same-origin proxy.
- Deployment probes reject SPA HTML fallbacks on API and engine endpoints.
- Vercel source now declares CSP, framing, MIME, referrer, permissions, HSTS,
  and opener policies.
- Request-rate limiting, quiet healthy-state behavior, hidden reasoning by
  default, pinned OpenCode checksums, and CI/Docker secret handling are covered
  by focused tests and the platform safety gate.
- UI Control setup now launches the shipped `matterhorn-work-ui-mcp` package
  from Codex, Claude, Cursor, and Electron instead of the retired
  `openwork-ui-mcp` package path.
- Connected server summaries translate the stable `matterhorn-work`
  compatibility identity to the customer-facing `Matterhorn Desks MCP` name.

### Remaining Blocking Evidence

The public launch remains **NO-GO** until one exact candidate has:

1. a production HTTPS deployment with authenticated same-origin API and engine
   routing, exact-origin CORS, security headers, and deployed-commit identity;
2. a stable tag and a green strict readiness packet;
3. signed, notarized, stapled macOS assets plus clean-install/update evidence;
4. real MetaMask, Coinbase, Phantom/Sui, Hyperliquid, and visible OAuth
   connector acceptance;
5. deployed two-user and cross-workspace authorization acceptance;
6. alert delivery, rollback, legal, support, launch-room, and incident-owner
   evidence;
7. rotation of the Cudos credential previously exposed in conversation.

Full details and evidence paths are in
`qa-reports/launch-qa-2026-07-18/summary.md`. The current machine-readable
public-beta packet is
`qa-reports/public-beta/evidence-05bde6c4-2026-07-18.json`.

## July 18 Release Scope And Integrity Refresh

The current source state has now passed the complete local release preflight:

| Gate | Result |
|---|---|
| Frozen dependency install | Pass: `pnpm install --frozen-lockfile --ignore-scripts`. |
| Dependency audit | Pass: 1,341 locked versions and no low-or-higher advisories. |
| App suite | Pass: 601 tests, 0 failures, 3,930 expectations across 82 files. |
| Server suite | Pass: 733 tests, 0 failures, 5,156 expectations across 61 files. |
| Typechecks | Pass: app, server, and Electron. |
| Production build | Pass: server, web renderer, desktop bridge, and Matterhorn Desks Automation Helper. Vite emitted only its documented non-blocking chunk advisories. |
| Platform safety | Pass: all 10 stages. |
| Secret scan | Pass: 936 source files, 0 findings, and 0 oversized files skipped. |
| Dirty-tree guard | Pass: 392 candidate-review paths, 361 preserve-only paths, and 0 protected paths staged. |
| Diff integrity | Pass: `git diff --check`. |

The deterministic commands are:

```bash
pnpm release:secret-scan
pnpm release:scope-inventory -- --strict
```

Their current reports are
`qa-reports/product-hunt/release-secret-scan.json` and
`qa-reports/product-hunt/release-scope-inventory.json`. These reports stay
preserve-only unless the release owner explicitly chooses to archive them.

The product name is now **Matterhorn Desks** on launch-visible surfaces.
Existing `matterhorn-work`, `OPENWORK_*`, and OpenCode-compatible internal
identifiers remain in place where changing them would break packages, stored
workspaces, environment contracts, or client compatibility. They are not
customer-facing brand copy and require a separately versioned migration after
launch.

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
| 2026-07-17 | Code, browser, security, build | Pass locally | App 659/0, server 715/0, typecheck, build, dependency audit, and all 10 Matterhorn platform-safety stages passed. Green browser summaries are recorded in section 3. |
| 2026-07-17 | Managed local engine and full browser sweep | Pass locally | The engine readiness probe reported `opencode_connection: working`; product smoke passed 20 stages and the full browser audit passed 104 surfaces, 11 interactions, and 3,329 controls with zero findings. |
| 2026-07-17 | Exact-head CI | Pass | GitHub Actions run `29588807987` passed macOS, Ubuntu, customer crypto, and Matterhorn platform safety; the separate i18n check also passed on `a2382305`. |
| 2026-07-17 | Unsigned macOS preflight | Pass for local testing only | `qa-reports/product-hunt-local-preflight-a2382305/` contains the arm64 DMG/ZIP, checksums, updater metadata, release-doctor report, and clean-profile proof. The strict public verifier correctly blocks Developer ID signing, notarization, Gatekeeper, and app/DMG staples. |
| 2026-07-18 | Initial full local code and UX QA snapshot | Pass locally | App 598/0, server 733/0, all standalone typechecks, production build, dependency audit, and all 10 platform-safety stages passed before the final branding refresh. |
| 2026-07-18 | Final release scope and integrity refresh | Pass locally | App 601/0, server 733/0, all typechecks, production build, all 10 safety stages, 936-file secret scan with zero findings, and strict dirty-tree guard with zero protected paths staged. UI Control resolves to `matterhorn-work-ui-mcp`; the live connected-server label is `Matterhorn Desks MCP`. |
| 2026-07-18 | Full browser and responsive acceptance | Pass locally | Product smoke passed 20/20 stages. Full audit passed 104 surfaces, 11 interactions, and 3,293 controls with zero findings/errors/failures. Dark desktop/mobile acceptance also passed. |
| 2026-07-18 | Recovery | Pass locally | `qa-reports/launch-qa-2026-07-18/backup-restore/report.json` records an applied and verified restore with an exact portable-digest match; persistence also survived managed-engine restart. |
| 2026-07-18 | Public deployment and desktop distribution | Blocking | Local headers and artifact integrity pass. Static same-origin API/engine routes, deployed commit identity, signing, notarization, Gatekeeper, and staples remain unproven or fail as expected. |
| Pending external owners | Devices, OAuth, deployment, distribution, operations | Blocking | Attach redacted evidence to the machine-readable channel packet. |

## July 19 Public Beta Candidate Certification

The scope freeze remains active. This pass added a single resumable command for
local candidate certification and fixed a repeat-build defect in the macOS
Automation Helper.

### Engineering Changes

- `pnpm certify:public-beta` now runs the scope guard, secret scan, dependency
  audit, complete app and server suites, all typechecks, production build,
  platform safety, and optional live browser acceptance.
- Every stage has a timeout, redacted log, SHA-256 digest, and source-content
  fingerprint. A changed source tree invalidates prior evidence and changes the
  decision to `NO-GO-SOURCE-CHANGED-DURING-RUN`.
- Resume ignores preserve-only QA output but never reuses a stage against
  changed candidate source.
- The certifier emits partial launch evidence plus the canonical 32-gate
  public-beta readiness report. It never turns missing deployment or human
  evidence into `GO`.
- A new strict release-candidate manifest hashes all 399 reviewable paths,
  assigns them to seven launch buckets, and blocks protected staging,
  unclassified source, or an unexpected HEAD. The current snapshot has zero
  staged candidate paths, zero staged protected paths, and zero unclassified
  paths.
- Repeat macOS desktop builds now clear extended attributes from the Automation
  Helper immediately before ad-hoc signing. This fixes the deterministic
  `resource fork, Finder information, or similar detritus not allowed` failure.

### Current Local Evidence

The July 19 run against the live local app passed all 11 stages with stable
source:

- app: 686 passing, 0 failing across 88 files;
- server: 733 passing, 0 failing across 61 files;
- app, server, and Electron typechecks: pass;
- repeat production build: pass;
- complete 10-stage platform safety gate: pass;
- live customer-flow browser acceptance: pass with zero warnings, errors, or
  network failures;
- protected staged paths: zero;
- source secret findings: zero.

Evidence:

```text
qa-reports/public-beta/candidate-local-2026-07-19-final/
```

The refreshed 12-stage packet, including the hashed manifest, is generated at:

```text
qa-reports/public-beta/candidate-local-2026-07-19-final-v2/
```

The machine-readable manifest is the source of truth for the candidate digest;
the digest is not copied into this tracked ledger because this ledger is itself
part of the hashed source set.

The decision remains `LOCAL-GREEN-NOT-IMMUTABLE` because the reviewed
hardening diff is not yet consolidated into one commit. Public Beta remains
`NO-GO`: 11 of 32 canonical gates have current local evidence and 21 require
immutable-release, deployed-environment, integration, distribution, legal, or
operations evidence.
