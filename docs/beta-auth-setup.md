# Matterhorn Account And Public Beta Auth Setup

This document describes the Monday beta account sign-up/sign-in flow for Matterhorn Desks.

## Overview

Matterhorn Desks uses a **Matterhorn Cloud account** (Den) for identity, sync, and cloud features. The auth layer wraps this in a Clerk-compatible abstraction so the UI can use a stable API (`useAuth`, `useUser`, `useClerk`) while the backend provider remains swappable.

**Important:** A Matterhorn account is separate from any Web3 wallet you connect inside a protocol workspace. Matterhorn never asks for seed phrases, private keys, or API secrets during sign-up or sign-in.

## Supported flows

- **Sign up** — any user creates a Matterhorn Cloud account with their own email. No invite, allowlist, or pre-created test email is required.
- **Email verification** — the identity service sends the verification message and returns the verified user to `/onboarding`.
- **First workspace** — Matterhorn automatically creates and activates a private personal workspace when the account has no organization.
- **Sign in** — connects an existing Matterhorn Cloud account.
- **Return session** — a returning user resumes the active workspace; a sole existing workspace is selected automatically.
- **Sign out** — clears the Cloud session. Local/offline desktop workspaces remain available.
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
| `VITE_MATTERHORN_CLOUD_API_URL` | Required for public Beta | Same-origin account API base. Public Beta must use `https://<app-origin>/api/den`; never a direct backend origin. |
| `VITE_MATTERHORN_DEPLOYMENT` | No | Use `web` only for a reviewed browser deployment; desktop is the default. |
| `VITE_MATTERHORN_PUBLIC_BETA` | No | Requires the web deployment mode and turns on public-Beta browser safeguards. |
| `VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED` | Required for transactional desks | Exposes audited transaction preparation and connected-wallet review paths. It does not allow agent or watch-triggered submission. |
| `VITE_MATTERHORN_REQUIRE_SIGNIN` | No | Holds public web at sign-in until a Matterhorn Cloud session exists. |
| `VITE_MATTERHORN_WORK_URL` / `VITE_OPENWORK_URL` | No | Protected local/private bridge only. Never set this or a Matterhorn Desks token in a public browser build. |
| `VITE_OPENCODE_URL` | No | OpenCode engine URL. Defaults to `http://127.0.0.1:4096`. |

### First-party account email

