# Matterhorn public discovery deployment handoff

Prepared 2 October 2026. **Local candidate only; not published or approved for deployment.** Canonical product: `https://desks.matterhorn.so`. This release improves public discovery, not agent execution, email, backups or overall beta readiness.

## 1. Candidate and ownership

- Repository: `https://github.com/matterhornso/matterhorn-work`.
- Local branch: `codex/search-discovery-2026-10-02`.
- Base: `e4342d6bef8d833d12e36bd8093a87c8dbe84856`.
- Tested implementation checkpoint: `d242f7429cdcd9444c1f2f3e9ff85f43144126db` (full build/typecheck and generated artifact SHA verified). Later commits update a frontend test assertion and documentation; obtain the final full branch SHA for CI/release as described below.
- Earlier changes: `6724f8e43b` foundation; `5ee558608b76f8b75e04c9aa451f0f40f384bc48` generated guides and publication gate. Later documentation/content review commits must accompany the final reviewed candidate; obtain its full SHA from `git rev-parse HEAD` and record it before release.
- No PR, push, merge or deployment was performed in this work block. The branch may not exist on GitHub yet. Do not assume pulling `dev` includes this work. Owner must authorize publication of the tested branch as a reviewable PR; CI/review must pass before merge/deployment.
- Tech team: release configuration, canonical routing, preview isolation, post-deploy HTTP and normal-user acceptance. Product/content owner: claims and examples. Security/privacy owner: data boundaries and optional tracking. Growth owner: verified webmaster properties and later editorial/distribution work.

## 2. What changes

Seven static HTML routes: `/learn`, `/learn/private-ai`, `/learn/bittensor`, `/learn/hyperliquid`, `/learn/polymarket`, `/learn/sui`, `/learn/check-an-ai-crypto-answer`. They include answer-first text, read-only sample prompts, limitations, source links, canonical/social metadata and limited Organization/WebSite/WebPage/BreadcrumbList JSON-LD. Existing Matterhorn logo, themes and retro styling are reused. No new frontend dependency, analytics, third-party tracking or database migration.

Build integration emits these routes, XML sitemap and robots file after the web build. An identical `learn.html` artifact supports extensionless local preview entry; Vercel has explicit route rewrites. Both repository-root and app-root Vercel configurations are updated. API/proxy routes and authenticated app state remain unchanged. Sign-in includes an Explore the desks link. Generic app-shell HTML receives `noindex, follow` and does not become the canonical for private routes.

**Deploy this as a coupled release. Do not ship the SPA noindex preparation alone while omitting the public guides.** The root remains app/account entry; `/learn` is the public product guide destination. Unknown routes still use the preexisting SPA fallback with noindex; this is not a global HTTP404 redesign.

## 3. Reproduce checks in a clean candidate checkout

