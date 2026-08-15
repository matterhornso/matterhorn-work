# Matterhorn agent runtime

Matterhorn Desks uses OpenWork for the product/workspace layer and OpenCode for the agent loop. Hosted workspaces run an exact, pinned OpenCode binary and SDK. The runtime config connects a server-managed Matterhorn MCP; generated desk agents select narrow subsets of that MCP.

## Request path

1. The app selects an execution mode, model, agent, perspective, and relevant public context.
2. The control plane verifies auth, provider policy, model allowance, and execution mode.
3. The control plane resolves the selected OpenCode agent's authoritative permission rules.
4. Any request-scoped restriction is appended after that agent policy as a session permission profile. The deprecated `PromptInput.tools` field is never forwarded because OpenCode persists it across later turns.
5. OpenCode filters unavailable tools before serializing the provider request, runs the model/tool loop, and records provider-reported input, output, reasoning, and cache tokens.
6. Matterhorn reconciles usage to the authenticated account and exposes response latency, token use, and transaction evidence in the UI.

## Token controls

- Answer-only general Work turns use a deny-all request profile, so no tool schemas enter the model request.
- Explicit general-chat crypto requests are routed to only the named venue families. Current schema reduction versus the full crypto catalog is approximately 72% for Bittensor, 47% for Hyperliquid, 50% for prediction markets, and 89% for Sui.
- Ambiguous action follow-ups, attachments, file work, and custom agents retain their complete policy; optimization never guesses away a required capability.
- A later tool-intent Work turn restores the selected agent's complete policy, including `ask` rules. Repeating the same profile does not grow the session ruleset.
- Client tool hints may only remove capabilities. Only server-owned execution-mode policy may re-enable a reviewed read-only tool after a deny-all rule.
- Managed desk agents are deny-by-default and expose only their declared MCP tools.
- Client context is relevance-gated and capped at 4,000 characters for general chat and 6,000 for desks.
- Hosted requests do not duplicate the execution-mode system block on the client.
- OpenCode automatic compaction is enabled. Old, unprotected tool outputs are pruned from model context after recent turns while the full output remains on disk.
- A single managed MCP result contributes at most 8,000 characters to the model. Oversized lists are structurally shortened and instruct the model to request a narrower query.
- Managed CUDOS inference has a 30-second response-header deadline, 45-second stalled-stream deadline, and 120-second total deadline. Failures enter the transactional Retry path instead of leaving an indefinitely busy session.
- Tests enforce a 6,500-character maximum desk contract, 220-character request overlay, 11,000-character full managed-tool catalog, and 2,500-character single-tool schema.

## Safety invariants

- Global runtime permissions deny by default.
- Shell, subagents, external network fetches, and workspace escapes remain denied in hosted workspaces.
- File edits and browser automation remain approval-gated.
- Desk agents never sign or submit wallet actions. They produce typed review material for the user's wallet or external signer.
- Switching Discuss, Plan, answer-only Work, and tool-enabled Work cannot silently retain the prior turn's tool restrictions.

## Version policy

`constants.json`, every `@opencode-ai/sdk` package, and the public-beta container must move together. `scripts/opencode-runtime-compatibility.test.mjs` verifies the declared OpenWork/OpenCode versions, checksums, runtime binary, SDK pins, and managed config before release.
