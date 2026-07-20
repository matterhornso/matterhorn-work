# Matterhorn Memory Build Plan

Matterhorn Memory is the local-first memory layer for Matterhorn Desks. It should let the app remember useful, user-approved context across Bittensor, Hyperliquid, Polymarket, Wellness, workflows, MCPs, files, and customer artifacts while staying inspectable, editable, exportable, and forgettable.

The product rule is simple: memory is a trust surface, not a hidden personalization trick. Users must be able to see what Matterhorn remembers, why it remembers it, where it came from, how it is used, and how to delete it.

## Goals

- Make repeated chat workflows feel continuous: “use my usual TAO wallet”, “watch the same validator”, “reuse last week’s wellness check-in style”.
- Keep memory local-first and user-controlled.
- Support external agent clients through HTTP, CLI, and MCP tools.
- Store useful public or user-approved context, never secrets or custody material.
- Give every memory a provenance trail and a clear sensitivity label.

## Non-Goals

- No cloud sync in the first implementation.
- No automatic ingestion of Gmail, Calendar, Drive, health records, or private documents.
- No hidden long-term memory.
- No seed phrase, private key, API secret, raw signature, signed payload, or wallet export storage.
- No medical diagnosis, prescription, treatment, or private health-record storage without explicit future consent and a separate privacy review.

## Memory Principles

1. **Local-first**: the canonical store lives on the user’s machine.
2. **Plainly inspectable**: memory records are Markdown with frontmatter, plus a local index.
3. **Source-backed**: every record has provenance and a “why remembered?” explanation.
4. **Consent-aware**: assistant-suggested memory is proposed before long-term capture.
5. **Forgettable**: users can delete one memory, related memories, or all memory for a workspace.
6. **Secret-proof**: all capture paths run redaction and forbidden-secret tests before writing.
7. **Scoped**: memory is tagged as user, workspace, project, or session scope.
8. **Portable**: users can export a memory bundle in public/redacted form.

## Storage Shape

Initial local vault:

```text
~/Library/Application Support/Matterhorn Desks/memory/
  People/
  Projects/
  Protocols/
    Bittensor/
    Hyperliquid/
    Polymarket/
  Wellness/
  Workflows/
  Watchlists/
  Receipts/
  Decisions/
  Sources/
  memory-index.sqlite
  memory-log.jsonl
```

Record example:

```md
---
id: mem_01J...
kind: protocol_address
scope: workspace
title: Main TAO wallet
source: user_confirmed
confidence: high
sensitivity: public
canUseInChat: true
canExport: true
createdAt: 2026-06-22T00:00:00.000Z
updatedAt: 2026-06-22T00:00:00.000Z
---

# Main TAO wallet

Public SS58 address label for Bittensor read workflows.

Why remembered: the user confirmed this address can be reused for TAO balance and stake-position lookups.
```

## Allowed Memory Kinds

- `user_preference`: user-approved preferences such as low-risk previews or preferred UI mode.
- `project_fact`: stable project context or business rules.
- `protocol_address`: public SS58 or public market/account identifier labels.
- `watchlist`: Bittensor subnet/validator, Hyperliquid market, or Polymarket market watch preferences.
- `receipt`: public/redacted receipt metadata and evidence pointers.
- `workflow_artifact`: generated artifact metadata and public/redacted export references.
- `decision`: user-confirmed product, workflow, or operator decisions.
- `client_profile`: wellness or customer workflow profile metadata, only if safe and user-confirmed.
- `connector_preference`: MCP/client/tool connection preferences.
- `mcp_tool_preference`: preferred external agent tool routing and safe command defaults.

## Forbidden Memory

Every API, CLI, MCP, UI, and workflow helper must reject or redact:

- seed phrases
- private keys
- mnemonics
- API secrets
- raw signatures
- signed payloads
- wallet exports
- bearer tokens
- exchange secrets
- credential-shaped environment values
- unapproved medical or health records
- diagnosis, treatment, prescription, or guaranteed-outcome instructions

## Agent Workstreams

### Codex: Coordination, Vault, API, MCP, UI Integration

Branches:

- `codex/matterhorn-memory-plan`
- `codex/matterhorn-memory-vault`
- `codex/matterhorn-memory-api`
- `codex/matterhorn-memory-chat-ui`

Owned files:

- `docs/memory/**`
- `packages/matterhorn-memory-vault/**`
- memory API routes in server code
- memory CLI and MCP tools
- production app memory integration after the UI spec lands

Build order:

1. This coordination plan.
2. Local vault skeleton and index.
3. HTTP, CLI, and MCP surfaces.
4. Chat retrieval and memory chips.
5. Bittensor memory integration.
6. Production Memory screen.

### Kimi: Type Contract

Branch: `kimi/matterhorn-memory-contract`

Owned files:

- `packages/types/src/memory.ts`
- `packages/types/src/index.ts`
- `scripts/matterhorn-memory-contract.test.mjs`
- `docs/memory/matterhorn-memory-contract.md`

Build:

- shared memory record types
- scope, kind, source, sensitivity, provenance, redaction result
- contract tests for forbidden secrets and safe protocol/wellness boundaries

