# Matterhorn Work Customer-Readiness Final QA Report - 2026-06-18

## Recommendation

Matterhorn Work is ready for a controlled test-customer QA pass on the current Bittensor, Hyperliquid, Polymarket, MCP, CLI, and browser shell surfaces.

This is not a production-custody recommendation. Hyperliquid and Polymarket remain read/preview/external-signer/public-receipt only. Bittensor remains non-custodial with unsigned previews, external-signer handoffs, receipt evidence, monitoring, and gated adapter canaries.

## Scope Tested

- Worktree: `/private/tmp/matterhorn-full-qa`
- Branch: `codex/full-customer-readiness-qa`
- Commit tested: `2cb5bea52326102612f25a7b97df2dbd56b65345`
- OS: macOS / Darwin arm64 local machine
- Runtime versions:
  - Node: `v25.3.0`
  - pnpm: `9.15.9`
  - Bun: `1.3.11`
  - Python: `3.9.6`

No private keys, seed phrases, API secrets, raw signatures, signed payloads, signed extrinsics, wallet exports, exchange credentials, or real customer funds were used.

## Setup And Build Gates

Passed:

```bash
pnpm install --frozen-lockfile
pnpm --filter matterhorn-work-server build
pnpm --filter @matterhorn-work/app typecheck
pnpm --dir packages/types build
```

Notes:

- `pnpm install --frozen-lockfile` required rerun outside the sandbox because network access to `registry.npmjs.org` is restricted in the Codex sandbox.
- Install completed with expected ignored-build-script warnings for packages such as `hyperliquid`, `msw`, and `sharp`.

## Unified Crypto And Customer Gates

Passed:

```bash
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
pnpm smoke:customer-ready-crypto
pnpm test:crypto-cli-fallback
pnpm test:unified-crypto-chat
pnpm test:unified-crypto-shared-card-contract
pnpm test:agent-crypto-operator-loop
pnpm test:crypto-readiness-api
pnpm test:customer-readiness-ui
pnpm test:hermes-crypto-customer-qa
pnpm test:customer-crypto-ci-workflow
pnpm test:crypto-direct-prompt-safety
pnpm test:market-safety-contract
pnpm test:market-customer-qa-runbook
pnpm test:agent-control-api-docs
```

Sandbox notes:

- `pnpm test:crypto-cli-fallback` and `pnpm smoke:customer-ready-crypto` hit loopback `listen EPERM 127.0.0.1` in the sandbox and passed when rerun outside the sandbox.

## Bittensor Deep QA

Passed:

```bash
bun test apps/server/src/tools/bittensor.test.ts
pnpm test:bittensor-customer-readiness-gate
pnpm test:bittensor-receipt-check
pnpm test:bittensor-watch-autopilot
pnpm test:bittensor-watch-autopilot-scheduler
pnpm test:bittensor-signing-handoff-check
pnpm test:bittensor-adapter-canary-gate
pnpm test:bittensor-real-adapter-candidate-gate
pnpm test:bittensor-adapter-readonly-canary
pnpm test:bittensor-customer-evidence-bundle
pnpm test:bittensor-customer-evidence-verify
```

Sandbox notes:

- `pnpm test:bittensor-adapter-readonly-canary` hit a sandbox loopback/listener issue and passed when rerun outside the sandbox.

Not run:

- Optional live public SS58 wallet/stake QA was not run because no public coldkey/validator-hotkey inputs were provided during this pass.

## Hyperliquid And Polymarket QA

Passed:

```bash
pnpm test:hyperliquid-readiness-gate
pnpm test:polymarket-readiness-gate
pnpm test:hyperliquid-read-preview-qa
pnpm test:polymarket-read-preview-qa
pnpm test:market-live-readonly-smoke
pnpm test:market-receipt-qa
pnpm test:market-receipt-evidence
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-capture
pnpm test:market-official-sdk-validation-doctor
pnpm test:market-official-sdk-normalize
pnpm test:market-official-sdk-operator-loop
pnpm test:market-official-sdk-validation-fixtures
pnpm test:market-sdk-run-manifest-check
pnpm test:market-customer-evidence-bundle
pnpm test:market-customer-evidence-verify
pnpm test:crypto-customer-packet
```

