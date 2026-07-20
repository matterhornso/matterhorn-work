# Matterhorn Perspectives, Media Studio & NFT Handoff
## Design Slice Handoff — CEO Review

**Date:** 2026-06-23
**Branch:** `minimax/chat-perspectives-media-nft-ux` → PR #508
**Status:** Open for review. All 3 gates pass. Docs + static prototype only — no live API calls, no wallet credentials, no actual minting.

---

## Executive Summary

Three new UX directions have been designed and documented at the product-spec level:

| Direction | What it is | Safety posture |
|-----------|-----------|----------------|
| **Matterhorn Perspectives** | AI responses shown as three simultaneous modes — risk-first, balanced, opportunity-forward — before any on-chain action | Safety layer enforced equally across all three modes |
| **Media Studio** | Generate video and audio, prepare NFT metadata, hand off to an external wallet for final mint | Prepare-only: Matterhorn never holds keys, never mints |
| **NFT Handoff** | External wallet connects, reviews metadata JSON, signs and submits mint externally | Zero custody at every step |

The unifying principle: **Matterhorn is always the advisor, never the actor.** It generates previews, composes metadata, and hands off — but never touches private keys, never signs, never submits.

---

## Feature 1: Matterhorn Perspectives

### What it is
A three-response-mode system that shows the same question answered from three distinct angles simultaneously:

- **Non-optimistic (amber):** Risk-first framing. Leads with "what can go wrong," what can be lost, what reversals look like. Appropriate for staking, trading, financial commitments.
- **Neutral (slate):** Balanced, factual. Presents both sides without advocacy. Appropriate for informational queries, comparisons, general knowledge.
- **Optimistic (green):** Opportunity-forward, constructive. Leads with what can be gained, what's possible, next steps. Appropriate for creative tasks, exploration, planning.

### How it works

A lightweight **Prompt Assessment Agent** classifies the user's intent as soon as a message is sent. It does not produce a response — it decides which framing to inject into the main agent's system prompt, and whether to surface one or three modes.

**Three modes does not mean three agents.** The same agent with three system-prompt variants produces three outputs. The Prompt Assessment Agent is stateless — it reads the message, classifies intent, and injects framing. It adds negligible latency.

### Design details

- **Mode selector:** Persistent pill toggle above the composer. User can lock a preferred mode or always see all three. Selector persists in memory.
- **Response cards:** Three stacked cards, each with its mode color (amber / slate / green). Cards are scrollable independently.
- **Safety Strip:** Every card — regardless of mode — carries the same Safety Strip at the bottom. The strip is not softer in Optimistic mode. Risk disclosures, external signer requirements, and medical disclaimers are identical across all three.
- **Safety is never weakened by mode.** The Optimistic mode does not remove, soften, or omit safety information. The tagline "See the whole picture before you act" is literal.
- **Single-output mode:** Users can collapse to one mode via the mode selector. The selected mode is stored per-user preference.
- **Memory chip bar:** Above the composer. Shows active memory context (relevant wallet info, past actions) as chips. Users can toggle which context is active. This ensures the three-mode system has the right background — e.g., "user has previously staked TAO, risk framing should acknowledge this."
- **Provenance drawer:** Slide-in panel on each card showing the reasoning trace — which memory was used, which mode framing was applied, what the Prompt Assessment Agent classified. For auditability.
- **"Use this answer" / "Compare modes" actions:** Below each card. "Use this answer" sends the selected mode's content to the action layer. "Compare modes" opens a side-by-side diff view.
- **"Generate media" action:** Triggers the Media Studio from within Perspectives.

### Safety architecture

Every on-chain intent (Bittensor staking, Hyperliquid, Polymarket) triggers the **external signer flow**:

