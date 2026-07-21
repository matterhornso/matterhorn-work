# Matterhorn Desks Full-Platform User Acceptance Test Cases

Date: 2026-07-21

Status: execution source of truth for desktop and web public-beta acceptance

## Purpose

These cases verify that Matterhorn Desks behaves correctly for a real user. A
control passes only when it produces the intended result, persists the correct
state, reports failures clearly, and leaves auditable backend evidence where
appropriate. A click without an observed outcome is not a pass.

## Release Safety Rules

- Use dedicated test identities and isolated workspaces.
- Use Base Sepolia, Sui testnet, and Hyperliquid testnet only.
- Do not broadcast Bittensor or Polymarket transactions during acceptance.
- Never record seed phrases, private keys, wallet exports, API keys, bearer
  tokens, raw signatures, or signed payloads in screenshots or reports.
- Do not classify provider-dependent or extension-dependent coverage as passed
  unless the real provider or extension completed the journey.
- Reproduce every release-blocking defect twice before filing it.
- After a fix, rerun the failed case, its nearest regression cases, and the
  platform safety gate.

## Required Test Matrix

Run each applicable case in these environments:

| Environment | Viewport | Required state |
| --- | --- | --- |
| macOS desktop | 1440 x 900 | clean install and returning user |
| Web desktop | 1440 x 900 | new and returning user |
| Web compact laptop | 1180 x 760 | returning user |
| Web tablet | 834 x 1112 | returning user |
| Web mobile | 390 x 844 | smoke and layout only |

Test dark, light, and system themes on at least one desktop environment. Test
keyboard-only navigation and 200% zoom on the web desktop environment.

## Result Record

Record one row per case and environment:

| Field | Required value |
| --- | --- |
| Case ID | Exact ID below |
| Candidate | Full commit SHA and app version |
| Environment | Desktop/web, browser/runtime, OS, viewport |
| Result | PASS, FAIL, BLOCKED, or NOT APPLICABLE |
| User outcome | What the user could or could not complete |
| UI evidence | Screenshot or video path |
| Backend evidence | Request, persisted record, task event, or log reference |
| Console/network | Relevant error or `none` |
| Cleanup | State restored, test output retained, or not required |
| Defect | Issue ID for every FAIL |

## A. Installation, Boot, And First Run

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| BOOT-001 | Clean desktop install | Install the signed/notarized candidate on a clean macOS profile and launch it | Gatekeeper accepts it; one app window opens; no terminal is required; version matches the candidate |
| BOOT-002 | Desktop relaunch | Quit normally, relaunch, then force-quit and relaunch | The same workspace list returns without corruption or duplicate processes |
| BOOT-003 | Web first visit | Open the public URL in a clean browser profile | A usable first-run/project surface appears; no localhost, raw backend, or stack-trace copy is visible |
| BOOT-004 | Backend unavailable | Start the UI without the engine, then restore the engine | UI shows one calm recoverable state; retry/reload restores functionality without losing the draft |
| BOOT-005 | Slow boot | Delay engine responses beyond the normal loading threshold | Stable loading UI appears; no blank canvas or layout shift; timeout offers a working retry |
| BOOT-006 | Unsupported route | Open an unknown route and a stale workspace/session URL | User is returned to a valid owning surface with a clear message; no dead-end screen |
| BOOT-007 | Refresh deep link | Hard-refresh session, desk, settings, output, and panel URLs | Route and selected workspace survive refresh or redirect safely to the nearest valid surface |
| BOOT-008 | Offline transition | Disconnect network after load, use local features, then reconnect | Local features remain usable; remote actions explain offline state; reconnect restores remote status |
| BOOT-009 | Branding | Inspect favicon, title, visible product name, installer, app menu, and About/version UI | Public-facing copy says Matterhorn Desks; legacy internal labels are not shown as product names |
| BOOT-010 | Secret-free failure | Trigger a handled boot/provider error | No token, filesystem credential, stack trace, raw provider internals, or secret-shaped value appears |

