# Friday Beta and Product Hunt Launch Sequence - 2026-07-16

This is the active launch router after the schedule changed from a Friday public
production release to a controlled Beta on Friday, July 17, 2026, followed by a
Product Hunt launch on Tuesday, July 21, 2026. The older Friday production
ledgers remain historical evidence; they do not authorize either new channel.

## Decisions Today

- **Friday controlled Beta:** eligible for GO after the exact candidate is
  consolidated, rebuilt, rerun through the complete gate, restricted to named
  testers, and assigned a support and rollback owner.
- **Product Hunt:** NO-GO until the final HTTPS deployment, real wallets,
  visible OAuth connectors, signed desktop distribution, monitoring, backup,
  rollback, public copy/legal, and deployed two-user acceptance all pass from
  one immutable tag.
- The currently running local acceptance URL is
  `http://127.0.0.1:5194/workspace/ws_028bfb4e9ee2/session`. It is available on
  this Mac without a sign-in step. It is ephemeral, not remotely shareable, and
  not Product Hunt evidence. Start a managed local stack with
  `OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local` before treating chat or
  desk-task acceptance as valid.

## Current Candidate Evidence

The intentionally dirty integration tree was consolidated on
`codex/friday-beta-rc1-2026-07-17`. The scope-frozen post-Beta hardening
candidate now lives on `codex/product-hunt-hardening-2026-07-21`; its final
commit, not this working directory, becomes the next candidate identifier.
The artifact manifest is the authoritative exact-commit identifier for
distribution.

The July 16 exact-candidate closure is technically green:

- app suite: 556 passed, 0 failed, 3,727 assertions across 74 files;
- server suite: 711 passed, 0 failed, 5,007 assertions across 57 files;
- app, server, and Electron typechecks: passed;
- production web build and exact-source Electron directory package: passed;
- complete 10-stage Matterhorn platform-safety gate: passed;
- dependency audit: 1,341 locked versions checked with zero advisories at low
  severity or higher;
- live release doctor: 11 passed, 0 skipped, 0 failed;
- packaged desktop authenticated clean-profile smoke: 16 passed, 0 failed;
- DMG, ZIP, manifest, checksums, DMG filesystem, and ZIP payload integrity:
  passed;
- local desktop and mobile route acceptance: no crash signatures, console
  errors, warnings, off-screen controls, or horizontal overflow on the stable
  journeys;
- Bittensor fallback handling now refuses to invent subnet recommendations when
  live tool evidence does not contain explicit matching subnets.

The private arm64 tester artifact is under the hash-bound
`qa-reports/friday-beta-final-<git-sha>/tester-artifact/` directory generated
from the final candidate. It remains unsigned and unnotarized, so it is eligible
only for the named private cohort with the documented Gatekeeper and uninstall
instructions. It is not a public download.

The Friday Beta remains **NO-GO** until the release owner records the named
cohort, staffed support channel, and verified rollback procedure against the
final candidate. Product Hunt remains **NO-GO** until every deployed, wallet,
connector, signing, operations, and public-copy gate also passes.

After exact-candidate evidence is regenerated, the Beta machine gate retains
three operator-owned blockers: named tester access, staffed support, and a
verified rollback procedure. The prior numeric gate snapshot is historical;
use `launch-channel-readiness.mjs --list-gates --json` and the final
machine-readable evidence packet as the authoritative count and decision.

Product Hunt remains **NO-GO** until the exact release/tag, deployed
HTTPS/security/operations, real wallets and OAuth, signed distribution, public
legal copy, two-user acceptance, and launch-room staffing are all evidenced.

## Frozen Beta Scope

The Friday Beta includes local project workspaces, chat, response perspectives,
Notes, Memory review, Outputs, Bittensor public reads and external handoffs,
Polymarket research and handoffs, Sui public reads and external-wallet
handoffs, the Longevity workflow, and Hyperliquid research/previews. The code
also contains a separate web-only Hyperliquid trade ticket that binds an exact,
short-lived intent to a connected-wallet signature.

Hyperliquid submission remains fail-closed unless the operator enables
`MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=true`. Enable it only for the named
test cohort after the real testnet reject, approve, receipt, replay, expiry,
limit, and kill-switch packet passes. Agents, MCPs, CLI commands, watches, and
background workflows cannot submit orders. Polymarket remains preview and
external-handoff only. Billing, generated-media publishing, Matterhorn Cloud,
marketplace deployment, hiring, and payments stay hidden or explicitly coming
soon.

## Thursday, July 16 - Candidate Closure

