# Matterhorn Perspectives — Response Mode Flow

**Source:** `docs/ui/matterhorn-chat-perspectives-media-nft/chat-usp-and-response-modes.md`
**This document:** Flow architecture, UI layouts, and example outputs for all three response modes.

---

## 1. Architecture Flow

```
User types query
        │
        ▼
┌─────────────────────────────┐
│  Prompt Assessment Agent    │
│  - Classifies intent         │
│  - Selects available modes   │
│  - Injects mode framing      │
│  - Routes to safety layer    │
└──────────────┬──────────────┘
               │
        ┌──────┴────────┬───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│ Non-opt      │ │ Neutral      │ │ Optimistic    │
│ Prompt       │ │ Prompt       │ │ Prompt        │
│ + risk       │ │ plain        │ │ + opportunity │
│ framing      │ │              │ │ framing       │
└──────┬───────┘ └──────┬──────┘ └──────┬───────┘
       │                │               │
       ▼                ▼               ▼
┌────────────────────────────────────────────────┐
│            Shared Safety Layer                   │
│  • Non-custodial guard                          │
│  • External signer check                        │
│  • No secrets / keys / diagnoses               │
│  • Agents never submit; Polymarket preview-only │
│  • Hyperliquid trade ticket: wallet approval    │
│  • Wellness: medical disclaimer                │
│  • Bittensor: receipt + external signer        │
└────────────────────────────────────────────────┘
       │                │               │
       ▼                ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│  ⚠ Non-opt   │ │  💬 Neutral │ │  🌱 Optimistic│
│  Response    │ │  Response   │ │  Response     │
│  Card        │ │  Card       │ │  Card         │
└──────────────┘ └─────────────┘ └──────────────┘
       │                │               │
       └────────────────┼───────────────┘
                        ▼
              ┌─────────────────┐
              │  User selects   │
              │  one to continue │
              └─────────────────┘
```

**Single-output mode:** user selects mode before or after seeing response; only one card is generated and shown.

**Multi-output mode:** all three cards are generated and shown simultaneously.

---

## 2. Desktop UI (≥1200px)

### Single-Output Mode
```
┌──────────────────────────────────────────────────────────┐
│ Safety Strip: 🔒 Non-custodial · 🧠 3 memories · ⚠ Pre │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [🔍 Bittensor ▾]  [Search memories…]                   │
│                                                          │
│  ┌─ Perspective Toggle ───────────────────────────────┐ │
│  │ ○ Non-opt   ● Neutral   ○ Optimistic   [Compare ↗]│ │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ 💬 Neutral ────────────────────────────────────────┐│
│  │────────────────────────────────────────────────────  ││
│  │                                                     ││
│  │  Hyperliquid BTC-PERP position: long 0.1 BTC,      ││
│  │  entry $64,250, current funding rate +0.0002/hr.   ││
│  │                                                     ││
│  │  Key considerations:                               ││
│  │  • Funding rate is positive — long pays short      ││
│  │  • Current leverage: 3×                          ││
│  │  • Margin used: 33% of available                   ││
│  │                                                     ││
│  │────────────────────────────────────────────────────││
│  │ [Use this] [Compare] [↗ Workflow]   Sources: HL API││
│  └────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─ Composer ───────────────────────────────────────┐   │
│  │ [Neutral ▾] │ Ask about your positions…         │   │
│  │ 🔒 3m · [📎] [🎬] [⏎]                            │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Multi-Output Mode
```
┌─ ⚠ Non-optimistic ──────────────────────────────────────┐
│ Before evaluating any position, consider:                │
│ • Funding rate of +0.0002/hr means you pay ~$14/day   │
│ • At 3× leverage, a 1% move = 3% PnL swing            │
│ • Hyperliquid uses isolated margin — position can be   │
│   liquidated independently                             │
│ • External signer will show preview before any action │
│                                                     │
│ [Use this] [Compare] [↗ Workflow]           HL API · M │
└─────────────────────────────────────────────────────┘

┌─ 💬 Neutral ────────────────────────────────────────────┐
│ BTC-PERP: long 0.1 BTC @ $64,250.                       │
│ Funding: +$14/day. Leverage: 3×. Margin used: 33%.       │
│ [Use this] [Compare] [↗ Workflow]           HL API · M │
└─────────────────────────────────────────────────────────┘

