# Matterhorn Work Bittensor: Built vs Remaining Vision

This is the current Bittensor product stocktake for Matterhorn Work. Use it before starting new Bittensor, agent-control, or upstream OpenWork sync work.

## Product Vision

Matterhorn Work should make Bittensor usable through plain chat for non-expert users while staying non-custodial, source-aware, and honest about uncertainty.

The intended user experience:

- Ask beginner questions about Bittensor, TAO, coldkeys, hotkeys, subnets, validators, miners, and Dynamic TAO.
- Read a public SS58 wallet without connecting or importing keys.
- Understand wallet exposure, validator concentration, subnet exposure, slippage, stale data, and what changed since last time.
- Discover subnets by goal and understand whether Matterhorn can explain, monitor, preview, or directly call a service adapter.
- Prepare staking and subnet-service actions as safe previews only.
- Hand off signing to an external signer without seed phrases, private keys, mnemonics, keyfiles, wallet exports, or custody.
- Let agents and operators run the same flows through MCP, CLI, and stable HTTP APIs.

## Built

### Chat-First Bittensor Core

- Bittensor chat planner and executor.
- Beginner explanation, subnet discovery, wallet reads, stake-position reads, validator comparison, staking clarification, unsigned staking preview, monitoring, and subnet-use preview flows.
- Chat context continuity for public SS58 address, netuid, amount, validator hotkey, and last intent.
- Transcript/card rendering for wallet snapshot, subnet comparison, validator selection, staking quote, signing review, subnet result, intelligence report, watchlist, readiness, adapter marketplace, adapter roadmap, and operator handoff.

### Wallet And Validator Intelligence

- Public wallet intelligence reports with free TAO, stake value, subnet/validator concentration, slippage exposure, stale-data risk, largest positions, warnings, next questions, copilot actions, and watch suggestions.
- Subnet intelligence reports with score, source/freshness, market/metagraph context, mechanism-awareness, validator concentration, adapter readiness, warnings, next questions, and watch suggestions.
- Validator intelligence and deep-dive flows for public validator hotkeys.
- In-memory public wallet baselines, optional public-data-only wallet timeline snapshots, `what changed in my wallet since last time?` comparison cards, and chat-level baseline reset/forget controls.

### Staking And Signing Safety

- Unsigned staking previews only.
- External-signer handoff JSON with checksum and expiry.
- External signer handoff checker for payload SHA-256, expiry, action context, external signer marker, and forbidden signing/credential fields.
- External signer receipt checker for post-signing transaction hash/status, payload-hash continuity, action/netuid context, no raw signatures, and public wallet diff follow-up prompts.
- Signed-result/receipt modeling without seed import or local custody.
- Submit path remains gated and external-signed.
- Safety tests and docs assert no secret-shaped fields in Bittensor/MCP/API payloads.

### Subnet Service Adapter Foundation

- Capability registry and adapter marketplace/roadmap outputs.
- Safe adapter contract shape with auth, cost model, request schema, result schema, safety notes, privacy promises, and unsupported behavior.
- Preview-confirm-invoke loop with request hash validation.
- Mock/configured adapter path behind env gates.
- Contract/conformance/canary/operator evidence docs and tests.
- Real adapter canary gate for capability evidence, endpoint allowlists, mock restrictions, and no-secret inspection before any real service execution.

### Monitoring And Agent Ops

- Compact Bittensor customer readiness panel in the app overview, backed by the existing readiness API, direct chat handoff, and copyable live-QA/gate commands.
- Watch creation from chat and wallet/subnet/validator intelligence.
- Watch checks, alert keys, notification intents, digest, safe alert actions, and Watch autopilot operator report.
- Live QA harness for Bittensor readiness, wallet reads, intelligence, wallet-change baseline, discovery, validator comparison, staking previews, subnet adapter preview, and monitoring watches.
- Customer-readiness gate that aggregates live QA, agent-control QA, CI evidence, and required QA docs.
- Customer evidence bundle that turns readiness outputs into a redacted, copy-pasteable operator/customer handoff packet, with optional adapter-canary evidence for real-adapter demos.
- Hermes QA guide with latest commands for signing handoff checks, watch autopilot, adapter canary gates, and evidence-bundle runs.

### Agent Control Surface

- Stable HTTP routes for sessions, prompts, files, approvals, Bittensor, and browser/control action contracts.
- `matterhorn-work-mcp`, `matterhorn-work-crypto-mcp`, `matterhorn-work-wallet-mcp`, and `matterhorn-work-ui-mcp` surfaces.
- MCP tools for Bittensor customer evidence bundles, signing handoff validation, adapter canary gates, watch digest/action handling, and safe chat workflows.
- CLI fallback commands for sessions, files, approvals, Bittensor, doctor, and upstream OpenWork sync.
- Docs for Codex, Claude Code, Claude Desktop, Cursor, browser control, session events, operator workflows, and coverage matrix.

