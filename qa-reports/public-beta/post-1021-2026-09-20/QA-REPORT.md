# Matterhorn post-1021 platform QA

Date: 20 September 2026. Scope: application UI/UX, authentication and isolation, model setup, all five desks, agent/runtime failure paths, usage accounting, files/memory/notes, integrations, and public release readiness.

## Verdict

**Not ready for unrestricted public beta acceptance.** The tested code and CI are green, including the accounting/runtime regressions, but the hosted release is behind, email/reset and backup readiness remain blocked, and this review reproduced a new navigation defect on both hosted and local builds. Passing local fixtures does not establish working production models, wallets, email, backups, or market integrations.

This was a QA/review pass. No product fixes, provider changes, signup activation, push, merge, or deployment were performed. No real wallet transactions or paid model calls were made. Existing unrelated workspace edits were preserved.

## Exact code and deployment identity

| Item | Identity |
|---|---|
| PR | https://github.com/matterhornso/matterhorn-work/pull/1021 |
| Merged into dev | `d659734f5be712464df26ef0ee6d933983bea5f3` |
| Merge time | `2026-09-20T13:11:02Z` |
| Local tested HEAD | `6a4577c0d28971981e398f775e5515278fd3cc7e` |
| HEAD and merge tree | Identical: `40c1a9e43cb9476caccf810ff25136a5c17e449e` |
| Hosted web and API during probe | `50ccdde690ad83b974b5ad13be53e5e8addac266` — older than PR1021 |
| Public app | https://matterhorn-desks-canary.vercel.app/ |

The local worktree also contains two pre-existing Project goal icon/test changes, which were not reverted or included in the merged-code claim. Local build/browser checks include those minor working-tree differences.

## Prioritized findings

### F1 — P1: returning from a public trust page traps navigation in the trust shell

**New, reproduced in the live app and the local merged-tree application.**

Steps:

1. Open Security from the sign-in/public entry page.
2. Click **Back to app**.
3. The URL becomes `/session`, but the page displays **Support | Matterhorn Desks**, not sign-in or the authenticated workspace.
4. A full browser reload restores the correct application.

Cause: `apps/app/src/index.react.tsx:24` captures `publicTrustEntry` once from the initial pathname. Its root selection at lines 122–131 continues rendering `PublicTrustBootstrap`. That bootstrap mounts the trust-only router. Internal React Router links to `/session` in `apps/app/src/react-app/domains/public/public-trust-route.tsx` change the route without remounting the app; the trust route's non-trust fallback at lines 623–625 renders Support.

Affected link implementations are around lines 589, 594, and 643–649 (logo, Open app, Back to app). The reproduced route was Security → Back to app; other exit links share the mechanism but were not individually certified.

Recommended fix: make links leaving the isolated public bootstrap perform document navigation (`reloadDocument`/ordinary anchors), or make the root routing decision reactive while preserving authentication boundaries. Add browser regressions from every public trust page for logged-out and authenticated users. Do not solve this by bypassing authentication.

### F2 — P1 release blocker: merged fixes are not the hosted release

The strict hosted probe expected merge `d659734...`; both web and API still reported `50ccdde...`. Therefore the browser-visible production behavior cannot be credited with PR1021's accounting/runtime fixes yet.

Deploy the approved exact release to the backend first, then web, and verify both SHAs. If F1 is fixed in a follow-up PR, use that new approved merge SHA consistently instead. Do not declare deployed simply because GitHub merge/CI passed.

### F3 — P1 public launch blocker: email and password reset are not ready

Fresh public health/config checks report:

- `emailDelivery: false`, `emailEvents: false`, `emailTransport: false`.
- `passwordReset: false`; auth config reports `passwordResetAvailable: false`.
- Signup remains `paused`; live UI disables account creation and reports password recovery unavailable.

This is a real dependency blocker, not a request to remove the safety gate. Configure and verify delivery/event handling, then exercise actual verification and reset emails, expiry/replay behavior, and successful sign-in after reset. The browser credential-changing step requires the account owner to complete it.

### F4 — P1 public launch blocker: backups are not configured/verified

The launch endpoint reports `backupConfiguration: false`, `backupFresh: false`, and `backup: false`. No restore exercise was performed in this audit.

Complete encrypted backup configuration and a disposable restore verification, including the expected data and operator recovery procedure. A green storage upload alone is not restore acceptance.

### F5 — P2: unconfigured web model setup still has an action gap

In a clean local web workspace, **Set up model** opens a page saying Connect provider/No models, but there is no usable end-user provider-connect action. Managed ASI:Cloud is unavailable in that fixture. The pending Bittensor task is preserved and Return to desk works; sending remains blocked, correctly.

The fixture intentionally has no external provider. This does **not** demonstrate that hosted inference is unavailable: the hosted readiness endpoint reports inference ready. It demonstrates that the unconfigured/degraded web state needs an actionable, role-appropriate recovery path, rather than a command the user cannot perform.

The **Subscribe** label under Shared model catalog is also ambiguous. Source (`shell/settings-route.tsx:1224–1247`, `domains/settings/pages/ai-view.tsx:751–781`) routes to Cloud account and opens the configured inference URL; it is not proof of a working checkout or subscription purchase. No purchase was attempted. Use a truthful setup/catalog label unless a billing flow exists.

