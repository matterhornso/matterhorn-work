> This handoff is written for a CEO-level reviewer (e.g., Codex). It states what
> was built, why, and how to verify it.

# Monday Beta Auth Flow — Kimi handoff

## What was built

A beta-ready account sign-up/sign-in/profile identity layer for Matterhorn Work.

- **Clerk-compatible auth provider** (`apps/app/src/react-app/domains/auth/beta-auth-provider.tsx`):
  - Wraps the existing Den (Matterhorn Cloud) auth provider.
  - Exposes `useAuth`, `useUser`, and `useClerk` with Clerk-shaped return values.
  - Supports `checking` / `signed_in` / `signed_out` states and surfaces errors.
  - No secrets, keys, or signing material in the provider.
- **Profile menu** (`apps/app/src/react-app/domains/auth/beta-auth-menu.tsx`):
  - Signed-out state: Sign in, Create account, Continue offline note.
  - Signed-in state: account name/email, Cloud account link, Switch account, Sign out.
- **Auth button** (`apps/app/src/react-app/domains/auth/beta-auth-button.tsx`):
  - Standalone sign-in/sign-up CTA with loading and signed-in states.
- **Type definitions** (`apps/app/src/react-app/domains/auth/beta-auth-types.ts`).
- **Public exports** (`apps/app/src/react-app/domains/auth/index.ts`).
- **Status-bar wiring** (`apps/app/src/react-app/domains/session/chat/status-bar.tsx`):
  - Replaced the raw Den sign-in button with `BetaAuthMenu`.
- **Provider wiring** (`apps/app/src/react-app/shell/providers.tsx`):
  - Added `BetaAuthProvider` inside the existing `DenAuthProvider`.
- **Documentation**:
  - `docs/beta-auth-setup.md` — env vars, local/offline testing, Clerk migration path.
  - `docs/handoffs/kimi-beta-auth.md` — this handoff.
- **Test**:
  - `scripts/beta-auth.test.mjs` — static contract gate for the auth layer.
  - `pnpm test:beta-auth` package.json script.

## Why

Monday beta testers need a clear, trustworthy account path. The existing Den auth worked but was hidden behind a single status-bar button and mixed Cloud-account language with the rest of the app. This layer gives testers a recognizable profile menu, makes the distinction between Matterhorn account and Web3 wallet explicit, and keeps local/offline testing possible.

## Safety decisions

- No seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, signed orders, or wallet exports are requested or displayed.
- Sign-in/sign-up always delegates to the browser-based Cloud control plane.
- Sign-out only clears the Cloud session; local workspaces remain.
- `CLERK_SECRET_KEY` is documented as server-side only and never included in client bundles.

## Owned files changed

- `apps/app/src/react-app/domains/auth/*` (new)
- `apps/app/src/react-app/shell/providers.tsx`
- `apps/app/src/react-app/domains/session/chat/status-bar.tsx`
- `docs/beta-auth-setup.md`
- `docs/handoffs/kimi-beta-auth.md`
- `package.json` (one script addition)

## Files intentionally not touched

- `apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx`
- Protocol desk/sidebar/launcher files (other than the status-bar auth button)
- `scripts/wellness-creator-workflow*`
- Settings page implementation files
- `apps/app/src/react-app/domains/cloud/den-auth-provider.tsx`
- `apps/app/src/react-app/domains/cloud/den-signin-surface.tsx`
- `apps/app/src/react-app/domains/cloud/forced-signin-page.tsx`
- Stale PR #2

## Verification

```bash
pnpm --filter @matterhorn-work/app typecheck
pnpm test:beta-auth
pnpm test:market-execution-safety-gate
pnpm smoke:customer-ready-crypto
```

All passed locally.

## Clerk migration note

The abstraction uses Clerk env names (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and Clerk-shaped hooks so a future Clerk provider can be swapped in without changing call sites. The current implementation is backed by Den because Clerk is not installed and a full Clerk integration would risk destabilizing the app before Monday beta.
