# Matterhorn Work end-to-end go-live readiness - 2026-07-11

This is the current evidence ledger for the `codex/platform-soft-divider-ui` integration checkout. It records what was verified live from July 11 through July 13, what was verified in the isolated generated-media stack, and what still requires production infrastructure or manual device testing before the planned Wednesday, July 15 go-live.

## July 14 Wednesday release-candidate status

The Wednesday candidate is now isolated from the intentionally dirty
integration checkout:

- clean worktree:
  `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-wednesday-rc`;
- branch: `codex/wednesday-beta-rc-2026-07-15`;
- version: `0.13.13`;
- base integration commit: `a6dcfe100aa35597edb421ad65c0fcb46205fab4`;
- initial RC commit: `07a9c82a6bf2eea5ff6c3c519b0d420e683f26a5`;
- durable launch workspace config:
  `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-wednesday-launch-workspaces/server.json`;
- launch user one: `ws_18dc91c9102a`;
- launch user two: `ws_132174680a6d`.

The original `codex/platform-soft-divider-ui` checkout, its running stack,
untracked scratch, `.matterhorn-work`, and `qa-reports` remain untouched.

### Final source fixes

- The app now keeps client and host credentials distinct while activating a
  workspace. A fresh browser no longer attempts host-only activation with the
  client token.
- Explicit workspace creation now writes the durable server configuration even
  when the config file did not exist before launch.
- `scripts/dev-matterhorn-local.mjs` accepts a validated
  `MATTERHORN_LOCAL_SERVER_CONFIG`, forwards `--config`, and provides safe
  `--help` output for reproducible multi-workspace launches.
- The full browser audit discovers the current product-smoke evidence and
  accepts truthful MCP and Generated Media empty/setup-owned states instead of
  stale seeded-fixture copy.

Focused host-auth, persistence, launcher, and audit-harness tests pass. App and
server typechecks pass, `git diff --check` passes, and the complete ten-stage
`pnpm test:matterhorn-platform-safety` gate passes after these fixes.

### Two-user and full-platform evidence

- launch user one: 20/20 product stages, zero browser errors or network
  failures;
- launch user two: 20/20 product stages, zero browser errors or network
  failures;
- strict audit: 104 surfaces, 11 interactions, 2,922 controls, zero responsive
  issues, console errors, page errors, or network failures;
- all four protocol desks returned the expected real-agent result or required
  Sui question in both durable workspaces.

Evidence:

- `qa-reports/wednesday-launch-user-one-product-smoke/summary.json`;
- `qa-reports/wednesday-launch-user-two-product-smoke/summary.json`;
- `qa-reports/wednesday-launch-full-platform-audit-green/summary.json`;
- `qa-reports/wednesday-launch-full-platform-audit-green/launch-summary.md`.

The first user-two attempt timed out while waiting for a slow but safely
completing Hyperliquid response. Its diagnostic folder is preserved at
`qa-reports/wednesday-launch-user-two-product-smoke-provider-timeout/`; the
subsequent strict run passed all 20 stages.

### Bittensor decision

The Bittensor formal packet is ready for limited test-customer QA:

- static beta gate: 16/16;
- customer-ready crypto smoke: 52/52;
- live-route QA: 21/21;
- agent-control QA: 15/15;
- evidence verifier: ready with no errors or warnings;
- formal packet: `READY_FOR_TEST_CUSTOMER_QA`.

The public-data provider is not live in this stack. Subnet requests return
`curated-fallback`, and no live validator rows were returned. This is a hard
copy boundary: the controlled beta may demonstrate the Bittensor workflow and
external-signer safety, but it may not claim live provider or validator data.

Evidence:

- `qa-reports/wednesday-launch-bittensor-packet-green/matterhorn-bittensor-beta-rc.json`;
- `qa-reports/wednesday-launch-bittensor-evidence/bittensor-live-qa.json`;
- `qa-reports/wednesday-launch-bittensor-evidence/customer-ready-crypto-smoke.json`;
- `qa-reports/wednesday-launch-live-public-qa/matterhorn-live-public-qa.json`.

### Controlled-beta exclusions

The strict production-readiness probe reports 12 pass and 3 fail. The failures
are expected platform-owned release inputs, not user setup:

1. Billing remains in `phase0_mock`; Stripe test checkout and signed webhooks
   are not verified.
2. Production Generated Media lacks the image provider, Walrus publisher and
   relay, and all three Sui package identifiers.
3. The image-to-NFT flow correctly stops at the Free-plan Walrus entitlement.

Matterhorn Cloud is also not included in this build. Real MetaMask, Coinbase
Wallet, and Phantom device acceptance remains unverified because Chrome control
reported `Browser is not available: extension`. Automated wallet safety and
non-custodial contracts pass, but no device-verified claim is allowed.

Public macOS distribution remains NO-GO until Developer ID signing,
notarization, clean-Mac Gatekeeper, and signed updater-channel evidence exist.
The private artifact may be shared only with named internal testers and must be
identified as unsigned and unnotarized.

Authoritative decision record:
`docs/wednesday-beta-launch-execution-2026-07-15.md`.

Tester instructions:
`docs/wednesday-controlled-beta-tester-distribution.md`.

### Final private artifact

The final named-tester artifact is bound to source candidate `19ca5c5d`:

- directory:
  `/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-19ca5c5d`;
- DMG SHA-256:
  `4f168ca1221f65dc21e97371f5cb65664205fff012a7c600c4b6f3d41e4c06f6`;
- ZIP SHA-256:
  `61a27cb71208ab8636af9c87918f06bee792ea699535d004870d87cac37570a3`;
- `hdiutil verify`: valid;
- `unzip -t`: no errors;
- desktop beta doctor: 11/11 pass;
- packaged clean-profile smoke: 16/16 pass.

The artifact is unsigned, unnotarized, and publish-disabled. It is approved
only for named internal testers who have accepted the macOS warning and the
scope exclusions above.

### Canonical cutover

The previous integration stack and the isolated release-QA stack were stopped
only after artifact verification. The clean RC now owns the canonical ports:

- app: `http://127.0.0.1:5190/workspace/ws_18dc91c9102a/session`;
- backend: `http://127.0.0.1:4130`;
- backend version: `0.13.13`;
- managed OpenCode version: `1.14.38`;
- backend owners on `4130`: one;
- app owners on `5190`: one.

The stack uses the durable two-workspace server configuration, all Bittensor
beta/read-preview safety flags, execution disabled, and a 5,000-request read
budget per 60 seconds for the multi-surface release audit. Write limits,
entitlements, approvals, external-signer controls, and submission blocks remain
unchanged.

The post-cutover result-required product smoke passed 20/20. Bittensor,
Hyperliquid, Polymarket, and Sui all completed with assistant output; direct
session reload, Longevity, Notes, Memory, Wallet, Settings, MCP truth, Billing
copy, and Generated Media also passed. There were no warnings, browser errors,
or network failures.

Evidence:
`qa-reports/wednesday-launch-canonical-cutover-smoke/summary.json`.

## Checkout and live stacks

- Repository: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`
- Branch: `codex/platform-soft-divider-ui`
- Real managed-agent app: `http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`
- Real managed-agent backend: `http://127.0.0.1:4130`
- Managed OpenCode upstream: dynamically assigned at managed-stack startup; do
  not depend on a previously recorded sidecar port.
- Managed-stack client token: `matterhorn-local-client-token`
- Managed-stack host token: `matterhorn-local-host-token`
- Generated-media fixture app: intentionally stopped on July 14 after it was
  found competing with the managed stack for this checkout.
- Generated-media fixture backend: intentionally stopped with the fixture app.
- The `5182/4125` launcher is `scripts/dev-generated-media-smoke.mjs`. Its fake
  OpenCode engine is valid for deterministic media, Billing, wallet, settings,
  and responsive UI QA, but it is not proof that a real LLM desk response
  completes. Do not run it against this checkout while the managed stack owns
  the same workspace and generated agent files. Use the managed `5190/4130`
  stack for the current app, chat, and desk completion.
- The Vite app must be started with the `VITE_MATTERHORN_WORK_URL`, client-token, and host-token variables. A plain Vite restart renders the shell but disconnects fresh browser contexts from the backend.

The tree is intentionally very dirty from Codex, Kimi, and Minimax integration. Do not reset it, revert shared files, delete untracked reports/scratch files, or stage broadly. In particular, preserve `.matterhorn-work/`, `qa-reports/`, duplicate smoke scripts, and parallel-agent handoffs.

## Current product truth

### Works in the live local stack

- Workspace Home, workspace path/output path actions, activity summary, and full Project history.
- New chat and protocol desk task creation through the real Matterhorn-to-OpenCode proxy.
- Bittensor, Hyperliquid, Polymarket, and Sui desk launches with immediate prompt dispatch.
- Longevity workflow launch and seven-stage workflow surface.
- Cautious, Balanced, and Optimistic response-perspective controls in chat.
- AI provider/model discovery from the local OpenCode engine. The current live catalog reports 166 available providers and 5,659 catalog models. Only `opencode` (OpenCode Zen) is connected in this stack, with six usable models; the UI now keeps available-catalog totals separate from connected-provider and connected-model counts.
- Workspace model preference save, fresh-read persistence, and reset through the backend API.
- Notes, Memory review, Outputs/evidence, Wallet, MCP, Settings, Billing, Account, and Generated-media routes render without browser errors or horizontal overflow.
- EVM wallet injection, pre-approval simulation, reviewed Base Sepolia approval, and mainnet blocking.
- Sui Wallet Standard plus Phantom Sui fallback contracts, public reads, transfer handoff, and receipt evidence paths.
- Billing plan/status/checkout/webhook/portal contracts in mock and Stripe-test modes. Live charging remains intentionally disabled.
- MCP client configuration generation for Codex, Claude Code, Claude Desktop, and Cursor.

Live chat completion was re-verified after the readiness hardening in session `ses_0ad9695d1ffeEXpDGQhIFrwDu3`. The default `opencode/big-pickle` model ran workspace tools and returned a complete assistant answer. Cautious and Balanced perspective selection changed state correctly, and the control was restored to Balanced after the check.

### Verified in the isolated generated-media stack

The production-like generated-media flow was tested on a temporary `4127/5183` stack created by `scripts/dev-generated-media-smoke.mjs`. It used mock image generation, fake loopback Walrus, preview-only Sui package/Kiosk/TransferPolicy identifiers, and a local Max entitlement. No payment provider, user wallet secret, custody, signing, or public transaction submission was used.

The 14-stage browser flow passed:

1. Open the app and chat image panel.
2. Generate an image and save it to Outputs.
3. Create a local NFT draft.
4. Prepare and upload media to fake Walrus.
5. Prepare a non-custodial Sui mint handoff.
6. Record the public mint receipt.
7. Prepare a Sui Kiosk listing handoff.
8. Record the public listing receipt.
9. Verify the redesigned Generated media settings library.
10. Open storage/data controls and confirm public NFT state is retained.
11. Run safe diagnostics without uploading, signing, or submitting transactions.

The regular customer workspace is on the Free plan and has already reached its 10-image allowance through QA. A new image there correctly returns `billing_entitlement_limit_reached`; this is expected entitlement behavior, not a transport-rate-limit failure.

## Browser evidence

### Product browser smoke

`qa-reports/matterhorn-product-browser-smoke/summary.json`

- Result: ready
- Stages: 18/18 passed
- Browser errors: 0
- Network failures: 0
- Covered: Home, wallet readiness, four protocol desks, Longevity, activity, history, Notes, Memory, Wallet, Settings overview/support, Wallet settings, AI model picker, Billing, and Generated media.

The authoritative real-provider rerun is
`qa-reports/matterhorn-product-browser-smoke-model-path-env/summary.json`.
It passed all 18 stages with no browser errors, page errors, warnings, or
network failures. After the OpenCode stream-lifecycle fix, two additional
consecutive runs passed at
`qa-reports/matterhorn-product-browser-soak-proxy-fix-3/summary.json` and
`qa-reports/matterhorn-product-browser-soak-proxy-fix-4/summary.json`.
Each protocol launch now stops its QA-owned desk task after route and activity
verification, so the smoke does not leave real model work running in the
background.

### Wallet approval browser smoke

`qa-reports/wallet-approval-browser-smoke/summary.json`

- Result: ready
- Stages: 6/6 passed
- Covered: injected wallet connect, session persistence, failed-simulation blocking, reviewed Base Sepolia approval, and mainnet blocking before wallet send.

### Generated-media browser smoke

`qa-reports/generated-media-browser-smoke/summary.json`

- Result: ready
- Stages: 14/14 passed
- Browser errors: 0
- Network failures: 0
- One ignored fake-OpenCode `GET /opencode/mcp` 404 is expected in the isolated smoke engine.

### Full platform responsive audit

`qa-reports/matterhorn-full-platform-browser-audit/summary.json`

- Result: ready
- Surfaces: 24/24 passed
- Interactions: 6/6 passed
- Controls inventoried: 950
- Horizontal-overflow issues: 0
- Console errors: 0
- Page errors: 0
- Network failures: 0

The route inventory was subsequently reconciled against the current Settings tabs and right rail. The original 24-surface audit had omitted Settings General, Outputs, and the four focused protocol desks. The expanded live audit is stored at `qa-reports/matterhorn-full-platform-browser-audit-current-goal/summary.json` and reports:

- Surfaces: 30/30 passed.
- Interactions: 6/6 passed.
- Controls inventoried: 1,123.
- Horizontal-overflow issues: 0.
- Console errors, page errors, and tracked network failures: 0.
- Settings General, Outputs, Bittensor, Hyperliquid, Polymarket, and Sui all rendered their expected markers without overflow.

The exact 30-surface inventory is now locked by `scripts/matterhorn-full-platform-browser-audit.test.mjs` and is mandatory in the platform browser-contract stage.

The latest strict model-path audit is stored at
`qa-reports/matterhorn-full-platform-browser-audit-model-path/summary.json`.
It passed 30/30 surfaces and 6/6 interactions, inventoried 996 controls, and
reported no responsive, console, page, or network issues.

### Compiled release renderer

The production renderer was rebuilt with the live local backend configuration and served from an isolated preview on `5184`.

- Release product browser smoke: 18/18 passed, including all five desk/workflow launches, Notes, Memory, Wallet, AI, Billing, and Generated media.
- Release responsive audit: 24/24 surfaces and 6/6 interactions passed.
- Controls inventoried: 932.
- Horizontal overflow, console errors, page errors, network failures, and audit issues: 0.

### Monday RC and desktop artifact

- Monday RC rerun: 11/11 stages passed after repairing stale onboarding/rail assertions and restoring the missing canonical Sui workflow template.
- Customer-ready crypto smoke: 52/52 stages passed; direct venue prompt safety was 234/234 in its focused suite.
- Unsigned local tester DMG and ZIP were built and hash-bound to git `a6dcfe10` under `/tmp/matterhorn-monday-beta-rc-2026-07-11/mac-tester-artifact`.
- Desktop first-run doctor: 11/11 passed with the live authenticated `4126` backend, including server health and unified crypto readiness.
- The artifact is intentionally unsigned and not notarized. Signing, notarization, the published updater, default protocol association on another Mac, and true clean-machine install checks remain release-owner work. Same-machine packaged LaunchServices deep-link delivery is covered below.

### Packaged clean-profile release candidate

The first packaged-app launch exposed an updater defect that static artifact checks did not catch: a fresh profile automatically requested an unpublished `latest-mac.yml` channel and logged a full `404` response. Fresh installs now default to manual update checks, and explicit unavailable-channel failures are reduced to `This update channel is not published yet.` without response headers, tokens, or stack traces. Existing users who already enabled automatic checks keep that preference.

A new repeatable packaged smoke now launches the current `.app` with isolated temporary user data and verifies:

- token-protected loopback UI control health and unauthorized rejection;
- first-run `/welcome` state;
- General, MCP/Extensions, AI Providers, Appearance, and Session navigation;
- stable packaged process lifetime;
- no unpublished-updater failure noise;
- packaged `Info.plist` registration for the `matterhorn-work` URL scheme;
- optional authenticated `matterhorn-work://connect-remote` delivery through macOS LaunchServices and Electron's `open-url` channel;
- remote workspace creation and navigation without logging or reporting its token;
- temporary-profile cleanup.

