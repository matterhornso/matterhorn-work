# Matterhorn Account And Public Beta Auth Setup

This document describes the Monday beta account sign-up/sign-in flow for Matterhorn Desks.

## Overview

Matterhorn Desks uses a **Matterhorn Cloud account** (Den) for identity, sync, and cloud features. The auth layer wraps this in a Clerk-compatible abstraction so the UI can use a stable API (`useAuth`, `useUser`, `useClerk`) while the backend provider remains swappable.

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
| `VITE_MATTERHORN_CLOUD_ENABLED` | No | Explicitly enables Matterhorn Cloud account actions. Local builds default to disabled so they never send users to an undeployed hostname. |
| `VITE_MATTERHORN_CLOUD_URL` | Required when Cloud is enabled | Browser sign-in and account control-plane URL. |
| `VITE_MATTERHORN_CLOUD_API_URL` | No | Optional separate API base URL for Matterhorn Cloud. |
| `VITE_MATTERHORN_DEPLOYMENT` | No | Use `web` only for a reviewed browser deployment; desktop is the default. |
| `VITE_MATTERHORN_PUBLIC_BETA` | No | Requires the web deployment mode and turns on public-Beta browser safeguards. |
| `VITE_MATTERHORN_REQUIRE_SIGNIN` | No | Holds public web at sign-in until a Matterhorn Cloud session exists. |
| `VITE_MATTERHORN_WORK_URL` / `VITE_OPENWORK_URL` | No | Protected local/private bridge only. Never set this or a Matterhorn Desks token in a public browser build. |
| `VITE_OPENCODE_URL` | No | OpenCode engine URL. Defaults to `http://127.0.0.1:4096`. |

## Local/offline testing

The desktop and local development layers are designed so testers can use local workspaces without signing in:

- The `BetaAuthProvider` reports `status: "signed_out"` when no Den session exists.
- Without an explicit Cloud URL or `VITE_MATTERHORN_CLOUD_ENABLED=1`, Account shows Cloud as unavailable and hides sign-in, account creation, and manual handoff-code controls.
- The status-bar profile menu shows **Continue offline — local workspaces stay available** when signed out.
- Signing out only clears the Cloud session; local workspaces and their data are untouched.
- The forced-signin gate (`DenSigninGate`) only redirects to `/signin` when the desktop bootstrap config has `requireSignin: true`. For local testing, leave that flag `false`.

## Public Beta web

Public web is not a desktop bridge exposed to the internet. It must require a
Matterhorn Cloud sign-in and send workspace requests only to the authenticated
same-origin proxy. Configure these values in the web deployment, not in the
repository:

```bash
VITE_MATTERHORN_DEPLOYMENT=web
VITE_MATTERHORN_PUBLIC_BETA=1
VITE_MATTERHORN_REQUIRE_SIGNIN=1
VITE_MATTERHORN_CLOUD_ENABLED=1
VITE_MATTERHORN_CLOUD_URL=https://app.matterhorn.example
VITE_MATTERHORN_CLOUD_API_URL=https://api.matterhorn.example
MATTERHORN_APP_URL=https://app.matterhorn.example
```

Do not configure `VITE_MATTERHORN_WORK_URL`, `VITE_MATTERHORN_WORK_TOKEN`,
`VITE_MATTERHORN_WORK_HOST_TOKEN`, or `VITE_OPENCODE_URL` in that public build.
The deployment proxy, not browser code, owns upstream credentials and must
authorize the signed-in user for the selected workspace.

Public web uses a secure HttpOnly Matterhorn Cloud session cookie. Cloud must
allowlist the exact `https://<app-host>/session` return target, and a separate
Cloud API must use credentialed CORS for that exact app origin. The browser
must not receive, persist, or paste a Cloud bearer token or desktop handoff
grant. A request's selected organization or workspace is only a selector; the
proxy must authorize that user-to-project relationship server-side.

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
pnpm test:public-beta-web-readiness
pnpm test:market-execution-safety-gate
pnpm smoke:customer-ready-crypto
```
