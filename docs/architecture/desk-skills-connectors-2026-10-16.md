# Desk skills and connector rollout

## Scope and release boundary

This handoff is for Matterhorn engineering. The local implementation supplies seven release-owned guidance documents and a catalog of thirteen connector recommendations across the five desks. It does not install third-party packages, connect external accounts or add executable tools. Existing permissions, provider consent, usage accounting, wallet review and desk readiness remain authoritative.

The scope is preloaded guidance and accurate discovery: five built-in guarded adapters, seven optional connections and one group of future adapters. A recommendation is not a connected integration; an available SDK is not proof that the chat agent can call it. The subsequent authorized local refresh preserved existing chats/data and completed five-desk real-response checks; see the [combined candidate verification](../../qa-reports/launch-candidate/2026-10-16/RESULTS.md). Nothing is deployed and hosted acceptance remains separate.

## Five desk coverage

All desks receive the common evidence and safety guidance. The following five rows are the catalog's five built-in guarded adapters; they describe existing capabilities rather than new integrations.

| Desk | Preloaded desk guidance | Built-in guarded adapter | Optional research sources |
| --- | --- | --- | --- |
| Private AI | Research, writing, planning, tables and explicitly selected workspace context | **Matterhorn workspace tools**: authorized files, notes, memory and outputs where the current desk exposes them | GitHub, Google Workspace, Notion, Slack and one approved web-research provider |
| Bittensor | Subnet discovery, validator comparison and public-wallet evidence, with network and freshness limits | **Bittensor live-chain service**: bounded discovery, subnet, validator and wallet reads; configured sidecar must pass readiness | Taostats for indexed history and analytics |
| Hyperliquid | Market, funding, orderbook and requested public-account exposure analysis | **Hyperliquid Info API**: currently exposed market, orderbook, funding, account, position and open-order reads | Approved public research when separately supported and permitted |
| Polymarket | Market discovery, exact outcome identification, resolution terms, liquidity and eligibility boundaries | **Polymarket public market data**: current search, exact-market and outcome-token orderbook tools | Approved public research when separately supported and permitted |
| Sui | Explicit-address balance research and honest unsupported-capability explanations | **Sui gRPC balance read**: current chat balance tool with explicit network and optional coin type | Sui documentation MCP for concepts, not live-chain data |

