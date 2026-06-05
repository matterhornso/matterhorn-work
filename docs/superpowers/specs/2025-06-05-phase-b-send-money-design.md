# Phase B: "Send Money" Wedge — Design Spec

> **Goal:** Make sending money as simple as Venmo/Cash App. One entry point, three capabilities: same-chain transfer, cross-chain bridge, unified smart routing.

**Architecture:** Server builds transfer/bridge calldata; client signs via existing `requestApproval()` flow. Address book stored in localStorage. Transaction history reads from on-chain events + local state.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## 1. What We Are Building

Three features, one mental model:

| Feature | What | User Sees |
|---------|------|-----------|
| **B.1 Same-Chain Transfer** | New "Transfer" tab. Pick token → enter recipient → enter amount → sign. Uses `transfer()` for ERC-20 or native value send for ETH. | "Send 50 USDC to 0x1234..." |
| **B.2 Bridge Polish** | Enhance existing Bridge tab. Add: recipient address book, real-time fee breakdown, bridge transaction history. | "Bridge $100 to Arbitrum in ~10 min, $0.50 fee" |
| **B.3 Unified Send Flow** | New primary "Send" button on WalletPanel. User enters recipient → if same chain: transfer flow; if different chain: bridge flow. Auto-detect chain from recipient ENS/address. | One "Send" button, zero cognitive load |

---

## 2. UX Flows

### Flow B.1: Same-Chain Transfer
1. User taps "Send" → Transfer panel opens
2. Token selector (USDC, WETH, ETH)
3. Recipient input with address book suggestions
4. Amount input with max button
5. Review: "You send 50 USDC → 0x1234...abc"
6. `requestApproval()` → sign → success toast

### Flow B.2: Cross-Chain Bridge (Polished)
1. User taps "Send" → picks "Different chain"
2. Destination chain selector (Arbitrum, Optimism, etc.)
3. Recipient input (auto-filled from address book)
4. Amount + token
5. Real-time Across quote: fee, time, receive amount
6. Review → sign → track status

### Flow B.3: Unified Smart Send
1. User taps "Send" in WalletPanel
2. Enter recipient (0x address or ENS)
3. System detects: same chain → Transfer flow; different chain → Bridge flow
4. User never thinks "bridge vs transfer" — just "send money"

---

## 3. Technical Approach

### Server
- **New:** `/api/transfer/build` — builds ERC-20 `transfer()` calldata or native `sendTransaction`
- **Existing:** `/api/bridge/quote`, `/api/bridge/deposit` — reuse from Phase 4
- **New:** `/api/ens/resolve` — ENS → address resolution (optional, Phase B.3)

### Client
- **New:** `TransferPanel.tsx` — lazy loaded, same pattern as other panels
- **Modified:** `BridgePanel.tsx` — add address book, fee preview, history
- **Modified:** `WalletPanel.tsx` — replace protocol nav with unified "Send" button
- **New:** `useAddressBook()` hook — CRUD for saved addresses in localStorage
- **New:** `useTransferHistory()` hook — reads TXs from store + on-chain

### Data Flow
```
User taps Send
  → if recipient on same chain:
    POST /api/transfer/build → calldata → requestApproval → sign
  → if recipient on different chain:
    GET /api/bridge/quote → fee preview
    POST /api/bridge/deposit → calldata → requestApproval → sign
  → TX hash recorded in history
  → Address saved to address book (if new)
```

---

## 4. Scope Boundaries

**In Phase B:**
- Same-chain transfers for USDC, WETH, native ETH on Base
- Bridge polish: address book, fee preview, history (existing Across integration)
- Unified Send entry point with chain detection
- Address book in localStorage (no backend persistence)
- Transaction history in wallet store (local + on-chain)

**Out of Phase B:**
- Multi-hop routing (e.g., Base → Optimism via Across + Aave)
- ENS resolution (can add in B.3 if trivial)
- Push notifications for TX completion
- Fiat on/off ramps
- Contact sync from phone/address book

---

## 5. UI Components

| Component | Type | Notes |
|-----------|------|-------|
| `TransferPanel` | New lazy panel | Token select, recipient, amount, review |
| `BridgePanel` (v2) | Enhanced | Address book, fee preview, history |
| `SendButton` | WalletPanel nav | Primary CTA, opens unified send flow |
| `AddressBook` | Reusable | List of saved addresses with chain + nickname |
| `FeePreview` | Reusable | Shows fee, time, receive amount |
| `TxHistory` | Reusable | Recent transfers + bridges |
| `useAddressBook` | Hook | localStorage CRUD |
| `useTransferHistory` | Hook | Aggregates TXs from store |

---

## 6. API Changes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/transfer/build` | `POST` | `{chainId, token, to, amount}` → `{to, data, value}` |
| `/api/bridge/quote` | `GET` | Existing — enhanced to show fee breakdown |
| `/api/bridge/deposit` | `POST` | Existing — unchanged |

---

## 7. Acceptance Criteria

- [ ] User can send USDC/WETH/ETH to any address on same chain
- [ ] Bridge panel shows fee preview before signing
- [ ] Address book allows saving + recalling recipient addresses
- [ ] Unified Send button routes to transfer or bridge automatically
- [ ] Transaction history shows recent transfers + bridges
- [ ] No `alert()` calls anywhere
- [ ] `pnpm run -r build` passes with 0 errors
- [ ] E2E tests verify transfer calldata + bridge quote endpoints

---

**Spec complete. Ready for implementation plan.**
