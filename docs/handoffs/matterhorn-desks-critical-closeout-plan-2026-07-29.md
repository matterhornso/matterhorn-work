# Matterhorn Desks critical closeout plan - 2026-07-29

## Objective

Ship one reproducible Matterhorn Desks release candidate for the public web app
and macOS desktop app. The candidate must preserve the product's non-custodial
boundaries, isolate every signed-in organization's data, provide a working live
model path, and present only capabilities that are actually available.

No new feature work enters this candidate. A failed critical check reopens the
candidate and requires a new commit, build, and evidence set.

## Stop-ship conditions

- A signed-in user can read or mutate another organization's workspace, memory,
  notes, watches, task history, outputs, or wallet ledger.
- The public web app stores a user's provider or wallet secret in a shared
  server-level credential store.
- Chat or a desk task has no usable live model provider.
- A protocol surface claims submission when it only creates a preview or
  external handoff.
- A wallet action can bypass explicit review, wrong-chain checks, policy limits,
  or user cancellation.
- Signup, login, logout, session restoration, or a fresh user's first workspace
  fails in the deployed web build.
- The deployed web bundle or distributed DMG does not match the approved commit.
- A P0 or P1 defect remains open.

## Phase 1 - Freeze and inventory

1. Record branch, commit, package versions, runtime versions, and dirty-tree
   inventory.
2. Group intentional changes into auth/isolation, model runtime, protocol
   safety, UI/product truth, release automation, and evidence.
3. Exclude unrelated scratch files, generated outputs, local workspace data,
   parallel-agent reports, and secrets from staging.
4. Run secret scanning before creating the release commit.

Exit criteria:

- Every staged file has an identified release purpose.
- No credential, local database, wallet artifact, or private QA fixture is
  staged.

## Phase 2 - Authentication and tenant isolation

1. Verify first-party email/password registration, login, logout, current
   session, duplicate-email handling, invalid credentials, and expired session
   behavior.
2. Provision one deterministic Matterhorn workspace per organization.
3. Require the authenticated organization boundary on every browser data route.
4. Scope notes, memory, task runs, outputs, wallet events, Bittensor watches,
   Hyperliquid watches, and Polymarket watches to that boundary.
5. Verify desktop bearer-token access remains compatible with the isolated local
   runtime.
6. Test two accounts concurrently and prove cross-account identifiers return a
   non-disclosing denial.

Exit criteria:

- Automated auth/isolation suite passes.
- Two-account browser acceptance shows no shared workspace data.
- Session cookies are HTTP-only, SameSite protected, and Secure in production.

## Phase 3 - Live model runtime

1. Configure ASI:Cloud/CUDOS in the managed agent runtime from
   `CUDOS_API_KEY`; never place the key in generated config or browser storage.
2. Remove the legacy hard-coded model-catalog dependency. Allow only an explicit
   `MATTERHORN_MODELS_URL` override.
3. Treat deployment-managed web inference separately from desktop BYOK:
   - web users see provider availability but cannot write machine-global keys;
   - desktop users may add a key to their isolated local runtime.
4. Replace customer-facing OpenCode terminology with Matterhorn agent-runtime
   language while retaining internal protocol compatibility.
5. Verify model discovery, selection, reasoning effort, response streaming,
   cancellation, retry, provider outage, and recovery.

Exit criteria:

- A fresh web account receives a real model response without adding an API key.
- No provider secret appears in HTML, storage, logs, config output, or API
  responses.
- Provider outage produces a concise recoverable error and never hangs.

## Phase 4 - Protocol and wallet boundaries

### EVM

- MetaMask discovery, connect, cancellation, account change, wrong-chain
  handling, policy-limit rejection, simulation failure, approval, and receipt.
- Mainnet remains blocked unless the reviewed release policy explicitly enables
  it.

### Sui

- Phantom/Sui-standard discovery, connect, cancellation, account/network
  change, transfer preview, review, wallet signature, and receipt.
- Signing stays in the wallet; no seed phrase, private key, or raw signature is
  accepted.

### Hyperliquid

- The agent gathers missing order terms, creates an exact review ticket, and
  cannot submit from watches or autonomous tasks.
- Submission occurs only after the connected wallet signs the short-lived
  intent and all server safety gates pass.
- Test cancellation, stale quotes, excess notional, wrong account, duplicate
  submission, partial fill, failure, and receipt states.

### Polymarket

- The agent accepts a URL, slug, or natural-language market search; it should
  not require a URL when market discovery can resolve the intent.
- Verify market resolution, eligibility/compliance checks, order preview,
  external-client handoff, cancellation, and receipt import.
- The UI must not imply Matterhorn submits a Polymarket trade unless that
  production path is truly enabled.

### Bittensor

- Verify public SS58 reads, subnet/validator comparison, stake/delegate
  transaction preparation, policy review, unsigned payload export, external
  signer handoff, and receipt evidence.
