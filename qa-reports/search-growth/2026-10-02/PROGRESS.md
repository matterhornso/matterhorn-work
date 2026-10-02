# Public discovery implementation — local evidence

## Batch 2 — 2 October 2026, 18:10 UTC

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
