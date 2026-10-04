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

The composer still uses an 8 MiB attachment limit, while canonical backend attachment inspection allows 5,000,000 bytes. Review and align that user-facing contract and verify rendered failure/draft recovery; this backend change does not claim to fix it. Workspace `file://` attachments also call `readFile` before their decoded-size check; review bounded file reads and path handling separately. Aggregate upload limits do not certify total process memory under concurrent requests, gateway/proxy timeout settings, slow-client protection, or every binary/file endpoint. All existing hosted launch gates above remain open. No push, merge, deployment, real provider request or existing preview/chat change occurred.
