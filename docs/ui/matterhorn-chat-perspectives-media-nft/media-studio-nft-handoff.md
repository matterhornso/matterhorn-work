# Matterhorn Media Studio & NFT Handoff

**Design specification for the Media Studio surface in Matterhorn Desks.**

---

## 1. Media Studio Overview

The Media Studio is a Matterhorn surface for generating and managing audio/video content, with an optional NFT collectible handoff. It is **not a minting machine** — it generates content, prepares NFT metadata, and hands off to an external wallet for the actual mint.

**Core flows:**
1. Generate video or audio → preview → optionally prepare NFT
2. Generate video or audio → preview → save locally
3. Import existing media → preview → optionally prepare NFT

**Safety foundation (non-negotiable):**
- Matterhorn does not take private keys, seed phrases, raw signatures, API secrets, or signed payloads
- Matterhorn does not mint NFTs — it prepares a mint handoff
- Minting always requires an external wallet
- Matterhorn never takes custody of media or NFTs

---

## 2. ERC Standards Reference

### ERC-721 (Non-Fungible Token Standard)
- Source: [EIP-721](https://eips.ethereum.org/EIPS/eip-721)
- Interface: `IERC721` with `ownerOf`, `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`
- Events: `Transfer`, `Approval`, `ApprovalForAll`
- Metadata extension: `ERC721Metadata` with `name()`, `symbol()`, `tokenURI(uint256)`
- Each NFT is unique — 1-of-1 edition
- Standard metadata JSON:
```json
{
  "name": "Asset Name",
  "description": "Description of the asset",
  "image": "ipfs://<CID>",
  "attributes": [...]
}
```

### ERC-1155 (Multi-Token Standard)
- Source: [EIP-1155](https://eips.ethereum.org/EIPS/eip-1155)
- Interface: `IERC1155` with `balanceOf`, `transferSingle`, `balanceOfBatch`
- Enables editions — same metadata, multiple copies
- Efficient for collections with shared metadata
- Standard metadata: same structure as ERC-721

### OpenSea Metadata Standards
- Source: [OpenSea docs](https://docs.opensea.io/docs/metadata-standards)
- Extends ERC-721/ERC-1155 with:
  - `name` — item name
  - `description` — human-readable, markdown supported
  - `image` — image URL (IPFS/HTTP), min 3000×3000 recommended
  - `animation_url` — video/audio/3D, supports MP4, WebM, MP3, WAV, GLB
  - `attributes` — trait array with `trait_type`, `value`, optional `display_type`
  - `external_url` — creator/asset website
  - `background_color` — six-char hex
- For audio/video NFTs: use `animation_url` pointing to IPFS-hosted media

### IPFS + Pinata NFT Flow
- Source: [Pinata IPFS NFT guide](https://docs.pinata.cloud/ipfs-101/how-does-ipfs-work-with-nfts)
- IPFS is immutable — content address via CID
- CIDs are based on content hash — can't be changed after upload
- Pinata: upload content → get CID → build metadata JSON → upload metadata → get metadata CID → use as Token URI
- Token URI format: `ipfs://<metadata-CID>` or `https://<gateway>/ipfs/<metadata-CID>`
- For audio/video: `image` = static thumbnail, `animation_url` = IPFS media URL

---

## 3. Media Studio Screens

### Screen 1: Media Studio Home

```
┌─ Media Studio ──────────────────────────────────────────────┐
│                                                               │
│  Generate content, preview it, prepare it as an NFT.         │
│  Matterhorn never holds your keys or mints on your behalf.   │
│                                                               │
│  ┌─ Generate ────────┐  ┌─ Import ────────┐               │
│  │ 🎬 Video          │  │ 📁 Import media  │               │
│  │ Generate from     │  │ Use existing    │               │
│  │ text prompt       │  │ audio or video  │               │
│  └───────────────────┘  └─────────────────┘               │
│                                                               │
│  ┌─ Recent Generations ──────────────────────────────────┐ │
│  │  🎬 Launch video v1     NFT: ERC-721  Jun 22   [Edit] │ │
│  │  🎬 Yoga program intro   NFT: draft      Jun 21   [→]  │ │
│  │  🔊 Podcast intro         Local only     Jun 20   [→]  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ Pending Mint Handoffs ──────────────────────────────┐  │
│  │  🔗 Wellness launch collectible  Draft  [Complete →] │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### Screen 2: Video Generation

```
┌─ Generate Video ────────────────────────────────────────────┐
│                                                               │
│  Describe the video you want to create:                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ A professional wellness instructor introducing a       │ │
│  │ 4-week yoga program. Warm lighting. Accessible        │ │
│  │ poses shown. Ends with a call to action.             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  Style:  [Cinematic ▾]   Duration:  [30s ▾]               │
│  Voice:  [Calm, warm ▾]  Format:  [MP4 ▾]                 │
│                                                               │
│  ⚠ Safety notice: Generated content must be original.       │
│     Do not use copyrighted music, characters, or footage.     │
│     Publicly shared content is permanent on IPFS.            │
│                                                               │
│  ┌─ Style Presets ───────────────────────────────────────┐ │
│  │ [Professional] [Creative] [Minimal] [Cinematic] [Custom]│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                               │
│  [Generate Preview]                                          │
│                                                               │
│  ┌─ Preview ──────────────────────────────────────────────┐ │
│  │  ████████████████░░░░░░░░  Generating…  60%         │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### Screen 3: Audio Generation

```
┌─ Generate Audio ─────────────────────────────────────────────┐
│                                                                │
│  Describe the audio:                                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ A calm podcast intro for a wellness brand.             │  │
│  │ 60 seconds. Warm music bed underneath.                  │  │
│  │ Ends with: "Start your journey today."                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  Type:   [Narration ▾]    Duration:  [60s ▾]               │
│  Voice:  [Warm female ▾]  Format:  [MP3 ▾]                  │
│                                                                │
│  ⚠ Same copyright and permanence warnings as video.            │
│                                                                │
│  [Generate Preview]                                           │
└────────────────────────────────────────────────────────────────┘
```

### Screen 4: NFT Metadata Preview

```
┌─ NFT Metadata Preview ────────────────────────────────────────┐
│                                                                 │
│  Review your collectible before creating the handoff.          │
│  Matterhorn will not mint this — you control your wallet.      │
│                                                                 │
│  ┌─ Collectible Preview ─────────────────────────────────────┐│
│  │  🎬 [thumbnail]                                           ││
│  │                                                            ││
│  │  Name:  [4-Week Yoga Launch — Intro Video    ]          ││
│  │  Desc:  [Professional yoga instructor intro…         ]   ││
│  │  Type:  [🎬 Video NFT — single collectible]             ││
│  └──────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ NFT Configuration ───────────────────────────────────────┐│
│  │  NFT Mode:                                                ││
│  │  ○ Not an NFT (save locally only)                        ││
│  │  ● Prepare ERC-721 (single collectible)                   ││
│  │  ○ Prepare ERC-1155 (edition)  Copies: [100]             ││
│  │                                                            ││
│  │  Storage:                                                 ││
│  │  ○ Local preview only (not uploaded)                     ││
│  │  ● IPFS / public storage handoff                         ││
│  │  ○ Decentralized storage (future)                        ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ NFT Metadata (preview) ──────────────────────────────────┐│
│  │  {                                                         ││
│  │    "name": "4-Week Yoga Launch — Intro Video",           ││
│  │    "description": "Professional yoga instructor…",       ││
│  │    "image": "ipfs://<media-CID>",                         ││
│  │    "animation_url": "ipfs://<media-CID>",                 ││
│  │    "external_url": "https://…",                         ││
│  │    "attributes": [                                        ││
│  │      {"trait_type": "Type", "value": "Video NFT"},       ││
│  │      {"trait_type": "Duration", "value": "30s"}          ││
│  │    ]                                                      ││
│  │  }                                                         ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  [← Back]  [Prepare NFT Handoff →]                            │
└─────────────────────────────────────────────────────────────────┘
```

### Screen 5: External Wallet Handoff

```
┌─ NFT Handoff ─────────────────────────────────────────────────┐
│                                                                 │
│  Your collectible is ready.                                    │
│  Matterhorn generated the metadata. You mint via your wallet. │
│                                                                 │
│  ┌─ Handoff Summary ──────────────────────────────────────────┐│
│  │                                                             ││
│  │  Name:         4-Week Yoga Launch — Intro Video           ││
│  │  Type:         ERC-721 (single collectible)               ││
│  │  Media:        ipfs://bafybeig… (30s video, MP4)         ││
│  │  Metadata:     ipfs://bafybeih… (JSON)                    ││
│  │  Network:      [Ethereum Mainnet ▾]                       ││
│  │  Chain:        [Base ▾]                                   ││
│  │                                                             ││
│  └───────────────────────────────────────────────────────────┘│
│                                                                 │
│  ⚠ Before proceeding:                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🔒 External wallet required: Matterhorn does not hold  │  │
│  │     your keys. You will sign the mint transaction in    │  │
│  │     your own wallet.                                     │  │
│  │                                                             │  │
│  │  💰 Fees: Minting requires gas. Base may have lower     │  │
│  │     fees than Ethereum mainnet. Review before signing.    │  │
│  │                                                             │  │
│  │  📋 Receipt: A Matterhorn receipt will be generated     │  │
│  │     documenting the NFT handoff for your records.         │  │
│  │                                                             │  │
│  │  🌍 Permanence: IPFS content is public and permanent.   │  │
│  │     Do not upload personal data you wish to remove later. │  │
│  │                                                             │  │
│  │  🚫 No custody: Matterhorn never takes ownership or       │  │
│  │     control of your NFT at any point.                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Select Wallet ───────────────────────────────────────────┐ │
│  │  [MetaMask]  [WalletConnect]  [Coinbase Wallet]         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ External Wallet Preview ──────────────────────────────────┐ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  Connect your wallet to review and sign the         │  │ │
│  │  │  mint transaction. Matterhorn cannot see or store    │  │ │
│  │  │  your private key at any time.                      │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │  [Connect Wallet →]                                      │  │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [← Back to Media Studio]                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. NFT Flow — Step by Step

### Step 1: Generate / Import Media
User generates video or audio in Media Studio, or imports existing media.

### Step 2: Review and Edit Metadata
User reviews and edits:
- Name (required, max 100 chars)
- Description (optional, markdown supported, max 2000 chars)
- External URL (optional, creator/asset website)
- Attributes (optional, key-value pairs)

### Step 3: Choose NFT Mode

| Mode | Use Case | Mint Type |
|------|----------|-----------|
| Not an NFT | Local/private use | No mint |
| ERC-721 | One-of-a-kind collectible | Single NFT |
| ERC-1155 | Edition/collection | N copies |

### Step 4: Choose Storage Mode

| Mode | What Happens | Use Case |
|------|-------------|----------|
| Local only | Media stays on device | Drafts, private work |
| IPFS handoff | Media uploaded to IPFS, CID in metadata | Public collectibles |
| Decentralized (future) | Storage via future decentralized network | Future expansion |

**IPFS flow:**
1. Media file → IPFS → get `media-CID`
2. Build metadata JSON with `media-CID` in `image`/`animation_url`
3. Metadata JSON → IPFS → get `metadata-CID`
4. `tokenURI` = `ipfs://<metadata-CID>`
5. User mints with `tokenURI` via external wallet

### Step 5: Safety Review Panel
Always shown before NFT handoff:

```
⚠ Safety Review
• Copyright warning — content must be original
• Public permanence warning — IPFS content is permanent
• Wallet required — external wallet, not Matterhorn
• Fees warning — gas costs apply
• No custody — Matterhorn never holds or controls the NFT
• Receipt generated — Matterhorn records the handoff
```

### Step 6: External Wallet Handoff
- Connect wallet via WalletConnect, MetaMask, or Coinbase Wallet
- Review transaction in wallet
- Sign and broadcast
- Matterhorn generates a receipt documenting the handoff

---

## 5. Receipts

Matterhorn generates a receipt for every NFT handoff:

```
┌─ NFT Handoff Receipt ──────────────────────────────────────┐
│                                                              │
│  Receipt ID:        mth-nft-20260623-001                   │
│  Generated:         Jun 23, 2026 08:00 UTC                 │
│  User:              [workspace-id]                         │
│                                                              │
│  Collectible:       4-Week Yoga Launch — Intro Video        │
│  NFT Standard:      ERC-721                                │
│  Token URI:         ipfs://bafybeih…                       │
│  Media CID:         ipfs://bafybeig…                       │
│  Network:           Base                                   │
│  Mint tx:           0x7b2a… (pending)                      │
│  Wallet used:       [address, truncated]                   │
│                                                              │
│  Matterhorn never held keys, minted, or took custody.       │
│  This receipt is for your records only.                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Forbidden Patterns

These must never appear in the Media Studio:

| Forbidden | Never |
|-----------|-------|
| Seed phrase input field | Any field asking for seed phrase |
| Private key input field | Any field asking for private key |
| API secret input field | Any field asking for API credentials |
| "Mint now" button | Only "Prepare NFT Handoff" |
| "Connect wallet to mint" | Only "Connect wallet to review and sign" |
| "Matterhorn mints for you" | Always "you mint via your wallet" |
| "Guaranteed sale value" | Never promise NFT financial outcomes |
| Medical diagnosis | Never in wellness content generation |
| Prescription / treatment advice | Never in wellness content generation |
| Upload API key for IPFS | No — handoff only |

---

## 7. Prototype Screens

The prototype (`index.html`) includes 13 screens:

1. Chat home with Matterhorn Perspectives USP
2. Single-output mode (Neutral)
3. Multi-output mode (all three cards)
4. Bittensor prompt — "Should I stake 1 TAO?" — all three modes
5. Hyperliquid preview — safety preserved in all modes
6. Polymarket — compliance note in all modes
7. Wellness — medical boundary preserved in all modes
8. Media Studio home
9. Video generation screen
10. Audio generation screen
11. NFT metadata preview (ERC-721)
12. External wallet handoff
13. Mobile layout (single-output, mode tabs, bottom composer)

---

## 8. Design Tokens (Media Studio)

```
/* Media Studio base — dark theme */
--ms-bg:           #0C0C0C;
--ms-surface:      #141414;
--ms-elevated:     #1E1E1E;
--ms-border:       #2A2A2A;
--ms-text:         #F0F0F0;
--ms-text-muted:   #888;
--ms-accent:       #D1F2FF;

/* Mode accents (applied to response cards) */
--ms-nonopt:       #F59E0B;  /* amber — risk */
--ms-neutral:      #94A3B8;  /* slate — balanced */
--ms-optimistic:   #22C55E;  /* green — opportunity */

/* NFT / safety */
--ms-nft:          #A78BFA;  /* purple — collectibles */
--ms-safety:       #F87171;  /* red — warnings */
--ms-ipfs:         #60A5FA;  /* blue — IPFS */

/* Buttons */
--ms-btn-primary:  #D1F2FF;
--ms-btn-danger:   #F87171;
--ms-btn-ghost:    transparent;
```
