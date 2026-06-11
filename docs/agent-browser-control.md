# Matterhorn Work Agent Browser Control

Matterhorn Work browser control is semantic first. Agent clients should use the desktop UI MCP and the published `browser.*` actions before trying screenshots, DOM scraping, or coordinate clicks.

This guide covers Codex, Claude Code, Claude Desktop, Cursor, HandsFree, and other MCP clients that can run `matterhorn-work-ui-mcp`.

## Surfaces

| Surface | Purpose |
| --- | --- |
| `matterhorn-work-ui-mcp` | Stdio MCP server that proxies to the running desktop app's local UI bridge. |
| `ui_snapshot` | Read the current route, narration, status, and all visible action metadata. |
| `ui_list_actions` | List every published desktop action. |
| `browser_list_actions` | List only published `browser.*` actions. |
| `browser_open` | Open a URL through `browser.open` or `browser.navigate` when available. |
| `browser_snapshot` | Read active browser state through `browser.snapshot` when available. |
| `browser_execute_action` | Execute another listed `browser.*` action with explicit confirmation when required. |

## Expected Desktop Actions

The exact set depends on the current route and whether the browser panel is mounted.

| Action | When available | Notes |
| --- | --- | --- |
| `browser.open_panel` | Session shell, desktop browser bridge available | Reveals the built-in browser side panel. |
| `browser.open` | Session shell, desktop browser bridge available | Opens a URL in the built-in browser, creating a new tab by default. |
| `browser.snapshot` | Browser panel mounted | Returns active URL, title, loading state, navigation state, active tab, and tabs. |
| `browser.navigate` | Browser panel mounted | Navigates the active browser tab. |
| `browser.back` | Browser panel mounted | Disabled when the active tab cannot go back. |
| `browser.forward` | Browser panel mounted | Disabled when the active tab cannot go forward. |
| `browser.reload` | Browser panel mounted | Reloads the active tab. |
| `browser.close_panel` | Browser panel mounted | Hides the browser side panel. |

## Agent Flow

1. Confirm the desktop bridge is reachable:

   ```text
   ui_status
   ```

2. Inspect the current app route:

   ```text
   ui_snapshot
   ```

3. List browser actions:

   ```text
   browser_list_actions
   ```

4. If no browser actions are listed, navigate to a Matterhorn Work session with `ui_list_actions` and `ui_execute_action`, then call `browser_list_actions` again.

5. Open a URL through the semantic browser action:

   ```json
   {
     "url": "https://matterhorn.so",
     "newTab": true
   }
   ```

   Send that payload to `browser_open`.

6. Read state:

   ```text
   browser_snapshot
   ```

7. Execute other browser actions only when listed:

   ```json
   {
     "actionId": "browser.reload",
     "args": {}
   }
   ```

   Send that payload to `browser_execute_action`.

## Safety Rules

- Never ask for or transmit seed phrases, mnemonics, private keys, wallet exports, or raw custody material through browser actions.
- Do not use coordinates for destructive, financial, signing, broadcast, transaction, trade, transfer, or external-account actions.
- If a `browser.*` action declares `requiresConfirmation: true` or `sideEffect: "external"`, pass `confirmed: true` only after explicit user approval.
- Prefer `browser_snapshot` for browser state before using any low-level browser automation tool.
- Fall back to generic browser tools only for safe read-only inspection when no semantic action exists.
- If semantic action metadata is stale or an action is disabled, stop and re-list actions instead of retrying blindly.

## Local Smoke Test

Run the UI MCP browser-action smoke test:

```bash
pnpm --dir packages/matterhorn-work-ui-mcp test
```

The smoke test starts a fake localhost Matterhorn bridge and verifies:

- `matterhorn-work-ui-mcp` exposes `browser_list_actions`, `browser_snapshot`, `browser_open`, and `browser_execute_action`.
- `browser_list_actions` filters out non-browser actions.
- `browser_snapshot` calls a published `browser.snapshot` action.
- `browser_open` calls a published `browser.open` action with URL args.
- `browser_execute_action` refuses non-`browser.*` action ids.
- external or confirmation-required browser actions are not sent to the bridge unless `confirmed: true` is supplied.
- MCP tool schemas do not contain secret-shaped wallet fields.

The smoke test binds a local fake bridge. In restricted sandboxes, run it with localhost bind permission.

## Live Desktop Check

With Matterhorn Work desktop running:

1. Add `matterhorn-work-ui-mcp` to the MCP client.
2. Open any Matterhorn Work session.
3. Call `ui_status`.
4. Call `browser_list_actions`.
5. Call `browser_open` with a harmless URL such as `https://matterhorn.so`.
6. Call `browser_snapshot`.
7. Confirm the result includes the opened URL, title where available, loading state, and tab metadata.

## Related Docs

- [Matterhorn Work Agent Control Surface](./agent-control-surface.md)
- [Matterhorn Work Agent Action Model](./agent-action-model-contract.md)
- [Matterhorn Work MCP Install Guide](./agent-mcp-install.md)
- [Control Matterhorn Work from any MCP client](./mcp-ui-control-profile.md)
