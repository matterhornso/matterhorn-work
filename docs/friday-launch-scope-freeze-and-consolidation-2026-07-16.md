# Friday Launch Scope Freeze And Dirty-Tree Consolidation - 2026-07-16

This document freezes the public Matterhorn Work scope for the Friday,
July 17, 2026 production candidate and defines how the intentionally dirty
release tree is consolidated. It supplements the readiness and execution
ledgers; it does not replace their stop-ship gates.

## Candidate Snapshot

- Integration branch: `codex/wednesday-beta-rc-2026-07-15`
- Friday candidate branch: `codex/friday-beta-rc1-2026-07-17`
- Starting commit: `8a6272dbd3f0`
- Final pre-stage inventory: 114 modified tracked files and 59 untracked
  status entries. The untracked entries include 12 release source/test/gate
  files, 4 release documents, selected Friday evidence, and preserve-only
  historical QA or duplicate package output.
- Local app: `http://127.0.0.1:5190`
- Fresh post-build UI acceptance: `http://127.0.0.1:5191`
- Fresh testing-team hardening acceptance: `http://127.0.0.1:5192`
- Local backend: `http://127.0.0.1:4130`
- Fresh testing-team hardening backend: `http://127.0.0.1:4131`
- Index state at inventory: no consolidation files staged

Historical QA output and duplicate desktop build directories are evidence or
scratch data. They must not be deleted, rewritten, or staged as product source.

## Friday Beta Distribution Decision

Friday uses a private desktop tester artifact distributed only to the named
cohort. The loopback web URL remains local QA and is not a tester distribution
URL. The private artifact may be unsigned only when testers receive the explicit
Gatekeeper and uninstall instructions in `docs/desktop-beta-first-run.md`; it
must not be published as the Product Hunt or public macOS asset.

Public HTTPS deployment and signed, notarized, stapled desktop distribution
remain mandatory Product Hunt gates.

## Exact Candidate Closure

The consolidation is complete on
`codex/friday-beta-rc1-2026-07-17`. The release source was checked out detached
in a clean worktree and rerun through the app suite, complete platform-safety
gate, typecheck, dependency audit, Electron package build, artifact integrity,
release doctor, packaged-app smoke, and responsive browser acceptance.

The final artifact manifest, rather than an older local URL or dirty-tree HEAD,
is the distribution source of truth. It binds the private DMG and ZIP to the
final candidate SHA and includes SHA-256 checksums. The private package remains
unsigned and unnotarized; named Beta testers must receive
`docs/desktop-beta-first-run.md`, and the package must not be posted publicly.

The active local acceptance surface is
`http://127.0.0.1:5193/workspace/ws_18dc91c9102a/session` with backend
`http://127.0.0.1:4132`. These loopback URLs are same-Mac QA surfaces, not
remote distribution or Product Hunt evidence.

## Frozen Public Scope

The stable release includes:

- local projects, chat, Notes, Memory, Outputs, History, Profile, and Settings;
- Bittensor public reads, research, watches, receipts, and unsigned handoffs;
- Hyperliquid research, previews, watches, and manual connected-wallet orders
  protected by an expiring one-time intent and deployment kill switch;
- Polymarket research, watches, previews, receipts, and external handoffs only;
- Sui public reads, wallet connection, and external-wallet handoffs;
- the Longevity workflow and local AI-provider/model selection;
- MCP configuration for the production-approved Matterhorn tools.

The stable release excludes these optional services unless their explicit
build flags are enabled and their separate acceptance evidence is attached:

| Service | Stable default | Enablement flag |
|---|---|---|
| Billing | Hidden and direct routes blocked | `VITE_MATTERHORN_BILLING_ENABLED=1` |
| Generated media and Sui NFT publishing | Hidden, composer action removed, image extension hidden, and direct routes blocked | `VITE_MATTERHORN_GENERATED_MEDIA_ENABLED=1` |
| Matterhorn Cloud | Sign-in and Cloud navigation hidden; direct routes blocked | `VITE_MATTERHORN_CLOUD_ENABLED=1` |

