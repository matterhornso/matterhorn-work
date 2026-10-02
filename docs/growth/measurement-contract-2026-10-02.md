# Discovery-to-use measurement contract

Design proposal, 2 October 2026. No analytics installed, no events emitted, no warehouse queried, no measured baselines or growth targets. Owners must approve instrumentation, consent, retention and definitions before implementation. This is a schema-independent contract, not SQL against tables assumed to exist.

## Decision and metric selection

Decision: which content, onboarding repair and distribution effort helps people complete useful research and return? Review weekly, using complete reporting periods. Candidate set considered: impressions, clicks, average rank, indexed pages, AI citations, visits, entry clicks, signups, successful first responses, retained useful work, latency, correctness and data exposure. Narrow to two outcome KPIs; use traffic and indexing diagnostically. Page count, raw signups and citation count alone can rise without a working product.

Primary measures are proxies for value: a completed model response is not necessarily correct, and repeated use is not necessarily benefit. Keep the quality guardrail mandatory. Financial volume or wallet actions are deliberately not a growth objective.

## Primary KPIs and drivers

### 1. Qualified discovery activation rate

- **Definition:** fraction of eligible, consent-compatible first-time guide entrants who complete their first qualifying desk request within seven days of entry. Qualifying means a normal-user request reaches a completed answer and any required read-only tool returns usable evidence; a failure, cancellation, mock or model-only answer to a required live-read task does not qualify.
- **Formula:** distinct eligible entrants with at least one qualifying completion in days 0–7 / distinct eligible entrants in the same entry cohort. Report numerator and denominator with every rate. If the denominator is zero, report N/A, not 0%.
- **Grain/window:** one entrant per first recorded public-guide entry; weekly UTC entry cohorts, finalized only after the full seven-day window plus documented ingestion delay. Deduplicate account merges/repeated entries by a reviewed mapping. Split by first landing guide and desk only when sample size permits.
- **Source needed:** approved public-entry event, consent-compatible attribution bridge, authenticated request completion/tool outcome records. None is newly instrumented by this branch. An anonymous-to-account join must never be assumed possible merely because timestamps are close.
- **Owner/decision:** product analytics owner with engineering; weak entry→app progression suggests copy/navigation friction, weak app→completion suggests product reliability. Do not publish more pages to conceal a broken chat funnel.
- **Driver 1:** guide→app-entry rate: distinct eligible entrants with an app-entry action / eligible entrants, same mature cohort and scope.
- **Driver 2:** app-entry→qualifying-completion rate: eligible entrants with a qualifying completion / eligible entrants with an app-entry action, same cohort/window. These two drivers multiply to the primary only with the same population and a required observed app-entry path; otherwise report their scope difference.
- **Limits:** browser blocking, no consent, cross-device use and lost attribution exclude users. Label coverage; never call it all visitors. If safe linking is unavailable, report separate guide traffic and product activation, not a fabricated joined funnel.

### 2. 28-day retained useful-work rate

- **Definition:** share of newly activated eligible accounts completing another qualifying request on a later UTC day during days 8–28 after first qualifying completion.
- **Formula:** distinct mature activated accounts with a qualifying day8–28 return / distinct activated accounts with the entire 28-day follow-up observable. No incomplete cohorts in the denominator. Deleted or withdrawn records must follow the approved privacy policy; disclose resultant coverage changes.
- **Grain/window:** account, week of first qualifying completion, UTC; compare mature cohorts. Request retries cannot create multiple accounts or return days. Report the count alongside the rate.
- **Source needed:** stable consent-compatible account identifier and deduplicated completion outcomes, not raw chat text. Attribute to discovery only where the first KPI's bridge is valid; otherwise call this product retention, not SEO retention.
- **Owner/decision:** product owner; improve recurring research usefulness when activation rises but mature return use does not. A return on a different desk still counts; show desk mix only as a diagnostic.
- **Driver:** distinct qualifying work days per activated account in days1–7, with median and population count. It is an early diagnostic, not a substitute for mature retention or evidence quality.
- **Limits:** research can be episodic, seasonality changes demand, and high activity may reflect retries/friction. This observational rate does not establish that SEO caused retention.