## B. Workspace And Project Lifecycle

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| WS-001 | Create local project | Choose New project, authorize a folder, name it, and open it | Project opens at the selected folder; sidebar and header use the chosen name; backend lists it once |
| WS-002 | Cancel creation | Open and cancel project creation at each step | No workspace, permission, or stray recent item is created |
| WS-003 | Duplicate folder | Attempt to add an already-connected folder | Existing project is selected or a clear duplicate message appears; no duplicate workspace record |
| WS-004 | Rename project | Rename from every exposed entry point, reload, and restart | New name appears everywhere and persists; folder path is unchanged |
| WS-005 | Forget project | Forget a disposable project and confirm the warning | Project disappears from Matterhorn only; source files remain on disk; another project becomes active |
| WS-006 | Project switch | Switch repeatedly between two projects with distinct sessions, notes, and outputs | Each project shows only its own state; no cross-project leakage |
| WS-007 | Folder permission loss | Revoke folder access while open, then restore it | Writes are blocked with a clear recovery action; restoring permission resumes work safely |
| WS-008 | Project home actions | Use New chat, New project, New note, folder reveal/copy, outputs, and run history | Every action opens the correct owning surface and produces its intended result |
| WS-009 | Empty project home | Open a project with no tasks, sessions, notes, memory, or outputs | Empty states are concise, useful, and contain one clear next action |
| WS-010 | Returning project | Restart after creating content in two projects | Last valid selection and each project's durable state return correctly |
| WS-011 | Remote/shared affordances | Inspect web and desktop workspace controls | Unsupported remote/shared controls are hidden or explicitly unavailable; no false success path |
| WS-012 | Workspace diagnostics | Open authorized folders/runtime diagnostics and run available checks | Results match actual permissions/runtime state and copy/download actions return valid content |

## C. Shell, Navigation, And Layout

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| NAV-001 | Primary navigation | Visit Home, session, each desk, Settings, Notes, Memory, Outputs, Wallet, and MCPs | Active location is visually and programmatically indicated; Back returns to the owning surface |
| NAV-002 | Sidebar collapse | Collapse and reopen the left sidebar at all desktop widths | Content reflows without overlap; icon controls retain accessible names and tooltips |
| NAV-003 | Right panel lifecycle | Open every right-side panel, switch panels, close, and use browser Back/Forward | One panel owns the rail; URL state is accurate; close returns focus to the opener |
| NAV-004 | Narrow panel | Open Profile, Wallet, Outputs, Notes, Memory, and MCPs at tablet width | Text wraps normally; controls remain reachable; no horizontal clipping or one-character columns |
| NAV-005 | Mobile layout | Exercise primary navigation and open/close panels at 390 px | No incoherent overlap or horizontal overflow; essential commands remain reachable |
| NAV-006 | Keyboard traversal | Tab through shell, sidebar, header, canvas, composer, and panel | Order follows visual flow; focus is visible; no trap except an open modal; Escape closes overlays |
| NAV-007 | Browser history | Navigate through five distinct surfaces then use Back/Forward | History restores the expected surface without stale panel or workspace state |
| NAV-008 | Status bar | Use Docs, Feedback, Wallet, and Profile/Settings actions | Correct surfaces open; labels and tooltips name the action; no unrelated settings page appears |
| NAV-009 | Theme consistency | Compare left shell, main canvas, right panel, modal, and settings at all themes | The same Matterhorn token system, contrast, typography, radius, and interaction hierarchy is used |
| NAV-010 | Zoom and text scaling | Test 125%, 150%, and 200% browser zoom and app text density | Content remains operable and readable; no clipped buttons, hidden labels, or overlapping controls |

