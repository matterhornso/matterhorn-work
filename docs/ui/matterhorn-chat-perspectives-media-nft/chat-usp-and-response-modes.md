# Matterhorn Chat — Perspectives & Response Modes

## Current Implementation

The production chat currently implements **one response at a time** with a per-session perspective selector:

- **Cautious** - risk-first framing;
- **Balanced** - factual default;
- **Optimistic** - opportunity-forward framing.

The selector is rendered beside the `Perspective` label in the composer. The value is stored per workspace/session and injected into system context. It changes framing only; all wallet, financial, compliance, privacy, and wellness safety requirements remain identical.

The parallel three-card comparison layouts described later in this document are prototype exploration and are not the current product. `Non-optimistic` and `Neutral` were renamed to `Cautious` and `Balanced` in production.

Source: `apps/app/src/react-app/domains/session/perspectives/response-perspective.ts`.

**Recommended feature name:** **Matterhorn Perspectives**

**Why "Matterhorn Perspectives"?**
- "Perspectives" signals plurality and nuance — it immediately communicates this is not a single canned response.
- It matches the spatial metaphor already used in Matterhorn (desks, surfaces, workspaces) without colliding with existing terms.
- It is descriptive without being jargony. A new user understands it immediately: "I get multiple viewpoints."
- It avoids the clinical feel of "Response Modes," the vague feel of "Decision Modes," and the ambiguous feel of "Decision Lenses."
- It pairs naturally: "View from the Neutral perspective" — clear, conversational.

---

## 1. What Makes Matterhorn Chat Different

Matterhorn is not "a chat interface." It is a **contextual action surface** where chat is the front door.

| Generic AI Chat | Matterhorn Perspectives |
|----------------|----------------------|
| One answer per question | One intent, multiple lenses |
| Invisible memory | Memory chips always visible |
| No protocol context | Side desks for Bittensor, Hyperliquid, Polymarket, Wellness, Media, MCPs |
| Generic safety | Safety strip with visible action state |
| No evidence trail | Receipts & receipts/evidence panel |
| No action rails | External signer + non-custodial architecture baked in |

**Core positioning statement:**
> "One intent. Three lenses. Safe action rails."

- **Intent** — what the user actually wants to do
- **Three lenses** — Non-optimistic, Neutral, Optimistic
- **Safe action rails** — non-custodial, external signer, memory control, receipts

---

## 2. Feature Name and Tagline

**Name:** Matterhorn Perspectives

**Tagline options:**
- "See the whole picture before you act."
- "One question. Three viewpoints."
- "Know the risk. See the opportunity. Stay in control."

**Recommendation:** "See the whole picture before you act." — it speaks to both the conservative (risk) and optimistic (opportunity) lens without naming them, and it emphasizes user agency.

---

## 3. Chat Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Matterhorn Work                                      [Memory] [⚙] │
├──────────┬──────────────────────────────────┬───────────────────────┤
│          │                                  │                       │
│ Sidebar  │   Chat Surface                   │   Side Desk Panel     │
│          │                                  │   (contextual)        │
│ Overview │                                  │                       │
│ Desk     │   ┌─ Safety Strip ───────────┐   │   Bittensor           │
│ Bittensor│   │ 🔒 Non-custodial · 🧠    │   │   Hyperliquid         │
│ Hyperlqd │   │     3 memories active     │   │   Polymarket          │
│ Polymkt  │   └───────────────────────────┘   │   Wellness            │
│ Wellness │                                  │   Media Studio        │
│ Media    │   ┌─ Memory Chip Bar ────────┐   │   MCPs                │
│ Memory   │   │ BTC wallet ×1  Prefs ×2 │   │                       │
│          │   └───────────────────────────┘   │                       │
│          │                                  │                       │
│          │   ┌─ Perspective Toggle ────┐   │                       │
│          │   │ ○ Non-opt  ● Neutral  ○ │   │                       │
│          │   │ Opt   [Compare Modes ↗]│   │                       │
│          │   └───────────────────────────┘   │                       │
│          │                                  │                       │
│          │   ┌─ Response Card ──────────┐   │                       │
│          │   │ ⚠ NON-OPTIMISTIC        │   │                       │
│          │   │ ...                      │   │                       │
│          │   │ [Use this] [Compare]     │   │                       │
│          │   └───────────────────────────┘   │                       │
│          │                                  │                       │
│          │   ┌─ Composer ───────────────┐   │                       │
│          │   │ [Mode ▾]  [textarea    ] │   │                       │
│          │   │ [+media] [📎] [⏎]        │   │                       │
│          │   └───────────────────────────┘   │                       │
└──────────┴──────────────────────────────────┴───────────────────────┘
```

---

## 4. Composer Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [Mode ▾] │ User query...                                         │
│          │                                                          │
│ [🔒 Non-custodial · 3 memories] [📎 attach] [🎬 media] [⏎ Send] │
└──────────────────────────────────────────────────────────────────┘
```