The chain and market references are the official [Bittensor metagraph guide](https://guides.learnbittensor.org/subnets/metagraph), [Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), [Polymarket API overview](https://docs.polymarket.com/getting-started/api) and [Sui gRPC client documentation](https://sdk.mystenlabs.com/sui/clients/grpc). Upstream breadth must not be presented as Matterhorn's enabled tool surface. Public market access also does not establish [Polymarket trading eligibility](https://docs.polymarket.com/api-reference/geoblock).

## Seven built-in guidance documents

The source of truth is [`builtin-workspace-skills.ts`](../../apps/server/src/builtin-workspace-skills.ts), reviewed on 16 October 2026. These names are exact:

| Name | Purpose |
| --- | --- |
| `matterhorn-evidence-and-safety` | Evidence, truthful readiness, privacy, tool boundaries and safe recovery |
| `matterhorn-private-ai-workflows` | Authorized research, writing, analysis and workspace context |
| `matterhorn-bittensor-research` | Supported Bittensor reads and separate wallet-review boundaries |
| `matterhorn-hyperliquid-research` | Public market and account evidence without trading authority |
| `matterhorn-polymarket-research` | Discovery, outcome mapping, resolution conditions and eligibility |
| `matterhorn-sui-research` | Supported balance reads without claiming unexposed SDK capabilities |
| `matterhorn-connector-setup` | All thirteen connector recommendations and their setup requirements |

These are original Matterhorn instructions with source references, not vendored upstream skill packs. Release text appears as read-only documents in Skills. Users can inspect the guidance; it is not advertised as a native slash command or an installed external account.

## Optional connections and future adapters

The seven optional entries below are discoverable recommendations only. Each requires a supported integration, authentication and acceptance work before it can be marked connected.

| Exact catalog name | Intended scope | Required boundary and source |
| --- | --- | --- |
| **Taostats** | Indexed Bittensor history, rewards and analytics | Operator-held API key through a secure secret store, audited read-only adapter and current schema. The [official MCP guide](https://taostats.io/docs/start-here/model-context-protocol-mcp) requires a key. Do not import its wallet signing examples. |
| **Sui documentation MCP** | Official documentation search and retrieval | Provider OAuth and individual consent. The [official guide](https://docs.sui.io/getting-started/sui-mcp-server) documents Google/GitHub OAuth and 300 daily requests per tool. Documentation access grants no chain or wallet authority. |
| **GitHub** | Selected repositories, issues and pull requests | User authorization and tenant-scoped credentials. Prefer the [official read-only configuration](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md); publishing and merging require separate intent. |
| **Google Workspace** | Selected Drive files; separately scoped calendar or email workflows | Verified OAuth, least privilege and isolated credential storage. Review [Drive authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). The existing experimental extension is not hosted isolation certification. |
| **Notion** | Authorized knowledge pages and notes | Per-user OAuth/access and read-first tools. Creating or changing pages requires an approved write path. See the [official MCP overview](https://developers.notion.com/guides/mcp/overview). |
| **Slack** | Authorized team research | Granular scopes and per-user access; private channels/messages remain private context. Do not preload posting permission. See the [official Slack MCP guide](https://docs.slack.dev/ai/slack-mcp-server/). |
| **Exa or Tavily web research** | Source-backed public research through one approved provider | Choose one provider after data-policy, credential, cost and tool review. Never bypass a desk's search deny rule or send private context as a query. References: [Exa MCP](https://exa.ai/docs/get-started/exa-mcp), [Tavily MCP](https://docs.tavily.com/documentation/mcp). |

The thirteenth catalog entry is **Expanded chain and market reads**, classified as a future adapter group. It covers Sui object/checkpoint/history reads, Hyperliquid historical/spot data, Polymarket portfolio/activity and bounded streams. Each needs a narrow schema, existing gateway enforcement and normal-user live acceptance. These capabilities are not implemented by the guidance bundle. For example, the [Polymarket prediction-data API](https://docs.polymarket.com/api-reference/predictions/overview) is a research input for a future adapter, not an already connected portfolio feature.

Personal account connections require secure per-user authorization, revocation and workspace isolation. An operator-funded public-data key is a different credential class and must remain server-side; it must not become a shared personal-account session. Never copy the developer's Codex or ChatGPT connector credentials into users' workspaces.

## Virtual catalog and canonical guidance

[`builtin-skill-catalog.ts`](../../apps/server/src/builtin-skill-catalog.ts) supplies version-one documents under `matterhorn-builtin://skills/<name>/SKILL.md`. The identifier is virtual: it is never resolved as a filesystem path or fetched as a URL. Listing or viewing the built-ins creates no workspace skill directories, configuration files or credentials.

`listSkills` preserves existing workspace skill files. A valid user-owned skill with the same name wins in the displayed list; supported project copies remain editable and do not replace trusted release guidance. Discovery precedence for legacy/global copies is retained without granting new write access to those locations. Malformed files are left untouched. Built-ins have `builtin: true` and `userInvocable: false`, with view-only controls rather than edit, remove or invocation actions.

Portable exports exclude the virtual built-ins: the destination release supplies its own canonical guidance. Ordinary custom files remain portable, including existing same-name customizations transferred through an explicit authorized import. Importing custom text does not turn it into release guidance or replace the canonical prompt. Export/import round-trip tests are a separate preservation check.

`getMatterhornBuiltinDeskGuidance` supplies the common safety text and relevant desk text directly from release-owned constants to canonical agent templates. It does not read mutable workspace copies. This keeps private custom skill content out of the canonical prompt and prevents a name collision from granting authority. Existing tool allowlists, one-call budgets where applicable, action review, selected model, provider checks and accounting are unchanged. Ordinary custom skills still retain their existing supported behavior; they are not promoted to release-owned instructions.

## Dependency and source review

Do not upgrade runtimes as a side effect of displaying this catalog. The Bittensor sidecar currently pins `bittensor==10.5.0`, `async-substrate-interface==2.2.1` and `cyscale==0.5.0` for its 10.x adapter. The [legacy SDK repository](https://github.com/opentensor/bittensor) now identifies the [subtensor monorepo](https://github.com/RaoFoundation/subtensor) as the v11 successor. Its breaking API and package/license changes require a separate tested migration; the old SDK's MIT license does not establish the license of a newer replacement.

Sui already uses gRPC and `@mysten/sui`. Keep the tested lockfile until a separately reviewed upgrade passes. Public Sui endpoints are rate-limited and development-oriented; production capacity needs an operator-selected provider or node, as described in [Sui production endpoint guidance](https://www.docs.sui.io/operators/exchange-integration).

If upstream skills are later bundled, select narrowly and pin a reviewed commit with required attribution. [MystenLabs/skills](https://github.com/MystenLabs/skills) is Apache-2.0 and warns that installing all its skills adds context overhead and trigger collisions. Relevant conceptual material includes `sui-overview`, `accessing-data`, `object-model` and `sui-networks-gas`; Move development, PTBs, Kiosk, DeepBook, Walrus and signing examples must not silently expand a normal desk's capabilities.

The official [Polymarket agent skills](https://github.com/Polymarket/agent-skills) include authentication, order placement, bridging and relayer workflows, beyond this read-focused bundle. They are not vendored; redistribution licensing has not been verified. Matterhorn's app currently pins `@polymarket/clob-client-v2` at `1.1.0`; the [upstream repository](https://github.com/Polymarket/clob-client-v2) marks that package deprecated in favor of the unified SDK. Evaluate migration separately with wallet, eligibility and signing regressions rather than changing dependencies during guidance preload.

This review did not verify an official Hyperliquid or Bittensor consumer-agent skill/MCP package suitable for automatic installation. Use Matterhorn's existing guarded adapters and source-backed guidance; do not substitute an unverified community package or infer official status from its name.

Taostats announces retirement of its legacy `/api/...` surface on **9 November 2026** in its [API reference](https://taostats.io/docs/api-reference). Any new connector must use the current contract, not merely copy an old example. Executable connector packages need independent provenance, license, vulnerability and pinned-artifact review; a documentation link is not that review.

## Validation and rollout

The original feature-only [QA results](../../qa-reports/desk-skills/2026-10-16/RESULTS.md) retain authenticated export/import and synthetic browser evidence. The subsequent [combined candidate verification](../../qa-reports/launch-candidate/2026-10-16/RESULTS.md) supersedes its earlier counts and pending live checks: 1,384 frontend tests, 377 combined backend tests, the full 11-stage safety gate, both typechecks and production-format frontend build passed. It separately records all five real local responses and the remaining hosted gates.

Maintain these release regressions and repeat affected checks after any further changes:

1. Run catalog tests covering the exact seven names, thirteen recommendations, deterministic rendering, malformed/traversal identifiers, immutable built-in reads, no workspace writes and preservation of same-name custom files.
2. Run workspace-init and canonical-prompt regressions for all five desks. Confirm mutable custom text cannot enter canonical guidance and that tool permissions, privacy preflight and dispatch remain aligned.
3. Run Skills API/UI tests, frontend and server typechecks, production build and relevant safety gates. Browser-check view-only built-ins, custom editing, empty/loading/error states and the absence of fake slash commands or connected-status claims.
4. Preserve the current preview and data. Use an isolated candidate for browser checks unless updating the user's preview is explicitly requested. Verify ordinary chat, model persistence, Stop/Retry, usage holds and desk-specific live reads separately from fixture checks.
5. Record the exact tested commit, commands, results and remaining limits in the release handoff. PR review and hosted acceptance are separate gates; do not describe local test results as deployment evidence.

For each optional connector, additionally test tenant isolation, consent withdrawal, expired authentication, scope denial, secret redaction, outbound destination validation, output size, timeouts, rate/cost budgets and permitted live tool execution. Authentication should make only the approved tools available. Writes, wallet delegation, payments, background subscriptions and publication remain separately authorized actions.

Preloading does not activate Jev, STM, wallet signing, paid resources or external publication. Unknown-usage reservations remain held until reconciled. No new optional integration or five-desk live certification is claimed by this documentation change.
