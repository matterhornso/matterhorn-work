# Matterhorn Desks: search and answer discovery

Work block: 2 October 2026, 17:17–21:17 UTC. Local implementation only; publication requires approval and launch-readiness verification.

## Outcome

Make it easy to discover what Matterhorn does, inspect its limitations, choose the right desk, and begin useful work. SEO covers organic discovery; AEO/GEO here means useful, source-grounded answers that search and assistant retrieval systems can understand and cite. None guarantees inclusion, rank, revenue or worldwide adoption.

Working audience: English-speaking crypto researchers and teams globally, pending the owner's response. Positioning hypothesis: **an AI workspace for crypto research, organized into protocol-specific desks**, with user-selected models and explicit review boundaries. “Cowork for crypto” can explain the category, but must not imply Anthropic affiliation, trademark ownership, feature parity or exclusive category leadership.

## Four-hour sequence

| Window | Work | Acceptance |
| --- | --- | --- |
| First hour | Crawl/index baseline; primary-source research; route/content inventory; technical tests | Reproducible raw-HTML audit, explicit private/public route policy, prioritized intent map |
| Second hour | Extend existing public reading surface with crawlable desk/workflow content and build integration | Useful visible HTML without JavaScript; unique titles/descriptions/canonicals; no invented claims; app entry unchanged |
| Third hour | Structured data, sitemap, internal links, safe sharing, canonical/preview policy, content refinement | Markup matches visible content; only public allowlisted URLs in sitemap; preview/private pages not promoted; no new tracking |
| Fourth hour | Regression/security/route checks, bounded visual review, global editorial and distribution handoff | Evidence and honest limitations, local commits when clean/tested, release checklist and 30/60/90-day measurement plan |

The schedule is a priority order, not a promise to finish every item. Stop expanding when correctness or validation needs the remaining time. Existing auth/data/runtime must not be changed for growth work.

## Findings driving the work

Direct public HTML observed on October 2: root, `/security`, `/session` share a generic sign-in shell. `/sitemap.xml` returns that shell with HTTP200, not XML. No canonical or robots meta is present. robots.txt permits all crawling. Source description includes longevity but excludes Sui. Discovery therefore depends on rendering the application, and unknown paths look like valid pages to non-rendering clients.

## Technical approach

1. Keep the existing app at its current URLs. Add an allowlisted public product/guide area (proposed `/learn`) rather than replacing account entry or creating an alternative app state store.
2. Reuse the public reading layout, logo, retro tokens and theme behavior. No new design language, hero redesign or third-party client dependency is needed for an index of desks and practical guidance.
3. Generate static public HTML at web build time from reviewed, versioned content. No user, session, runtime, vault or provider data enters this process. Same content for people and bots; no user-agent cloaking.
4. Add unique canonical URLs, standard social metadata and limited Website/WebPage/Breadcrumb structured data, using stable Matterhorn identity. Include only schema fields supported by visible content. No invented price, aggregateRating, Product offers, reviews or author credentials. Do not promise FAQ rich results.
5. Sitemap includes only approved public URLs with genuine modification dates, not every build timestamp. Keep recovery tokens, sessions, workspaces, settings and API routes out of it. Robots directives are not authorization; server auth remains mandatory. Do not block page crawling and assume crawlers can still read its noindex.
6. Define preview/canary noindex behavior separately from production canonical origin. Test host-origin validation and route precedence in both Vercel configurations. Avoid modifying infrastructure until deployment approval.
7. Add raw-response tests for status, content type, canonical, visible content, internal links, schema, and private-route exclusion. Check authenticated API proxy rules remain ahead of the SPA fallback. Document any soft404 limitation rather than redirecting arbitrary app links.

## Initial content backlog and intent hypotheses

These are hypotheses, not measured keyword volumes.

