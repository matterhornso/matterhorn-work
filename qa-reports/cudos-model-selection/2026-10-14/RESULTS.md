# CUDOS model selection and local five-desk chat acceptance

Initial run: 14 October 2026. Follow-up: 15 October 2026 IST (14 October UTC). Local real-provider testing; no merge or deployment. PR publication was subsequently requested.

## Outcome

Fixed the unnecessary privacy-policy assertion on saving a workspace model preference. A preference save does not dispatch a prompt. Catalog/chat compatibility, collaborator authorization, audit and persistence remain enforced. All prompt dispatch privacy checks remain unchanged.

Corrected two restored-UI notices that incorrectly described an unverified provider as a universal sending ban. The authoritative guarded gateway already permits public research while applying request-bound consent, secret blocking and execution authorization. Provider policy metadata remains unverified, `allowed: false`; no no-training or retention assurance was invented.

Branch: `codex/cudos-model-selection-2026-10-14`.
Base: `4085d83cb23e9e2f4f4c639d3a990f9b93196771` (merged PR #1035).
Published as [draft PR #1036](https://github.com/matterhornso/matterhorn-work/pull/1036). Required remaining acceptance is listed below; publication is not merge or deployment approval.

## Local browser acceptance

Preview: `http://cudos-restored.localhost:58334`.
Workspace: `ws_web_3b2e50a56ee080fb`.
Existing disposable verified test account and Terms acceptance were preserved. No auth/verification bypass or production configuration changes. Existing unrelated previews were not restarted. The updated frontend uses its own output directory, not the shared production bundle.

- Chose ASI1, clicked **Use for new chats**, observed **Workspace default saved**.
- Reloaded, reopened model settings and verified **Cudos / ASI1** persisted as the workspace default; normal authenticated API readback agreed.
- Opened each desk through its UI and sent a public synthetic concept prompt. No attachments, memories, private wallet data, live-chain request or transaction was included.
- Every assistant receipt reports provider `cudos`, model `asi1`, `finish: stop`, completion time and the expected desk agent.

| Desk | Agent | Session | Tokens |
| --- | --- | --- | ---: |
| Private AI | `matterhorn` | `ses_ec73683e4ffeu1utAyYqtQ8ZM5` | 6,874 |
| Bittensor | `matterhorn-bittensor` | `ses_ec734348bffeAFJtNcA6ccGB4x` | 3,365 |
| Hyperliquid | `matterhorn-hyperliquid` | `ses_ec7333163ffeKW8D5JMlDCNMQ7` | 3,568 |
| Polymarket | `matterhorn-polymarket` | `ses_ec73236caffe5Kj3g9ePHdhXKy` | 3,849 |
| Sui | `matterhorn-sui` | `ses_ec7316d2bffeRs0tRbFWKcC5ym` | 2,225 |

Initial five-concept checkpoint: **19,881 used/charged tokens, 0 reserved tokens, 0 pending requests**, exactly matching the five receipts. Hard 100,000-token local limits remain enabled. Provider monetary cost is not asserted from the usage store's zero cost field.

The initial Private AI request timed out awaiting manual host approval, showing **Write request denied** and retaining the input. Retrying after granting that specific request's normal host approval succeeded. Each initial concept test received one scoped host approval through the supported operator endpoint. The user subsequently explicitly approved automatic host approval **only for this local preview**. That setting was applied while preserving the account, chats, strict provider checks, guarded gateway and hard limits. A Sui follow-up completed without an approval helper, bringing that checkpoint to 22,106 tokens and zero holds. Production approval settings were not changed.

## Follow-up live read and recovery testing

These requests were sent through the ordinary authenticated browser composer with CUDOS `asi1`, not seeded responses or direct-provider calls. All inputs were public synthetic QA requests; no private files/memories, wallet credentials, transaction preparation, watch creation, signing or submission were requested.

| Desk | Actual tool and result | Request tokens |
| --- | --- | ---: |
| Sui | `matterhorn_sui_get_balance`, public address `0x5`, mainnet, `sui.grpc`, fetched `2026-10-14T20:11:44.690Z`; completed answer with limitations | 5,385 |
| Hyperliquid | `matterhorn_hyperliquid_get_orderbook`, BTC, mainnet, `hyperliquid.info`, fetched `2026-10-14T20:13:23.478Z`; completed answer with bid/ask and source limitation | 8,224 |
| Polymarket | `matterhorn_polymarket_search_markets`, active market `3229167`, public Gamma search, fetched `2026-10-14T20:14:19Z`; completed answer with snapshot limitations | 8,739 |
| Bittensor | Initial model chose `readOperation: subnet` without required `netuid`, received generic tool failure; no data fabricated. Follow-up remediation and retest recorded below | 7,623 initially |

The Bittensor Python SDK service independently returned live **testnet** data at block 8,221,939 with five subnets and no warnings. It runs only on loopback, with Python 3.11.15, `bittensor==10.5.0`, `async-substrate-interface==2.2.1`, `cyscale==0.5.0`, `READ_ONLY=1`, and submission disabled. Connecting it required an idle, graceful restart of this one preview; its persistent account/chats/default model survived. This temporary laptop service is not hosted acceptance or production packaging.

Private AI follow-up completed in 5.4 seconds (7,299 tokens) before the first attempted Stop reached the UI. A second Stop during **Preparing** produced a partial response and eventually `UnknownError: Provider system context is not bound to this active Matterhorn run.` The recorded elapsed time was 947 seconds across a machine clock/suspension gap; it must not be described as successful cancellation. Its usage reservation eventually released, with no provider usage reported. A subsequent short recovery request completed in 4.9 seconds (7,935 tokens). Zero reported usage for the interrupted request is not proof that the provider incurred no cost.

### Bittensor correction and remaining live acceptance

Commit `8b7878d538ff5a584b2ab80a2c16ffa6cee195d7` clarifies the model-facing Bittensor contract: `discovery` lists/searches subnets; `subnet` and `validators` require an exact non-negative integer `netuid`; `wallet` requires a public address. Invalid singular selectors are rejected before a backend call with content-free allowlisted errors. The read-only backend, privacy, capability, network and wallet boundaries remain unchanged. No automatic conversion of an ambiguous operation was introduced.

After restarting the same idle local backend on the fix, the existing conversation still selected `subnet` without an ID. The response now accurately exposed `bittensor_netuid_required` and proposed `discovery` (8,462 tokens). Explicit discovery reached the tool but timed out (8,895 tokens including the final failure explanation). It returned no live payload; **Bittensor app live-read acceptance remains incomplete**. The fixed schema and useful validation error are verified, not a guarantee of perfect model tool selection.

The machine's power log confirms repeated **Dark Wake Thermal Emergency** sleeps of roughly 15–17 minutes during these later requests. The discovery receipt spans 1,102 seconds; the Stop receipt spans 947 seconds. Thermal protections were not changed. These interrupted runs are not valid latency or cancellation acceptance. Do not assume the model's speculative endpoint diagnosis establishes a network/service cause: the independently observed machine suspension is a material confounder. Repeat on an awake, stable machine before release; do not simply increase timeouts.

Independent cancellation review found that the provider-message binding expires after 30 seconds; resume after the long sleep correctly fails closed. Ordinary aborts use `MessageAbortedError` and a cancelled receipt; unknown guard errors must not be relabelled as cancellation. A separate **potential early-Preparing abort/dispatch race** remains by code inspection: an abort arriving before `promptAsync` may precede the actual dispatch. Add a deterministic paused-dispatch regression before deciding a fix. This interrupted live sample neither proves nor clears that race. No speculative relaxation of binding/approval checks was made.

Final normal-account readback at `2026-10-14T21:34:12.162Z`: **15 settled requests; 84,668 reported used/charged tokens; 0 reserved; 0 pending; 15,332 remaining** under the unchanged 100,000-token limits. Sum of reported assistant token totals equals 84,668. This includes the failed Bittensor attempts and recovered Private AI request. Interrupted provider usage may be unreported and requires separate provider billing reconciliation; no zero-cost claim is made.

## Automated checks

- Backend control-plane suite: 41 passed, including strict-mode unverified CUDOS preference persistence, audit and no session dispatch.
- Provider/agent privacy suites: 31 passed.
- Authoritative public-research gateway E2E: 1 passed, preserving raw/private-path restrictions.
- Frontend suite: 1,322 passed across 190 files. First sandbox run had three localhost socket failures; the same full suite passed with required local socket permission.
- App and server TypeScript checks: passed.
- Isolated production-format web build: passed. Existing bundle-size/circular-chunk warnings remain.
- `git diff --check`: passed.
- Independent source review: no actionable findings.

Follow-up validation:

- Desk tools, cancellation/error and pending-task regressions: 323 passed / 0 failed (2,414 assertions).
- Crypto transports, circuit breakers, tenant scoping and guarded authorization: 70 passed / 0 failed (358 assertions).
- Independent model-selection boundary review suites: 65 passed / 0 failed (720 assertions); five focused prompt-boundary checks passed.
- Bittensor contract/managed MCP/read-only route regressions on the follow-up fix: 55 passed / 0 failed (596 assertions). Command: `bun --no-env-file test apps/server/src/managed-opencode-mcp.test.ts apps/server/src/bittensor-chat-routes.e2e.test.ts apps/server/src/crypto-action-registry.test.ts`.
- Cancellation/error focused review: 42 tests passed with one loopback-bind environment failure; the exact cancellation-receipt regression separately passed. Not reported as a fully green combined suite.
- Types package build and server typecheck passed after the follow-up fix. Release secret scan: 1,231 files, zero findings, zero oversized skips.
- Safety-gate contract passed. **Full monolithic safety gate did not pass cleanly.** One run timed out in the memory-inbox test; the exact test passed in isolation. A fresh full run passed stages 1–3, then the aggregate desk runner failed a Polymarket child; a desk rerun failed a different SDK-normalizer child. Both exact children passed alone, and every stage had passed through stage-selective runs. This is not a one-shot green gate; require clean exact-head CI before merge.

Durable local logs: `/private/tmp/matterhorn-full-gate-SpFGYh/{model-selection-review,prompt-boundary-review,platform-safety-full,platform-safety-desk-depth,polymarket-read-preview-isolated,market-sdk-normalize-isolated,memory-inbox-isolated}.log`. The full command was `TMPDIR=<isolated-directory> pnpm test:matterhorn-platform-safety`; stage reruns used `--only desk.depth`, `--only daemon.electron.perimeter,observability.error_boundaries,design.contract,browser.smoke.contracts`, and `--only product.readiness`.

TypeSafe guidance was used to keep tool selectors and permission checks deterministic. The live docs index was reachable; targeted building/function-calling pages were inaccessible. No TypeSafe SDK or Jev runtime integration changed.

### Fresh PR CI follow-up

On head `ee26d8575524a77b0260498e7c5574994cc9d838`, Linux/macOS tests, customer crypto gates, container build, repository security gates, dependency review, i18n and CodeQL passed. Two jobs failed and were not suppressed:

- [Platform safety](https://github.com/matterhornso/matterhorn-work/actions/runs/38643812439/job/116125623450): 1,856 server tests passed, one failed. Bittensor wording expanded the complete managed-tool catalogue to 11,516 characters against the unchanged 11,000 limit. Corrected in `a0de28b9d5dac18193ee782f1be85370f15b4c49` by removing duplication, preserving selector guidance, validation and authority boundaries. Catalogue now 10,972 characters. `agent-token-budget.test.ts` (3) plus managed MCP/registry tests (43): **46 passed, zero failed**.
- [Rust dependency security](https://github.com/matterhornso/matterhorn-work/actions/runs/38643812397/job/116126061309): new RUSTSEC-2026-0346/-0347/-0348/-0349 advisories affect the existing `rustls 0.23.45` lock entry. Patched version is 0.23.46. These are actual findings, not an environmental flake.

Commit `f2e4174ccba4a50a84f15364263a61f8ec139e06` updates that one lockfile package to `rustls 0.23.46`, without transitive churn or new suppressions. Upstream dependency requirements and the Rust 1.71 minimum remain compatible. `node --test scripts/rust-dependency-policy.test.mjs`: **7/7 pass**. `node scripts/rust-dependency-policy.mjs`: passes against the locked all-target graph; only rustls 0.23.46 resolves. Local compilation and a new local cargo audit were not run; CI must perform those checks. Official [release](https://github.com/rustls/rustls/releases/tag/v%2F0.23.46) and advisories [0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html), [0347](https://rustsec.org/advisories/RUSTSEC-2026-0347.html), [0348](https://rustsec.org/advisories/RUSTSEC-2026-0348.html), [0349](https://rustsec.org/advisories/RUSTSEC-2026-0349.html) were checked.

Require fresh final-head checks after corrections. The final browser evidence predates the compact schema wording; no further live-provider pass is claimed.

## Visual verification and skills

Impeccable clarify/polish and Uncodixfy were used for a narrow copy correction, with no layout, token or branding change. Completed chat checked at the actual Codex preview width, 1280×900 desktop and 390×844 mobile. At 390px, document width equals viewport width; no page horizontal overflow. Privacy text wraps and the model/composer controls remain visible. Temporary viewport override was reset.

The one requested detector pass reported only an existing `text-[11px]` type-ramp advisory in the privacy notice. Left unchanged to preserve the restored UI and this task's narrow scope. Existing Impeccable product/surface metadata is stale; documentation migration was not included. Safari, Firefox, light theme and a full accessibility audit were not reverified in this bounded fix.

Local evidence (not committed, contains only disposable synthetic chat content; credential files are separate owner-only files):

- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/local-chat-evidence.json`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/model-saved.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/sui-completed-desktop.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/sui-completed-mobile.jpg`
- `/private/tmp/matterhorn-cudos-restored-4ZgYPr/frontend-tests-unrestricted.log`

Review screenshots committed with this report: [saved workspace model](screenshots/model-saved.jpg), [completed Sui live-read receipt in the restored UI](screenshots/sui-live-completed.png).

## Remaining boundaries

1. CUDOS API-specific training and prompt-retention terms are still unverified. Public research acceptance is not permission to send secrets or arbitrary private context. No verified-policy declaration or opt-in was added.
2. This is **local real-provider conversation acceptance**, not hosted acceptance or all-model certification. ASI1 Mini and other models were not inference-tested in this pass.
3. Bittensor's testnet sidecar is configured and independently live, but the app discovery request timed out across machine suspension. Repeat the app journey on a stable machine. Mainnet, certified-app execution, signing and submission were not accepted. No transactions were performed.
4. Jev and STM remain off. Existing default-off/privacy/approval safeguards were retained.
5. Automatic host approval is user-approved for this isolated preview only. Production requires its own owner/security approval decision. Stop/cancellation needs a clean repeat after the interrupted test; successful recovery and released holds are not cancellation signoff.
6. Publish as a draft PR with the remaining acceptance limits. No merge or deployment. See the [tech-team handoff](../../../docs/handoffs/cudos-model-selection-and-desk-reads-2026-10-15.md).

## Policy sources checked

- [ASI:Cloud overview](https://docs.cudos.org/docs/asi-cloud/introduction/overview) distinguishes infrastructure from inference service operation.
- [ASI:Cloud FAQ](https://docs.cudos.org/docs/asi-cloud/support/faqs) does not supply the missing API training/retention commitment.
- [CUDOS privacy policy](https://www.cudos.org/legal/privacy-policy) is not sufficient evidence for an API no-training/zero-retention claim.

Unknown policy terms are not evidence that CUDOS trains on requests; they are also not evidence that it does not. The UI retains that uncertainty.
