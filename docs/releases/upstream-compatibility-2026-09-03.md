# Upstream compatibility intake — 2026-09-03

Status: candidate; release only after the full Matterhorn safety and hosted acceptance gates pass.

Matterhorn reviewed the current stable [OpenWork v0.18.42](https://github.com/different-ai/openwork/releases/tag/v0.18.42) and [OpenCode v1.18.27](https://github.com/anomalyco/opencode/releases/tag/v1.18.27). This remains a compatibility port rather than an upstream merge. Matterhorn's hosted tenant boundary, authoritative privacy gateway, guarded capabilities, certified Crypto App Gateway, and connected-wallet-only transaction airlock remain authoritative.

## Reviewed baselines

| Project | Previous baseline | Reviewed stable release | Reviewed tag commit |
| --- | --- | --- | --- |
| OpenWork | `v0.18.35` | `v0.18.42` | `1785d362d304ffab5d8ee5db9963335f5076ad2f` |
| OpenCode | `v1.18.23` | `v1.18.27` | `4b7e19e315cca414121ba1d61523fef74bb3ae8b` |

The OpenWork range is broad and intersects Matterhorn-owned authentication, session, MCP, provider, and UI code. Importing it wholesale would weaken reviewability and could overwrite the product's privacy and wallet boundaries. Relevant behavior is therefore accepted only when an existing Matterhorn contract or a new focused regression proves the same outcome under Matterhorn's stricter policy.

## Adopted in this candidate

- OpenCode runtime, every `@opencode-ai/sdk` consumer, and the generated first-party plugin dependency move together to `1.18.27`.
- Public-beta binaries remain release-asset and SHA-256 pinned for macOS arm64/x64 and Linux arm64/x64. Hashes come from the GitHub release asset digests.
- OpenCode's five-minute provider-header and streamed-chunk defaults reduce false timeouts during slow model startup.
- OpenCode now catches rejected SSE reader cancellation, reducing unhandled failures when a stream times out or is aborted.
- Session permission updates now use the typed SDK contract; the compatibility suite verifies the exact permission body before the managed runtime receives it.
- Matterhorn retains its own bounded request timeout and untimed, caller-cancelled event-stream contract.
- Matterhorn's existing one-active-run, terminal-error reconciliation, admission-aware queue drain, bounded session hydration, coalesced session loads, and isolated provider synchronization cover the relevant OpenWork `v0.18.40`–`v0.18.42` behavior.

## Reviewed but intentionally not merged

- Portable global Agent Plugins and broad dashboard/plugin access. Hosted accounts receive only the curated, tenant-scoped tool and Crypto App catalog; global configuration and plugin access remain denied.
- OpenWork cloud credential binding and provider storage. Matterhorn resolves provider credentials server-side and applies privacy preflight before provider contact.
- Den/cloud access, remote-session dispatch, enterprise packaging, updater, licensing, and product-identity changes. These do not replace Matterhorn's public-beta topology or account boundary.
- Broad composer, session-shell, dashboard, Library, navigation, and artifact UI changes. Matterhorn keeps its jargon-free coworker flow and validates it independently.
- OpenCode v2 configuration compatibility and Azure authentication. Matterhorn's managed runtime configuration is one-way, deny-by-default, and intentionally narrower.
- Any OpenCode provider option that could weaken Matterhorn's provider disclosure, privacy classification, usage reservation, or model-policy enforcement.

## Required verification

- install dependencies from the exact lockfile;
- download the pinned OpenCode binary and verify its release digest;
- boot the managed runtime and prove exact health/version plus deny-by-default permissions;
- run app/server typechecks, the full platform safety gate, dependency/secret scans, and the public-beta container build;
- repeat authenticated model, privacy, Memory, tenant-isolation, MCP, wallet-airlock, and crypto-coworker acceptance;
- keep gateway, coworker, guarded runtime, public signup, and all mainnet write modes unchanged and fail-closed.

Production remains on the prior release until this candidate is explicitly approved, merged, deployed by exact commit, and passes hosted acceptance.
