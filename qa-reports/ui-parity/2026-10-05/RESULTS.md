# Earlier-UI parity review — 5 October 2026

## Result and scope

The current retro/compact interface had lost several entry points from the previous layout. This local change restores them through existing components and callbacks. It does not revert the design, activate gated services, change persisted data, or certify live model execution.

Implementation checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-search-discovery-2026-10-02`.
Branch: `codex/search-discovery-2026-10-02`.
Starting commit: `16523ca23ea87422a16c87e6654afcbc0de5202c`.
These parity changes have not been pushed, merged, or deployed in this task.

## Exact earlier UI reference

The last commit before the first retro implementation is **`ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`**: [browse that source](https://github.com/matterhornso/matterhorn-work/tree/ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca).

| Milestone | Commit |
| --- | --- |
| Last pre-retro baseline / parent of first retro commit | `ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca` |
| First retro implementation, opt-in | `edbec86b6717bd30768cdf57a00fa729e9a66ac0` |
| Retro implementation merged in PR #1028 | `9b74d923b8c999733fe698c29a6555dd2980460b` |
| Retro enabled by default | `1a7f19ac7ab86f9a48f8828b4900e75cfc9a09fb` |
| Parent of the earlier optional minimal-layout implementation | `f4863f915f51e4fd0ddbe55800969298860a5c85` |

The pre-retro baseline already contains an optional minimal layout, but it was default-off. Enabling retro also enables the minimal layout. Removing only CSS or the HTML marker therefore does not restore the old layout.

For a current-code legacy-layout build, explicitly set both `VITE_MATTERHORN_RETRO_UI=0` and `VITE_MATTERHORN_MINIMAL_UI=0`, then rebuild. Theme preference remains separate. This is an available rollback path, not a change made here. Do not roll production back to the old source SHA merely to change appearance; that would also remove later security/runtime corrections.

## Parity map

“Retained” means code and entry-point review, not proof that the corresponding external service is configured. The new layout intentionally does not duplicate every old label or permanent rail.

| Earlier element or action | Current location / disposition | Evidence |
| --- | --- | --- |
| Workspace switcher | Left sidebar | Browser + source |
| Workspace creation/setup | Switcher, only when existing shell capability allows it | Source/render; gate unchanged |
| Rename, share, remove workspace | Restored Workspace options | Menu opened; mutations not performed |
| Recover/test/edit remote connection | Same menu, original connection/permission guards | Source/render |
| Reveal workspace in Finder | Same menu, native desktop only | Web absence checked; desktop not exercised |
| Workspace ordering and sidebar resize | Guarded up/down menu actions; resize rail | Source/render; one-workspace preview cannot test reordering |
| New chat and five desks | Left sidebar and desk launcher | Browser; no live-response claim |
| Child/nested chats, activity, loading/error/empty state | Restored shared session tree | Render tests |
| Session rename/delete/context actions | Existing shared session menus; visible on compact layout | Source/render; no deletion performed |
| Long chat history and selected older chat | Show-more; selected root/descendant remains visible | Regression tests |
| Model selection | Header and Settings → Models | Header/settings navigation checked; no provider configured |
| Default model / clear default / reasoning controls | Models → Advanced model and provider settings | Render + browser; same-model payload regression |
| Provider connect/update/disconnect | Same disclosure, self-managed capabilities only | Render/gate checks; no credential operations |
| Allowance and provider policy | Existing disclosures and detailed settings | Browser + render |
| Profile/login/account actions | Profile & account / Settings → Account | Signed-in sample account view inspected; no credential changes |
| Status bar, docs, feedback, profile shortcut | Restored according to saved shell preference | Browser + source contract |
| Browser and Voice | Workspace tools when native/extension capability allows | Source gates; unavailable in this web fixture |
| Coworkers / Files | Workspace tools only when original release flag allows | Source gates; not activated |
| Run history | Restored unconditional Workspace tools entry | Opened Project history and returned to desks |
| Quick Jot | Restored Workspace tools entry; existing command remains | Opened/dismissed desktop and 390px mobile; no note saved |
| Memory Saved / Review / Add / export / controls | Workspace tools → Memory | Empty Saved/Review/Add views inspected; populated actions source-reviewed |
| Notes list/editor/search/tags/save/delete/Memory suggestion | Workspace tools → Notes | Empty panel opened; new explicit docked Close verified; mutations source-reviewed |
| Wallet connections, policies and signing explanations | Workspace tools / Settings → More settings → Wallet | Disconnected views opened; no wallet connection/signing |
| Wallet Network and transaction history | Existing full Wallet page, after connection | Source unchanged from baseline; connected state unverified |
| Integrations, skills and tool configuration | Workspace tools → Integrations / Settings → Tools | Existing routes/actions and capability restrictions reviewed |
| Preferences, permissions, privacy and appearance | Four primary Settings groups | Browser/source; system/light/dark retained |
| Other available legacy settings | Restored More settings, same filtered tab lists | Desktop/mobile browser + regression tests |
| Project goal, custom workflow, create actions, files/outputs | Workspace details disclosure | Expanded in browser |
| Chat attachments, tools, send/stop, agent and execution options | Existing composer and Chat options | Source/regressions; runtime blocked in this preview |
| Drafts, message actions and conversation deep links | Same state stores/routes/callbacks | Source/regressions; no alternate data store |
| Sign-in, signup, verification, reset, public/trust pages | Existing account and public routes | Source/regression coverage; no live inbox flow in this pass |
| Jev, STM, Cloud/billing, generated-media and operator controls | Existing capability/release/consent gates | Not enabled or bypassed |

No UI route/component deletion or rename was found between the pre-retro baseline and the starting head. Core application routing and workspace-route helper blobs were unchanged. This alone did not prove reachable parity; the missing entry points above required repairs.

## Additional defects corrected during review

- Selecting the same provider/model no longer clears its saved reasoning variant. A different provider/model still gets its own default variant.
- The selected chat remains visible when it is beyond the initial three-root preview, including selected descendants.
- Compact session action triggers remain visible; legacy triggers gain visible keyboard-focus treatment.
- Parent-chat list markup uses a list item rather than an invalid wrapper directly under a list.
- Finder reveal is not advertised to web users when the existing handler cannot perform it.
- Status-bar and header-model-picker visibility honor existing shell preferences.

Independent review found no remaining P1/P2 issue in the reviewed parity diff. It covered source, rendered components and selection payloads; it did not certify external services.

## Verification

| Check | Result |
| --- | --- |
| `bun test apps/app/tests` (final run, loopback test servers permitted) | **1,535 passed, 0 failed; 8,825 assertions across 200 files** |
| `pnpm --dir apps/app exec tsc -p tsconfig.json --noEmit` | Passed after final product edits |
| `pnpm --dir apps/app build:web` | Passed; existing >500KB chunk-size warnings remain |
| `git diff --check` | Passed |
| Explicit legacy-layout focused render tests | 10 passed |
| Hosted-policy focused tests | 14 passed |
| Independent parity review tests | 40 passed / 208 assertions before final two preference guards; those guards separately covered in the final suite |
| Codex browser desktop and 390×844 mobile | Restored entry points/navigation/close controls checked; mobile document width390, scrollWidth390 |

Initial full run: two stale exact-source assertions failed after the new heading/disclosure, and three local HTTP tests could not bind sockets in the sandbox. The assertions now check both layout semantics without removing provider/routing checks. The final unsandboxed run allowed disposable loopback test servers and passed all tests. No product behavior was changed to silence those HTTP failures.

Screenshots in this directory: `notes-desktop.png`, `settings-desktop.png`, `settings-mobile.png`, `desks-mobile.png`, `desks-tools-desktop.png`. Existing local sample chats/account data were not changed. Screenshot evidence uses the provider-free local sample, not hosted production.

## Limits and handoff

The preserved preview at `http://127.0.0.1:47931` has no connected model engine/provider. Opening a desk can report “Matterhorn Desks engine unavailable”; this UI parity work does not fix infrastructure configuration or prove live replies. Hosted acceptance, connected-wallet controls, remote-worker recovery, native desktop Browser/Finder, Voice, populated-history mutations, real email flows, Safari/Firefox, and a complete assistive-technology audit remain unverified in this pass.

Do not describe this as “every backend action works.” It restores identified UI functionality while retaining truthful unavailable states and safety boundaries. Review/push the parity changes separately when authorized; deployment remains an owner action. Impeccable/Uncodixfy guided preservation of the retro design and reuse of the existing controls rather than introducing a second implementation.
