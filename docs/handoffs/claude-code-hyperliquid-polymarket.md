# Claude Code Handoff: Polymarket Parallel Stream

Use this handoff after `docs/parallel-agent-market-roadmap.md` lands on `dev`.

## Goal

Work in parallel with Codex on Matterhorn Work without conflicts. Claude Code owns the Polymarket stream only.

## Repository

- Repo: `matterhornso/matterhorn-work`
- Base branch: latest `dev`
- Branch prefix: `claude/polymarket-`

## Do Not Touch

- Bittensor files.
- Hyperliquid files.
- Shared MCP index or shared CLI wiring unless Codex explicitly requests it.
- Shared market safety contract files after Codex creates them, unless the PR explicitly coordinates that change.
- Existing receipt/import PRs or customer-readiness evidence files outside Polymarket docs/tests.
- Unrelated branding, Electron, OpenWork sync, release, or desktop files.

## Build Scope

Implement the Polymarket discovery, compliance, and preview-only stream.

Required behavior:

1. Add a Polymarket provider for Gamma market/event discovery and CLOB orderbook reads.
2. Add a geoblock check using Polymarket's geoblock endpoint before order previews.
3. Add chat planner/executor support for:
   - find markets by topic;
   - explain a market;
   - show orderbook;
   - prepare Yes/No order preview.
4. Order preview must never submit.
5. If geoblock says blocked, return `blocked_by_compliance`.
6. Reject private keys, mnemonics, seed phrases, API secrets, passphrases, wallet exports, and raw signatures in every schema and payload.
7. Support research and watchlist flows even when order previews are blocked.

## Suggested Files

Prefer Polymarket-specific files so Codex can work independently:

- `apps/server/src/tools/polymarket.ts`
- `apps/server/src/tools/polymarket.test.ts`
- `docs/polymarket-operator-playbook.md`
- `scripts/polymarket-live-qa.mjs`
- `scripts/polymarket-live-qa.test.mjs`

If a shared route, MCP, or CLI file must be edited, leave a PR comment tagging Codex and explain the exact overlap.

## Verification

Run or add focused tests for:

- market search with mocked Gamma response;
- market detail with mocked Gamma response;
- orderbook read with mocked CLOB response;
- geoblock blocked response;
- blocked order preview;
- secret-field rejection;
- no live trading or order submission.

PR body must include:

- exact files touched;
- whether any shared files were touched;
- mocked provider fixtures used;
- confirmation that no private key/API-secret/raw-signature fields are accepted.