| Variable | Required? | Purpose |
|---|---|---|
| `MATTERHORN_EMAIL_VERIFICATION_REQUIRED` | Required for public signup | Keeps new accounts signed out until the six-digit email challenge is completed. |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Required for public signup | Verified AWS SES sender address and display name. |
| `MATTERHORN_TURNSTILE_SITEKEY` | Required for public signup | Public Cloudflare Turnstile widget site key returned by `/api/auth/config`. |
| `TURNSTILE_SECRET` | Required for public signup | Server-only Turnstile Siteverify credential. Never expose this in a browser variable. |
| `TURNSTILE_HOSTNAMES` | Required for public signup | Comma-separated exact frontend hostname allowlist. Production must contain only production hosts, never localhost. |
| `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Required for public signup | Server-only AWS SES delivery configuration. No application module outside `@matterhorn-work/email` imports the SES SDK. |
| `AWS_SES_CONFIGURATION_SET`, `MATTERHORN_SES_EVENT_SECRET` | Required for public signup | Emits delivery/bounce/complaint events and authenticates the EventBridge API Destination callback. |
| `MATTERHORN_EMAIL_DEV_MODE` | Local development only | Emits template payloads locally. Production ignores this flag. |
| `MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED` | Required for public signup | Rejects account creation unless the user explicitly accepts the Terms and acknowledges the Privacy notice. |
| `MATTERHORN_TERMS_VERSION`, `MATTERHORN_PRIVACY_VERSION` | Required for public signup | Versions stored with the server-side acceptance record. |

Verification codes expire after 10 minutes. Password reset links expire after
one hour, can be used once, and revoke every active session when the password
changes. Reset requests always return the same response whether or not an
account exists, so the endpoint does not disclose registered addresses.
Account creation, the verification challenge, and its durable outbox row commit
in one SQLite transaction. SES failure leaves the message retryable and returns
the same `202 verification_required` state. Bounces and complaints suppress
future delivery without disclosing whether an address has an account.

## Data portability and deletion

- **Account record** — Settings → Account downloads the signed-in user's profile, legal-acceptance versions and time, organization memberships, and active-session count.
- **Workspace archive** — Settings → Privacy downloads a gzip JSON archive containing complete chat messages and todos, active notes, confirmed memory, the memory review inbox, workspace outputs, generated files, sanitized settings, and a redacted activity snapshot.
- **Integrity and boundaries** — each workspace archive includes SHA-256 integrity metadata and explicit inclusion, exclusion, redaction, and safety-limit disclosures. The export fails rather than silently truncating, and it never follows workspace symlinks.
- **Secret exclusion** — account exports never contain password hashes, session tokens, recovery challenges, or verification codes. Workspace archives exclude authentication material, raw provider credentials, unsanitized configuration, and provider-side logs.
- **Deletion** — Settings → Account supports confirmed account deletion. Workspace-level deletion controls remain scoped to the stores that advertise deletion; append-only accountability history is disclosed separately.

Export account and workspace data before deleting it. A workspace archive contains user content in readable JSON or lossless base64 and should be stored with the same care as the original workspace.

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
VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED=1
VITE_MATTERHORN_REQUIRE_SIGNIN=1
VITE_MATTERHORN_CLOUD_ENABLED=1
VITE_MATTERHORN_CLOUD_URL=https://app.matterhorn.example
VITE_MATTERHORN_CLOUD_API_URL=https://app.matterhorn.example/api/den
MATTERHORN_APP_URL=https://app.matterhorn.example
MATTERHORN_CONTROL_PLANE_URL=https://api-origin.matterhorn.example
MATTERHORN_PROXY_SECRET=<server-only-high-entropy-secret>
MATTERHORN_EMAIL_VERIFICATION_REQUIRED=1
EMAIL_FROM=accounts@matterhorn.example
EMAIL_FROM_NAME="Matterhorn Desks"
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=<ses-only-access-key>
AWS_SECRET_ACCESS_KEY=<ses-only-secret-key>
AWS_SES_CONFIGURATION_SET=matterhorn-transactional
MATTERHORN_SES_EVENT_SECRET=<independent-32-byte-event-secret>
MATTERHORN_TURNSTILE_SITEKEY=<public-turnstile-site-key>
TURNSTILE_SECRET=<server-only-turnstile-secret>
TURNSTILE_HOSTNAMES=app.matterhorn.example
MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED=1
MATTERHORN_TERMS_VERSION=<approved-terms-version>
MATTERHORN_PRIVACY_VERSION=<approved-privacy-version>
```

Do not configure `VITE_MATTERHORN_WORK_URL`, `VITE_MATTERHORN_WORK_TOKEN`,
`VITE_MATTERHORN_WORK_HOST_TOKEN`, or `VITE_OPENCODE_URL` in that public build.
The deployment proxy, not browser code, owns upstream credentials and must
authorize the signed-in user for the selected workspace.

Public web uses a secure HttpOnly Matterhorn session cookie. The exact
`https://<app-host>/onboarding` return target and `/api/den` API both stay on the
app origin. The browser
must not receive, persist, or paste a Cloud bearer token or desktop handoff
grant. A request's selected organization or workspace is only a selector; the
proxy must authorize that user-to-project relationship server-side.

The production identity service must enable self-service email/password account
creation, require email verification, configure a verified transactional-email
sender, and serve the organization plugin endpoint used to create each user's
first personal workspace. Release acceptance uses ordinary user-owned email
addresses; the product must not depend on an owner-maintained list of test
emails.

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

Automated checks verify callback routing, cookie-backed session checks,
personal-workspace naming, organization creation, malformed-response fail
closure, and active-workspace routing. Deployment acceptance must additionally
complete one real new-user signup, verification-email delivery, sign-out,
returning-user sign-in, and password recovery against the deployed identity
service.

```bash
pnpm --filter @matterhorn-work/app typecheck
pnpm test:beta-auth
pnpm test:public-beta-web-readiness
pnpm test:market-execution-safety-gate
pnpm smoke:customer-ready-crypto
```