## Two guardrails

1. **Evidence-quality failure rate.** In a documented stratified sample of completed read-only crypto requests, proportion with wrong entity/network, missing required tool evidence, omitted material warnings, or unsupported source/freshness claims. Sample across all four crypto desks and include ordinary users, not only happy-path fixtures. Record rubric, selection method, reviewer and denominator. Do not export raw prompts into growth tools; inspect only through authorized QA workflows. Product/runtime owner investigates material failures before promotion. Establish a baseline before setting a numeric trend target; any harmful fabricated execution/approval claim warrants immediate incident review.
2. **Public-data exposure incidents.** Confirmed occurrences of private account, chat, memory, recovery token or secret material entering public pages, discovery files or growth telemetry. Security owner; zero is the required release condition, not a measurement claimed by this work. A clean local scan is not proof of no hosted exposure. Stop publication/promotion and follow incident response for a confirmed incident.

## Search diagnostics: separate from outcome KPIs

- Google Search Console: canonical guide clicks, impressions, CTR and query/page breakdown. Freeze report property, search type, time zone, period and filters when comparing. Preserve missing/anonymized-query limitations; do not sum query rows as if they necessarily reconstruct all totals. Do not report average position as a single universal ranking. [Definitions](https://support.google.com/webmasters/answer/7042828).
- Bing AI Performance, when available to the owner: citation trends, cited guide URLs and grounding-query context, using the report's own periods and definitions. Counts are aggregated/sampled, not visits or causal effects; do not merge overlapping views into a total. [Scope and limitations](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c).
- Technical: allowlisted guide HTTP/indexability correctness and index coverage. Seven locally generated pages are an output, not seven indexed pages. Submission is not indexing and indexing is not ranking.
- Assistant referrals, if already lawfully collected: explicit recognized referrer hosts only; absent referrer stays unknown. Never label all direct traffic as AI traffic or attribute search-console clicks to individual accounts.

## Minimum instrumentation proposal — not installed

Only if existing lawful sources are insufficient, design a separate reviewed change. Proposed events: `public_guide_entry`, `app_entry`, `desk_request_started`, `desk_request_completed`, `desk_request_failed`, `desk_request_cancelled`. Use a versioned allowlist, trusted server outcomes for completion, and one request/attempt correlation rule. Repeated terminal events for one attempt must deduplicate; retries are distinct attempts but only one first activation.

Permitted dimensions to evaluate: coarse source class, allowlisted guide slug, desk ID, outcome category, deployment SHA, timestamp bucket and consent version. A scoped pseudonymous identifier is still personal data, not anonymization. Never collect raw URLs/query strings, prompts, wallet addresses, emails, memories, file names, session URLs, API keys, tool payloads or full user-agent/IP values in growth telemetry. Reject unknown fields server-side. Approve access, deletion and a minimal retention period explicitly before enabling; do not copy arbitrary debug logs into analytics.

Validation fixtures for a future implementation: duplicates, retry success, cancellation, failed tool with model prose, blocked consent, cross-device/unknown attribution, zero denominators, partial cohorts, late events and account deletion. Reconcile event counts against authoritative request records on disposable accounts before reporting real-user outcomes.

## Baseline and targets

For the first four complete post-publication weeks, validate data quality and report counts, coverage and uncertainty. Compare like-for-like periods after definitions stabilize; wait for mature retention cohorts. Set improvement targets from observed funnel loss, reliability capacity and expected changes—not external invented conversion benchmarks. A small cohort should be reported descriptively rather than dressed up as a statistically established uplift. No revenue/traffic/citation target is justified by the evidence available today.

Required owner inputs: existing measurement sources and access, product/data owner, lawful consent/retention decision, definition of usable tool evidence, and actual launch candidate. With none available, the correct output is this contract plus local technical QA, not a pretend dashboard.
