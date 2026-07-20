# Core Agent MCP

Use the Core Agent MCP when an external agent needs to work with a running Matterhorn Desks server: workspaces, sessions, files, approvals, and event streams.

## What It Does

- Runs server health and readiness checks.
- Lists workspaces and manages chat sessions.
- Reads and submits session prompts through Matterhorn's server route.
- Manages file sessions and file catalog events.
- Lists and replies to host approval requests.
- Watches session and file progress events.

## Tools

- `matterhorn_doctor`
- `matterhorn_status`
- `matterhorn_list_workspaces`
- `matterhorn_create_session`
- `matterhorn_list_sessions`
- `matterhorn_get_session`
- `matterhorn_get_session_messages`
- `matterhorn_submit_session_prompt`
- `matterhorn_get_session_status`
- `matterhorn_watch_session_events`
- `matterhorn_get_session_snapshot`
- `matterhorn_delete_session`
- `matterhorn_create_file_session`
- `matterhorn_file_catalog`
- `matterhorn_watch_file_events`
- `matterhorn_read_files`
- `matterhorn_write_files`
- `matterhorn_close_file_session`
- `matterhorn_list_approvals`
- `matterhorn_reply_approval`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_doctor` or `matterhorn_status` appears.

## Safety Boundary

- Writable operations use Matterhorn's session and approval policy.
- Approval tools require the host token where needed.
- File writes remain explicit and scoped to the active file session.
- No custody, signing, wallet action, market submit, or hidden execution is exposed here.

## Example Prompts

- Run doctor checks for the local Matterhorn server and workspace.
- Create a session in this workspace and submit a reviewed prompt.
- Watch session events until the current run finishes.
