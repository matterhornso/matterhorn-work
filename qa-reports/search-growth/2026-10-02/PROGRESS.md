# Public discovery implementation — local evidence

## Batch 2 — 2 October 2026, approximately 18:00 UTC

Implementation branch: `codex/search-discovery-2026-10-02`. No publication or deployment.

Seven standalone HTML guides now cover the product, all five primary desks and checking an AI crypto-research answer. Source manifest: `apps/app/content/public-guides.mjs`. No authenticated app JavaScript, account data, analytics, new dependencies or external font requests are required by these pages. Existing theme bootstrap and shared retro stylesheet are reused.

Publication is **default-off**: build-time `MATTERHORN_SEARCH_INDEXABLE=1` plus `VERCEL_ENV=production` is required for indexable guide metadata and sitemap entries. Vercel configuration adds `X-Robots-Tag: noindex, follow` on noncanonical hosts. The generic app shell remains noindex. Robots may crawl the shell to observe that directive; robots directives are NOT authentication or access control. Do not publish the preparatory shell change alone.

Both Vercel configurations have a fixed public-guide route allowlist ahead of their unchanged API and SPA handling. Vercel's documented filesystem precedence serves generated sitemap/assets. These are configuration/unit checks, **not hosted routing acceptance**. Deployment approval and exact-host HTTP verification remain required.

## Verified

- `node --test apps/app/scripts/build-public-guides.test.mjs scripts/search-discovery-audit.test.mjs`: **14 pass**. Includes escaping, JSON-LD parsing, canonical routes, metadata, allowlisted sitemap, preview publication gating, isolated generation, paired Vercel configuration and root discovery links.
- `pnpm exec bun test apps/app/tests/customer-branding-copy.test.ts apps/app/tests/theme-bootstrap.test.ts apps/app/tests/public-trust-routes-contract.test.ts apps/app/tests/public-beta-web-deployment.test.ts apps/app/tests/public-auth-client.test.ts apps/app/tests/public-web-auth-errors.test.ts`: **36 pass, 216 assertions**.
- `pnpm --filter @matterhorn-work/app build:web`: **pass**. Existing Rollup pure-annotation, circular account-client-state/den chunk and >500kB chunk warnings remain. Guide pages do not load those app bundles.
- `pnpm --filter @matterhorn-work/app typecheck`: **pass**.
- Frozen-lockfile dependency install in this isolated checkout completed with scripts disabled; offline attempt lacked 11 packages, approved registry fetch resolved them. No lockfile change.
- Local Vite preview at `http://127.0.0.1:53941/learn/`: guide index renders; clicking Bittensor opens its standalone guide. This is not a live model/tool response test.
- Browser desktop width1280, scrollWidth1280; mobile override actually applied390px, scrollWidth390. Bittensor header, navigation, title and body fit without horizontal overflow. Screenshots: `guide-index-desktop-light.jpg`, `bittensor-mobile-light.jpg`.
- Keyboard first Tab focuses Skip to content with visible3px violet outline.

## Remaining before signoff

Dark/no-JavaScript/retro-off variants; tablet and320px/zoom checks; all guide navigation and trust/app exits; CSP and full generated-asset checks; expanded rawHTTP audit; independent skill-required finish review/documentation. No claims of Safari/Firefox, hosted acceptance, index inclusion, traffic uplift or live agent readiness.

Next editorial work: evidence ledger tying product claims to implementation, concrete worldwide distribution/editorial priorities, measurement without new tracking, and operator deployment/verification handoff. Do not create fake locales/hreflang or comparison claims without reviewed supporting evidence.

## Sources consulted for this batch

