# Matterhorn Desks post-merge QA — 2026-08-19

## Scope

- Source baseline: `dev` at `2901f2b359ff29779e2fb2ccdd465b29fae2e66e` (PR #873 merge).
- Hosted public candidate: `https://matterhorn-desks-canary.vercel.app/` at web/API commit `4049b26e5c62e99a255ad809695950c98138de11`.
- Guarded runtime: `off`, as approved for the initial rollout.
- Signup policy: `paused`.

## Outcome

No P0 source regression was found. One P1 wallet reliability/privacy issue was reproduced and fixed locally: the approval path repeated transaction simulation through a browser public RPC after the workspace backend had already simulated the exact transaction. The browser call could hang wallet approval and disclose wallet-linked transaction data to an additional RPC operator.

The corrected flow:

1. Performs initial simulation and gas estimation through the authenticated workspace backend.
2. Refreshes the exact simulation immediately when the user approves.
3. Binds the fresh result to chain, connected account, recipient, value, full calldata, selector, and timestamp.
4. Rejects stale, future-dated, or mutated results before calling the wallet.
5. Never treats gas-estimate failure details as safe raw UI content.

A stale MCP audit assertion was also corrected. The product correctly displayed the current `Wallet MCP` and `Crypto MCP` connections as Ready; the audit still required the retired single `Matterhorn Desks MCP` label. The gate now accepts any non-empty named connected-server summary and requires a visible Ready state for every named connection.

## Exact-tree verification

- App: 948 tests passed across 134 files; 0 failed.
- Server: 928 tests passed across 88 files; 0 failed.
- App and server typechecks: passed.
- App production web build and server build: passed.
- Matterhorn platform safety gate: all 10 stages passed.
- Secret scan: 1,020 source files, 0 findings.
- Dependency audit: 1,406 locked versions, 0 low-or-higher advisories.
- Bundle gate: passed.
  - Public entry graph: 433,048 B.
  - Public trust graph: 302,386 B.
  - Session route: 154,227 B.
  - Session page: 593,361 B.
  - Settings route: 257,041 B.
  - Largest wallet chunk: 896,388 B.

## Local functional acceptance

- Full platform audit: 108 surfaces, 12 interactions, 2,854 controls, 0 issues, 0 console errors, 0 page errors, 0 network failures.
- Product journey: 22/22 stages passed across Home, all five desks, reviewed-action handoff, direct-link reload, activity/history, Notes, Memory, Wallet, Models, MCPs, Billing, and Generated Media.
- Wallet review: 7/7 stages passed, including failed-simulation blocking, rejection without submission, Base Sepolia approval handoff, and mainnet blocking.
- Notes and Memory: 7/7 stages passed.
- Outputs: 6/6 stages passed.
- Generated Media: 14/14 stages passed through image creation, local NFT draft, Walrus fixture, and Sui mint/listing previews and receipts.
- Billing: correctly hidden by launch policy.

The local wallet acceptance uses an injected EIP-1193 wallet and deterministic RPC fixtures. It proves application logic and wallet handoff boundaries; it does not certify a real extension or live-chain transaction.

## Hosted public verification

- Deployment probe: 27/27 checks passed.
- HTTPS, HSTS, CSP, referrer policy, permissions policy, no-sniff, exact-origin CORS, same-origin app/API routing, build-commit reporting, and guarded-runtime readiness passed.
- Public routes `/`, `/privacy`, `/security`, `/support`, `/terms`, and `/status` hydrated at 320, 375, 768, and 1440 px without horizontal overflow, unnamed visible links/buttons, or duplicate IDs.
- The in-app browser screenshot API was unavailable, so this run does not claim a new hosted screenshot comparison or trace-based performance audit.

## Remaining release gaps

### P1 — hosted acceptance not yet certified

Run authenticated acceptance against the exact deployment intended for launch:

- real model completion;
- two-account workspace/session/preflight/receipt isolation;
- real wallet-extension handoff and rejection;
- testnet reviewed transaction preparation, expiry, tamper rejection, and valid approval;
- reload/session restoration.

### P1 — account lifecycle is intentionally incomplete

Production reports signup `paused` and password recovery unavailable. Opening signups requires the approved signup policy change plus verified outbound email for verification and password reset. The UI correctly discloses the paused state, but public onboarding is not launch-complete while these controls remain disabled.

### P1 — privacy enforcement is not active in production

Guarded runtime is healthy but set to `off`. The approved rollout still requires a shadow window, decision comparison, and then staged enforcement. Direct browser public-RPC reads for wallet balance, bytecode, ENS, and Sui state can disclose wallet-linked addresses to infrastructure providers; transaction simulation and gas estimation are now server-routed, but the remaining read traffic should move behind the same privacy boundary.

### P2 — external integrations

- Real MetaMask, Coinbase Wallet, Bittensor extension, Sui wallet, and provider-network coverage remains outstanding.
- Production backup/restore evidence, rollback rehearsal output, and alert delivery should be captured for the exact launch commit.
- Trace-based Core Web Vitals and physical iOS/Android keyboard, safe-area, VoiceOver, and TalkBack checks remain hardware/tooling gaps.

## Governance state

PR #874 (`Fix market launch governance drift`) is open as a draft, mergeable, and all current checks are green. It was not merged or deployed during this QA because merge/deploy approval has not been given.