Use repository `AGENTS.md` and pinned pnpm10.27.0. Do not copy local secrets, private chats, provider credentials or the developer's preview data. From repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test scripts/search-discovery-audit.test.mjs apps/app/scripts/build-public-guides.test.mjs
pnpm exec bun test apps/app/tests/customer-branding-copy.test.ts apps/app/tests/theme-bootstrap.test.ts apps/app/tests/public-trust-routes-contract.test.ts apps/app/tests/public-beta-web-deployment.test.ts apps/app/tests/public-auth-client.test.ts apps/app/tests/public-web-auth-errors.test.ts
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
git diff --check
```

Latest local results: Node20pass; **full frontend1304pass/8030assertions across187files** with loopback permission for synthetic HTTP tests; typecheck and full web build pass on the implementation checkpoint. Run `pnpm --filter @matterhorn-work/app test` for the full frontend suite in addition to the scoped commands above. One assertion was updated from the old navigation label to require the new labelled group containing Explore the desks, Security and Privacy. Three initial server-start failures disappeared with approved loopback access; they were environment failures, not ignored tests.

Safety-gate wiring contract, bundle-budget test and actual built bundle-budget gate pass. This is **not** a rerun of the full multi-stage backend/platform safety suite or hosted runtime acceptance. Existing circular chunk/large app-bundle/Polkadot annotation warnings remain. Guides do not load the authenticated app bundle. If Bun is absent, use the repository-supported test runtime setup; do not silently omit those tests. CI now includes the Node discovery suite in the existing platform-safety job; actual GitHub CI remains unrun because nothing has been pushed.

Local evidence: `qa-reports/search-growth/2026-10-02/PROGRESS.md`, `local-http-audit.json`, `FINISH-REVIEW.md`, `DESIGN-CONFORMANCE.md` and captures. Browser checks cover all seven navigation destinations, desktop/mobile/forced-dark/legacy variants and first-tab focus. Actual200% browser zoom, saved/system-theme transitions, Safari and Firefox remain unverified; complete or explicitly waive with owner sign-off. There is no hosted sign-off from these local checks.

## 4. Publication gates and Vercel configuration

| Setting | Preview / default | Canonical production after approval |
| --- | --- | --- |
| `MATTERHORN_SEARCH_INDEXABLE` | unset or `0` | `1` |
| `VERCEL_ENV` | Vercel-provided preview/development | Vercel-provided `production` |
| Guide robots meta | `noindex, follow` | `index, follow, max-image-preview:large` |
| Sitemap | valid XML, zero URLs | exactly seven canonical guide URLs |
| Noncanonical hostname | `X-Robots-Tag: noindex, follow` | still noindex, even for a production-build alias |
| App/session/unknown SPA routes | noindex | noindex |

The flag is build-time; changing it requires a new build. Do not forge `VERCEL_ENV=production` on a preview to circumvent the gate. Keep canonical origin `https://desks.matterhorn.so`. Optional guide build metadata reads `VITE_MATTERHORN_BUILD_COMMIT`, requiring a full40-character hexadecimal SHA. Record Vercel deployment ID and source SHA independently regardless of the optional HTML marker; the marker is not an attestation.

For repository-root Vercel project: root `vercel.json`, command `pnpm --filter @matterhorn-work/app build:web`, output `apps/app/dist`. For app-root project: `apps/app/vercel.json`, command `pnpm run build:web`, output `dist`. Inspect the actual project's root and existing overrides; do not switch projects or overwrite unrelated environment variables. Preserve API destinations, cookies, CSP, wallet rules and auth configuration.

Publication conditions: content-owner claims review (including model fallback qualification noted in the ledger), approved canonical public pages, passing CI, actual candidate routing and product onboarding usable. Do not activate signup, change provider policy or advertise all desks as live to make this checklist green. Those require separate operational decisions and acceptance.

## 5. After a separately approved deployment

Run from the released checkout; these commands make bounded unauthenticated reads, never send secrets and never follow redirects:

```sh
node scripts/search-discovery-audit.mjs https://desks.matterhorn.so
```

For the actual HTTPS preview origin, substitute that clean origin and add `--preview`. A redirect is reported for investigation; verify the intended destination manually. A preview build should have an empty sitemap. For a noncanonical alias serving an approved production build, use `--production-alias`: the checker expects its shared seven-URL production sitemap but requires a general noindex HTTP header on every audited response. Use the mode matching the build artifact; a production build with publication disabled uses preview expectations plus a manual alias-header check.

The checker combines multiple robots tags, recognizes `none` and crawler-specific index restrictions, checks root/session general noindex, and compares robots.txt with this release's simple reviewed policy. It is a bounded release diagnostic, not a complete HTML/XML/robots parser. Intentional changes to crawler policy may trigger findings requiring manual review; do not weaken a real policy merely to pass. Official semantics: [Google robots meta/header rules](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

Acceptance record must include timestamp, full source SHA, deployment ID, host and result for each item:

