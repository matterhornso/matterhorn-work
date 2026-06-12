# Matterhorn Work Agent Operator Workflow

This is the copy-paste workflow for running Matterhorn Work from Codex, Claude Code, Claude Desktop, Cursor, or any MCP-capable agent.

Use it when an external agent needs to:

- start Matterhorn Work;
- run a readiness doctor;
- create a chat session;
- submit a prompt;
- watch progress events;
- read and write workspace files through file sessions;
- run Bittensor chat workflows.

The workflow is intentionally non-custodial. Do not paste seed phrases, mnemonics, private keys, wallet exports, host tokens in URLs, or signed transaction payloads into chat prompts or MCP tool arguments.

## 1. Start Matterhorn Work

Run this in a trusted local terminal:

```bash
export MATTERHORN_WORK_WORKSPACE="$PWD"

matterhorn-work start \
  --workspace "$MATTERHORN_WORK_WORKSPACE" \
  --approval manual
```

Copy the server URL, client token, and host token from the startup output. Put them in a second terminal:

```bash
export MATTERHORN_WORK_SERVER_URL="http://127.0.0.1:8787"
export MATTERHORN_WORK_TOKEN="<client-token>"
export MATTERHORN_WORK_HOST_TOKEN="<host-token>"
```

The client token is for normal server tools. The host token is only for approval inspection and approval replies. Omit the host token from untrusted clients.

## 2. Run The Doctor

Use this before handing control to another agent:

```bash
matterhorn-work doctor --strict --json
```

For a full live pass after the doctor is ready:

```bash
node scripts/agent-control-live-qa.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN" \
  --expect-event session.snapshot \
  --expect-event session.status \
  --json
```

If the live QA report is not ready, fix the failing route before asking an external agent to operate the workspace.

## 3. Configure Codex Or Claude Code

Codex:

```bash
codex mcp add matterhorn-work \
  --env MATTERHORN_WORK_SERVER_URL="$MATTERHORN_WORK_SERVER_URL" \
  --env MATTERHORN_WORK_TOKEN="$MATTERHORN_WORK_TOKEN" \
  --env MATTERHORN_WORK_HOST_TOKEN="$MATTERHORN_WORK_HOST_TOKEN" \
  -- npx -y matterhorn-work-mcp
```

Claude Code:

```bash
claude mcp add --transport stdio \
  --env MATTERHORN_WORK_SERVER_URL="$MATTERHORN_WORK_SERVER_URL" \
  --env MATTERHORN_WORK_TOKEN="$MATTERHORN_WORK_TOKEN" \
  --env MATTERHORN_WORK_HOST_TOKEN="$MATTERHORN_WORK_HOST_TOKEN" \
  matterhorn-work \
  -- npx -y matterhorn-work-mcp
```

Generic JSON config:

```bash
matterhorn-work mcp config \
  --target json \
  --profile server \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN"
```

## 4. CLI Operator Loop

This path works even when MCP is unavailable. It uses `jq` to extract ids. If `jq` is not installed, run the commands with `--json` and copy ids manually.

List workspaces:

```bash
matterhorn-work workspace list --json
export MATTERHORN_WORK_WORKSPACE_ID="<workspace-id>"
```

Create a chat session:

```bash
export MATTERHORN_WORK_SESSION_ID="$(
  matterhorn-work sessions create \
    --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
    --title "Agent operator workflow" \
    --json | jq -r '.item.id // .session.id // .id'
)"
```

Submit a prompt:

```bash
matterhorn-work sessions prompt "$MATTERHORN_WORK_SESSION_ID" \
  --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
  --message "Inspect this workspace and summarize the safest next Web3 task." \
  --json
```

Watch bounded progress events:

```bash
matterhorn-work sessions events "$MATTERHORN_WORK_SESSION_ID" \
  --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
  --snapshot \
  --details \
  --max-events 10 \
  --json
```

Read the latest snapshot:

```bash
matterhorn-work sessions snapshot "$MATTERHORN_WORK_SESSION_ID" \
  --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
  --limit 20 \
  --json
```

Create a read-only file session:

```bash
export MATTERHORN_WORK_FILE_SESSION_ID="$(
  matterhorn-work files session create \
    --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
    --write false \
    --ttl-seconds 900 \
    --json | jq -r '.session.id // .item.id // .id'
)"
```

List files and read a file:

```bash
matterhorn-work files catalog "$MATTERHORN_WORK_FILE_SESSION_ID" \
  --limit 50 \
  --json

matterhorn-work files read "$MATTERHORN_WORK_FILE_SESSION_ID" \
  --path README.md \
  --json
```

When the user explicitly wants edits, create a writable file session and write through the file API:

