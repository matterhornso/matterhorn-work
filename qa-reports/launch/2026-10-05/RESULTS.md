# Matterhorn launch QA 5 October 2026

This report continues the [4 October QA record](../2026-10-04/RESULTS.md) for the release team. The starting local commit was `59ea3aab741678afd7537e72941703d79a02f2d9` on `codex/search-discovery-2026-10-02`. The work below fixes reproduced authorization defects; it does not establish hosted launch readiness. No production configuration, real provider, existing preview/chat, push, merge or deployment was changed.

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
