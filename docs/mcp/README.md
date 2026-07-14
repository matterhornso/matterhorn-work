# Matterhorn MCP Docs

These docs describe the built-in Matterhorn Work MCP groups shown in Settings -> MCPs & Tools. Keep these files in sync with:

- `apps/app/src/react-app/domains/settings/pages/mcp-view.tsx`
- `packages/matterhorn-work-mcp/index.mjs`
- `packages/types/src/matterhorn-workflows.ts`

## Runtime Status vs. Product Catalog

The Settings surface combines two different data sets:

1. **Configured MCP runtime entries** from project/global OpenCode config and their live OpenCode status.
2. **Matterhorn MCP product cards** that generate installation commands for supported coding-agent clients.

Do not count catalog cards as connected. The live count includes only configured entries whose OpenCode status is exactly `connected`.

`Connected` means the MCP process completed initialization and exposes its tool catalog over MCP. It does not mean that a wallet, OAuth account, paid provider, or every upstream network dependency is connected. Customer copy should use `MCP server active` for this state.

## Built-in MCPs

| MCP | Doc | Boundary |
| --- | --- | --- |
| Bittensor MCP | [bittensor.md](bittensor.md) | Public reads, unsigned previews, external signing. |
| Hyperliquid MCP | [hyperliquid.md](hyperliquid.md) | Read, preview, handoff, validate, receipt. No live submit. |
| Polymarket MCP | [polymarket.md](polymarket.md) | Research, compliance-gated handoff, receipt. No live bet placement. |
| Memory MCP | [memory.md](memory.md) | Explicit user-confirmed memory only. No hidden saves. |
| Core Agent MCP | [core-agent.md](core-agent.md) | Workspace, sessions, files, approvals, and event watches. |
| Evidence MCP | [evidence.md](evidence.md) | Public or redacted readiness and evidence packets. |
| Workflow MCP | [workflow.md](workflow.md) | Catalogs, prompt packs, service planning, and templates. |
| UI Control MCP | [ui-control.md](ui-control.md) | Planned desktop bridge for visible UI actions only. |

## Shared install

Use the MCP settings page to pick a client and copy the current command. The shared config profile is:

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

All serious flows preserve Matterhorn's non-custodial boundary. Do not paste seed phrases, private keys, mnemonics, raw signatures, signed payloads, wallet exports, exchange API secrets, or custody credentials into any MCP tool.