The embedded local Profile panel may reuse the local account component without
enabling the public Cloud account route. Historical generated-image outputs
remain readable through Outputs even when creation and publishing are disabled.
The disabled Cloud policy also removes the Matterhorn Cloud MCP connector.

## Dirty-Tree Buckets

### 1. Stable Feature Policy And Truthful UI

Ship together:

- `.env.example`;
- `PRODUCT.md` and `DESIGN.md`;
- `apps/app/src/app/lib/launch-features.ts`;
- `apps/app/src/react-app/shell/settings-route.tsx`;
- `apps/app/src/react-app/shell/shell-config.tsx`;
- Settings shell/page, overview, account, wallet, capability, Memory, Profile,
  chat, composer, protocol desk, workflow, and Outputs changes under
  `apps/app/src/react-app/`;
- related app contract tests under `apps/app/tests/`.

Freeze rules:

- disabled services must not appear as customer setup chores;
- stale direct settings URLs must redirect to the stable Settings overview;
- the local Profile panel must remain usable with Cloud disabled;
- no customer path may request a secret, raw signature, signed payload, private
  key, seed phrase, mnemonic, or wallet export.

### 2. Hyperliquid Execution And Wallet Safety

Ship together:

- `.opencode/agents/matterhorn-hyperliquid.md`;
- `apps/server/src/tools/hyperliquid-live-execution.ts` and its test;
- `apps/server/src/tools/hyperliquid-execution.ts`;
- `apps/server/src/tools/market-execution-readiness.ts`;
- the corresponding `apps/server/src/server.ts` routes;
- market and wallet types under `packages/types/src/`;
- removal of the unrestricted MCP submission path from
  `packages/matterhorn-work-crypto-mcp/index.mjs`;
- market, wallet, receipt, chain, and readiness gate scripts.

Freeze rules:

- execution is fail-closed unless
  `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=true`;
- every order needs a fresh matching connected-wallet signature;
- intents expire, cannot be replayed, and obey the configured USDC cap;
- mainnet additionally requires the exact `SUBMIT LIVE ORDER` confirmation;
- chat, MCP, CLI, and watches never submit an order directly;
- signatures are relayed for the approved intent and are not stored.

### 3. Product Contracts And Safety Gates

Ship together:

- app UI and security contract tests;
- server execution tests;
- `scripts/product-readiness-smoke.mjs` and its test;
- market execution, receipt, watch, SDK-validation, artifact, onboarding,
  workflow, protocol desk, and crypto-readiness scripts;
- `scripts/dependency-bulk-audit.mjs` and its test;
- root package scripts that expose these gates.

The stable-scope production probe must report disabled Billing and
generated-media stages as explicit skips, never false successes.

### 4. Dependency And Distribution Hardening

Review and ship as one mechanical dependency group after lockfile validation:

- root and workspace `package.json` files;
- `pnpm-lock.yaml`;
- Electron, electron-builder, updater, Vite, Turbo, React Email, Sentry,
  Rollup, temporary-file, and transitive security overrides;
- deterministic dependency audit and desktop release evidence.

The lockfile has substantial mechanical churn and must not be hand-edited.
Require install consistency, dependency audit, full builds, desktop packaging,
and release review before this group is accepted.

### 5. Release Documentation

Ship the Friday readiness/execution ledgers, protocol and wallet safety docs,
market QA runbooks, customer demo/use-case docs, agent control matrix, and UI
design contracts together. Historical Wednesday reports retain their original
names and claims.

### 6. QA Evidence To Preserve

Preserve all files under `qa-reports/`. The current untracked evidence includes
Friday production reports plus Wednesday browser, Bittensor, live-public,
Lighthouse, two-user, and failure-diagnostic runs. Failed runs are useful
diagnostic history and must not be relabeled as passing evidence.

Only the final Friday summary, machine-readable gate outputs, and deliberately
selected acceptance screenshots are candidates for a release evidence commit.
All other reports remain local unless the release owner explicitly includes
them.

### 7. Preserve-Only And Never Stage