1. Perspectives generates a preview
2. External signer (user's wallet) shows the exact transaction before signing
3. Matterhorn never sees the private key at any point
4. The external signer enforces the risk ceiling (e.g., max stake amount)

This applies in all three modes equally. Optimistic framing does not bypass the external signer.

**Wellness boundary:** For health/wellness content (yoga plans, nutrition), the Wellness mode enforces "educational only, not medical advice" disclaimer in every response card. No diagnosis, no prescription, no treatment recommendations in any mode.

---

## Feature 2: Media Studio

### What it is
An in-app studio for generating video and audio content, then preparing NFT metadata (without minting). The studio is part of the Perspectives experience — a user in Optimistic creative mode can "Generate media" and land directly in Media Studio.

### Screens

1. **Media Studio Overview:** App shell with mode-specific left nav (Video / Audio / NFT). Header shows current workspace.
2. **Video Generation:** Text-to-video and image-to-video. Style presets, duration, aspect ratio. Output preview. "Prepare NFT Handoff" CTA.
3. **Audio Generation:** Text-to-speech and music generation. Voice selection, mood/style presets. Output waveform preview. "Prepare NFT Handoff" CTA.
4. **NFT Metadata Preview:** Shows the JSON that will be uploaded to IPFS. Includes name, description, image/audio URL (IPFS CID placeholder), attributes. "Looks good — hand off to wallet" CTA.
5. **External Wallet Handoff:** User connects their wallet. Views the metadata JSON. Reviews it. Signs and submits the mint externally. Matterhorn shows a receipt.

### IPFS flow (Pinata)

1. User generates media → Matterhorn uploads to IPFS via Pinata → gets CID
2. Matterhorn builds metadata JSON (name, description, image CID, attributes) → uploads to IPFS → gets metadata CID
3. Metadata CID becomes `tokenURI` in the NFT smart contract
4. User's external wallet handles the actual `safeMint()` call

**Matterhorn never holds custody of media, metadata, or keys at any step.**

### Receipt format

After the external wallet completes the mint, Matterhorn generates a read-only receipt:

```
Matterhorn NFT Handoff — Receipt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Asset:       [name from metadata]
Format:     [video / audio / image]
IPFS CID:   [media CID]
Metadata:   [metadata JSON CID]
tokenURI:   ipfs://[metadata CID]
Contract:   [contract address]
Token ID:   [assigned on mint]
Wallet:     [user's connected wallet, truncated]
Timestamp:  [UTC]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Matterhorn Desks — matterhorn.so
```

Receipt is non-interactive. It is a record, not a claim.

---

## Feature 3: NFT Handoff

### What it is
The mechanism by which Matterhorn prepares an NFT for minting and hands the final action to the user's external wallet. There is no mint button in Matterhorn. There is a "hand off" button.

### Design constraints (forbidden patterns)

These must never appear in the Media Studio UI or any Matterhorn NFT flow:

- Seed phrase input field
- Private key input field
- API secret input field
- "Mint now" button → must be "Prepare NFT Handoff"
- "Connect wallet to mint" → must be "Connect wallet to review and sign"
- "Matterhorn mints for you" → must always be "you mint via your wallet"
- "Guaranteed sale value" or any promise of financial outcome
- Medical diagnosis, prescription, or treatment advice in wellness content

### ERC Standards reference

- **ERC-721:** For unique 1-of-1 NFTs (video, audio). Standard metadata fields (`name`, `description`, `image`, `animation_url`, `attributes`).
- **ERC-1155:** For fungible or semi-fungible tokens (course certificates, membership passes). Allows multiple token types in one contract. `tokenURI` pattern consistent with ERC-721.

### OpenSea metadata compliance

Metadata JSON follows OpenSea's standard:

```json
{
  "name": "Mountain Solitude — Dawn",
  "description": "AI-generated meditation audio, prepared by Matterhorn Desks.",
  "image": "ipfs://Qm.../image.png",
  "animation_url": "ipfs://Qm.../audio.mp3",
  "attributes": [
    { "trait_type": "Format", "value": "audio" },
    { "trait_type": "Mood", "value": "calm" },
    { "trait_type": "Duration", "value": "300" }
  ]
}
```

---

## Design Tokens

### Mode colors

| Token | Value | Use |
|-------|-------|-----|
| `--cp-nonopt` | `#F59E0B` (amber) | Non-optimistic mode |
| `--cp-neutral` | `#64748B` (slate) | Neutral mode |
| `--cp-opt` | `#10B981` (green) | Optimistic mode |
| `--cp-accent` | `#D1F2FF` (sky) | Accent, links, highlights |
| `--cp-bg` | `#0C0C0C` | Dark theme background |
| `--ms-bg` | `#111827` | Media Studio background |
| `--ms-nft` | `#6366F1` (indigo) | NFT action accent |

Light theme overrides are defined for all tokens.

### Typography

- **JetBrains Mono** — monospace elements (addresses, CIDs, code)
- **Aeonik-style sans** — body and headings (geometric, clean, legible)

### Responsive breakpoints

- Mobile: `< 768px` — single column, mode selector scrolls horizontally, cards stack
- Tablet: `768px–1024px` — two-column where appropriate
- Desktop: `> 1024px` — full three-card layout, side desk visible

---

## What's in this PR

```
docs/ui/matterhorn-chat-perspectives-media-nft/
├── chat-usp-and-response-modes.md    # USP, Perspectives branding, composer, mode
│                                       selector, memory chips, safety strip, 3-mode
│                                       design, safety architecture, prompt assessment
├── response-mode-flow.md              # Architecture diagram, layouts, states, 5 example
│                                       outputs (Bittensor, Polymarket, Hyperliquid,
│                                       wellness yoga, media generation), provenance
├── media-studio-nft-handoff.md        # ERC standards, IPFS/Pinata flow, 5 screens,
│                                       safety panel, receipt format, forbidden patterns
├── index.html                         # 13-screen static prototype
├── styles.css                         # Design tokens, mode colors, components, themes
└── prototype.js                       # showScreen(id), toggleTheme(), auto-init

scripts/
└── minimax-chat-perspectives-media-nft.test.mjs   # 120-assertion static design gate

package.json
└── test:minimax-chat-perspectives-media-nft         # pnpm script added
```

---

## What this PR does NOT contain

- Any API integration code (Pinata, OpenSea, Hyperliquid, Polymarket, Bittensor)
- Any smart contract code
- Any authentication, session, or wallet connection logic
- Any database schema
- Any backend routes

This is a **design slice.** It defines what to build, what it looks like, what safety boundaries exist, and what forbidden patterns must never appear. Engineering will translate this into implementation.

---

## Gates

All three gates pass cleanly:

| Gate | Result | Assertions |
|------|--------|------------|
| `test:minimax-chat-perspectives-media-nft` | ✅ PASS | 120 |
| `test:minimax-ui-system` | ✅ PASS | all |
| `test:market-execution-safety-gate` | ✅ PASS | all |

The gate for this slice covers: file existence, prototype screen presence, CSS token definitions, mode coverage, safety rule presence (Hyperliquid, Wellness, Polymarket, NFT), NFT flow completeness, forbidden string exclusion (no seed phrases, private keys, raw signatures in UI), brand language, feature coverage, example prompts.

---

## Decisions to flag for engineering

1. **Prompt Assessment Agent placement** — Stateless classifier injected before the main agent. Confirm this architecture with the AI/agent team. If latency is a concern, consider async classification after first token delivery.

2. **Pinata vs. other IPFS providers** — Current design uses Pinata. Confirm this is the preferred provider, or whether to support multiple (NFT.Storage, Web3.Storage).

3. **ERC-1155 decision** — Currently documented as an option for fungible/semi-fungible tokens. Engineering needs to confirm whether to implement 721 only for v1, or both.

4. **Metadata IPFS upload in browser vs. server** — The design assumes Pinata upload is handled server-side (API key security). Confirm this is acceptable or whether a browser-native IPFS approach is preferred.

5. **External signer integration** — The design references "external signer" but does not specify wallet provider (WalletConnect, MetaMask, Rabby, etc.). Engineering needs to make this call.

6. **Receipt storage** — Receipts are currently shown read-only in-app. Should they also be stored (local vault, server-side, on-chain reference)?

---

## What to review

**Look at the prototype first** (`docs/ui/matterhorn-chat-perspectives-media-nft/index.html`):
- Open in a browser. Navigate through all 13 screens.
- Confirm the three-mode card layout makes sense for the product's audience (Web3 users, DeFi-aware, risk-conscious).
- Confirm the Safety Strip in each card is visible and not dismissible.
- Check the light theme toggle.

**Then read the docs** in this order:
1. `chat-usp-and-response-modes.md` — Start at §1 (USP), read through §7 (Safety Architecture)
2. `response-mode-flow.md` — Architecture section + one example output (Bittensor or Hyperliquid)
3. `media-studio-nft-handoff.md` — §1 Overview, §4 NFT Flow, §6 Forbidden Patterns

**Then run the gate**:
```
pnpm test:minimax-chat-perspectives-media-nft
```

---

## Who built this

Design decisions made by engineering (this agent) against the product constraints provided: three response modes, non-custodial NFT flow, safety-first architecture, Matterhorn branding, JetBrains Mono / Aeonik-style sans typography, `#0C0C0C` dark / `#D1F2FF` accent color system.

No human UX designer was consulted in this iteration. The design is a first cut — functional and internally consistent, but needs a designer's eye for hierarchy, spacing, and copy before it goes to users.

**Recommended next step before engineering kickoff:** Schedule a 45-minute design review with the UX lead. Walk through the prototype. Get feedback on the three-card layout, the Safety Strip positioning, and the wellness boundary language. Incorporate feedback before engineering starts.
