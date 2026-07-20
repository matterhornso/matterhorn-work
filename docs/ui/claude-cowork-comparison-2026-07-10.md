# Matterhorn Desks UI Benchmark: Claude Cowork

Date: 2026-07-10

Purpose: create a practical benchmark for Matterhorn Desks's desk/chat UI against Claude Cowork without copying its brand or hiding Matterhorn's stricter Web3 safety boundaries.

## Source Snapshot

Official Anthropic material describes Claude Cowork as an agent surface where users describe an outcome, step away, and return to finished work. Current Cowork guidance emphasizes:

- Chat and Cowork sharing one home, with the user selecting Chat or Cowork from the same message box.
- Task state that follows the user across desktop, web, and mobile.
- Remote beta execution that can continue when the local device is offline.
- Projects with files, context, instructions, and memory.
- Explicit folder/tool access and approval requirements for sensitive actions.

## Product Difference

Matterhorn should not become a generic autonomous office agent. Matterhorn's wedge is protocol work with visible safety evidence:

- Desks are first-class: Bittensor, Hyperliquid, Polymarket, Longevity, Sui, Wallet, Memory, MCPs.
- Serious actions are previewed and reviewed; signing and submission stay external or explicitly wallet-mediated.
- Outputs, run history, notes, memory, and wallet previews must tell one evidence story.

## UI Bar

The platform should feel closer to Cowork in ease of use, while staying stricter than Cowork on risk:

1. One obvious entry point: users should start chat, desk work, and image generation from the main session surface, not hunt through separate panels.
2. A task launch should visibly create/open a working session, not silently fill a composer.
3. Home should show a compact latest activity summary, with full logs in Run history.
4. Safety detail should live behind slim info affordances unless action is blocked or approval is required.
5. Approval, billing, wallet, and login states must be controls, not decoration: disabled means blocked, warning means actionable, and success means the backend confirmed it.
6. Empty states should offer one next step, not explain the whole platform.
7. Surfaces should use the Matterhorn design contract: no giant prompt blocks, no harsh dividers, no oversized radii, no customer-facing OpenWork/OpenCode seam.

## Build Implications

- Desk launch: keep `sendImmediately: true` paths covered by behavioral tests and make failures visible with toasts plus composer fallback.
- Activity: keep Home collapsed by default and route full logs to Run history.
- Chat/image: make image generation a native composer capability with clear setup state and output receipts.
- Billing/login: show current state and next action from backend capabilities, not static cards.
- Security: keep local control-plane readiness, CORS, wallet approval behavior, and billing integrity inside CI gates.