## D. Chat, Sessions, Composer, And Model Controls

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| CHAT-001 | New session | Create a chat, send a prompt, wait for completion, then reload | User and assistant messages persist in order; session title/list update once |
| CHAT-002 | Multiline composer | Type, paste a long document, add line breaks, scroll, edit, and submit | Composer grows to its cap, preserves text, remains labelled for assistive tech, and submits once |
| CHAT-003 | Empty submit | Press submit with empty/whitespace-only content | Nothing is sent; layout does not jump; no empty session is created |
| CHAT-004 | Attach file | Attach supported text/image files, remove one, submit, and reopen | Attachment state is visible; request includes intended files; output/message remains available |
| CHAT-005 | Unsupported/oversize file | Attach an unsupported and an oversized file | Submission is blocked with concise remediation; no partial upload or hidden failure |
| CHAT-006 | Stop generation | Start a slow response and choose Stop generating | Request aborts promptly; partial response is stable; a new prompt can be sent without reload |
| CHAT-007 | Retry failed response | Force a provider error, inspect the alert, retry after recovery | Failure is announced as an alert; retry creates one successful continuation, not duplicates |
| CHAT-008 | Reload during response | Reload while a response is active | State reconciles correctly; response is not duplicated; retry/recovery is truthful |
| CHAT-009 | Jump controls | Build a long transcript and use Jump to start/finish | Small controls appear only when useful, move to the exact boundary, and do not obscure content |
| CHAT-010 | Session list | Create, rename, switch, and delete disposable sessions | Selection, list ordering, and persistence are correct; delete requires confirmation and removes one |
| CHAT-011 | Discuss mode | Select Discuss and request a file/system mutation | UI and backend prevent tools/mutations; response stays advisory; audit records the mode |
| CHAT-012 | Plan mode | Select Plan, ask for implementation, then hand off to Work | Plan cannot mutate; explicit Work handoff retains context and enables only approved work tools |
| CHAT-013 | Work mode | Select Work and perform a safe disposable file task | Tool call is visible, scoped, approved where required, and produces the expected file/result |
| CHAT-014 | Mode persistence | Change mode, switch sessions/projects, reload, and return | Mode persists per session without leaking to another session |
| CHAT-015 | Perspective | Test Cautious, Balanced, and Optimistic with the same prompt | Selected perspective is visually distinct, request metadata changes, and response style follows it |
| CHAT-016 | Reasoning effort | Test each supported effort level, reload, and change model | Selection persists only where supported; unsupported models explain limits without false controls |
| CHAT-017 | Model picker | Search, select, cancel, set workspace default, and clear override | Current/default labels stay accurate; selection affects the next request; cancel changes nothing |
| CHAT-018 | Provider missing | Disconnect the selected provider and send a prompt | User sees a provider-specific recovery action; no endless spinner or raw provider exception |
| CHAT-019 | Commands/tools menu | Open each category, load entries, select a safe item, and dismiss | Menu is legible, keyboard operable, closes correctly, and inserts/executes the intended command |
| CHAT-020 | Concurrent sessions | Run two safe prompts in separate sessions, switch rapidly, and stop one | Status and output stay bound to the correct session; stopping one does not stop the other |
| CHAT-021 | Copy/revert/fork | Copy a message, revert to a prior user message, and fork a session | Clipboard content is exact; revert/fork produces the intended transcript without mutating the source |
| CHAT-022 | Feedback | Submit worked-well, felt-rough, rating, comment, bug, and request feedback | Each record persists locally with correct target metadata and never claims training use by default |

## E. Desk Discovery And Task Execution

Run DESK-004 through DESK-010 for every visible task in every desk, not only one
sample task. Record each task title as a child result.

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| DESK-001 | Desk landing pages | Open Bittensor, Hyperliquid, Polymarket, Sui, and Longevity | Correct logo, name, scope, readiness, and 10+ meaningful task choices appear without overflow |
| DESK-002 | Desk explanation | Open each desk info affordance and disclosure | Copy clearly distinguishes read, preview, prepare, review/sign, and submit boundaries |
| DESK-003 | Provider unavailable | Disable each live provider and reopen its desk | Tasks remain truthful: fallback/read-only behavior is named or execution is disabled with setup action |
| DESK-004 | Task start | Start each task, provide required inputs, and observe session creation | One task session starts with correct agent, prompt, mode, and visible progress |
| DESK-005 | Task result | Let each task complete and inspect the result | A substantive user result appears, not only “started”; sources/fallback status are labelled |
| DESK-006 | Task evidence | Open history/output from each completed task | Matching task events and outputs exist with the correct desk, session, timestamp, and workspace |
| DESK-007 | Required input | Start tasks needing an address, market, validator, wallet, or client input | The input is requested before execution, validated, retained, and never replaced by a fixture silently |
| DESK-008 | Invalid input | Submit malformed, empty, unsupported-network, and unsafe values | Execution is blocked before provider/tool use with a specific, non-technical correction |
| DESK-009 | Cancellation/retry | Cancel one task mid-run, retry, and start another | State transitions are accurate; no duplicate output; retry can finish normally |
| DESK-010 | Reload/reopen | Reload during and after each task, then open it from History | Running/waiting/completed state restores and result remains accessible |
| DESK-011 | Bittensor boundary | Run balance, subnet, validator, stake-preview, and handoff journeys | Only public SS58 data is read; staking stays unsigned/preview-only; no signer claim or broadcast |
| DESK-012 | Hyperliquid manual execution | Prepare an exact testnet order, review exact terms, sign, submit, and inspect receipt | Only the user-triggered ticket submits; signed intent is short-lived; agents/watches cannot submit |
| DESK-013 | Hyperliquid rejection | Reject, expire, alter, or switch network during an exact order | Submission stops; ledger records the reason; stale intent cannot be reused |
| DESK-014 | Polymarket boundary | Research, compliance-check, and prepare a draft | Live/fixture source is truthful; blocked compliance hides executable fields; no Matterhorn submission |
| DESK-015 | Sui read/preview | Connect supported wallet, read testnet balance, preview transfer, reject, then approve safely | Account/network are correct; signing remains in wallet; receipt/output reflects actual outcome |
| DESK-016 | Longevity workflow | Complete every intake question including VO2 max/endurance, finish stages, and open result | Progress, validation, restart, persistence, and final non-medical plan/output all work |