Result: 15/15 packaged checks passed after extracting and launching the exact hash-bound tester ZIP. The app manifest declared the Matterhorn scheme, the deep link authenticated to the live `4126` backend and reached `/workspace/rem_ws_d6a5b5572860/session`, and the Electron-only Browser rail opened the loopback backend health page, reported two native tabs, and closed cleanly. An earlier expanded Monday RC execution completed 12/12 commands and repeated this 15/15 desktop flow while redacting the client token; the RC was subsequently corrected so the fixture-only Bittensor packet can no longer be interpreted as release-ready evidence. No unpacked source-build directory is used for packaged-launch proof.

Fresh unsigned artifacts are under `/tmp/matterhorn-deeplink-rc-2026-07-12/mac-tester-artifact`:

- DMG SHA-256: `331c48d27fe9835512c9deea9ddc331cc266db904e406ac724553cdbe82284ac`
- ZIP SHA-256: `aae2e23505f9511bbad67cf4874ac455182f4f48a8c773bd77b5523e0722ceb5`
- `hdiutil verify`: valid.
- `unzip -t`: no errors.

This closes the same-machine clean-profile and packaged LaunchServices deep-link gaps. Code signing, notarization, Gatekeeper on a separate clean Mac, a published updater channel, default protocol association from Finder/Safari on that machine, and real wallet handoff checks remain release-owner gates.

### Backend soak

A 45-cycle bounded soak repeatedly checked `/health`, workspace readiness, and the authenticated OpenCode session proxy while release browser journeys ran:

- Failures: 0 across 135 requests.
- `/health`: 3 ms average, 40 ms max.
- Workspace readiness: 6 ms average, 18 ms max.
- OpenCode session proxy: 5 ms average, 14 ms max.

The longer product journey initially exposed a real lifecycle defect. Repeated
desk launches followed by immediate navigation left upstream OpenCode response
streams alive. The backend accumulated 512 established OpenCode sockets; the
authenticated session proxy and readiness probe then timed out even though the
OpenCode process itself remained reachable.

The proxy now propagates downstream disconnect/cancel events upstream, the Node
HTTP adapter aborts requests and cancels response readers when clients leave,
and server shutdown aborts active requests before closing connections. Product
smokes also stop their own QA desk runs. After the fix:

- Two consecutive 18-stage real-provider product smokes passed.
- The OpenCode socket pool remained bounded and reusable, moving from 9
  established sockets after the first run to 8 after the second instead of
  growing monotonically.
- Workspace readiness remained HTTP 200 at approximately 3 ms after both runs.
- A corrected 45-cycle stateful probe completed with zero failures across 45
  health reads, 45 readiness reads, 45 authenticated OpenCode session reads,
  three model save/read/reset rounds, three Notes create/update/delete rounds,
  and three private Memory capture/forget rounds.
- Corrected soak latency: health 0 ms average / 1 ms max; readiness 1 ms / 6 ms;
  sessions 3 ms / 7 ms; model operations 69 ms / 141 ms; Notes 2 ms / 3 ms;
  Memory 180 ms / 1,066 ms.
- The original model preference was restored after the probe and all QA Notes
  and Memory records were deleted through their public APIs.

## Focused verification

- Wallet/backend capability/Sui suites: 36 passed, 0 failed.
- Cloud availability, Generated media, MCP docs, and Billing UI suites: 25 passed, 0 failed.
- Billing routes and remote MCP connection: 37 passed, 0 failed.
- Product browser smoke contract: passed.
- Wallet approval browser smoke contract: passed.
- MCP catalog, MCP config CLI, and wallet/profile/MCP readiness contracts: passed.
- TypeScript app check passed before the final browser tranche.
- `git diff --check` passed before the final browser tranche.
- Full platform safety gate: all 10 stages passed after updating the generated-media smoke contract to the current progressive-disclosure labels.
- OpenCode readiness/control-plane suite: 32 passed, 0 failed.
- Backend capability UI and contract suites: 41 passed, 0 failed after setup ownership labels were split into `Connect wallet`, `Connect provider`, and `Platform setup`.
- Server and app TypeScript checks passed after the readiness and setup-ownership changes.
- Full platform safety gate: all 10 stages passed again after the bounded OpenCode readiness probe was added.
- Managed OpenCode supervisor suite: 2 passed, 0 failed, covering consecutive health failures and failed replacement-process retry/backoff. The suite is now mandatory in the daemon/desktop safety stage.
- Real managed-engine recovery: an isolated backend on `4129` stayed running after its OpenCode child on `51100` was killed. A replacement PID appeared within two polls and workspace chat/desk readiness returned to `working` on the third poll. Logs contained only the restart reason and count.
- Full platform safety gate: all 10 stages passed after managed-engine recovery was added to the mandatory daemon/desktop perimeter.
- Final live app refresh: workspace Home and MCP settings rendered without alerts or horizontal overflow. The current MCP surface names the two active servers as `Wallet MCP` and `Crypto MCP`; no July 12 browser errors were recorded on that route.
- Electron updater first-run safety gate, packaged clean-profile smoke contract, Monday RC dry-run contract, app typecheck, desktop typecheck, and packaging security gate passed.
- Packaged clean-profile, remote-connect deep link, and Electron Browser smoke: 15/15 passed. It uses macOS `open -a` against the extracted exact ZIP, exercises LaunchServices and Electron `open-url`, opens a loopback page in the native Browser rail, snapshots its tabs, and closes the panel.
- Expanded Monday RC automation previously completed 12/12 commands and DMG/ZIP integrity passed. Under the corrected release semantics, the current evidence result is 11 pass / 1 blocked: the fixture-only Bittensor packet still needs real customer-smoke, evidence-verification, and browser-QA attachments.
- Deep-link runtime contracts: 2/2 passed and are now mandatory in the daemon/Electron perimeter. The contracts lock the Matterhorn native event name, selective auth/remote queue consumption, shell-level remote handler, and Matterhorn input aliases in Electron.
- Full platform safety gate: all 10 stages passed again with updater first-run safety, deep-link runtime coverage, and managed-engine recovery mandatory in the desktop perimeter.
- Expanded full-platform browser audit: 30/30 surfaces and 6/6 interactions passed with 1,123 controls inventoried and no P0/P1 issues.
- OpenCode proxy cancellation regression passed, the Node adapter suite passed
  3/3, product-browser smoke contract passed, and server/app TypeScript checks
  passed after the stream lifecycle changes.
- The complete platform safety gate passed all 10 stages after the lifecycle
  fix. Log: `/tmp/matterhorn-platform-safety-stream-lifecycle.log`.
- The session read-model harness now disables workspace reload watchers only for
  its isolated temporary servers. Production servers keep watchers enabled by
  default. This removed contention with the several live integration stacks on
  the host: the complete file passed 18/18 at the normal timeout in 359 ms,
  including bounded SSE, cursor recovery, detailed events, proxy cancellation,
  model routing, command acknowledgement, and teardown.
- The full 10-stage platform safety gate passed again after the deterministic
  session harness change. Log:
  `/tmp/matterhorn-platform-safety-deterministic-session-suite.log`.

## Backend hardening completed in this tranche

- Cloud actions now require explicit Cloud configuration. The fallback `https://app.matterhorn.work` hostname is not treated as proof that Cloud exists.
- When Cloud is disabled, Account and AI settings no longer expose dead sign-in/share actions. Local workspaces remain explicitly available.
- Deployment-owned missing configuration is labelled `Platform setup`; healthy states stay quiet.
- Generated-media settings and browser smokes follow the redesigned progressive-disclosure information architecture.
- Notes regions and nested sidebar session controls use native accessible semantics.
- Sui source contracts now cover both Wallet Standard and Phantom effective addresses.
- The local API limiter now keeps read hydration/polling and user-triggered writes in separate buckets, so read-heavy session hydration cannot starve image generation, note writes, approvals, or wallet evidence.
- Workspace readiness now live-probes the configured OpenCode engine with a bounded 1.5-second timeout. Chat and desk starts are blocked when the engine is unreachable, and the recovery action tells the user to restart or reconnect it without exposing the upstream URL or credentials.
- OpenCode proxy responses now have explicit downstream-to-upstream cancellation
  semantics. The Node/Electron HTTP adapter propagates disconnects through an
  AbortSignal, cancels unread response bodies, aborts active requests during
  shutdown, and performs a second connection sweep for sockets that become idle
  during shutdown.
- Browser-smoke desk launches now have bounded cleanup: after verifying the
  route and activity event, the smoke stops the task it started before moving to
  the next protocol.
- Isolated backend tests can opt out of filesystem reload watchers without
  changing runtime defaults. This keeps lifecycle and streaming tests
  deterministic when multiple live Matterhorn stacks are watching the same
  checkout.

## Observed operational risk

The long-running `4126` backend once returned `200` from `/health` while its authenticated `/opencode/*` proxy timed out. Direct OpenCode on `65325` remained healthy. Restarting only the dedicated Matterhorn backend restored the proxy and all desk launches.

The shallow `/health` route still proves only that the HTTP process is alive. Workspace readiness now separately probes OpenCode before enabling chat and desk starts. Live verification on `4126` reported the engine reachable in `1 ms`; an isolated server pointed at an unavailable upstream blocked both features in `24 ms` and returned a sanitized recovery action.

The July 12 soak showed that process health plus direct upstream health is not
enough if abandoned proxy streams exhaust the connection pool. That leak is now
fixed and covered by a client-disconnect regression. Production monitoring
should still alert on workspace readiness latency and established backend-to-
OpenCode socket growth, not only process liveness.

Managed local and embedded desktop mode now supervises OpenCode with bounded health checks, three-failure detection, serialized restart, bounded exponential retry, sanitized lifecycle logging, and a read-only status snapshot. Process exit recovery was also exercised with the real bundled OpenCode binary: the Matterhorn backend stayed available and readiness recovered automatically.

A separately deployed production backend/OpenCode worker still needs an external process supervisor, restart policy, and deployment monitoring. The in-process supervisor covers only the managed local/desktop engine it owns.

Do not use the shallow `/health` response alone for production traffic readiness.

## Production diagnostics snapshot

The production-readiness checks distinguish user actions from platform-owned deployment work:

- **Model provider:** locally working. The OpenCode provider catalog is reachable, `opencode` is connected, and a real `opencode/big-pickle` browser prompt completed. Production still needs the exact launch provider/model to pass prompt, stream, stop, and retry checks in the deployed environment.
- **Wallets:** user action plus manual device QA. The code supports MetaMask, Coinbase Wallet, injected EVM wallets, Sui Wallet Standard, and Phantom Sui fallback. A user must install/unlock a wallet and approve connection/signing; QA still must verify the real extensions and chains.
- **Generated media:** platform setup. The strict production-readiness command exits nonzero with six missing items: production image provider/API key, Walrus publisher, Walrus relay, Sui NFT package, Sui Kiosk package, and Sui TransferPolicy package. Diagnostics remain non-custodial and perform no public writes.
- **Billing:** platform setup. The live local backend reports `phase0_mock`, provider `mock`, Free plan, no subscription, and live charges disabled. Stripe test credentials, prices, webhook, and return URLs are not configured in this stack.
- **Matterhorn Cloud/account:** product and platform decision. Cloud is explicitly disabled in this local stack; local workspaces remain usable without sign-in. Do not expose account actions unless a real Cloud URL/API is configured and tested.
- **MCP clients:** operator setup. Config generation and MCP smoke pass, but each advertised coding client still needs the generated config installed and its connected server names verified live.

The Monday beta launch audit initially caught a real Sui registry regression: `sui_wallet_workflow` was mapped to the Sui workspace and desk but missing from the canonical typed, CLI, and server template registries. The template is now restored across all three registries, documented, exposed through MCP discovery, and verified through the live authenticated `/api/workflows/templates` route. The Monday audit and workflow registry/catalog/API/MCP gates pass.

## Release evidence truthfulness

- The Monday RC pack now treats the default Bittensor fixture packet as
  `NOT_READY`; a zero exit code from a packet shape check no longer produces a
  misleading top-level ready result.
- Dry runs now report `ready: false`. The separate `automationPassed` field is
  execution health only, not customer-release approval.
- Attach real customer-smoke, Bittensor evidence-verification, and browser-QA
  inputs using `docs/bittensor-beta-go-live-runbook.md` before release approval.
- The latest public `dev` alpha workflow (`28974205950`) failed because the
  unsigned packaging step gated on `env.MACOS_NOTARIZE == 'true'` while that
  same step overrides `MACOS_NOTARIZE: false`. GitHub skipped packaging, then
  ran artifact upload with no files. The condition now gates only on missing
  signing configuration, with a regression contract locking the behavior.
- Real Bittensor live QA passed 21/21 checks with checksum-valid public test
  addresses; Agent Control live QA passed 15/15 after using a 60-second file
  route timeout. The verified Bittensor evidence bundle reports
  `READY_FOR_TEST_CUSTOMERS`.
- Browser QA found and fixed an async routing race where a successful focused
  desk launch created the session but returned the user to Project Home. The
  desk now closes before session creation and restores only on failure. The
  public-address task remained visible at
  `/session/ses_0ad226a71ffe0EioBpJ7PUwKuG` with working/started status.
- Bittensor desktop (1440x960), tablet (834x1112), and mobile (390x844) checks
  showed no horizontal overflow. The release verifier now checks the current
  desk tasks and launched-session result instead of the removed Demo-tab copy.
- Live Hyperliquid/Polymarket read-only smoke passed 8/8 after replacing
  substring-based secret detection with exact structured forbidden-key checks;
  safe external-signer instructions no longer fail merely for mentioning that
  a client must compute a signature.
- Fresh final-source Mac artifact: ZIP
  `a6585c301a452d961edda73b95bf691b41c362d9d2440703328b9020bab7df30`,
  DMG `1114ed39c1dea13b5e3052a849d38fc7898fd4c56fed1b2ee610f02cbf8885d9`.
  The exact ZIP passed 15/15 packaged clean-profile checks.
- Real-evidence Monday RC at `/tmp/matterhorn-real-bittensor-rc/monday-rc-final`
  passed 12/12 with `ready: true`, `automationPassed: true`, and semantic
  Bittensor readiness true. The final regenerated report has `nextActions: []`;
  its JSON SHA-256 is
  `fef3105833ffadea0ade3baeef7abdbe32e444d0457ab22a33bd0f11c1e643ef`.
  Its aggregate live-public pack still records
  optional fallback stages for final market evidence, top-level crypto packet,
  and a public Polymarket watch ID.
- Settings navigation now derives quiet, action-specific labels from the live
  backend capability contract. Healthy and preview-only tabs stay silent.
  User-owned actions read `Connect wallet` or `Connect provider`; deployment
  work for Generated media and Billing reads `Platform setup`. This replaces
  the unqualified `Needs setup` label while preserving a clear owner.
- Wallet and Billing are now first-class cards on the settings overview instead
  of being discoverable only through the rail. Live click-through checks opened
  `/settings/wallet` and `/settings/billing` successfully. Mock billing reports
  `Local preview`, `No billing account`, and `Live charges off`; only configured
  Stripe paths use checkout or billing-portal language.
- The focused settings contract passed 31/31, the Billing UI contract passed
  11/11, app typecheck passed, and the full 10-stage platform safety gate passed
  after these shell changes. Log:
  `/tmp/matterhorn-platform-safety-settings-truth.log`.
- Stateful Notes -> Memory browser QA passed against the live workspace: create,
  650ms autosave, backend readback, reload persistence, search isolation,
  explicit Memory-review suggestion, consent controls, no saved-memory capture,
  dismissal, and QA-only note deletion. The pre-existing untitled note remained;
  the QA note and suggestion were removed, and both panels had no horizontal
  overflow. Focused verification passed 10/10 across Notes UI/API contracts plus
  the Matterhorn Memory vault smoke gate.
- Live MCP status is now named and prioritized: the runtime reports `Wallet MCP`
  and `Crypto MCP`, with `wallet · Ready` and `crypto · Ready` rows shown before
  the install catalog. The header no longer boxes the count in a pill. Matterhorn
  MCPs use compact disclosure rows at every width, and the initial directory
  filter shows seven MCP/connectors rather than dumping installed skills; Skills
  remain available on demand. Browser QA confirmed eight compact Matterhorn MCP
  rows, named connections, no skill dump, no horizontal overflow, 2,081px inner
  content height, expandable Bittensor docs/safety, and working Skills/MCP filter
  switching. MCP catalog, config CLI, MCP server smoke, app typecheck, and the
  full 10-stage safety gate passed. Log:
  `/tmp/matterhorn-platform-safety-mcp-progressive.log`.