┌─ 🌱 Optimistic ─────────────────────────────────────────┐
│ Your Hyperliquid position is well-managed:               │
│ • 3× leverage is conservative                           │
│ • Isolated margin protects other funds                  │
│ • Positive funding rate reflects market confidence      │
│ • Your risk ceiling of 10× BTC is respected             │
│ [Use this] [Compare] [↗ Workflow] [🎬 Generate media]  │
└─────────────────────────────────────────────────────────┘
```

### Safety Strip States
| State | Color | Copy |
|-------|-------|------|
| Non-custodial read | Blue | 🔒 Non-custodial — Matterhorn reads data only |
| Preview pending | Amber | ⚠ Preview — external signer required before any action |
| Awaiting wallet | Amber pulse | ⏳ Awaiting external wallet confirmation |
| Signed | Green | ✅ Signed — receipt generated |
| Wellness | Pink | ♥ Wellness — educational only, not medical advice |

---

## 3. Tablet UI (768–1199px)

- Perspective toggle collapses to a single dropdown: "View mode: [Neutral ▾]"
- Response cards stack: Non-optimistic top, Neutral middle, Optimistic bottom
- Side desk panel collapses to icon strip
- Composer full-width at bottom
- Safety strip remains fixed at top

```
┌────────────────────────────────────────────────┐
│ 🔒 Non-custodial · 🧠 3 memories · ⚠ Preview   │
├────────────────────────────────────────────────┤
│ [View: Neutral ▾] [Compare All ↗]              │
│                                                │
│ ┌─ 💬 Neutral ─────────────────────────────┐  │
│ │ BTC-PERP long 0.1 @ $64,250…            │  │
│ │ [Use this] [Compare]                     │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌─ ⚠ Non-optimistic (collapsed) ─────────┐  │
│ │ ⚠ Risk considerations…    [Expand ↘]   │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌─ 🌱 Optimistic (collapsed) ──────────────┐  │
│ │ 🌱 Opportunity view…        [Expand ↘]  │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌─ Composer ──────────────────────────────┐  │
│ │ [Neutral ▾] │ Ask about positions…      │  │
│ └─────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

---

## 4. Mobile UI (<768px)

- Single-output mode only (no multi-output — too cramped)
- Mode selector: pill tabs at top of chat surface
- One card visible at a time
- Swipe left/right to switch modes
- Safety strip condensed to single icon + state text
- Composer fixed at bottom

```
┌────────────────────────────────┐
│ 🔒 · ⚠ Preview · 🧠 3          │  ← Condensed strip
├────────────────────────────────┤
│ [⚠] [💬] [🌱]                  │  ← Mode tabs
├────────────────────────────────┤
│                                │
│  ┌─ 🌱 Optimistic ───────────┐│
│  │                            ││
│  │  Your Hyperliquid          ││
│  │  position is well-        ││
│  │  managed…                 ││
│  │                            ││
│  │  [Use this]               ││
│  └────────────────────────────┘│
│                                │
│  ← swipe ← → to switch modes   │
│                                │
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │ Ask about positions…       │ │
│ │ [⚠ Non-opt ▾] [📎][⏎]    │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

---

## 5. Empty / Loading / Error States

### Empty State (No memories yet)
```
┌────────────────────────────────────────────────────┐
│  🧠                                                  │
│  No memories yet                                     │
│  Memories appear here as you use Matterhorn.         │
│  Start a session to build your context.             │
│  [Start a session →]                                 │
└────────────────────────────────────────────────────┘
```

### Loading State (Mode generating)
```
┌─ 💬 Generating Neutral ─────────────────────────────┐
│  ████████████░░░░░░░░░░░░░░░░  Generating…         │
│  This usually takes a few seconds.                  │
│  [Cancel]                                           │
└────────────────────────────────────────────────────┘
```

### Multi-Output Loading
```
┌─ ⚠ Non-optimistic ──── ⏳ ─┐  ┌─ 💬 Neutral ──── ⏳ ─┐
│  ██████████░░░░░░░░░░░░░░  │  │  ████████░░░░░░░░░  │
└─────────────────────────────┘  └─────────────────────┘
┌─ 🌱 Optimistic ─────────────── ⏳ ─────────────────┐
│  ████████████████░░░░░░░░░░░░░░░░░░░░              │
└────────────────────────────────────────────────────┘
```

### Error State (API unreachable)
```
┌─ ⚠ Non-optimistic ──────────────────────────────────────┐
│  ✖ Could not generate response.                         │
│  Check your connection and try again.                   │
│  [Retry]                                                 │
└──────────────────────────────────────────────────────────┘
```

### Safety Error (Secret detected)
```
┌─ 💬 Neutral ─────────────────────────────────────────────┐
│  🔒 Matterhorn does not accept seed phrases, private    │
│  keys, API secrets, or raw signatures in chat.          │
│  [Learn more about safe usage →]                         │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Example Outputs

