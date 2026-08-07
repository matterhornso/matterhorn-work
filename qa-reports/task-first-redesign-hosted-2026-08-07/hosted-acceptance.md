# Matterhorn task-first redesign — hosted acceptance

Date: 2026-08-07

Candidate commit: `74eeea49e33e03c81559614ce7b3c7e6c3a75e0c`

Branch: `codex/task-first-redesign`

Pull request: <https://github.com/matterhornso/matterhorn-work/pull/842>

Production alias: <https://matterhorn-desks-canary.vercel.app>

Immutable deployment: <https://matterhorn-desks-canary-iwixa540f-abhinav-4820s-projects.vercel.app>
Vercel deployment: `dpl_BoogK2fsHTpnDvpQHkh8MiDuTczq`

## Decision

The public, signed-out boundary is accepted. The full authenticated beta remains blocked until the Matterhorn Cloud account service is connected to the Vercel project and a hosted acceptance account is available.

## Proven on the exact candidate

- Vercel production deployment completed and the production alias resolves to the exact candidate. Vercel reports the deployment as `Ready`.
- The root monorepo deployment is reproducible through committed `vercel.json`; the upload boundary is constrained by `.vercelignore`.
- HTTPS and the following headers are present: CSP, COOP, Permissions Policy, Referrer Policy, HSTS, `X-Content-Type-Options`, and `X-Frame-Options`.
- `/llms.txt` returns `text/plain`, a valid H1, public links, and the product's fail-closed action boundaries.
- The public entry has one `main` region, labelled account controls, labelled email/password fields, a clear service error, and an accountable-work complementary region.
- The exact hosted public entry has no horizontal overflow at 375px or 768px. Security and Privacy remain adjacent to account access, and the primary sign-in action remains visible in the first mobile viewport.
- The public Status page no longer claims that unavailable services are running; its descriptive copy is neutral and the probe result reports that no same-origin health endpoint is exposed.
- All five GitHub release checks are green on the exact candidate.
- Focused hosted-boundary tests: 11 passed, 0 failed. App typecheck passed. Vercel's production build passed.

## Lighthouse on the production public boundary

These scores were captured on the immediately preceding `b8d4a024` public boundary. The corrective `74eeea49` commit changes authenticated protocol-desk action typing and static CI contracts only; it does not change the signed-out route. The exact `74eeea49` deployment rebuilt successfully and its alias, content, `llms.txt`, and security headers were rechecked after promotion. Rerun Lighthouse after Cloud/sign-in configuration because that is the next change that can alter the public experience.

| Mode | Performance | Accessibility | Best practices | SEO | Agentic browsing | FCP | LCP | TBT | CLS | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 0.98 | 1.00 | 0.96 | 1.00 | 1.00 | 1.4 s | 1.8 s | 0 ms | 0.003 | 3.4 s |
| Desktop | 0.99 | 1.00 | 0.96 | 1.00 | 1.00 | 0.5 s | 0.6 s | 0 ms | 0.009 | 1.3 s |

Best-practices remains 0.96 because Chrome reports a CSP issue without a URL or actionable detail. The response has a restrictive CSP. The performance opportunity is approximately 24 KiB of unused React vendor JavaScript; it is not a canary blocker at the measured scores.

Evidence:

- `lighthouse-mobile-final.json`
- `lighthouse-desktop-final.json`
- `screenshots/02-public-entry-b8d4a024-full.png`
- `screenshots/03-public-entry-mobile-375-b8d4a024-viewport.png`
- `screenshots/04-public-entry-tablet-768-b8d4a024.png`

The exact public entry was captured at the normal desktop viewport and explicit 375×812 and 768×1024 viewports in the in-app browser. Full-page capture at the temporary 375px viewport returned a blank browser artifact, so the accepted mobile evidence is the viewport capture plus measured `scrollWidth === innerWidth`.

Public-Beta authenticated safety was accepted locally on the same source commit: Home, rail labels, blank-session starters, focused desks, existing-chat protocol rails, and in-chat stages/inputs/outputs all fail closed to research/evidence. Hosted authenticated reproduction still depends on the Cloud inputs below.

## Blocking gates for authenticated beta

1. Configure `VITE_MATTERHORN_CLOUD_URL`, `VITE_MATTERHORN_CLOUD_API_URL`, `VITE_MATTERHORN_CLOUD_ENABLED=1`, and the intended sign-in policy in the Vercel project.
2. Supply one hosted acceptance account, plus a second account for isolation testing.
3. Run authenticated Home, protocol desks, Longevity, MCPs, Settings, real agent completion/provenance, Back/Forward/reload, and two-account workspace/session isolation against the managed engine.
4. Verify backend exact-origin CORS, live `/health/live` and `/health/ready`, monitoring/alert delivery, backup/restore, and rollback evidence.

No real wallet-provider transaction test is required while public-beta reviewed actions remain fail-closed and absent from the UI. If that policy changes, real-provider acceptance becomes mandatory before release.
