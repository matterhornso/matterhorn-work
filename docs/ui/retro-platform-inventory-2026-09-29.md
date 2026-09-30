# Retro platform surface and action inventory

Source baseline: `d941e234843ab0e6c5832bc34e315016e0a1d6f2`. Scope: first three slices of the [rollout plan](platform-retro-rollout-plan-2026-09-29.md). An inventory row is not acceptance. UI status and backend acceptance must be recorded separately.

All source paths below are relative to `apps/app/src/react-app`, except shared primitives (`apps/app/src/components/ui`) and tokens (`apps/app/src/styles/retro.css`). Routes verified from `shell/app-root.tsx`; settings dispatch from `shell/settings-route.tsx`. Settings visibility remains controlled by launch/deployment/permission gates; file existence is not a capability.

## Routes and embedded surfaces

| Entry / route | Implementation | Actions / authoritative boundary | Delivery disposition |
| --- | --- | --- | --- |
| `/` | app-root | Redirect to `/session`, retain auth | Core regression |
| `/session`, `/workspace/:workspaceId/session` | shell/session-route; session/chat/session-page | Workspace selection, New chat, model settings, five desk choices, recent chat, tools | Core; existing retro, authenticated check required |
| `/session/:sessionId`, workspace-prefixed equivalent | same; session/surface | Send, Stop, retry, model change, attach, tools, rename, approvals, history | Core; real provider evidence required |
| `/workspace/:workspaceId/history` | shell session/history route | Open/filter existing conversations | Existing implementation; subsequent full-route QA |
| `/settings/*`, `/workspace/:workspaceId/settings/*` | shell/settings-route | Alias and selected workspace resolution | Core models; other pages later |
| Models `ai` | settings/pages/ai-view, minimal-models | Search/provider filter, persist default, selected state, privacy disclosure, refresh/connect | Core; PATCH model-selection before navigation |
| `overview`, `general`, `preferences` | settings pages | Workspace metadata, preferences, save/error | Secondary slice |
| `privacy`, `appearance` | settings pages | Memory/notes/outputs navigation, privacy, theme/language/font preferences | Shared geometry already present; full mutations later |
| `permissions`, `environment`, `advanced` | settings pages | Authorized folders, scoped config, approved operator actions | Capability-gated; never expose by restyling |
| `skills`, `extensions/*` | settings and connections domains | List/install/remove/configure supported tools; permission/auth boundaries | Secondary slice; hosted permissions unchanged |
| `cloud-account`, `cloud-marketplaces`, `cloud-workers`, `cloud-providers` | cloud/settings pages | Existing supported organization/worker/provider actions | Feature/role-gated; no promotions enabled |
| `shell`, `updates`, `recovery`, `debug` | settings pages | Desktop UI, runtime update/recovery/debug | Desktop/operator-only acceptance pending |
| `wallet` | wallet pages; WalletPanel | Connect, inspect, disconnect, review supported actions | Styling baseline only; signing excluded |
| `generated-media`, `marketplace`, `billing` | respective settings pages | Existing gated workflows | Keep gates; later conditional QA |
| `/notes`, `/workspace/:workspaceId/notes` | route aliases; notes/notes-page | Search, add, edit, save, discard/delete, export | Supported data remains accessible; secondary slice |
| Session Memory panel | memory/memory-panel | Search, saved/review, capture, confirm/edit/dismiss, delete/export | Explicit confirmation retained; secondary slice |
| Session tools/panels | session/surface and artifacts/agent-files | Wallet, notes, memory, integrations, supported outputs/preview/download | One contextual panel; secondary slice |
| `/workspace/:workspaceId/crypto-apps` | crypto-apps | Browse/filter/details/connect; setup/unavailable | Secondary slice |
| `/workspace/:workspaceId/evidence-proofs` | evidence proof route | View/verify supported evidence | Secondary slice |
| `/developer/crypto-apps` | developer | Catalog submissions/configuration under access gates | Later gated slice |
| `/coworker-access` | coworker access route | Authorized access/invitation flow | Preserve gates; later slice |
| `/signin` | cloud/public-web-signin | Sign in, create, recover; config controls availability | Existing retro; actual email/auth acceptance separate |
| `/onboarding`, `/welcome` | onboarding | Supported workspace/account setup, model setup | Later full-route QA; model handoff core |
| `/privacy`, `/terms`, `/security`, `/support`, `/status` | public/public-trust-route | Trust navigation, Back to app, accurate status/support | Existing retro; later full route/copy QA |
| Unknown routes | UnknownRouteRecovery | Recover to a supported route | Regression boundary |
| STM, voice/media/browser, coworkers and messaging | gated domain components | Only existing supported controls | No enabling, vault migration or secret access |
| Desktop overlay/native host | apps/desktop and shared renderer | Drag regions, native dialogs, menus, offline connection | Requires packaged/native environment; not web acceptance |