### F6 — P2: wallet capability copy contradicts read-only operation

Observed in the local browser and confirmed in current source:

- Polymarket offers text about preparing wallet-reviewed buy/sell/cancel actions and a wallet-review badge.
- The same desk says Public Beta is read-only and wallet actions stay hidden.
- Both compact and full Tools summaries label **Reviewed wallet actions — Available**.

Relevant code: `domains/session/chat/session-page.tsx:976,1127`; `domains/settings/pages/hosted-mcp-summary.tsx:46–65,443–459,535–556`.

Derive capability labels and starter copy from actual enabled deployment capabilities. This is not a recommendation to enable wallet actions without acceptance tests.

### Performance advisory — large chunks need real profiling

The production web build succeeds but warns about large chunks. Observed output includes Shiki ~1,854 kB (401 kB gzip), experimental translations ~946 kB (225 kB gzip), and Bittensor wallet vendor ~896 kB (330 kB gzip). These are emitted assets, **not a measured initial-download total**; lazy loading and route behavior matter.

Profile actual login/home/desk navigation on a throttled device before setting a release performance verdict. No live Core Web Vitals or Lighthouse score was measured here.

## Fresh automated verification

| Check | Result | Scope/limits |
|---|---|---|
| Frontend Bun suite | **1,165 passed, 0 failed**, 7,484 assertions, 170 files | Fresh local run |
| App TypeScript | Passed | Fresh local run |
| Production web build | Passed, 8.51 seconds | Large-chunk warnings above |
| Auth, backend-security, model-usage suites | **114 passed, 0 failed**, 957 assertions, 3 files | Fresh targeted backend run |
| Inbox boundary, artifact files, memory, notes suites | **30 passed, 0 failed**, 356 assertions, 4 files | Fresh targeted backend run |
| Post-merge Desks Tests workflow | Success, run `35512755077` | Merge commit |
| Post-merge Security workflow | Success, run `35512755103` | Merge commit |
| Post-merge i18n workflow | Success, run `35512755024` | Merge commit |
| Post-merge macOS arm64 Alpha workflow | Success, run `35512755047` | Merge commit |
| Strict hosted release probe | **25 passed, 5 failed** | Failure is expected with current release/dependencies; not waived |

The prior pre-merge full backend run (1,708 tests), ten safety gates, and server typecheck were recorded on the same source tree. They are corroborating prior results, **not new full-suite executions in this pass**, and are not added to the fresh counts above. An initial targeted command contained two nonexistent test paths; Bun ran three actual files. Coverage was subsequently run using the correct inbox/artifact/memory/notes paths, as listed separately above.

### Real OpenCode runtime, synthetic inference

Pinned OpenCode `1.18.31`, binary SHA-256 `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`, with the real local Matterhorn gateway and guard plugin. No upstream update was needed/performed during this QA pass.

| Probe | Result |
|---|---|
| Lost acknowledgement + retry | All five desk agents completed. 15 prompt POST attempts produced only 5 inference calls and one user-message copy per desk. A fresh retry caused **zero additional inference**. **5,000 used = 5,000 charged; zero pending requests.** |
| Rejected abort and recovery | Failed stop did not falsely declare the still-busy runtime stopped. Successful stop and recovery completed. **6,000 used = charged; zero final pending requests.** |
| Read-tool loop | Actual runtime completed a read tool and supplied the result to synthetic inference. **7,000 used = charged; zero pending requests.** |
| Symlink outside workspace | Tool rejected the escaped path; outside marker did not reach provider/history. **7,000 used = charged; zero pending requests.** |

Secret-input negative control was rejected before inference. A raw runtime request without a bound gateway run was blocked before inference (internal guard 409, outer generic 500). The latter could have better error presentation, but it did not bypass the guard.

The tool-loop and symlink probes used a bounded forced runtime stop during fixture cleanup; their assertions passed, but cleanup did not exit gracefully in those two modes. Generated runtime fixtures were removed by the harness. These are runtime/guard/accounting checks, **not hosted paid-provider, external market-data, or real-wallet acceptance**.

Artifacts: [retry](./runtime-retry.jsonl), [stop/recovery](./runtime-stop.jsonl), [tool loop](./runtime-tool.jsonl), [workspace boundary](./runtime-boundary.jsonl).

## Browser and UI coverage

Tested with the Codex in-app browser against hosted public pages and an isolated local lifecycle fixture using ordinary authentication. No authentication bypass was used.

