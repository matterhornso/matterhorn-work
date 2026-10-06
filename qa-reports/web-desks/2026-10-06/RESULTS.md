# Web desk functionality acceptance — 6 October 2026

## Decision

All five desks completed the tested core read-only conversation flow locally with real ASI1 inference. Four crypto desks returned actual public tool evidence. Reproduced execution/tool-contract failures were corrected and regression-tested. This is **not exhaustive functionality certification or production launch approval**: hosted authenticated acceptance, signing, configured integrations, additional models and the operational gates below remain open. Model-generated interpretation also needs scrutiny; specific caveats are recorded below.

Implementation: `codex/model-workspace-usability-2026-10-06`, based on `a5dba9649975f33e6eda614cdf88a81767e20a66`. At this initial report's source stage the changes were local and uncommitted. The later authorized publication closeout is recorded in [ONE-HOUR-RESULTS.md](ONE-HOUR-RESULTS.md) and PR #1032's closeout comment; no merge or deployment was performed. Original user previews and data were not restarted or overwritten. Testing used separate `desks-qa.localhost` origins and disposable accounts. Source-linked QA previews may receive hot-module updates.

## What was fixed

1. **Model selection:** saving a connected chat model is no longer incorrectly treated as prompt submission. Selection persists, failures remain visible, unavailable catalogs do not erase the existing default, and sending still performs independent privacy/permission checks.
2. **Workspace navigation:** restored native local-workspace open/create paths and explained the browser/Desktop boundary. Opening an existing native folder preserves its configuration. A hosted web page cannot silently open arbitrary folders on the user's computer.
3. **Guarded chat execution:** canonicalized workspace paths consistently across `/var` and `/private/var` aliases. Exact workspace/session/secret boundaries remain enforced; the actual normal-account reproduction now executes.
4. **Polymarket:** bounded model-facing discovery results retain usable market IDs, questions, odds and evidence metadata instead of exceeding the unchanged 2,000-character tool limit and discarding every record.
5. **Bittensor:** subnet listing no longer requires the ID of a single subnet. Omitted ID means bounded listing; malformed supplied IDs still fail and validator lookup still requires a valid ID.
6. **Sui:** implemented the public object reader advertised by the desk, with fixed mainnet/testnet endpoints, strict IDs, metadata-only output and an eight-second transport timeout. Its model-facing projection uses losslessly shortened public IDs and separates read-tool permissions from object facts; exact backend records are unchanged. Raw secret checks run before projection. No signing, submission or arbitrary endpoint access was added.
7. **Recovery and privacy copy:** distinguish cancellation, missing approval, usage limits and provider uncertainty. Public-only account research remains subject to authoritative checks; private context is not silently sent. Consent text no longer asserts that every conservatively classified message actually contains a wallet action.

## Desk matrix

| Desk | Real local browser evidence | Remaining limit |
| --- | --- | --- |
| Private AI | Normal-account ASI1 explanation completed; 6,852 tokens; no hold | Other models and hosted inference not established |
| Hyperliquid | Actual orderbook + funding tools, live exchange source and timestamps; 8,388 tokens | No wallet signatures, orders or position changes |
| Polymarket | Repaired discovery returned three active Bitcoin markets, exact IDs/odds/source/time; 8,572 tokens | Compliance reports jurisdiction blocked for execution; no bypass or orders |
| Bittensor | Fixed browser request returned subnets 0/1/2, live Finney SDK source, block 9,220,062 and timestamp; 6,792 tokens | Not a stake/transfer/signing acceptance result; emission interpretation caveat below |
| Sui | Testnet balance read passed. The exact object-0x2 request completed after the model projection fix, with owner/type/version/digest/source/time; 4,858 tokens | No transfers/signatures; mainnet browser object flow not tested |

Every model request was public-only, sent through the normal account chat UI and existing manual approval boundary. CUDOS ASI1 answered; no mocked inference was substituted for these entries. Jev and STM remained off. Provider-policy verification is still unverified in the test configuration; an owner-declared training opt-out is not independent verification of provider terms.

## Shared functionality and failure paths

- Model selection persisted and led to all five desks; each desk opened its composer in one action. Starter clicks filled editable drafts rather than sending automatically.
- Notes: created and edited a synthetic note, then verified persistence after navigation/reload.
- Memory: explicitly confirmed a synthetic memory, found it through search, and observed conservative private/export restrictions. This does not prove encryption or backup recovery.
- Account isolation: **19 local observations passed**, including **10 cross-account 404 denials** for workspace data, exact notes/sessions, memory, files, integrations and usage. First-account data remained unchanged.
- Stop before approval: draft retained; idle session, no runtime messages/tools/receipts, no extra tokens and no reservation left behind.
- Logout: returned to sign-in; browser Back did not expose the authenticated view.
- Initial completed-test runtime charged exactly **36,376 tokens**, including honest unsuccessful research responses. Pending requests and reserved tokens were zero. Failed research still costs model tokens and is not a successful desk result.
- Final Bittensor/Sui candidate charged exactly **11,650 tokens** (6,792 + 4,858), with both success receipts, zero pending requests and zero daily/monthly holds. No browser error logs were captured in the final QA tab.
- Additional integrations accurately showed operator setup/unavailable states. No external OAuth or third-party account connection was granted.
- Fixture coverage includes Notes races/CRUD, reviewed Memory lifecycle, file encryption/path boundaries, account isolation, wallet consent/recovery, disabled/unconfigured Jev zero-egress, cancellation, modes and accounting. These fixtures are not real wallet/connector acceptance.

## Automated verification

