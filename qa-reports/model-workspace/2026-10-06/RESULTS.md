# Model selection and local workspace fixes

Model selection now persists without treating a saved preference as permission to send data. The desktop workspace menu exposes separate open and create actions, while the browser explains its local-folder limitation. Opening an existing local folder preserves its workspace configuration. These changes are local only; the user's existing preview, account and chats were not restarted or modified.

## Checkout and isolated preview

- Checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-model-workspace-usability-2026-10-06`
- Branch: `codex/model-workspace-usability-2026-10-06`
- Base: `a5dba9649975f33e6eda614cdf88a81767e20a66`
- Separate signed-in test preview: `http://model-qa.localhost:5173/workspace/ws_web_5e96ed68dae585b3/settings/ai`
- Runtime data: `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-pr1032-functional-uADxur`

The preview binds only to loopback and uses a separate hostname to avoid sharing login cookies with existing localhost previews. The configured CUDOS credential remains in the runtime environment, not in this report or the repository. The disposable account completed normal signup and verification using the local email fixture. This is not hosted acceptance or proof of real inbox delivery.

## Fixes

### Model selection

The model-preference PATCH previously rejected an available model because its provider privacy review was incomplete. That check belongs to execution, not preference storage. The save path now validates connected provider membership and chat compatibility, enforces workspace write permissions, and persists the choice. Prompt, raw-proxy, command, compaction, consent, approval and accounting controls remain unchanged.

If the runtime catalog cannot be checked, changing the preference fails with a recovery message and preserves the existing choice. Saved preferences can still be read or reset. Embedding and reranking models remain unavailable as chat selections.

The Models page shows the saved default, places save failures above the long list, and labels pending provider review without claiming that selection authorizes sending. The prior requested “coming soon” privacy text and training opt-out declaration do not mark unverified provider terms as verified.

### Local workspaces

In the desktop app, the top-left workspace switcher now has:

1. **Open local workspace…** — choose an existing folder. A registered folder is selected through the existing workspace-switch path without rerunning setup.
2. **New local workspace…** — choose a folder; use the native picker's **New Folder** action when needed, then confirm in Matterhorn Desks.
3. **Other workspace options…** — retains the existing remote/shared connection paths.

Browser users see **Local workspaces…**, which explains that local folders require the desktop app and gives those exact steps. It does not expose a filesystem picker, accept arbitrary local paths, or promote unavailable cloud provisioning.

Native initialization previously overwrote `.opencode/openwork.json` when opening an unregistered prior workspace. Initialization now uses exclusive file creation and preserves existing configuration bytes, including metadata, authorized roots and custom settings. Missing configuration is initialized normally; filesystem failures are not silently treated as success. Existing managed-agent/plugin migrations remain outside this change.

## Verification

| Check | Result |
| --- | --- |
| All frontend regressions | 1,549 passed, 0 failed across 202 files |
| Backend model selection, control plane and provider privacy | 907 passed, 0 failed; 6,803 assertions |
| Isolated launcher safety tests | 5 passed |
| Native workspace tests | 14 passed, including 6 new config-preservation cases |
| Frontend and server TypeScript checks | Passed |
| Electron TypeScript and bridge checks | Passed; 50 renderer methods covered by bridge check |
| Electron packaging source gate and native syntax checks | Passed |
| Web production build | Passed; existing large-bundle warnings remain |
| Diff whitespace check | Passed |

The first frontend/backend sandbox runs could not open HTTP listeners. Reruns with localhost-listener permission passed; this was not resolved by relaxing product authentication or privacy controls.

### Browser acceptance

The isolated Chromium preview used a normal disposable account and the configured provider's model catalog. No inference request was submitted.

- First ASI1 selection succeeded and returned to all five desk choices.
- Reloading Models retained ASI1 as **Selected** with the server-persisted preference source.
- A per-chat model change preserved the draft.
- A later Settings model change returned to the same chat URL with its unsent draft intact. ASI1 was restored afterward.
- Browser workspace help opened from the switcher, named the desktop open/create actions and dismissed with Escape.
- Light and dark model screens were inspected at the existing 1280 × 720 preview size. No horizontal page overflow or console errors were observed in the checked flow.
- Privacy status remained unverified. The displayed pending review was not converted into an approval.

Evidence: [selected model in light mode](model-selected.png), [selected model in dark mode](model-selected-dark.png), [draft after model change](draft-after-model-change.png), [local workspace help](local-workspace-help.png).

## Reproduction commands

Run from the checkout above:

```sh
pnpm exec bun --no-env-file test apps/app/tests
pnpm exec bun test apps/server/src/session-read-model.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/provider-privacy.test.ts --timeout 15000
node --test qa-reports/launch/2026-10-05/provider-functional/launch.test.mjs
node --test apps/desktop/electron/workspace-config.test.mjs apps/desktop/electron/workspace-archive.test.mjs apps/desktop/electron/remote-workspace.test.mjs
node scripts/electron-packaging-sources.test.mjs
pnpm --dir apps/app exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/server exec tsc -p tsconfig.json --noEmit
pnpm --filter @matterhorn-work/desktop typecheck:electron
pnpm --filter @matterhorn-work/desktop check:electron
pnpm --dir apps/app build:web
git diff --check
```

`prepare-account.mjs` creates a disposable account only in the isolated QA runtime; `verify-selection.mjs` performs a read-only saved-selection check. Credentials remain in an owner-only file outside the repository. The initial attempt to bind a second loopback IP was abandoned; the working launcher binds `127.0.0.1` and advertises the isolated `model-qa.localhost` hostname instead.

## Remaining release checks

- Native folder-picker behavior has source and fixture-test coverage, but was not exercised in the installed desktop app. Package this branch and validate open/create/cancel with disposable folders in an isolated desktop profile before releasing it.
- Mobile, tablet, 200% zoom, Safari and Firefox were not newly exercised. The current browser viewport was deliberately left unchanged to preserve the user's preview.
- Model persistence is verified; a successful real model response on every desk is not established by this test. Provider policy, request consent and host approval remain separate requirements.
- No commit, PR, push, merge, deployment, production configuration change, signup activation, wallet signing or secret migration was performed for this work.
