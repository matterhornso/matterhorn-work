# Memory MCP

Use the Memory MCP when an agent needs explicit, user-confirmed Matterhorn Memory records without hidden capture.

## What It Does

- Searches, lists, reads, captures, updates, forgets, and exports memory records.
- Keeps agent work consistent across desks while preserving user control.
- Exports user-safe memory evidence bundles.

## Tools

- `matterhorn_memory_search`
- `matterhorn_memory_list`
- `matterhorn_memory_get`
- `matterhorn_memory_capture`
- `matterhorn_memory_update`
- `matterhorn_memory_forget`
- `matterhorn_memory_export`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_memory_list` appears.

## Safety Boundary

- No hidden saves or background capture.
- Captures and updates require explicit user intent.
- Unsafe records, credentials, secrets, signatures, signed payloads, wallet exports, and custody credentials are rejected by server validators.
- Restricted records stay protected by scope and policy.

## Example Prompts

- Search memory for the current Bittensor wallet context.
- Capture this project preference as a user-confirmed memory.
- Export safe memory records for this workspace.