## F. Wallet, Policy, And Safety Ledger

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| WAL-001 | MetaMask availability | Test with extension absent, locked, wrong network, rejected, and connected | Each state has a specific action; no raw Wagmi error; account/network update after connection |
| WAL-002 | Coinbase availability | Repeat WAL-001 with Coinbase Wallet | Behavior and labels match the actual connector, not a generic injected-wallet success |
| WAL-003 | Injected wallet | Connect another supported injected wallet, disconnect, and reconnect | Correct account is used; stale account state clears; disconnect persists after reload |
| WAL-004 | Phantom/Sui | Test absent, locked, wrong network, rejected, and connected Phantom/Sui | Get/enable action is present only when needed; Sui address/network/balance update correctly |
| WAL-005 | Connector error translation | Force provider-not-found, user rejection, locked wallet, and unsupported-chain errors | Friendly actionable alerts appear; no package version, stack, or internal code is exposed |
| WAL-006 | Policy validation | Enter empty, negative, zero, nonnumeric, huge, and decimal transaction/slippage limits | Invalid values are rejected inline; previous policy remains active; no malformed backend write |
| WAL-007 | Save Base policy | Save valid Sepolia limits, reload page/app, and fetch backend policy | Values persist exactly; success is clear; controls state that policy is Base-only |
| WAL-008 | Mainnet lock | Attempt to select/enable Base mainnet without release authorization | Mainnet remains blocked; no route or request bypass enables it |
| WAL-009 | Per-transaction block | Simulate an amount above the configured limit | Approval cannot open/submit; ledger records the blocked review without a wallet signature |
| WAL-010 | Daily-limit block | Submit approved test transactions until the daily limit would be exceeded | Crossing transaction is blocked; current spend reflects only eligible approved/sent value |
| WAL-011 | Slippage block | Preview a swap above and below max slippage | Above-limit request blocks before signature; below-limit request may proceed to explicit review |
| WAL-012 | Simulation failure | Force gas/simulation failure before approval | User sees sanitized reason; no wallet prompt; ledger records simulation failure |
| WAL-013 | Approval reject | Open review and reject | Nothing is sent; modal closes safely; ledger records rejected with exact reviewed context |
| WAL-014 | Approval success | Approve a Sepolia test transaction and complete wallet send | Reviewed chain/value/recipient match sent request; transaction and ledger receipt persist |
| WAL-015 | Chain switch during review | Change wallet chain after review opens, then approve | Submission is blocked or re-reviewed on the new chain; no reviewed/sent chain mismatch |
| WAL-016 | Stale recipient | Resolve an address, replace it with invalid input, and approve | Previous recipient cannot be reused; approval is blocked |
| WAL-017 | Ledger density | Inspect collapsed ledger then expand each event | Default rows show concise status/date/value; technical reason, chain, source, and audit data are available on demand |
| WAL-018 | Protocol disclosures | Expand every protocol and signing/privacy row | Status and boundary copy are accurate, keyboard operable, and hidden by default |
| WAL-019 | Wallet persistence | Reload and restart after connecting/disconnecting and policy changes | Safe state restores; the app never persists private keys, seed phrases, or raw signatures |
| WAL-020 | Cross-project isolation | Save different policy/ledger states in two projects | Each project exposes only its own policy and safety ledger |

