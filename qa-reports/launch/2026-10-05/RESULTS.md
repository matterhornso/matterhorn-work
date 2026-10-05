# Matterhorn launch QA 5 October 2026

This report continues the [4 October QA record](../2026-10-04/RESULTS.md) for the release team. The starting local commit was `59ea3aab741678afd7537e72941703d79a02f2d9` on `codex/search-discovery-2026-10-02`. The work below fixes reproduced authorization defects; it does not establish hosted launch readiness. No production configuration, real provider, existing preview/chat, push, merge or deployment was changed.

**Current release blocker:** the expanded native-runtime matrix has **122 passes and two failures**. Delayed compaction message validation can attach to a replacement run on both summary routes. Related system-context release and compaction retry defects are corrected locally, but the earlier message-validation race remains unresolved. The green results in earlier sections do not supersede these failures. See [delayed runtime authorization](#delayed-runtime-authorization).

## Team access and legacy token revocation

The initial 39-case loopback HTTP matrix had **13 failures and 26 passing controls**. Four failures showed a revoked owner continuing a team-token inventory read, creation after a billing lookup, creation after a pre-queue delay, or revocation of another token. Nine failures showed delayed session reads, raw runtime reads and raw event streams returning data after legacy owner, collaborator or viewer tokens were revoked. Revoking an unrelated token and leaving access unchanged preserved normal operations.

Legacy bearer admission now registers the existing request-lifetime check against the exact token and its admitted scope. This connects legacy tokens to the checks already present after body reads, session reads, raw runtime responses and stream emissions. It does not switch identity or fall back to another credential. Team-token routes now supply the serialized token-store access check for creation/revocation and recheck before exposing their inventory or final result.

The final focused matrix has **57 passing cases, zero failures and 406 assertions**:

| Coverage | Cases | Verification |
| --- | ---: | --- |
| Team inventory and token creation/revocation | 15 | Hold real list, billing and token-service boundaries; revoke the owner, revoke an unrelated token or leave access unchanged. Check durable token inventory and audit actions, not only HTTP status. |
| Incomplete runtime cancellation uploads | 6 | Owner/collaborator admission occurs while JSON is incomplete. Revocation prevents dispatch; unchanged/unrelated-revocation controls dispatch exactly once. |
| Delayed session and raw runtime reads | 18 | Owner/collaborator/viewer requests recheck before returning private fixture data; a fresh request with a revoked token also fails. |
| Raw runtime and server-generated event streams | 18 | After the first event, revocation prevents subsequent delivery. Unrelated revocation preserves the next event. Reader cleanup and reconnect authorization are exercised. |

An already-created token is not silently rolled back: three creation-result cases pause after durable creation but before returning the result. The revoked caller receives no token secret, while the accepted creation remains in the inventory and audit trail for an authorized operator to inspect. This distinguishes denying late delivery from claiming that no mutation occurred. Stream headers may already have been sent; revocation closes the covered streams instead of trying to change an existing HTTP 200 into 401. Previously delivered bytes cannot be retracted.

The fixtures use disposable files, tokens and HTTP listeners. The real authorization, token persistence, billing lookup and audit implementations run; test hooks only delay their asynchronous boundaries. The billing fixture uses a local mock subscription, not a purchased plan or production entitlement. Non-loopback fetches are rejected. The first typecheck found a fixture calling the typed server `stop` method with an unsupported argument; using its zero-argument signature corrected the harness. The initial billing-mode spelling also fell back to the mock mode; the final fixture uses the explicit supported `phase0_mock` setting.

## Verification

- Initial failure reproduction: 13 fail, 26 pass across 39 cases.
- Final focused matrix: 57 pass, zero fail, 406 assertions.
- Broader backend group: 612 pass, zero fail, 5,591 assertions across nine files. This run included the initial 54-case expanded matrix; the final focused run adds three accepted-creation/result cases without further production changes.
- Server typecheck and build: pass.
- Safety-gate wiring contract and diff whitespace check: pass. The new HTTP suite is included in the runtime perimeter stage.
- Full platform safety gate: all 11 stages pass, terminal exit zero. The updated runtime perimeter stage includes the new HTTP matrix.
- No frontend source changes or new rendered UI acceptance occurred. Earlier frontend/browser passes remain scoped to their recorded revision and fixtures.

```sh
bun test apps/server/src/token-authority.e2e.test.ts --timeout 15000
bun test apps/server/src/token-authority.e2e.test.ts apps/server/src/env-routes.e2e.test.ts apps/server/src/tokens.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/auth.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/hosted-guarded-mcp.test.ts apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
node scripts/matterhorn-platform-safety-gate.test.mjs
pnpm test:matterhorn-platform-safety
git diff --check
```

Logs are under `/tmp/matterhorn-token-authority-`: `red-2026-10-05.log`, `focused-final-2026-10-05.log`, `http-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. The first `typecheck` log records the corrected fixture error and is not final evidence.

## Remaining review and launch gates

Next review the local-workspace mutation routes and remaining buffered read endpoints after asynchronous waits. The raw runtime upload finding is addressed separately below. Registration of a request check alone does not prove that every route invokes it at the right boundary. Token checks use the active server's committed in-process state; cross-process token-file edits and independently cached server instances are not covered. Idle upstream streams without another chunk or heartbeat have no new immediate-revocation guarantee. Billing seat allocation concurrency is separate from this authorization correction.

Continue mounted intermediate-wait UI recovery testing and complete browser/accessibility coverage. Hosted five-desk real responses, live read-only tools, optional Jev, accounting/cancellation, controlled-account isolation, email/recovery, memory/notes/deletion/logout and production encryption/backup restore still require acceptance evidence. Historical hosted version and policy findings in the previous report must be rechecked, not treated as current observations. Keep STM off and restricted Polymarket actions unavailable until their actual policy review is completed. Obtain and review the final candidate before any deployment decision.

## Runtime upload limits

Following `b04004caf22f64543b783292d644e74fa8d02644`, review found that the raw runtime proxy buffered request bodies with `arrayBuffer()` without the application byte limit already used by canonical chat and privacy preflight. In the corrected 38-case reproduction, 18 cases failed and 20 controls passed: oversized cancellation payloads reached the disposable runtime through all three proxy mounts, while oversized prompt requests proceeded into model discovery instead of returning 413. Those prompt fixtures returned 500 because the fake discovery response was deliberately not a provider catalog; this is not evidence of model inference or provider billing.

The proxy now shares the canonical gateway's existing **10,065,536-byte aggregate request limit**. A bounded byte reader checks declared length and counts streamed bytes before cancellation, prompt discovery, approval or usage reservation. The existing text/JSON readers decode that same bounded buffer. This preserves raw bytes and the before/after access checks without adding a second policy or changing the 5,000,000-byte per-attachment limit. GET/HEAD handling is unchanged.

The final matrix passes **50 tests, zero failures and 146 assertions**. It covers `/opencode`, `/w/ws_1/opencode` and `/workspace/ws_1/opencode`; declared and chunked framing; one byte below, exactly at and one byte above the limit; `message` and `prompt_async`; UTF-8 byte rather than character counting; canonical message/preflight rejection; and empty/binary forwarding. Incomplete uploads receive a complete HTTP 413 response without requiring their remaining body or final chunk. Their fixtures read response framing rather than waiting for connection closure. This does not promise that every runtime immediately closes the socket.

The first draft of the fixture mixed workspace bootstrap reloads into upstream counts and used a client that buffered incomplete bodies. Pre-initializing disposable workspace files and explicitly framing incomplete requests corrected the harness. Those draft failures are not additional product findings. No runtime requests are excluded from the final counters. The boundary fixtures use an accepting fake cancellation endpoint; they prove transport behavior, not that arbitrary binary cancellation payloads satisfy a real runtime's schema.

### Upload verification

- Corrected pre-fix matrix: 18 failures and 20 passing controls.
- Final focused matrix: 50 pass, zero fail, 146 assertions.
- Broader backend group: 653 pass, zero fail, 5,718 assertions across nine files. This run includes the initial 38 upload cases; the 12 incomplete-upload/UTF-8 cases passed separately without further production changes.
- Actual Node v26.7.0 HTTP adapter: 36 disposable loopback cases pass across all three mounts, both framings, empty/binary payloads, byte boundaries and incomplete uploads. This supplementary script does not test Electron, other Node versions or real providers.
- Server typecheck (including the final fixtures), build and diff whitespace check: pass.
- Full platform safety gate: all 11 stages pass, terminal exit zero, including the final committed 50-case upload matrix.

```sh
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'runtime upload bounds' --timeout 20000
bun test apps/server/src/token-authority.e2e.test.ts apps/server/src/env-routes.e2e.test.ts apps/server/src/tokens.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/auth.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/hosted-guarded-mcp.test.ts apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-upload-`: `bounds-red3-2026-10-05.log`, `bounds-final3-2026-10-05.log`, `http-2026-10-05.log`, `node-incomplete-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. The supplementary Node script is `/tmp/matterhorn-upload-node-2026-10-05.mjs`, run using the already-installed tsx loader. The committed Bun regression matrix is already part of the existing safety gate. Temporary diagnostic scripts/logs are not durable CI artifacts.

### Remaining upload and release review

The composer still uses an 8 MiB attachment limit, while canonical backend attachment inspection allows 5,000,000 bytes. Review and align that user-facing contract and verify rendered failure/draft recovery; this backend change does not claim to fix it. Workspace `file://` attachment inspection is addressed by the subsequent snapshot correction below. Aggregate upload limits do not certify total process memory under concurrent requests, gateway/proxy timeout settings, slow-client protection, or every binary/file endpoint. All existing hosted launch gates above remain open. No push, merge, deployment, real provider request or existing preview/chat change occurred.

## Workspace attachment snapshots

Following `c480df97f132b9fae35cbc97a97fb3c9acc77421`, review found that workspace-file attachments were inspected with an unbounded `readFile`, then forwarded as the original mutable `file://` URL. A controlled HTTP test replaces the file with synthetic secret-shaped text during the later agent recheck. The old implementation still sent the file URL to the fake runtime, allowing a later file read to see bytes other than those inspected. This demonstrates the inspection/dispatch mismatch; it is not evidence that a real provider received a secret.

Canonical chat now forwards a base64 snapshot of the inspected bytes, retaining filename and MIME metadata. The existing bounded file-snapshot helper is reused for attachment inspection. It rejects oversized initial files before reading and replaces its own `readFile` with a buffer capped at the initial file size plus one byte, never more than the allowed maximum plus one. Before/after metadata checks reject observed growth, shrinkage or modification. Non-Windows opens are nonblocking so a FIFO without a writer can be rejected as a nonregular file. Missing files, invalid MIME, changed files, and oversized attachments receive safe errors without raw content. The existing consent hash remains tied to the inspected attachment bytes.

The initial ten-case matrix had six failed expectations and four passing controls: two required immutable dispatch and four required bounded reads rather than `readFile`. These are regression cases for the two mechanisms above, not six independent vulnerabilities. The final focused matrix passes **32 cases, zero failures and 108 assertions**. It includes file growth/shrinkage, closure of handles on success/error, a FIFO, static outside-workspace paths and leaf/parent symlinks, secret rejection, empty/ordinary files, oversize files, invalid MIME, mutation after inspection, and exact-content consent. Preflight correctly returns HTTP 200 with `decision: blocked` for secret content; the final tests assert that distinction from a rejected send. The first typecheck exposed a fixture overload mismatch, corrected by returning captured metadata once without replacing the overloaded method signature.

### Attachment verification

- Focused helper and attachment matrix: 32 pass, zero fail, 108 assertions.
- Existing content, raw-file and batch-read API consumers: four size cases exercise all three routes, with 28 assertions passing at 0, 4,999,999, 5,000,000 and 5,000,001 bytes.
- Broader affected group: 430 pass, zero fail, 2,834 assertions across seven files. The four final API-consumer cases were added and passed separately without further production changes.
- Server typecheck including the final tests, server build, safety-gate wiring contract and whitespace check: pass.
- Actual Node v26.7.0 file reader: all five supplementary checks pass (the four real 5 MB boundary sizes and a FIFO without a writer).
- Full platform safety gate: all 11 stages pass, terminal exit zero, including the new snapshot unit suite and all final HTTP cases.

```sh
bun test apps/server/src/workspace-file-snapshot.test.ts apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'workspace file snapshot|workspace attachment' --timeout 20000
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'workspace snapshot APIs' --timeout 20000
bun test apps/server/src/workspace-file-snapshot.test.ts apps/server/src/file-sessions.test.ts apps/server/src/artifact-files.e2e.test.ts apps/server/src/workspace-path-boundary.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/token-authority.e2e.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
node scripts/matterhorn-platform-safety-gate.test.mjs
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-attachment-snapshot-red2-2026-10-05.log`, `/tmp/matterhorn-attachment-snapshot-final-2026-10-05.log`, `/tmp/matterhorn-file-apis-2026-10-05.log`, `/tmp/matterhorn-attachment-http-2026-10-05.log`, `/tmp/matterhorn-attachment-typecheck-final2-2026-10-05.log`, `/tmp/matterhorn-attachment-build-2026-10-05.log`, `/tmp/matterhorn-file-snapshot-node-2026-10-05.log`, and `/tmp/matterhorn-attachment-safety-2026-10-05.log`. The new snapshot unit tests and existing HTTP suite are wired into the platform safety gate. The supplementary Node script is `/tmp/matterhorn-file-snapshot-node-2026-10-05.mjs`; it uses the already-installed tsx loader and is not a durable CI artifact.

This is local, synthetic acceptance, not real-model or hosted attachment acceptance. It does not prove hostile concurrent parent-directory replacement is impossible, guarantee a transactional filesystem snapshot against a writer that restores metadata, or bound aggregate memory across many file attachments/concurrent requests. Review those separately along with the 8 MiB/5 MB composer mismatch and mounted error/draft recovery. Raw-proxy attachment inspection is addressed in the subsequent section below. Windows-specific filesystem behavior and Electron remain unverified. Nothing was pushed, merged or deployed; existing user chats and previews were preserved.

## Raw chat attachment inspection

Following `fdca6934ed281c83b6860eefb39aa5c84489b442`, the raw prompt routes were found to construct privacy inputs from caller-supplied metadata without resolving attachment bytes. The initial 42-case HTTP matrix had **30 failures and 12 passing controls**: secret-shaped inline/workspace contents, remote URLs and outside-workspace files reached the fake runtime, and ordinary files were forwarded as mutable URLs. Valid inline attachments and explicit caller secret labels already behaved as expected. These are local synthetic reproductions, not evidence of real-provider disclosure.

Both `message` and `prompt_async` now inspect file/attachment parts through the canonical attachment resolver on all three aliases: `/opencode`, `/w/ws_1/opencode`, and `/workspace/ws_1/opencode`. Runtime payloads use inspected file snapshots. Authoritative content hashes and sizes are added to privacy checks; a forged hash or `label: public` cannot replace inspection. Original caller labels remain in the privacy input so an explicit secret/private restriction is not weakened. Raw prompts now also enforce the canonical 64-part ceiling. Other prompt-part normalization and the existing provider-policy gate remain unchanged.

The expanded tests exposed a separate decoder defect: the original repeated-group base64 validator rejected valid multi-megabyte data. A standalone check on valid 5,000,000-byte input returned false for the original expression and true for the replacement. Validation now checks length, alphabet and trailing padding without nested repetition. Invalid padding/alphabet remain rejected, valid 5 MB input succeeds, and 5 MB plus one byte returns the intended 413 size error. No specific regex-engine failure mechanism is asserted.

### Raw attachment verification

The final focused matrix passes **106 tests, zero failures and 372 assertions**:

- 72 route/input cases cover all six alias/endpoint combinations: secret inline/file contents, ordinary inline/file contents, restrictive caller labels, remote/outside paths, malformed data, per-file limits and 64/65-part boundaries.
- Six cases replace the file during the later agent check and verify that only the previously inspected snapshot is forwarded.
- Six cases obtain and confirm a raw-route challenge, change file contents while leaving caller metadata unchanged, verify rejection, restore the exact approved bytes, and verify one successful dispatch followed by replay rejection.
- 22 canonical-preflight/raw-route decoder cases cover empty data, one/two/three bytes, whitespace, malformed length/padding/alphabet, and the actual per-file byte boundary.

Consent cases explicitly use a disposable shadow-runtime configuration, matching the existing consent fixture pattern. Their first draft was correctly rejected by the independent provider-policy gate when using an unverified provider with runtime mode off; no production policy was changed to make the test pass. All provider/model responses are local fixtures. The `message` runtime fixture acknowledges transport but does not simulate an actual model stream.

Broader affected regressions pass **615 tests, zero failures and 3,527 assertions across nine files**. Server typecheck and build pass. The full platform safety gate passes all 11 stages, with terminal exit zero. Existing safety wiring includes this HTTP suite; no additional test runner or dependency was introduced.

```sh
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'raw attachment|attachment base64 decoder' --timeout 20000
bun test apps/server/src/workspace-file-snapshot.test.ts apps/server/src/file-sessions.test.ts apps/server/src/artifact-files.e2e.test.ts apps/server/src/workspace-path-boundary.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/agent-privacy.test.ts apps/server/src/guarded-agent-runtime.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Evidence logs use `/tmp/matterhorn-raw-attachment-`: `red-2026-10-05.log`, `final3-2026-10-05.log`, `http-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-2026-10-05.log`, and `safety-2026-10-05.log`. Earlier intermediate logs are not final acceptance evidence.

The aggregate attachment budget is addressed in the following section. The composer/backend size contract and mounted error/draft recovery still need verification. This pass does not certify historical attachment rehydration, every runtime-specific part type, concurrent hostile filesystem races, real model/provider interpretation, or hosted acceptance. Canonical and raw consent challenges are each bound to their own exact request; this does not make their tokens interchangeable. No push, merge, deployment, real provider request or existing user chat/preview change occurred.

## Aggregate attachment byte budget

Following `f50c37d85637b2507dc15d4e4baceeac8c61ed0e`, the resolver still allowed each of up to 64 attachment references to expand independently to 5 MB. A short JSON request could therefore accumulate substantially more inspected content than the HTTP body limit suggests. The corrected boundary reproduction had **eight failures and 16 passing controls** across canonical preflight/send and the six raw proxy alias/endpoint combinations: each route accepted 10,000,001 decoded bytes. This demonstrates the missing aggregate limit, not an observed production out-of-memory event.

All eight entry paths now share a per-request **10,000,000-byte decoded attachment budget**, retaining the existing 5,000,000-byte per-file maximum and 64-part ceiling. The total is derived from the existing request body's two-file-size allowance; the HTTP JSON cap remains unchanged at 10,065,536 bytes. Inline/base64 encoding overhead can still reach the HTTP limit before the decoded attachment limit. These are separate limits, not a promise that any pair of 5 MB inline attachments fits one request.

Workspace snapshot reads use the smaller of the per-file maximum and the remaining budget, rejecting statically oversized files before allocating their contents. Existing snapshot growth checks remain in place. Inline data is checked by decoded byte count. Each occurrence of a repeated reference counts, and untrusted `sizeBytes` metadata does not affect enforcement. Crossing the total returns HTTP 413 with `attachments_too_large` and a remove-file recovery message before dispatch; hashes, inspection text and base64 file snapshots are not created for that rejected attachment. Budgets are local to each request, so a failed request does not consume capacity for a retry.

### Aggregate attachment verification

- The 56 new cases cover all eight entry paths at one byte below, exactly at and one byte above 10 MB; 64 repeated references at/over the limit; mixed inline/workspace data in both orders; three-byte UTF-8 text with forged one-byte metadata; and successful retry after reducing a rejected request.
- Focused attachment regressions: **185 pass, zero fail, 651 assertions**. This includes the prior privacy, consent, snapshot and decoder cases.
- Broader affected backend regressions: **671 pass, zero fail, 3,719 assertions across nine files**.
- Server typecheck, build and whitespace checks pass. The full platform safety gate passes all 11 stages, with terminal exit zero.

The initial sandbox attempt could not bind loopback listeners and is not a product failure. The first executable draft also expected canonical send success to return 200 instead of its documented 202; the corrected pre-fix run isolates the eight actual aggregate-limit failures. Fixtures use disposable files and a fake loopback runtime, not existing chats, hosted accounts or paid model requests.

```sh
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'aggregate attachment byte budget|raw attachment|attachment base64 decoder|workspace attachment' --timeout 20000
bun test apps/server/src/workspace-file-snapshot.test.ts apps/server/src/file-sessions.test.ts apps/server/src/artifact-files.e2e.test.ts apps/server/src/workspace-path-boundary.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/agent-privacy.test.ts apps/server/src/guarded-agent-runtime.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-aggregate-attachment-`: `red3-2026-10-05.log`, `focused-2026-10-05.log`, `http-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-2026-10-05.log`, and `safety-2026-10-05.log`. The existing safety gate already runs the updated HTTP suite.

This bounds attachment expansion per request, not total process RSS, concurrent-request load, selected agent-file context, memory records or historical attachments. Base64, inspection strings and JSON serialization add overhead. Composer limit alignment and local selection recovery are addressed below; real-provider and hosted acceptance remain separate release gates. No push, merge, deployment, production configuration or existing preview was changed.

## Composer attachment limits and recovery

Following `5cd50995534cb3dde82d3bc5b0ba56133b426d4f`, three isolated Chromium reproductions failed: the composer accepted a 5,000,001-byte file although the gateway rejects it; its success notice claimed a shared-folder upload/link that had not happened; and decoding a corrupt image interrupted the batch before a valid subsequent file could be attached. These were mounted production-composer/Lexical checks with synthetic files and fixture callbacks, not hosted uploads or model responses.

The gateway, composer and session attachment handler now import the same 5,000,000-byte per-file limit. This removes the inconsistent 8 MiB composer and 25 MiB parent limits. File-size labels use decimal MB to match the advertised limit. All ten existing locale entries now parameterize the limit and describe success as attachment to the draft. The two new preparation-failure/extra-skipped messages use the existing English fallback when another locale lacks them; native-language review remains outstanding.

Image preparation failures are caught per file, so valid siblings remain usable. Any opened image bitmap is closed in `finally`, including canvas failures. Warnings show the first failed file with a count of further skipped files rather than an unbounded concatenation. Notices wrap and expose `alert` for warning/error or `status` for ordinary feedback. This verifies markup semantics, not announcements on a real screen reader.

### Composer verification

- The four new browser tests cover acceptance at exactly 5 MB, rejection one byte above, unchanged draft/earlier attachment, truthful success copy, corrupt-image recovery, mixed rejected/accepted batches, accessible notice roles, keyboard removal and successful reselection.
- Retro browser suite: 13 pass, zero fail, one optional screenshot-test skip. Legacy rollback suite: 12 pass, zero fail, two skips (retro mobile navigation and optional launcher captures).
- Frontend regressions: **1,456 pass, zero fail, 8,513 assertions across 193 files**. The first sandbox run could not open the three diagnostic HTTP listeners; the loopback-enabled rerun passed. This is an environment limitation, not a repaired Jev defect.
- Final frontend typecheck/web build and server typecheck/build pass. The full platform safety gate passes all 11 stages, with terminal exit zero. Existing web bundle-size warnings remain.

One baseline and one confirmation screenshot round cover light/dark at 390, 768 and 1280 px. Confirmation captures include success and mixed-error feedback and pass horizontal-overflow assertions. Images are in `/tmp/matterhorn-composer-attachments-before-2026-10-05` and `/tmp/matterhorn-composer-attachments-after-2026-10-05`; they intentionally show fixture-only controls outside the real composer. Later behavioral reruns took no additional screenshots. The initial test draft used unsupported Bun `expect.poll`; another assertion counted fixture `<output>` status roles as well as the actual notice. Both fixture errors were corrected without weakening the product assertions. The final suite checks the specific notice.

Impeccable/Uncodixfy kept this a local defect correction with no new layout, palette or motion. The automatic design hook reported no deterministic issues on its scanned changes. The existing stale product/surface metadata was not migrated. DESIGN.md records the interaction contract; its generated sidecar was not regenerated because no visual tokens changed.

```sh
RETRO_QA_FLAG=1 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
RETRO_QA_FLAG=0 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-composer-attachments-`: `red2-2026-10-05.log`, `browser-final2-2026-10-05.log`, `legacy-2026-10-05.log`, `app-tests-final-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `web-build-final-2026-10-05.log`, `server-typecheck-2026-10-05.log`, `server-build-2026-10-05.log`, and `safety-2026-10-05.log`. Reproduce captures by adding `ATTACHMENT_QA_CAPTURES=<disposable-output-directory>` to the retro browser command. Screenshot files and logs in `/tmp` are local evidence, not durable CI artifacts.

Async preparation is addressed in the following section. Exact encoded-request/aggregate rejection through the mounted session send path and actual server-error draft recovery still need verification. The 10 MB aggregate limit and the smaller effective base64 wire allowance remain enforced by the gateway, not pre-approved by the picker. Safari/Firefox, real screen readers, 200% zoom, image decompression resource ceilings, actual provider interpretation and hosted acceptance are not certified by this pass. No user chat/preview was restarted, and nothing was pushed, merged or deployed.

## Attachment preparation lifetime and concurrent selections

Following `5dd7fe7f176ab3b1e075ec0cd58631b1f60ca987`, 12 local browser cases reproduced stale attachment callbacks after chat changes, returning to the original chat, permission changes, restoring permission, unmounting and account invalidation. Both successful and failed image preparation could still commit a batch's remaining files and notices. The unchanged-chat control passed. These are production-composer callbacks in a disposable fixture, not evidence of a hosted disclosure.

The composer now binds each selection to its mounted account generation and the committed workspace/chat/attachment-permission lifetime. Cleanup invalidates pending work even if the user later returns to the same chat or re-enables attachments. Preparation rechecks that lifetime after awaiting image processing and before committing files or notices. Already-running native decoding is not forcibly cancelled; the bitmap still closes in the existing `finally` block and stale results are discarded. Independent selections within an unchanged chat remain valid, and fresh selections work after navigation or permission restoration.

A separate mounted production-shell reproduction restored the old render-captured attachment list in an in-memory test bundle. Both cases failed: completion replaced a newer attachment, or restored one the user had removed. The session handler now reads the current store immediately before appending/removing and rejects old-account callbacks. No second data store, routing change or visual redesign was introduced.

### Attachment lifetime verification

- The expanded real-composer suite tests all six lifetime boundaries with valid and corrupt native-decoded images, sibling files, suppressed stale notices, fresh selections after restoration and independent overlapping selections.
- The mounted shell/session suite passes **31 tests, zero failures and 241 assertions**, including five new cases for append, removal, navigation, return and cross-tab logout. The existing fork/revert and responsive error-feedback cases still pass. These tests run production routing and state stores with synthetic account/runtime HTTP responses.
- Frontend regressions pass **1,456 tests, zero failures and 8,513 assertions across 193 files**. Frontend typecheck and web build pass; existing bundle-size warnings remain.
- Final retro browser suite: **26 pass, zero fail, one optional capture skip, 108 assertions**. Legacy layout: **25 pass, zero fail, two skips, 104 assertions**; its skips are retro-only mobile navigation and optional captures. The full platform safety gate passes all 11 stages with terminal exit zero.

The initial hand-written PNG control did not decode successfully. It was replaced with a browser-generated PNG before the corrected pre-fix run: **12 failures and one passing control**. Trailing padding crosses the image compressor's threshold; decoding, compression and bitmap cleanup remain native browser operations. The test gate delays decoding deterministically and observes settlement rather than relying on a guessed sleep. The stale-state negative control modifies only the test bundle, never production source.

```sh
RETRO_QA_FLAG=1 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
RETRO_QA_FLAG=0 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Evidence logs use `/tmp/matterhorn-attachment-lifetime-`: `red2-2026-10-05.log`, `mounted-red-2026-10-05.log`, `browser-final-2026-10-05.log`, `legacy-final-2026-10-05.log`, `mounted-2026-10-05.log`, `app-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. Browser coverage is wired into the existing suites, including the session-route CI job. Logs remain local `/tmp` evidence.

Impeccable hardening and Uncodixfy kept the correction behavioral: no layout, copy, token or motion changes. No new screenshot round was needed for this correction; the preceding visual evidence is not extended into a new cross-browser or screen-reader claim. The automatic design hook reported no deterministic issues and continued reporting the pre-existing stale design sidecar; no unrequested metadata migration occurred.

Pending-preparation sends and mounted rejection/retry are addressed below. Combined browser-to-real-backend encoded-body/aggregate boundary testing remains open. Resource ceilings for decoding, historical attachment rehydration and real-provider interpretation remain outside this correction. Hosted acceptance, actual two-account authorization, Safari/Firefox and assistive-technology checks remain open. No existing runtime/chat was restarted, and nothing was pushed, merged or deployed.

## Sending during attachment preparation and retry recovery

Following `16f84786e503d750a3e97fe2e475d98fa6f61471`, four mounted composer cases reproduced an incomplete send: both button clicks and Enter dispatched the text before a selected image finished preparation, whether that preparation later succeeded or failed. Stop was already usable and its control passed. Preparation now has a scoped pending count, so Send/Enter wait for all current selections. The parent send path and control action also observe pending preparation. An inline status explains the wait while editing and Stop remain available. Completion never automatically sends a request. The new English status uses the existing locale fallback; native-language review remains unverified.

The production shell, model picker, chat surface, file serialization and API client were then exercised against disposable same-origin HTTP responses. These checks preserved text/files after synthetic HTTP 413 responses at both preflight and dispatch, and explicit resending retained the exact attachment bytes. However, the error card's Retry response button failed in two attachment-only cases while both text-plus-file controls passed. Its guard incorrectly required nonempty text. The corrected guard admits either text or attachments while still rejecting a busy or empty composer. The mounted tests now use this actual retry button, not just Send, and verify the file is consumed only after acceptance.

### Preparation and retry verification

- Retro composer browser suite: **32 pass, zero fail, one optional capture skip, 145 assertions**, including six new cases for click/Enter, successful/corrupt preparation, Stop, and independently released overlapping selections. The existing lifetime, account-reset and fresh-selection controls remain green.
- Legacy layout: **31 pass, zero fail, two skips, 135 assertions**. Skips are retro-only mobile navigation and optional launcher captures.
- Mounted production shell suite: **36 pass, zero fail, 273 assertions**, including four real error-card retry cases and a pending-preparation control-action case. The latter selects the model through the real picker, proves the control action is disabled during preparation, and then explicitly sends the prepared file.
- Frontend regressions: **1,456 pass, zero fail, 8,513 assertions across 193 files**. Frontend typecheck and web build pass. Existing bundle-size warnings remain.
- The full platform safety gate passes all 11 stages with terminal exit zero.

Initial mounted test attempts were blocked by the fixture's missing model selection; no product guard was bypassed. Tests were corrected to select the synthetic model through its accessible Change model control. A later empty-editor assertion was corrected to account for Lexical's newline-only empty DOM. Neither fixture issue is counted as a repaired product defect. The first full frontend run failed only on a source assertion demanding the old text-only retry guard. That assertion now documents the text-or-attachment condition, backed by the failing-then-passing mounted tests.

One existing attachment capture was inspected as baseline, followed by one new batched capture round of the preparation state in light/dark at 390, 768 and 1280 px, with reduced motion and no horizontal overflow. The mobile light and desktop dark captures were visually inspected. Images are under `/tmp/matterhorn-preparing-send-captures-2026-10-05`. Fixture-only controls are outside the production composer. This is not full-app mobile, Safari/Firefox, native screen-reader, 200% zoom or installed desktop acceptance. Impeccable hardening and Uncodixfy preserved existing tokens and layout; the inline status avoids overlapping the existing floating notice. The automatic design hook found no deterministic issues. The existing stale design sidecar was not migrated.

```sh
RETRO_QA_FLAG=1 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
RETRO_QA_FLAG=0 bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 30000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-preparing-send-`: `red-2026-10-05.log`, `retry-red-2026-10-05.log`, `browser-final-2026-10-05.log`, `legacy-2026-10-05.log`, `mounted-final-2026-10-05.log`, `app-final-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. Add `PREPARATION_QA_CAPTURES=<disposable-directory>` to reproduce captures. Both browser suites are already invoked by CI. Logs and captures remain local evidence, not published artifacts.

The mounted HTTP responses deliberately simulate rejection followed by acceptance of small files. They do not execute the backend's byte-budget implementation or establish that an actually oversized request can succeed unchanged. Backend size-limit tests are separate evidence. Next join the mounted browser with the real isolated server for wire/aggregate limits and privacy rejection, then inspect historical attachment recovery and control actions whose state changes during choreography. Native decoding resource ceilings/cancellation, real provider interpretation and hosted acceptance remain open. Nothing was pushed, merged or deployed, and existing previews/chats were untouched.

## Browser attachment recovery through the real gateway

Following `f2f0329146354302a247a45ca5ac64423885bd72`, the mounted production shell now has four integration cases that forward its serialized request bytes unchanged to a real isolated Matterhorn backend. They cover encoded-body rejection and secret-content rejection, each with both text-plus-files and attachment-only drafts. Each test starts a separate backend process with an explicit environment, disposable database/storage paths, a legitimate local bearer token and a synthetic loopback agent runtime. Provider keys and production configuration are not inherited. The browser's account/session services remain synthetic; these checks do not establish hosted login or tenant isolation.

Two 4 MB text files pass the individual picker limit but exceed the gateway's 10,065,536-byte JSON limit after base64 encoding. The actual backend returns HTTP 413 before agent dispatch. The privacy cases attach a harmless file alongside a synthetic `PRIVATE_KEY=` marker in an otherwise ordinary `.txt` file. The real inspector returns a blocked preflight without echoing the synthetic value or dispatching to the runtime. In both cases the browser retains the draft and both files.

Removing the offending file and explicitly resending succeeds through real preflight and dispatch, consumes the accepted draft, and delivers only the retained file to the synthetic runtime. The final test also compares its complete encoded contents with the original bytes. The size-error case uses the error card's Retry response action. The privacy-error card intentionally has no Retry response action; its edited draft is explicitly sent with Ask and receives a fresh privacy check. This does not bypass consent or weaken the block. The isolated local provider uses the existing local-processing path; external provider consent and guarded-runtime enforcement are not certified by these tests.

### Gateway integration verification

- Final mounted regression suite: **40 pass, zero fail, 327 assertions**, including all four real-gateway integration cases and exact retained-byte checks. The earlier focused run passed all four cases with 50 assertions before the four exact-byte assertions were added.
- Actual server aggregate matrix: **56 pass, zero fail, 192 assertions**. It covers 10 MB decoded boundaries, repeated references, mixed inline/workspace inputs and retry after reducing attachments across canonical and raw mounts. These are separate backend HTTP tests, not a claim that the browser picker can create workspace-file references or reach a 10 MB decoded total within its smaller base64 wire allowance.
- Full platform safety gate: **all 11 stages pass**, with terminal exit zero. This change adds tests and documentation only; frontend typecheck and web build were not rerun separately, and their prior results are not presented as fresh evidence for this pass.

Initial test development found an incorrect Remove button selector, an omitted abort endpoint in the synthetic runtime, and a selector that picked an old transcript's Retry response action instead of the privacy recovery flow. Correcting those fixture assumptions produced the passing cases above; no new production defect or fix is claimed in this pass. The gateway correctly rejected dispatch when the synthetic runtime could not acknowledge abort. Test controls and production source were not weakened to turn that rejection into success.

```sh
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'real gateway attachment' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'aggregate attachment byte budget' --timeout 30000
pnpm test:matterhorn-platform-safety
```

Final evidence is `/tmp/matterhorn-browser-real-gateway-mounted-final-2026-10-05.log`, `/tmp/matterhorn-browser-real-gateway-aggregate-2026-10-05.log` and `/tmp/matterhorn-browser-real-gateway-safety-2026-10-05.log`. The earlier focused log is `/tmp/matterhorn-browser-real-gateway-focused3-2026-10-05.log`. The complete mounted suite is already in the existing CI workflow. These logs are local evidence, not published CI artifacts. No new visual design or production behavior changed, so no new screenshot, cross-browser or screen-reader certification is implied.

Remaining work includes historical attachment recovery, control actions whose state changes during choreography, native image decoding resource ceilings, real provider interpretation and hosted five-desk acceptance. Hosted accounts/inboxes, deployment identity, encryption and backup-restore evidence remain independent launch gates. Nothing was pushed, merged or deployed; existing chats and previews were untouched.

## Attachments in historical response retries

Following `56cb6f25dde6a98b6f07de8286a1e8c81b5d0f93`, two mounted browser reproductions failed: retrying a text-plus-file turn sent only its text, while an attachment-only turn did not submit. The retry resolver previously discarded files, and the handler explicitly required nonempty prompt text. The corrected resolver retains the original user turn's file parts. A bounded decoder restores saved base64 data URLs into transient Files, and the handler submits those files through the existing serialization, preflight and dispatch path. It does not consume, send or overwrite unrelated composer text/files.

The decoder rejects non-inline URLs, malformed base64, mismatched MIME types, files above 5 MB, decoded totals above 10 MB and more than 64 files. It never fetches remote, workspace-file or expired blob URLs. These cases ask the user to reattach files and send a new message; validation runs before abort/revert. The error is visible and non-retryable rather than offering an action that cannot recover the missing bytes. No preview object URL is created during restoration. The server still independently verifies attachment contents, privacy, byte limits and authority; restoring a File is not approval to send it.

### Historical retry verification

- Focused response-action suite: **38 pass, zero fail, 97 assertions**. New coverage includes stable retry IDs and saved bytes, UTF-8 and binary data, unavailable references, malformed data, MIME mismatch, per-file boundaries, aggregate decoded-byte and part-count bounds.
- Final full frontend suite: **1,469 pass, zero fail, 8,539 assertions across 193 files**. Final frontend typecheck and web build pass; existing bundle-size warnings remain.
- Final mounted suite: **46 pass, zero fail, 365 assertions**. It adds six cases: successful attachment-only/text-plus-file retry; missing-file and malformed-data recovery without mutating requests; and preflight/dispatch rejection followed by an unrevert request. Successful retries preserve the old file's exact data URL and exclude the unrelated draft's file. Failure tests use keyboard activation, preserve current drafts/files and check alert semantics.
- Final platform safety gate: **all 11 stages pass**, with terminal exit zero. The earlier running gate was allowed to finish before a fresh gate checked the final error-handling code.

The initial synthetic abort fixture returned a session object instead of the runtime's required boolean acknowledgement, so the product correctly stopped before retry dispatch. After correcting that fixture, both attachment bugs reproduced in `red2`. This fixture correction is not counted as a product fix. No existing tests were weakened to accept dropped attachments.

One batched light/dark capture round at 390 and 1440 px exposed an unhelpful Retry response button on an unrecoverable attachment error. That action was removed in one follow-up, followed by one confirmation batch. Mobile light and desktop dark captures were visually inspected; all captured sizes check horizontal overflow. Captures use reduced motion. This does not verify Safari/Firefox, native screen-reader announcements, 200% zoom or hosted behavior. Impeccable hardening/polish and Uncodixfy preserved the current layout, tokens and identity. The hook found no deterministic design issues; its pre-existing stale sidecar warning was not migrated. The new error copy remains English and needs the same localization review as other session errors.

```sh
bun test apps/app/tests/response-actions.test.tsx
bun test apps/app/tests
HISTORICAL_ATTACHMENT_CAPTURES=<disposable-output-directory> bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Evidence logs use `/tmp/matterhorn-historical-attachments-`: `red2-2026-10-05.log`, `unit-2026-10-05.log`, `app-final-2026-10-05.log`, `mounted-final-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-final-2026-10-05.log` and `safety-final-2026-10-05.log`. Capture folders are `/tmp/matterhorn-historical-attachments-captures-2026-10-05` and `/tmp/matterhorn-historical-attachments-confirmation-2026-10-05`. These are disposable local artifacts, not published CI evidence.

The new historical-retry cases use synthetic account/runtime responses and assert the restoration request sequence; they are not proof of a real provider completing a replacement response or of hosted runtime rollback. The earlier real-gateway attachment cases remain in the same mounted suite. Remaining work includes accepted-run failure rehydration, delayed action/route changes, native decoding resource ceilings and hosted acceptance. No credentials, existing chats, previews or production settings changed; nothing was pushed, merged or deployed.

## Delayed control actions before execution

Following `ceb08387167f2ff2aa8d44663768e9bc60f0a544`, mounted browser tests paused the real Control Mode spotlight at its existing scroll delay, changed user state, and then released that delay. Five cases dispatched the old draft after editing, clearing, navigating away, navigating away and back, or switching Control Mode off. A sixth case returned success after cross-tab logout, although the existing account guard prevented dispatch. The unchanged control sent normally. The second red run asserts actual preflight/dispatch requests before checking the result, distinguishing unwanted sends from false-success reporting.

The provider now captures the account generation and target before choreography, then rechecks the registration token, action definition, disabled state, connected target and run generation immediately before invoking the action. Route changes/unmounting and explicit disable invalidate that generation; returning to the same URL does not restore the old action. A changed definition is cancelled instead of silently invoking a newer draft. The existing action result reports review-and-retry guidance. No server authorization, consent or model-selection gate was relaxed.

### Delayed action verification

- Eleven new mounted cases cover unchanged Send, editing, editing back to the original text, clearing, adding/removing attachments, pending image preparation, navigation, return navigation, disabling and cross-tab logout. Every case also checks that a concurrent duplicate is rejected before dispatch. Fresh explicit sends after editing, disabling and completed image preparation succeed; the image recovery request contains both current text and the prepared JPEG.
- Final mounted production-shell suite: **57 pass, zero fail, 417 assertions**. Earlier real-gateway attachment tests remain included. Account services and the runtime used for the new control cases are synthetic; no real provider is called.
- Final full frontend suite: **1,469 pass, zero fail, 8,539 assertions across 193 files**. Frontend typecheck and web build pass, with existing bundle-size warnings.
- The full platform safety gate passes **all 11 stages**, with terminal exit zero.

The first full frontend run could not bind loopback for three HTTP-client tests in the sandbox. The permitted local-network rerun passed the entire suite. One expanded test initially checked the same recorded body using two nested asymmetric matchers. A separate minimal reproduction showed Bun 1.3.11's first `toMatchObject` replaced `parts` with the matcher, so the second assertion no longer inspected the original array. Combining the text and file requirements into one assertion fixed the test without changing product serialization. Temporary debug output was removed.

```sh
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'delayed control send' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Evidence logs use `/tmp/matterhorn-delayed-control-`: `red2-2026-10-05.log`, `focused-2026-10-05.log`, `expanded-2026-10-05.log`, `mounted-final-2026-10-05.log`, `app-final-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. The final full mounted run supersedes the expanded run's matcher failure. These are local artifacts, not published CI evidence; the mounted suite is already wired into CI.

Impeccable hardening/polish and Uncodixfy kept the existing layout and tokens. This correction adds cancellation feedback through the existing narration/result channel, not a new visual surface. No new screenshot round, cross-browser, native screen-reader or zoom certification is claimed. The automatic design hook found no deterministic issues and reported the existing stale design sidecar; no metadata migration was made.

This gate stops execution before an action starts. It does not reverse accepted mutations or certify every registered action's own post-execution awaits and success reporting. Accepted-run attachment recovery, native decoding resource ceilings and hosted five-desk/operational acceptance remain open. Source inspection still shows the terminal-failure effect restoring only `retryMessage` text with an empty attachment list; a mounted reproduction is the next useful check, not yet a confirmed new finding here. No credentials, existing previews/chats or production configuration were changed. Nothing was pushed, merged or deployed.

## Recovering accepted requests that later fail

Following `54b4dd2a0abaaf0fe667027b4a93c63df746c6ee`, four mounted cases reproduced incorrect recovery from a saved terminal failure. Attachment-only Retry sent nothing; a text-plus-file Retry sent text without its file; and both variants sent a newer composer draft/file when one was present. The failure effect had copied only text into the composer, while Retry used whichever draft happened to be current.

The displayed error now identifies its failed response. Retry validates that it remains the latest response, then uses the existing historical retry transaction and bounded inline-file restoration. The terminal failure no longer writes anything into the composer. Rejected new submissions still use their retained draft, rather than being redirected by an older failed snapshot. The selected model, privacy checks, account checks and server authority remain in the normal path. Saved stopped runs provide an explicit retry action without restarting automatically.

Provider recovery also needed correction: selecting a model dismissed the failed-turn error and removed its recovery action. Errors associated with accepted turns now retain Retry through model selection. Their guidance says the original request is stored in the conversation rather than incorrectly claiming it is in the composer. Other provider/rate-limit guidance remains visible. A source assertion requiring the old automatic text restoration was replaced with the error-to-response binding contract, backed by the failing-then-passing mounted reproductions.

### Terminal recovery verification

- **Eleven new mounted cases** cover saved text-plus-file/file-only failures with empty or newer drafts; accepted dispatch followed by navigation and a terminal snapshot; a newer preflight rejection that must retry the newer draft; rate limiting; unavailable original files; answer-only continuation; model selection; and stopped status. Keyboard Enter activates the failed-turn Retry in the four initial cases. The unavailable-file case stops before abort/revert and shows non-retryable reattachment guidance.
- Continuation recovery sends `requestToolProfiles: [{ "*": false }]` in both preflight and dispatch. This verifies the browser wire contract, not a real runtime's enforcement. The original incorrect test expected the internal `answerOnly` draft flag on the HTTP body; source inspection established the actual wire representation, and the test now checks that restriction explicitly.
- The provider recovery test first used the compact header picker's option selector for the full model dialog. After correcting it to the real dialog's model button, `provider-red2` reproduced the missing recovery action. This selector correction is not a product fix.
- Final mounted suite: **68 pass, zero fail, 474 assertions**, including two provider-capture overflow assertions. The earlier real-gateway attachment cases remain included. Without optional captures, expect two fewer assertions.
- Final frontend suite: **1,469 pass, zero fail, 8,539 assertions across 193 files**. Final frontend typecheck and web build pass; existing bundle-size warnings remain.
- The final full platform safety gate passes **all 11 stages**, with terminal exit zero. Earlier running gates were allowed to finish; the final run checked the completed model-selection and stopped-run recovery change.

```sh
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'accepted failure' --timeout 120000
TERMINAL_PROVIDER_CAPTURES=<disposable-directory> bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-terminal-retry-`: `red-2026-10-05.log`, `provider-red2-2026-10-05.log`, `boundaries-final-2026-10-05.log`, `mounted-verified-2026-10-05.log`, `app-complete-2026-10-05.log`, `typecheck-complete-2026-10-05.log`, `build-complete-2026-10-05.log` and `safety-complete-2026-10-05.log`. Earlier mounted logs include the corrected wire-field assertion failure and are superseded by `mounted-verified`.

Impeccable hardening/polish and Uncodixfy preserved the current components, layout and tokens. One light/dark capture batch at 390/1440 px checked the generic failed-turn guidance, followed by one provider-recovery confirmation batch at light 390/dark 1440. Both mobile and desktop samples were inspected; captured widths have no horizontal page overflow. The existing status/alert semantics remain, and stopped recovery is verified as status rather than an error alert. Captures use reduced motion. This is not Safari/Firefox, real screen-reader, 200% zoom or localized-copy certification. Capture folders are `/tmp/matterhorn-terminal-retry-captures-2026-10-05` and `/tmp/matterhorn-terminal-provider-captures-2026-10-05`; the first batch is reproducible with `TERMINAL_RETRY_CAPTURES` on the focused cases.

The new tests use production UI code with synthetic account, provider and session responses. The accepted-dispatch cases publish a synthetic saved failure after acceptance and read it on returning to the chat; they do not prove a live provider's streaming failure or real rollback. These results close the local terminal-recovery finding, not hosted acceptance. Native image-decoding resource ceilings, asynchronous response-action/consent lifetime checks and hosted five-desk/operational gates remain open. No existing previews/chats, credentials or production settings changed. Nothing was pushed, merged or deployed.

## Delayed privacy confirmation

Following `cfffae67d1a5f0af839582e2a9be583914a0382c`, the mounted production UI dispatched an obsolete draft when a successful confirmation arrived after editing, dismissal, navigation or navigation away and back. Failed confirmations also replaced an edited draft's feedback or resurrected a dismissed error. The initial logout cases timed out because the account client correctly aborted their HTTP request; those timeouts were test-observation defects, not evidence of cross-account dispatch.

Confirmation now captures the displayed error, pending retry/continuation, composer snapshot and current view. Before resuming, it checks account generation, committed view/request lifetime, current browser URL, current error, pending operation and (for a new message) draft identity and attachment preparation. Request lifetime includes model, agent, execution settings and context changes. The browser URL check covers the interval in which router transitions retain the old surface after history has moved. An operation identity prevents an older completion from clearing a newer confirmation's pending state.

Changed requests show review-and-retry guidance without reusing the returned token. Dismissed or superseded errors are not restored. A fresh explicit send goes through preflight again. Saved-answer retry and continuation remain bound to their original turn, not an unrelated edited composer draft. Server consent validation, permissions and tool restrictions were not weakened. Discarding an unused token is not server-side revocation and does not reverse an already dispatched request.

### Confirmation verification

Twenty-eight new mounted cases cover successful/rejected delayed confirmation with unchanged input, editing, editing back, file selection, pending image preparation, model changes, dismissal, navigation, return navigation and cross-tab logout; plus retry/continuation approval with unchanged or edited unrelated drafts, navigation and dismissal. The continuation fixture explicitly advertises the backend's answer-only continuation contract; production correctly rejected the earlier incomplete fixture before reaching consent. Pending-image test failures were corrected to use the existing image helper and observe its actual preparation state, rather than an invented text label. No production assertion was relaxed to accept unwanted dispatch.

The final full mounted run passed **96 cases, zero failures, 599 assertions**, including the added invalidation dependencies for selected agent, response perspective, client identity and capability changes. Final frontend regressions pass **1,469 tests, zero failures, 8,539 assertions across 193 files**; final typecheck and web build pass, with existing bundle-size warnings. The final complete safety gate passes **all 11 stages**, with terminal exit zero. Earlier running suites were allowed to finish before final-code verification; the `verified` logs below are the final evidence.

One batched visual check covered the cancellation message in light mode at 390 px and dark mode at 1440 px, with reduced motion and horizontal-overflow assertions. Both captures were inspected: guidance wraps, the draft remains visible and the send control is accessible. Impeccable hardening/polish and Uncodixfy preserved the existing layout and tokens. No extra visual refinement round was needed. This does not certify Safari, Firefox, native screen-reader announcements, 200% zoom, localized copy or hosted behavior.

```sh
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'delayed privacy confirmation' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-consent-lifetime-`: `red-2026-10-05.log` records the initial reproduction; intermediate `focused`, `expanded` and `boundaries` logs include the identified fixture errors and incomplete navigation guard. The final logs are `mounted-verified-2026-10-05.log`, `app-verified-2026-10-05.log`, `typecheck-verified-2026-10-05.log`, `build-verified-2026-10-05.log` and `safety-verified-2026-10-05.log`. Captures are in `/tmp/matterhorn-consent-lifetime-captures-2026-10-05` and can be reproduced with `CONSENT_LIFETIME_CAPTURES` on the focused run. These are local disposable artifacts, not remote CI results.

The new cases use synthetic accounts, grants and runtime responses; earlier isolated real-gateway attachment cases remain in the full suite. This establishes browser request-lifetime behavior, not hosted exposure, real-provider completion or revocation of server grants. Native image-decoding resource ceilings and post-start asynchronous send/retry transaction behavior remain for review. Hosted five-desk responses, operational accounts/inboxes, release identity, encryption and backup restore remain independent launch gates. Nothing was pushed, merged or deployed; existing previews/chats and credentials were untouched.

## Late chat results and concurrent sessions

Following `01599171d42a127b92613d91ef2e4d4b0f3b6182`, eight mounted reproductions showed late request feedback crossing view lifetimes. Failed sends, retries and continuations displayed their error after navigation or navigation away and back; successful retries also displayed their completion notice in the new view. Drafts/files survived the stabilized reproductions. The tests wait for the intended composer, not just the changed URL, so they isolate post-request feedback from typing during the router's transitional render.

The surface now checks the captured account/view lifetime before writing local error, notice, baseline and pending state. Accepted work still updates its original operation metrics and session-scoped draft bookkeeping. Retry and continuation invalidate the original snapshot's exact query key instead of invoking a query observer that may now be attached to another chat. Their busy refs reset when changing workspace/session; an old completion cannot release a newer view's action ref. Navigation does not cancel or undo work already dispatched.

A second pair of reproductions found that an enabled Ask button in another chat silently did nothing while the first chat's submission was pending. The composer hook's duplicate gate was shared by all sessions using the surface. It now tracks pending workspace/session keys independently and releases only the completed key. The source-level consent wiring assertion was updated to require that scope without weakening ordinary-send versus explicit-consent separation.

### Late result verification

- Eighteen new cases cover successful/failed send, retry and continuation after unchanged view, navigation and return. They retain a newer text/file draft and verify that late errors and retry-success notices do not appear in a different view.
- Four concurrent-chat cases cover accepted/rejected first requests with the second request already completed or still pending. Completing the first leaves the second draft intact; a still-pending second request retains its pending state and Stop generating control. The second request can then complete independently.
- Final frontend regressions pass **1,469 tests, zero failures, 8,539 assertions across 193 files**. Typecheck and web build pass, with existing bundle-size warnings.
- The dedicated composer browser suite passes **31 tests, zero failures, 135 assertions**, with two existing optional sidebar/capture cases skipped. The final mounted browser run passes **118 tests, zero failures, 726 assertions**. The full platform safety gate passes **all 11 stages**, with terminal exit zero.

The initial concurrent fixture had not selected a model in the second chat, so its disabled Ask button was correct. After selecting the model, `concurrent-red2` reproduced the silent no-op at the HTTP request boundary. Overlapping-request checks initially expected a disabled Ask button; the real pending UI instead exposes Stop generating and hides Ask. Those assertions were corrected against the existing component and English label. One obsolete verification run was explicitly stopped after detecting the wrong label; it is not counted as a passing run. No production behavior was changed to satisfy those fixture errors.

```sh
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'pending (send|retry|continue)' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/scripts/composer-submit.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-pending-chat-feedback-`: `red2-2026-10-05.log` and `concurrent-red2-2026-10-05.log` are the stabilized reproductions; `expanded-2026-10-05.log` is the focused passing run before adding overlapping completion cases. Final evidence is `mounted-verified-2026-10-05.log`, `composer-2026-10-05.log`, `app-2026-10-05.log`, `typecheck-final-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. Earlier mounted logs include the documented test-assertion failures and stopped run, and are superseded by `mounted-verified`.

Impeccable hardening and Uncodixfy preserved existing copy, error components and layout. This correction changes when feedback is applied, not its visual design; no additional screenshot certification is claimed. All new services, accounts and delayed responses are synthetic. Existing real-gateway attachment cases remain in the mounted suite, but neither set proves hosted inference, actual provider accounting or server rollback. Same-session overlapping-request correlation, cancellation/compensation during retry transactions, native image-decoding limits and hosted operational acceptance remain open. No production data/configuration, existing chats/previews or credentials changed; nothing was pushed, merged or deployed.

## Same chat submission result ownership

The preceding cross-view correction is committed locally as `c95ef8f136133b329c05f5819c8d564801cc15e4`. Follow-up unit tests reproduced older failures/cancellations overwriting a newer request's activity state and cancellation leaving a newer request pending because only the oldest queued operation was considered. Five of the seven new regression cases failed before correction; the other two are preservation controls.

Four browser cases also reproduce older retry/continuation failures writing an error into the same chat after navigation and a newer send, with the newer send either accepted or still awaiting its HTTP response. A final-DOM assertion initially missed the intermediate store transition. The fixture now observes production activity-store transitions without changing them, and all four cases fail on the old code. The first observer attempt registered before the account initialization reset, so it was cleared; those missing-observer failures are fixture errors, not product findings. Registration now follows the actual store updates.

The latest operation identity is retained per workspace/session, including after it completes, and cleared at account/cache reset. Submission feedback updates global activity and local error/pending state only for that identity. Historical metrics still record the earlier result. Cancellation looks up the exact operation and is idempotent instead of depending on FIFO position. The retry/continuation catch paths no longer unconditionally set activity idle after recording a failure. These changes neither cancel accepted backend work nor change permission, consent, signing or accounting authority.

### Same chat verification

- Nine added unit cases cover older cancelled/failed results against newer busy/completed/error states, out-of-order cancellation, independent workspace/session identities, duplicate cancellation, completed requests, account clearing and reused numeric IDs. The focused operation/cancellation suites pass **16 tests and 70 assertions**.
- Four added mounted browser cases preserve the newer draft and pending flag and check intermediate activity transitions, not just the final DOM. The focused run passes **four cases and 30 assertions**.
- Final aggregate checks pass: **122 mounted browser cases, zero failures, 756 assertions**; **1,478 frontend tests, zero failures, 8,573 assertions across 193 files**; typecheck; web build; and **all 11 platform-safety stages**, each command with terminal exit zero. Existing bundle-size warnings remain.

```sh
bun test apps/app/tests/session-cancelled-approval.test.ts apps/app/tests/model-operation-metrics.test.ts
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'same chat late' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-same-chat-`: `results-red-2026-10-05.log` for unit reproduction; `mounted-red3-2026-10-05.log` for the four observed browser failures; `mounted-focused-2026-10-05.log` for focused verification; and `mounted-final-2026-10-05.log`, `app-verified-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-final-2026-10-05.log` and `safety-final-2026-10-05.log` for aggregate checks. The initial sandboxed frontend run passed 1,475 cases but failed three HTTP-fixture tests at loopback server startup; it is not counted as an aggregate pass. The permitted-loopback rerun is the final frontend evidence.

Impeccable hardening and Uncodixfy preserve the existing visuals and feedback components. No new visual certification is claimed. Browser accounts, providers and delayed responses are synthetic; the existing isolated real-gateway attachment checks remain in the larger suite. This correction does not establish exact runtime-message-to-metric correlation, late Stop response isolation, retry transaction compensation or native image-decoding ceilings. Those reviews and hosted five-desk responses, operational accounts/inboxes, encryption and backup restore remain open. No push, merge, deployment, production configuration or existing preview/chat mutation occurred.

## Delayed Stop responses

Following local commit `61a3262c9635f9c8e5c40987d4578e5e5563f2c9`, five of eight initial browser cases reproduced stale Stop feedback. A successful delayed acknowledgement cleared a newer request's pending state in the same chat, another chat, and after returning to the original chat. Rejected acknowledgements displayed an error on newer requests in the same chat and after return. Three controls already passed; no claim is made that every tested boundary was broken.

Stop now captures the latest workspace/session request before awaiting the server, instead of looking up the oldest pending request afterward. Its acknowledgement records cancellation only for the captured request, invalidates the original snapshot's exact query key, and updates activity only if no newer local request superseded it. Local error/pending feedback also rechecks account and view lifetime. Rejected acknowledgements retain the ordinary error for the unchanged request; stale errors do not replace the newly viewed chat's feedback. Cancellation metrics remain idempotent, and no draft is rewritten.

### Stop verification

Fourteen mounted cases cover successful/rejected acknowledgements with unchanged request, a newer request in the same chat, navigation/return with a replacement request, navigation/return without a replacement, and cross-tab logout. The expanded focused run passes **14 cases, zero failures, 65 assertions**. One added unit case checks exact Stop target capture, workspace separation, older/newer pending entries and account clearing; the focused operation/cancellation suites pass **17 cases and 78 assertions**. Final aggregate checks pass: **136 mounted browser cases, zero failures, 821 assertions**; **1,479 frontend tests, zero failures, 8,581 assertions across 193 files**; typecheck; web build; and **all 11 platform-safety stages**, with terminal exit zero. Existing bundle-size warnings remain.

```sh
bun test apps/app/tests/session-cancelled-approval.test.ts apps/app/tests/model-operation-metrics.test.ts
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'delayed Stop' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-stop-lifetime-`: `red-2026-10-05.log` records the five browser failures; `focused-2026-10-05.log` and `expanded-2026-10-05.log` record the corrected focused cases. Final evidence uses `mounted-final-2026-10-05.log`, `app-final-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-final-2026-10-05.log` and `safety-final-2026-10-05.log`.

The new checks run production UI against synthetic account/runtime HTTP responses. They prove feedback isolation, not actual server abort ordering, provider cancellation or token settlement. Impeccable hardening and Uncodixfy preserve the current layout/copy; no new visual certification is claimed. Exact runtime-message-to-metric correlation, overlapping retry compensation, repeated Stop ordering and native image-decoding limits remain for review, alongside hosted five-desk and operational acceptance. Source inspection confirms the retry helper restores a failed dispatch without a session revision check, and image compression calls `createImageBitmap` before bounding output dimensions; neither risk has yet been established by a new end-to-end reproduction. No push, merge, deployment, production configuration or existing chat/preview mutation occurred.

## Hosted release recheck

The credential-free GET/OPTIONS probe completed at **4 October 2026 22:41:19 UTC**, or **5 October 06:41:19 Asia/Singapore**. GitHub's `dev` branch still reports `e4342d6bef8d833d12e36bd8093a87c8dbe84856`. Both public web HTML and API headers report `9b74d923b8c999733fe698c29a6555dd2980460b`, 27 commits behind that baseline. Before this Stop fix/documentation commit, local HEAD `61a3262c9635f9c8e5c40987d4578e5e5563f2c9` is another 60 commits beyond `dev`. Deploying current `dev` alone would omit the local fixes; select and review the final candidate explicitly.

The strict probe exits 1 with three failures: web commit mismatch, API commit mismatch and guarded runtime mode `off` rather than the required `enforce`. Its 27 other checks pass, including the sampled security headers, HTTPS, exact-origin CORS, unauthenticated JSON 401 responses on `/workspaces` and `/opencode/global/health`, and public signup configuration. Signup reports open with verification/reset/legal/Turnstile dependencies present; `/health/launch` reports ready. These configuration claims do not establish inbox delivery, authenticated inference, backups, isolation or full launch readiness. Guarded mode off does not by itself prove an authorization bypass.

The durable, sanitized report is [hosted-release-readonly.json](./hosted-release-readonly.json). Reproduce without credentials or production changes:

```sh
gh api repos/matterhornso/matterhorn-work/branches/dev --jq .commit.sha
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://desks.matterhorn.so --server-url https://desks.matterhorn.so \
  --allowed-origin https://desks.matterhorn.so \
  --expected-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-web-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-guarded-mode enforce --expected-signup-status open --strict
```

Update the expected commits to the approved candidate for deployment acceptance. No account, email, model request, wallet action or production configuration was created or changed by this probe. The public beta remains **not certified for launch**.

## Retry ownership before conversation mutation

Following `8052ecc4d5bd537d49766f8834b047c266a16a3d`, two mounted regressions reproduced an older failed retry issuing `/unrevert` after a newer request started in the same chat. Both newer-request states were affected: accepted and still waiting for an HTTP response. Two continuation controls passed. This is evidence of an inappropriate restore request, not a demonstration of actual hosted data loss.

The retry transaction now requires a local request-ownership check alongside the existing account-generation check. It checks before preparation and before each subsequent abort, revert, dispatch and failure restore. A superseded retry stops without issuing another mutation. Successful dispatch remains accepted even if newer work started while its response was pending. Supersession is recorded as cancellation rather than a provider error and cannot cancel the newer operation. Ordinary failed dispatch still restores the original conversation when there is no newer operation; navigation alone does not suppress that recovery.

Seven new unit cases cover supersession before preparation and after each asynchronous step, accepted dispatch, and exact-operation cancellation metrics. The focused response-action/cancellation suites pass **57 cases, zero failures, 161 assertions**. One initial test incorrectly expected the activity store's public status to be `busy`; the existing store maps that run status to `thinking`. The assertion now checks preservation of the entire activity record instead of inventing a public status. The production implementation was not changed for that fixture correction.

The browser reproduction is `/tmp/matterhorn-retry-ownership-red-2026-10-05.log`: two retry failures and two passing continuation controls. The corrected focused run passes **10 cases, zero failures, 65 assertions**, including unchanged, navigated and returned retry flows. The final mounted suite additionally asserts the exact restore count for ordinary rejected retries and no restore for accepted ones.

Final aggregate verification passes **136 mounted browser cases, zero failures, 829 assertions**; **1,486 frontend tests, zero failures, 8,597 assertions across 193 files**; typecheck; web build; and **all 11 platform-safety stages**, with terminal exit zero for each command. Existing bundle-size warnings remain.

```sh
bun test apps/app/tests/response-actions.test.tsx apps/app/tests/session-cancelled-approval.test.ts
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'same chat late|pending retry' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
```

Final logs use `/tmp/matterhorn-retry-ownership-`: `unit-final-2026-10-05.log`, `focused-2026-10-05.log`, `mounted-final-2026-10-05.log`, `app-final-2026-10-05.log`, `typecheck-2026-10-05.log`, `build-2026-10-05.log` and `safety-2026-10-05.log`. The initial `unit-2026-10-05.log` contains the documented activity-status assertion error and is not a final pass.

This is local synthetic account/runtime evidence. The guard cannot retract an abort, revert, dispatch or restore already sent, and does not establish atomic server rollback protection against another tab/device, same-operation Stop cancellation during retry, or exact runtime-message correlation. Those remain separate reviews. Existing account, consent, attachments, drafts, layout and signing boundaries are preserved; Impeccable hardening and Uncodixfy introduced no visual redesign or new screenshot certification. No real provider call, hosted configuration change, push, merge or deployment occurred.

Next review: exercise retry cancellation and mutations already in flight, then authoritative server ordering for competing clients. The gateway currently forwards abort/revert/unrevert under workspace authorization; the local ownership check is not a server revision or transaction claim. Repeated Stop ordering, message-to-metric correlation, native image-decoding bounds and the previously recorded hosted operational gates also remain unverified.

## Stop during chat preparation

Following `0578272a2f3fb4ad89543b7ea0206fc47cd51c1d`, two browser cases reproduced a retry dispatching after Stop while its abort or revert response was delayed. Three additional cases reproduced ordinary sends, retries and continuations dispatching after Stop while privacy preflight was delayed. Five unchanged controls passed. These reproductions use the production shell with synthetic account/runtime HTTP responses, not a real model.

Pending submissions now have request-specific cancellation signals. Stop marks the exact request synchronously, before waiting for the server acknowledgement. Account reset stops pending preparation and clears registrations; completion releases them. The shared send route checks cancellation after attachment/context preparation, after preflight and before dispatch. It does not recheck cancellation after acceptance, because accepted work cannot truthfully be labelled unsent. A cancelled retry that has already reverted invokes restoration only if its account and local request ownership remain current. If restoration fails, the existing recovery error remains explicit; no successful rollback is claimed.

The accepted-response checks caught a defect in the initial correction: reusing the preparation check after dispatch caused six cases to misreport accepted work as cancelled, including two retries that sent an inappropriate restore. The check is now limited to preparation; the post-dispatch account guard remains. These failures describe the intermediate local patch, not an additional defect in the preceding committed baseline.

Thirteen added unit cases cover exact-operation cancellation, another workspace/newer request, registration cleanup, account reset, cancellation at each retry boundary, restoration failure, supersession, accepted dispatch and idempotent cancellation metrics. The focused unit suites pass **70 tests, zero failures, 193 assertions**. The expanded browser group passes **22 cases, zero failures, 109 assertions**, including accepted/rejected Stop acknowledgements, no-Stop controls, correct restore counts, draft preservation and a fresh explicit send after Stop.

Final checks pass **158 mounted browser cases, zero failures, 938 assertions**; **1,499 frontend tests, zero failures, 8,629 assertions across 194 files**; typecheck; web build; and **all 11 platform-safety stages**, with terminal exit zero. Existing bundle-size warnings remain. Two overlapping typechecks failed on missing generated Crypto App SDK declarations while other commands were rebuilding the same clean output directory. After those commands finished, the serialized typecheck passed without source changes or type suppression. Use serialized artifact-producing checks when reproducing this gate.

```sh
bun test apps/app/tests/chat-submission-control.test.ts apps/app/tests/response-actions.test.tsx apps/app/tests/session-cancelled-approval.test.ts
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --test-name-pattern 'held at' --timeout 120000
bun test apps/app/scripts/session-route-lifetime.browser.test.ts --timeout 120000
bun test apps/app/tests
pnpm test:matterhorn-platform-safety
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
```

Evidence: `/tmp/matterhorn-retry-stop-red-2026-10-05.log` and `/tmp/matterhorn-presend-stop-red-2026-10-05.log` reproduce the five original failures. `/tmp/matterhorn-presend-stop-accepted-red-2026-10-05.log` records the six intermediate-patch failures. Final logs use `/tmp/matterhorn-presend-stop-`: `unit-2026-10-05.log`, `final-focused-2026-10-05.log`, `mounted-final-2026-10-05.log`, `app-final-2026-10-05.log`, `safety-final-2026-10-05.log`, `typecheck-serial-2026-10-05.log` and `build-final-2026-10-05.log`. `typecheck-final` and `typecheck-verified` are the failed overlapping runs, not final passes.

Impeccable hardening and Uncodixfy preserved the existing interface and made cancellation feedback explicit. One bounded capture round inspected **390px light** and **1440px dark** with reduced motion. The message wraps without clipping, the composer remains usable, and both widths pass the page-overflow assertion. Captures are `/tmp/matterhorn-presend-stop-captures-2026-10-05/stop-light-390.png` and `stop-dark-1440.png`. The capture test passes one case with seven assertions. This is not Safari, Firefox, assistive-technology, 200% zoom or hosted acceptance certification.

Existing accepted requests still require actual runtime cancellation and usage reconciliation. Requests already forwarded to the server, concurrent clients, repeated Stop acknowledgements, and workflow-status bookkeeping need separate review. Source inspection found that desk workflow staging/start runs independently of prompt preflight; the start endpoint changes persisted workflow status rather than invoking inference, but its cancellation/status behavior has not yet been exercised. No existing previews/chats, real credentials, hosted configuration, providers or wallets were changed; nothing was pushed, merged or deployed.

Next task: verify cancellation once the gateway has received a message, including Stop racing with gateway preparation, then session mutation ordering across clients. A client-side signal cannot withdraw an HTTP request already accepted by the gateway. Keep hosted release drift, guarded mode, five-desk real responses, inbox/recovery, isolation, encryption and backup restore as separate launch gates.

## Stop during gateway preparation

Following local commit `b94fb8e30c8ea93ffa7051216056fc72e75e8f07`, two isolated HTTP regressions reproduced a successful Stop followed by a 202 message acceptance. One request was waiting for agent lookup; the other was waiting for the runtime permission update. Both unchanged controls passed. The earlier browser-only cancellation correction cannot prevent this once an HTTP request reaches the gateway.

The server now tracks authenticated preparations by workspace, session and usage subject. Stop invalidates matching preparations before forwarding the runtime abort, even if that abort later fails. Messages, raw prompts, commands and compaction check this state before dispatch, with checks before replacement/authorization where applicable. Existing failure paths release undispatched reservations and discard unsent message claims; the scope registration is removed in `finally`. Manual compaction approvals now have the same cancellation scope as manual message approvals. This does not replace authentication, privacy consent or runtime permission checks.

Checks deliberately stop at the dispatch boundary. A request already sent to the runtime may have been accepted, so a later Stop must not label it unsent, free its usage hold prematurely, or remove its idempotency record. The new accepted-response cases retain acceptance and the pending usage record until ordinary reconciliation. No actual provider usage was generated in these fixtures.

### Gateway verification

- The final focused preparation matrix passes **52 cases, zero failures, 335 assertions**. It includes 40 message cases across guarded mode `off` and `enforce`, early/late preparation and accepted transport, unchanged/successful/rejected Stop, another session and unauthenticated Stop; eight alternate-route cases; and four registry lifecycle tests. Ten message cases cover encoded surrounding spaces: the cancellation scope uses the same trimmed session ID as dispatch.
- The full affected server group passes **567 tests, zero failures, 3,309 assertions across four files**. This includes the expanded manual message/compaction approval cases, legacy/session/MCP authority regressions, dispatch idempotency and usage accounting. The existing public-model message approval controls remain; compaction uses a synthetic local model.
- The focused client cancellation/retry suites pass **70 tests, zero failures, 193 assertions**. No frontend code was changed in this pass.
- The full platform safety gate passes **all 11 stages**, terminal exit zero, including the new registry unit file and normalized-session cases. Its wiring contract, final server typecheck and final server build also pass.

```sh
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
node scripts/matterhorn-platform-safety-gate.test.mjs
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-gateway-stop-`: `red2-2026-10-05.log` is the stabilized two-failure reproduction; `focused-final-2026-10-05.log` is the final 52-case pass; `server-complete-2026-10-05.log` is the 567-case pass; `client-2026-10-05.log` is the focused client pass; `safety-final-2026-10-05.log` is the final full-gate pass; and `build-verified-2026-10-05.log` records the final serial typecheck/build. The first `red` run incorrectly delayed `/provider` even though the request supplied an explicit model; the corrected fixture delays `/agent`. The first expanded run made every abort fail, including the gateway's replacement abort before the intended boundary. That fixture now fails only the explicit Stop acknowledgement. Those fixture errors are not additional product defects. Earlier `enforce`, `server-final` and `server-verified` logs cover the preceding matrix without the normalized-session cases.

The registry is per server instance and covers preparations already admitted there. It is **not** a distributed cancellation epoch, cross-process lock or atomic session revision. An old Stop arriving after a newer preparation is admitted can still target that session, and this does not retract an already-forwarded abort/revert/unrevert. Cross-instance ordering, precise Stop targeting, mutations already in flight and provider-side cancellation remain open. Raw command transport failure/accounting and authority revocation during alternate-route preparation need separate review. All new HTTP traffic, accounts, models and runtime responses are disposable/local or synthetic. No frontend redesign, fresh rendered acceptance, hosted inference, email delivery, backup restore, production configuration, push, merge or deployment is claimed.

Next review: exercise the alternate submission routes under authority revocation during preparation, then authoritative mutation/Stop ordering across clients and gateway instances. Keep the broader launch gates above open.

## Authority revocation during model preparation

Following local commit `f66dc8c08c260431c876736560df35fd9f08f11f`, a stabilized 30-case HTTP matrix reproduced **eight unauthorized dispatches**, with 22 passing controls. Hosted compaction still dispatched after sign-out or a workspace change during its later agent check. Operator-token prompts, commands and summaries still dispatched after revocation during either early or later agent lookup. Hosted ordinary messages already blocked those inference cases. Hosted users are denied raw inference routes at entry; that boundary remains unchanged.

Every preparation checkpoint now invokes the original request's existing authority check, in addition to the Stop/disconnect check. This does not reauthenticate under a different credential or replace the admitted principal. Existing rejection paths release undispatched usage reservations and clear unsent dispatch claims.

Stricter checks then reproduced four permission writes after revocation despite the first correction preventing inference: two hosted message cases and two operator prompt/command cases. The permission-profile helper now requires a current-preparation callback and invokes it after asynchronous agent lookup, before updating permissions. All three callers supply the same authority/cancellation check. These are runtime permission mutations, not evidence of a completed unauthorized tool call or wallet action.

### Authority verification

The final focused group passes **133 tests, zero failures, 1,046 assertions**. It covers guarded mode `off` and `enforce`, hosted messages/compaction, owner/collaborator raw prompts/commands/summaries, early/later lookup, sign-out, workspace changes, revocation of the requesting or an unrelated token, unchanged controls and delayed accepted responses. A unit test requires authority validation on admission and at each preparation checkpoint. Revoked preparations make no subsequent runtime mutation in the tested windows and leave no pending usage hold.

Already-dispatched requests retain their accounting state. Raw prompt/summary responses are withheld from revoked tokens without releasing the accepted request's hold. Commands acknowledge dispatch before the held runtime response, so later revocation does not rewrite that earlier acknowledgement. These synthetic delayed-response controls do not establish provider cancellation, actual billed usage or recovery after a lost command acknowledgement.

Server typecheck and build pass. The broader backend suites pass **821 tests, zero failures, 5,710 assertions across six files**. The full safety log ends with **Matterhorn platform safety gate passed**, covering all 11 stages.

```sh
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'submission authority|Every preparation' --timeout 15000
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/auth.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-submission-authority-`: `red2-2026-10-05.log` records the eight dispatch failures; `mutations-red-2026-10-05.log` records the four permission-update failures after the initial correction; `focused-final-2026-10-05.log` records the final 133-case matrix; and `build-2026-10-05.log` records the serial typecheck/build. The first `red` log contains fixture errors: raw inference is correctly unavailable to hosted accounts, and a workspace change is rejected with 403 rather than the fixture's expected 404. Those are not additional application defects. No restriction was relaxed to reach an otherwise forbidden route; raw-route tests use separately issued disposable operator tokens.

The final broader-suite and safety logs are `/tmp/matterhorn-submission-authority-backend-2026-10-05.log` and `/tmp/matterhorn-submission-authority-safety-2026-10-05.log`.

No frontend source, existing preview/chat, real provider, production account/configuration, wallet, push, merge or deployment was changed. The documentation distinguishes local gateway/auth/storage checks from hosted acceptance. Cross-instance authority propagation and mutation ordering, precise Stop targeting, raw command transport-failure accounting, privacy-preflight response lifetime and the broader launch gates remain open. Source review identified a possible workspace-alias cancellation identity mismatch; reproduce that next, then review the authoritative session mutation boundary across clients and instances. Do not infer full platform safety from this matrix.

## Workspace identity during cancellation

The preceding authority correction is committed locally as `89d3f7c4b6ddd084bddb1ec6a45c5846bfaf1ea6`. Against that baseline, twenty isolated HTTP cases reproduced **eight sends accepted after Stop**, with twelve passing controls. Preparation used the workspace ID from the route, while dispatch and Stop used the resolved workspace ID. An alias such as `rem_ws_1`, or an encoded ID with surrounding spaces, therefore missed cancellation of the same workspace. Successful and rejected upstream Stop acknowledgements both reproduced the mismatch in guarded mode `off` and `enforce`.

The shared workspace lookup now selects the canonical configured ID before registering preparation. Full path authorization and workspace preparation still run through the existing resolver inside that registration. Messages and compaction receive the resolved workspace, and a cancellation/authority check runs immediately after workspace preparation. Exact configured IDs take precedence over aliases: a genuine workspace named `rem_ws_1` remains distinct from `ws_1`.

The first local correction awaited workspace preparation before registering it. Eight added filesystem-wait cases caught four resulting Stop failures, with four unchanged controls passing. The final correction separates synchronous ID lookup from asynchronous preparation, preserving cancellation admission before filesystem waits. This was an intermediate-patch regression caught before commit, not another finding against the preceding committed baseline.

### Workspace identity verification

The final focused group passes **151 tests, zero failures, 1,261 assertions**. It covers the registry lifecycle; canonical, alias and padded workspace/session routes; Stop and rejected Stop; unauthenticated/other-session controls; already-accepted responses; messages, compaction, raw prompts, commands and summaries; distinct exact IDs beginning with `rem_`; and cancellation during workspace filesystem preparation. The identity cases verify the runtime directory, absence of subsequent runtime mutations after cancellation, release of unused holds, and successful fresh sends. All accounts, data and runtime responses are disposable local fixtures.

Server typecheck and build pass. The final broader backend run passes **919 tests, zero failures, 6,626 assertions across six files**. The final full safety gate passes **all 11 stages**, with terminal exit zero.

```sh
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'gateway preparation|gateway workspace|Every preparation|Stop |Disconnect' --timeout 15000
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/auth.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-workspace-alias-stop-`: `red2-2026-10-05.log` reproduces the eight baseline failures; `filesystem-red-2026-10-05.log` captures the four intermediate-patch failures; `focused-final-2026-10-05.log` contains the final focused matrix; and `build-final-2026-10-05.log` records typecheck/build. The first `red` attempt could not bind loopback servers in the sandbox and is not product-failure evidence. The earlier `backend` and `safety` logs passed on the intermediate patch and do not certify the final correction.

The final backend and safety logs are `/tmp/matterhorn-workspace-alias-stop-backend-final-2026-10-05.log` and `/tmp/matterhorn-workspace-alias-stop-safety-final-2026-10-05.log`. Source review also found that raw prompt/summary transport failures share the command route's unconditional usage cancellation, while reconciliation selects only pending holds. Include all three raw routes in the next lost-acknowledgement reproduction; source inspection alone does not prove billed usage was lost.

The hosted-account restriction to its assigned workspace is unchanged; an operator alias is not a new hosted access path. No frontend source, visual layout, preview, existing chat, provider account, production setting, wallet or live deployment changed. This remains a per-server preparation registry, not a distributed operation revision. Precise Stop targeting and competing mutations across clients/instances remain open. Next reproduce raw-route accounting after a lost runtime acknowledgement, then continue the cross-client mutation-ordering review. Hosted five-desk responses, signup/recovery delivery, data isolation, encryption, backup restoration and browser/device acceptance remain independent launch gates.

## Accounting after a lost runtime acknowledgement

Against local commit `3f7a4c14013567fb95d9a24297e0a8d12feccade`, a disposable HTTP proxy forwarded inference to a synthetic runtime, then closed the connection before returning its acknowledgement. Raw prompts, commands, summaries and the main compaction route all cancelled their usage holds despite the runtime accepting work. The initial matrix reproduced **eight failures and eight passing controls**, covering guarded mode `off` and `enforce`. This is local accounting evidence, not a real provider invoice or hosted reproduction.

An expanded matrix also returned HTTP 503 after acceptance and inserted an unrelated answer into the same session. It reproduced **twenty failures and twelve passing controls**: sixteen lost/503 acknowledgements freed the hold, and four normally acknowledged raw prompt/command cases charged the unrelated answer. Those routes created guarded message IDs but had not bound their accounting reservations to those IDs.

The correction binds raw prompt/command reservations to the server-generated parent ID. Transport failures and ambiguous server errors keep the reservation and schedule history reconciliation; explicit runtime 4xx rejections and failures before dispatch still release unused holds. Compaction uses the same distinction. An unknown outcome no longer marks an accepted guarded run as failed. Existing command acknowledgement timing is unchanged, and uncertain prompt/compaction responses are not reported as successful.

The first accounting correction exposed a separate transport failure: each lost-acknowledgement case reached the runtime **four times** on the local Bun 1.3.11 test runtime. Runtime mutations now set `keepalive: false`, while reads retain connection pooling. [Bun documents this option as disabling connection reuse](https://bun.com/docs/runtime/networking/fetch). The local tests then observed exactly one mutation per request, including the existing ordinary-message tests. This verifies the reproduced pooled-connection replay path; it is not an exactly-once guarantee across every proxy, client retry, provider or runtime version. Mutation connection reuse is deliberately traded for avoiding this observed replay; production latency has not been benchmarked.

### Acknowledgement accounting verification

The final focused group passes **35 tests, zero failures, 429 assertions**. The new 32-case matrix checks successful acknowledgement, lost acknowledgement, post-acceptance 503 and explicit 400 across four routes and two guarded modes. It verifies a retained 1,000-token hold while history is missing; unrelated-answer exclusion for raw prompts/commands; a partial 123-token tool step that does not prematurely settle; a final total of **473 tokens with zero pending holds**; repeated reconciliation without double charging; one runtime dispatch; and no false error receipt for uncertain accepted work. Three existing primary-message cases retain exact-parent reconciliation and idempotent retry behavior.

Server typecheck and build pass. The broader backend run passes **951 tests, zero failures, 7,014 assertions across six files**. The full safety gate passes **all 11 stages**, with terminal exit zero.

```sh
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'alternate dispatch accounting|retains accounting after a lost' --timeout 15000
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/auth.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Evidence uses `/tmp/matterhorn-alternate-dispatch-accounting-`: `red-2026-10-05.log` records the initial eight failures; `red2-2026-10-05.log` records the expanded twenty failures; `focused-2026-10-05.log` captures the eight replay failures after the accounting correction; `transport-2026-10-05.log` records the initial single-dispatch pass; `focused-final-2026-10-05.log` adds partial tool-step and guarded-receipt assertions; and `build-2026-10-05.log` records typecheck/build.

Final broader-suite and safety evidence is in `/tmp/matterhorn-alternate-dispatch-accounting-backend-2026-10-05.log` and `/tmp/matterhorn-alternate-dispatch-accounting-safety-2026-10-05.log`.

The compaction API in the pinned OpenCode SDK 1.18.31 does not accept a caller-supplied message ID. These summary cases exercise one accepted compaction per session; they do not prove exact correlation between concurrent summaries or exclude another matching answer under the existing unbound-history fallback. The follow-up below now reproduces that problem. No schema migration, real provider call, hosted acceptance, frontend redesign, preview/chat reset, production setting, push, merge or deployment occurred. All broader launch gates remain open where earlier evidence marks them unverified.

## Unbound compaction usage attribution

**Baseline reproduction; corrected locally by the gateway integration below.** Against local source commit `c0c31591463627f8ead34c5c2bd0f971f900d7ea`, disposable HTTP regressions showed the accounting store charging an unrelated 123-token result to a new compaction reservation. The hold was released before the intended compaction completed. Its later 473-token summary remained unaccounted for. This differs from the earlier lost-acknowledgement defect: here the runtime acknowledged normally and received exactly one compaction request. This section records the failing baseline, not the current test result.

The first four regressions cover a pre-existing ordinary answer on the main and trusted raw compaction routes in guarded modes `off` and `enforce`; all four fail. The expanded matrix also covers previous summaries and unrelated answers/summaries appearing after dispatch. It has **16 failures, 35 passing existing accounting controls, 541 assertions, and terminal exit 1**. The fixture marks summaries explicitly and checks both status before completion and two reads after completion. It uses synthetic runtime history, not concurrent real OpenCode requests, a real provider bill, or hosted accounts. The after-dispatch cases prove susceptibility to unrelated history; they do not certify real runtime concurrency behavior.

The cause is visible in `MatterhornModelUsageStore.reconcileUnlocked`: a reservation without `user_message_id` selects the first unused same-model result whose creation time is within five seconds before the reservation or later. Both compaction routes leave that binding unset. Bound prompts/commands have exact parent correlation, but a missing compaction binding permits the fallback to consume another result. Merely checking `summary: true` still accepts unrelated summaries; moving the timestamp cutoff does not establish ownership.

The installed SDK 1.18.31 declares the legacy summarize response as a boolean and does not expose a caller-supplied message ID. The v2 compact endpoint returns no content and is not a drop-in correlation remedy. The pinned upstream [compaction implementation](https://github.com/anomalyco/opencode/blob/014614d35b397775e5d397a490fc72368c894ec2/packages/opencode/src/session/compaction.ts) generates the parent internally and calls the compaction hook with only the session ID. The follow-up below verifies a native `chat.message` integration rather than relying on a timestamp or whichever run happens to be active at a later callback.

### Reproduction

The regressions in `apps/server/src/session-read-model.e2e.test.ts`, named `compaction accounting ignores unrelated results`, assert the required correct accounting. They failed before the correction and pass afterward; they were neither skipped nor changed to expect the bug. Passing this group alone does not certify the release candidate.

```sh
bun test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'compaction accounting ignores unrelated|alternate dispatch accounting|retains accounting after a lost'
```

Initial log: `/tmp/matterhorn-compaction-correlation-red-2026-10-05.log`. Expanded log: `/tmp/matterhorn-compaction-correlation-expanded-2026-10-05.log`. The initial run has four failures; the expanded run includes sixteen. Disposable server handles completed and fixture cleanup ran. Server typecheck and diff whitespace checks pass; typecheck output is in `/tmp/matterhorn-compaction-correlation-typecheck-2026-10-05.log`. The broader safety/build suites were not rerun because there is no implementation correction yet; their prior green results do not supersede these new failures.

### Next correction and acceptance

1. Establish a durable, one-to-one binding between the accepted compaction reservation, guarded run and actual runtime parent before billable execution. Verify the pinned runtime hook/endpoint contract before selecting the integration. Do not create a second compaction implementation that silently changes transcript or consent semantics.
2. Reject conflicting or stale bindings. Cover overlapping summaries, replaced/cancelled runs, two callers, restart, delayed callbacks and lost acknowledgements. If a binding cannot be proven, keep it unresolved with an explicit recovery path rather than charging another result or silently releasing the hold.
3. Bind result settlement to that identity; prove exactly 473 tokens settled once and zero remaining hold for the intended completion. Add mismatched workspace/session/provider/model controls and preserve 4xx rejection and pre-dispatch cancellation behavior.
4. Prove the integration with the pinned real runtime and a disposable local provider fixture, then run backend regressions, typecheck/build and the full safety gate. Hosted real-provider acceptance remains separate.

At the reproduction stage there was no source correction or committed regression change. The gateway integration below supplies the local correction; it does not establish a production deployment or full QA completion.

## Native compaction binding foundation

This section records the initial binding foundation against `c0c31591463627f8ead34c5c2bd0f971f900d7ea`. At that stage, both gateway routes still used legacy summarize and the sixteen regressions still failed. The subsequent gateway integration below supersedes that implementation status; the foundation evidence remains useful but was not complete accounting acceptance.

The pinned upstream [message preparation code](https://github.com/anomalyco/opencode/blob/014614d35b397775e5d397a490fc72368c894ec2/packages/opencode/src/session/prompt.ts) runs `chat.message` before saving the user message and parts. Its normal loop processes a compaction part through the native compaction engine. An isolated test of OpenCode 1.18.31 verified this with the actual Matterhorn plugin: it preserves a supplied parent ID, converts the marker in place, produces one native summary, retains the original agent and history, and does not send the marker/run identifier to the provider. The synthetic streaming provider reports 300 input and 173 output tokens. Health/version is checked against repository constants. A fixture assertion initially needed correction for macOS `/var` versus canonical `/private/var`; the final probe passes.

The local implementation adds:

- `opencode-compaction-request.ts`: an ignored synthetic marker for the trusted message hook. The marker is not authority.
- `MatterhornGuardedAgentRuntime.claimRuntimeCompactionMessage`: verifies runtime authentication, exact sealed user binding, active run and scope, compaction purpose, provider/model, expiry and workspace deletion in a database transaction. It persists a one-use claim to reject replay. Claims are removed with run/workspace cleanup.
- `/internal/agent-runs/claim-compaction`: an authenticated internal claim endpoint with no-store responses.
- Managed `chat.message` hook: validates the complete marker shape, obtains the exact claim acknowledgement and mutates the existing parts array to a native `compaction` part with `auto: false`. Rejection never falls back to an ordinary prompt, including when guarded tools are off.

The focused suites pass **76 tests, zero failures, 405 assertions**. They cover exact/mismatched claims, missing bindings, ordinary-message purpose, replay, replaced runs, an instance without restored provider consent context, workspace deletion, marker tampering, denied or mismatched acknowledgements, and existing guarded-runtime/plugin controls. The native probe uses a synthetic control endpoint; it does **not** prove the new HTTP claim route and gateway together. The claim implementation is exercised separately in runtime unit tests. Initial unprivileged execution of an existing redirect test could not bind a local port; the final permitted loopback run passes.

```sh
MATTERHORN_TEST_OPENCODE_BIN=/path/to/pinned/opencode bun test apps/server/src/opencode-compaction-contract.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/opencode-plugins/matterhorn-guard.test.ts
pnpm --filter matterhorn-work-server typecheck
```

The native probe is explicitly skipped without `MATTERHORN_TEST_OPENCODE_BIN`; that skip is not acceptance. The binary used here was `/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode`, with a fresh workspace, XDG/config/state directories, synthetic credentials and child process. Existing engine processes/chats were not reused. Temporary fixture resources were closed and removed.

Evidence: `/tmp/matterhorn-compaction-native-contract-2026-10-05.log` records the initial 14-assertion native hook experiment. `/tmp/matterhorn-compaction-binding-contract-tests-2026-10-05.log` records the final actual-plugin/runtime-unit run. Server typecheck and build exit zero in `/tmp/matterhorn-compaction-binding-typecheck-2026-10-05.log` and `/tmp/matterhorn-compaction-binding-build-2026-10-05.log`. A post-foundation accounting rerun still has **16 failures and 35 passes**, with terminal exit 1 in `/tmp/matterhorn-compaction-correlation-foundation-2026-10-05.log`, confirming that the untouched gateway wiring remains the immediate blocker. Diff whitespace checks pass; the full safety suite has not been rerun for this incomplete implementation.

### Gateway integration requirements

1. Generate the compaction parent ID at gateway admission and immediately bind its usage reservation; bind the same ID to the accepted guarded run before dispatch. Use both the main `/compact` and trusted raw `/summarize` entry points.
2. Dispatch the marker through the supported synchronous message endpoint with that ID and the prior user agent, preserving model resolution, transcript revalidation, consent and Stop checks. Keep the public API response contract. Do not send a second compaction request or fall back to legacy summarize on failure.
3. Preserve holds on lost/ambiguous dispatch acknowledgements, release them only for proven pre-dispatch rejection, and settle through exact parent history. Review completion/error receipts against the actual native response rather than assuming HTTP success means inference success.
4. Update the HTTP fixture to distinguish native compaction POSTs from history GETs and to return/use the supplied parent ID. Keep all sixteen unrelated-history regressions and thirty-five controls. Add claim-route authentication/scoping, replacement, delayed claim, restart and lost-acknowledgement coverage.
5. Run the complete gateway plus actual plugin plus pinned runtime with a local provider, then rerun broader backend, typecheck/build and all safety stages. Add the message hook to required runtime compatibility contracts when gateway dispatch depends on it. Do not claim the partial foundation makes the release ready.

No commit, push, merge, deployment, runtime fork, real provider request, production setting, or existing chat change occurred. The full QA and hosted launch gates remain open.

## Compaction gateway integration

Both the main `/compact` route and trusted raw `/summarize` now dispatch native compaction through an explicitly identified synchronous runtime message. The usage store inserts the parent ID in the same transaction as the reservation, eliminating an insert-then-bind interval visible to another instance. The gateway binds that parent to the accepted guarded run before sending the marker. The prior user agent, chosen model, exact transcript consent, approval and cancellation checks remain in place. The public compact response remains HTTP 202; trusted summarize still returns a boolean. There is no legacy summarize fallback.

Successful HTTP status alone no longer completes the guarded receipt. The reply must identify the expected parent, session, provider and model, be an assistant summary, and carry a completed stop result without an error. Mismatched, incomplete, malformed or empty replies preserve uncertain accounting for history reconciliation. Explicit 4xx rejection and cancellation before dispatch still release unused holds. The compatibility manifest now requires `chat.message` and `experimental.session.compacting` alongside the existing privacy and tool hooks.

The initial focused accounting run passes all **51 cases**, including all sixteen unrelated-history regressions and the thirty-five existing accounting controls. A 52-case response-validation matrix covers both routes in guarded modes off/enforce, unchanged success, wrong parent/session/provider/model, ordinary answers, errors, unfinished results, missing identifiers/timestamps, booleans, empty responses and malformed JSON. The expanded run exposed malformed JSON returning a generic 500 from the SDK path; it now returns an explicit 502 without releasing the hold. Earlier full-suite fixture failures incorrectly counted history GETs as compaction POSTs or rejected ordinary synchronous messages; those fixtures were corrected without relaxing product assertions.

The real-runtime probe now includes the actual gateway and internal claim route, not only a synthetic control endpoint. Both routes pass against isolated OpenCode **1.18.31**, the actual managed plugin, enforced final-message/system privacy hooks and a synthetic loopback provider. Each makes exactly one provider call, retains the original agent and native transcript structure, records **300 input + 173 output = 473 tokens** once, releases the reservation and produces a success receipt. Repeated usage reads remain stable. The direct plugin contract remains a third control. The initial combined fixture used a too-short synthetic runtime credential and was correctly rejected; the fixture was corrected, not the authentication requirement.

Final combined contract/runtime/accounting suites pass **113 tests, 637 assertions**, including a database-trigger test that rejects any unbound compaction insertion and an independent store instance that ignores unrelated history before settling the bound 473-token result. The final broader backend run passes **1,020 tests, zero failures, 7,488 assertions across six files**. Its log is `/tmp/matterhorn-compaction-gateway-backend-final-2026-10-05.log`. The preceding 1,019-case run lacked the final atomic-insertion regression.

Final server typecheck and build pass, and the full platform safety gate passes **all 11 stages with terminal exit zero**. They ran serially against the final source; logs are `/tmp/matterhorn-compaction-gateway-build-final-2026-10-05.log` and `/tmp/matterhorn-compaction-gateway-safety-final-2026-10-05.log`. The gate includes offline desk, billing, privacy, memory, perimeter and product-readiness contracts, not hosted acceptance. Diff whitespace checks pass. The documentation skill was used to preserve these evidence distinctions in the report and release handoff.

```sh
MATTERHORN_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode bun test apps/server/src/opencode-compaction-contract.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/opencode-plugins/matterhorn-guard.test.ts apps/server/src/model-usage-store.test.ts
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/auth.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
```

Evidence: `/tmp/matterhorn-compaction-gateway-focused-2026-10-05.log` records the first 51-case pass; `gateway-expanded` records the two malformed-JSON failures; `gateway-backend` records the preceding 1,019-case pass. `/tmp/matterhorn-compaction-gateway-native-full2-2026-10-05.log` records the three native probes with 60 assertions. `/tmp/matterhorn-compaction-gateway-contract-final-2026-10-05.log` records the 113-case combined pass. A final fixture refinement lets OpenCode generate the seed message ID, rather than preselecting an ID that might conceal ordering problems; all 113 cases still pass with 637 assertions in `/tmp/matterhorn-compaction-gateway-native-order-2026-10-05.log`. The other abbreviated log names share the `/tmp/matterhorn-compaction-` prefix and `-2026-10-05.log` suffix.

Deployment requires the matching server and managed runtime plugin, followed by a runtime restart that preserves existing workspace data. Do not deploy the gateway alone against an old plugin. Existing legacy unbound reservations and historical undercharges are not repaired by this change; review them separately rather than guessing ownership or releasing holds. No schema migration, production deployment or real provider invoice acceptance occurred.

Next review: delay native execution after the claim but before provider-context release, then exercise replacement/Stop from another client, restart and lost acknowledgement. This turn does not prove cross-instance cancellation or atomic mutation ordering, raw-client retry idempotency, provider-side cancellation, or a rendered chat summarization journey. Hosted five-desk responses, inbox flows, isolation, backup restoration, encryption and cross-browser accessibility remain independent open launch gates. Existing previews/chats and production configuration are untouched.

## Delayed runtime authorization

Following local compaction accounting commit `d797bd308cdde5840fbf451e08707babbf4338d3`, the actual gateway, managed plugin and isolated pinned OpenCode 1.18.31 reproduce a new authorization race. The fixture pauses request A at `/internal/agent-runs/provider-messages` after its compaction claim succeeds, starts replacement B in the same session, pauses B's claim, then releases A's validation request. Both `/compact` and trusted raw `/summarize` return HTTP 200 for that validation under B's run ID instead of rejecting A. A's public request subsequently fails. This demonstrates cross-run validation, not an extra provider inference, completed unauthorized action or data leak.

The pinned [compaction implementation](https://github.com/anomalyco/opencode/blob/014614d35b397775e5d397a490fc72368c894ec2/packages/opencode/src/session/compaction.ts) removes the current compaction parent from the history passed to `experimental.chat.messages.transform`; the preceding compacting hook supplies only a session ID. Consequently, selecting the last user message in that history cannot identify the current summary request. The [provider preparation code](https://github.com/anomalyco/opencode/blob/014614d35b397775e5d397a490fc72368c894ec2/packages/opencode/src/session/llm/request.ts) exposes the exact user message to `chat.params` only after system context and provider messages have been assembled. A session-only claim map or a late model check is not yet a proven correction for the complete chain.

### System context correction

A second reproduction showed a stale system-context request consuming a replacement run's one-use message validation. Two runtime unit tests failed, for ordinary messages and compaction. The internal system route and runtime method now require `expectedRunId`; they reject a different active run before releasing or consuming its context. The plugin supplies the run ID captured by its message validation, requires an unexpired snapshot even on the first attempt, and retains the returned-run and content-hash checks. The internal route authenticates before parsing its bounded body. Missing or malformed run IDs fail closed, rather than silently reverting to session-only lookup.

Actual-runtime tests pause A at the system endpoint, allow B to claim and validate its messages, pause B's system request, then release A. Both routes now reject A with HTTP 409 while B completes with exactly **one provider call, 473 tokens recorded once, zero pending holds and one successful receipt**. These tests use a synthetic local streaming provider and disposable data. No real provider or hosted user acceptance is implied.

A further plugin regression showed a compaction retry changing its purpose to `message`, because the session marker was consumed on the first system hook. Purpose now stays in the bounded validated snapshot, and pending compaction markers are scoped to the plugin instance. Both actual-runtime routes recover from one synthetic HTTP 429 followed by a successful summary, make exactly two provider HTTP attempts, settle 473 tokens once and leave no hold. This does not prove actual ASI1 Mini capacity or throttling behavior.

The final combined matrix runs all nine native cases, runtime and plugin controls, and accounting tests: **122 pass, two fail, 792 assertions, terminal exit 1**. The two failures remain the message-validation race described above; they are neither skipped nor changed to expect unsafe behavior. The initial system-boundary pair passes independently with **47 assertions**, with final coverage additionally checking stale request identity and exact terminal receipt ownership. The native rate-limit pair passes independently with **45 assertions**. The broader backend suite passes **1,020 tests, zero failures and 7,497 assertions across six files**, including malformed/missing system run IDs, stale-run rejection, authentication before body parsing and successful release after those rejections. Final server typecheck, build and all **11 platform safety stages pass with terminal exit zero**, run serially after the retry-purpose correction. That gate does not run the opt-in native matrix and does not override its two failures or establish hosted acceptance. Diff whitespace checks pass. The documentation skill was used to keep the QA report, security description and deployment handoff explicit about these limits.

```sh
MATTERHORN_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode bun test apps/server/src/opencode-compaction-contract.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/opencode-plugins/matterhorn-guard.test.ts apps/server/src/model-usage-store.test.ts
bun test apps/server/src/session-preparation.test.ts apps/server/src/session-read-model.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/token-authority.e2e.test.ts apps/server/src/auth.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
```

Logs: `/tmp/matterhorn-compaction-replacement-red-2026-10-05.log` records the original two native failures; `/tmp/matterhorn-compaction-replacement-diagnostic-2026-10-05.log` captures the mismatched run IDs. `/tmp/matterhorn-system-release-identity-red-2026-10-05.log` records both system-release unit failures before correction. `/tmp/matterhorn-system-release-identity-native-2026-10-05.log` records the passing system-boundary pair; `/tmp/matterhorn-system-release-identity-full-2026-10-05.log` records the full 119-pass/two-failure result. Native fixture timers are cleared, pending HTTP requests are observed and settled during cleanup, and all disposable processes are closed.

Final combined evidence is `/tmp/matterhorn-system-release-and-retry-final-2026-10-05.log`; backend evidence is `/tmp/matterhorn-system-release-identity-backend-2026-10-05.log`. `/tmp/matterhorn-compaction-retry-purpose-red-2026-10-05.log` records the failed retry-purpose assertion before correction, and `/tmp/matterhorn-compaction-retry-purpose-native-2026-10-05.log` records both native retry passes.

The final typecheck/build/safety sequence ran as `pnpm --filter matterhorn-work-server typecheck && pnpm --filter matterhorn-work-server build && pnpm test:matterhorn-platform-safety` and completed with exit zero in the task terminal. `/tmp/matterhorn-system-release-identity-safety-2026-10-05.log` records the earlier passing gate, not that final sequence; the final sequence was rerun after the retry-purpose edit rather than relying on the earlier output.

Do not deploy this work as a completed authorization fix. The next task is exact request-identity propagation through initial message validation, system release and provider dispatch, with delayed/reordered claims, replacement, Stop, restart and retry controls. Any runtime contract change needs pinned artifacts and native acceptance; using whichever run is currently active is not sufficient. Matching server/plugin deployment remains mandatory because the system endpoint now rejects old plugins that omit the run ID. Historical unbound accounting, broader QA and hosted launch gates remain open.