- The live model catalog reports 159 known providers and 5,592 known models;
  OpenCode Zen is the connected provider and exposes six selectable models.
  Browser QA selected Big Pickle, saved it as the workspace default, used the
  workspace default, then reset the preference and verified the backend
  returned to the `opencode/big-pickle` engine fallback.
- Project Home `New chat` no longer auto-sends the hidden `What can you do?`
  prompt. It creates a blank session with an empty composer and Balanced as the
  default response perspective. Cautious, Balanced, and Optimistic each became
  the authoritative selected radio state in live browser checks.
- The local OpenCode prompt path returned `MODEL_PATH_OK` through Big Pickle.
  A live cancellation test exposed and fixed two recovery defects: stopped
  responses no longer leave a red Error state, and assistant prose can no longer
  reclassify a generic chat as a protocol desk. A post-cancellation prompt
  returned `STOP_RECOVERY_OK`; the session remained Balanced, retained Big
  Pickle after hydration, cleared stale Thinking/Responding state, showed no
  desk strip, and had no horizontal overflow. The focused session contracts,
  app typecheck, and the full 10-stage platform safety gate passed. Log:
  `/tmp/matterhorn-platform-safety-new-chat-model-path.log`.

### July 12 capability-truth and workflow lifecycle pass

- Settings and task history now distinguish backend lifecycle states instead of
  rendering prepared runs as active model thinking. Backend `staged` reads
  `Prepared`; running, waiting, completed, failed, and cancelled remain distinct.
- Wallet connector availability now names the user action as `Connect wallet`.
  The Max plan no longer promises Cloud sync while Cloud is disabled. Account
  separates working local profile/workspace access from Cloud features that are
  not available in this build, and the unrelated duplicate Task log was removed
  from Account.
- Opening the Longevity desk is side-effect free. Live browser/API verification
  showed one Ready state, seven `Run in chat` actions, zero Staged labels, and no
  new backend run after passive open. The compact rail no longer creates a Memory
  suggestion merely by revealing the desk.
- Explicit stage launch now creates the OpenCode chat first, stages and starts one
  workflow run with that exact `ses_...` ID, then sends the prompt. The latest
  verified run used `ses_0ac61f40bffeP6FZwTY4yM99co` in both the browser URL and
  backend run record.
- Canonical desk-agent instructions are injected into prompt system context in
  addition to the OpenCode agent file. The Longevity intake contract explicitly
  forbids medical history, diagnoses, prescriptions, PHI, and hidden clinical
  records. Live Big Pickle verification produced the intended safe seven-question
  intake and kept Improve VO2 max separate from Train for endurance.
- Linked workflow runs now follow visible chat lifecycle: questions or approvals
  move a run to Waiting, resumed streaming moves it back to Running, and a final
  visible assistant result completes it. The verified intake run emitted
  `workflow.waiting_for_user` with `Waiting for answers`. Reopening the chat
  restored `Longevity Agent` from the persisted run instead of falling back to
  `Default agent`.
- Focused workflow, safety-prompt, observability, server-route, and UI contracts
  passed; app and shared types TypeScript checks passed. The release product
  browser smoke passed 18/18 with no warnings, console errors, or network
  failures. Evidence:
  `qa-reports/matterhorn-product-browser-smoke-workflow-lifecycle/summary.json`.
- The expanded browser audit passed 30/30 surfaces and 6/6 interactions across
  1,024 controls with zero issues. Evidence:
  `qa-reports/matterhorn-full-platform-browser-audit-workflow-lifecycle/summary.json`.
- `git diff --check` passed. The full 10-stage platform safety gate passed after
  the workflow lifecycle changes. Log:
  `/tmp/matterhorn-platform-safety-capability-truth.log`.

### July 12 canonical-output completion and task-state truth pass

- A fresh live Longevity run completed the entire safe intake against the real
  local OpenCode provider. Session `ses_0ac4ef802ffeumoAQaLQFOrBao` and workflow
  run `run_c65a8321-6835-4b3b-b309-989bd1ff02e8f` stayed linked from launch
  through questions, resume, and completion.
- The model asked only customer-program context: audience, goal, experience,
  equipment, schedule, delivery mode, and public constraints. It did not ask
  for injuries, pain, health status, medical history, diagnoses, prescriptions,
  PHI, or hidden clinical records.
- The completed intake artifact was saved at the backend-owned canonical path
  `outputs/longevity/ses_0ac4ef802ffeumoAQaLQFOrBao/01-intake.md`. Session system
  context now supplies the linked run's exact `outputBasePath` and forbids a
  parallel descriptive/custom session folder.
- The compact task-run projection no longer converts every nonterminal event to
  `running`. Live API and browser verification showed the same truth:
  completed run -> `Completed`, waiting run -> `Waiting`, active runs ->
  `Running`, and staged runs -> `Prepared`.
- Focused verification passed: 12 server workflow/evidence route tests, 16 app
  Settings/task-label tests, server and app TypeScript checks, and
  `git diff --check`.
- The live product browser smoke passed 18/18 journeys with no errors or network
  failures. Evidence:
  `qa-reports/matterhorn-product-browser-smoke-task-state-truth/summary.json`.
- The live full-platform audit passed 30/30 surfaces and 6/6 interactions,
  inventoried 1,007 controls, and reported zero responsive, console, page, or
  network issues. Evidence:
  `qa-reports/matterhorn-full-platform-browser-audit-task-state-truth/summary.json`.
- The full 10-stage platform safety gate passed on the current tree. Log:
  `/tmp/matterhorn-platform-safety-workflow-task-truth.log`.

### July 12 production-readiness probe and allowance-truth pass

- The strict live product-readiness probe reached the authenticated backend at
  `4126` and passed 13/14 stages: workspace resolution, production CORS,
  capabilities, workspace readiness, control plane, support report, data map,
  data controls, team access, project ledger, ledger export, generated-media
  readiness, and generated-media history all passed.
- The remaining flow stage was blocked by the real Free image allowance, not by
  a route or rendering failure. This long-lived QA workspace has 109 historical
  images against the newly enforced allowance of 10 and resets on 2026-08-01.
- Strict generated-media production readiness reports six external setup gates:
  OpenAI production image provider/key, Walrus publisher, Walrus relay, Sui NFT
  package, Sui Kiosk package, and Sui TransferPolicy package. Diagnostics remain
  non-custodial, perform no public writes, and require the user's wallet for Sui
  signing.
- Production CORS passed all five checks. Desktop first-run doctor passed 10,
  skipped only the optional artifact-folder inspection, and failed none; live
  server health and unified crypto readiness both returned HTTP 200.
- The image allowance error no longer recommends upgrading to the current plan.
  The live API now returns only `plus` and `max` for an exhausted Free plan, and
  browser QA renders `Upgrade to Matterhorn Plus or Matterhorn Max`. Historical
  over-limit usage now reads `109 used; Free includes 10 per allowance period`
  instead of `109 of 10`.
- Focused entitlement route regression, 32 image/NFT UI contracts, server/app
  TypeScript checks, and `git diff --check` passed.
- Machine-readable probe evidence is stored under
  `qa-reports/matterhorn-production-readiness-current/`: product readiness and
  generated media are intentionally nonzero until the allowance/external setup
  gates clear; production CORS and desktop first-run doctor exit zero.
- The full 10-stage safety gate passed after the allowance-copy and entitlement
  recommendation changes. Log:
  `/tmp/matterhorn-platform-safety-production-allowance-truth.log`.
- Product readiness now supports `--require-production`. That mode adds an
  explicit `billing.production_readiness` stage, rejects mock/live billing in
  favor of fully configured Stripe test checkout plus webhook verification, and
  forwards `--require-production` to generated-media readiness. Existing local
  smoke behavior remains unchanged.
- The consolidated production-required report passes 12 stages and fails three
  with concise evidence: Stripe test billing is not configured; generated media
  has six external setup requirements; and the current Free QA allowance is
  exhausted. JSON and Markdown evidence:
  `qa-reports/matterhorn-production-readiness-current/product-readiness-production-required.*`.
- Real Chrome wallet-extension QA could not run in this session. Chrome is
  installed and running and its native host manifest is valid, but the selected
  Chrome profile does not have the ChatGPT Chrome Extension installed. Do not
  count MetaMask, Coinbase Wallet, or Phantom device behavior as verified until
  the extension is installed and the explicit connect/reject/disconnect/reload
  matrix is rerun.
- The full 10-stage platform safety gate passed after the production-required
  billing/media contract and concise blocker projection were added. Log:
  `/tmp/matterhorn-platform-safety-production-contract.log`.

### July 12 canonical favicon correction

- Web, PWA, documentation, and desktop icon sources now use the canonical
  Matterhorn mark published by `matterhorn.so/assets/favicon.svg`, replacing the
  older locally drawn mark visible in browser tabs.
- The brand generator owns the canonical vector path and regenerates SVG, PNG,
  ICO, and ICNS variants, preventing a later asset build from restoring the old
  favicon.
- Web icon URLs carry the `20260712b` cache version so browsers request the new
  artwork immediately. Live verification confirmed the versioned icon links and
  the official vector path from the Vite server.

### July 12 setup ownership and billing truth pass

- `Needs setup` is no longer used as an ownerless customer instruction on the
  Generated media and Billing surfaces. Deployment-owned gaps read `Platform
  setup`; wallet/provider actions remain explicit user actions.
- Generated-media readiness now explains that Matterhorn must connect Walrus
  and configure its Sui NFT/Kiosk packages. Raw environment keys remain behind
  the Platform setup disclosure for operators.
- Mock billing now reports `readyForTestCheckout: false`. It remains a usable
  local plan preview, but the app does not open mock checkout/portal URLs, imply
  that Stripe is connected, or grant paid plan access.
- Stripe test checkout, webhook reconciliation, portal sessions, authorization
  guards, and live-mode rejection remain covered by backend route tests. Real
  Stripe test credentials are still a platform-owned production gate.
- Billing usage no longer renders impossible ratios such as `107 / 10 used`.
  It shows the observed count separately from the plan allowance, and marks
  activity for a zero-limit entitlement as historical.
- Live browser QA exercised `Preview Plus`, confirmed that no new browser tab
  opened, observed the workspace-bound pending preview, cleared it, and verified
  the workspace returned to Free with no pending checkout. Billing and Generated
  media had zero horizontal overflow at the 390px responsive viewport.
- Focused frontend contracts passed 70/70, Billing routes passed 36/36, app and
  server typechecks passed, and the complete 10-stage platform safety gate
  passed. Final log: `/tmp/matterhorn-platform-safety-setup-ownership.log`.

### July 12 global text contrast pass

- Dark-theme secondary text now uses `#d0dae5` and muted metadata uses
  `#c4ceda`, up from the previous shared `#b4bdca` level. Primary text remains
  `#fafcff`, preserving a clear three-level hierarchy.
- Light-theme secondary and muted text now use `#41495a` and `#4c5566`.
- Measured contrast is 14.25:1 and 12.66:1 in dark mode, and 8.56:1 and
  7.12:1 in light mode. Project Home and Billing render the new tokens without
  horizontal overflow.
- Theme readability, 35 focused UI contracts, the Matterhorn design-system
  gate, the production app build, and `git diff --check` passed.

### July 12 overnight whole-platform verification

- A fresh browser profile initially exposed incorrect local runtime wiring:
  port `5182` had been restarted without the backend URL and client token, so
  saved browser profiles connected while clean profiles opened the workspace
  recovery screen. The app was restarted with explicit `4126` backend wiring;
  the clean-profile product smoke then passed all 18 stages with no console,
  page, or network errors. Evidence:
  `qa-reports/matterhorn-product-browser-smoke-overnight-2026-07-12-rerun/summary.json`.
- The strict full-platform browser audit passed 30 surfaces, 6 interactions,
  and 1,061 classified controls with zero responsive, accessibility, console,
  page, or network issues. Evidence:
  `qa-reports/matterhorn-full-platform-browser-audit-overnight-2026-07-12/summary.json`.
- Wallet approval browser QA passed all 6 stages: injected connector setup,
  failed-simulation blocking, reviewed Base Sepolia submission, and mainnet
  blocking. Evidence:
  `qa-reports/wallet-approval-browser-smoke-overnight-2026-07-12/summary.json`.
- Repeated generated-media QA found that the persisted workspace Free plan was
  overriding the launcher's intended local Max fixture. The launcher now uses
  `MATTERHORN_BILLING_ACCOUNT_PATH` for isolated smoke billing state, preserving
  the user's `.matterhorn-work/billing/subscription.json` while keeping the QA
  lane repeatable. The repaired browser flow passed all 14 stages through mock
  image generation, fake Walrus upload, Sui mint preview/receipt, Kiosk listing
  preview/receipt, and safe diagnostics. Evidence:
  `qa-reports/generated-media-browser-smoke-overnight-2026-07-12-isolated/summary.json`.
- The app test tree passed 507 tests across 63 files. The server package test
  command previously ran both `src/` and stale compiled `dist/` tests, doubling
  runtime and producing false failures. It now runs `bun test src --timeout
  15000`; the stable source gate passed 681 tests across 52 files with zero
  failures. The 15-second integration timeout accommodates isolated server and
  watcher startup under full-suite load; the two initially timed-out files also
  passed 35 focused tests when rerun directly.
- App, server, and Electron typechecks passed. The app and server production
  builds passed. Electron bridge coverage reports 50 renderer methods. Desktop
  first-run, clean-profile packaging, updater safety, macOS tester artifact,
  Monday RC, Monday launch-readiness, design-system, theme-readability, brand,
  and `git diff --check` gates passed.
- The complete 10-stage platform safety gate passed after the fixes. Log:
  `/tmp/matterhorn-platform-safety-overnight-final-2026-07-12.log`.
- Production-required readiness remains intentionally blocked at Stripe test
  billing because the live local backend is in mock preview mode. Generated
  media separately reports six platform-owned requirements: production OpenAI
  image provider/key, Walrus publisher and relay, Sui NFT package, Kiosk
  package, and TransferPolicy package. Machine-readable evidence:
  `qa-reports/matterhorn-production-readiness-overnight-2026-07-12.json` and
  `qa-reports/generated-media-production-readiness-overnight-2026-07-12.json`.
- The app package's binary-driven E2E wrapper passed its configuration and file
  checks but skipped four engine-binary probes because no packaged
  `MATTERHORN_WORK_ENGINE_BIN`/`OPENCODE_BIN` was supplied. This is distinct
  from the live browser/API coverage above, which passed against the running
  OpenCode service on `65325`; rerun the binary probes against the final desktop
  artifact before release.

### July 12 packaged desktop completion

- A fresh unpacked arm64 desktop application was built from the current tree at
  `apps/desktop/dist-electron/mac-arm64/Matterhorn.app`. The 703 MB bundle
  contains the production renderer, Electron main/preload code, in-process
  server, OpenCode `1.14.38`, orchestrator `0.13.12`, and the signed automation
  helper. Required `app.asar` entries and executable sidecars were inspected
  directly.
- The strict packaged clean-profile smoke passed 15/15 checks. It verified the
  `matterhorn-work://` protocol, authenticated control bridge, fresh `/welcome`
  route, General/Extensions/AI/Appearance navigation, macOS LaunchServices
  delivery into `/workspace/rem_ws_d6a5b5572860/session`, embedded-browser
  loopback navigation and close, stable process behavior, and removal of the
  temporary user profile. Evidence:
  `qa-reports/desktop-packaged-clean-profile-overnight-2026-07-12.json`.
- The local directory build is ad-hoc/unsigned by design. Distribution signing,
  notarization, Gatekeeper on a separate clean Mac, and the published updater
  channel remain release-operator checks rather than source defects.
- The clean-profile smoke CLI previously rejected `--help` as an unknown
  argument. It now exposes concise usage and option documentation, and its
  contract test executes the help path to prevent regression.
- The full 10-stage platform safety gate passed after the packaged-runtime and
  release-tooling changes. Final log:
  `/tmp/matterhorn-platform-safety-packaged-desktop-final-2026-07-12.log`.
- Native packaged-app inspection found two release-only regressions that the
  original route-only smoke did not detect. Protocol desk logos used root
  asset URLs that broke under `file://`, and remote workspaces persisted their
  credentials only under legacy `openwork*` fields while the renderer read
  canonical `matterhorn*` fields. The logo resolver now emits packaged-safe
  asset paths, and the Electron workspace bridge normalizes both legacy and
  canonical connection records without dropping backward compatibility.
