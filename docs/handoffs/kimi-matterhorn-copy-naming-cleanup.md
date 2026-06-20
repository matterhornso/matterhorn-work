# Handoff: Remove remaining customer-facing OpenWork/OpenCode naming drift

**Owner:** Kimi (coding agent)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/430  
**Branch merged to dev:** `kimi/matterhorn-copy-naming-cleanup`  
**Merge commit:** `195077bc`  
**Merged at:** 2026-06-20T07:34:03Z  
**Scope:** Final sweep of customer-visible copy in the React app to replace OpenWork/OpenCode with Matterhorn Work / Matterhorn-Code / Matterhorn Work engine. Preserved low-level technical identifiers and deliberate debug copy.

## What was built

### Modified files

| File | What changed |
| --- | --- |
| `apps/app/src/react-app/design-system/extension-detail-modal.tsx` | Renamed the UI-control config card heading from `OpenCode` to `Matterhorn-Code`. |
| `apps/app/src/react-app/domains/connections/provider-auth/provider-auth-modal.tsx` | Updated the opencode provider label and all user-facing descriptions to `Matterhorn-Code Zen`; changed the local key-storage note to `Matterhorn Work engine`. |
| `apps/app/src/i18n/locales/en.ts` | Replaced customer-facing OpenCode references in `settings.api_keys_info`, `settings.auto_compact_desc`, `settings.custom_binary_hint`, `settings.environment.footer_hint`, and `settings.environment.validation_reserved` with Matterhorn Work engine copy. |

### Specific copy changes

#### `extension-detail-modal.tsx`

```tsx
// before
<CardTitle>OpenCode</CardTitle>

// after
<CardTitle>Matterhorn-Code</CardTitle>
```

This card shows the JSON config used to connect another MCP client to the local Matterhorn Work engine. The heading now matches the Matterhorn-Code runtime label while the underlying command still references `openwork-ui-mcp` (a technical package name left unchanged).

#### `provider-auth-modal.tsx`

```tsx
// before
opencode: "OpenCode Zen",

// after
opencode: "Matterhorn-Code Zen",
```

User-facing strings updated:

| Before | After |
| --- | --- |
| `Sign in to OpenCode Zen with an API key to unlock paid models alongside the free tier.` | `Sign in to Matterhorn-Code Zen with an API key to unlock paid models alongside the free tier.` |
| `Sign in to OpenCode Zen with an API key from opencode.ai/auth.` | `Sign in to Matterhorn-Code Zen with an API key from opencode.ai/auth.` |
| `OpenCode Zen gives you access to the best coding models. Free models keep working without a key.` | `Matterhorn-Code Zen gives you access to the best coding models. Free models keep working without a key.` |
| `Keys are stored locally by OpenCode.` | `Keys are stored locally by Matterhorn Work engine.` |

Internal identifiers such as `showOpenWorkModelsSubscribe`, `onSubscribeOpenWorkModels`, `OPENWORK_MODELS_PROVIDER_ID`, and the `opencode` provider key were intentionally left unchanged to avoid breaking callers and preserve SDK/provider compatibility.

#### `apps/app/src/i18n/locales/en.ts`

| Key | Before | After |
| --- | --- | --- |
| `settings.api_keys_info` | `API keys are stored locally by the underlying OpenCode runtime...` | `API keys are stored locally by the underlying Matterhorn Work engine runtime...` |
| `settings.auto_compact_desc` | `Controls the underlying OpenCode compaction.auto setting...` | `Controls the underlying Matterhorn Work engine compaction.auto setting...` |
| `settings.custom_binary_hint` | `Use this to point Matterhorn Work at a local OpenCode runtime build` | `Use this to point Matterhorn Work at a local Matterhorn Work engine build` |
| `settings.environment.footer_hint` | `...Configure OpenCode runtime settings from your shell.` | `...Configure engine runtime settings from your shell.` |
| `settings.environment.validation_reserved` | `...names are managed by Matterhorn/OpenCode.` | `...names are managed by Matterhorn Work engine.` |

The environment strings keep the technical env-var prefixes `MATTERHORN_WORK_`, `OPENWORK_`, and `OPENCODE_` because renaming them would break runtime wiring.

## What was intentionally not changed

- `settings.debug_opencode_version`: `"Underlying OpenCode runtime: {version}"` — required by `test:opencode-abstraction-copy` as the deliberate debug-label exception.
- `settings.opencode_engine_sidecar_desc`: `"Local engine process managed by Matterhorn Work. Technical runtime: OpenCode."` — required by `test:opencode-abstraction-copy`.
- Internal TypeScript types and prop names (`OpenCodeConnectDebugCard`, `opencodeConnectCard`, `showOpenWorkModelsSubscribe`, etc.).
- SDK/API names, binary paths, env-var prefixes, and filenames such as `opencode.json`.
- `BittensorPanel.tsx`, crypto route/tool files, market execution/signing files, wellness workflow files, and stale PR #2.

## Test assertions

The existing gates confirm the new copy and the preserved exceptions:

- `test:opencode-abstraction-copy` — asserts `settings.opencode_engine_label` is `"Matterhorn Work engine"`, `settings.opencode_engine_sidecar_desc` contains `"Technical runtime: OpenCode"`, and `settings.debug_opencode_version` is `"Underlying OpenCode runtime: {version}"`.
- `test:matterhorn-brand-assets` — brand asset gate.
- `test:matterhorn-customer-onboarding-ui` — onboarding copy gate.
- `test:customer-readiness-ui` — customer readiness UI gate.
- `test:market-execution-safety-gate` — market safety gate.
- `pnpm --filter @matterhorn-work/app typecheck` — TypeScript typecheck.

## Commands that pass on this PR

```bash
pnpm test:opencode-abstraction-copy
pnpm test:matterhorn-brand-assets
pnpm test:matterhorn-customer-onboarding-ui
pnpm test:customer-readiness-ui
pnpm test:market-execution-safety-gate
pnpm --filter @matterhorn-work/app typecheck
```

## Verification scan

The following scan now returns no matches:

```bash
rg -n '>([^<]*(OpenWork|OpenCode)[^<]*)<|title:\s*["`][^"`]*(OpenWork|OpenCode)|label:\s*["`][^"`]*(OpenWork|OpenCode)|description:\s*["`][^"`]*(OpenWork|OpenCode)' apps/app/src/react-app apps/app/src/app
```

## CI status on merge

All GitHub checks on PR #430 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## Non-overlap observed

No changes were made to:

- `BittensorPanel.tsx`
- Crypto route/tool files
- Market execution/signing files
- Wellness workflow files
- `apps/desktop/**`
- `apps/app/src/react-app/**` outside the two modified files
- Stale PR #2

## Useful references

- PR: https://github.com/matterhornso/matterhorn-work/pull/430
- Runtime abstraction doc: `docs/opencode-runtime-abstraction.md`
- English locale: `apps/app/src/i18n/locales/en.ts`
- Provider auth modal: `apps/app/src/react-app/domains/connections/provider-auth/provider-auth-modal.tsx`
- Extension detail modal: `apps/app/src/react-app/design-system/extension-detail-modal.tsx`