Do not stage, delete, or rewrite:

- `apps/desktop/dist-electron 2/`;
- `apps/desktop/server 2/`;
- `apps/desktop/server 3/`;
- unrelated untracked scratch or historical failure directories;
- local runtime data, `.matterhorn-work/`, credentials, tokens, logs containing
  sensitive context, or generated package output.

### 8. Selected Friday Evidence

The release commit may include only these compact current-candidate summaries:

- `qa-reports/friday-production-go-live-2026-07-17/current-candidate/README.md`;
- `launch-channel-evidence.json`;
- `beta-readiness.json` and `beta-readiness.md`;
- `product-hunt-readiness.json` and `product-hunt-readiness.md`;
- `browser-desktop-routes.json` and `browser-mobile-routes.json`;
- `dependency-audit.json`;
- `desktop-clean-profile-smoke-final.json`;
- `product-readiness-live.json`;
- `release-review.json`.

Verbose logs, historical reports, screenshots, failed diagnostics, and package
outputs stay local and untracked.

## Consolidation Order

1. Freeze and test optional-service visibility, direct-route blocking, and the
   embedded local Profile exception.
2. Run focused UI, wallet, Hyperliquid, readiness, and dependency tests.
3. Validate dependency install/lockfile consistency and run the dependency
   audit.
4. Run complete app/server suites, typechecks, builds, platform safety, and
   stable-scope production readiness.
5. Run responsive browser acceptance against the live candidate and verify
   disabled direct routes, Profile, Wallet, Outputs, Memory, Notes, all desks,
   and the Hyperliquid trade ticket.
6. Re-inventory the tree. Stage only the reviewed source, tests, release docs,
   and selected Friday evidence by bucket; keep preserve-only paths untracked.
7. Commit coherent groups or one reviewed release-candidate commit only after
   the complete gate is green.

## Freeze Verification Completed

Completed on July 16 against the live local candidate:

- 173 focused app launch/UI/security contracts passed;
- 6 Hyperliquid live-execution intent and submission tests passed;
- the final complete app suite passed: 556 tests, 0 failures, 3,727 assertions across
  74 files;
- the final complete server suite passed: 711 tests, 0 failures, 5,007 assertions
  across 57 files;
- dependency-audit and stable-scope readiness tool contracts passed;
- app and server TypeScript checks passed;
- `pnpm install --frozen-lockfile --ignore-scripts` confirmed the lockfile is
  consistent;
- the complete installed release graph audit checked 1,199 packages and 1,341
  versions with zero advisories at low severity or higher;
- the complete 10-stage `test:matterhorn-platform-safety` gate passed;
- the root production build passed for the server, web app, desktop automation
  helper, and 50-method Electron bridge;
- the live stable-scope production probe reported `ready: true`, 11 required
  stages passed, 0 failed, and 4 deliberate Billing/generated-media skips;
- `git diff --check` passed;
- direct Billing, Generated media, and Cloud account settings URLs redirected
  to Settings overview;
- the embedded local Profile panel remained available;
- the Profile panel now queries backend capability state with the runtime
  workspace identifier rather than the frontend route identifier, removing a
  false `Profile status unavailable` state;
- OpenAI Image Gen and Matterhorn Cloud Control were absent from the stable MCP
  catalog while Matterhorn Work UI Control remained visible;
- desktop and 390x844 acceptance passed for Project home, Outputs, Memory,
  Wallet, MCPs & Tools, and Profile without horizontal overflow; historical
  mock-image outputs render a truthful placeholder instead of a broken image;
- the Wallet and Overview explanations now distinguish Hyperliquid's separate
  exact-order, connected-wallet execution flow from agent/watch automation;
  Polymarket remains prepare-only;
- no live-browser error boundary or new console error appeared after the local
  stack restart.
- the exact-source Electron directory package rebuilt successfully and its
  isolated clean-profile smoke passed 16 of 16 checks; the package remains
  unsigned and unnotarized and therefore is not a public distribution asset.