- Independent final-source frontend/MCP/Bittensor regression run: **1,623 passed**, 205 files, 9,566 assertions, before the final Sui presentation adjustment. App/server typechecks and isolated production web build passed; seven public guides were generated with noindex in the test build.
- Full platform safety attempt passed stages 1–10, then exposed exact Sui permission-inventory and schema-budget assertions. Corrected inventories retained deny-by-default and transfer denial; descriptions were shortened instead of raising the 11,000-character schema limit. Independent full `desk.depth,product.readiness` rerun passed. Initial failure logs are retained rather than overwritten.
- Bittensor contract regression: **64 passed**, with malformed IDs rejected and validators still requiring an ID. Offline Bittensor safety gate: **16 passed**.
- Bounded Sui object fixtures: **119 passed**, plus four route/permission cases. Normal unauthenticated access remained 401; invalid ID/network 400 and missing object 404.
- After the last Sui presentation change, an independent affected-suite pass completed **176 tests / 1,106 assertions** across MCP, Sui, capability, schema-budget and guarded-runtime tests. Server typecheck and diff check passed again. Review found no authorization/data-flow regression. See `final-verification-sui-projection-result.json`.
- Final QA-harness safety pass: **26/26 passed**, covering explicit provider-file loading, loopback-only service wiring, manual approval binding, read-only probes and sanitized evidence. Final whitespace validation passed.
- Counts overlap. Do not sum them as unique test coverage. Exact commands and logs are in `shared-regression-results.md`, `final-verification-result.json`, and the `platform-safety-*` evidence files.
- Existing large-chunk build advisory remains. Mobile, tablet, 200% zoom, Safari, Firefox and full accessibility acceptance were not completed in this run.

## Model-answer quality limits

Tool execution and a completed answer are necessary, but do not make every sentence authoritative. In the Bittensor response, the model speculated that zero emission values were a snapshot artifact. An independent SDK read at block 9,220,069 verified actual `DynamicInfo.emission = 0` for the three subnets; distinct `alpha_out_emission` and `tao_in_emission` fields were nonzero for subnets 1 and 2. No missing-field fallback caused the zeros. The model's artifact explanation is unsupported and must not be used as a financial conclusion.

Sui's source reports owner kind `immutable`; the model added the phrase “shared system object,” which must not be confused with Sui's distinct `shared` ownership type. The source metadata, not that extra phrasing, is authoritative. These semantic-quality observations remain limitations, not silently counted as perfect answer accuracy.

The earlier Sui padded-ID answers stopped with upstream-normalized `length` after only 75 and 48 output tokens. No local low-output cap was demonstrated. A short-ID control completed, and the final lossless projection then completed the same original request without a special follow-up. This verifies the practical correction for that reproduction; it does not prove the provider's internal truncation mechanism or guarantee every future output will complete.

## Local test app and operator handoff

The final logged-in QA browser is at `http://desks-qa.localhost:54727/workspace/ws_web_efd40f975cf546d8/session/ses_ef193f584ffeyiK7ZGFEYUZa1P`. It is local to this machine, not a hosted deployment. Runtime root: `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-pr1032-functional-3fKlOL`; server PID 29160. The read-only Finney sidecar runs at loopback port 60914, PID 14803. Keep both running to use this QA tab. Earlier intermediate QA processes were stopped, with their files and chat evidence retained. Original user previews were not stopped.

Next release steps: review the bounded source diff and this evidence, obtain approval to publish/merge, then have the operator deploy the exact approved revision with the documented provider and chain-service configuration. Repeat authenticated hosted acceptance and the external gates below before declaring all platform functionality ready. No deployment action was performed here.

## What is not yet established

1. **Hosted release acceptance:** public probes at `https://desks.matterhorn.so/`, auth configuration and health endpoints return ready/200, but those signals do not prove the deployed SHA, hosted authenticated inference or two-account isolation. Deploy the reviewed candidate only with operator approval, then repeat the five-desk flow and account checks there.
2. **Email/recovery:** local verification used the documented console-email fixture. Real inbox delivery, expired/reset-link handling and delivery reputation require controlled inboxes on the hosted deployment.
3. **Encryption/backups:** restrictive storage permissions and fixture tests are not evidence of deployed encryption, key custody, backup retention or a successful restore drill. The operator must supply that evidence.
4. **External features:** authorized wallet/signing workflows, actual connector OAuth and live Jev require their own configured acceptance. Crypto writes and STM remain gated off; Polymarket jurisdiction restrictions must be respected.
5. **Provider/model coverage:** ASI1 is the model exercised here. ASI1 Mini throttling and every other catalog model remain unverified. Conservative keyword classification can still request consent for a negatively phrased wallet/betting instruction; no consent was bypassed to obtain a passing result.

## Evidence index

- `WORKLOG.md`: chronology, exact runtimes, source boundaries and next action.
- `private-ai-chat-receipt.json`, `hyperliquid-chat-receipt.json`, `polymarket-fixed-chat-receipt.json`, `sui-chat-receipt.json`, `bittensor-fixed-chat-receipt.json`, `sui-object-fixed-chat-receipt.json`: sanitized account-level receipts and accounting.
- `account-isolation-results.json`, `cancelled-before-approval-check.json`: normal-account isolation/cancellation observations.
- `bittensor-sidecar-results.json`: actual read-only Finney SDK service evidence.
- `sui-object-output-limit-diagnosis.md`: observed upstream-normalized truncation; suspected mechanism explicitly distinguished from a proved cause.
- `bittensor-emission-verification.md`: direct SDK evidence and the limits of the model's interpretation.
- Screenshots show the real browser states, including failures before corrections. No test passwords, session cookies, API keys or operator secrets are included in the report.
