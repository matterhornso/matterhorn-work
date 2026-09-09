# Upstream compatibility intake — 2026-09-09

Status: candidate; release only after the full Matterhorn safety and hosted acceptance gates pass.

Matterhorn reviewed [OpenWork v0.18.44](https://github.com/different-ai/openwork/releases/tag/v0.18.44) and [OpenCode v1.18.30](https://github.com/anomalyco/opencode/releases/tag/v1.18.30). OpenWork remains a selective compatibility port rather than a source merge. Matterhorn's hosted tenant boundary, authoritative privacy gateway, guarded capabilities, certified Crypto App Gateway, quota reservation, and connected-wallet-only transaction airlock remain authoritative.

## Reviewed baselines

| Project | Previous baseline | Reviewed stable release | Reviewed tag commit |
| --- | --- | --- | --- |
| OpenWork | `v0.18.42` | `v0.18.44` | `cac94b079906b9ef45788dfaa07444524976a6a0` |
| OpenCode | `v1.18.27` | `v1.18.30` | `3104c1428ec91f809e5ab86631300de41eb6952e` |

## Adopted in this candidate

- OpenCode runtime, every `@opencode-ai/sdk` consumer, and the generated first-party plugin dependency move together to `1.18.30`.
- Public-beta binaries remain release-asset and SHA-256 pinned for macOS arm64/x64 and Linux arm64/x64 using the GitHub release digests.
- The existing guarded plugin hooks remain present and the managed runtime remains deny-by-default.
- Existing Matterhorn session contracts cover OpenWork's live-progress restore, composer-draft persistence, instant-send visibility, and isolated MCP callback-mode integrity fixes.
- The legacy embedded connection-app launch path is not reintroduced. Matterhorn keeps the managed, authenticated MCP boundary.
- CUDOS model discovery now reads the authenticated OpenAI-compatible `/models` catalog at managed-runtime startup, validates and bounds it, and falls back to the reviewed seven-model catalog when discovery is unavailable.

## Reviewed but intentionally not merged

- OpenWork's OpenCode v2 engine lane, Den/cloud topology, Computer Use, browser login synchronization, organization access, licensing, dashboards, workflow apps, global plugins, analytics, onboarding, updater, and product-identity changes.
- Broad session-shell, navigation, Library, artifact, Memory, and settings changes. Matterhorn preserves its simpler crypto coworker and private-chat product surface.
- Any provider, tool, permission, shell, command, browser, connector, or remote-session path that bypasses Matterhorn privacy preflight, usage reservation, capability enforcement, tenant isolation, or wallet review.
- New OpenCode provider behavior beyond the synchronized runtime/SDK upgrade until it passes the same privacy, quota, and guarded-tool acceptance suite.

## Required verification

- install dependencies and lock `@opencode-ai/sdk@1.18.30` everywhere;
- verify all four OpenCode release assets against their recorded SHA-256 digests;
- boot the pinned runtime and verify exact version, health, plugin hooks, and deny-by-default permissions;
- run CUDOS catalog fallback/provider parsing tests, app/server typechecks, production builds, the full platform safety gate, and dependency/secret scans;
- repeat hosted model, privacy, Memory, tenant-isolation, MCP, wallet-airlock, and crypto-coworker acceptance before deployment.

Production remains on the prior release until this candidate is explicitly approved, merged, deployed by exact commit, and passes hosted acceptance.