- The packaged smoke now waits for an enabled authenticated workspace action
  after the remote-connect deep link. This would have failed on the partial
  connection that showed `Invalid bearer token` even though the route had
  already reached `/workspace/rem_ws_d6a5b5572860/session`.
- The rebuilt application passed the expanded strict packaged smoke 16/16:
  protocol registration, authenticated control, first-run routes, remote deep
  link, authenticated workspace actions, embedded browser open/navigation/
  close, and stable process behavior. Evidence:
  `qa-reports/desktop-packaged-clean-profile-token-fix-2026-07-12.json`.
- Packaged builds also ignore environment-supplied Chromium launch arguments
  and cannot enable the remote-debugging port. A hostile environment probe
  using remote-debug and disabled-web-security flags produced no CDP listener;
  source/dev launches retain the explicit debugging opt-in.
- After the remote-token compatibility patch, app and Electron typechecks,
  deep-link and packaging contracts, `git diff --check`, and the complete
  10-stage Matterhorn platform safety gate all passed again on the dirty shared
  integration tree.

### July 12 live continuation audit

- A fresh strict browser audit against the restarted `5182` stack passed all 30
  surfaces and 6 safe interactions. It inventoried 1,034 visible controls with
  no horizontal overflow, console errors, page errors, or reported issues.
  Evidence:
  `qa-reports/matterhorn-full-platform-browser-audit-continuation-2026-07-12/summary.json`.
- The product journey passed 18/18 stages, including all five desks, Project
  Activity/history, Notes, Memory, Wallet, support report, AI settings,
  Billing, and Generated media. The wallet approval journey passed 6/6,
  including simulation failure, reviewed Base Sepolia send, and blocked
  mainnet. Evidence:
  `qa-reports/matterhorn-product-browser-smoke-continuation-2026-07-12/summary.json`
  and
  `qa-reports/wallet-approval-browser-smoke-continuation-2026-07-12/summary.json`.
- The first repeated generated-media journey exposed HTTP 429 because the
  manually assembled long-running backend was still on the Free allowance with
  110 prior image records. Production allowance enforcement was correct, but
  the QA stack had drifted from its claimed Max plan. The launcher now verifies
  its isolated billing response is actually Max with an unlimited image limit
  before exposing the app URL. The browser smoke also fails immediately with
  the backend status/detail instead of waiting 30 seconds for a card that cannot
  appear.
- After replacing only the known QA processes with the hardened launcher, the
  generated-media browser journey passed 14/14: image output, local NFT draft,
  fake Walrus upload, Sui mint preview/receipt, Kiosk listing preview/receipt,
  retained history, and safe diagnostics. Evidence:
  `qa-reports/generated-media-browser-smoke-continuation-fixed-2026-07-12/summary.json`.
  The original failed report remains under
  `qa-reports/generated-media-browser-smoke-continuation-2026-07-12/` as useful
  regression evidence.
- Product readiness also exposed a capability-truth omission: the global
  backend response did not include `outputs`, so readiness reported `unknown`
  while output storage, export, deletion, project evidence, and generated image
  saving were working. `outputs` is now a first-class capability: `working`
  with read/write details on writable servers and `preview` with read-only
  details when writes are disabled. The live report now shows Outputs as
  `working`.
- Local product readiness passed 14 stages with zero failures and one optional
  generated-flow skip; the fuller run including generated media passed 15/15.
  Production-required mode now has exactly two expected operator-owned
  failures: Stripe test billing is not configured, and the current mock image
  provider is not a production provider. The safety report remains
  non-custodial, live submission disabled, no secret requests, and no training
  use by default.
- Focused launcher/browser contracts, backend writable/read-only output
  capability tests, types build, app/server typechecks, `git diff --check`, and
  the complete 10-stage Matterhorn platform safety gate all passed after these
  fixes. The corrected stack remains available at
  `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`.

### July 12 Billing behavioral browser evidence

- Billing now has a dedicated strict browser journey in
  `scripts/billing-browser-smoke.mjs`, backed by a static contract test and a
  root `smoke:billing-browser` command. The mandatory platform safety gate also
  verifies that this journey remains wired into release testing.
- The live browser journey passed 5/5. It loaded the confirmed Matterhorn Max
  plan, selected a different plan as a local preview, observed the checkout and
  refreshed status responses, and verified that no payment page opened, no raw
  card-data flow appeared, and the confirmed entitlement remained Max.
- The journey then cleared the pending preview, observed the delete and status
  responses, and verified that the backend returned to `pendingCheckout: null`
  with Max still active. Billing readiness also states that plan selection is a
  local preview and live payments are disabled.
- Browser evidence is in
  `qa-reports/billing-browser-smoke-continuation-fixed-2026-07-12/summary.json`
  with its screenshot beside it. The first strict run remains in the adjacent
  non-fixed report and records only an optional OpenCode 404 console-noise
  classification issue; the behavioral stages had already passed.
- Focused Billing UI contracts passed 11/11. The complete Billing backend suite
  passed 36/36, covering test checkout, return-URL allowlisting, signed webhook
  reconciliation, replay/stale-event safety, portal behavior, permissions,
  read-only behavior, payload limits, and mock preview semantics.
- The full 10-stage Matterhorn platform safety gate passed after adding Billing
  browser coverage. The live backend was checked after the journey and remains
  on Max with no pending checkout; the live app and OpenCode health surfaces
  are responding.

### July 12 Notes-to-Memory behavioral browser evidence

- Notes and Memory now have a dedicated strict cross-surface browser journey in
  `scripts/notes-memory-browser-smoke.mjs`. It is backed by a static contract,
  root smoke/test commands, and mandatory platform safety-gate wiring.
- The live journey passed 7/7: open Notes, create a workspace note, autosave its
  complete title/body through the backend, explicitly send it to Memory review,
  isolate it with search and the Memory-suggested filter, reopen the persisted
  content, delete the note, and dismiss the suggestion without saving Memory.
- Every write stage asserts the corresponding HTTP response and returned state.
  The report confirms `noteDeleted: true`, `suggestionDismissed: true`, no saved
  QA Memory, and zero console, page, or network failures. Evidence:
  `qa-reports/notes-memory-browser-smoke-continuation-2026-07-12/summary.json`.
- Focused Notes UI/backend suites passed 10/10. The backend suite covers daily
  Markdown persistence, explicit-review-only Memory handoff, secret-shaped
  suggestion blocking, concurrent patch serialization, collaborator scope,
  read-only mode, viewer denial, and missing-workspace behavior.
- The full 10-stage Matterhorn platform safety gate passed again with 52/52
  tests in the expanded backend-security stage and the Notes/Memory browser
  contract in the browser-smoke stage.

### July 12 Outputs behavioral browser evidence

- Outputs now have a dedicated strict browser journey in
  `scripts/outputs-browser-smoke.mjs`, with a static contract, root smoke/test
  commands, and mandatory platform safety-gate wiring.
- The live journey passed 6/6: create a preview-only Sui output, select it in
  the Outputs rail, copy its exact path, download its exact file, create and
  remove a linked note, and delete the output. Both QA records were confirmed
  absent from the backend afterward.
- The first browser run exposed invalid nested interactive markup in the output
  list: each selectable output button contained copy/note/reveal/delete/open
  buttons. The row is now a neutral container with a dedicated sibling
  selection button and sibling actions, preserving keyboard and screen-reader
  semantics.
- Evidence is in
  `qa-reports/outputs-browser-smoke-continuation-clean-2026-07-12/summary.json`.
  The final run reported no console, page, or network errors. Focused Outputs
  contracts and app typecheck passed, and the full platform safety gate passed
  after the browser contract was added.

### July 12 Profile and Wallet rail redesign evidence

- The compact Profile rail no longer repeats Cloud/account state across an
  introduction, capability list, readiness list, signed-out notice, and support
  section. It now leads with the working local profile, explains scoped local
  teammate access once, places backend version and raw capability state behind
  `Technical details`, and shows Matterhorn Cloud once as `Not included` in
  this build.
- `Open workspace preferences` is the one primary Profile action and was
  exercised live to
  `/workspace/ws_d6a5b5572860/settings/preferences`. Help and support are a
  small action row instead of another readiness panel.
- Wallet connector rows, the Sui unavailable state, network controls, and
  safety-policy inputs now use distinct restrained surface tiers. A computed
  dark-mode check caught the shared Input component overriding the local
  background; explicit dark variants now keep the editable safety values
  visibly separate from the rail canvas.
- Light and dark desktop captures, plus compact-width captures, are under
  `qa-reports/profile-wallet-rail-2026-07-12/`. All four browser passes loaded
  the expected surface without console or page errors. Focused Profile, Wallet,
  capability, and shared-primitive contracts passed 76/76, and app typecheck
  passed. The complete 10-stage Matterhorn platform safety gate passed after
  the final dark-mode input override.
- Phantom is now a persistent first-class row in the Sui wallet section. When
  unavailable it opens the Phantom install/enable path; when Wallet Standard or
  Phantom's injected Sui provider is detected, the same row connects the Sui
  account. Wallet Standard results exclude Phantom from the generic list so the
  UI never renders a duplicate connector.
- Compact Profile now separates information from interaction by surface
  strength: the local capability summary is quiet, Technical details rests at
  20%, support actions at 18%, and the primary workspace-preferences action at
  32%, with stronger hover and keyboard-focus states for each clickable target.

### July 12 Outputs rail redesign evidence

- The Outputs rail now separates browsing from inspection. The selected output
  has one concise title and one icon toolbar; file path/workspace metadata is
  behind `File details`, and the 97-item output browser is behind a collapsed
  `Browse outputs` disclosure instead of consuming the top half of the rail.
- NFT and Sui JSON receipts now render as a compact result summary, explicit
  custody/signing safety fields, copyable one-line identifiers, recorded time,
  and collapsed raw receipt data. Object IDs, transaction digests, kiosk IDs,
  transfer policies, and package IDs no longer wrap into broken multi-line
  values.
- Dark-mode desktop and 320px-rail captures are under
  `qa-reports/outputs-rail-redesign-2026-07-12/`. The 320px rail had equal
  client/scroll widths, no horizontal overflow, and no console or page errors.
- The strict browser journey was updated to open the two disclosures before
  exercising output selection. It passed 6/6 with exact path copy/download,
  linked-note create/delete, output delete, complete QA cleanup, and zero
  console, page, or network failures. Evidence:
  `qa-reports/outputs-browser-smoke-redesign-final-2026-07-12/summary.json`.
- Focused Outputs/receipt/Notes contracts passed 32/32 and app typecheck passed.
  The complete 10-stage Matterhorn platform safety gate passed after the
  redesign and browser-smoke update.

### July 12 actionable-surface contrast evidence

- Notes search and filter controls now keep a visible 22% muted-surface fill at
  rest, with 26% hover and 28% focus states. Note rows keep a quieter 12% resting
  surface and rise to 20% on hover or keyboard focus, so the panel stays sleek
  without hiding its clickable areas.
- Shared workflow task cards now keep a 20% resting surface and 30% interaction
  state. Their action buttons use a distinct 38% resting surface and 52% hover
  state while retaining the active desk color for the label. Focused desk back
  controls use a visible 20% resting surface instead of blending into the canvas.
- Live dark-mode computed-style checks on Notes and the Bittensor desk confirmed
  the expected resting fills and pointer behavior. The earlier desk action tint
  referenced a missing local CSS token and rendered transparent; the shared
  surface token now resolves correctly for every desk.
- Focused Notes, workflow-stage, shared-primitive, and customer-template
  contracts passed 79/79. App typecheck and `git diff --check` passed after the
  final rendered-state correction. The complete 10-stage Matterhorn platform
  safety gate also passed.

### July 12 Quick Jot redesign evidence

- Quick Jot now uses one calm editor surface instead of separate outlined title,
  body, and tag boxes. The title is typographic, the body expands into the
  available writing space, and tags sit in a compact low-contrast utility row.
- The oversized shared Sheet close control is replaced by a quiet icon action,
  and Cancel, Save and suggest memory, and Save note remain in a persistent
  footer. Existing note creation, attachment, memory-suggestion, and toast
  behavior is unchanged.
- An important width override now keeps the desktop rail at exactly 420px instead
  of inheriting the shared Sheet primitive's 75% width. Live verification at a
  639x678 viewport confirmed a 420px rail, visible footer, zero horizontal
  overflow, and no field borders.
- Focused Notes and shared-primitive contracts passed 38/38, the final width
  regression check passed 11/11, and app typecheck passed.

### July 12 compact wallet rail evidence

- The wallet rail now prioritizes the three user jobs that require immediate
  action: connect a wallet, prepare a Sui handoff, and set spend limits.
- Safety history is hidden when empty and becomes a one-line `Safety activity`
  disclosure when events exist. Full event reasons and chain/value metadata are
  still available after expansion.
- Protocol-by-protocol capability copy is collapsed under `Supported wallets
  and desks`. Runtime, signing, and secret-handling guidance is collapsed under
  `How signing works`; the separate always-open safety-boundary block was removed
  from the compact rail. The full-page wallet settings view retains the detailed
  reference layout.
- Focused wallet runtime, approval-security, and shared-primitive contracts pass,
  app typecheck passes, and the compact disclosure behavior is contract-locked.
  Live verification at 639x678 confirmed both disclosures start closed, expand
  independently, introduce no horizontal overflow, and reduce the rail content
  to a short 802px scroll surface with the current test data.

### July 13 compact MCP rail evidence

- The embedded `MCPs & Tools` tabs now use a slim active underline instead of
  two large filled blocks. Redundant `post-go-live` copy is omitted in the rail.
- Configured MCP servers use compact borderless rows with a soft interaction
  state; full-page MCP management retains the larger management cards.
- Matterhorn MCP products are rendered as individual low-contrast disclosure
  rows instead of one large framed container. The selected product still opens
  its tools, compatibility, docs, and safety information in place.
- Empty and runtime-status states are now short inline messages rather than
  bordered notices or oversized dashed boxes.
- Live verification at 639x678 confirmed zero horizontal overflow, a 48px empty
  state, borderless tab sides, and working MCP disclosure expansion. Focused UI
  and backend-capability contracts pass 38/38 and app typecheck passes.

### July 13 fresh-session and full-platform verification

- The complete 10-stage Matterhorn platform safety gate passed after the wallet
  and MCP rail changes. It covered wallet behavior, money-path security, all
  desks and workflows, Billing, local/desktop perimeters, error boundaries,
  design contracts, browser contracts, and production readiness.
- A fresh product smoke exposed two stale assertions after the wallet and model
  picker redesign. Wallet checks now accept the actual Phantom install/connect
  action or connected state, and the model picker opens the live `OpenCode`
  provider before verifying `Big Pickle`.
- The first full-platform audit also exposed a deeper fixture defect: a session
  created through the fake OpenCode engine worked in the creating browser but a
  direct URL in a fresh context returned to Project Home. The fake engine stored
  the SDK's percent-encoded directory header literally, so session scoping
  filtered the persisted chat out. The fixture now decodes that header in the
  same way as real OpenCode.
- The product browser smoke now includes a mandatory fresh 390px browser-context
  direct-link stage. The final run passed 19/19 stages and kept
  `ses_generated_media_smoke_001` on its direct chat URL with the composer and
  response-perspective controls visible.
- The full-platform audit now accepts an explicit current chat URL or product
  report and validates its origin/workspace before use. It also closes Chromium
  after thrown errors instead of hanging with an orphaned browser.
- Final live evidence:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-direct-link-fixed/summary.json`
  is ready with 19/19 stages, no browser errors, and no tracked network failures.
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-verified/summary.json`
  is ready with 30/30 surfaces, 6/6 interactions, 1,012 controls, zero overflow
  issues, and zero P0/P1 findings.

## July 13 selected-workspace settings client verification

- Settings routes now pass the selected workspace endpoint client to Overview,
  General, Permissions, AI Providers, Profile/Cloud, Wallet, Generated media,
  and Billing. Previously those views received only the optional shell-level
  client, which could make working workspace-backed actions appear disabled.
- Live browser checks confirmed that `Open notes`, `Quick Jot`, and `Open Memory
  review` are enabled after workspace resolution and open their real session
  panels/composer. Focused settings and billing contracts pass 44/44, and the
  app TypeScript check passes.
- The full-platform audit now waits for the Overview workspace client before
  inventorying controls. This removes four false `unavailable` results caused
  by inspecting first paint before the workspace query resolved.