| Journey | Observed result |
|---|---|
| Hosted sign-in/public entry | Loads; signup paused and recovery unavailable accurately displayed |
| Security → Back to app | **Fails** as F1; full reload recovers |
| Local account A sign-in/sign-out; B sign-in | Works through the form |
| Account switch | Settled B workspace shows neither A's unsent draft nor A's saved memory |
| B directly opens known A chat/workspace URL | Returns to B's own workspace; no A content displayed |
| Private AI entry | Opens a blank chat directly, without requiring a crypto desk |
| Bittensor, Hyperliquid, Polymarket, Sui | Compact desk flows render; no claim that external data/actions are accepted |
| Task → model setup → return | Pending task preserved; no prompt sent; return works |
| Private setup | Honest server-managed Venice requirement and operator setup guidance; not falsely activated |
| Memory | Seeded saved record visible to A; explicit selection creates a Memory task/context chip; B sees no saved record |
| Tools | Managed summary renders; capability-copy issue F6 |
| Custom MCPs/connectors | Browser explains desktop-only/not-yet-open limitations; arbitrary custom hosted MCP installation is not available |
| Browse crypto apps | Unconfigured gateway fallback renders with built-in desk links; external app connection not verified |
| Cloud | Signed-in local profile renders; “Cloud sync connected” is session-derived and does not establish independent Cloud service acceptance |
| Responsive sample | At 390 × 844, Models/private setup and Polymarket showed no horizontal document overflow; mobile navigation exposes tools and all five desks |
| Keyboard/focus sample | Tab reached More model settings with visible focus styling; sampled Polymarket controls had accessible names |
| Browser console sample | No errors/warnings returned at the checked point; not a continuous whole-session guarantee |

Memory selection and a context chip demonstrate the UI preparation path, not that a real hosted model used the memory in its answer. Unsent synthetic drafts were not sent to an external provider. Two-account tests here do not certify all cross-tab cache invalidation, all multi-device behavior, or production tenant isolation.

### Design/a11y audit boundaries

Impeccable's audit checklist guided accessibility, responsiveness, content integrity, theming, and performance review. Its selected-directory detector returned no findings, which is not equivalent to passing accessibility conformance. No product changes resulted from the skill.

- Accessibility: sampled names, focus, and navigation checked; full keyboard journey and actual screen-reader acceptance remain open.
- Responsive: selected narrow-screen routes checked; complete breakpoint/device matrix remains open.
- Integrity: F1, F5, F6 and deployment capability claims above.
- Performance: build diagnostics only; no measured field/lab acceptance score.
- Theming: no complete light/dark/high-contrast review.

No aggregate numerical design/WCAG score is assigned because the untested dimensions would make it misleading. Skill context also flags legacy design-context schema/Register drift; that documentation can be refreshed separately, without treating old context as current product direction.

## Hosted release gate detail

[Full strict probe](./hosted-release-probe.json), generated `2026-09-20T13:38:43.722Z`.

The five failures are web SHA, API SHA, signup status, signup security dependencies, and launch readiness. `/health/launch` returns **503/not_ready**. Infrastructure, verification requirement, legal acceptance/versions, usage enforcement readiness, Turnstile, provider privacy, inference, app URL, and signup capacity report true. Email delivery/events/transport, password reset, backup configuration/freshness/aggregate backup report false.

Positive hosted checks include HTTPS, security headers, same-origin API/runtime proxy routing, unauthenticated JSON 401 responses, API health, expected guarded runtime mode, exact trusted-origin CORS, and rejection of the untrusted origin. Readiness flags are configuration signals, not substitutes for end-to-end external-service tests.

## Remaining acceptance before public beta

1. Fix F1 and capability/setup copy in a narrowly scoped, regression-tested follow-up PR. Review and merge; record the final release SHA.
2. Deploy that exact approved SHA to Railway, then Vercel. Verify reported API and web SHAs match. Current deployment instructions are in `docs/handoffs/pr-1021-deployment-handoff-2026-09-20.md`; update the target SHA if a follow-up supersedes it.
3. Configure email transport/events, verification/reset, and encrypted backups. Complete real email and restore exercises; retain timestamped results without secrets.
4. Use authenticated hosted test accounts to verify tenant isolation and complete a real model answer on Private AI, Bittensor, Hyperliquid, Polymarket, and Sui. Verify external data freshness/error behavior, usage totals, retry/stop accounting, and memory use with a benign marker.
5. Where wallet actions are intended for launch, complete reject/expire/tamper/approve acceptance with the wallet owner and an explicitly approved safe network/amount. Otherwise retain read-only behavior and label it accurately.
6. Complete Safari, Firefox, full keyboard, screen-reader, mobile, and live performance acceptance. Test provider outages, exhausted allowance, disconnected integrations, and expired sessions on hosted infrastructure.
7. Re-run the strict probe with the exact final SHA and expected public signup state. Enable public registration only after dependencies and acceptance are green; monitor delivery, inference errors, usage/holds, isolation errors, and backup freshness with rollback ownership.

The requested target is **public beta**, not an invite-only product. The current paused state is a dependency-protection state, not the intended launch mode.

## Explicitly not certified

No authenticated hosted session was supplied during the audit, so hosted model responses, production account isolation, account creation/email/reset completion, real wallet signing, payment/checkout, Cloud provisioning, arbitrary hosted extensions/MCP installation, and backup restore remain unverified or blocked. No claim of “everything fully functional” or comprehensive penetration-test certification is made.

## Cleanup

Temporary browser tabs were closed and the responsive viewport override reset. The isolated local browser fixture is stopped after the audit; its disposable local data is retained for reproduction. Other user servers, tabs, source edits, and previous QA records are preserved.
