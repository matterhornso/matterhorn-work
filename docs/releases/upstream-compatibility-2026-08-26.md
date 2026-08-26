# Upstream compatibility intake — 2026-08-26

Matterhorn reviewed the current stable OpenWork and OpenCode releases before changing the runtime. This is a compatibility port, not an upstream merge: Matterhorn's hosted tenant boundary, authoritative message/privacy gateway, guarded capabilities, crypto action registry, and wallet-controlled transaction airlock remain the product and security boundary.

## Reviewed baselines

| Project | Previous baseline | Reviewed stable release | Reviewed commit |
| --- | --- | --- | --- |
| OpenWork | `v0.18.23` | `v0.18.35` | `13504969eeafb4657e555b52e49587c6a7d21072` |
| OpenCode | `v1.18.18` | `v1.18.23` | `ef2880f379129aa048be9e9353e30aa168d42c17` |

The OpenWork range contains 175 commits and changes 316 files. A direct merge would overwrite Matterhorn-specific authentication, workspace isolation, privacy, MCP, crypto, and deployment behavior, so each relevant contract was reviewed and ported independently.

## Adopted in this candidate

- OpenCode runtime and all `@opencode-ai/sdk` consumers move together to `1.18.23`.
- The public-beta image downloads only a checksum-pinned OpenCode release asset.
- Managed OpenCode shutdown is idempotent and bounded: graceful termination is attempted before forced termination.
- Matterhorn and legacy OpenWork credential-encryption keys are removed from the managed model-engine environment.
- Desktop workspace archive imports reject oversized archives, excessive entry counts, oversized entries, and excessive expanded data before extraction.
- Invalid skill/command YAML remains visible to callers, while valid scalar or array frontmatter is treated as empty metadata.
- Matterhorn's existing managed-engine health recovery, bounded diagnostics, one-active-run behavior, tenant-scoped MCP surface, and guarded runtime are retained.

## Reviewed but intentionally not merged

- OpenWork's full engine-pool rewrite: Matterhorn already supervises the managed engine and has different hosted runtime ownership and readiness requirements.
- OpenWork MCP Apps and Library UI: Matterhorn exposes a curated, workspace-scoped managed MCP catalog; upstream global/plugin access is incompatible with the hosted execution boundary.
- OpenWork workspace initialization/configuration rewrite: Matterhorn provisions crypto desk agents and applies tenant/privacy policies that the upstream initializer does not understand.
- Broad composer and navigation changes: Matterhorn has a separate guided crypto onboarding and one-active-run queue; these remain covered by app acceptance tests.
- Provider credential storage changes: Matterhorn's server-side provider configuration and privacy preflight remain authoritative.

## OpenCode release impact

The reviewed OpenCode releases add recovery for transient provider/network failures, unknown completion reasons, OpenAI-compatible verbosity handling, Cloudflare AI Gateway routing fixes, Bedrock fixes, and parent-session propagation fixes. These are consumed through the paired runtime/SDK upgrade. Matterhorn's own provider privacy disclosure, model allowance, request hashing, run binding, and wallet rules continue to run before OpenCode dispatch.

## Required verification

This compatibility candidate is not releasable until all of the following pass:

- pinned OpenCode binary boot and health/version smoke;
- upstream compatibility, security, typecheck, server, app, and bundle gates;
- authenticated account, model completion, privacy, Memory, tenant-isolation, managed MCP, and wallet-handoff acceptance;
- public-beta container/readiness smoke with guarded mode off and signup paused.

Production must remain on the prior release until those checks pass and the upgrade PR is explicitly approved.
