# Matterhorn Work Agent Action Model

This contract defines the shared language for Matterhorn Work control actions across:

- the desktop UI bridge exposed through `matterhorn-work-ui-mcp`
- the stable server HTTP/MCP control surface exposed through `matterhorn-work-mcp`
- future browser/control tools used by Codex, Claude Code, Claude Desktop, Cursor, HandsFree, and other MCP clients

The goal is simple: agents should inspect the current state, see which actions are available, understand their arguments and side effects, and execute only actions that are explicit, typed, and safe.

## Current Surfaces

| Surface | Status | Current tools or routes |
| --- | --- | --- |
| Desktop UI bridge | implemented | `ui_status`, `ui_snapshot`, `ui_list_actions`, `ui_execute_action` |
| Server control MCP | implemented | `matterhorn_status`, session/file/approval/Bittensor tools |
| Server action model | contract first | future `matterhorn_list_actions` and `matterhorn_execute_action` should use this schema |
| Browser/control tools | contract first | should call the same action model, not invent coordinate-only flows |

The desktop UI bridge is the source of the current action metadata shape. Server-side tools should converge on the same shape so a client can reason about one action model regardless of whether the action is executed in the renderer, local server, or browser controller.

## Action Metadata

Every action MUST publish stable metadata before it can be executed.

```ts
type MatterhornControlSideEffect =
  | "none"
  | "navigation"
  | "mutation"
  | "external";

type MatterhornControlActionArg = {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "array" | "unknown";
  required?: boolean;
  description?: string;
};

type MatterhornControlActionMetadata = {
  id: string;
  label: string;
  description?: string;
  sideEffect: MatterhornControlSideEffect;
  requiresConfirmation: boolean;
  requiresArgs: boolean;
  hasPreviewArgs: boolean;
  previewArgs?: unknown;
  args?: MatterhornControlActionArg[];
  disabled: boolean;
  busy: boolean;
};
```

Required semantics:

- `id` is stable, dot-delimited, and lowercase, such as `composer.set_text`, `session.open`, or `route.settings.extensions`.
- `label` is short human-readable text.
- `description` explains what the action changes or reads.
- `sideEffect` tells the agent how cautious to be.
- `requiresConfirmation` means a user-facing approval step is required before execution.
- `requiresArgs` means the action cannot run without arguments.
- `previewArgs` is an optional safe example payload.
- `disabled` means the action is visible but not executable in the current state.
- `busy` means this specific action is currently running.

## Snapshot

Every action provider SHOULD expose a snapshot endpoint or tool:

```ts
type MatterhornControlSnapshot = {
  version: number;
  enabled: boolean;
  route: string;
  status: "off" | "ready" | "acting";
  busyActionId: string | null;
  narration: string;
  actions: MatterhornControlActionMetadata[];
};
```

Snapshot rules:

- `version` increments only for breaking shape changes.
- `route` is the current app route, server route, or browser target route.
- `status` is `acting` while any action is running.
- `busyActionId` must be set when `status` is `acting`.
- `actions` must only include actions the current token/client is allowed to inspect.

## Execution Request

Every action executor SHOULD accept this shape:

```ts
type MatterhornControlExecutionRequest = {
  actionId: string;
  args?: unknown;
  requestId?: string;
  dryRun?: boolean;
};
```

Execution rules:

- Clients SHOULD call snapshot/list first and execute only listed actions.
- `dryRun` returns validation and preview data without performing the action where the underlying action supports it.
- `requestId` is optional but recommended for idempotency and audit trails.
- Unknown arguments should be rejected by high-risk actions.
- Missing required arguments must return a structured error.

## Execution Result

Every executor SHOULD return this shape:

```ts
type MatterhornControlExecutionResult =
  | {
      ok: true;
      actionId: string;
      requestId?: string;
      result?: unknown;
      narration?: string;
    }
  | {
      ok: false;
      actionId: string;
      requestId?: string;
      error: string;
      code?: string;
      recoverable?: boolean;
    };
```

Result rules:

- `ok: true` means the action completed or was accepted for execution.
- Long-running actions should return an accepted result plus a polling handle or status route.
- `ok: false` must include a plain-English `error`.
- `recoverable` should be true when the user or agent can safely retry after changing input.

## Side Effect Policy

| Side effect | Meaning | Default policy |
| --- | --- | --- |
| `none` | Read-only or local UI-only inspection | Safe to run after inspection |
| `navigation` | Changes route, selection, or visible panel | Safe after inspection unless it disrupts user work |
| `mutation` | Changes app/server/workspace state | Require explicit user intent or approval |
| `external` | Calls outside systems, spends money, signs, broadcasts, sends messages, or edits third-party data | Require explicit confirmation and visible consequence statement |