## G. Notes, Memory, Outputs, And Generated Media

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| NOTE-001 | Quick Jot | Open Quick Jot, enter title/body/tags, cancel once, then save | Cancel writes nothing; save creates one note with exact fields and timestamp |
| NOTE-002 | Full note editor | Create, edit, auto-save, reload, and delete a disposable note | Content persists without duplicates; delete removes only the selected note |
| NOTE-003 | Search/filter | Search by title/body/tag and exercise every desk/output/memory filter | Results match query and project; clear returns the complete list; no layout collapse |
| NOTE-004 | Empty/large notes | Test blank save and a long note with long unbroken content | Blank validation is clear; long content wraps, scrolls, and persists without clipping |
| MEM-001 | Memory suggestion | Trigger a safe memory suggestion from chat | Candidate appears in Needs review; nothing is silently saved |
| MEM-002 | Remember/edit/reject | Save one suggestion, edit-save another, and reject a third | Counts and saved records match each action; rejected content is not in chat context |
| MEM-003 | Manual memory | Add valid memory and attempt secret-shaped/clinical-sensitive content | Valid item persists; prohibited content is blocked or clearly warned per policy |
| MEM-004 | Forget/export | Forget a saved memory and export the bundle | Forgotten item leaves context/export; export contains only approved public-safe metadata |
| OUT-001 | Output list | Open Outputs with mixed images, receipts, JSON, and text files | List is grouped/readable, selection is stable, and current item is announced |
| OUT-002 | Output preview | Preview each supported type and an unsupported/corrupt file | Supported content renders correctly; unsupported/corrupt content has a safe fallback, not a blank grey box |
| OUT-003 | Output actions | Copy path, add note, reveal/download, open externally, and delete a disposable output | Each action performs exactly its label; remote/desktop differences are truthful; delete confirms |
| OUT-004 | Receipt formatting | Open Bittensor/Sui/Hyperliquid/Polymarket receipts | Important fields are human-readable and truncated safely; raw JSON is optional disclosure |
| OUT-005 | Output isolation | Switch projects while Outputs is open | Panel updates to owning project; no stale output is opened or deleted |
| MEDIA-001 | Generate image | Generate an image from chat and open its output | A real preview loads with correct aspect ratio and filename; no indefinite grey placeholder |
| MEDIA-002 | Media failure | Force provider timeout/invalid media URL then retry | Clear retryable state appears; retry loads or reports a final actionable error |
| MEDIA-003 | Publishing readiness | Inspect image, storage, Sui minting, and listing readiness | Setup ownership is explicit; unavailable actions cannot be invoked; mock is labelled mock |
| MEDIA-004 | Diagnostics/report | Run diagnostics and copy/download the report | Report matches runtime config, is redacted, and does not perform upload/sign/mint/list actions |

## H. MCPs, Tools, And External Connectors

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| MCP-001 | Managed server truth | Refresh Matterhorn Desks, Wallet, and Crypto MCP rows | Ready means a successful live health/tool-list check, not merely configured state |
| MCP-002 | Managed server details | Expand every active server row | Branded purpose, endpoint ownership, available tool count, and safe status are accurate |
| MCP-003 | Coding-client config | Select Codex, Claude Code, Claude Desktop, and Cursor; copy each config | Generated syntax/path/command matches the selected client and excludes secrets |
| MCP-004 | MCP catalog rows | Expand every Matterhorn MCP definition and copy/install commands | Description, tools, clients, and safety limits match the actual server implementation |
| MCP-005 | Refresh failure | Stop one server and refresh | Only that server becomes unavailable; count/names update; recovery action works after restart |
| MCP-006 | Add custom MCP | Add a disposable valid MCP, reload engine, invoke a safe tool, then remove it | Config persists, tool works, removal clears it, and reload status is truthful |
| MCP-007 | Invalid MCP | Add malformed URL/command/auth and test | Validation blocks unsafe config or reports exact setup issue without exposing secrets |
| MCP-008 | OAuth connector allowlist | Inspect all external connector cards | Only acceptance-tested connectors are actionable; others are visually subdued and say Coming soon |
| MCP-009 | OAuth lifecycle | For every public connector: connect, reload, safe tool call, revoke externally, recover, disconnect | UI and backend state match each phase; revoked access never remains falsely connected |
| MCP-010 | Tool authorization | Attempt a tool outside the selected chat mode/desk allowlist | UI and backend both deny it; denial is auditable and cannot be bypassed by client payload |
| MCP-011 | Branding | Inspect visible managed server/app labels | User-facing labels say Matterhorn Desks/Matterhorn MCP, not legacy internal package names |
| MCP-012 | Marketplace | Open marketplace/coming-soon state | It cannot imply installability before launch; keyboard/focus and responsive layout remain sound |