- Current product evidence is
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-settings-client-fix/summary.json`:
  ready, 19/19 stages, including a persisted direct-chat reload, with no
  warnings, browser errors, or tracked network failures.
- Current full-surface evidence is
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-settings-client-ready/summary.json`:
  ready, 30/30 surfaces, 6/6 interactions, 1,003 controls, no overflow or
  P0/P1 findings. The remaining 18 disabled controls are expected state:
  empty-state delete/send controls, desktop-only folder access, unchanged
  model default, unavailable customization fields, payment-provider setup
  gates, and the active Outputs navigation item.
- The complete 10-stage `pnpm test:matterhorn-platform-safety` gate was rerun
  after the settings-client and audit-readiness changes and passed in full.
- The browser audit now exercises three additional customer journeys instead of
  only inventorying their controls: Settings Quick Jot, Settings Notes/Memory
  navigation, and MCP My Extensions/Marketplace plus inline MCP disclosure.
  The first expanded run exposed a real Memory routing inconsistency. Settings
  Overview used transient panel state and navigated to `/session`; it now uses
  the explicit, refreshable `?panel=memory` workspace route, matching Notes.
- Focused route/settings contracts pass 29/29 and app typecheck passes after the
  Memory deep-link fix. Fresh evidence is
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-memory-route/summary.json`
  (19/19 stages) and
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-interactions-fixed/summary.json`
  (30/30 surfaces, 9/9 interactions, 1,054 controls, zero issues).
- The complete 10-stage platform safety gate was rerun again after the Memory
  route and expanded interaction coverage landed; all stages passed.
- Customization no longer presents host- or Cloud-owned policy as disabled
  switches. `Display model picker` now hides and restores the real chat model
  selector, and `Display new workspace button` now hides and restores the real
  sidebar action. Browser availability and organization policy render as
  read-only live state (`Host managed`, `Allowed`, `None`, `Local default`).
- The isolated browser journey toggles both working controls off, verifies their
  targets disappear, restores defaults, and verifies both targets return. The
  page was also added to the narrow-mobile surface inventory. Focused contracts
  pass 40/40 and app typecheck passes.
- Current evidence is
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-customization/summary.json`
  (19/19 stages) and
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-customization-mobile/summary.json`
  (31/31 surfaces, 10/10 interactions, 1,026 controls, zero issues). The desktop
  disabled-control inventory dropped from 18 to 11; the mobile report adds only
  the expected disabled default-reset action for its second viewport.
- The complete 10-stage platform safety gate was rerun after the Customization
  wiring and mobile audit expansion; all stages passed.
- Permissions now renders folder authorization according to the host and live
  workspace capability. Desktop local writable workspaces keep the real folder
  picker; web shows `Desktop app only`, remote workspaces show `Local workspace
  only`, disconnected workspaces show `Connect workspace`, and read-only config
  shows `Read only`. No unavailable state renders a disabled Add folder button.
  Folder rows also use a soft surface instead of outlined cards.
- Focused settings/capability contracts pass 20/20 and app typecheck passes.
  Fresh evidence is
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-permissions/summary.json`
  (19/19 stages) and
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-permissions/summary.json`
  (31/31 surfaces, 10/10 interactions, 998 controls, zero issues).
- The complete 10-stage platform safety gate was rerun after the Permissions
  host-capability change; all stages passed.

## July 13 live MCP connection truth

- The isolated OpenCode runtime now implements the same `GET /mcp` status
  contract used by the app. It reports the two MCPs already configured in this
  workspace as `wallet: connected` and `crypto: connected`; the Matterhorn
  backend separately lists both project entries from `.opencode/opencode.json`.
- The app derives its summary from those two live sources. The MCP page now
  proves the state as `2 MCP servers active`, names them `Wallet MCP` and
  `Crypto MCP`, and shows the individual `wallet` and `crypto` rows as `Ready`.
  There is no fixture-only count or hard-coded connected label in the UI.
- The product browser smoke now treats the OpenCode MCP proxy as required
  instead of ignoring its previous 404. Its new MCP stage verifies the count,
  accessible connected-name summary, configured rows, and records the names in
  the JSON evidence. The final run passed 20/20 stages with no warnings,
  console errors, page errors, or network failures:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-mcp-truth-rerun/summary.json`.
- The full-platform audit also requires the named MCP summary during the MCP
  tab/disclosure journey and no longer ignores `/opencode/mcp` failures. Its
  final run passed 31/31 surfaces and 10/10 interactions, inventoried 1,035
  controls, and reported zero issues:
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-mcp-truth-fresh-chat/summary.json`.
- The audit's duplicate mobile-chat reload was removed after the same chat had
  already passed the mobile surface inspection; this retains the marker and
  control coverage while avoiding a second race-prone navigation before the
  evidence screenshot.
- When no report is supplied, the full audit now discovers product-smoke
  reports by modification time, accepts only `ready: true` evidence whose chat
  belongs to the same app origin and workspace, and uses the newest valid
  session. This replaces the old stale fixed-report fallback. A strict run
  without `MATTERHORN_FULL_AUDIT_PRODUCT_REPORT` passed 31/31 surfaces and
  10/10 interactions with zero issues:
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-auto-latest-report/summary.json`.
- Focused generated-media/MCP contracts, app typecheck, and `git diff --check`
  pass. The complete 10-stage `pnpm test:matterhorn-platform-safety` gate was
  rerun after the MCP runtime and audit changes and passed in full.

## July 13 production-required readiness probe

- `scripts/product-readiness-smoke.mjs --require-production
  --include-generated-media-flow` completed all 15 live checks against the
  isolated backend. Thirteen passed, including production CORS, backend and
  workspace capability truth, support export, data map/controls, local team
  access, project ledger/export, generated-media history, and the complete
  image-to-Sui receipt flow.
- Exactly two production checks remain blocked, both by operator-owned secrets
  or provider configuration rather than an unimplemented route:
  - Billing is deliberately `mock`; production readiness requires configured
    Stripe test mode before live mode can be considered.
  - Image generation is deliberately `mock`; production readiness requires a
    configured production image provider/API key.
- The probe preserved the safety boundary: non-custodial, live submission off,
  no secret requests, and training use `none_by_default`. Evidence is in
  `qa-reports/product-readiness-2026-07-13-production-required.json` and
  `qa-reports/product-readiness-2026-07-13-production-required.md`.

## 2026-07-13 MCP panel and inactive-control refinement

The compact `MCPs & Tools` rail now follows the same soft, low-chrome language
as the rest of the workspace shell:

- `My Extensions` and `Marketplace` are underline tabs instead of large filled
  segments.
- Connected apps and Matterhorn MCPs are grouped into quiet list surfaces with
  soft row hover/selection states instead of outlined cards per item.
- Healthy connection state is an inline green dot and text. The names are live
  backend truth: `Wallet MCP` and `Crypto MCP`.
- Web workspace startup and the backend `connected` transition both refresh MCP
  state. A browser reload no longer falls through to the obsolete desktop-only
  message while the server-backed MCP route is available.

The same pass removed inactive controls that looked actionable but could not do
anything:

- Empty feedback no longer shows a disabled `Delete all` action.
- Default customization no longer shows a disabled `Reset to defaults` action.
- AI model defaults only show `Save as workspace default` when the selected
  model differs from the saved workspace default.
- Billing renders current-plan and provider-setup states as status text; portal
  and plan buttons appear only when their backend action can run.
- The active Outputs rail control can close the rail even when no output target
  exists.

Fresh compiled-app evidence:

- `pnpm --dir apps/app typecheck`: pass.
- Focused UI/backend contracts: 73 pass, 0 fail.
- `git diff --check` for the touched source and contracts: pass.
- Product browser smoke: 20/20 stages, including all five desks, persisted chat
  reload, Notes, Memory, Wallet, AI, Billing, Generated media, and the two named
  MCP connections. Evidence:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-mcp-panel-refine-paired-rerun/summary.json`.
- Full browser audit: 31/31 surfaces and 10/10 interaction checks, 1,027 controls,
  0 issues. The only two unavailable controls are the expected empty-composer
  `Ask` buttons at desktop and mobile widths. Evidence:
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-mcp-panel-refine-paired-rerun/summary.json`.
- The complete 10-stage `pnpm test:matterhorn-platform-safety` gate passed.

The paired browser run used a higher request budget only for the loopback smoke
stack so the product journey and 31-surface audit could execute inside one
60-second window. Production defaults and the rate-limit security contract were
not changed.

## 2026-07-13 repeatable release-smoke launcher

The documented generated-media smoke launcher now owns the loopback QA request
budget needed by the official paired browser checks. A plain
`node scripts/dev-generated-media-smoke.mjs` launch sets a default synthetic
budget of 5,000 requests per 60-second read/write bucket for its child server.
This can be overridden with
`MATTERHORN_MEDIA_SMOKE_REQUEST_RATE_LIMIT_MAX`; it does not change the Matterhorn
server's production default or its security contract.

Cold startup is also less brittle. The authenticated workspace list and Billing
isolation checks now receive the same 45-second bounded retry window as server
health. The launcher still uses 1.5-second per-request aborts, so an individual
stalled request cannot consume the full startup window.

The full-surface audit now waits for both Memory data channels to complete their
post-paint initial fetch before inventorying controls. A disconnected or stalled
Memory backend therefore fails the surface instead of being mistaken for a
healthy disabled state.

Fresh same-process evidence, using the plain launcher command with no manual
rate-limit environment override:

- Product browser smoke: 20/20 stages, including all five desks, persisted chat,
  Notes, Memory, Wallet, AI, named MCP connections, Billing, and Generated media:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-13-launcher-reliability/summary.json`.
- Full browser audit immediately afterward: 31/31 surfaces, 10/10 interactions,
  1,029 controls, and zero issues. The only unavailable controls are the expected
  empty-composer `Ask` buttons at desktop and mobile widths:
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-launcher-reliability-final-settled/summary.json`.
- Launcher and full-audit contract tests pass, `git diff --check` passes for the
  changed scripts, and the complete 10-stage
  `pnpm test:matterhorn-platform-safety` gate passes.

## 2026-07-13 production publishing truth boundary and live Sui verification

The generated-media production verifier no longer treats any syntactically
configured dependency as production evidence. Safe local diagnostics remain
permissive for repeatable QA, but the production plan now separately requires:

- public HTTPS Walrus publisher and relay endpoints; loopback, private-network,
  and plain HTTP endpoints are local QA only;
- Sui NFT, Kiosk, and TransferPolicy identifiers that resolve as deployed Move
  packages on the selected Sui network;
- the existing production OpenAI image-provider requirement.

The Sui verifier uses the existing Mysten gRPC client for a bounded, read-only
`getObject` check and requires the returned object type to be `package`. Missing
packages and ordinary Sui objects fail the diagnostic. Network or timeout
failures produce a truthful `could not verify` warning and still block
production without claiming that the package does not exist. Missing and
repeated-character smoke ids skip chain calls so local QA remains fast.

The diagnostics response exposes only configuration, verification status,
duration, and readiness booleans. It does not return endpoint URLs, package
identifiers, upstream error messages, bearer tokens, or API keys. Public upload
and Sui mint/listing remain manual stages that require explicit user action and
wallet signing.

The production-required probe against the current synthetic smoke stack is now
truthful. All five safe diagnostics pass and the complete local image -> Walrus
-> Sui receipt flow still passes, while production readiness reports six
operator-owned blockers:

1. OpenAI image provider/API key.
2. Public HTTPS Walrus publisher endpoint.
3. Public HTTPS Walrus relay endpoint.
4. Sui NFT package verified on the selected network.
5. Sui Kiosk package verified on the selected network.
6. Sui TransferPolicy package verified on the selected network.

Evidence:

- `qa-reports/generated-media-production-readiness-2026-07-13-production-shape.json`
- `qa-reports/generated-media-production-readiness-2026-07-13-production-shape.md`
- `qa-reports/product-readiness-2026-07-13-production-shape.json`
- `qa-reports/product-readiness-2026-07-13-production-shape.md`
- `qa-reports/generated-media-production-readiness-2026-07-13-live-chain-verification.json`
- `qa-reports/generated-media-production-readiness-2026-07-13-live-chain-verification.md`
- `qa-reports/product-readiness-2026-07-13-live-chain-verification.json`
- `qa-reports/product-readiness-2026-07-13-live-chain-verification.md`

The combined product probe remains 13/15: Billing production readiness is also
blocked until Stripe test mode is configured, and generated-media production
readiness is blocked by the six items above. Its end-to-end local generated
media flow passes. `--require-production` now returns a nonzero exit code when
any production stage fails; previously it printed `FAIL` but exited 0 unless
`--strict` was also supplied.

Verification completed after the change:

- generated-media production/live-verification unit tests: 5 pass, covering
  verified packages, local smoke ids with zero chain reads, non-package objects,
  unavailable verification with redaction, and hard timeout bounds;
- generated-media route suite: 50 pass, including local probes, storage,
  entitlements, mint/listing plans, receipts, and secret rejection;
- direct read-only Sui testnet probe: built-in package `0x2` verified as a
  deployed Move package with custody, submission, and public writes disabled;
- backend support-report local-only readiness contract: pass;
- server TypeScript check: pass;
- product-readiness and platform-gate contract tests: pass;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: pass, with the new
  production-shape unit and generated-media readiness contracts included in
  the Product readiness stage.

## 2026-07-13 real OpenCode resilience and MCP panel hardening

An isolated real-provider stack now verifies the prompt path independently of
the synthetic product-smoke backend:

- app: `http://127.0.0.1:5275/workspace/ws_d1bce7653ad8/session`;
- backend: `http://127.0.0.1:4205`;
- workspace: `/tmp/matterhorn-real-opencode-20260713`;
- provider inventory: 166 catalog providers, one connected provider
  (`opencode`, OpenCode Zen), six usable models, and default model
  `opencode/big-pickle`.

The real prompt returned the exact marker `MATTERHORN_REAL_HARNESS_OK`. A
separate browser-submitted prompt rendered `MATTERHORN_BROWSER_HARNESS_OK` in
the chat UI, with the model picker and response-perspective controls working.
An abort test started `sleep 30; echo SHOULD_NOT_COMPLETE`, cancelled after
500 ms, returned in 535 ms, never emitted the completion marker, and left the
session idle. The managed OpenCode process was then terminated deliberately;
the backend scheduled a restart after 500 ms, recovered on restart 1, and the
next prompt returned `MATTERHORN_MANAGED_RESTART_OK`. This proves managed
recovery plus a successful post-restart prompt. A separate visible Retry-button
click was not claimed or required by this recovery check.

Direct session links also now survive macOS path canonicalization. OpenCode
stores the workspace under `/private/tmp/...`, while the configured workspace
may use `/tmp/...`. The backend canonicalizes the workspace directory before
querying OpenCode, and the frontend no longer re-filters the already scoped
session response using an exact path string. The verified deep link remained on
`/session/ses_0a5c6587dffeO8GbUPaff9OTTB?panel=extensions`, rendered the prior
browser marker, and did not show `Chat no longer available`.

The narrow MCPs & Tools panel was simplified around the actual workflow:

- one panel header instead of a duplicated outer and inner header;
- tabs and refresh share one compact row;
- no standalone connected-count row when no external MCP apps are connected;
- external apps and Matterhorn MCPs use quiet disclosure rows instead of
  outlined cards;
- normal sentence-case section labels replace tracked uppercase chrome.

Browser verification at the real session deep link showed one visible panel
header, one close control, one refresh control, no `Back to workspace` duplicate
control, and the truthful `No external MCPs connected` state. The visual capture
is `/tmp/matterhorn-polished-mcp-panel.jpg`.

Focused verification completed after these changes:

- server session read-model suite: 19 pass, 0 fail, 103 expectations;
- app perspective and shared-primitive contract suites: 33 pass, 0 fail,
  740 expectations;
- server and app TypeScript checks: pass;
- `git diff --check` for the touched files: pass;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: pass, including
  wallet approval, money-path security, all desk contracts, Billing integrity,
  router and desktop perimeters, error boundaries, the design contract, browser
  smoke contracts, and production-readiness contracts.

Fresh customer-stack verification against `http://127.0.0.1:5182` then passed
all 20 product-smoke stages, including every desk, persisted-session reload,
Project Activity and history, Notes, Memory, Wallet, support-report download,
AI model selection, named MCP connections, Billing, and Generated Media:
`qa-reports/matterhorn-product-browser-smoke-2026-07-13-goal-continuation-final/summary.json`.