### Rename And Upstream OpenWork Intake

- Visible branding moved to Matterhorn Work.
- Compatibility aliases preserve OpenWork env/header/protocol/storage fallbacks.
- CLI/package rename with legacy shims.
- OpenCode user-facing abstraction as Matterhorn Work engine where appropriate.
- Upstream OpenWork sync playbook/checker added so upstream improvements can be reviewed without losing Matterhorn product decisions.

## Remaining Vision

### Phase A: Durable Wallet Timeline

Goal: make wallet-change comparisons survive process restarts and power real customer demos.

Build:

- Harden the optional local public wallet snapshot store for customer machines, including storage-location UX and operator evidence.
- Add export/redaction commands around the versioned snapshot format.
- `what changed since yesterday/last week?` support using timestamped public baselines.
- UI and CLI controls to clear public wallet baselines.

Safety:

- Store only public SS58, public balances/stake positions, source/freshness, and derived risk fields.
- Never store seed phrases, private keys, mnemonics, keyfiles, wallet exports, signatures, or raw signer payloads.

### Phase B: Customer Readiness UI

Status: partially built. The app has a readiness panel and copy commands for live QA, readiness gate, evidence bundle, and signing handoff checks. Remaining work is richer local evidence state and clearer blocker display.

Goal: make the release gate visible in the app, not only in CLI/docs.

Build:

- Expand the Bittensor readiness/customer QA panel with latest local readiness-gate evidence and missing artifacts.
- Show latest local readiness gate result, missing evidence, and next command to run.
- Keep the copy commands aligned with future Hermes/Codex live QA script changes.
- Surface P0/P1 blockers clearly before a test customer session.

### Phase C: Adapter Canary To First Real Adapter

Status: foundation built. The contract, mock adapter path, preview-confirm-invoke loop, canary gate, MCP canary gate, and evidence integration are in place. Remaining work is one real read-only canary adapter.

Goal: graduate from mock/configured adapters to one real low-risk read-only subnet service adapter.

Build:

- Pick one adapter category first: data/search or inference.
- Keep endpoint allowlist, request hash, preview-confirm-invoke, timeout, rate limit, and redacted evidence.
- Ship a canary-only real adapter path before general availability.
- Add regression tests for endpoint rejection, hash mismatch, timeout, unsafe schema, and no wallet data.

### Phase D: External Signer UX

Status: foundation built. Unsigned previews, handoff JSON, handoff validation script, MCP handoff validation, and copyable app command exist. Remaining work is signer status, receipt import, and post-action wallet diff UX.

Goal: make non-custodial signing understandable enough for test customers without enabling custody.

Build:

- Desktop/browser external signer status card.
- Clear handoff download/copy flow.
- Receipt import/capture UX.
- Post-action wallet diff prompt after finality.

### Phase E: Bittensor Autopilot

Status: partially built. Watch creation/checks/digests/actions and a read-only watch autopilot report exist. Remaining work is scheduling, notifications, and event-stream integration for Bittensor state changes.

Goal: make Matterhorn useful after the user leaves chat.

Build:

- Scheduled watch evaluation runner.
- Local notifications for wallet concentration, validator disappearance, emissions, slippage, stale providers, adapter failures, and signing receipts.
- Agent event stream for Bittensor state changes.
- Watch-to-action runbooks that stay read-only unless the user explicitly prepares an unsigned action.

### Phase F: Web/Lite Alignment

Goal: let Matterhorn Lite reuse the same product story without becoming the full desktop app.

Build:

- Keep web lightweight and chat-first.
- Add copy and small UI affordances for Bittensor explain/discover/readiness, but not desktop-only signing or subnet adapter execution.
- Link users to Matterhorn Work desktop for local agent-control, external signing, and advanced wallet/subnet operations.

## Recommended Next Build Order

1. External signer receipt UX: import/capture externally signed receipts, show status, and offer a post-action public wallet diff prompt.
2. Real read-only adapter canary: choose one data/search or inference endpoint, pass the canary gate, run preview-confirm-invoke with endpoint allowlist/timeouts/rate limits, and keep it canary-only.
3. Durable wallet timeline polish: timestamped public baselines, export/redaction, clear controls, and "since yesterday/last week" chat phrasing.
4. Scheduled Bittensor autopilot: local schedule runner, notification summaries, and event-stream integration.
5. Customer readiness UI: show latest local evidence state, missing artifacts, and P0/P1 blockers directly in the app.
6. Matterhorn Lite alignment notes and shared copy.

Do not start Hyperliquid or Polymarket until the Bittensor release gate passes on a clean machine and at least one test customer can complete the read-only Bittensor flow end to end.
