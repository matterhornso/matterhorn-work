# Crypto Workspace Panel — Beta Tester UX

The Crypto panel (right rail → Crypto: Bittensor, Hyperliquid, Polymarket) opens its **Demo** tab with a beta-tester quick-start so a first-time tester immediately understands what is safe and what each venue can do. Source: [`apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx`](../apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx).

## What a tester sees first

1. **Try in chat** — one-tap prompt buttons that **insert** a ready-to-review prompt into the chat composer. Nothing sends automatically; the tester reviews and presses send. Public reads work without connecting an EVM wallet. Prompts:
   - `show my TAO`
   - `find Bittensor subnets for image generation`
   - `compare validators on subnet 14`
   - `prepare staking 1 TAO`
   - `show Hyperliquid BTC orderbook`
   - `summarize a Polymarket market`
2. **Safety status** — per-venue maturity at a glance:
   - **Bittensor** — most complete beta flow; external signer required for actions; Matterhorn never holds keys.
   - **Hyperliquid** — preview only, live submission off. Can submit: No.
   - **Polymarket** — preview only, compliance checks required. Can submit: No.
   - Plus: *Matterhorn does not custody keys, sign silently, or submit live market trades.*
3. **Evidence / QA** — where to find proof:
   - Customer crypto smoke — `pnpm smoke:customer-ready-crypto`
   - Bittensor beta packet — `pnpm beta:bittensor:packet`
   - Market SDK validation evidence — `matterhorn-work crypto sdk-validate-public --mode fixture`

## Safety invariants (enforced by the gate)

- Prompt buttons **insert, never auto-send** (they dispatch the `matterhorn:crypto-chat-handoff` event, which the session surface applies to the composer with a "Review or send it from the chat composer" notice).
- No copy claims live Hyperliquid/Polymarket submission.
- No copy asks for private keys, seed phrases, API secrets, raw signatures, or signed payloads.
- Public-read flows do not require an EVM wallet.

Gate: `pnpm test:crypto-panel-ux` (plus the existing `test:customer-readiness-ui` and `test:matterhorn-customer-onboarding-ui`).
