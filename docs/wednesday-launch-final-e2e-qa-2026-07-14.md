# Matterhorn Work Wednesday Launch Final E2E QA

Date: 2026-07-14 (India time)

Target launch window: Wednesday night, 2026-07-15 (India time)

Release branch: `codex/wednesday-beta-rc-2026-07-15`

Release version: `0.13.13`

## Executive Verdict

**GO for a controlled local beta for named testers.**

The verified product includes the local workspace shell, managed OpenCode
engine, bounded Matterhorn desk MCP, project sessions, History, Notes, Memory,
Outputs, Wallet safety surfaces, Settings, local Billing test UI, and local
Generated Media test flow.

**NO-GO for public macOS distribution or claims of production external-service
readiness.** The current desktop artifact is unsigned and unnotarized. Real
MetaMask, Coinbase Wallet, and Phantom extension acceptance has not been
recorded. Live Stripe charging, production image generation, Walrus publishing,
Sui NFT publishing, Matterhorn Cloud, and a live Bittensor provider remain
operator-owned release gates.

## Canonical Launch Stack

- app: `http://127.0.0.1:5190/workspace/ws_18dc91c9102a/session`;
- backend: `http://127.0.0.1:4130`;
- durable workspace config:
  `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-wednesday-launch-workspaces/server.json`;
- launch workspace one:
  `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-wednesday-launch-workspaces/user-one`;
- launch workspace two:
  `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-wednesday-launch-workspaces/user-two`;
- managed OpenCode version: `1.14.38`.

The local bearer and host tokens are launch secrets. They are intentionally not
included in this document or committed QA evidence.

## Beta.2 Desktop Artifact

The final controlled-tester artifact was built from source commit `79da1e4b`.

- artifact directory:
  `/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-79da1e4b`;
- DMG: `Matterhorn-Work-79da1e4b-arm64-unsigned.dmg`;
- DMG SHA-256:
  `f7519835b76c86d5e0279115a12b6bada1a4eab4134f1f196af65098c315a4ed`;
- ZIP: `Matterhorn-Work-79da1e4b-arm64-unsigned.zip`;
- ZIP SHA-256:
  `fd7a6e667be0576ffd5e306bcaaf5c519ffc308b393a4e1b00c122653d8932f4`;
- `hdiutil verify`: valid;
- `unzip -t`: no errors;
- desktop beta doctor: ready, 9 pass, 0 warning, 1 expected server-health
  skip, 0 fail;
- packaged clean-profile smoke: ready, 11 pass, 0 fail;
- clean-profile test data removed: yes;
- code signed with Developer ID: no;
- notarized: no;
- publishing enabled: no.

This artifact may be shared only with named internal testers who receive the
unsigned-build warning. It is not the public macOS release.

## Exact-Source Verification

| Gate | Result |
| --- | --- |
| App TypeScript | PASS |
| Server TypeScript | PASS |
| Production desktop/app/server build | PASS |
| Complete app tests | 540 passed, 0 failed, 3,620 assertions, 70 files |
| Complete server tests | 700 passed, 0 failed, 4,965 assertions, 55 files |
| Platform safety gate | All 10 stages passed |
| Focused managed MCP/workspace tests | 13 passed, 0 failed |
| Desk-agent contract | PASS |
| `git diff --check` before documentation | PASS |

## Release Automation Safety

The evidence tags `v0.13.13-beta.1` and `v0.13.13-beta.2` are not valid public
release tags because the package version is `0.13.13`. Their queued release
workflows were cancelled before any job started or release was created.

The release workflow now:

- infers prerelease status from a suffixed tag;
- keeps npm, sidecar, Daytona, AUR, and public-release publication behind a
  deliberate manual dispatch;
- keeps npm, sidecar, and Daytona publishing off by default for prereleases;
- creates every GitHub release as a draft and requires an explicit `publish`
  dispatch after all requested release jobs succeed;
- uses GitHub-hosted Linux runners instead of the unavailable custom runner;
- uses Matterhorn Work branding in release titles and notes; and
- is covered by `scripts/release-workflow-safety.test.mjs` inside the platform
  safety gate.

Do not use either beta evidence tag as a public release. A public build requires
an exact package-version tag, configured signing and notarization, successful
clean-machine acceptance, and an explicit release dispatch.

The production build reports large JavaScript chunks. This is a performance
debt item, not a functional or security failure. The main app, session,
settings, and syntax-highlighting chunks should be split after launch without
changing the Wednesday release scope.

## Multi-User Product Acceptance

Two separate durable workspaces passed the result-required product smoke. Each
run covered Project Home, wallet readiness, all four protocol desks, Longevity,
direct session reload in a fresh browser context, Project History, Notes,
Memory, Wallet, Settings overview, AI models, MCP connections, Billing, and
Generated Media.