### 6.1 Prompt: "Should I stake 1 TAO?"

**Non-optimistic:**
> ⚠ **Before staking 1 TAO, consider:**
> - Staking is not reversible until you unstaking — the unbonding period is ~7 days on Bittensor.
> - Your TAO will be delegated to a validator. If the validator misbehaves, you may receive reduced rewards or a slash.
> - Bittensor subnet incentives change over time. Today's yield is not guaranteed for future epochs.
> - Delegation does NOT give Matterhorn custody of your TAO. You retain full control via your external wallet.
> - Have you confirmed this is your disposable TAO, not your core holdings?
>
> [Learn more about Bittensor staking →] [External signer preview →]

**Neutral:**
> Staking 1 TAO involves:
> - Delegating to a validator (earning ~Y tao/day depending on subnet demand)
> - 7-day unbonding period before you can transfer
> - No automatic compounding — you must re-stake manually or set a reminder
> - Network and validator performance affect yields
>
> Current Bittensor network stats: [validator performance dashboard →]

**Optimistic:**
> 🌱 **Staking 1 TAO could be a great first step into Bittensor:**
> - You're participating in decentralized AI infrastructure
> - Delegation lets you earn while maintaining full wallet control
> - You've done your research on validator performance — that's the key to maximizing yield
> - Your risk ceiling is respected: external signer will show a preview before any staking transaction
> - Once unbonding completes, you can adjust or add to your position anytime
>
> [Explore validator options →] [Set a reminder to check yields in 7 days →]

---

### 6.2 Prompt: "Summarize this Polymarket market: Will BTC be above $70k by Aug 2025?"

**Non-optimistic:**
> ⚠ **What I can tell you:**
> - Market: "Will BTC be above $70,000 by Aug 2025?" — currently trading at ~62¢
> - This is NOT financial advice. Prediction markets reflect sentiment, not probability.
> - Markets can resolve in unexpected ways (chain forks, exchange issues, oracles).
> - Polymarket uses UMA oracle — resolution depends on the oracle's truth-discovery mechanism.
> - Your $500 position is on Polymarket's smart contract, not with Matterhorn.
>
> Matterhorn reads this market for you. It does not place trades. [External signer →]

**Neutral:**
> **Market:** Will BTC be above $70k by Aug 2025?
> - Current price: ~62¢ (62% likelihood per market)
> - Volume: [fetching…]
> - Your position: $500 YES
> - Resolution: Aug 31, 2025, 8PM UTC via UMA oracle
>
> **Key terms:** Polymarket is non-custodial. Matterhorn reads the market. [External signer →]

**Optimistic:**
> 🌱 **You've positioned yourself well:**
> - Your $500 YES on BTC > $70k means you're aligned with the market's current sentiment
> - The 62¢ price reflects real conviction from participants
> - If BTC does break $70k, your position scales linearly — $620 return at resolution
> - You're tracking this actively — that's better than setting it and forgetting it
>
> [Set a reminder for Aug 1 →] [📊 More BTC markets →]

---

### 6.3 Prompt: "Should I place this Hyperliquid trade?"

**Non-optimistic:**
> ⚠ **External signer required — Matterhorn will not place this for you.**
> Before signing in your external wallet:
> - Review the exact order parameters (side, size, price, leverage)
> - Confirm your margin ceiling: you set 10× max on BTC
> - Check current funding rate: +$14/day on BTC-PERP
> - Confirm this does not exceed your risk ceiling
> - A liquidation is possible if price moves against you
>
> Matterhorn only generates a preview. The external signer is your wallet. [View preview →]

**Neutral:**
> **Hyperliquid BTC-PERP preview:**
> - Side: Long | Size: 0.1 BTC | Entry: $64,250 | Leverage: 3×
> - Estimated funding: $14/day | Liquidation price: [calculated]
> - Margin used: 33% of available
> - External signer required to confirm.
>
> [Preview in external signer →]

