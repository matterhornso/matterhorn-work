# UI Control MCP

Use the UI Control MCP when an agent needs to guide the local desktop UI. This MCP is a planned desktop bridge and is not registered by the backend MCP server yet.

## What It Does

- Opens or focuses a Matterhorn desk from an agent.
- Sets a visible, editable prompt in the composer without auto-sending.
- Reads visible panel state for guided workflows.
- Toggles local side panels when the desktop bridge exposes those actions.

## Planned Tools

- `ui_focus_desk`
- `ui_set_prompt`
- `ui_toggle_panel`

## Setup

The backend config command is visible in the MCP settings page for consistency, but the UI Control MCP remains unavailable until the local desktop bridge publishes Matterhorn UI actions.

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

## Safety Boundary

- No backend execution.
- No custody, signing, market submit, wallet action, or secret collection.
- Prompt edits stay visible and user-editable.
- The bridge remains unavailable until desktop registration is implemented.

## Example Prompts

- Open the Bittensor desk and place this prompt in the composer.
- Show the Wallet panel so I can review signing boundaries.
- Read which Matterhorn side panel is currently open.