Required verification:

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-memory-contract
pnpm test:market-execution-safety-gate
```

### Minimax: Memory UI System

Branch: `minimax/matterhorn-memory-ui-system`

Owned files:

- `docs/ui/matterhorn-memory/**`
- `scripts/minimax-memory-ui.test.mjs`

Build:

- Memory Overview
- Protocol Memories
- Wellness Memories
- Watchlists
- Receipts
- Sources and Provenance
- Privacy / Forget Center
- chat memory chips
- desktop, tablet, and mobile layouts

Required verification:

```bash
pnpm test:minimax-memory-ui
pnpm test:market-execution-safety-gate
```

### Claude Code: Wellness Memory Safety Lane

Branch: `claude/wellness-memory-safety-lane`

Owned files:

- `scripts/wellness-creator-workflow.mjs`
- `scripts/wellness-creator-workflow.test.mjs`
- `docs/wellness-creator-workflow.md`
- `docs/wellness-creator-workflow/**`
- `docs/handoffs/hermes-wellness-creator-workflow-qa.md`

Build:

- safe wellness memory candidates
- opt-in client/service metadata examples
- refusal and redaction examples for clinical or secret-like content
- `--memory-candidates --json` helper output that proposes memory candidates without writing memory

Required verification:

```bash
pnpm test:wellness-creator-workflow
pnpm test:wellness-creator-pilot
pnpm test:market-execution-safety-gate
```

## Phase Plan

### Phase 0: Coordination Plan

Deliverable: this document.

Acceptance:

- memory principles are explicit
- agent ownership is non-overlapping
- safety boundaries are clear
- downstream build order is documented

### Phase 1: Shared Contract

Deliverable: typed memory contract and tests.

Acceptance:

- all memory records have kind, scope, provenance, sensitivity, timestamps, and deletion/export flags
- forbidden secret tests pass
- market memories cannot imply live submission
- Bittensor memories are public-address/external-signer only
- Wellness memories are educational and opt-in

### Phase 2: Local Vault

Deliverable: `packages/matterhorn-memory-vault`.

Acceptance:

- create, read, update, delete, search, export
- Markdown notes plus SQLite FTS index
- append-only `memory-log.jsonl`
- redaction before write
- no network dependency

### Phase 3: API, CLI, MCP

Deliverables:

```text
GET    /api/memory/search
POST   /api/memory/capture
GET    /api/memory/entities
GET    /api/memory/entities/:id
PATCH  /api/memory/entities/:id
DELETE /api/memory/entities/:id
POST   /api/memory/forget
GET    /api/memory/sources
POST   /api/memory/export
```

CLI:

```bash
matterhorn-work memory search "subnet 14"
matterhorn-work memory capture --kind user_preference --text "Prefer low-risk staking previews"
matterhorn-work memory forget --id <id>
matterhorn-work memory export --output-dir ./memory-export
```

MCP:

```text
matterhorn_memory_search
matterhorn_memory_capture
matterhorn_memory_update
matterhorn_memory_forget
matterhorn_memory_get_context_for_task
```

Acceptance:

- APIs reject forbidden fields
- CLI rejects credential-shaped flags
- MCP schemas do not accept secret or signature material
- export output is public/redacted by default

### Phase 4: Chat Retrieval and Capture

Deliverable: chat memory context layer.

Acceptance:

- relevant memory appears as visible chips
- user can approve or dismiss memory use
- assistant can propose “Remember this”
- user can choose “Do not remember”
- prompt execution never gets hidden memory without a visible indicator

### Phase 5: Bittensor Memory

Deliverable: first protocol memory integration.

Examples:

- public SS58 wallet labels
- watched subnets
- preferred validators
- risk tolerance for staking previews
- receipt history
- provider/data freshness preferences

Acceptance:

- “show my TAO” can ask to reuse remembered public SS58 address
- “compare my usual validators” can use remembered validator labels
- no custody or signing material is ever captured

### Phase 6: Wellness Memory

Deliverable: safe workflow memory candidates and future integration contract.

Examples:

- creator role
- service offer style
- check-in cadence
- artifact preferences
- renewal message tone

Acceptance:

- user must opt in before client-specific memory
- clinical prompts are redirected, not stored
- no hidden health record memory

### Phase 7: Production UI

Deliverable: Memory screen and chat memory chips in the app.

Acceptance:

- every memory is visible, editable, deletable, and exportable
- privacy controls are obvious
- desktop/tablet/mobile layouts work
- no overflow on the app shell

## Merge Sequence

1. Codex plan PR.
2. Kimi contract PR.
3. Codex vault PR.
4. Minimax UI spec PR.
5. Claude wellness memory PR.
6. Codex API/CLI/MCP PR.
7. Codex chat/Bittensor integration PR.
8. Codex production UI PR.

If two PRs conflict, pause and rebase from latest `dev`; do not force-merge.

## Global Safety Gate

Run after every memory-related code change:

```bash
pnpm test:market-execution-safety-gate
```

Run for final integration:

```bash
pnpm test:matterhorn-memory-contract
pnpm test:matterhorn-memory-vault
pnpm test:wellness-creator-workflow
pnpm test:market-execution-safety-gate
pnpm --filter @matterhorn-work/app typecheck
```

## Customer Promise

Matterhorn may remember what helps users work faster, but it must always make memory visible and reversible. The memory layer should increase trust because the user can inspect and control it, not because it is invisible.