The paired full-platform audit passed 31/31 desktop and mobile surfaces and
10/10 interactions, inventoried 1,107 controls, and reported zero issues:
`qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-goal-continuation-final-settled/summary.json`.
The only two unavailable controls are the expected empty-composer `Ask` buttons
at desktop and mobile widths. Manual capture review found that the first mobile
Customization screenshot had been taken during its finite fade-in transition,
which made healthy light-theme contrast look washed out. The audit now waits for
finite page animations to settle before measurement and capture. The rerun shows
full-opacity light-theme text and controls; its audit contract and diff check
pass.

A fresh production-required probe against the currently running `4125` stack
is saved at
`qa-reports/product-readiness-2026-07-13-goal-continuation-current.json` and
`.md`. Twelve stages pass, two fail, and the optional mutation-heavy media-flow
stage is skipped because the complete local flow already has separate evidence.
The passing stages cover CORS, capabilities, workspace readiness, control plane,
redacted support report, data map and controls, local team access, project
ledger and export, and generated-media history. The two failures are:

1. Billing production readiness: Stripe test billing is not configured on this
   smoke stack; mock and live modes are correctly rejected as production proof.
2. Generated-media production readiness: the production image-provider key,
   public HTTPS Walrus publisher and relay, and verified Sui NFT, Kiosk, and
   TransferPolicy packages are not configured.

The same probe confirms non-custodial behavior, live submission disabled, no
secret requests, and no training use by default. These remaining failures need
operator credentials, deployed endpoints, reviewed package identifiers, and
external acceptance tests; they are not safe to fabricate in code or mark
healthy from local mocks.

The repository's Monday beta report now preserves that same truth boundary.
`docs/monday-beta-launch-readiness.md` is explicitly a fixture/offline
**contract** audit: it records `Launch decision: NOT ASSESSED`, states that it
is not production go-live approval, and points operators to the
`--require-production` readiness probe plus the full platform safety gate. It
also treats the old PR #2 note as historical instead of claiming a live GitHub
state that the script does not query. The current process environment contains
none of the required Stripe, production image-provider, Walrus, or Sui package
configuration, so those production-owned gates remain visibly open.

The release-candidate pack has also been hardened from a collection of local
checks into a truthful launch decision. `scripts/monday-beta-rc-pack.mjs` now
includes the complete platform safety gate, the production-required product
probe (including the generated-media flow), and the deployed customer-app
browser smoke. A real release run must provide `--server-url`, `--token`,
`--workspace-id`, and `--app-url`; missing inputs are failed stages instead of
silent omissions. Its v2 report exposes `productionEvidence.complete`, redacts
the client token from commands and evidence, and cannot return `ready: true`
unless backend, browser, safety, Bittensor, and packaged-desktop evidence all
pass. The focused static/dry-run contract passes after this change.

Production configuration now has an explicit, redacted source of truth instead
of being inferred from scattered runtime code. The root `.env.example` lists
every launch-critical backend, app, Stripe test, image-provider, Walrus, Sui,
Cloud, CORS, approval, and release-evidence variable with non-secret
placeholders and conservative defaults. `docs/production-launch-configuration.md`
assigns each item to the Matterhorn operator, workspace owner, or end user and
gives the required configuration order and verification commands. This makes
the UI's setup language actionable: platform services and credentials are
operator setup, model-provider connections are workspace-owner setup, and
wallet connections or approvals are end-user actions.

`scripts/production-launch-environment.test.mjs` prevents that contract from
drifting. It verifies loopback-only backend binding, manual approvals, enabled
rate limits, exact HTTPS CORS, Stripe test mode (never live), OpenAI image
provider, Sui testnet, intentionally disabled Cloud, public HTTPS release URLs,
redacted credential placeholders, and runtime consumption of the documented
variables. The contract, platform-safety-gate contract, and release-candidate
pack contract pass, and the environment contract is now part of the full
platform safety gate.

## Readiness ownership and customer-safe setup pass (July 13)

Customer-facing degraded states now identify who owns the next action instead
of repeating `Needs setup` or `Unavailable`. Settings and task launch surfaces
distinguish engine offline, workspace unavailable, connect wallet, connect
provider, configure MCP, review access, configure Cloud, and Matterhorn platform
setup. Cloud-only account features say `Not included` in the current local
build, while local profile, chats, notes, memory, outputs, and scoped teammate
access remain available.

The session image and NFT surfaces no longer expose deployment environment
variable names to customers. They explain that Matterhorn must finish public
publishing configuration and preserve human-readable requirement descriptions;
the operator settings and launch documentation remain the place for exact
environment variables. The image composer similarly routes users to review
status instead of implying that they must configure platform infrastructure.

Focused verification passed 139 tests with 1,068 assertions, and the app
TypeScript check passed. Fresh browser evidence is saved at:

- `qa-reports/matterhorn-product-browser-smoke-2026-07-13-readiness-ownership/summary.json`: 20/20 journeys passed, including all five desks, persisted-session reload, Notes, Memory, Wallet, AI Providers, named MCP connections, Billing, and Generated media.
- `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-readiness-ownership/summary.json`: 31/31 surfaces and 10/10 interactions passed across 1,107 controls with zero issues.

The MCP panel now names the two live servers as `Wallet MCP` and `Crypto MCP`,
shows both app connections as ready, and uses compact rows with progressive
disclosure rather than outlined cards. The live AI Providers page reports one
connected provider and an engine fallback; Generated media reports working mock
image generation, configured Walrus, and preview-ready Sui mint/listing paths;
Cloud accurately remains not included in this build.

The full 10-stage `pnpm test:matterhorn-platform-safety` gate passed after this
ownership pass. It covered wallet approval behavior, money-path backend
security, all desk contracts, Billing integrity, router/daemon/Electron
perimeters, error boundaries, the design system, browser-smoke contracts, and
production-readiness wiring.

The follow-up responsive completion pass found and fixed a real tablet-width
panel failure. Between 768px and 1023px, JavaScript selected the docked session
panel while the Tailwind `lg` layout still hid that panel. The shared mobile
breakpoint now matches the 1024px docked-layout boundary, with a contract test
preventing the dead zone from returning.

The authoritative settled responsive audit is saved at
`qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-all-viewports-settled/summary.json`.
It passed 104 surface checks and 10 interactions across desktop, compact laptop,
tablet, and narrow mobile viewports, inventorying 3,161 controls with zero
issues. The only unavailable control at each viewport was the intentionally
disabled empty-composer `Ask` action.

A fresh production-readiness probe is saved at
`qa-reports/product-readiness-2026-07-13-responsive-current.json`. Thirteen
checks passed, including the complete image generation, NFT draft, Walrus,
Sui mint receipt, listing receipt, and preview-output flow. Two production-owned
checks remain blocked: this local smoke stack uses mock billing rather than
Stripe test mode, and production generated media still needs the OpenAI image
provider, public Walrus publisher/relay, and reviewed Sui NFT, Kiosk, and
TransferPolicy package deployments. Those values must not be fabricated in
source code.

After the responsive breakpoint fix, the focused UI contract passed 29 tests
with 705 assertions, app TypeScript passed, `git diff --check` passed, and the
full 10-stage `pnpm test:matterhorn-platform-safety` gate passed again. The live
app and backend health endpoints both returned HTTP 200.

## July 13 real-agent completion and MCP transport pass

The generated-media launcher on `5182` was separated from real-agent proof.
The managed local stack was started with `scripts/dev-matterhorn-local.mjs` on
`5190/4130`, with a supervised OpenCode sidecar. This exposed and fixed the
backend cause of the earlier Bittensor `Working` state that never produced a
result: the Crypto MCP only read `MATTERHORN_SERVER_URL`, while the managed
launcher injects `OPENWORK_SERVER_URL` and `OPENWORK_SERVER_TOKEN`. The MCP
therefore fell back to `localhost:8787` and sent no bearer token.

`packages/matterhorn-work-crypto-mcp/index.mjs` now accepts both Matterhorn and
OpenWork server aliases, forwards the bearer token, and bounds backend proxy
requests to 15 seconds. Its Bittensor smoke starts an authenticated test server,
injects only the `OPENWORK_*` aliases, and fails unless the MCP reaches that
server with the expected token. That smoke is now mandatory in the Desk depth
stage of the full platform safety gate.

The product browser smoke now has a real-engine mode:

- `--require-desk-results` waits for visible assistant output instead of
  treating navigation or a `started` event as success.
- Assistant output containing `fetch failed` is rejected.
- A structured question panel is reported as `waiting_for_user`, not a hung or
  completed answer. The Sui transfer preview correctly stopped at `Question 1
  of 5` and the smoke ended that QA-owned run cleanly.
- Task launchers are scoped by their `data-workflow-stage` identity, preventing
  repeated labels such as `Add market` from starting the wrong workflow.
- Polymarket compliance tasks require a public market URL or slug before
  launch. Simple lookups are bounded to two Polymarket searches and one direct
  public-source check, cannot delegate to subagents, and do not create files
  unless the user requests a saved report.

The authoritative completion-aware run is:
`qa-reports/matterhorn-product-browser-smoke-2026-07-13-real-desk-results-bounded-polymarket/summary.json`.
It passed all 20 stages with zero warnings, console errors, page errors, or
network failures:

- Bittensor completed with 7,394 visible assistant characters in 81.2 seconds.
- Hyperliquid completed with 3,720 visible assistant characters in 28.2 seconds.
- Polymarket completed with 2,920 visible assistant characters in 43.7 seconds,
  down from the earlier run that exceeded three minutes through repeated
  searches and three delegated subagents.
- Sui reached the expected five-question input checkpoint in 8.7 seconds.
- Persisted-session reload, Longevity, Project Activity/history, Notes, Memory,
  Wallet, support-report download, AI model selection, named MCP connections,
  Billing, and Generated media all passed in the same browser journey.

The compact MCP panel was rechecked at `390x844`. It uses underline tabs,
text-first connection state, compact MCP rows, and progressive disclosure
without outlined app/MCP cards or horizontal overflow. The real product smoke
also verified that backend status names the active servers `Wallet MCP` and
`Crypto MCP`.

Final verification on the current dirty tree:

- authenticated Bittensor Crypto MCP smoke: passed;
- completion-aware product-browser smoke contract: passed;
- desk input and workflow-card suite: 50 tests, 240 assertions, 0 failures;
- app TypeScript and server TypeScript: passed;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: passed, including
  wallet approval, money-path backend security, desk depth, Billing integrity,
  daemon/Electron perimeters, error boundaries, design contracts, browser-smoke
  contracts, production CORS, and generated-media readiness contracts.

The local platform is therefore working end to end for the tested flows. Public
go-live is still blocked only by the production-owned and external-device gates
below; local mocks, preview package identifiers, or generated-media fixtures
must not be presented as production acceptance.

## July 13 deterministic desk completion and waiting-state pass

Two consecutive completion-aware real-engine browser journeys now pass all 20
product stages on the managed `5190/4130` stack. Unlike visual-only smoke, these
runs wait for a visible assistant result or an actionable user checkpoint and
reject assistant output containing transport failures.

First pass evidence:
`qa-reports/matterhorn-product-browser-smoke-2026-07-13-deterministic-1/summary.json`.

- Bittensor completed in 80.3 seconds.
- Hyperliquid completed in 31.2 seconds.
- Polymarket completed in 54.5 seconds.
- Sui reached its structured five-question user checkpoint in 8.2 seconds.

Second pass evidence:
`qa-reports/matterhorn-product-browser-smoke-2026-07-13-deterministic-2/summary.json`.

- Bittensor session `ses_0a3fcca3affeLNqVA4L3ii1IZw` completed with 8,205
  visible assistant characters in 80.1 seconds.
- Hyperliquid session `ses_0a3fb8bd7ffeexwZFvLijH9GoB` completed with 3,465
  visible assistant characters in 25.7 seconds.
- Polymarket session `ses_0a3fb21bbffeMxpdhE7Uh97oWU` completed with 1,816
  visible assistant characters in 22.6 seconds.
- Sui session `ses_0a3fac43fffe3oio1HPSkRFfOw` reached the actionable
  `Question 1 of 5` checkpoint in 13.4 seconds. It was not labelled as model
  generation and the smoke did not click Stop while the user question was
  pending.
- Persisted-session reload, Longevity, Project Activity/history, Notes, Memory,
  Wallet, support export, AI model selection, `Wallet MCP` and `Crypto MCP`,
  Billing, and Generated media passed in the same journey.
- Warnings, page errors, console errors, and tracked network failures: zero.

The Sui stall was a UI/runtime contract defect rather than a slow model. OpenCode
can ask a free-form question with `options: []` and no explicit `custom` flag.
The question modal now treats that shape as free-form input, gives the field an
accessible label, and preserves the Next/Submit lifecycle. Pending questions or
approvals suppress the misleading `Stop generating` state. These behaviors are
locked by `apps/app/tests/question-panel-contract.test.ts`.

Polymarket had two backend defects. `pm_getEvent` returned the complete raw
Gamma event, causing a 43-market payload to be truncated into a temporary file,
and `pm_getOrderbook` called a nonexistent Gamma orderbook route. The Crypto MCP
now returns a compact event/compliance summary with at most five representative
markets. Order books resolve Gamma `clobTokenIds` through the public Polymarket
CLOB `/book` endpoint, sort and bound each side, and stop before any CLOB read
when `restricted: true`. Restricted responses contain no executable price,
size, share, bid, ask, or order fields.

The canonical and active Polymarket agents deny generic web search, web fetch,
and subagents. They stop immediately when an event or market reports
`restricted: true` or `compliance_blocked`. The second-pass transcript confirms
the exact intended path: `crypto_pm_searchEvents`, `crypto_pm_getEvent`, then a
final compliance explanation. There were no web calls, subagents, file reads,
shell commands, or order-book calls after the restriction was known.

`scripts/matterhorn-crypto-mcp-polymarket.test.mjs` provides a deterministic
local MCP protocol test. It proves compact event output, no CLOB call for a
restricted market, and correct two-outcome CLOB token resolution, sorting, and
limits for an unrestricted fixture. It is now mandatory in the Desk depth stage
of the full platform safety gate.

Final focused verification:

- workspace initialization and question-panel contracts: 10 pass, 0 fail, 49
  assertions;
- deterministic Polymarket Crypto MCP and desk-agent contracts: pass;
- app and server TypeScript checks: pass;
- active OpenCode permission parsing for Polymarket and Sui: `task`, `webfetch`,
  and `websearch` all resolve to `deny`;
- `git diff --check`: pass;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: pass, including the
  new MCP behavior test.

The current managed app remains available at
`http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`. Production launch
status is unchanged by this local reliability pass: Stripe test configuration,
the production image/Walrus/Sui publishing dependencies, real wallet-extension
acceptance, and external deployment/desktop checks below remain open.

## July 13 release-source suites and 104-surface audit

The supported full app test entrypoint is now `pnpm --filter
@matterhorn-work/app test`. It deliberately starts Bun from the repository root
because the app contract suite reads repository-owned scripts and source paths.
Running `bun test tests` from `apps/app` produced false `ENOENT` failures even
though the files existed. The package entrypoint now preserves the contract's
expected root.

Release-source verification on the current dirty tree:

- complete app suite: 520 pass, 0 fail, 3,507 assertions across 64 files;
- complete server suite: 689 pass, 0 fail, 4,888 assertions across 53 files;
- app production build: passed, with existing non-fatal Vite chunk-size
  advisories;
- server production build: passed;
- macOS workspace-activation coverage now compares the reload path with the
  canonical `realpath`, preserving the server's `/var` to `/private/var`
  normalization instead of treating it as a backend failure.

The expanded responsive audit evidence is
`qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-release-paced/summary.json`.
It passed all 104 surfaces across desktop, compact laptop, tablet, and mobile:

- 10 stateful interactions exercised;
- 3,591 controls classified, including stateful, destructive,
  financial/external, download, and unavailable controls;
- zero accessibility, overflow, console, page, network, or interaction issues.

The audit now pauses between surfaces through
`MATTERHORN_FULL_AUDIT_SURFACE_PACE_MS` (1,500 ms by default). An earlier rapid
104-surface pass exceeded the backend's 1,200-read-per-minute protection and
captured rate-limit pages as apparent UI failures. The paced audit verifies the
actual product without weakening the production rate limit.

The MCPs & Tools panel was included in the clean audit. Its live compact layout
uses underline tabs, unboxed app/server rows, progressive disclosure, and the
backend-reported names `Wallet MCP` and `Crypto MCP`. The `390x844` view has no
horizontal overflow.

