# Matterhorn Backend To Frontend Linkage Audit

Last updated: 2026-06-29

Purpose: keep one customer-readiness ledger for backend features, frontend linkages, settings behavior, and test coverage. This is the source of truth for deciding what to wire next and what must be labeled as Ready, Needs setup, Preview, Desktop only, Cloud only, or Developer.

## Status Rubric

| Status | Meaning |
|---|---|
| Ready | User can operate the surface end to end in the current app with expected local or public-data inputs. |
| Mostly ready | Core path works, but depends on local runtime, provider availability, or a known setup step. |
| Needs setup | The surface is real, but the user must connect an account, wallet, provider, server, folder, or token before it works. |
| Partial | Backend and UI exist, but at least one major linkage, auth state, or action path is incomplete. |
| Preview | Product contract, fixtures, or UI shell exists, but it must not be presented as a finished customer workflow. |
| Cloud only | Requires Matterhorn Cloud sign-in, organization selection, or a cloud worker. |
| Desktop only | Depends on Electron desktop runtime or packaged app APIs. |
| Developer | Intended for technical/debug use; hidden from default customer navigation unless developer mode is enabled. |
| Not linked | Backend or docs exist, but there is no production UI entry point yet. |

## Settings Reality Check

| Setting | Current status | What works today | Gaps before beta-safe labeling |
|---|---|---|---|
| Settings overview | Ready | Routes to settings sections and shows status badges. | Keep status badges visible so preview pages are not mistaken for production. |
| Preferences | Mostly ready | Model reasoning and context compaction prefs are wired to app state. | Confirm persistence across app restart in desktop QA. |
| Permissions | Mostly ready | Authorized-folder UI is backed by local Matterhorn server/config state. | Needs degraded state when the local server cannot read permissions. |
| Appearance | Mostly ready | Theme, language, and titlebar controls are wired. | Needs complete light-mode visual QA after Desk V2 polish. |
| Updates | Desktop only | Electron updater state is used in packaged desktop. | Browser/dev builds should stay informational. |
| Advanced | Developer | Runtime reconnect/restart/config paths are real. | Keep out of default customer mode; expose only when developer mode is enabled. |
| Wallet | Needs setup | Uses real wallet state plumbing and a wallet side panel. | Desktop/browser runtime currently often shows no EVM connectors. Needs a wallet bridge plan for MetaMask/Rabby plus SS58 identity support. |
| MCPs and Tools | Ready | Matterhorn MCP cards, install commands, and MCP server state/config are visible. | Marketplace entries still need clear catalog/installed/configured labels. Add live install/config probes per MCP card. |
| AI Providers | Needs setup | Provider connect/disconnect paths exist. | Backend auth/404 states need clearer UI and remaining legacy naming cleanup. |
| Environment | Developer | Intended to manage local environment variables through the server. | Current local runs can hit host-token/auth errors. Hide from default customer mode until auth is reliable. |
| Account | Needs setup | Matterhorn Cloud sign-in/create account shell exists. | Verify Matterhorn-owned URLs and cloud config in packaged beta. |
| Cloud Workers | Cloud only | Code paths exist for cloud workers. | Not useful without cloud sign-in/org selection. Hide from default customer mode. |
| Customization | Preview | Some layout toggles exist. | Branding/name edits are not fully available. Keep as Preview. |
| Agent Marketplace | Preview | Demo marketplace UI renders. | Agent blueprints are local/static. Hire/deploy/payment/execution are not live. |
| Recovery | Preview | Recovery page exists. | Several actions are disabled TODOs. Keep in Developer/Preview. |
| Feedback | Partial | Feedback entry exists. | Must route only to Matterhorn-owned support, not OpenWork Labs. |

## Backend Feature Ledger

