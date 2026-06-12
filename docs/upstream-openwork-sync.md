# Upstream OpenWork Sync Playbook

Matterhorn Work can keep absorbing upstream OpenWork runtime, desktop, dependency, and server improvements while preserving Matterhorn-specific product decisions. Upstream syncs must be explicit, reviewed, and tested. They should never bypass the rename, compatibility, Bittensor, or agent-control safety gates.

Default upstream source:

```bash
OPENWORK_UPSTREAM_REMOTE=https://github.com/different-ai/openwork.git
OPENWORK_UPSTREAM_BRANCH=main
MATTERHORN_WORK_BASE_BRANCH=dev
```

The upstream URL and branch are configurable because the source repository or branch can change. Do not hard-code credentials in remotes, scripts, docs, examples, MCP schemas, or CI variables.

## Where This Fits

This is a foundation lane in the broader Matterhorn Work plan:

1. **Runtime continuity:** bring in upstream OpenWork fixes for the desktop shell, OpenCode runtime integration, router, packaging, and dependency health.
2. **Compatibility continuity:** preserve `MATTERHORN_WORK_*` names while keeping legacy `OPENWORK_*` fallbacks, protocol aliases, headers, storage migrations, and command shims.
3. **Product continuity:** protect Matterhorn-specific Bittensor, agent-control, CLI, MCP, browser-control, and future crypto workflows from upstream regressions.
4. **Review continuity:** land upstream updates as normal Matterhorn Work PRs with clear conflict notes and targeted verification.

## Sync Cadence

Run the intake check:

- weekly during active development.
- when upstream OpenWork publishes a release.
- before a Matterhorn Work desktop alpha if the last upstream check is stale.
- when a dependency, Electron, router, or OpenCode integration bug may already be fixed upstream.

## Intake Check

Use the deterministic local checker first:

```bash
pnpm upstream:openwork:check
pnpm upstream:openwork:check -- --json
```

Agent-friendly CLI wrapper:

```bash
matterhorn-work upstream openwork check
matterhorn-work upstream openwork check --json
```

Use a remote check only when network access is available:

```bash
pnpm upstream:openwork:check -- --remote
matterhorn-work upstream openwork check --remote
```

The checker prints:

- the configured upstream URL and branch.
- the Matterhorn base branch.
- the recommended sync branch name.
- conflict zones that need human review.
- verification commands that should pass before a sync PR is merged.

## Manual Sync Flow

1. Start from a current Matterhorn `dev`.

   ```bash
   git fetch origin dev
   git switch dev
   git pull --ff-only origin dev
   ```

2. Configure the upstream remote if it does not exist.

   ```bash
   git remote add openwork-upstream "$OPENWORK_UPSTREAM_REMOTE"
   ```

3. Fetch upstream.

   ```bash
   git fetch openwork-upstream "$OPENWORK_UPSTREAM_BRANCH"
   ```

4. Inspect the incoming commits and file impact before merging.

   ```bash
   git log --oneline "dev..openwork-upstream/$OPENWORK_UPSTREAM_BRANCH"
   git diff --name-status "dev...openwork-upstream/$OPENWORK_UPSTREAM_BRANCH"
   ```

5. Create a focused sync branch.

   ```bash
   git switch -c codex/sync-openwork-YYYY-MM-DD dev
   ```

6. Prefer cherry-picks for narrow upstream fixes. Use a merge only when the update is broad and the PR body explains the affected Matterhorn zones.

7. Resolve conflicts with Matterhorn decisions intact:

   - visible product copy says Matterhorn Work.
   - user-facing runtime copy says Matterhorn Work engine.
   - technical docs may still mention OpenCode as the underlying runtime.
   - public commands are `matterhorn-work` and `matterhorn-work-server`.
   - legacy `openwork` and `openwork-server` shims remain available.
   - `MATTERHORN_WORK_*` names take precedence over `OPENWORK_*` fallbacks.
   - Bittensor remains non-custodial and chat-first.
   - agent-control HTTP, MCP, and CLI surfaces remain stable.

8. Run the sync gate before opening or updating the PR.

   ```bash
   pnpm test:upstream-openwork-sync
   pnpm test:cli-packaging-rename
   pnpm test:opencode-abstraction-copy
   pnpm test:agent-control-coverage-matrix
   pnpm test:agent-control-doctor
   pnpm test:bittensor-operator-playbook
   pnpm test:bittensor-live-qa
   ```

9. Open a Matterhorn PR with:

   - upstream source URL and branch.
   - upstream commit range.
   - conflict zones reviewed.
   - Matterhorn-specific decisions preserved.
   - verification commands and results.
   - any follow-up work split out of scope.

## Conflict Zones

These areas should be reviewed on every upstream sync:

| Zone | Why It Matters |
| --- | --- |
| Branding and i18n | Upstream copy can reintroduce OpenWork visible branding or old product positioning. |
| Env vars and headers | Matterhorn-native aliases must keep priority while legacy OpenWork fallbacks continue to work. |
| CLI and packaging | Public commands should remain `matterhorn-work` and `matterhorn-work-server`; legacy shims must not break. |
| OpenCode abstraction | User-facing copy should say Matterhorn Work engine while technical docs can name OpenCode. |
| Agent control surface | HTTP, MCP, CLI, browser-control, and event-stream contracts should remain stable for Codex and Claude Code. |
| Bittensor safety | Wallet, staking, signing, watch, and subnet flows must stay non-custodial and source-aware. |
| Release automation | Alpha, CI, i18n, and packaging workflows must keep the GitHub runner fallback and Matterhorn names. |

## Merge Policy

- Do not auto-merge upstream OpenWork into Matterhorn `dev`.
- Do not accept upstream changes that remove Matterhorn aliases, shims, Bittensor safety, or agent-control contracts.
- Do not add seed phrases, mnemonics, private keys, wallet exports, API wallet secrets, or signing material to schemas, examples, logs, docs, tests, or MCP payloads.
- If a useful upstream update conflicts with Matterhorn product direction, split it into a smaller manual patch instead of merging the whole upstream range.