Latest second-user exact-source result:

- 20 of 20 stages passed;
- warnings: 0;
- browser/page errors: 0;
- network failures: 0;
- Bittensor completed in 26.3 seconds;
- Hyperliquid completed in 22.1 seconds;
- Polymarket completed in 22.6 seconds;
- Sui completed in 5.6 seconds;
- connected MCP shown to the user: `Matterhorn Work MCP`.

Evidence:

- `qa-reports/wednesday-launch-final-e2e-qa-2026-07-14/user-one-product-smoke-final/summary.json`;
- `qa-reports/wednesday-launch-final-e2e-qa-2026-07-14/user-two-product-smoke-final-v4/summary.json`.

## Managed Desk MCP Security

Managed OpenCode receives an authenticated in-memory MCP configuration for the
local Matterhorn backend. The credential is not written to the workspace or
user-visible MCP configuration.

The managed MCP exposes only these bounded launch tools:

- `matterhorn_status`;
- `matterhorn_bittensor_chat`;
- `matterhorn_hyperliquid_list_markets`;
- `matterhorn_hyperliquid_get_orderbook`;
- `matterhorn_hyperliquid_get_funding`;
- `matterhorn_polymarket_search_markets`;
- `matterhorn_polymarket_check_compliance`;
- `matterhorn_sui_get_balance`;
- `matterhorn_sui_preview_transfer`.

Each protocol agent uses a deny-by-default runtime tool map. Task delegation,
generic web search, web fetch, repository reads, and shell tools are not
available to these managed desk agents. The final Bittensor canary trace
contains exactly one completed
`matterhorn-work_matterhorn_bittensor_chat` part and no shell, file, or generic
web tool part.

An earlier canary is retained as diagnostic evidence: before the deny-by-default
runtime map, the model attempted to fall back to Bash after bounded evidence.
The runtime rejected that attempt, and the final configuration removes the tool
from the agent entirely. The final canary proves the corrected one-call path.

## Chat Execution Mode Safety

The release candidate adds per-session **Discuss**, **Plan**, and **Work**
capability modes. The mode control is compact and remains distinct from Agent,
Perspective, and Model. Plan can hand off to Work in the same session so the
approved plan remains in context.

Enforcement is defense in depth:

- the app persists the mode per workspace session and adds it to OpenCode
  requests;
- the composer hides slash commands in Discuss and Plan and disables mode
  changes while a response is active;
- the proxy treats the backend mode header as authoritative, overwrites
  client-supplied tools in Discuss and Plan, and denies unknown agents by
  default;
- the proxy blocks command, shell, history, sharing, summarization, rename, and
  delete mutations outside Work;
- the stable backend prompt route applies the same restrictions; and
- mode changes and accepted prompts produce redacted audit entries.

Focused evidence:

- 9 app execution-mode and perspective contract tests pass;
- 24 session-route server tests pass, including malicious tool broadening,
  mode mismatch, stable-route enforcement, blocked mutations, and audit
  evidence;
- app, server, and shared-types TypeScript pass.

The feature defaults on for the Wednesday candidate. Set
`VITE_MATTERHORN_EXECUTION_MODES=0` and rebuild to remove the control and force
Work mode without changing any underlying safety boundary.

## Responsive UI And UX Audit

The strict full-platform browser audit exercised desktop, compact-laptop,
tablet, and mobile viewports.

- surfaces: 104;
- interaction journeys: 11;
- controls inventoried: 3,064;
- issue count: 0;
- horizontal overflow: 0;
- console errors: 0;
- page errors: 0;
- network failures: 0.

Control inventory:

- safe controls: 2,590;
- stateful controls: 149;
- external/download controls: 193;
- financial/external controls: 86;
- destructive controls: 34;
- intentionally unavailable controls: 12.

The audit covers the user-reported problem areas: right-side panels, Profile,
Wallet, Outputs, Notes and Quick Jot, MCPs and Tools, Settings navigation,
Billing, Generated Media, desk launchers, response perspective, action contrast,
responsive containment, and progressive disclosure.

Evidence:

- `qa-reports/wednesday-launch-final-e2e-qa-2026-07-14/full-platform-final/summary.json`.

## Backend And Data Safety Coverage

The server suite and platform gate cover:

- token scopes and viewer/collaborator write boundaries;
- separate client and host credentials;
- loopback-only default CORS;
- bounded local API rate limits;
- oversized JSON and raw webhook rejection;
- Stripe webhook signature, freshness, and idempotency checks;
- Notes concurrency and read-only write denial;
- Memory capture, review, export, forget, namespace, and secret rejection;
- workspace import preview fingerprints and stale-review rejection;
- redacted audit, evidence, support-report, and data-ledger exports;
- wallet policy, chain mismatch, spend limits, simulation sanitization, rejects,
  and receipt matching;