Sandbox notes:

- `pnpm test:hyperliquid-read-preview-qa` and `pnpm test:market-live-readonly-smoke` hit sandbox loopback `listen EPERM 127.0.0.1` and passed when rerun outside the sandbox.

Safety conclusions:

- No Hyperliquid or Polymarket live submit route exists.
- Market previews and handoffs remain `canSubmit: false`.
- Compliance-blocked Polymarket previews do not carry executable order fields.
- Official SDK validation remains testnet/dev-gated and non-custodial.

## MCP, CLI, And API QA

Passed:

```bash
pnpm test:agent-control-mcp
pnpm test:crypto-cli-fallback
pnpm test:crypto-customer-packet
```

Sandbox notes:

- `pnpm test:agent-control-mcp` hit sandbox loopback `listen EPERM 127.0.0.1` and passed when rerun outside the sandbox.

Validated behavior:

- Unified crypto HTTP, MCP, and CLI surfaces stay aligned.
- Client-facing receipt import examples use `Authorization: Bearer <client-token>`.
- Host-token headers remain scoped to host/admin routes.

## Browser UI And UX QA

Tested with the in-app browser against local dev stacks.

Browser paths tested:

- Direct server plus Vite fallback:
  - App shell loaded.
  - Empty/no-session state rendered.
  - Wallet rail opened.
  - Missing-engine error path reproduced, fixed, and retested.
- Default documented wrapper:
  - `pnpm dev:headless-web`
  - Server health returned `ok`.
  - Vite returned HTTP 200.
  - App loaded at `http://127.0.0.1:55730/`.
  - `New task` created session `ses_126a7689cffeoKDIYd06RLSsak`.
  - Composer rendered with `Describe your task...`.

Fixed during this pass:

- `CR-QA-001`: user-facing session startup error no longer exposes raw `OpenCode unavailable`, `opencode_unconfigured`, or `OpenCode base URL` copy. It now says `Matterhorn Work engine unavailable` with a plain-English retry/restart message.

Retested and not reproduced:

- `CR-QA-002`: initial `pnpm dev:headless-web` failure was not reproducible. Rerun outside sandbox started the documented stack, returned healthy endpoints, and passed browser session creation.

Screenshots:

- No screenshot file was saved because the in-app screenshot command timed out after the temporary stack was stopped. Browser text evidence and endpoint evidence are recorded in `qa-reports/customer-readiness-issues-2026-06-18.md`.

## Security Audit

Static scans run:

```bash
rg -n "privateKey|seedPhrase|mnemonic|walletExport|rawSignature|signedPayload|apiSecret|signedExtrinsic|keyfile"
rg -n "/api/hyperliquid/.*/submit|/api/polymarket/.*/submit|orders/submit"
rg -n "X-Matterhorn-Host-Token|Authorization: Bearer" apps packages docs scripts
```

Findings:

- Secret-shaped hits were limited to docs, test fixtures, forbidden-field guards, and safety copy.
- Submit-route hits were limited to docs/tests/negative assertions.
- No live Hyperliquid/Polymarket submit route was found.
- Receipt-import panel command uses `Authorization: Bearer <client-token>`.

Additional negative/safety tests passed:

```bash
pnpm test:crypto-direct-prompt-safety
pnpm test:market-execution-safety-gate
pnpm test:market-safety-contract
```

## Issue Summary

See `qa-reports/customer-readiness-issues-2026-06-18.md`.

- P0: 0 open
- P1: 0 open
- P2: 0 open
- P3: 0 open

## Remaining Caveats

- Optional live Bittensor wallet/stake QA with public SS58 inputs still needs to be run before a live-wallet demo.
- UI testing covered shell/session/wallet/error paths and static customer-readiness checks, but not every responsive viewport and every individual crypto card in a live browser. The static card/router contract gates passed.
- Local loopback tests must be rerun outside the Codex sandbox before being treated as product failures.

## Final Status

Ready for controlled test-customer QA with accepted caveats above.