| Reader question | Useful content | Evidence / boundary |
| --- | --- | --- |
| What is a crypto AI workspace? | Product overview, what desks/models/tools each do, start path | Source-backed product facts; no claims that production passed all acceptance |
| How do I research Bittensor subnets? | Specify subnet/network, request public data, inspect units/time/source | No return forecasts or validator endorsements |
| How do I inspect Hyperliquid markets? | Public order book/funding workflow; distinguish snapshots from execution | No autonomous trading or guaranteed freshness claims |
| How do I research Polymarket markets? | Exact market selection, outcome/liquidity/source checks | Research, not wagering instructions or guaranteed prediction accuracy |
| How do I inspect Sui objects? | Explicit network/object/address, verify result/source | Never imply wallet support proves agent availability |
| What does Private AI mean? | Selected-model processing, verified policy, memory control | Desk name is not proof of local inference, encryption or no retention |
| How is this different from a chatbot or developer toolkit? | Factual workflow/category comparison | Check primary competitor docs; no untested superiority claims |

Each guide should give an answer first, a practical read-only example prompt, required inputs, expected evidence and failure/recovery guidance, links to relevant official protocol docs, and a clear app entry link. Use a small number of distinct helpful pages rather than near-duplicate country/keyword pages.

## Source ledger

- Google [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): normal search eligibility and accessible text remain foundational; no special AI file or schema is required. This supports crawlable useful content, not a guaranteed citation claim.
- Google [helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): accuracy, original utility and transparent authorship matter. No fabricated expert reviewers or mass-produced keyword pages.
- Bing [AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c): use its citation/query reports when account access is available; citation counts are not causal proof of a content change or universal AI visibility.
- Bing [Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a): primary guidance for discovery and content eligibility; consult before publishing.
- Coinbase [AgentKit](https://github.com/coinbase/agentkit): official developer toolkit source for category context, not proof of Matterhorn integration or a head-to-head benchmark.
- Anthropic [connectors overview](https://support.anthropic.com/en/articles/11817150-connect-your-tools-to-unlock-a-smarter-more-capable-ai-companion): category context only; verify current Cowork product documentation before publishing comparisons.

Additional crawler, sitemap and localization references must be checked before implementing their specific policies. llms.txt is optional navigation material, not a substitute for HTML, indexing or access controls; do not prioritize it above working public pages.

Technical references checked for implementation: [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [sitemap generation](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), and [structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data). A generic SPA noindex directive must ship together with the independently indexable public-guide area; do not deploy this preparatory step alone. Static app HTML is not a safe canonical for every workspace or session URL.

## Measurement and worldwide growth

Owner setup after publication: verify canonical property in Google Search Console and Bing Webmaster Tools, submit validated sitemap, inspect a sample of pages and watch exclusions/errors. No account creation or submissions are performed by this work block.

Measure organic landing visits, intent/page queries, non-brand impressions/clicks, public-guide→app-entry conversion, successful first desk response, and returning useful-work sessions. Link attribution only with consent-compatible existing analytics; do not collect raw prompts, wallet addresses, emails or workspace content as growth telemetry. Establish baselines before setting numeric targets. Treat assistant referrals and Bing citation reports as separate imperfect signals, not a comprehensive GEO score.

Global does not mean automatic translation into dozens of languages. Start with plain English and real intent evidence; prioritize languages based on demand, support capability and reviewed localized risk/legal copy. Use hreflang only for actual equivalent translated pages with reciprocal links. Do not create unsupported regional availability claims.

Prepare (do not send) distribution briefs for protocol communities, maintainers, docs and technical demonstrations. Earn links through useful source-backed workflows and reproducible examples; no paid-link schemes, automated spam, fake reviews or unsolicited mass outreach. Validate product onboarding before buying or aggressively driving traffic.

## Release gates / handoff

Public pages must accurately describe supported workflows and actual prerequisites. Existing production release/guard/email/backup blockers are independent launch gates. Deployment, canonical-domain routing, Search Console/Bing verification, bot firewall policy, legal review, real content review and optional analytics access remain owner actions. The final report distinguishes local tests, hosted observations, proposals and actual publication; no growth success is claimed from unshipped code.
