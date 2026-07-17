# Matterhorn Work Public Beta Launch

This is the release contract for a public, desktop-first Matterhorn Work Beta
with an authenticated web companion. It is intentionally stricter than a
named-tester Beta: a public download or browser link is not a go signal until
every required gate has fresh evidence for one immutable candidate.

## Current Candidate Snapshot - 2026-07-17

- The source checkpoint used for the local desktop artifacts below is
  `a2382305277e5b7b946ea14a61e79ebf53da8034`. The current PR head and generated
  machine-readable readiness packet are authoritative for final release.
- Consolidated draft:
  [PR #831](https://github.com/matterhornso/matterhorn-work/pull/831)
  targeting `dev`.
- Source-checkpoint CI: macOS, Ubuntu, i18n, customer crypto, and the full
  Matterhorn platform-safety workflow all pass.
- Local unsigned macOS preflight:
  `qa-reports/product-hunt-local-preflight-a2382305/`. Packaging, updater
  metadata, checksums, release doctor, and clean-profile smoke pass.
- Public decision: **NO-GO**. The unsigned preflight does not satisfy public
  distribution. Authenticated HTTPS deployment, two-user isolation, real
  wallet and OAuth acceptance, signing/notarization/stapling, operations
  drills, legal approval, and staffed support still require external evidence.

## What Public Beta Includes

- Signed Matterhorn Work desktop builds for the approved public platforms.
- A web app that requires a Matterhorn Cloud sign-in before private workspace
  access.
- The stable chat, project, desk, notes, memory, output, wallet-read, and
  preview workflows covered by the release gates.
- Hyperliquid only after its separate wallet-approved **testnet** acceptance
  record passes. Chat, watches, MCP, and CLI automation never place an order.

## What Stays Out Until Separately Accepted

- Any browser build that exposes an engine, backend URL, client bearer token,
  or host token.
- A connector that has not passed connect, reload, tool-call, disconnect, and
  revoked-account behavior on the deployed candidate.
- Billing, generated-media publishing, Sui mainnet publishing, and Matterhorn
  Cloud collaboration if their feature flags and acceptance evidence are not
  complete.
- Polymarket live submission, agent-submitted orders, seed phrases, private
  keys, raw signatures, or wallet exports.

## Public Web Architecture

The public web app is an authenticated client, not a public remote-control
surface for a shared Matterhorn Work engine.

1. A visitor creates an account or signs in with Matterhorn Cloud.
2. Matterhorn Cloud returns to the exact allowlisted app URL with a secure,
   HttpOnly browser session. The browser receives no Cloud bearer token.
3. The deployment validates that signed-in session at the same origin.
4. The same-origin proxy authorizes the user for a workspace and proxies both
   root Matterhorn API calls and `/opencode` calls upstream.
5. Any upstream service credentials remain server-side. The browser receives
   neither a Matterhorn Work bearer token nor a host token.

The browser return target is `${MATTERHORN_APP_URL}/session` (or its deployed
equivalent) and must be allowlisted by Matterhorn Cloud. If the Cloud API is on
a different origin, it must allow credentialed requests from the exact app
origin, return the exact origin in `Access-Control-Allow-Origin`, and never use
`*` with credentials. The proxy must independently authorize every
`user -> organization -> workspace` request; organization or workspace IDs in
browser headers and URLs are selectors, never authorization proof.

Set these deployment variables for the public web build:

```bash
VITE_MATTERHORN_DEPLOYMENT=web
VITE_MATTERHORN_PUBLIC_BETA=1
VITE_MATTERHORN_REQUIRE_SIGNIN=1
VITE_MATTERHORN_CLOUD_ENABLED=1
VITE_MATTERHORN_CLOUD_URL=https://app.matterhorn.example
VITE_MATTERHORN_CLOUD_API_URL=https://api.matterhorn.example
MATTERHORN_APP_URL=https://app.matterhorn.example
```

Leave these unset in the public build:

```text
VITE_MATTERHORN_WORK_URL
VITE_MATTERHORN_WORK_PORT
VITE_MATTERHORN_WORK_TOKEN
VITE_MATTERHORN_WORK_HOST_TOKEN
VITE_OPENWORK_URL
VITE_OPENWORK_PORT
VITE_OPENWORK_TOKEN
VITE_OPENWORK_HOST_TOKEN
VITE_OPENCODE_URL
```

Run the configuration contract with real deployment values loaded only from the
secret manager. Its output contains variable names and readiness state, never
secret values:

```bash
mkdir -p qa-reports/public-beta
pnpm test:public-beta-web-readiness
pnpm gate:public-beta-web --json \
  --json-output qa-reports/public-beta/public-web-config.json
```

Passing this command proves configuration rules only. It does not prove that a
hosted Cloud control plane, reverse proxy, payment provider, connector, wallet,
or signed desktop artifact exists.

## Required Evidence

Run the public-Beta channel gate to list the exact current requirements:

```bash
pnpm launch:readiness --channel public-beta --list-gates --json
```

Attach fresh evidence for the exact release commit, then evaluate it:

```bash
pnpm launch:readiness --channel public-beta \
  --evidence qa-reports/public-beta/evidence.json \
  --strict --json \
  --json-output qa-reports/public-beta/readiness.json
```

The public channel requires, at minimum:

- A stable immutable tag, complete platform-safety gate, and release review.
- Deployed HTTPS, exact-origin CORS, CSP/security-header checks, monitoring,
  backup/restore proof, and a real rollback rehearsal.
- Public web authenticated same-origin acceptance with a new user and a
  returning user.
- Session-cookie acceptance: sign in, refresh, sign out, expired-session
  redirect, malformed desktop deep link rejection, and an unauthorized
  workspace probe all behave correctly on the deployed hostname.
- MetaMask, Coinbase Wallet, Phantom Sui, and Hyperliquid testnet acceptance
  where those surfaces are visible.
- Signed, notarized, stapled desktop artifacts; clean-install and update
  acceptance; and a public download resolving to that exact artifact.
- Approved public copy, terms, privacy policy, support channel, launch-room
  owner, and incident escalation path.

The existing external-acceptance evaluator is shared with the Product Hunt
release because the user, wallet, and OAuth requirements are intentionally the
same. Use its example payload as the evidence shape, then map its fresh report
into the Public Beta channel evidence:

```bash
node scripts/product-hunt-acceptance-evidence.mjs \
  --evidence qa-reports/public-beta/external-acceptance.json \
  --strict --json \
  --json-output qa-reports/public-beta/external-acceptance-readiness.json
```

## Go / No-Go

**GO** only when the strict Public Beta channel report is `GO`, every public
surface is genuinely deployed, and the release owner can name the exact tag,
desktop artifact checksums, web URL, support owner, monitoring dashboard, and
rollback owner.

**NO-GO** when any evidence is stale, locally simulated, missing, tied to a
different commit, or cannot demonstrate session-to-workspace authorization.
Do not replace a missing external proof with a fixture, screenshot, or
optimistic release note.