## I. Settings And Preferences

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| SET-001 | Settings index | Open every index tile and use Back to app | Each tile routes to the named owner; Back returns to prior project/session |
| SET-002 | Preferences | Toggle model reasoning, compaction, modes, perspective, and effort controls | Each supported value persists and affects subsequent requests; unavailable values are not selectable |
| SET-003 | Permissions | Add/remove authorized folders and test read/write boundaries | Runtime access changes accordingly; unrelated folders remain inaccessible |
| SET-004 | AI provider connect | Connect a disposable provider credential through the secure modal | Provider health and model catalog update; credential is stored only in approved local/secret storage |
| SET-005 | AI provider invalid key | Submit invalid/blank key, retry valid, then disconnect | Invalid state is actionable; valid state works; disconnect removes availability and stored secret |
| SET-006 | Model default | Set/clear workspace default and local session override | Labels, picker, and next request routing agree; clearing falls back to actual engine default |
| SET-007 | Provider catalog | Inspect counts/sample models and force catalog failure | Counts match backend; failure has retry and never claims unavailable models work |
| SET-008 | Appearance themes | Switch Light, Dark, and System; change accent and density | Selection persists; system follows OS; all major surfaces meet contrast and layout requirements |
| SET-009 | Customization | Change every enabled shell visibility/branding option and reload | Enabled settings update the owning UI and persist; disabled branding fields do not imply save |
| SET-010 | Updates desktop | Check for update in current, newer, offline, and failed states | Version/channel are correct; desktop-only label is accurate; retry/install state is safe |
| SET-011 | Updates web | Open Updates in web | Desktop-only functions are hidden/disabled with concise ownership; no native API error |
| SET-012 | Overview actions | Exercise Profile, technical readiness, data policy links, feedback, memory, notes, appearance, workspace, diagnostics, and privacy actions | Every action opens its owning surface and reflects current backend state |
| SET-013 | Copy diagnostics | Use Copy command/report and paste into a safe scratch file | Clipboard contains complete redacted command/report; button confirms success |
| SET-014 | Data paths/privacy | Compare displayed paths/policy with actual workspace/runtime storage | Local paths are truthful on desktop; web does not expose local filesystem paths or internal branding |
| SET-015 | Billing visibility | Exercise plan, test checkout, portal, usage, and readiness states | Test mode is unmistakable; no real charge; unsupported live billing cannot be invoked |
| SET-016 | Generated media route | Open from index and direct URL, including missing workspace | Correct connected workspace loads; missing workspace offers recovery without endless loading |
| SET-017 | Settings persistence | Change settings, switch project, reload/restart, and return | Workspace settings remain scoped; global settings remain global; no cross-scope leakage |

## J. History, Tasks, Reload, And Recovery

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| RUN-001 | Task event lifecycle | Start, wait, resume, finish, and fail disposable tasks | History shows correct ordered events and current state; counts update without reload |
| RUN-002 | Run detail | Open every event/output/action in a run | Detail belongs to the selected run and exposes relevant result/evidence without raw internals |
| RUN-003 | Reload idle engine | Choose Reload now with no active work | Engine restarts once, reconnects, and preserves projects/sessions/drafts/settings |
| RUN-004 | Reload active engine | Reload with active work, then cancel and retry after stopping | UI blocks or coordinates safely; no orphaned run; eventual reload completes |
| RUN-005 | Reload timeout | Force restart timeout, use Retry/Reload now, then restore backend | Action genuinely retries; toast updates; user is not trapped in repeated stale timeout state |
| RUN-006 | Crash recovery | Kill backend during a task and restart | UI marks interrupted state truthfully; safe retry is possible; no false completion/output |
| RUN-007 | Restore backup | Restore a production-shaped backup into a separate target | Projects, chats, notes, memory, outputs, tasks, and policy reconcile with integrity checks |
| RUN-008 | Rollback | Roll back between two immutable candidates and reopen existing data | Supported data opens safely or migration warning blocks; rollback evidence records exact commits |