## Core action checklist

| Action | Required result | Evidence requirement |
| --- | --- | --- |
| First model selection | Save confirmed by server, then five desks | Synthetic denied/mismatched/slow save; local persistence/reload |
| Later settings model selection | Return to same conversation/draft; selected model used | Local route/draft check; no global stale override |
| Header model selection | Label/check agree; draft unchanged; chat-specific choice retained | Keyboard and normal-user interaction |
| Search/provider filter | Displayed names and identifiers match; embeddings excluded | Regression test; both themes/narrow width |
| Desk choice | One action opens composer; no home flash | Existing routing tests plus normal-user flow |
| Suggestion | Editable draft only; no request until Send | Composer regression and local interaction |
| Real request, all five desks | Assistant answer; crypto live tool/source/freshness; holds settle | Per-desk environment/request/tool/outcome record |
| Failed request | Draft preserved, actual error, safe retry | Controlled failure tests; no forced duplicate live sends |
| Stop/approval | Stop actual request; explicit approval boundary unchanged | Fixture cancellation/approval and runtime regressions |
| Reload/back/forward | Same chat/model; no lost draft | Authenticated local navigation |

## Shared component register

| Existing owner | Gap / work | Acceptance |
| --- | --- | --- |
| button, input, textarea, select, field | Reuse controls instead of hand-stamped input slots; retain variants | Light/dark, disabled, invalid, focus |
| composed Button render targets | Stable shared marker survives Base UI replacing `data-slot` on trigger/close | Dialog Done retains 2px border/hard shadow; flag-off unchanged |
| input-group | Add one shared retro outline/focus boundary; no nested borders | Text and textarea, invalid/disabled, reduced motion |
| command/autocomplete | 44px options, explicit selected check, labelled search, highlight contrast | Keyboard, long labels, empty states |
| dialog, sheet, popover, dropdown/context menu | Existing retro portal tokens, Base UI focus/return focus | Existing tests plus core-model regression |
| tabs, checkbox, switch, radio/toggle | Existing semantics; untested variants retained in backlog | Do not certify unused variants by inheritance |
| alert, empty, skeleton, progress, toast | Preserve roles/live regions and actual request state | Core failure/loading; remaining states later |
| table, scroll-area, separator | Existing theme tokens; long tool/message payloads | Core response/overflow; full output inventory later |
| sidebar and header | Existing anchored shell/mobile drawer | Keyboard/narrow preview; no duplicate model label |

## MCP reference and license register

Read-only retrieval 29 September: `input-group`, `command`, `alert`, backend `base`, from the user-supplied paid Neobrutalism MCP. Public references: `https://neobrutalism.com/docs/components/{name}`. Metadata only; no source hash applies because no source was imported. Existing Matterhorn/Base UI controls remain implementation owners. The registry command would add `cmdk`; we deliberately retain the app's current Base UI autocomplete instead of installing a competing primitive. Pro source redistribution remains unverified, so no paid block source or derivative is copied. No tokens/registry install URLs belong in this repository.

## Coverage rules

Both themes, 390/768/1280px plus actual 650px Codex viewport; keyboard/focus, long names, reduced motion and enlarged text. Browser-engine fixtures are not native Safari. Successful component callbacks are not live agent acceptance. This inventory covers route families and action categories; exhaustive secondary-page button/state enumeration remains in slices D–G, not silently counted complete here.

Current execution evidence and exact limits: [29 September worklog](../../qa-reports/retro-ui/2026-09-29/WORKLOG.md) and [superseding runtime acceptance](../../qa-reports/retro-ui/2026-09-29/runtime-acceptance/RESULTS.md). The original preview's missing usage database was left untouched. A separate enforced runtime subsequently completed real ASI1 responses on all five desks, settled usage, and passed authenticated mobile/desktop checks. This is local real-provider acceptance, not hosted acceptance or completion of the secondary-page inventory.