1. Freeze scope and inventory every tracked change by product area and owner.
2. Keep unrelated scratch and historical QA evidence untracked; do not delete
   it to make Git appear clean.
3. Finish launch-critical desktop, backend, frontend, and security fixes.
4. Run focused tests after each fix, then full app/server suites, all
   typechecks, production builds, dependency audit, and platform safety.
5. Run the stable production API probe with deferred services disabled.
6. Run local desktop/mobile acceptance for Home, chat, every side panel, every
   desk, Longevity, AI provider selection, Notes CRUD, Memory, Outputs, and
   Preferences.
7. Consolidate only reviewed release files into one exact candidate commit.
8. Fill `docs/launch-channel-evidence.example.json` with evidence paths and run
   the Beta gate. A pending row is a NO-GO, not a warning.

```bash
node scripts/launch-channel-readiness.mjs \
  --channel beta \
  --evidence qa-reports/friday-production-go-live-2026-07-17/current-candidate/launch-channel-evidence.json \
  --strict --json \
  --json-output qa-reports/friday-production-go-live-2026-07-17/current-candidate/beta-readiness.json \
  --markdown-output qa-reports/friday-production-go-live-2026-07-17/current-candidate/beta-readiness.md
```

## Friday, July 17 - Controlled Beta

1. Rebuild from the exact candidate commit, not the working directory.
2. Rerun the Beta gate; evidence must be less than 24 hours old.
3. Give access only to the named tester cohort. Do not publish an unsigned
   desktop download or describe the loopback build as public production.
4. Run one clean new-user journey and one returning-user journey before invites.
5. Verify provider-offline, model-timeout, backend-restart, wallet-rejection,
   and stale-session recovery paths.
6. Start the support channel and record every P0/P1 issue against the candidate.
7. Stop invitations for any auth bypass, data loss, secret exposure, wallet
   boundary failure, persistent crash, or unrecoverable task failure.

## Weekend - Beta Burn-In

1. Triage Beta feedback daily by severity and affected journey.
2. Fix only launch-critical regressions; preserve the frozen feature scope.
3. Verify every fix with a regression test and the affected browser journey.
4. Complete MetaMask, Coinbase Wallet, Phantom/Sui, and Hyperliquid testnet
   device acceptance. Capture public receipts and redacted intent metadata only.
5. Connect, reload, use, and disconnect every connector still visible in the UI.
   Disable any connector that cannot pass and label it `Coming soon`.
6. Complete production domain, CORS, CSP/security headers, monitoring, backup,
   restore, rollback, privacy, terms, and support configuration.

## Monday, July 20 - Product Hunt Candidate

1. Freeze one immutable Product Hunt tag and matching release notes.
2. Deploy that exact tag behind HTTPS and rerun the production API probe.
3. Build signed and notarized desktop assets in CI. Verify signature,
   notarization ticket, stapling, Gatekeeper, checksums, updater metadata, and a
   clean install on a separate Mac profile.
4. Run strict responsive acceptance and two-user smoke against the deployed URL.
5. Run backup/restore and rollback drills against production-shaped state.
6. Fill the Product Hunt evidence rows and run the gate. Evidence must be less
   than 12 hours old at the final Tuesday decision.

```bash
node scripts/launch-channel-readiness.mjs \
  --channel product-hunt \
  --evidence qa-reports/product-hunt-2026-07-21/launch-channel-evidence.json \
  --strict --json \
  --json-output qa-reports/product-hunt-2026-07-21/readiness.json \
  --markdown-output qa-reports/product-hunt-2026-07-21/readiness.md
```

## Tuesday, July 21 - Product Hunt Launch Room

1. Rerun every required gate from the stable tag and deployed URL.
2. Confirm no P0/P1 Beta issue remains open and all Product Hunt gate rows pass.
3. Verify support, incident escalation, dashboards, provider latency, wallet
   rejection/approval metrics, task completion, and rollback owners are live.
4. Publish web and desktop surfaces only after Engineering, Security,
   Product/UX, and Operations each record GO.
5. Monitor continuously through the launch window. Roll back rather than
   bypassing auth, signing, entitlement, CORS, or external-wallet controls.

## Hard Stop-Ship Rules

- Any missing or stale required evidence is NO-GO.
- Any visible connector without real acceptance is disabled before public launch.
- Any unsigned or unnotarized public macOS asset is NO-GO.
- Hyperliquid execution cannot be advertised until its real testnet packet passes.
- Local mock, fixture, or loopback evidence cannot satisfy a deployed production
  gate.
- Deferred services cannot be enabled by copy or environment drift.