- Matterhorn must never claim to sign or broadcast Bittensor actions.

Exit criteria:

- Automated fail-closed and contract suites pass for all protocols.
- Owner acceptance completes one controlled happy path and the critical failure
  paths with approved test accounts and small test assets.

## Phase 5 - Product truth and usability

1. Audit every route, panel, modal, menu, button, empty state, loading state,
   error state, tooltip, and responsive breakpoint.
2. Make actions visually distinct from static status text without returning to
   a box-heavy interface.
3. Keep healthy states quiet and move implementation detail behind progressive
   disclosure.
4. Remove duplicate, stale, dummy, QA-only, OpenWork, and customer-facing
   OpenCode copy.
5. Verify keyboard navigation, focus order, escape behavior, accessible names,
   contrast, clipping, overflow, and reduced motion.
6. Test the complete chat lifecycle: new session, desk context, model and
   perspective controls, attachments, command/skill/extension/MCP menus,
   streaming, cancellation, retry, reload, outputs, notes, and memory.

Exit criteria:

- Browser acceptance has no P0/P1 finding at desktop and narrow viewports.
- Every visible action works, is disabled with a reason, or is removed.

## Phase 6 - Security and operations

1. Verify CORS allowlist, HSTS, CSP, secure cookies, request-size limits, rate
   limiting, origin enforcement, CSRF posture, redaction, and error handling.
2. Run dependency, secret, route-authorization, traversal, symlink, archive,
   injection, SSRF, and tenant-isolation tests.
3. Confirm structured production logs exclude credentials, prompt secrets,
   wallet signatures, and private user content by default.
4. Test health checks, provider checks, monitoring alerts, backup creation,
   restore rehearsal, deploy rollback, and database migration rollback.

Exit criteria:

- Full platform safety gate is green.
- Production operator evidence records backup, restore, alert, and rollback
  results for the exact candidate.

## Phase 7 - Web certification

1. Deploy the exact release commit.
2. Verify signup through first successful chat on the production domain.
3. Repeat two-user isolation and protocol smoke tests in production.
4. Record deployment ID, commit SHA, response headers, health output, log links,
   and rollback target.

Exit criteria:

- Production serves only the approved commit.
- Authentication, live inference, tenant isolation, and one controlled flow per
  desk pass on the real domain.

## Phase 8 - macOS certification

1. Build the DMG from the same commit and a clean dependency install.
2. Install under a clean macOS user account.
3. Test first run, local workspace authorization, local provider key handling,
   wallets/handoffs, update messaging, relaunch, and uninstall.
4. Publish the SHA-256 checksum and accurate unsigned-app installation guidance.

Exit criteria:

- Clean-user install and first successful chat pass.
- DMG checksum and source commit are recorded in the release ledger.

## Phase 9 - Final candidate and sign-off

1. Run focused suites, full tests, build, platform safety gate, browser
   acceptance, and desktop smoke.
2. Create a fresh release evidence directory tied to the commit SHA.
3. Resolve all P0/P1 issues. Record accepted P2/P3 issues with owner and
   follow-up date.
4. Obtain engineering, security/privacy, product-truth, and release-owner
   approval.
5. Tag only after all approvals are attached.

## Owner-supplied acceptance inputs

- Production domain and deployment access.
- Two independent production test accounts.
- MetaMask and Phantom test wallets with small approved test assets.
- Eligible Hyperliquid and Polymarket test accounts.
- Bittensor test signer.
- Final environment secrets in the deployment secret manager, including the
  rotated CUDOS key.
- Access to production monitoring, backup storage, and rollback controls.
- Approval of the exact release commit after reviewing the evidence ledger.

## Evidence matrix

| Area | Automated evidence | Owner/device evidence |
| --- | --- | --- |
| Auth and isolation | Server auth E2E and route security suites | Two production accounts |
| Models | Runtime config, provider, streaming, cancel/retry tests | Fresh-account live response |
| EVM | Wallet safety and approval suites | MetaMask connect/cancel/wrong-chain/approve |
| Sui | Sui preview and receipt suites | Phantom connect/sign/cancel |
| Hyperliquid | Fail-closed execution and receipt suites | Controlled signed test order |
| Polymarket | Discovery/compliance/handoff suites | Eligible-account handoff |
| Bittensor | Read/preview/external-signer suites | Test-signer handoff |
| Web | Build, headers, rate limits, isolation | Production-domain acceptance |
| macOS | Build and desktop smoke | Clean-account DMG install |
| Operations | Backup/restore/rollback scripts | Production control access |

## Execution status - 2026-07-29

### Completed in this pass

- Added first-party email/password signup, login, logout, session restoration,
  duplicate-email handling, and authenticated current-user APIs backed by the
  local SQLite control store.