| Area | Backend or contract surface | Frontend linkage | Status | Current tests | Missing linkage or tests |
|---|---|---|---|---|---|
| Bittensor chat and reads | Server Bittensor tools, sidecar/provider reads, crypto chat route, MCP/CLI tools. | Bittensor desk, composer handoff prompts, wallet panel venue mode, MCP page. | Mostly ready | `bun test apps/server/src/tools/bittensor.test.ts`, `pnpm test:bittensor-customer-readiness-gate`, `pnpm test:bittensor-live-qa` | Beginner-friendly subnet browser, wallet right-rail SS58 flow, provider degraded-state browser QA. |
| Bittensor actions | Unsigned stake/unstake/transfer previews, external-signer handoff, receipts. | Bittensor desk action prompts and wallet side panel. | Partial | `pnpm test:bittensor-signing-handoff-check`, `pnpm test:bittensor-receipt-check` | Full UI preview-confirm-handoff flow with no page overflow. |
| Bittensor watches | Watch creation, scheduler, digest, alert intent, receipt evidence. | Bittensor desk copy and MCP tools. | Partial | `pnpm test:bittensor-watch-autopilot`, `pnpm test:bittensor-watch-autopilot-scheduler` | Customer-facing watch list/check/digest UI. |
| Hyperliquid reads | Read-only orderbook/account/funding/exposure routes, CLI, MCP, live read smoke. | Hyperliquid desk, MCP page, unified crypto chat. | Partial | `pnpm test:hyperliquid-read-preview-qa`, `pnpm test:market-live-readonly-smoke` | Richer account exposure UI and provider-source display. |
| Hyperliquid previews | Preview and external-client handoff, signed-artifact metadata validation, receipt import. | Hyperliquid desk preview prompts and cards. | Preview | `pnpm test:market-sign-request-phase1`, `pnpm test:market-sign-artifact-routes`, `pnpm test:market-receipt-qa` | No live submit route by policy. Add UI for preview hash, stale preview rejection, and public receipt import. |
| Polymarket reads | Market discovery, outcome/orderbook/liquidity/compliance read routes, CLI, MCP. | Polymarket desk, MCP page, unified crypto chat. | Partial | `pnpm test:polymarket-read-preview-qa`, `pnpm test:polymarket-readiness-gate` | Better market-detail UI and compliance-block copy. |
| Polymarket previews | EIP-712 template validation, external signer handoff, receipt import. | Polymarket desk preview prompts and cards. | Preview | `pnpm test:market-official-sdk-validation-track`, `pnpm test:market-sign-artifact-routes` | No executable price/size/share on compliance-blocked previews. Add UI regression screenshots. |
| Unified crypto chat | `/api/crypto/chat/execute`, shared cards, CLI, MCP tool. | Home desk launchers, Bittensor/market desks, MCP page. | Mostly ready | `pnpm test:unified-crypto-chat`, `pnpm test:unified-crypto-shared-card-contract`, `pnpm test:crypto-cli-fallback` | Per-desk session separation and transcript card visual QA. |
| Crypto readiness and customer evidence | Readiness route, customer smoke, evidence bundles, live public QA. | Home capability status and docs. | Mostly ready | `pnpm test:customer-ready-crypto-smoke`, `pnpm smoke:customer-ready-crypto`, `pnpm test:crypto-live-public-qa` | Replace static home capability copy with live readiness where safe. |
| Matterhorn Memory contract and vault | Memory types, local vault, API/CLI, producers, suggestion contract. | Memory right-rail panel and suggestion inbox shell. | Partial | `pnpm test:matterhorn-memory-contract`, `pnpm test:matterhorn-memory-vault`, `pnpm test:matterhorn-memory-api-cli`, `pnpm test:matterhorn-memory-producers`, `pnpm test:matterhorn-memory-ui` | Production suggestion delivery, edit/confirm/dismiss lifecycle e2e, wellness restricted invariant in UI. |
| Wellness workflow | Workflow router, artifacts, demo packet export, medical-boundary QA. | Wellness launcher and desk/session prompt. | Partial | `pnpm test:wellness-creator-workflow`, `pnpm test:wellness-creator-pilot` | Full artifact generation/review UI and customer packet viewer. |
| MCP agent control | Matterhorn MCP config helper, session tools, browser/action docs, protocol MCP cards. | MCPs and Tools page. | Partial | `pnpm test:agent-crypto-operator-loop`, `pnpm test:crypto-cli-fallback` | Live status per MCP, one-click setup feedback, copied command smoke test from UI. |
| Desktop/browser control | Desktop bridge docs, UI-control MCP, browser action model. | Browser/files/tools rails. | Preview | `pnpm test:market-execution-safety-gate` plus docs gates | Hide non-customer computer-use surfaces unless in Developer mode. |
| Workflow templates | Customer workflow templates, launch metadata, manifest alignment. | Home launchers and desk session prompts. | Mostly ready | `pnpm test:matterhorn-customer-workflow-template-registry`, `pnpm test:matterhorn-workflow-template-registry` | Link every template to a visible desk or hide from customer default. |
| Lighthouse and Playwright harness | Lighthouse config and Playwright screenshot/performance harness. | Should be developer/settings-only. | Preview | `pnpm test:lighthouse-harness` where available, browser screenshot QA scripts | Do not surface as a customer session. Keep under Developer or QA docs. |