- generated-media prompt, NFT draft, receipt, URL, package, and checksum safety;
- public-only Sui and Bittensor inputs;
- Polymarket compliance fail-closed behavior;
- non-custodial and non-submittable protocol previews;
- managed OpenCode restart and bounded health recovery.

No test or browser evidence contains committed bearer tokens, host tokens,
wallet secrets, provider keys, seed phrases, raw signatures, or signed payloads.

## Performance Evidence

Observed local browser timings were healthy during the acceptance run:

- First Contentful Paint: about 474 ms;
- Largest Contentful Paint: about 539 ms;
- Speed Index: about 555 ms;
- Total Blocking Time: about 43 ms;
- Cumulative Layout Shift: about 0.019.

A simulated Lighthouse score of 0.55 did not meet the aspirational 0.75 gate,
primarily because of large production chunks. The observed local launch path is
responsive, but bundle splitting remains post-launch priority debt. This release
must not claim a passed Lighthouse performance budget.

## Truthful Product Boundaries

| Surface | Wednesday state |
| --- | --- |
| Local workspaces and managed engine | Ready |
| Notes, Memory, Outputs, History | Ready |
| Desk chat and bounded MCP tools | Ready |
| Bittensor | Ready for fallback-backed research and unsigned handoff; live provider not verified |
| Hyperliquid | Ready for read-only research and external handoff; no submission |
| Polymarket | Ready for read-only research and compliance-gated handoff; no submission |
| Sui | Ready for public reads and unsigned preview; real wallet signing not device-verified |
| Wallet safety | Automated contracts ready; real extension acceptance pending |
| Billing | Local/test-mode UI and backend contracts ready; live charging off |
| Generated Media | Local mock flow ready; production provider/Walrus/Sui publishing not configured |
| Matterhorn Cloud | Not included in this build |
| Public macOS installer | Not ready; unsigned and unnotarized |

`Needs setup` must name the owner in user-facing copy:

- **Platform setup:** service keys, provider URLs, package identifiers, prices,
  webhooks, notarization, and production infrastructure are Matterhorn operator
  work.
- **Connect your account/wallet:** a user action is shown only when the platform
  capability exists and the user can complete it safely.
- **Not included/Coming soon:** unavailable features are muted and are not
  presented as working controls.

## Wednesday Launch Sequence

1. Freeze the release branch. Do not merge unrelated UI or backend work.
2. Confirm the release tag exactly matches all package versions and the
   artifact source commit. Evidence-only beta tags are not release tags.
3. Start the canonical durable stack on `4130/5190`.
4. Confirm exactly one listener owns each canonical port.
5. Check `/health` for backend version `0.13.13` and OpenCode `1.14.38`.
6. Open the canonical app and verify Project Home, one persisted session, Notes,
   Wallet, MCP Settings, Billing, and Generated Media.
7. Run the strict result-required product smoke against user one.
8. Run a fresh-workspace or user-two smoke if any launch configuration changed.
9. Verify the artifact hashes, DMG structure, ZIP integrity, desktop doctor, and
   packaged clean-profile smoke.
10. Distribute only to named internal testers with the unsigned-build warning.
11. Keep the previous verified artifact and source ref available for rollback.
12. Record incidents in the project ledger without copying secrets or raw
    wallet/provider payloads.

## Stop-Ship Conditions

Stop the Wednesday beta if any of these occurs:

- canonical backend or app health fails;
- session creation, prompt completion, direct reload, or workspace activation
  fails;
- a protocol agent can access shell, generic web, or unbounded tools;
- Discuss or Plan can mutate the workspace/session or broaden agent tools;
- any secret appears in UI, logs, support reports, evidence, or exports;
- a wallet flow can sign or submit without explicit external-wallet review;
- Billing implies live charging while the provider is not configured;
- Generated Media implies production publishing while provider inputs are
  absent;
- responsive UI has blocking overflow, hidden actions, or unreadable controls;
- the final artifact is not hash-bound to the verified source commit;
- the release is represented as a public signed macOS build.

## Remaining Owners

1. Wallet QA: real MetaMask, Coinbase Wallet, and Phantom connect, reject,
   approve, mismatch, reload, and disconnect acceptance.
2. macOS release: Developer ID signing, notarization, Gatekeeper on a clean Mac,
   signed updater metadata, and rollback validation.
3. Billing: Stripe test keys, prices, returns, portal, signed webhooks, and
   entitlement reconciliation before a paid beta.
4. Media: production image provider, Walrus publisher/relay, Sui NFT package,
   Kiosk package, TransferPolicy, and real publish acceptance.
5. Bittensor: accepted live public provider and fresh validator/subnet evidence
   before any live-network coverage claim.
6. Performance: split the main, session, settings, and Shiki chunks and rerun the
   Lighthouse budget without changing Wednesday launch behavior.