Current production-required evidence is
`qa-reports/product-readiness-2026-07-13-real-managed-complete.json`: 12 pass,
3 fail, 0 skip. The failures are intentional release gates, not hidden local
successes:

- billing requires a real Stripe test-mode configuration instead of the local
  mock adapter;
- generated media requires six production inputs: an OpenAI production image
  key/provider, Walrus publisher, Walrus relay, reviewed Sui NFT package, Sui
  Kiosk package, and Sui TransferPolicy;
- the shared QA workspace has used 119 of 10 Free image generations, so a new
  production-required media flow is correctly blocked by the billing
  entitlement until the allowance resets or the test workspace is assigned an
  appropriate test plan. The deterministic isolated generated-media journey
  remains the functional flow evidence; this limit must not be bypassed in the
  product.

Final source gate after the suite, audit, and evidence updates:

- `git diff --check`: passed;
- full-surface audit contract: passed;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: passed.

## Production-owned go-live gates

These are not coding-complete merely because local UI renders.

### P0 before public go-live

- Deploy a real Matterhorn backend and OpenCode worker behind the production app; verify auth, CORS, tokens, TLS, and restart supervision.
- Decide whether Matterhorn Cloud is launching Monday. If yes, configure a real Cloud URL/API and run sign-in, callback, one-time-code fallback, organization, sync, and shared-worker tests. If no, keep the current local-only unavailable state.
- Connect at least one production model provider and run a fresh prompt/stream/stop/retry test with the exact production model.
- Configure production image generation, Walrus publisher/relay, and reviewed Sui package/Kiosk/TransferPolicy identifiers before enabling public NFT actions.
- Configure Stripe test keys, webhook secret, Plus/Max test prices, and return URLs; run a real Stripe test checkout and signed webhook reconciliation. Keep live charging off until refund/support/export review is complete.
- Verify real MetaMask, Coinbase Wallet, and Phantom extensions in Chrome with explicit user approval, chain switching, rejection, disconnect, reload persistence, and no-secret copy.
- Install generated MCP configuration in each supported coding client that will be advertised at launch and verify the displayed connected names come from live server status.

### P1 operational confidence

- Run the packaged desktop build on a separate clean machine, including Gatekeeper, signing/notarization, the published updater channel, default protocol association from Finder/Safari, external wallet handoff, folder permissions, and first-run backend bootstrap. Same-machine isolated-profile launch/navigation and LaunchServices remote-connect delivery now pass.
- Repeat the 30-surface audit at compact laptop, tablet, and narrow mobile widths against the final deployed production URL; the local source and compiled release audits already pass.
- Repeat the bounded stateful soak against the deployed backend/OpenCode pair while production monitoring is active; the local 45-cycle soak and repeated real-provider browser journeys already pass.
- Review the final dirty-file inventory by ownership group before staging anything. Stage only the agreed consolidation set.

## Exact release checks

```bash
pnpm test:matterhorn-product-browser-smoke
pnpm test:matterhorn-crypto-mcp-polymarket
pnpm test:wallet-approval-browser-smoke
pnpm test:generated-media-browser-smoke
pnpm test:billing-browser-smoke
pnpm test:notes-memory-browser-smoke
pnpm test:outputs-browser-smoke
pnpm test:matterhorn-platform-safety
pnpm --filter @matterhorn-work/app test
pnpm --filter matterhorn-work-server test
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
pnpm smoke:desktop-packaged-clean-profile -- --artifact-dir <artifact-dir> \
  --server-url <test-backend-url> --token <client-token> --strict --json
node scripts/product-readiness-smoke.mjs --require-production \
  --include-generated-media-flow --server-url <test-backend-url> \
  --token <client-token> --workspace-id <workspace-id> --strict --json
git diff --check
```

Live browser commands:

```bash
MATTERHORN_LOCAL_SERVER_PORT=4130 \
MATTERHORN_LOCAL_APP_PORT=5190 \
MATTERHORN_LOCAL_WORKSPACE=/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest \
OPENWORK_MANAGE_OPENCODE=1 \
pnpm dev:matterhorn-local

node scripts/matterhorn-product-browser-smoke.mjs --strict --json \
  --require-desk-results --desk-result-timeout-ms 240000 \
  --url http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session

node scripts/wallet-approval-browser-smoke.mjs --strict --json \
  --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session

node scripts/billing-browser-smoke.mjs --strict --json \
  --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session

node scripts/notes-memory-browser-smoke.mjs --strict --json \
  --url http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session

MATTERHORN_FULL_AUDIT_URL=http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session \
MATTERHORN_FULL_AUDIT_PRODUCT_REPORT=qa-reports/matterhorn-product-browser-smoke-2026-07-13-mcp-truth-rerun/summary.json \
  node scripts/matterhorn-full-platform-browser-audit.mjs --strict
```

For the isolated media stack:

```bash
MATTERHORN_MEDIA_SMOKE_SERVER_PORT=4127 \
MATTERHORN_MEDIA_SMOKE_APP_PORT=5183 \
node scripts/dev-generated-media-smoke.mjs

node scripts/generated-media-browser-smoke.mjs --strict --json \
  --url http://127.0.0.1:5183/workspace/ws_d6a5b5572860/session
```

## July 13 final readiness-language and compact-panel verification

The settings navigation now distinguishes implementation state from operator
setup instead of collapsing every non-green capability into `Needs setup`:

- healthy local Permissions and AI provider surfaces stay silent;
- Wallet remains `Early access` because direct wallet support is a preview;
- Generated media reports `Platform setup` when production dependencies are
  missing;
- Matterhorn Cloud reports `Local only` in this build;
- Billing reports `Preview only` while the mock adapter is active.

Generated media now presents mock image generation as `Preview`, not `Working`.
The page states that mock generation is for local testing and that Matterhorn
must connect a production provider before launch. The operator-owned checklist
now includes all six inputs reported by the production probe: production image
provider, Walrus publisher, Walrus relay, Sui NFT package, Sui Kiosk package,
and Sui TransferPolicy.

The compact MCPs & Tools panel was rechecked against the managed backend. It
uses underline tabs, unboxed configured-server rows, a compact client selector,
and disclosure rows for built-in MCPs. The live status names the two active
servers as `Wallet MCP` and `Crypto MCP`. At `390x844`, the document width stays
at 390 pixels with no horizontal overflow.

Final verification after these changes:

- complete app suite: 522 pass, 0 fail, 3,516 assertions across 64 files;
- app TypeScript check: passed;
- `git diff --check`: passed;
- complete 10-stage `pnpm test:matterhorn-platform-safety`: passed.

The refreshed production-required report is
`qa-reports/product-readiness-2026-07-13-real-managed-final-complete.json`: 12
pass, 3 fail, 0 skip. The three failures remain Stripe test configuration, the
six generated-media production inputs, and the shared QA workspace's Free image
allowance (119 used of 10). These must remain visible release gates; they were
not bypassed or represented as customer setup.

## July 13 connected-model truth and final responsive gate

The real managed stack was restarted from the current checkout before this
verification pass. Its active endpoints are:

- app: `http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`;
- Matterhorn backend: `http://127.0.0.1:4130`;
- supervised OpenCode sidecar: `http://127.0.0.1:61244`;
- generated-media fixture app: `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`;
- generated-media fixture backend: `http://127.0.0.1:4125`.

AI Providers now separates available catalog inventory from connections that
can answer a prompt. The backend currently reports 166 available providers and
5,659 catalog models, but exactly one connected provider: `opencode` / OpenCode
Zen. That connected provider exposes six selectable models. The page summary,
connected row, readiness summary, and model picker all show the connected count
instead of presenting the entire catalog as connected. Technical details render
only connected providers by default, with the other 165 available through the
explicit Connect provider flow. The local-only build also hides the unusable
Matterhorn Cloud model-subscription action.

The compact MCP panel was visually rechecked in the live managed app. It keeps
underline tabs, unframed connected-app rows, flat built-in MCP disclosures, and
one restrained active navigation state. It names the two backend-reported
connections as `Wallet MCP` and `Crypto MCP`. Current evidence:

- `qa-reports/mcp-panel-final-390x844-dark.png`;
- `qa-reports/mcp-panel-final-820x1100-dark.png`;
- `qa-reports/ai-providers-real-live-dark.png`;
- `qa-reports/ai-provider-details-real-live-dark.png`;
- `qa-reports/ai-model-picker-real-live-dark.png`.

The first expanded audit run used an intentionally aggressive 350 ms route pace
and exceeded the production-like local API budget. Its 115 P1s were 429
responses and its two P0 journey failures were downstream offline fallbacks.
No independent route or rendering failure remained after the limiter window
cleared. The same strict audit was rerun at its designed 1,500 ms pace without
changing product behavior:

- report: `qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-ai-truth-paced/summary.json`;
- result: ready;
- responsive surfaces: 104/104 passed;
- interaction journeys: 10/10 passed;
- controls inventoried: 3,814;
- horizontal overflow, console errors, page errors, network failures, P0s, and
  P1s: 0.

Final focused and platform verification:

- AI provider, model-readiness, and shared primitive contracts: 40 passed, 0
  failed, 762 assertions;
- app TypeScript check: passed;
- `git diff --check`: passed;
- complete `pnpm test:matterhorn-platform-safety`: all 10 stages passed.

The production-required report remains intentionally not ready at
`qa-reports/product-readiness-2026-07-13-real-managed-final-complete.json` with
12 pass, 3 fail, and 0 skip. The remaining failures are external launch inputs,
not hidden code fallbacks:

1. Billing must be configured and verified in Stripe test mode.
2. Generated media needs a production image provider, public Walrus publisher,
   public Walrus relay, reviewed Sui NFT package, reviewed Sui Kiosk package,
   and reviewed Sui TransferPolicy.
3. The shared QA workspace has used 119 of its 10 Free image generations and
   must be reset or tested with a legitimate paid/test entitlement before a
   production image-flow rerun.

## July 13 Marketplace truth and compact MCP final

The Extensions surface no longer exposes a dead Marketplace destination in the
local-only build. `ExtensionsView` now treats the marketplace as an actual
capability: the tab is absent when Matterhorn Cloud is disabled, and Cloud-enabled
builds render the real `CloudMarketplacesView` rather than a `post-go-live`
placeholder. This removes a customer-visible dead end while preserving the real
organization marketplace path for builds that can support it.

The compact MCPs & Tools panel was reloaded and inspected against the managed
backend at both the normal app viewport and `390x844`. It now presents:

- one quiet connection line naming `Wallet MCP` and `Crypto MCP`;
- unframed configured-app rows with truthful `Ready` states;
- a compact client selector and copy action;
- flat built-in MCP disclosure rows instead of nested cards;
- no unavailable Marketplace tab, `post-go-live` copy, or horizontal overflow;
- a working Bittensor disclosure with the expected 19-tool summary.

Current visual evidence:

- `qa-reports/mcp-panel-marketplace-truth-1280x720-dark.png`;
- `qa-reports/mcp-panel-marketplace-truth-390x844-dark.png`.

The final paced whole-platform browser audit is recorded at
`qa-reports/matterhorn-full-platform-browser-audit-2026-07-13-marketplace-truth/summary.json`:

- ready: true;
- responsive surfaces: 104/104 passed;
- interaction journeys: 10/10 passed;
- controls inventoried: 3,798;
- issues, console errors, page errors, and network failures: 0.

Focused contracts, the app TypeScript check, and `git diff --check` passed. The
complete `pnpm test:matterhorn-platform-safety` gate also passed all ten stages
after the Marketplace and compact-panel changes.

Production readiness remains intentionally blocked by the same three external
inputs: verified Stripe test configuration, the six generated-media production
dependencies, and a reset or legitimate entitlement for the exhausted shared
QA image allowance. None of these are represented as customer setup or bypassed
by the Extensions change.

## July 14 Preferences truth and refreshed browser evidence

Preferences no longer paints a disabled, checked Auto context compaction switch
before the workspace-backed value is available. The action slot now shows a
neutral loading indicator, renders the real switch only after the engine config
has loaded, and reports a quiet unavailable state if the read fails. This avoids
briefly telling a user that compaction is enabled when the saved value is off.

The browser audit now waits for the live Auto context compaction switch before
inventorying Preferences. It also excludes Base UI's 1-by-1 `aria-hidden`
checkbox backing inputs from the customer-visible control inventory. These
inputs remain in the DOM for the component library, but are no longer
misclassified as disabled visible controls.

Live persistence proof against the managed stack passed:

- initial workspace value: `true`;
- toggled value: `false`;
- value after a full route reload: `false`;
- restored workspace value: `true`;
- final loading and unavailable indicators: absent after readiness settled.

Generated-media diagnostics were also exercised live. The progressive section
runs without writes, reports the six exact platform-owned production blockers,
and keeps Walrus upload, Sui minting, and marketplace listing blocked until the
operator configuration and wallet steps are present. Billing continues to state
that local plan previews work while Stripe checkout is platform setup.

The first responsive audit attempt used the stale handoff session
`ses_generated_media_smoke_033`. The restarted fixture correctly did not contain
that session and routed to the Sui desk, so the chat marker could not appear. A
fresh product smoke created current fixture sessions and passed all 20 journeys.
The audit was then rerun with the newly created Bittensor chat.

Current evidence:

- product smoke: `qa-reports/matterhorn-product-browser-smoke-2026-07-14-preferences-truth/summary.json`;
- full responsive audit: `qa-reports/matterhorn-full-platform-browser-audit-2026-07-14-preferences-truth-rerun/summary.json`;
- production probe: `qa-reports/product-readiness-2026-07-14-live-managed.json`.

Final verification for this tranche:

- Preferences contract: 2 passed, 0 failed;
- full app TypeScript check: passed;
- fresh product smoke: ready, 20/20 journeys passed;
- responsive surface audit: ready, 104/104 surfaces and 10/10 interactions passed;
- controls inventoried: 3,090, with 0 issues, console errors, page errors, or
  network failures;
- complete `pnpm test:matterhorn-platform-safety`: all 10 stages passed.

The production-required probe remains intentionally not ready with 12 pass and
3 fail. The remaining release inputs are still operator-owned:

1. Configure and verify Stripe test checkout and signed webhook reconciliation.
2. Configure a production image provider, public Walrus publisher and relay,
   reviewed Sui NFT package, reviewed Sui Kiosk package, and reviewed Sui
   TransferPolicy.
3. Reset the shared QA image allowance or give that workspace a legitimate
   paid/test entitlement; the current Free workspace reports 119 of 10 images
   used and the production image-flow probe must not bypass billing policy.

## July 14 compact MCP stream and stale-chat recovery

The compact MCPs & Tools panel now uses one continuous operational stream
instead of stacked outlined cards. The active surface keeps connection truth
visible while reducing container weight:

- the active server line names `Wallet MCP` and `Crypto MCP`;
- refresh now shares that status row when Marketplace is unavailable instead
  of consuming a separate empty row;
- configured servers render as unframed rows with quiet Ready states;
- the client menu and copy action retain visible click contrast without an
  outlined control shell;
- built-in Matterhorn MCPs use transparent disclosure rows with soft hover and
  selected fills;
- no horizontal overflow is present at `390x844` or `820x1100`.

Visual evidence:

- `qa-reports/mcp-panel-soft-stream-2026-07-14/final-390x844-dark.png`;
- `qa-reports/mcp-panel-soft-stream-2026-07-14/final-820x1100-dark.png`.

Deleted or stale chat URLs now recover to Project Home without reopening a
previously focused desk. Recovery clears both the stale session side-panel key
and the global Home side-panel key before navigation, then shows `Chat no longer
available`. A browser regression opened the Sui desk first, visited a missing
session, and confirmed the final URL was Project Home with `Open a desk`
visible and no `Sui desk` heading.

Responsive audit evidence is recorded at
`qa-reports/matterhorn-full-platform-browser-audit-2026-07-14-mcp-soft-stream/summary.json`:

- ready: true;
- responsive surfaces: 104/104 passed;
- interaction journeys: 11/11 passed, including stale-session recovery;
- controls inventoried: 3,094;
- issues, console errors, page errors, network failures, P0s, and P1s: 0.

The generated-media fixture stack was restarted from the current checkout so
the user-facing URL is no longer serving stale Vite transforms. Its active URL
remains `http://127.0.0.1:5182/workspace/ws_d6a5b5572860/session`. A fresh
product smoke against that exact stack passed all 20/20 journeys and recreated
the current protocol sessions. The report is
`qa-reports/matterhorn-product-browser-smoke-2026-07-14-mcp-soft-stream-live/summary.json`.