**Composer components:**
- **Mode selector** — inline pill selector: Non-optimistic / Neutral / Optimistic
- **Textarea** — user input, placeholder: "Ask about Bittensor, Hyperliquid, Wellness, anything…"
- **Memory chip bar** — shows active memories relevant to this session
- **Safety strip** — shows current action state (read-only, external signer, preview, etc.)
- **Attach** — paperclip, for attaching documents/screenshots
- **Media** — opens Media Studio
- **Send** — submit

**In multi-output mode:** the mode selector shows "All 3" and the composer accepts any query. Each mode response is shown stacked below.

---

## 5. Mode Selector

**Visual treatment:**
```
[● Neutral] [○ Non-optimistic] [○ Optimistic]     [Compare Modes ↗]
```

Each mode has a distinct visual identity:
- **Non-optimistic** — amber border + warning icon · `#F59E0B` accent
- **Neutral** — blue/slate · `#94A3B8` accent
- **Optimistic** — green/lime · `#22C55E` accent

**Mode descriptions on hover:**
| Mode | Tooltip |
|------|---------|
| Non-optimistic | "Conservative view: risk-first, worst-case scenarios, compliance check" |
| Neutral | "Balanced view: factual, plain, standard assistant response" |
| Optimistic | "Opportunity view: constructive, assumes success is possible, motivation" |

---

## 6. Multi-Output Toggle

```
┌─ Response Cards ────────────────────────────────────────────────┐
│                                                                  │
│  ┌─ Non-optimistic ──────┐ ┌─ Neutral ────────────┐            │
│  │ ⚠ Risk-first          │ │ 💬 Balanced          │            │
│  │ Before you stake TAO… │ │ Here's an overview… │            │
│  │ [Use this] [Compare]  │ │ [Use this] [Compare] │            │
│  └───────────────────────┘ └─────────────────────┘            │
│                                                                  │
│  ┌─ Optimistic ───────────────────────────────────┐           │
│  │ 🌱 Opportunity-forward                            │           │
│  │ Staking TAO could yield…                        │           │
│  │ [Use this] [Compare] [↗ Media]                  │           │
│  └─────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

- Desktop: side-by-side (Non-optimistic + Neutral) above, Optimistic full-width below
- Tablet: Non-optimistic + Neutral stacked, Optimistic full-width
- Mobile: all three stacked vertically

---

## 7. Memory / Context Chips

Shown in the chip bar above the composer and in the safety strip:

| Chip | Label | Color |
|------|-------|-------|
| Active | "Using N memories" | Accent blue |
| Memory | "[title]" | Neutral chip |
| Count | "×N" | Small chip |
| Remember | "Remember this" | Accent |
| Do Not Remember | "Do not remember" | Ghost |
| Forget | "Forget related" | Red ghost |

**Safety constraint:** Chips never display raw values (addresses, amounts, keys).

---

## 8. Safety Strip

The safety strip is always visible at the top of the chat surface:

```
┌─ Safety Strip ────────────────────────────────────────────────┐
│ 🔒 Non-custodial  ·  🧠 3 memories  ·  📋 External signer   │
│ ⚠ Preview only — no order will be submitted automatically    │
└──────────────────────────────────────────────────────────────┘
```

**States:**
| State | Strip color | Copy |
|-------|------------|------|
| Read-only | Blue | "Matterhorn is reading data only" |
| Preview | Amber | "This is a preview. External signer required." |
| Pending signature | Amber pulse | "Awaiting your external wallet confirmation" |
| Signed | Green | "Signed. Receipt generated." |
| Wellness | Pink | "Educational only. Not medical advice." |

---

## 9. Response Cards

Each response card has:
- **Mode badge** — colored label at top left (Non-optimistic / Neutral / Optimistic)
- **Mode icon** — emoji indicator (⚠ / 💬 / 🌱)
- **Response body** — formatted markdown, may include tables, code, etc.
- **Source chips** — where the response drew from
- **Memory chips** — memories used in this response
- **Action buttons:**
  - `Use this answer` — continues conversation with this mode's framing
  - `Compare modes` — opens multi-output view with all three
  - `Turn into workflow` — saves as a reusable workflow template
  - `Generate media` — opens Media Studio pre-populated with response content (where appropriate)
- **Provenance drawer** — collapsed by default, expand to see:
  - Original prompt
  - Transformed prompt per mode
  - Memories applied
  - Safety checks passed

---

## 10. Action Buttons

| Action | Availability | Behavior |
|--------|-------------|----------|
| `Use this answer` | On each card | Continues chat with this mode's framing, appending to the conversation |
| `Compare modes` | On each card | Toggles multi-output view showing all three cards |
| `Turn into workflow` | On selected card | Opens workflow creation modal with response pre-filled |
| `Generate media` | On Optimistic card (contextual) | Opens Media Studio with response as media prompt seed |

**Safety:** `Use this answer` on a Non-optimistic response carries the conservative framing forward. The mode selector updates to match.

---

## 11. Side Desk Panel

The side desk panel is a contextual right-side panel that shows relevant protocol/service context:

| Desk | Shows |
|------|-------|
| Bittensor | Validator set, stake status, subnet performance, recent events |
| Hyperliquid | Open positions, margin, funding rates, active alerts |
| Polymarket | Tracked markets, current positions, resolution status |
| Wellness | Active goals, streaks, next check-in, recent wellness memories |
| Media Studio | Recent generations, pending mint handoffs |
| MCPs | Connected MCP status, last calls |

The panel is collapsible. It auto-opens when the user navigates to a specific desk from the sidebar.

---

## 12. Three Response Modes — Detailed Design

### 12.1 Non-optimistic Mode

**When to use:** Finance, trading, wallet actions, compliance, legal, security, production launches, anything involving real money or irreversible actions.

**Tone:** Conservative, risk-first, skeptical, asks "what could go wrong."

**Visual identity:** Amber/red — `#F59E0B` accent, ⚠ icon, warning border on card

