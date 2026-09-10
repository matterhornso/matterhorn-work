# OpenWork 0.18.46 compatibility review

Reviewed: 2026-09-11  
Previous baseline: `v0.18.44` (`cac94b079906b9ef45788dfaa07444524976a6a0`)  
Reviewed baseline: `v0.18.46` (`a0d6bd1de8debf4f09d22b8538e124b2ff45b339`)  
Integration strategy: compatibility port, not an upstream merge

Matterhorn is an OpenWork fork with a different hosted security boundary. The
review below records each runtime-relevant patch release change and prevents a
version bump from silently widening Matterhorn's browser, provider, tool, or
wallet authority.

## Adopted or already equivalent

| Upstream change | Matterhorn disposition |
| --- | --- |
| Recovery screen for render crashes | Already equivalent. `AppErrorBoundary` and `SurfaceErrorBoundary` keep the rest of the app running, reset on navigation, and do not render raw error or component-stack content. |
| Whole transcript and cached hydration reliability | Already equivalent. Session hydration is bounded and cached, while scoped live deltas are merged without replacing newer progress. |
| Newly submitted and streaming message visibility | Already equivalent. Session sync coalesces live deltas and preserves current progress while background hydration completes. |
| Bound workspace background work and retained output | Already equivalent. Managed OpenCode output is bounded and provider/session synchronization has explicit admission and coalescing limits. |
| Responsive reading and attachment feedback | Already covered by Matterhorn's responsive/accessibility and composer continuity contracts. |

## Intentionally not ported

| Upstream change | Reason |
| --- | --- |
| Google Workspace consolidation on OpenWork Cloud Connect | Matterhorn keeps account-facing connectors behind its own workspace and hosted-account boundary. This change cannot replace Matterhorn tenant authorization. |
| Managed desktop policy plugin unregister fix | Matterhorn does not register or inject OpenWork's managed-policy plugin. The server-authoritative privacy gateway, capability broker, guarded plugin, and wallet airlock remain the enforcement boundary. |
| Enterprise updater activation guard | The public-beta web deployment does not expose the enterprise desktop updater. Existing Matterhorn desktop release controls remain independently gated. |
| Compose evaluation image pin | Evaluation/release infrastructure only; it does not change the Matterhorn runtime or public web image. |
| Native browser context menus and published-desktop launch changes | Desktop-only UX outside the public-beta web candidate. |
| OpenWork executor/model preference change | Matterhorn retains user model choice plus server-enforced provider privacy, quota, and exact-request authorization. |

## Preserved Matterhorn boundaries

- Browser clients cannot call raw provider prompt, shell, global configuration,
  permission-reply, plugin, or skill routes.
- Provider-bound prompt and system bytes are classified and hash-bound by the
  server before dispatch.
- The OpenCode model may plan and request a tool, but only the Matterhorn server
  can issue a short-lived exact-argument capability.
- Agents, MCP clients, CLIs, and server automation cannot sign, relay, or submit
  transactions. The connected wallet reviews and submits exact v2 handoffs.
- Managed runtime configuration has no OpenWork managed-policy plugin or
  `OPENWORK_POLICY_TOKEN` registration to become stale.

## Verification

Run:

```sh
pnpm test:opencode-runtime-compatibility
pnpm test:upstream-openwork-sync
pnpm test:agent-control-coverage-matrix
pnpm test:matterhorn-platform-safety
```

The compatibility baseline may advance only when this review, `constants.json`,
and `upstream-compatibility.json` agree on the exact tag and commit.
