# Matterhorn Work Browser Control Live QA

This checklist verifies that `matterhorn-work-ui-mcp` can drive the built-in Matterhorn Work browser through semantic `browser.*` actions in a real desktop app session.

Use this after the local smoke test in `packages/matterhorn-work-ui-mcp/test-browser-actions.mjs` passes. The smoke test proves the MCP wrapper behavior with a fake bridge; this checklist proves the desktop bridge, React action registration, native browser panel, and MCP client path together.

## Preconditions

- Matterhorn Work desktop is installed or running from a local dev build.
- A workspace is open with at least one chat session visible.
- The desktop UI bridge has written a discovery file:
  - macOS production: `~/Library/Application Support/com.matterhorn.work/matterhorn-work-ui-control.json`
  - macOS dev: `~/Library/Application Support/com.matterhorn.work.dev/matterhorn-work-ui-control.json`
  - legacy fallbacks are still supported for older OpenWork app ids.
- The MCP client has `matterhorn-work-ui-mcp` configured.

## Local Checks Before Manual QA

Run:

```bash
pnpm test:agent-browser-control-guide
pnpm test:agent-action-model-contract
pnpm --dir packages/matterhorn-work-ui-mcp test
```

The UI MCP package test starts a fake localhost bridge, so restricted sandboxes may need localhost bind permission.

## Manual QA Script

### 1. Confirm Bridge

Call:

```text
ui_status
```

Expected:

- The tool reports Matterhorn Work as connected.
- The bridge URL is local.
- No token value is printed.

### 2. Inspect App State

Call:

```text
ui_snapshot
```

Expected:

- The current route points at a Matterhorn Work session route.
- The action list includes session and composer actions.
- If the desktop browser bridge is available, the action list includes `browser.open_panel` and `browser.open`.

### 3. List Browser Actions

Call:

```text
browser_list_actions
```

Expected before opening the browser panel:

- `browser.open_panel` is listed.
- `browser.open` is listed.
- `browser.snapshot` may be absent until the browser panel mounts.
- Non-browser actions such as `composer.send` are not listed.

### 4. Open A URL

Call `browser_open` with:

```json
{
  "url": "https://matterhorn.so",
  "newTab": true
}
```

Expected:

- The browser side panel opens.
- A built-in browser tab navigates to `https://matterhorn.so`.
- The tool returns a successful action result with URL and tab metadata where available.

### 5. Snapshot Browser State

Call:

```text
browser_snapshot
```

Expected:

- The result includes the active URL.
- The result includes title, loading state, back/forward capability, active tab id, and tabs where the native bridge provides them.
- No screenshot, DOM selector, coordinate, cookie, or credential data is required.

### 6. Navigate Active Tab

Call `browser_execute_action` with:

```json
{
  "actionId": "browser.navigate",
  "args": {
    "url": "https://example.com"
  }
}
```

Expected:

- The active built-in browser tab navigates to `https://example.com`.
- A follow-up `browser_snapshot` shows the new URL after the page starts loading or finishes loading.

### 7. Toolbar Actions

Call these only if listed:

```json
{ "actionId": "browser.reload", "args": {} }
```

Then, if enabled:

```json
{ "actionId": "browser.back", "args": {} }
```

Expected:

- Reload refreshes the active tab.
- Back is disabled when history is unavailable and works when history exists.
- Disabled actions are not forced.

### 8. Close Panel

Call:

```json
{ "actionId": "browser.close_panel", "args": {} }
```

Expected:

- The browser side panel closes.
- `browser_list_actions` still lists session-shell actions such as `browser.open_panel` and `browser.open`.
- Panel-scoped actions such as `browser.snapshot` may disappear until the panel is reopened.

## Safety Checks

- `browser_execute_action` refuses a non-browser action id such as `composer.send`.
- No browser MCP schema includes `seed`, `mnemonic`, `privateKey`, `private_key`, or wallet export fields.
- Any future `browser.*` action with `sideEffect: "external"` or `requiresConfirmation: true` must require explicit user confirmation before execution.
- Do not use raw coordinates for destructive, financial, signing, broadcast, trade, transfer, or external-account actions.

## Pass Criteria

The live browser-control path is acceptable when:

- `ui_status`, `ui_snapshot`, `browser_list_actions`, `browser_open`, `browser_snapshot`, and `browser_execute_action` all work through the same configured MCP client.
- The browser panel opens visibly in Matterhorn Work.
- State reported by `browser_snapshot` matches the visible browser panel.
- Disabled browser actions are represented as disabled and are not executed.
- No secrets are requested, displayed, logged, or transmitted.

## Failure Notes

Record failures with:

- Matterhorn Work build/channel.
- OS and architecture.
- MCP client used.
- Exact tool call and response.
- Whether the browser panel was mounted before the call.
- Whether the discovery file existed and pointed at a reachable local bridge.