- Provisioned one deterministic workspace for each authenticated organization
  and applied the organization boundary to browser workspace data routes.
- Added two-account isolation coverage for workspaces, memory, protocol
  watches, and direct cross-organization identifiers.
- Added ASI:Cloud/CUDOS runtime configuration through `CUDOS_API_KEY` without
  exposing the key to browser storage, generated runtime config, logs, or API
  responses.
- Removed the implicit legacy model-catalog URL. An external catalog is used
  only when `MATTERHORN_MODELS_URL` is explicitly configured.
- Kept public-web provider credentials deployment-managed while retaining
  local desktop provider setup.
- Replaced customer-facing legacy runtime terminology with Matterhorn agent
  runtime language on the changed surfaces.
- Fixed the local launcher so Vite proxies `/api` to the exact server instance
  it started. This removed a split-backend failure where signup succeeded but
  authenticated workspace routes reached an older process.
- Expanded the strict fresh-account product smoke to cover authentication,
  workspace creation, project home, all five desks, direct session reload,
  Notes, Memory, Wallet, settings, model selection, MCPs, Billing, and generated
  media.

### Automated evidence

- `pnpm test:matterhorn-platform-safety`: PASS, all 10 stages.
- `pnpm build`: PASS for desktop, server, shared UI, and production web bundle.
- App TypeScript check: PASS.
- Server TypeScript check: PASS.
- `pnpm test:desktop-beta-first-run`: PASS.
- `pnpm test:desktop-packaged-clean-profile-smoke`: PASS.
- `pnpm test:desktop-public-release-verify`: PASS.
- `pnpm test:electron-packaging-sources`: PASS.
- Strict fresh-account browser smoke: PASS, 21/21 stages.
- Auth and tenant-isolation E2E: PASS, 8 tests and 104 assertions.
- Strict release secret scan: PASS, 981 source files and zero findings.
- Git whitespace validation: PASS.

Fresh-account browser evidence:

`qa-reports/release-candidate-qa-2026-07-29/product-browser-proxy-fixed/summary.json`

Release-scope evidence:

`qa-reports/release-candidate-qa-2026-07-29/release-scope-final.json`

### Candidate file groups

Auth and isolation:

- `apps/server/src/auth-store.ts`
- `apps/server/src/auth.e2e.test.ts`
- `apps/server/src/server.ts`
- `apps/app/src/app/lib/matterhorn-server.ts`
- `apps/app/src/react-app/domains/cloud/public-web-signin-page.tsx`
- `apps/app/src/react-app/domains/cloud/public-web-signin.css`
- `apps/app/src/react-app/domains/memory/memory-panel.tsx`

Live model runtime:

- `apps/server/src/cudos-provider.ts`
- `apps/server/src/managed-opencode-runtime-config.ts`
- `apps/server/src/embedded.ts`
- `apps/server/src/cli.ts`
- `apps/app/src/react-app/domains/settings/pages/ai-view.tsx`
- `apps/app/src/react-app/domains/connections/provider-auth/`
- `.env.example`

Product truth and runtime recovery:

- Settings, updates, MCP, session, and customer-copy files under
  `apps/app/src/react-app/`.
- The focused app and server regression tests in `apps/app/tests/` and
  `apps/server/src/`.

Release and browser automation:

- `scripts/dev-matterhorn-local.mjs`
- `scripts/matterhorn-product-browser-smoke.mjs`
- Their focused contract tests and the model/crypto/memory audits changed in
  this pass.

Preserve-only local material:

- `.matterhorn-work/`
- `notes/`
- `outputs/`
- `qa-reports/`
- Parallel-agent and generated smoke evidence not explicitly selected for the
  release commit.

The scope inventory currently reports 37 candidate-review paths, 2,027
preserve-only paths, and zero protected paths staged.

### Remaining stop-ship acceptance

The code candidate is locally green. It is not yet production-certified until
the following tests run against the exact committed and deployed artifact:

1. Add the rotated CUDOS key to the production secret manager and confirm a
   fresh account receives a live model response.
2. Use two genuinely independent production accounts to repeat signup, login,
   logout, workspace isolation, and direct cross-account denial.
3. Complete owner-controlled wallet acceptance with MetaMask and Phantom using
   small approved test assets, including cancellation and wrong-network cases.
4. Complete one controlled Hyperliquid signed order, one eligible Polymarket
   handoff, and one Bittensor external-signer handoff.
5. Record production-domain headers, health checks, rate limiting, logs,
   backup/restore evidence, and rollback target.
6. Create the release commit from only the candidate-review paths, deploy that
   exact SHA, then build the DMG from the same SHA.
7. Install the DMG under a clean macOS account and publish its SHA-256 checksum
   with unsigned-app installation guidance.

No real-money protocol action or production deployment should be represented
as certified until the corresponding owner-controlled evidence is attached.