## K. Accessibility, Visual Quality, And Usability

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| A11Y-001 | Accessible names | Inspect every icon-only control, input, combobox, tab, disclosure, and editor | Each exposes a unique useful accessible name; placeholder is not the only label where persistent context is needed |
| A11Y-002 | Roles/states | Inspect dialogs, alerts, tabs, navigation, current page, expanded, selected, busy, and disabled states | Native/ARIA semantics match visual state and update live |
| A11Y-003 | Error announcements | Trigger form, provider, chat, wallet, and reload errors with a screen reader | New errors are announced once and focus remains usable |
| A11Y-004 | Focus management | Open/close every modal, menu, and right panel using keyboard | Initial focus is sensible; focus is trapped only in modals and returns to opener |
| A11Y-005 | Contrast | Measure text, icons, focus, disabled, selected, danger, success, and interactive surfaces in all themes | WCAG AA contrast is met for required content; controls remain distinguishable from canvas |
| A11Y-006 | Reduced motion | Enable reduced motion and use transitions/loading/scroll controls | No essential state depends on animation; motion is removed or reduced |
| UX-001 | Text density | Review every page and panel at first glance | Routine explanations are concise or disclosed; primary task/action is apparent within five seconds |
| UX-002 | Interactive contrast | Compare every clickable row/button/input against its parent background | Interactivity is discoverable through tonal contrast, icon/action language, hover, and focus without box-heavy borders |
| UX-003 | Healthy silence | Inspect connected/ready/empty normal states | Healthy states do not dominate; warnings/errors are reserved for action-required conditions |
| UX-004 | Copy truthfulness | Audit setup, beta/limited, handoff, prepare, review/sign, submit, connected, ready, and unavailable labels | Every label names who acts next and what actually works; no aspirational functionality is presented as live |
| UX-005 | No visual breakage | Screenshot every route at all required viewports | No overflow, clipping, overlap, blank preview, stretched logo, inconsistent icon, or nested-card wall |
| UX-006 | Latency feedback | Exercise all actions lasting over one second | Immediate progress is visible; controls prevent duplicate submission; completion/failure is unambiguous |

## L. Security, Privacy, And Backend Contracts

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| SEC-001 | Workspace authorization | Call file/session/output routes with another workspace ID and traversal variants | Backend rejects cross-workspace/path traversal; no existence or content leaks |
| SEC-002 | Host/auth/CORS | Test missing/wrong host token, bearer, Origin, and preflight against production-shaped server | Requests fail closed; exact allowed origin succeeds; credentials are never reflected |
| SEC-003 | Mode tampering | Send client payload that broadens tools or contradicts backend mode | Backend overwrites/denies it and records the denial |
| SEC-004 | Desk allowlists | Prompt each desk to use shell, filesystem, generic web, or another desk's tools | Tool is unavailable/denied even if model attempts it |
| SEC-005 | Prompt injection | Put tool instructions/secrets requests in files, outputs, web/provider content, and user prompts | Agent treats them as untrusted data; safety boundary holds |
| SEC-006 | Secret detection | Submit secret-shaped strings in notes, memory, feedback, logs, reports, and evidence export | UI warns/blocks where required; redacted evidence contains no secret value |
| SEC-007 | Wallet non-custody | Search persisted stores, logs, outputs, and network payloads after wallet journeys | No seed, private key, wallet export, or reusable raw signature is stored |
| SEC-008 | Approval integrity | Tamper recipient/value/chain/calldata between simulation, review, and send | Integrity check blocks the send and records a safe audit event |
| SEC-009 | Rate/size limits | Exceed prompt, upload, note, output, feedback, and API rate/size limits | Backend bounds resource use and returns handled errors without data loss |
| SEC-010 | Injection/encoding | Use HTML, script, markdown links, control characters, SQL-like text, and long Unicode in user fields | Content is rendered/escaped safely; no execution or layout takeover |
| SEC-011 | Delete/export scope | Export/delete notes, memory, outputs, and workspace state | Operation affects only intended project/user records and is reflected after reload |
| SEC-012 | Logging hygiene | Inspect browser console, desktop logs, backend logs, diagnostics, and crash reports | Logs are useful, redacted, bounded, and do not include sensitive prompts by accident |
| API-001 | Health/capabilities | Query health, capabilities, data map, providers, wallets, MCP, and policy APIs | Responses match visible UI and candidate version; unavailable dependencies are explicit |
| API-002 | Session persistence | Create/update/abort/reload sessions through UI and inspect backend | State machine and timestamps are consistent; idempotent retries do not duplicate records |
| API-003 | Concurrent writes | Edit note/settings/policy from two tabs and reload | Conflict behavior is deterministic; user is warned or latest accepted write is consistent |
| API-004 | Schema/error handling | Return missing, additional, malformed, and old-version fields from a test backend | UI uses safe defaults or a handled incompatibility message, never crashes silently |

