# OpenCode 1.18.31 compatibility candidate

Not deployed. This upgrade is a separate commit from the workspace UI fixes.

## Source

- [OpenCode v1.18.31](https://github.com/anomalyco/opencode/releases/tag/v1.18.31), published 2026-09-14; tag commit `014614d35b397775e5d397a490fc72368c894ec2`.
- Previous runtime/SDK: 1.18.30.
- All five SDK consumers, the generated plugin dependency, constants, Docker defaults and lockfile move together to 1.18.31.
- The four supported release-asset digests are pinned from GitHub release metadata. The macOS arm64 archive was downloaded, checksum-verified and booted in a temporary directory. The other three platform binaries have not been executed locally.
- The upstream compaction prompt is unchanged, checked against the tagged source. Existing prompt identifiers remain stable for callers.

## Review scope

The upstream comparison includes ACP session-option restoration, reasoning boundaries, explicit remote-config authentication errors and Copilot adaptive-thinking changes. No changes to the SDK source or required guard-hook interfaces appeared in the comparison; SDK and plugin package versions changed. The runtime's provider dependencies also change, so hosted model acceptance remains required.

Matterhorn retains authoritative privacy admission, exact-model Venice verification, quota reservation, deny-by-default tools, workspace isolation and user-controlled wallet signing. No feature mode, signup flag, provider credential or production deployment is changed by this commit.

## OpenWork is a separate pending intake

[OpenWork v0.18.47](https://github.com/different-ai/openwork/releases/tag/v0.18.47), published 2026-09-15, resolves to `65c4286a9006297b0c10b9bf1324fa7c00c422a8`.

The comparison from the currently adopted 0.18.44 baseline reports 280 commits and reaches GitHub's 300-file comparison limit. It is not a complete review. **The OpenWork compatibility baseline remains 0.18.44.** Do not relabel it 0.18.47 without completing a full local diff and selective ports.

Review these areas in separate changes: session/navigation continuity; MCP discovery and OAuth maintenance; read-only MCP App execution and explicit action approval; provider synchronization; Cloud/account behavior. Reject or adapt paths that bypass Matterhorn's authoritative gateway. An upstream Den deployment is not a substitute for Matterhorn's hosted account service.

## Release acceptance

Local results: 1,119 app tests passed; app, server, desktop, router and orchestrator typechecks passed; web and server builds passed; the isolated 1.18.31 boot/health compatibility check and complete platform safety gate passed. This does not certify hosted inference or Linux wallet/runtime behavior.

Run with the checksum-verified 1.18.31 executable first on PATH:

```sh
pnpm install --frozen-lockfile
pnpm test:opencode-runtime-compatibility
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app test:composer-browser
pnpm --filter @matterhorn-work/app typecheck
pnpm --dir apps/server typecheck
pnpm --dir apps/desktop typecheck:electron
pnpm --dir apps/opencode-router typecheck
pnpm --dir apps/orchestrator typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm --dir apps/server build
pnpm test:matterhorn-platform-safety
```

Use repository-pinned pnpm 10.27.0. Local dependency installation used `--ignore-scripts`; the frozen install passed. Local build scripts were run explicitly. Production still needs a clean Linux image build, exact frontend/backend commit matching, one real reply on every desk, Memory consent/context verification, and two-account isolation. Existing asset-size warnings do not constitute hosted performance acceptance.
