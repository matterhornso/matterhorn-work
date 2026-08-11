# Prediction Markets Phase 2

Phase 2 expands the Polymarket desk into a cross-venue research surface without widening transaction authority.

## Supported venues

| Venue | Public discovery | Matterhorn execution | Eligibility boundary | Official source |
| --- | --- | --- | --- | --- |
| Polymarket | Gamma API market search | Existing reviewed Polygon-wallet path only | Polymarket geoblock check before executable fields | https://docs.polymarket.com/api-reference/introduction |
| Kalshi | Public Trade API market data | None in Phase 2 | User must qualify through a separate Kalshi account | https://docs.kalshi.com/getting_started/quick_start_market_data |
| Manifold | Public search API | None in Phase 2 | Play-money research only in Matterhorn | https://docs.manifold.markets/api |

The shared search route is `GET /api/prediction-markets/search`. It returns a normalized market title, venue, probability, volume, liquidity, status, close time, unit, source time, and per-venue health. One venue failure does not erase healthy results from the others.

The venue route is `GET /api/prediction-markets/venues`. It is the canonical source for the app's visible execution and eligibility labels.

## Agent contract

The Polymarket desk agent can call:

- `matterhorn_prediction_market_venues`
- `matterhorn_prediction_markets_search`

Broad topic searches use the shared search once. Exact Polymarket research can continue through the existing Polymarket tools. Kalshi and Manifold results must never be sent to a Polymarket preview, watch, receipt, handoff, or wallet route.

## Safety contract

- Kalshi and Manifold are research-only in Matterhorn Phase 2.
- Polymarket transactions keep the existing compliance check and reviewed wallet ticket.
- No agent, watch, workflow, MCP tool, or cross-venue search can submit a transaction.
- Matterhorn does not infer legal eligibility from a market's availability. Provider and account checks remain authoritative.
- Provider responses have a timeout, bounded response size, and per-venue degradation state.
- No provider credentials are accepted by the shared search route.

## Deferred venues

Metaculus is not enabled in the shared commercial product search. Its official API currently requires authentication, and its terms require a separate written agreement for commercial use and restrict AI/ML use of retrieved data. Add it only after a signed data agreement and a server-side credential contract are approved.

Other real-money venues need the same review before they are added: official API terms, data licensing, jurisdiction and account eligibility, credential isolation, normalized market semantics, and a separately audited transaction adapter.

## Phase 2 acceptance

- Venue coverage is visible in the desk before a user starts a task.
- Search covers Polymarket, Kalshi, and Manifold with explicit venue labels.
- Partial provider failure returns healthy venue results and a degraded source state.
- Public Beta still removes every reviewed transaction starter.
- Kalshi and Manifold have no transaction, watch, receipt, handoff, or wallet action.
- The full app, server, security, release, responsive, and authenticated browser QA gates remain green.