## M. Performance, Operations, And Release Acceptance

| ID | User journey | Actions | Required outcome and evidence |
| --- | --- | --- | --- |
| PERF-001 | Cold load | Measure clean first load on production build | Main shell is visible and usable within target; no long blank screen; bundle requests succeed |
| PERF-002 | Long session | Open a 200-message mixed-content session and scroll/search/respond | Scrolling remains smooth; no runaway memory/CPU; composer input remains responsive |
| PERF-003 | Large project | Load 100 sessions, 100 notes, 100 memories, 100 outputs, and task history | Lists remain responsive and bounded; filtering produces correct results |
| PERF-004 | Repeated navigation | Cycle all settings/panels/desks 20 times | No progressive slowdown, duplicate subscriptions, duplicate requests, or leaked overlays |
| OPS-001 | Production deployment | Run strict deployment smoke against exact candidate URL/commit/origin | HTTPS, commit identity, routing, CORS, CSP, HSTS, and security headers all pass |
| OPS-002 | Monitoring alert | Trigger a safe test error/latency alert | Dashboard records it and staffed destination receives it within target |
| OPS-003 | Public desktop artifact | Verify signing, notarization, stapling, archive, checksum, clean install, update, reinstall, and download | Every check binds to the exact candidate; public download hash matches release evidence |
| OPS-004 | Legal/support | Open Privacy, Terms, Support, Docs, Feedback, and report-issue links | All are public HTTPS, current, readable, and routed to staffed ownership |
| OPS-005 | Final owner acceptance | Run the strict owner-acceptance command with fresh evidence | Command returns `GO` for the exact deployed commit/tag; any mismatch is a stop-ship |

## Automated Verification Commands

Run after fixes and before owner acceptance:

```bash
pnpm --dir apps/app typecheck
pnpm --dir apps/server typecheck
pnpm test:matterhorn-platform-safety
```

Also run the complete app and server suites and production builds using the
commands referenced by the platform safety gate and release ledger. Preserve
raw reports under ignored `qa-reports/`; do not commit credentials or mutable
production evidence.

## Defect Closure Loop

1. Testing agent executes the cases and files one defect per distinct root
   cause with case IDs, severity, exact reproduction, evidence, and observed
   versus expected behavior.
2. Full-stack engineering agent fixes only confirmed defects, adds regression
   coverage, and reports affected contracts and data migrations.
3. A different testing agent reruns every failed case plus adjacent regression
   cases on the same candidate and environment.
4. Open or partially fixed defects return to step 2. Do not mark a defect closed
   from code inspection alone.
5. Any code change creates a new candidate. Rerun typechecks, complete tests,
   production builds, platform safety, deployed smokes, and final owner
   acceptance before launch.

## Severity And Launch Rule

- P0: security breach, secret/key exposure, wrong-wallet/wrong-chain send,
  irreversible data loss, or launch-wide outage. Immediate NO-GO.
- P1: primary journey cannot complete, false safety/provider claim, persistent
  data corruption, inaccessible core action, or unhandled crash. NO-GO.
- P2: important secondary failure with a safe workaround. Owner must explicitly
  accept or fix before public launch.
- P3: cosmetic/polish issue that does not impair comprehension, safety, or task
  completion. May enter the post-launch backlog with evidence.

Public launch requires zero open P0/P1 defects, explicit disposition for every
P2, fresh evidence for all release-critical cases, and a strict final owner
acceptance result of `GO` for the exact candidate.
