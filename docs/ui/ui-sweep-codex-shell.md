# Codex UI Sweep: Shell, Navigation, And Project Context

Date: 2026-07-04
Owner: Codex
Scope: app shell, first-run navigation, project Home, global rail, Settings/Profile entry points, command palette, and cross-surface context. Kimi owns desk workflow depth. Minimax owns Notes/Memory/Outputs evidence clarity.

## Audit Scope

- `/welcome`
- `/session`
- `/workspace/:workspaceId/session`
- `/workspace/:workspaceId/session/:sessionId`
- `/workspace/:workspaceId/settings/general`
- right rail panels: Profile, Wallet, MCPs, Memory, Notes, Artifacts
- command palette project actions

## Product Standard

Matterhorn should feel like a desk-first work operating layer, not a generic AI dashboard. A user should always know:

- which project they are in
- how to get Home
- how to start a new project or chat
- where outputs live
- where notes, memory review, and task logs live
- what is safe before any protocol or workflow action

## Implemented In This Pass

### P0: Engine Offline Copy Exposed Dev Commands

Source: Kimi desk workflow sweep

Surface: workspace/session not-found and workflow launch failure

What the user saw:
The app told customers to run `pnpm dev:matterhorn-local` and open a printed project URL.

Why it hurts:
That is a developer-only recovery path and makes the local web app feel broken or misrouted for normal testers.

Fix:
Replaced the dev command with a customer-facing engine-unavailable message that points to retrying the connection, restarting Matterhorn Desks, or creating/connecting a project.

Files:
- `apps/app/src/react-app/shell/session-route.tsx`
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`

### P1: Home Was Still Too Easy To Miss

Surface: session header

What the user saw:
The right rail and project Home had Home-like behaviors, but a user inside a chat or side panel still had to infer that selecting the workspace or using browser Back would return them Home.

Why it hurts:
The user already reported Back can land them on the welcome/create-project screen. Matterhorn needs an in-app route home that is always obvious.

Fix:
Added a visible `Home` button to the session header whenever a project exists. The header also shows the active project name beside the chat/session title on larger screens.

Files:
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`

### P1: Profile Did Not Open The Actual Control Center

Surface: right rail Profile

What the user saw:
The Profile rail button opened Cloud Account. Task Logs existed in Settings General, but the user had to discover that separately.

Why it hurts:
The requested control center is Profile/Settings plus task logs, project state, model/provider state, support/docs, and cloud status. Opening Cloud Account first makes local users feel like login is mandatory.

Fix:
Changed Profile rail to open the embedded Settings General view. That view already includes Workspace, Global, Help, and Task Logs.

Files:
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
- `apps/app/src/react-app/shell/session-route.tsx`

## Findings For Next Pass

### P1: Project Home Still Needs A Recent Activity Strip

Surface: project Home

Recommended fix:
Show recent activity under the project path card:

- note created
- desk task started
- workflow stage changed
- output saved
- memory suggestion created

Use the existing `/workspace/:id/evidence` route instead of inventing a second log source.

Owner: Codex after Minimax evidence audit lands.

### P1: Desk Empty States Still Expose Too Much Prompt Text

Surface: Bittensor, Hyperliquid, Polymarket, Longevity task launch

Recommended fix:
Replace prompt paragraphs with task cards that show:

- task name
- required public inputs
- expected outputs
- safety boundary
- primary action

The long prompt should be hidden backend metadata or an expandable "details" view.

Owner: Kimi.

### P1: Memory Panel Visual Density Is Not Yet Aligned With MCPs

Surface: Memory right rail

Recommended fix:
Match the MCP visual pattern: compact header, one action row, simple sections, fewer nested outlined boxes, stronger text contrast, and a clearer "Review inbox" state.

Owner: Minimax.

### P2: Command Palette Needs Task Logs

Surface: Cmd/Ctrl+K

Recommended fix:
Add `Open task logs` and `Open project activity` commands once the final activity destination is settled.

Owner: Codex.

### P2: First-Run Login Still Needs A Single Local-First Story

Surface: `/welcome`, `/signin`, create project modal

Recommended fix:
Keep local-only as the default path. Cloud should be clearly optional until Matterhorn Cloud is live. Avoid dead `app.matterhorn.work` assumptions in local builds.

Owner: Codex.

## Acceptance Checklist For Consolidated Sweep

- Home is available in one click from any session, desk, side panel, Settings page, or artifact view.
- Profile opens a real control center, not just cloud auth.
- New Project and New Chat are visible from Home and command palette.
- Outputs always show `outputs/<desk>/<session-slug>/` as the user-facing path.
- Notes, Memory, Outputs, and Task Logs are separate but connected through one project activity model.
- Desk workflows show stages and inputs, not giant prompts.
- All small/narrow layouts avoid clipped text, hidden controls, and trapped side panels.