1. Canonical `/learn` and all six child routes return200 HTML, correct title/H1/canonical, visible content without application JavaScript, matching schema, correct styles/logo/theme assets and no contradictory noindex header after publication approval. Also verify trailing-slash forms; generated directory indexes and explicit allowlisted Vercel rewrites keep them on the same guide with the same slashless canonical. Only seven canonical URLs belong in the sitemap.
2. `/sitemap.xml` is XML containing only the seven canonical routes. `/robots.txt` is plain text with the intended sitemap reference, not the SPA. robots/noindex are discovery controls, never privacy controls.
3. Preview and noncanonical aliases return noindex. Test the actual edge; unit tests cannot prove Vercel host-rule application. Ensure a CDN or firewall does not replace guide HTML with a challenge for legitimate unauthenticated readers. Any firewall change needs separate authorization; do not bypass controls.
4. `/session`, login/recovery/settings and a disposable test workspace URL must not expose private content unauthenticated or be advertised in sitemap/llms/schema. Inspect recovery using disposable tokens only; never put real token URLs into reports or diagnostics. Auth must still reject protected API requests. Do not infer isolation from noindex.
5. Follow Explore the desks → guide → Open app → normal login → persisted model → each desk. Confirm drafts, back navigation and current sessions behave normally. Complete a real selected-model response on all five desks and required live reads on the four crypto desks under separate release acceptance. Record unavailable infrastructure as blocked.
6. Desktop/mobile keyboard navigation, focus, themes,200%zoom and browser checks. Inspect response headers and console errors. No credentialed screenshots or analytics requests should be introduced by public pages.
7. Confirm existing email/recovery, backup restore/encryption evidence, account isolation and accounting launch gates are still satisfied independently. This SEO branch does not resolve them.

## 6. Webmaster setup — owner action, not executed

Use the organization's existing Google Search Console and Bing Webmaster Tools accounts if available. Verify appropriate ownership for the canonical domain through an approved method; never share verification credentials in a PR. Submit `https://desks.matterhorn.so/sitemap.xml` only after the production audit passes. Inspect representative guide URLs and index exclusions. Sitemap acceptance or a request to index is not an indexing/ranking guarantee.

Use query/page reports to refine helpful content, not to generate duplicate doorway pages. Bing AI citation reporting, if available, is sampled and is not traffic or a universal GEO rank. See `docs/growth/measurement-contract-2026-10-02.md`. No analytics installation or third-party account creation is included in this release; authorize separately if existing evidence is insufficient.

## 7. Rollback and stop conditions

For an indexing-policy defect with otherwise correct content, rebuild the same candidate with `MATTERHORN_SEARCH_INDEXABLE=0`, verify noindex and empty sitemap, and avoid blocking crawlers from observing the updated directive. This is an operator action requiring approval. It does not instantly remove indexed copies. Use verified webmaster removal tools only through the owner if an urgent incident requires them; fix origin exposure first.

For routing/auth/product regression, redeploy the last known-good exact release through the normal rollback process. Capture its prior discovery policy: the old release may lack noindex, so rollback alone does not guarantee index cleanup. No data migration or chat-state rollback is needed for this branch. A real privacy exposure triggers incident response; do not merely hide a link.

Stop promotion if public claims outstrip working product evidence, private content appears publicly, canonical/preview policy fails, onboarding fails or material safety warnings disappear. A cleaner search result cannot compensate for a broken desk.

## 8. Ready-to-send team instruction

“Please review the Matterhorn search-discovery candidate described here, obtain the approved published branch/PR and exact SHA, then reproduce its scoped checks in an isolated checkout. Do not assume latest dev includes unpublished work. Review the source ledger, preserve existing auth/API/runtime configuration, and deploy only after separate approval. The new public guide area is `/learn`; keep the app's private shell noindex. Enable guide indexing only for the approved canonical production build, verify real Vercel routing and alias noindex, then record the deployment ID/SHA and run hosted normal-user acceptance. Complete webmaster submission and measurement setup only with owner access and approval. Return PASS/BLOCKED evidence for every checklist item; do not mark search growth, private-data safety or all-desk readiness complete from local tests alone.”
