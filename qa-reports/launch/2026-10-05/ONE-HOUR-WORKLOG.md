# Matterhorn one hour launch fix

The owner authorized a one-hour continuation, dismissal of CodeQL alert #205 only, and no deployment. Work runs from 5 October 2026 12:47:19 UTC until 13:47:19 UTC (20:47:19–21:47:19 Asia/Singapore). Stop starting work at that deadline; finish running safe checks and report remaining release gates honestly.

## Scope and checkout

- Checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-search-discovery-2026-10-02`.
- Branch: `codex/search-discovery-2026-10-02`; PR #1032.
- Starting pushed head: `77c1ad2b78f0c7c0af193c6c9dfc1b2938658b6e`.
- Preserve preview port 47931, its data and chats, and any existing 63719 runtime data. Current 47931 preview is provider-free and is not functional model acceptance.
- No deployment, production configuration/secrets changes, auth/consent bypass, wallet signing or paid-resource creation.

## Execution plan

1. Dismiss only the documented false-positive CodeQL #205 and recheck aggregate security status.
2. Fix ordinary Account navigation and signed-in identity/sign-out independently of optional Cloud workers/billing. Add targeted route and rendering regressions.
3. Locate the previously configured CUDOS provider through known project/runtime metadata without printing secrets. Start an isolated functional runtime if usable credentials remain available; exercise model selection and representative real responses on all five desks.
4. Inspect desktop/mobile Account and model flows, run regressions/typecheck/build, independently review the diff, then push a reviewed candidate and wait for exact-head CI before any merge.
5. Record exact commits, local versus real-provider versus hosted evidence, and deployment instructions. The owner deploys; this task does not.

## Evidence and progress

- 12:53:04 UTC: GitHub confirmed alert #205 dismissed as `false positive`. The approved explanation distinguishes SHA-256 of a random 32-byte session token from password scrypt hashing. No other alert dismissed; no query suppression or cryptographic change.
- At starting head, all ten conventional PR checks passed. After the dismissal, the separate aggregate CodeQL check also passed; `gh pr checks 1032` returned all eleven checks green at `77c1ad2`. No other alert was changed.
- Account routing is corrected: `cloud-account` is an ordinary settings destination, independent of optional Cloud feature gates. Both full and compact views retain authenticated identity, sign-out and account security. Organization management and onboarding remain gated; no auth endpoint, cookie, permission or cleanup semantics changed. The header no longer implies unavailable Cloud configuration.
- Final frontend suite: **1,517 passed, zero failures, 8,701 assertions across 197 files**. Focused Account/navigation/render group: **70 passed**. Direct frontend TypeScript check, web build and diff check pass. The build retains its existing large-chunk warnings. Independent review found no actionable regression and separately passed 51 related tests.
- Actual local Chromium verification: the direct Account URL survives reload, shows the existing sample identity and Sign out/security controls, and has document width 390 at a 390px mobile viewport. Desktop and mobile captures are `account-fixed-desktop.jpg` and `account-fixed-mobile.jpg`. The preview's existing chats/data were preserved; no destructive account controls were invoked. Actual logout was not used on the owner's preserved preview session; failure/success callbacks and security lifetimes have regression coverage, not a new hosted logout claim.
- The documented old 63719 runtime is not listening, its temporary provider stores contain no provider files, and the narrowly checked standard OpenCode stores have no CUDOS credential. No secret values were printed. The owner was asked for the exact existing secure source path. Real-provider response tests are **blocked**, not passed.
- The isolated launcher at `provider-functional/launch.mjs` is ready for an explicit owner-only env-file source. Three local launcher checks pass and independent source review found no remaining scoped issue. Maintained runtime startup with manual approvals, guarded enforcement, verified-only policy, isolated storage and normal auth routes passed without a provider. Its new process group and listeners were verified stopped; original preview PID 8268 remains. Zero inference requests and zero new accounts were created. `provider-functional/RESULTS.json` records exact commands, cleanup and Darwin-only artifact dependency; these optional tests are not portable CI or live acceptance.
- Account fix commit: `1f698e1c40fe0228971d35ef090d3dabea4ba140`. Normal UI navigation Settings → Account → Back to app and direct Account reload both pass. Configuration-template and Vercel same-origin proxy contract tests also pass. The Impeccable/Uncodixfy pass preserves existing retro components and themes; only pre-existing design metadata drift and typography advisories were reported, not silently repaired.
- Merge is additionally held pending confirmation that merging `dev` will not auto-deploy. The owner explicitly prohibited deployment; the GitHub deployment list was empty and does not prove Vercel/Railway auto-deployment is disabled.

## Remaining gates

No deployment has occurred. Hosted web/API previously reported `0d209fb4d3ab0d4beb62610b801f455aed09e398`, not PR #1032, with guarded runtime off. Hosted real responses, normal account/inbox acceptance, backup restore and encryption evidence remain separate from this local fix block. Missing credentials or services must be reported, not replaced with synthetic success claims. See `docs/handoffs/deployment-owner-2026-10-05.md` for the deployment owner's coordinated artifact, configuration, acceptance and rollback checklist.