## Backend To Frontend Linkage Test Matrix

| Linkage | Required test |
|---|---|
| Home launcher opens each desk without auto-sending | `pnpm test:matterhorn-customer-onboarding-ui` plus Playwright click/screenshot pass. |
| Bittensor prompt insertion keeps public SS58-only copy | Unit/static test plus manual prompt insertion screenshot. |
| Hyperliquid and Polymarket preview prompts keep `Can submit: No` and `Live submission: Off` | `pnpm test:crypto-panel-ux`, `pnpm test:market-execution-safety-gate`, shared-card contract test. |
| Wallet rail opens wallet panel and reports connector availability honestly | App typecheck plus Playwright click on Wallet rail. |
| Profile rail opens auth/profile or settings consistently | Playwright click on Profile rail in cloud-signin and local modes. |
| Settings cards display honest status badges | Static settings test plus screenshot of overview. |
| MCP page shows Matterhorn MCPs with real install commands and protocol logos | Static onboarding/UI test plus copy-button smoke. |
| Memory panel never saves hidden memory | `pnpm test:matterhorn-memory-ui` and future producer e2e. |
| Wellness refuses medical/clinical prompts | `pnpm test:wellness-creator-workflow`. |
| Environment rejects or redacts secrets | Add server route test before marking Environment Ready. |

## Frontend QA Matrix

Run this before beta:

```bash
pnpm --filter @matterhorn-work/app typecheck
pnpm test:matterhorn-customer-onboarding-ui
pnpm test:crypto-panel-ux
pnpm test:customer-readiness-ui
pnpm test:matterhorn-memory-ui
pnpm test:market-execution-safety-gate
```

Manual/browser pass:

- Home: New Project opens workspace creation, desk launchers fit desktop/tablet/mobile, no horizontal overflow.
- Right rail: Profile, Wallet, MCPs, Memory, Bittensor, Hyperliquid, Polymarket, Wellness open the expected panel.
- Settings: every visible card either works or shows Ready, Needs setup, Preview, Desktop only, or Cloud only.
- Bittensor desk: beginner copy, SS58-only prompts, subnet/wallet/actions tabs scroll, degraded provider is understandable.
- Hyperliquid desk: preview-only language, no submit/sign button, orderbook/exposure prompts insert but do not auto-send.
- Polymarket desk: compliance block has no executable price/size/share fields.
- Wellness desk: standalone workflow, no Web3/market/medical/live-service claims.
- MCPs page: all Matterhorn MCP cards use protocol logos, copy install commands, and state supported clients.
- Memory page: suggestion lifecycle states are visible and no save happens without user confirmation.

## Safety Red Lines

- Never ask for, store, log, transmit, or render examples of seed phrases, private keys, mnemonics, raw signatures, signed payloads, API secrets, wallet exports, or real customer funds.
- Hyperliquid and Polymarket remain preview/external-signer/public-receipt only until a separate execution security review deliberately changes that.
- Bittensor actions remain unsigned previews and external-signer handoffs.
- Wellness remains educational and operational, not medical advice, diagnosis, prescription, or guaranteed outcomes.