Crypto and Bittensor actions that prepare quotes or unsigned previews may be `none` or `mutation` depending on storage side effects. Any action that signs, broadcasts, sends funds, places trades, or uses an external signer is `external`.

## Namespaces

Use these action id prefixes:

| Prefix | Owner | Examples |
| --- | --- | --- |
| `route.*` | UI shell | `route.session`, `route.settings.extensions` |
| `session.*` | Chat/session domain | `session.open`, `session.create_task`, `session.delete` |
| `composer.*` | Composer domain | `composer.set_text`, `composer.send`, `composer.stop` |
| `transcript.*` | Transcript domain | `transcript.read_latest`, `transcript.scroll_bottom` |
| `workspace.*` | Workspace/server domain | `workspace.list`, `workspace.open` |
| `files.*` | File-session domain | `files.read_batch`, `files.write_batch` |
| `approval.*` | Host approval domain | `approval.list`, `approval.reply` |
| `bittensor.*` | Bittensor domain | `bittensor.chat`, `bittensor.readiness` |
| `browser.*` | Browser/control domain | `browser.open`, `browser.snapshot`, `browser.click` |

Avoid legacy `openwork.*` prefixes for new public action ids. Legacy MCP names may remain as compatibility shims, but public docs should use Matterhorn names.

## Desktop UI Bridge Mapping

Current desktop UI bridge tools map directly to this model:

| UI MCP tool | Contract operation |
| --- | --- |
| `ui_snapshot` | returns `MatterhornControlSnapshot` |
| `ui_list_actions` | returns `MatterhornControlActionMetadata[]` |
| `ui_execute_action` | accepts `MatterhornControlExecutionRequest` without `dryRun` today |
| `browser_list_actions`, `browser_snapshot`, `browser_open`, `browser_execute_action` | browser-focused wrappers that only operate on published `browser.*` actions |

Next UI bridge work should:

- expose `dryRun` where actions can validate without acting
- return `requestId` when provided
- keep `requiresConfirmation` and `sideEffect` accurate
- support both `window.__matterhornControl` and legacy `window.__openworkControl` during migration

## Server Bridge Mapping

The server control MCP already exposes high-level tools for status, sessions, files, approvals, and Bittensor. Future generic server actions should not duplicate those immediately. Instead, introduce generic actions only when a workflow needs discovery and execution through a single action list.

Candidate server routes:

| Route | Purpose |
| --- | --- |
| `GET /workspace/:workspaceId/actions` | list server-side actions available to the token |
| `POST /workspace/:workspaceId/actions/execute` | execute one server-side action by id |
| `GET /workspace/:workspaceId/actions/:requestId/status` | poll long-running action status |

Server actions must enforce the same token scopes as the dedicated route they wrap. For example, a `files.write_batch` action must still require collaborator/owner scope and the same approval policy as `matterhorn_write_files`.

## Browser Control Mapping

Browser/control tools should use this contract as a planning layer before low-level browser actions:

1. Inspect app/server state through `matterhorn_status`, `matterhorn_get_session_snapshot`, or `ui_snapshot`.
2. List semantic actions, using `browser_list_actions` for browser-specific work when the UI MCP is available.
3. Execute semantic actions when available.
4. Fall back to browser DOM/click/type only when no semantic action exists.
5. Never use coordinates for destructive, external, or financial actions.

Browser actions should publish `sideEffect` accurately. For example, `browser.snapshot` is `none`, `browser.navigate` is `navigation`, `browser.type` is `mutation`, and any action that submits a trade or external transaction is `external`.

## Safety Requirements

- No action schema may accept seed phrases, mnemonics, private keys, wallet exports, or raw custody material.
- Destructive actions such as delete, overwrite, transfer, trade, sign, broadcast, or send must use `requiresConfirmation: true`.
- External actions must include a plain-English consequence statement in either the action description, dry-run result, or confirmation UI.
- Agents should prefer read-only/session-inspection tools before mutating tools.
- If action metadata is stale, execution must fail safely with a recoverable error.

## Implementation Checklist

Before adding a new browser/control MCP tool:

1. Add or confirm a semantic action id in this contract.
2. Publish action metadata with side effect, arguments, and disabled state.
3. Add focused tests for metadata and execution results.
4. Add docs for client behavior and required confirmation.
5. Verify the action through the desktop bridge or server bridge before adding low-level browser fallback.

## References In Repo

- Desktop action provider: `apps/app/src/react-app/shell/control/control-provider.tsx`
- UI MCP wrapper: `packages/matterhorn-work-ui-mcp/index.mjs`
- Server MCP wrapper: `packages/matterhorn-work-mcp/index.mjs`
- Agent API contract: `docs/agent-control-api.md`
- MCP install guide: `docs/agent-mcp-install.md`