```bash
export MATTERHORN_WORK_WRITE_SESSION_ID="$(
  matterhorn-work files session create \
    --workspace-id "$MATTERHORN_WORK_WORKSPACE_ID" \
    --write true \
    --ttl-seconds 900 \
    --json | jq -r '.session.id // .item.id // .id'
)"

matterhorn-work files write "$MATTERHORN_WORK_WRITE_SESSION_ID" \
  --path docs/agent-notes.md \
  --content "Agent note: verified through Matterhorn Work file session." \
  --json
```

Close file sessions when finished:

```bash
matterhorn-work files session close "$MATTERHORN_WORK_FILE_SESSION_ID" --json
matterhorn-work files session close "$MATTERHORN_WORK_WRITE_SESSION_ID" --json
```

## 5. Bittensor Chat From CLI

Use [Matterhorn Work Bittensor Operator Playbook](./bittensor-operator-playbook.md) for the full Bittensor-specific operator flow, including expected behavior for wallet reads, subnet discovery, validator comparison, staking previews, missing-context clarifications, and unsupported subnet adapters.

Start with readiness:

```bash
matterhorn-work bittensor readiness --json
```

Run read/discovery workflows:

```bash
matterhorn-work bittensor chat \
  --message "Explain Bittensor like I am new." \
  --json

matterhorn-work bittensor chat \
  --message "Which subnet is useful for image generation?" \
  --limit 5 \
  --json
```

Wallet reads require an SS58 public address, not a seed phrase:

```bash
matterhorn-work bittensor chat \
  --message "Show my TAO and where I am staked." \
  --ss58-address "<public-ss58-address>" \
  --json
```

Staking prompts must clarify or preview. They must not sign automatically:

```bash
matterhorn-work bittensor chat \
  --message "Prepare staking 1 TAO safely." \
  --netuid 14 \
  --amount-tao 1 \
  --validator-hotkey "<validator-hotkey>" \
  --json
```

## 6. MCP Tool Sequence For Codex Or Claude

After the MCP server is configured, ask the agent to follow this exact sequence:

```text
Use the Matterhorn Work MCP server.

1. Call matterhorn_doctor.
2. Call matterhorn_list_workspaces and choose the active or requested workspace.
3. Call matterhorn_create_session with:
   { "workspaceId": "<workspace-id>", "title": "Agent operator workflow" }
4. Call matterhorn_submit_session_prompt with:
   {
     "workspaceId": "<workspace-id>",
     "sessionId": "<session-id>",
     "message": "Inspect this workspace and summarize the safest next Web3 task."
   }
5. Call matterhorn_watch_session_events with:
   {
     "workspaceId": "<workspace-id>",
     "sessionId": "<session-id>",
     "snapshot": true,
     "details": true,
     "maxEvents": 10
   }
6. Call matterhorn_get_session_snapshot with:
   { "workspaceId": "<workspace-id>", "sessionId": "<session-id>", "limit": 20 }
7. Call matterhorn_create_file_session with:
   { "workspaceId": "<workspace-id>", "readOnly": true, "ttlSeconds": 900 }
8. Call matterhorn_file_catalog with:
   { "sessionId": "<file-session-id>", "limit": 50 }
9. Call matterhorn_read_files with:
   { "sessionId": "<file-session-id>", "paths": ["README.md"] }
10. Only if the user explicitly asks for edits, create a writable file session:
   { "workspaceId": "<workspace-id>", "readOnly": false, "ttlSeconds": 900 }
11. Use matterhorn_write_files only for explicit edits and summarize the exact paths changed.
12. Use matterhorn_bittensor_readiness before Bittensor tasks.
13. Use matterhorn_bittensor_chat for ordinary Bittensor requests before lower-level tools.
14. Never request or transmit seed phrases, mnemonics, private keys, wallet exports, or host tokens.
```

## 7. Approval Loop

Some writes or host actions can require approval. A trusted operator can inspect approvals:

```bash
matterhorn-work approvals list \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN"
```

Approve only after reviewing the action:

```bash
matterhorn-work approvals reply "<approval-id>" \
  --allow \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN"
```

Or deny:

```bash
matterhorn-work approvals reply "<approval-id>" \
  --deny \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN"
```

## 8. Safety Checklist

- Use `matterhorn_doctor` or `matterhorn-work doctor` before handing off to an agent.
- Prefer read-only file sessions until the user explicitly asks for edits.
- Keep `MATTERHORN_WORK_HOST_TOKEN` out of untrusted clients.
- Do not put tokens in URLs.
- Do not request seed phrases, mnemonics, private keys, wallet exports, or raw signed payloads.
- For Bittensor, use public SS58 addresses for reads and unsigned previews for actions.
- Summarize changed files and approval decisions in plain English after each workflow.
