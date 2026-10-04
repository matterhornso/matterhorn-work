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

Next review the local-workspace mutation routes and remaining buffered read endpoints after asynchronous waits, and verify size enforcement for the raw runtime proxy's buffered request bodies. These are review targets, not confirmed defects. Registration of a request check alone does not prove that every route invokes it at the right boundary. Token checks use the active server's committed in-process state; cross-process token-file edits and independently cached server instances are not covered. Idle upstream streams without another chunk or heartbeat have no new immediate-revocation guarantee. Billing seat allocation concurrency is separate from this authorization correction.

Continue mounted intermediate-wait UI recovery testing and complete browser/accessibility coverage. Hosted five-desk real responses, live read-only tools, optional Jev, accounting/cancellation, controlled-account isolation, email/recovery, memory/notes/deletion/logout and production encryption/backup restore still require acceptance evidence. Historical hosted version and policy findings in the previous report must be rechecked, not treated as current observations. Keep STM off and restricted Polymarket actions unavailable until their actual policy review is completed. Obtain and review the final candidate before any deployment decision.