**Response characteristics:**
- Leads with risks and edge cases
- Asks clarifying questions before proceeding
- Flags regulatory concerns
- Highlights worst-case scenarios
- For trading: emphasizes leverage risk, impermanent loss, smart contract risk
- For wellness: emphasizes non-medical nature, consult a professional

**Safety preserved:**
- For Hyperliquid/Polymarket: never implies external signer can be bypassed
- For Wellness: always includes medical disclaimer
- Never weakened by the Optimistic mode

---

### 12.2 Neutral Mode

**When to use:** Default. Factual questions, general information, explanations, normal assistant tasks.

**Tone:** Balanced, plain, factual, normal assistant output.

**Visual identity:** Blue/slate — `#94A3B8` accent, 💬 icon, neutral card

**Response characteristics:**
- Straightforward, factual answer
- No spin in either direction
- Good for learning, research, documentation
- For trading: explains mechanics without suggesting action
- For wellness: factual health information without advice

---

### 12.3 Optimistic Mode

**When to use:** Ideation, motivation, opportunity discovery, constructive planning, creative tasks, onboarding, education.

**Tone:** Opportunity-forward, motivating, constructive, assumes success is possible while retaining safety boundaries.

**Visual identity:** Green/lime — `#22C55E` accent, 🌱 icon, positive border on card

**Response characteristics:**
- Leads with possibilities and opportunities
- Focuses on upside and constructive paths
- Motivational framing where appropriate
- For trading: explains potential upside alongside risks
- For wellness: positive framing, goal-oriented, encouraging

**Safety constraint:** Optimistic mode does NOT weaken safety. It adds positive framing on top of the safety layer, not instead of it.

---

## 13. Safety Architecture

All three modes share the same safety foundation:

```
User Input
    │
    ▼
Prompt Assessment Agent
    │ (analyzes intent, selects mode, injects framing)
    ▼
┌──────────────┬────────────────┬──────────────────┐
│ Non-opt      │ Neutral        │ Optimistic       │
│ Prompt       │ Prompt         │ Prompt           │
│ (+ risk      │ (plain         │ (+ opportunity   │
│  framing)    │  prompt)       │  framing)        │
└──────────────┴────────────────┴──────────────────┘
    │              │                │
    ▼              ▼                ▼
┌──────────────────────────────────────────────┐
│          Shared Safety Layer                 │
│                                              │
│  • Non-custodial check                       │
│  • External signer required for actions      │
│  • No seed phrase / private key storage      │
│  • No medical diagnosis / prescription        │
│  • Wellness disclaimer                       │
│  • Hyperliquid/Polymarket: preview only     │
│  • Bittensor: receipt + external signer     │
│  • Secret input: refuse / redact             │
└──────────────────────────────────────────────┘
    │              │                │
    ▼              ▼                ▼
Response Card   Response Card   Response Card
```

**The transformed prompt for each mode is visible in the provenance drawer, not the main UI.**

---

## 14. Prompt Assessment Agent Logic

The assessment agent runs before the main agent. It:

1. **Classifies intent:** `trade` | `query` | `workflow` | `creative` | `wellness` | `legal` | `unknown`
2. **Determines appropriate modes:**
   - `trade` / `legal` → all three modes strongly differentiated
   - `wellness` → all three modes, but all include medical disclaimer
   - `creative` → Optimistic prominent, Neutral available, Non-optimistic abbreviated
   - `query` → Neutral prominent, others available on request
3. **Selects default mode** based on intent
4. **Injects framing prompts:**

```
Non-optimistic: "Answer conservatively. Lead with risks. Assume the worst case is likely. Ask what could go wrong before suggesting what could go right. Preserve all safety disclaimers."
Neutral: "Answer factually and directly. Provide balanced information without spin in either direction."
Optimistic: "Answer constructively. Lead with possibilities and opportunities. Assume success is achievable while retaining all safety constraints. Be motivating and actionable."
```