- Google: [AI features](https://developers.google.com/search/docs/appearance/ai-features), [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
- Vercel: [configuration: headers, host conditions, rewrites and filesystem precedence](https://vercel.com/docs/project-configuration/vercel-json).
- Protocol references: [Bittensor](https://www.bittensor.com/docs), [Hyperliquid info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), [Polymarket](https://docs.polymarket.com/), [Sui object model](https://docs.sui.io/develop/sui-architecture/object-model).

Initial Vercel short documentation URLs were unavailable to the web reader; canonical configuration reference was retrieved successfully. This is a research-tool limitation, not evidence of a product outage.

## Batch 3 — 2 October 2026, 18:10 UTC

- Expanded the diagnostic to **11 fixed public paths**, covering every guide. It now distinguishes approved-production vs preview expectations, checks exact route titles/canonicals and matching parseable WebPage JSON-LD, and rejects a sitemap that omits approved guides or includes other routes. Regression suite: **16 pass**. It still does not retain bodies, follow redirects, send auth or crawl arbitrary links.
- Added `scripts/preview-public-guides.mjs`: loopback-only, no-backend fixture with an explicit asset/guide allowlist, no-store/noindex responses and scripts blocked by CSP. Forced dark/legacy rendering is fixture evidence; it does not prove actual OS or saved-preference transitions. No browser preferences changed.
- Browser confirmed dark desktop1280 and dark320px no-JavaScript readability, and retro-off light768px layout; scrollWidth equaled viewport at all three widths. Full-page captures in `.impeccable/review/search-guides/`, opened/validated before review. Earlier390px/1280px real built-page evidence remains valid.
- Contrast calculations using observed dark computed colors and shared light tokens: dark body16.79:1, dark muted11.56:1, dark links8.33:1; light muted7.14:1, light links6.52:1, light primary-button text7.10:1. These sampled pairs are not a full WCAG certification.
- All seven guide navigation destinations render their intended heading. Guide → Security → Back to app works. Local account screen correctly reports unavailable account access because this isolated frontend has no backend; no signup/login attempted. This is not hosted acceptance.
- Functional regression caught and fixed: Vite preview served `/learn/` correctly but `/learn` fell back to the account SPA. Generator now emits an identical `learn.html` entry as well as `learn/index.html`; both retain `/learn` canonical. Added output-equivalence regression; browser reload of `/learn` now renders the correct guide. Vercel's explicit entry rewrites remain unchanged. This is a build-artifact correction, not a visual redesign.
- Independent skill-required review: `FINISH-REVIEW.md`, **disposition: ship**, scoped to code and the five provided local capture variants. No material visual fixes. Does not sign off hosted behavior, external documentation freshness, live model/chain execution,200% zoom or Safari/Firefox. Documentation conformance review follows separately; do not expand that verdict to untested surfaces.
- Remaining: actual browser zoom, real OS/saved-theme transitions, Safari/Firefox and hosted Vercel routing/header acceptance are unverified. No dedicated browser engine/emulation capability was used to claim them. Global positioning, content/source ledger, distribution priorities, measurement and operator handoff are the next workstream.
- Post-fix web build passed again (10.86s Vite build; same pre-existing warnings). Raw HTTP against the actual local preview: **11/11 route checks clear**, four guide assets200 with correct MIME types; sanitized evidence `local-http-audit.json`. Injected loopback fetch is explicitly labelled local, never hosted.
- Independent design documentation complete: `DESIGN-CONFORMANCE.md` confirms scoped extension, records inherited palette/type/layout/depth and unresolved environment checks. Root DESIGN.md and sidecar preserved; existing documentation drift was not repaired. No further visual refinements are planned in this work block absent a material finding.

## Batch 4 — 2 October 2026, 18:35 UTC

- Added a source/claim ledger, 30/60/90-day worldwide editorial/distribution playbook, measurement contract and self-contained deployment handoff. All are proposals/local deliverables; no accounts, outreach, tracking or infrastructure changed.
- Used KPI-design skill to narrow success to qualified discovery activation and mature retained useful work, with evidence-quality and data-exposure guardrails. No baseline, joined funnel, live warehouse data or numeric growth target is invented. Missing consent/attribution means separate traffic and product metrics, not fabricated linkage.
- Checked current primary Google localization/AI/spam/metric guidance and Bing AI Performance definitions. Bing source confirms aggregated/sampled supported-surface citations are not clicks or causal proof; no universal GEO score is proposed.
- Code-backed content review caught an overbroad model-substitution sentence. Narrowed it to acknowledge workspace defaults when no model is selected; no behavior or visual-system change. Impeccable clarify/craft references used; prior bounded visual review is not repeated. Added regression covering model defaults, privacy qualification and readiness caveat. **Node17pass**, diffcheck clean; prior frontend36pass/build/typecheck results remain scoped to the earlier implementation checkpoint. Current copy generated/validated in isolated Node tests; existing running preview still has earlier built wording until the next purposeful build.
- Next: review untested technical edge cases in publication/audit behavior (production aliases vs preview, malformed crawler directives, static-route variants, safe link normalization); inspect any material issues, fix with targeted tests only. Then refresh final build/evidence and release handoff once at the final implementation checkpoint. No extra cosmetic scan, unchanged hosted probe or unrelated app modification.