**Optimistic:**
> 🌱 **Your Hyperliquid setup is disciplined:**
> - Long at $64,250 with 3× leverage is conservative
> - You've set your own 10× ceiling — respect it
> - Funding rate is positive, meaning long positions earn funding
> - External signer means YOU are always in control
>
> [Preview and sign in external wallet →]

---

### 6.4 Prompt: "Create a 4-week plan for a yoga client."

**Non-optimistic:**
> ⚠ **Important:** This is an educational wellness plan, not a medical treatment plan.
> - Yoga instruction is generally safe but some poses are contraindicated for specific conditions.
> - Your client should confirm with a physician before starting any new physical program.
> - This plan is based on standard yoga teaching principles. It is not personalized medical advice.
> - If your client has injuries, pregnancy, or chronic conditions, refer them to a qualified specialist.
>
> **Week 1-2:** Gentle flow, breathwork, foundation poses
> **Week 3-4:** Progressive difficulty, client self-assessment
> [Matterhorn does not diagnose, prescribe, or treat.]

**Neutral:**
> **4-Week Yoga Client Plan:**
> - Weeks 1-2: Breathwork + gentle standing poses (30 min/session, 3×/week)
> - Weeks 3-4: Progressive flow, peak poses, cool-down (45 min/session, 3×/week)
> Notes: Adjust for client's stated experience level. Offer modifications.
> [This is educational material, not medical advice.]

**Optimistic:**
> 🌱 **Your client is in for a transformative 4 weeks:**
> - This is the perfect way to build a lasting yoga habit
> - Weeks 1-2 build the foundation — strength, flexibility, breath
> - Weeks 3-4 bring the reward — flowing sequences, newfound confidence
> - As they improve, they'll carry this into their daily life beyond the mat
>
> Your role as their instructor is powerful. Keep it safe, keep it supportive.
> [Export as client handout →] [Create wellness memory →]

---

### 6.5 Prompt: "Generate a launch video for my wellness offer."

**Optimistic (Media Studio pre-populated):**
> 🌱 **Great idea — a launch video builds credibility and excitement.**
> Based on your wellness offer, I'm pre-populating the Media Studio.
>
> [→ Open Media Studio with this prompt →]
> Video prompt seed: "Professional wellness instructor introducing a 4-week program, warm lighting, accessible poses, call to action"
>
> After generation, you can prepare it as an NFT collectible to add provenance to your offer.
> [Learn more about NFT handoff →]

---

## 7. Provenance Drawer

Expandable drawer on each response card (collapsed by default):

```
┌─ ⚠ Non-optimistic ───────────────────────────────┐
│ BTC-PERP position: long 0.1…                    │
│ [Use this] [Compare]               [▾ Provenance]│
└─────────────────────────────────────────────────┘
  ▼ (expanded)
┌─ ⚠ Non-optimistic · Provenance ────────────────┐
│                                                │
│  Original prompt:                               │
│  "Should I place this Hyperliquid trade?"     │
│                                                │
│  Transformed prompt (Non-opt):                 │
│  "Answer conservatively. Lead with risks…      │
│   Assume the worst case is likely. Preserve    │
│   all safety disclaimers…"                    │
│                                                │
│  Memories applied:                             │
│  • BTC wallet behavior (confidence: 92%)       │
│  • Funding rate alert prefs (confidence: 78%) │
│                                                │
│  Safety checks passed:                         │
│  ✓ Non-custodial confirmed                     │
│  ✓ External signer required                    │
│  ✓ No secret input detected                   │
│  ✓ Hyperliquid agent auto-submit blocked       │
└────────────────────────────────────────────────┘
```

---

## 8. Mode Color Reference

| Mode | Accent | Background | Icon | Border |
|------|--------|-----------|------|--------|
| Non-optimistic | `#F59E0B` | `rgba(245,158,11,0.08)` | ⚠ | amber |
| Neutral | `#94A3B8` | `rgba(148,163,184,0.08)` | 💬 | slate |
| Optimistic | `#22C55E` | `rgba(34,197,94,0.08)` | 🌱 | green |

Dark theme: above colors remain as-is.
Light theme: each mode darkens by ~15% for contrast.
