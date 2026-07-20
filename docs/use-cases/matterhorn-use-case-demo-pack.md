# Matterhorn Use-Case Demo Pack

A customer-facing overview of what Matterhorn Desks enables across Web3 trading, wellness creation, and decentralized services — all through chat, no separate apps required.

> **Safety first:** Every use case below is bounded by the [Matterhorn Workflow Contract](../matterhorn-workflow-contract.md). Matterhorn never takes custody or accepts keys and API secrets. Chat, MCP, CLI, watches, and agent prompts never submit. Hyperliquid supports a separate manual connected-wallet order ticket after exact review and wallet approval; Polymarket remains preview-only. Wellness remains artifact/workflow support. Decentralized services remain planned.

---

## A. Bittensor Operator

**User audience:** Crypto-native developers, AI researchers, and subnet participants who hold TAO and want to manage staking, delegation, and subnet discovery without touching a terminal or block explorer.

### Sample Prompts

| User asks | Matterhorn returns |
|---|---|
| `Show my TAO` | Current wallet balance and stake breakdown via public wallet read |
| `Where am I staked?` | Per-subnet stake distribution with coldkey/hotkey labels |
| `Compare validators on subnet 14` | Side-by-side validator comparison: trust score, return, commission, participation rate |
| `Prepare staking 1 TAO to subnet 14` | Unsigned transaction preview — amounts, validator target, fee estimate |
| `Explain subnet 8` | Plain-language subnet description, use case, and current emission rate |
| `Watch subnet 14 emissions` | Monitoring watch with alert threshold and safe follow-up guidance |
| `Export my wallet activity` | Public wallet timeline as a Matterhorn artifact |

### Artifacts / Evidence Produced

- Wallet balance card
- Stake distribution table
- Validator comparison card
- Unsigned staking preview (action card)
- External signer handoff payload (public fields only)
- Transaction receipt (post external signer — public confirmation)
- Watch report with alert summary

### Safety Boundary

- Matterhorn reads public wallet data only. It never holds, imports, or exports private keys, seed phrases, or mnemonics.
- Staking and delegation stop at an unsigned preview — external signer handoff is required.
- Matterhorn does not sign, submit, or broadcast transactions.
- No API secrets, raw signatures, signed payloads, or wallet exports are accepted.

### Current Status

**Beta-ready.** Read, preview, watch, receipt, and external-signer handoff flows are implemented and documented. Adapter marketplace and runtime gates are in place.

### Future Path

- Real-time stake alerts via scheduled autopilot
- Multi-subnet portfolio view
- Subnet service adapter invocations (mock → allowlisted → production)

---

## B. Hyperliquid Trader

**User audience:** Perpetual futures traders who want account context, orderbook data, and position analysis without linking an API key or granting withdrawal access.

### Sample Prompts

| User asks | Matterhorn returns |
|---|---|
| `Show my exposure` | Account position summary — size, entry price, unrealized PnL, margin used |
| `Read the BTC orderbook` | Current bid/ask depth, spread, and top-of-book pressure |
| `Preview a long on BTC` | Action preview card: size, leverage, estimated fee, liquidation price — no submission |
| `Explain my liquidation risk` | Margin health analysis with safe-deposit guidance |
| `What markets can I trade?` | Available perps list with 24h volume |

### Artifacts / Evidence Produced

- Account context card (read-only)
- Orderbook snapshot
- Action preview card (unsigned — external signer required)
- Liquidation risk analysis card
- Public receipt status (after external signer returns)

### Safety Boundary

- Matterhorn does not hold, store, or transmit Hyperliquid API secrets.
- `canSubmit: false` — no live order submission from within Matterhorn.
- All preview cards are unsigned. External signer handoff is the only execution path.
- Matterhorn never accepts raw signatures, signed payloads, or signed order data.

### Current Status

**Preview-only.** Read, orderbook, preview, and receipt flows are implemented. No live submit. External signer handoff is wired but requires a compatible signer.

### Future Path

- Multi-position portfolio view
- Slippage and fee simulation
- Real-time alert on liquidation threshold breach

---

## C. Polymarket Researcher

**User audience:** Speculators, analysts, and curiosity-driven users who want to understand market sentiment, liquidity, and odds — without creating an account or funding a position.

### Sample Prompts

| User asks | Matterhorn returns |
|---|---|
| `Summarize this market: <market-id>` | Market question, outcomes, current odds, volume, and end date |
| `Check liquidity on <market>` | Liquidity pool depth, spread, and market-maker activity |
| `Preview a bet on yes` | Bet preview card: stake, odds, potential payout, fee — no submission |
| `Is this market blocked in the US?` | Jurisdiction compliance state and any access restrictions |
| `What markets are trending?` | Trending markets list with odds and volume |