- Bittensor fallback responses now treat returned tool evidence as the sole
  source for subnet IDs, names, and capabilities, and explicitly decline to
  recommend subnets when matching live evidence is unavailable.

The third-party Notion, Linear, Sentry, and Stripe entries point at real remote
MCP endpoints and use the implemented OAuth flow. They still require one
real-account acceptance pass each. Any connector that cannot pass must be
disabled and labeled `Coming soon` before the release is tagged.

## External Stop-Ship Gates

Dirty-tree consolidation cannot close these operator-owned gates:

- signed and notarized macOS release artifacts plus clean-Mac install proof;
- MetaMask, Coinbase Wallet, and Phantom/Sui real-device acceptance;
- Hyperliquid minimal testnet reject/approve/receipt acceptance;
- exact-commit deployment behind the production HTTPS host;
- deployed multi-viewport and two-user acceptance;
- real-account acceptance for every visible third-party MCP/OAuth connector,
  or a truthful disabled `Coming soon` state;
- production monitoring, backup, export/delete, support, and rollback proof.

The release remains NO-GO until every row in
`friday-production-go-live-readiness-2026-07-17.md` is green for the exact final
commit and stable tag.

## Testing-Team Review Delta

The July 16 full-codebase review is dispositioned claim by claim in
`docs/testing-team-full-codebase-review-triage-2026-07-16.md`. Confirmed release
issues were fixed without broadening the frozen scope:

- Tailwind's standard numeric color palette is merged with the existing Radix
  and `dls` palettes so safety, direction, and status utilities compile again;
- the settings callback is no longer conditional and each settings tab has an
  isolated error boundary;
- stable builds are English-only unless the experimental-locale flag is
  explicitly enabled;
- configured host/client tokens use constant-time comparison, local rate
  limiting uses the trusted socket peer, child paths reject symlink escapes,
  SSE heartbeats tolerate disconnects, and billing events default closed;
- the required CI safety job now includes complete app/server suites and both
  typechecks.

The review's markdown-XSS claim is not reproducible in this candidate. Raw HTML
is dropped by the renderer, unsafe links are rejected, and the cited payload is
covered by `apps/app/tests/markdown-security-contract.test.tsx`. The
`dangerouslySetInnerHTML` sink is therefore fed only generated, escaped markup;
this conclusion must remain protected by that behavioral test.

Billing entitlement/usage authority, broader swap and batch guards, Electron
second-order hardening, large-module decomposition, locale translation, and a
semantic-token codemod remain contained or post-launch work. Billing,
generated-media creation, and Cloud stay hidden; Hyperliquid submission stays
kill-switched until its real-wallet gate passes.

The post-triage closure rerun also confirmed:

- all focused frontend stability/security contracts passed: 7 tests and 28
  assertions;
- all focused backend security contracts passed: 67 tests and 190 assertions;
- billing security and route coverage passed: 38 tests and 263 assertions;
- app/server typechecks, the app production bundle, the root build, and the
  complete 10-stage platform-safety gate passed;
- the production CSS contains representative restored numeric status classes,
  including `bg-red-500`, `bg-sky-500`, `text-amber-300`, and
  `text-emerald-300`;
- 14 stable desktop routes at 1440x900 and 8 critical mobile routes at 390x844
  rendered expected content with no horizontal overflow, crash signature, or
  browser console error.

## Post-Triage Dirty-Tree Reinventory

The July 16 post-triage inventory remains intentionally unstaged:

- 109 tracked status entries are modified;
- 55 untracked status entries expand to 156 individual paths with `-uall`;
- 140 of those individual untracked paths are preserved QA reports;
- the remaining expanded untracked paths are 12 app/server paths, 2 release
  documents, and 2 dependency-audit scripts;
- the Git index is empty.

At the top level, tracked changes remain grouped as 60 under `apps/`, 22 under
`scripts/`, 14 under `docs/`, 6 under `packages/`, and the reviewed root,
workflow, agent, environment, product/design, package, and lockfile changes.
No preserve-only QA report, duplicate desktop build directory, runtime data,
or scratch path was deleted, rewritten, or staged during this triage.
