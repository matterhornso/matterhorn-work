# Permanent restored UI: verification and release limits

## Candidate

Branch: `codex/permanent-restored-ui-2026-10-13`, directly based on `dev` at
`ff0fee42b375e3dc58cbc73918d0093fa2eded40` (merged #1033).
The public frontend was observed serving that same base SHA with the retro UI.
This is a forward fix, **not a repository reset to #1027** or an import of the
unmerged #1032/#1034 stack. There is no database migration.

The approved pre-retro UI is now the sole UI. Removed: retro/minimal opt-ins,
bootstrap hooks, stylesheet, alternate launcher/model/settings/memory/composer
branches, unused props and retired-only tests. Later backend authorization,
accounting, privacy, routing and persistence behavior remains in place.

Bounded parity fixes retain Account/profile/sign-out without optional Cloud;
keep selected workspaces and conversations visible; and expose labelled mobile
navigation and its Close action. Model filtering, consent, drafts and single-flight
submission retain regression coverage. Light/dark preferences are preserved.

Implementation commit: `d688fdeed02c26f77cbc8008a9d0dba783e13f45`.
Production PR: [#1035](https://github.com/matterhornso/matterhorn-work/pull/1035).

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Full platform safety gate | PASS | `pnpm test:matterhorn-platform-safety`; offline/local contracts, not live desk acceptance |
| Final frontend regressions | 1,321 passed, 0 failed; 8,105 assertions, 190 files | `bun test apps/app/tests` |
| App typecheck | PASS | `pnpm --filter @matterhorn-work/app typecheck` |
| Server typecheck | PASS | `pnpm --filter matterhorn-work-server typecheck` |
| Public web build | PASS | `build:web`, including both retired flags deliberately set to `1` |
| Composer Chromium suite | 9 passed, 0 failed, 1 optional capture skipped | 42 assertions: five real desk buttons/order, keyboard, mobile close/focus, model filtering/draft, consent, retry, single-flight |
| Platform + STM Chromium component suites | 24 passed | Synthetic fixture coverage; STM remains off in product/runtime |
| Corrected light/dark capture confirmation | 2 passed | Fixture theme initialization fixed; no product theme change |
| Normal-auth local app | PASS | Signup 202, verification 200, password sign-in 200, authenticated session; all five desks visible, profile visible |
| Built production-bundle browser check | PASS | Source commit above, normal sign-in 200 and `/session` entry; model setup and Profile open; five desks visible at 390/1440px, both themes, zero browser errors, absent retro marker |
| Responsive captures | Reviewed | 390/768/1440px, both themes, reduced motion; actual browser and component evidence separated below |
| JS complete lock audit | 0 advisories (was 16) | Development and optional dependencies included; severity threshold unchanged |
| Dependency/Rust policy regressions | 17 passed | Node 24.20.0; isolated loopback proxy/download/checksum/timeout coverage |
| Rust compile and audit | PASS | quinn-proto 0.11.19; existing RSA exception unchanged, graph proves unreachable |
| Strict release secret scan | PASS | 1,231 scanned source files; zero findings or oversized files |
| Workflow contract and diff whitespace | PASS | No audit bypass or new suppression |

Initial sandbox runs could not bind loopback sockets. Full reruns with local
network permission passed. Two stale design assertions were updated to test the
remaining implementation; safety behavior was not weakened. A redundant
metadata-only test was removed after the 1,322-test run; the final 1,321-test run
instead verifies desk order against the real browser component.

See [dependency evidence](DEPENDENCY-SECURITY.md) for exact versions, advisory
scope, provenance and remaining informational Rust warnings.

The source-commit production build was checked separately from Vite development
captures using the same isolated disposable data. Its four confirmation captures
and JSON assertions remain in `/private/tmp/matterhorn-permanent-preview.QRrYFB`.
The original approved user preview was not restarted. The development harness's
fresh `/session` welcome behavior did not reproduce in the built public-web
configuration: its ordinary sign-in and `/session` workspace entry passed.

## Review evidence

Independent finish review: **no introduced P1/P2 findings**, disposition `ship`
at the inspected source/capture scope. Reviewer inspected 11 actual-app and 15
component captures, ran 42 targeted tests/227 assertions and reviewed dependency
compatibility. This is not authorization to merge/deploy or a claim of live
inference acceptance.

### CI feedback and corrections

Initial published-head CI surfaced two findings despite local passes:

1. CodeQL #224 interpreted an array `.includes()` assertion in the new isolated
   Electron proxy fixture as URL substring validation. Replaced it with exact
   full-request-list equality, also rejecting unexpected/duplicate proxy requests.
   The 17 dependency/Rust regressions pass; no dismissal or suppression was used.
2. The existing Polymarket capability test assumed the dated jurisdiction policy
   remained current on the wall clock. CI correctly denied preparation after its
   4 October review deadline. The regression now exercises both sides of that
   deadline with isolated databases and restores the test clock in `finally`.
   Runtime/policy tests: **58 passed**, 266 assertions. Production policy and
   authorization are unchanged; new-position preparation remains denied pending
   a separately authorized policy review. This is not proof of trading readiness.

On the initial published head, Linux/macOS tests, crypto gates, dependency
review, repository security, Rust audit/compile and public-beta container builds
passed. The corrected final head must complete its own CI; do not substitute the
earlier head's outcomes.

The following CI run cleared CodeQL, including zero open findings on the PR ref,
and all dependency, repository-security, Rust, Linux/macOS, crypto and container
checks. Full platform safety reached the documentation gate and caught omitted
navigation/safety contract statements in the new restored-only guide. Those
statements were restored; the gate was not weakened. The targeted design gate
passes. The final full local safety rerun then passed all 11 stages with isolated
localhost test servers permitted outside the sandbox bind restriction. An
independent documentation review found no issues and confirmed sidecar narrative
parity. Exact-head CI results must be verified separately on PR #1035.

Representative normal-auth captures (disposable local account; no model engine):

- [Desktop dark](captures/app/home-dark-1440.png)
- [Mobile light](captures/app/home-light-390.png)
- [Mobile workspace menu](captures/app/menu-light-390.png)
- [Account/profile](captures/app/profile-dark-1440.png)

Representative synthetic component captures:

- [Model picker](captures/components/picker-light-390.png)
- [Mobile settings](captures/components/settings-dark-390.png)

The complete 101-image capture set remains local; only six representative images
are included to keep review size bounded. The model control in the restored
empty state is labelled **Set up model**, not a standalone Models menu item.
The QA probe's exact-label `Models` lookup was false; that does not mean model
setup was missing. Existing approved previews and their chats were not changed.

## Limits / release conditions

- Local normal-auth UI testing has **no provider or engine**. No new live model
  response, hosted five-desk response, transaction signing or production account
  operation was performed by this change.
- New-head CI must be checked on the PR; a local pass is not a CI result.
- Default-branch Dependabot #43 remains open until GitHub reevaluates a merged
  candidate. It reports http-cache-semantics <=4.2.0; this candidate uses 4.3.0,
  outside that range. It was inspected, not dismissed.
- Production binding, backend image rollout, email delivery/recovery, backups and
  two-account hosted isolation require operator evidence.
- Safari, Firefox and full packaged-desktop acceptance were not run here.
- The inherited light-theme wallet warning palette is pale; review found no
  introduced regression. Do not claim a fresh WCAG certification.
- The user explicitly approved updating DESIGN.md/sidecar and active examples to
  document only the restored UI. Historical redesign plans are superseded, not
  instructions to restore retired flags or layouts. No retired UI code remains available.
- No merge, deployment, production secret/configuration change, account reset,
  provider-policy bypass, STM activation, or signing was performed.

Use the [deployment handoff](../../../docs/handoffs/permanent-restored-ui-deployment-2026-10-13.md)
for the exact operator procedure and acceptance checklist.
