# Public discovery: claim and source ledger

Reviewed 2 October 2026 against local candidate `8352821811ed4145d6fce3bea446c1973859e61b`. This ledger supports editorial review, not certification of the hosted product. Source references are repository-relative so they remain usable after checkout. Read the named symbol and its callers before broadening a claim.

## Evidence levels

- **Source-backed:** a named configuration, contract or implementation exists. This does not prove an enabled deployment or a successful request.
- **Locally verified:** a recorded test or browser check passed in this worktree. Scope is in the linked QA report.
- **Hosted verified:** requires evidence from the deployed candidate, normal accounts and the relevant service. No hosted agent acceptance was performed in this search-growth block.
- **Proposal:** an editorial, measurement or distribution recommendation; not an existing capability or result.

## Product claims

| Topic | Conservative wording supported by source | Evidence | Do not imply / release evidence still needed |
| --- | --- | --- | --- |
| Category and desks | Matterhorn organizes AI work into Private AI, Bittensor, Hyperliquid, Polymarket and Sui desks. | `apps/app/src/app/lib/minimal-ui.ts`, `PRIMARY_DESKS`; `PrimaryDeskLauncher` in `apps/app/src/react-app/domains/session/workflows/primary-desk-launcher.tsx` | A visible desk is navigation, not service readiness. Test the deployed five-desk journey independently. |
| Models | The chat sends the selected provider/model; the desk contract also permits a workspace fallback. Check the model shown before sending. | `session-surface.tsx` in `apps/app/src/react-app/domains/session/surface/`, draft provider/model fields; `packages/types/src/desk-agents.ts`, `DEFAULT_MODEL_POLICY` | Guide wording was narrowed in this review to acknowledge defaults when no model is selected. Do not promise that no fallback can ever occur or that every listed provider/model works live. |
| Bittensor | The agent contract supports bounded public-chain research; inspect source and freshness and stop when live evidence is unavailable. | `MATTERHORN_DESK_AGENT_MANIFESTS.bittensor` in `packages/types/src/desk-agents.ts`; exact read-only tool allowlist and fallback instructions | Do not call a general model answer a live subnet read, endorse validators, or predict yield. Hosted service configuration and tool receipts remain required. |
| Hyperliquid | Research market data and public exposure separately from trading. | Same manifest, `.hyperliquid`, read-only policy, source/freshness checks and `hyperliquid_execution` gate | Never equate order-book depth with guaranteed execution price or an enabled trading path. Current endpoint/provider availability is separate. |
| Polymarket | Research an identified market with outcome, source and freshness context. | Same manifest, `.polymarket`, tool evidence requirements and `polymarket_compliance` gate | Not a prediction guarantee, betting recommendation, global eligibility claim or permission to submit an order. |
| Sui | Request an explicit network and public identifier; distinguish a retrieved result from a failed lookup. | Same manifest, `.sui`, bounded tools and `sui_wallet_standard` gate | A wallet-support badge proves neither a working agent nor a live object read. Do not claim transferability from an explanation. |
| Financial actions | Research and any enabled wallet-review action are separate. Agents must not sign or submit autonomously. | Same file, `NEVER_AGENT_SUBMITS`, capability and completion policies | This is a policy contract, not a new penetration test or a guarantee that all enforcement paths were audited in this block. Never remove user review to improve conversion. |
| Private AI | General-purpose desk; the name does not establish local inference or a provider's retention policy. | Same manifest, `.blank`; `apps/server/src/provider-privacy.ts` is the policy implementation entry point | No blanket “all local,” “zero retention,” “end-to-end encrypted,” or “fully private” claim without deployment-specific evidence. |
| Jev | Optional classification precedes the selected model for eligible messages; unavailable classification can leave ordinary chat available. | `apps/app/src/react-app/domains/session/surface/use-jev-chat.ts`, `change`, `prepare`, `jevDraftText` | It skips private/sensitive-context/command/attachment cases; this is not universal classification. Opt-in, current consent, credentials and policy are distinct prerequisites. No claim of improved accuracy without an evaluation. |
| Memory | Explicitly selected saved records can be included in a prompt with visible provenance and sensitivity. | `apps/app/src/react-app/domains/session/surface/memory-context-store.ts`, `addMatterhornMemoryContextToResolvedText` | Not hidden universal recall; deletion of one record is not deletion of every chat, export, backup or provider copy. Storage security needs operational evidence. |
| Public guides | Seven static pages contain direct answers, bounded example prompts, limitations and source links. | `apps/app/content/public-guides.mjs`; `apps/app/scripts/build-public-guides.mjs`; local HTTP and browser evidence in `qa-reports/search-growth/2026-10-02/` | They are not yet published, indexed, ranked or cited. Local build does not prove Vercel edge behavior. |
| Open source | Readers can inspect the referenced Matterhorn GitHub repository. | Public guide `REPOSITORY` constant and repository source | Do not imply that an unpublished local commit is already on GitHub, or that upstream projects endorse Matterhorn. |

## External sources and permitted use

Sources checked on 2 October 2026. These explain practices/semantics; they do not certify Matterhorn or establish keyword demand.

| Primary source | What it supports | Boundary |
| --- | --- | --- |
| [Google AI features](https://developers.google.com/search/docs/appearance/ai-features) | Accessible useful content and ordinary search fundamentals apply to AI search eligibility. | No special AI file or schema guarantees inclusion. |
| [Google helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Accurate, useful content and transparent authorship. | Do not invent expert review or refresh dates. |
| [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) | Crawlers need access to observe noindex. | Neither robots nor noindex replaces authentication or removes provider copies. |
| [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions) | Actual localized alternatives need consistent reciprocal annotations. | No country doorway pages or fake translations; language expansion needs human maintenance. |
| [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies) | Avoid manipulative links and scaled content made primarily to manipulate search. | Distribution must add value rather than automate link placement. |
| [Search Console metric definitions](https://support.google.com/webmasters/answer/7042828) | Clicks, impressions and positions have specific search-report semantics. | These are not product activation or unique people; preserve export filters and selected canonical. |
| [Bing AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c) | Reports sampled, aggregated visible citations on supported AI surfaces. | Citations are not clicks, importance or causal proof. Do not sum incompatible views into a universal GEO score. |
| [Bittensor docs](https://www.bittensor.com/docs) | Official protocol terminology and reference material. | Not evidence of Matterhorn live service health or a validator endorsement. |
| [Hyperliquid info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) | Public information request semantics. | Not an execution, freshness or risk guarantee. |
| [Polymarket docs](https://docs.polymarket.com/) | Primary market/API reference. | A broad documentation link does not replace the exact market's resolution terms. |
| [Sui object model](https://docs.sui.io/develop/sui-architecture/object-model) | Object-model concepts. | No inference of an object's current state without a successful network read. |

## Review workflow

For each material content change, record the source symbol or primary URL, actual review date, reviewer identity only if genuinely supplied, and test evidence if a live capability is claimed. Update `CONTENT_DATE` only for substantive content changes. AI assistance is disclosed in the page; there is no invented expert byline. Product owner reviews claims, protocol reviewer checks technical examples, security/privacy owner checks data boundaries. Those are proposed responsibilities, not completed human approvals.

Release blockers for editorial sign-off: obtain product-owner review; verify official links and deployed app entry; keep all unresolved runtime/privacy claims qualified. Model-fallback copy was corrected locally; this is not a hosted behavior test. Legal eligibility, provider policies, backup encryption and launch readiness are outside this content review.