Final verification for this tranche:

- shared UI and stale-session contracts: 34 passed, 0 failed, 754 assertions;
- browser-audit contract: passed;
- app TypeScript check: passed;
- `git diff --check`: passed;
- complete `pnpm test:matterhorn-platform-safety`: all 10 stages passed.

The production-required release gate remains 12 pass and 3 fail. The remaining
operator-owned inputs are unchanged: verified Stripe test configuration, the
six production generated-media dependencies, and a reset or legitimate
entitlement for the exhausted shared QA image allowance.

## July 14 terminal-response recovery and single-owner runtime

The live managed stack is now the single canonical owner of this checkout:

- app: `http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`;
- backend: `http://127.0.0.1:4130`;
- client token: `matterhorn-local-client-token`;
- fixture ports `5182/4125`: intentionally stopped.

Running the fixture and managed backends together against the same checkout was
the root cause of repeated chat aborts. Both processes rewrote the generated
Bittensor agent from different in-memory manifests. Each rewrite triggered the
workspace reload watcher, which restarted OpenCode during an active response.
After the fixture stack was stopped, the generated agent hash and modification
time remained stable and reload prompts stopped. Operationally, one backend
stack must own a checkout at a time; use a separate workspace root for any
concurrent fixture stack.

Chat now also reconciles terminal assistant failures from the authoritative
session snapshot instead of leaving an endless waiting state:

- active runs show a quiet activity mark, elapsed time after 10 seconds, and a
  longer-wait message after 30 seconds;
- the snapshot refreshes every two seconds while a response is active;
- a terminal abort clears the run state, restores the user's prompt, and keeps
  Ask available for retry;
- only the latest assistant failure is actionable, so older failed attempts do
  not override a newer successful reply;
- an assistant-run error no longer marks the entire session load as failed or
  disables the composer;
- a user-requested Stop remains silent instead of surfacing a false error.

The Bittensor desk fallback instruction now permits at most one public web
search after stale or fallback internal data, then synthesizes immediately.
With the single-owner runtime in place, the previously aborted Bittensor prompt
completed in approximately 50 seconds. It used the bounded fallback path and
returned a current synthesized result without another reload or indefinite
spinner.

The compact MCPs & Tools panel was also rechecked in the same managed app. It
uses soft, unboxed rows, names the active servers `Wallet MCP` and `Crypto MCP`,
keeps setup behind disclosure, and preserves click contrast without the earlier
outlined card stack. Visual evidence:

- `qa-reports/mcp-panel-polish-2026-07-14.png`.

Final verification on the current dirty integration tree:

- terminal recovery, session activity, and workflow contracts: 48 passed, 0
  failed, 242 assertions;
- app TypeScript check: passed;
- `git diff --check`: passed before this ledger update;
- strict browser audit:
  `qa-reports/matterhorn-full-platform-browser-audit-2026-07-14-recovery-single-owner/summary.json`;
- responsive surfaces: 104/104 passed;
- interaction journeys: 11/11 passed;
- controls inventoried: 3,723;
- audit issues, P0s, P1s, console errors, page errors, and network failures: 0;
- complete `pnpm test:matterhorn-platform-safety`: all 10 stages passed.

Production launch remains intentionally blocked by operator-owned inputs, not
by the response-recovery or MCP UI changes:

1. Configure and verify Stripe test checkout, portal, and signed webhook
   reconciliation while keeping live charging disabled.
2. Configure the production image provider, public Walrus publisher and relay,
   reviewed Sui NFT package, reviewed Sui Kiosk package, and reviewed Sui
   TransferPolicy.
3. Reset the shared QA image allowance or assign a legitimate paid/test
   entitlement; the Free QA workspace remains over its 10-image allowance.

## July 14 exhaustive production blocker inventory

The documented production probe previously treated `--strict` as fail-fast.
That made the first Stripe failure hide the generated-media setup and workspace
entitlement failures in the same release run. Strict mode now completes every
safe read-only stage, preserves a nonzero exit when any stage fails, and emits a
structured `launchBlockers` list with an owner and next action.

Current strict evidence:

- report:
  `qa-reports/product-readiness-2026-07-14-strict-complete-inventory.json`;
- operator-readable report:
  `qa-reports/product-readiness-2026-07-14-strict-complete-inventory.md`;
- result: 12 pass, 3 fail, 0 skip;
- platform spine, CORS, capabilities, workspace readiness, control plane,
  support report, data controls, team access, project ledger/export, and media
  history: passed;
- Stripe test billing: blocked, owned by the Matterhorn operator;
- production image, Walrus, and Sui publishing services: six requirements
  blocked, owned by the Matterhorn operator;
- generated-image allowance: 119 of 10 used on Free, owned by the workspace
  billing owner, resetting at `2026-08-01T00:00:00.000Z` unless a legitimate
  Plus or Max test entitlement is assigned first.

The probe contract test passes and now proves that strict mode reaches later
read-only stages after multiple independent failures. No credential values are
included in console, JSON, Markdown, or QA evidence.

A sanitized environment audit found every required Stripe, image-provider,
Walrus, and Sui production variable absent from the current process. The only
repository environment sources are placeholder/example or migration files; no
populated launch secret file is available in this checkout. The complete
10-stage `pnpm test:matterhorn-platform-safety` gate passed after the exhaustive
probe change, and `git diff --check` remains clean.

## July 14 launch-user acceptance pass

The current dirty integration checkout was retested as a customer against one
canonical managed stack:

- app: `http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`;
- backend: `http://127.0.0.1:4130`;
- client token: `matterhorn-local-client-token`;
- temporary probe stack on `5275/4205`: stopped so it cannot rewrite or reload
  the same checkout while a customer response is active.

The first customer smoke passed all 20 primary journeys with no warning,
console error, page error, or network failure. It covered Project Home, wallet
readiness, all five desks, direct chat reload, Project History, Notes, Memory,
Wallet, Settings, AI models, MCP connections, Billing, and Generated media.
Evidence:

- `qa-reports/matterhorn-product-browser-smoke-2026-07-14-launch-user-pass/summary.json`.

A paced responsive audit then passed every route and interaction at desktop,
compact-laptop, tablet, and mobile widths:

- responsive surfaces: 104/104 passed;
- interaction journeys: 11/11 passed;
- controls inventoried: 3,697;
- horizontal-overflow, console, page, network, P0, and P1 issues: 0.

Evidence:

- `qa-reports/matterhorn-full-platform-browser-audit-2026-07-14-launch-user-pass-clean-window/summary.json`.

An earlier audit was intentionally discarded after it was stacked immediately
behind another large browser suite and exhausted the bounded one-minute local
read budget. That produced a temporary 429 cascade and two downstream Memory
timeouts. The backend recovered at the documented window boundary, the
capability endpoint returned 200 again, and the identical clean-window audit
passed with zero issues. The bounded rate limit remains enabled and its
read/write budget separation contract continues to pass.

The stricter result-required desk smoke also passed all 20 journeys. It proved
that the launch actions do more than open a chat:

- Bittensor completed in about 38 seconds with 5,620 assistant-text characters;
- Hyperliquid completed in about 32 seconds with 5,069 characters;
- Polymarket completed in about 22 seconds with 3,879 characters;
- Sui correctly paused at `Question 1 of 5` for required user transaction
  inputs instead of inventing wallet or transfer data;
- direct reload of the created Bittensor session passed in a fresh browser
  context;
- no warning, browser error, or network failure was recorded.

Evidence:

- `qa-reports/matterhorn-product-browser-smoke-2026-07-14-launch-results/summary.json`.

Focused customer and backend verification on this exact tree:

- Notes, Memory, Outputs, Wallet connectors, Billing, Generated media, MCP
  runtime availability, and capability UI: 83 passed, 0 failed;
- generated-media, billing, and backend-security routes: 124 passed, 0 failed;
- app TypeScript check: passed;
- `git diff --check`: passed before this ledger update;
- complete `pnpm test:matterhorn-platform-safety`: all 10 stages passed on the
  launch-user acceptance tree.

The strict production-required probe remains deliberately not ready with 12
passes and 3 failures. These are release inputs, not hidden customer setup:

1. **Stripe test billing, Matterhorn operator:** configure test keys, signed
   webhooks, Plus/Max test prices, checkout return URLs, and verify checkout,
   portal, and reconciliation while live charging remains disabled.
2. **Generated-media services, Matterhorn operator:** configure and acceptance
   test the production image provider, Walrus publisher, Walrus relay, Sui NFT
   package, Sui Kiosk package, and Sui TransferPolicy.
3. **Generated-image allowance, workspace billing owner:** assign a legitimate
   Plus/Max test entitlement or use a fresh launch QA workspace. The current
   Free workspace is over its allowance and resets on
   `2026-08-01T00:00:00.000Z`; the product correctly refuses to bypass it.

Evidence:

- `qa-reports/product-readiness-2026-07-14-launch-user-pass.json`;
- `qa-reports/product-readiness-2026-07-14-launch-user-pass.md`.

Launch recommendation: **GO for a local, non-custodial beta limited to the
verified core journeys. NO-GO for a public production launch that promises live
billing or production image-to-Sui publishing until all three release-owner
gates above are green.** Real MetaMask, Coinbase Wallet, and Phantom device
acceptance, plus Developer ID signing, notarization, clean-machine Gatekeeper,
and updater-channel verification, must also be recorded before distributing the
macOS build outside the controlled beta group.

## July 14 final Wednesday candidate reconciliation

The implementation and launch-verification pass is complete for the controlled
local beta scope. The canonical managed stack remains:

- app: `http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`;
- backend: `http://127.0.0.1:4130`;
- backend health at final check: `ok: true`, version `0.13.12`;
- one backend listener on `4130` and one Vite listener on `5190`.

Final implementation fixes in this tranche:

- Generated Media browser acceptance recognizes the truthful `Local test` and
  `Platform setup` production modes without treating local fixtures as live
  production.
- A concurrency-sensitive Notes denial test now has the same bounded 15-second
  allowance used by adjacent route integration tests; the isolated and full
  backend stages pass.
- Customer-onboarding UI contracts now describe the current soft, compact MCP,
  profile, and connection designs instead of stale boxed layouts.
- The release-candidate pack parses complete child JSON before applying its
  6,000-character redacted report tail. This removes a false `NOT_READY` result
  for large successful browser evidence while preserving the semantic
  `ready === true` requirement.

Final evidence summary:

- full `pnpm test:matterhorn-platform-safety`: all 10 stages passed;
- canonical result-required browser smoke: 20/20 passed;
- clean first-run workspace: 20/20 passed;
- Generated Media isolated local-test flow: 14/14 passed;
- Bittensor static beta gate: 16/16 passed;
- customer-ready crypto smoke: 52/52 passed;
- desktop beta doctor: 11/11 passed;
- packaged desktop clean-profile smoke: 16/16 passed;
- corrected RC pack: 13 pass, 2 fail, with the deployed browser stage now
  correctly passing semantically.

Primary evidence:

- `qa-reports/matterhorn-product-browser-smoke-2026-07-14-canonical-final/summary.json`;
- `qa-reports/matterhorn-product-browser-smoke-2026-07-14-clean-launch-workspace-r4/summary.json`;
- `qa-reports/generated-media-browser-smoke-2026-07-14-launch-final-r2/summary.json`;
- `qa-reports/matterhorn-bittensor-beta-2026-07-14.json`;
- `qa-reports/matterhorn-crypto-smoke-2026-07-14-r2.json`;
- `qa-reports/desktop-packaged-clean-profile-2026-07-14.json`;
- `qa-reports/matterhorn-desktop-beta-doctor-2026-07-14.md`;
- `qa-reports/matterhorn-wednesday-rc-pack-2026-07-14-final-r2/matterhorn-monday-beta-rc.json`;
- `qa-reports/product-readiness-2026-07-14-canonical-final.json`.

Release decisions:

1. **GO:** controlled local web beta for the verified non-custodial core
   journeys.
2. **GO with explicit warning:** unsigned internal macOS tester artifact for
   named testers only. DMG SHA-256 is
   `ae07cc5eb17c09b8988874237ac0bf4952e52be277bab5489cc3f3d94973ffe9`;
   ZIP SHA-256 is
   `3a044e9cc1d1a762cb122f537f8bcb6f01b8531d07e467c959c69de4d2ecd8b8`.
3. **NO-GO:** public macOS distribution. No valid Developer ID identity,
   notarization credentials, Gatekeeper pass, or signed updater metadata is
   available, and the public version must be bumped beyond `0.13.12`.
4. **NO-GO:** production Billing. Stripe test checkout, portal, prices, signed
   webhooks, and entitlement reconciliation are not configured.
5. **NO-GO:** production image-to-Sui publishing. Six operator-owned provider,
   Walrus, and Sui package inputs remain absent.
6. **NO-GO:** claims of real MetaMask, Coinbase Wallet, or Phantom device
   acceptance until extension testing is recorded.
7. **NO-GO:** formal Bittensor test-customer packet until real customer smoke,
   Bittensor evidence verification, and browser QA are attached.

The complete decision record and remaining-owner checklist is in
`docs/wednesday-beta-launch-execution-2026-07-15.md`. The dirty integration
tree is intentionally preserved. Nothing was staged, committed, pushed,
reset, reverted, or cleaned during this final reconciliation.

## July 14 exact-source final E2E and managed MCP hardening

The Wednesday release candidate received one final exact-source pass in the
clean RC worktree. The managed OpenCode process now receives an authenticated
Matterhorn MCP configuration in memory. The credential is never written to the
workspace, and the MCP exposes only nine bounded status/read/preview tools.

The four protocol agent definitions use deny-by-default runtime tool maps. The
Bittensor agent is explicitly limited to one bounded Bittensor MCP call and
must answer immediately from that evidence. The final user-two trace contains
exactly one completed Bittensor MCP call and no Bash, file, generic web, or
subagent tool part. This replaces an earlier diagnostic canary where the model
attempted a shell fallback that the runtime rejected.

Final verification on the exact source:

- app tests: 536 passed, 0 failed, 3,590 assertions across 69 files;
- server tests: 695 passed, 0 failed, 4,921 assertions across 55 files;
- platform safety: all 10 stages passed;
- app and server TypeScript: passed;
- production desktop/app/server build: passed;
- strict responsive audit: 104 surfaces, 11 interactions, 3,064 controls,
  zero issues, console errors, page errors, or network failures;
- final user-two product smoke: 20/20 with all protocol desk results completed,
  zero warnings, browser errors, or network failures;
- Bittensor result time improved from 53.5 seconds in the diagnostic run to
  26.3 seconds in the final one-call run.

Canonical launch URLs are now:

- app: `http://127.0.0.1:5190/workspace/ws_18dc91c9102a/session`;
- backend: `http://127.0.0.1:4130`.

The durable final QA report is
`docs/wednesday-launch-final-e2e-qa-2026-07-14.md`. The release decision remains
GO for a controlled local beta and NO-GO for public macOS distribution, live
charging, production image-to-Sui publishing, Matterhorn Cloud, claims of live
Bittensor provider coverage, or claims of real wallet-extension acceptance.

The final beta.2 internal-tester artifact is source-bound to `79da1e4b` in
`/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-79da1e4b`.
The DMG hash is
`f7519835b76c86d5e0279115a12b6bada1a4eab4134f1f196af65098c315a4ed`
and the ZIP hash is
`fd7a6e667be0576ffd5e306bcaaf5c519ffc308b393a4e1b00c122653d8932f4`.
DMG and ZIP integrity passed, desktop doctor is ready with 9 passes and one
expected server-health skip, and the packaged clean-profile smoke passed 11/11.
The artifact remains unsigned, unnotarized, and unpublished.

### July 14 release-automation containment

The pushed beta evidence refs did not satisfy the exact package-version release
contract: the packages are `0.13.13`, while the evidence refs include beta
suffixes. Both queued release runs were cancelled before any job started or any
GitHub release was created. The workflow now infers prerelease status, disables
sidecar/npm/Daytona publishing by default for prereleases, requires a deliberate
dispatch for package, AUR, and public-release publication, keeps tag pushes in
draft, requires explicit publish approval after all requested jobs pass, uses
available GitHub-hosted runners, and has a static safety contract in the full
Matterhorn platform gate. The beta refs remain evidence markers only.
