# Matterhorn task-first redesign — hosted readiness

Date: 2026-08-08

PR head: `b5c1bfb8d523db06bc4237aa23ca1306111e0ff6`

Implementation commit: `4a6bfe3a1780a96fd2f1456916753818cd3d34d8`

Production alias probed: <https://matterhorn-desks-canary.vercel.app>

## Decision

**Public static boundary: available. Operational authenticated beta: NO-GO.**

The fresh safe deployment probe confirms that the current alias still serves a static SPA without the Matterhorn authenticated same-origin control plane or managed engine. The exact PR head has not been deployed with API commit identity, so this alias cannot supply the hosted evidence required by the redesign goal.

## Passing hosted boundary checks

- HTTPS app and API origin.
- HTTP 200 application response on the configured origin.
- `X-Content-Type-Options: nosniff`.
- Defensive Referrer Policy.
- Camera/microphone Permissions Policy.
- Restrictive CSP for framing, base URI changes, and object embedding.
- Positive HSTS max-age.
- Untrusted-origin CORS challenge is not granted access.

## Blocking results

- `/workspaces` returns `200 text/html` instead of routed JSON `401` or `403`.
- `/opencode/global/health` returns `200 text/html` instead of routed JSON `401` or `403`.
- The API does not report `X-Matterhorn-Build-Commit` for the PR head.
- Trusted-origin CORS does not echo the exact application origin.
- Trusted preflight does not emit `Vary: Origin`.

The machine-readable evidence is [`deployment-probe-b5c1bfb8.json`](deployment-probe-b5c1bfb8.json).

## Required external completion sequence

1. Attach the account/control plane and managed engine to an authenticated same-origin proxy.
2. Configure production-only secrets and the Public-Beta web variables without exposing upstream tokens to the browser.
3. Deploy the exact approved commit with build identity.
4. Rerun the deployment probe until protected routes fail closed as JSON and exact-origin CORS passes.
5. Supply two verified ordinary accounts and run real-result Home/desks/Longevity/MCP/Settings, recovery, and tenant-isolation acceptance.
6. Capture monitoring, backup/restore, rollback, exact deployed Lighthouse, authenticated visual, and physical-device/screen-reader evidence.

No real wallet transaction acceptance is required while Public Beta keeps reviewed actions absent. Enabling those actions changes the release scope and makes supported-provider acceptance mandatory.