### Artifacts / Evidence Produced

- Market context card
- Liquidity analysis card
- Action preview card (bet preview — no submission)
- Compliance state card
- Public receipt status (if external signer used)

### Safety Boundary

- No Polymarket API key is required. Matterhorn reads public market data.
- `canSubmit: false` — no live bet placement from within Matterhorn.
- Jurisdiction checks are informational only. Users remain responsible for their own compliance.
- No raw signatures, signed payloads, or signed order data is accepted.

### Current Status

**Preview-only.** Market read, liquidity, preview, and receipt flows are implemented. No live bet placement. Compliance state is informational.

### Future Path

- Portfolio view of resolved positions
- Multi-market arbitrage scanner
- Automated bet receipt validation

---

## D. Wellness Creator

**User audience:** Personal trainers, yoga instructors, dieticians, gym coaches, and other client-facing service professionals who want to design programs, generate client artifacts, and package sellable services — entirely through chat.

### Sample Prompts

| User asks | Matterhorn returns |
|---|---|
| `Create a 4-week strength plan for my client` | Structured 4-week plan with session breakdown and safety disclaimers |
| `Make a yoga class packet` | Class plan, handout, checklist, and progress tracker artifact |
| `Create a dietician onboarding plan` | Client intake form, meal-planning template, and disclaimer |
| `Draft a paid program page but don't process payment` | Draft offer page with placeholder pricing only |
| `Export this as an artifact` | Matterhorn workflow / MCP export for reuse |

### Artifacts / Evidence Produced

- Program design plan with mandatory safety disclaimers
- Client artifact bundle: weekly plan, video script, checklist, FAQ, progress tracker
- Service packaging: offer page copy, pricing draft, onboarding questionnaire, terms/disclaimer
- Delivery plan (planned hooks only — storage, email, payments, access)
- Follow-up cadence and feedback form artifact
- Matterhorn workflow / MCP export

### Safety Boundary

- Wellness content is **educational only.** No medical diagnosis, treatment, prescription, or clinical care.
- Mandatory disclaimers are attached to every program, nutrition, and service artifact.
- **No live payments are processed.** Pricing drafts are placeholders only.
- **No live email is sent.** Delivery hooks are planned, not live.
- **No live storage or hosting.** Artifact hosting is planned, not live.
- **No live identity/access gating.** Token gating is planned, not live.
- Matterhorn never asks for or accepts seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports.

### Current Status

**Workflow live** as artifact generation. Delivery-stage service hooks (storage, email, payments, identity/access) are planned, not live.

### Future Path

- Creator-owned artifact storage and hosting
- Automated client email updates
- In-platform payment flow (creator receives, not Matterhorn)
- Token-gated premium programs

---

## E. Decentralized Services Operator

**User audience:** Power users and builders who want to understand how Matterhorn Desks will eventually surface storage, hosting, email, payments, and identity/access capabilities — without live execution today.

### Sample Prompts

| User asks | Matterhorn returns |
|---|---|
| `Host this packet` | Explanation of what artifact hosting would require and provider discovery fixture |
| `Store this client artifact` | Storage plan: which providers, what data, what stays local |
| `Send a paid program email` | Email delivery plan with provider options and evidence of what would be needed |
| `Gate this content` | Identity/access plan: token gating options, access levels, and what Matterhorn would coordinate |
| `What decentralized services does Matterhorn support?` | Capability map: storage, hosting, email, payments, identity/access — all planned |

### Artifacts / Evidence Produced

- Service capability map (storage, hosting, email, payments, identity/access)
- Provider discovery fixture
- Evidence bundle describing what inputs and approvals would be required for each service

### Safety Boundary

- **No live service execution.** Every service described is planned, not live.
- No real storage provider is called. No email is sent. No payment is processed.
- No live identity/access enforcement. Token gating is planned, not live.
- Evidence bundles describe intent and required inputs — they do not execute.

### Current Status

**Future-contract only.** Service capability contract is documented. No live execution paths exist.

### Future Path

- Live artifact storage via decentralized providers
- Automated email delivery (opt-in)
- In-platform payment routing
- Token-gated access control

---

## Verification

Run the standalone gate to verify all five use cases are present with required safety boundaries:

```bash
node scripts/use-case-demo-pack.test.mjs
```

Run the market execution safety gate to confirm no live submit paths exist:

```bash
pnpm test:market-execution-safety-gate
```
