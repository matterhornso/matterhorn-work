# Monday Beta Auth Setup

This document describes the Monday beta account sign-up/sign-in flow for Matterhorn Work.

## Overview

Matterhorn Work uses a **Matterhorn Cloud account** (Den) for identity, sync, and cloud features. The Monday beta auth layer wraps this in a Clerk-compatible abstraction so the UI can use a stable API (`useAuth`, `useUser`, `useClerk`) while the backend provider remains swappable.

**Important:** A Matterhorn account is separate from any Web3 wallet you connect inside a protocol workspace. Matterhorn never asks for seed phrases, private keys, or API secrets during sign-up or sign-in.

## Supported flows

- **Sign up** — creates a Matterhorn Cloud account in the browser.
- **Sign in** — connects an existing Matterhorn Cloud account.
- **Sign out** — clears the local session. Local/offline workspaces remain available.
- **Profile menu** — shows account name/email, cloud account link, switch account, sign out.

## Environment variables

The beta auth layer does not require Clerk packages, but it documents the standard Clerk env names so a future Clerk integration is a drop-in replacement.

### Client

| Variable | Required? | Purpose |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | No | Standard Clerk publishable key. If present and a real Clerk provider is wired, the app can use it. The current Den-backed provider ignores this key. |
| `CLERK_PUBLISHABLE_KEY` | No | Build-time fallback for non-Vite tooling. |

### Server (only if you replace Den with Clerk later)

| Variable | Required? | Purpose |
|---|---|---|
| `CLERK_SECRET_KEY` | No | Server-side Clerk secret. **Never expose in client bundles or fixtures.** |
| `CLERK_JWT_KEY` | No | Optional Clerk JWT verification key for the server. |

### Current Den variables

| Variable | Required? | Purpose |
|---|---|---|
| `VITE_MATTERHORN_WORK_URL` / `VITE_OPENWORK_URL` | No | Base URL of the Matterhorn Cloud control plane. Defaults to the desktop local server in desktop builds. |
| `VITE_OPENCODE_URL` | No | OpenCode engine URL. Defaults to `http://127.0.0.1:4096`. |

## Local/offline testing

The beta auth layer is designed so desktop/web testers can use local workspaces without signing in:

- The `BetaAuthProvider` reports `status: "signed_out"` when no Den session exists.
- The status-bar profile menu shows **Continue offline — local workspaces stay available** when signed out.
- Signing out only clears the Cloud session; local workspaces and their data are untouched.
- The forced-signin gate (`DenSigninGate`) only redirects to `/signin` when the desktop bootstrap config has `requireSignin: true`. For local testing, leave that flag `false`.

## Architecture

```
AppProviders
  DenAuthProvider          <-- existing Matterhorn Cloud auth
    BetaAuthProvider       <-- Clerk-compatible wrapper
      DesktopConfigProvider
      ...
        StatusBar
          BetaAuthMenu     <-- profile menu entry point
```

## Components

- `apps/app/src/react-app/domains/auth/beta-auth-provider.tsx` — provider and Clerk-compatible hooks.
- `apps/app/src/react-app/domains/auth/beta-auth-menu.tsx` — profile dropdown menu.
- `apps/app/src/react-app/domains/auth/beta-auth-button.tsx` — sign-in/sign-up CTA button.
- `apps/app/src/react-app/domains/auth/beta-auth-types.ts` — shared types.
- `apps/app/src/react-app/domains/auth/index.ts` — public exports.

## Migration to Clerk (future)

To replace Den with Clerk:

1. Install `@clerk/clerk-react`.
2. Replace `BetaAuthProvider` implementation with `ClerkProvider`.
3. Keep `useAuth`, `useUser`, and `useClerk` call sites unchanged — they are already Clerk-shaped.
4. Remove the Den-specific `openSignIn`/`openSignUp` handlers and let Clerk's components handle the flows.
5. Keep `BetaAuthMenu` and `BetaAuthButton` as thin wrappers, or replace them with Clerk's `UserButton`/`SignInButton`.

## Safety rules

- No seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, or wallet exports in the auth UI or provider code.
- Auth errors are surfaced in the UI (status bar menu and forced sign-in page) rather than swallowed.
- `CLERK_SECRET_KEY` must never appear in client code, fixtures, or committed env files.

## Verification

```bash
pnpm --filter @matterhorn-work/app typecheck
pnpm test:beta-auth
pnpm test:market-execution-safety-gate
pnpm smoke:customer-ready-crypto
```
