import type { ReviewedActionOperation } from "@matterhorn-work/types";

export type MatterhornDeskTaskStarterDesk =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui"
  | "wellness";

export type MatterhornDeskTaskStarter = {
  id: string;
  title: string;
  detail: string;
  prompt: string;
  reviewedAction?: "hyperliquid" | "polymarket" | "bittensor" | "sui";
  reviewedActionOperation?: ReviewedActionOperation;
  reviewedActionLabel?: string;
};

/**
 * Desk-specific starter tasks. Research tasks remain editable prompts. Transaction
 * starters open an explicit reviewed-action ticket so model availability can never
 * be mistaken for wallet or execution availability.
 */
export const MATTERHORN_DESK_TASK_STARTERS = {
  bittensor: [
    {
      id: "tao-balance",
      title: "Show TAO balance",
      detail: "Read a public SS58 balance and stake overview.",
      prompt: "Show my TAO balance for this SS58 public address: <paste public SS58 address>. Use public wallet context only and never ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
    },
    {
      id: "stake-allocations",
      title: "Review stake allocations",
      detail: "List current delegations and stake across subnets.",
      prompt: "Show where this SS58 public address is staked: <paste public SS58 address>. List public delegations and stake allocations across subnets, with source and freshness. Never ask for wallet secrets.",
    },
    {
      id: "discover-subnets",
      title: "Explore subnets",
      detail: "Find subnets that match a use case, with emissions context.",
      prompt: "Explore Bittensor subnets for my use case. Ask about my target use case if needed, then explain each relevant subnet, public emissions/activity context, source, freshness, and tradeoffs.",
    },
    {
      id: "compare-validators",
      title: "Compare validators",
      detail: "Compare performance, take, stake, and missing public context.",
      prompt: "Compare Bittensor validators on a subnet. Ask for the subnet ID if missing. Show public performance, take, stake, source, freshness, risks, and what extra public context is needed before staking.",
    },
    {
      id: "review-subnet-emissions",
      title: "Review subnet emissions",
      detail: "Summarize public emissions, activity, and recent changes.",
      prompt: "Review the public emissions and recent activity for a Bittensor subnet. Ask for the subnet ID if missing, cite source and freshness, and explain uncertainty rather than guessing.",
    },
    {
      id: "create-watch",
      title: "Create a subnet or validator watch",
      detail: "Track public emissions or validator changes without signing.",
      prompt: "Create a read-only Bittensor watch for a subnet or validator. Ask for the public target and optional threshold, then explain what the watch can observe. Never schedule or submit any on-chain action.",
    },
    {
      id: "stake-preview",
      title: "Stake TAO",
      detail: "Prepare exact stake terms for connected-wallet review.",
      prompt: "Prepare a Bittensor stake transaction. Ask for public coldkey, validator hotkey, amount, and subnet if needed. Keep the Agent draft non-submittable, then open the Bittensor action ticket where my installed wallet reviews, signs, and broadcasts the exact call.",
      reviewedAction: "bittensor",
      reviewedActionOperation: "stake",
      reviewedActionLabel: "Open stake ticket",
    },
    {
      id: "unstake-preview",
      title: "Unstake TAO",
      detail: "Prepare exact unstake terms for connected-wallet review.",
      prompt: "Prepare a Bittensor unstake transaction. Ask for public coldkey, validator hotkey, amount, and subnet if needed. Keep the Agent draft non-submittable, then open the Bittensor action ticket where my installed wallet reviews, signs, and broadcasts the exact call.",
      reviewedAction: "bittensor",
      reviewedActionOperation: "unstake",
      reviewedActionLabel: "Open unstake ticket",
    },
    {
      id: "transfer-preview",
      title: "Send TAO",
      detail: "Prepare exact transfer terms for connected-wallet review.",
      prompt: "Prepare a Bittensor TAO transfer. Ask for public sender, public recipient, and amount. Keep the Agent draft non-submittable, then direct me to the separate Bittensor transfer ticket where my installed wallet reviews, signs, and broadcasts the exact Finney call.",
      reviewedAction: "bittensor",
      reviewedActionOperation: "transfer",
      reviewedActionLabel: "Open transfer ticket",
    },
    {
      id: "import-receipt",
      title: "Import a receipt",
      detail: "Save public transaction evidence after it is signed elsewhere.",
      prompt: "Import a Bittensor receipt from this public transaction digest: <paste public transaction digest>. Use public receipt metadata only and save the evidence without collecting signing material.",
    },
  ],
  hyperliquid: [
    {
      id: "market-overview",
      title: "Read market overview",
      detail: "Summarize price, funding, open interest, and data freshness.",
      prompt: "Show BTC market context on Hyperliquid, including price, funding, open interest, source, freshness, and stale-data warnings. This is read-only market context.",
    },
    {
      id: "orderbook",
      title: "Read orderbook depth",
      detail: "Review spread and visible liquidity before a trade decision.",
      prompt: "Show BTC orderbook context on Hyperliquid, including spread, visible depth, source, freshness, and stale-data warnings. Do not prepare or submit an order yet.",
    },
    {
      id: "compare-funding",
      title: "Compare funding",
      detail: "Compare current funding across selected perpetual markets.",
      prompt: "Compare current Hyperliquid funding for BTC and ETH. Include source, freshness, uncertainty, and a plain-language explanation. This must remain read-only.",
    },
    {
      id: "account-exposure",
      title: "Review account exposure",
      detail: "Summarize public positions, margin, and concentration.",
      prompt: "Review my Hyperliquid account exposure. Ask for a public EVM address if it is missing. Summarize positions, margin, concentration, source, and freshness. Never ask for API secrets, private keys, raw signatures, or exchange custody.",
    },
    {
      id: "open-orders",
      title: "Review open orders",
      detail: "Inspect public order state before changing anything.",
      prompt: "Review my open Hyperliquid orders. Ask for a public EVM address if it is missing. Explain visible order state, source, freshness, and what would need wallet review before any change.",
    },
    {
      id: "price-watch",
      title: "Create a price watch",
      detail: "Track public price or orderbook changes without execution.",
      prompt: "Create a read-only Hyperliquid price or orderbook watch for BTC. Ask for an optional threshold and direction. The watch must never submit, sign, or auto-execute a trade.",
    },
    {
      id: "funding-watch",
      title: "Create a funding watch",
      detail: "Track funding changes without execution.",
      prompt: "Create a read-only Hyperliquid funding watch for BTC. Ask for an optional threshold and direction. The watch must never submit, sign, or auto-execute a trade.",
    },
    {
      id: "order-preview",
      title: "Place an order",
      detail: "Draft an order for exact review and connected-wallet approval.",
      prompt: "Prepare a Hyperliquid order. Ask for network, symbol, side, size, market or limit, slippage, and reduce-only state. Chat prepares a reviewable draft but does not submit it; execution requires a separate review and wallet signature in the Hyperliquid desk.",
      reviewedAction: "hyperliquid",
      reviewedActionOperation: "place_order",
      reviewedActionLabel: "Open order ticket",
    },
    {
      id: "cancel-order",
      title: "Cancel an order",
      detail: "Review an exact order cancellation before wallet approval.",
      prompt: "Cancel a Hyperliquid order. Ask for network, public wallet address, and numeric order ID. Keep the Agent draft non-submittable, then open the Hyperliquid trade ticket for exact review and connected-wallet authorization.",
      reviewedAction: "hyperliquid",
      reviewedActionOperation: "cancel_order",
      reviewedActionLabel: "Open cancel ticket",
    },
    {
      id: "modify-order",
      title: "Modify an order",
      detail: "Replace an open order after exact wallet review.",
      prompt: "Modify a Hyperliquid order. Ask for network, public wallet address, numeric order ID, symbol, side, size, order type, limit price if needed, slippage, and reduce-only state. Keep the Agent draft non-submittable, then open the Hyperliquid trade ticket for exact review and connected-wallet authorization.",
      reviewedAction: "hyperliquid",
      reviewedActionOperation: "modify_order",
      reviewedActionLabel: "Open modify ticket",
    },
    {
      id: "close-position",
      title: "Close a position",
      detail: "Prepare a reduce-only close for wallet review.",
      prompt: "Close a Hyperliquid position. Ask for network, public wallet address, symbol, side, size, order type, limit price if needed, and slippage. Use reduce-only terms. Keep the Agent draft non-submittable, then open the Hyperliquid trade ticket for exact review and connected-wallet authorization.",
      reviewedAction: "hyperliquid",
      reviewedActionOperation: "close_position",
      reviewedActionLabel: "Open close ticket",
    },
    {
      id: "wallet-approved-trade",
      title: "Review a wallet-approved trade",
      detail: "Understand the exact review and one-time wallet approval flow.",
      prompt: "Explain the Hyperliquid wallet-approved trade flow for the order I want to place. Keep chat read-only: execution can happen only in the dedicated trade ticket after exact review, a short-lived intent, connected-wallet approval, and the deployment execution switch permit it.",
    },
    {
      id: "import-receipt",
      title: "Import a receipt",
      detail: "Save public trade evidence after a wallet-approved action.",
      prompt: "Import a public Hyperliquid trade receipt after a wallet-approved order is completed. Use public receipt metadata only and never request API secrets, private keys, raw signatures, or signed payloads.",
    },
  ],
  polymarket: [
    {
      id: "discover-markets",
      title: "Discover markets",
      detail: "Search public markets by topic, category, or current event.",
      prompt: "Find Polymarket markets about <paste research topic>. Summarize public market options, source, freshness, and the limits of the available data. Do not place a bet.",
    },
    {
      id: "research-market",
      title: "Research a market",
      detail: "Explain outcomes, liquidity, orderbook context, and compliance state.",
      prompt: "Summarize the Polymarket market matching this request: <describe market or trade, or paste a Polymarket URL>. Include outcomes, liquidity/orderbook context, compliance state, source, freshness, and no bet placement.",
    },
    {
      id: "compare-outcomes",
      title: "Compare outcomes",
      detail: "Review public probability context and what may move it.",
      prompt: "Compare the public outcome probabilities for the Polymarket market matching this request: <describe market or trade, or paste a Polymarket URL>. Explain source, freshness, uncertainty, and the factors that could move the market. Do not place a bet.",
    },
    {
      id: "review-liquidity",
      title: "Review liquidity",
      detail: "Inspect visible orderbook depth before considering a preview.",
      prompt: "Review liquidity and visible orderbook context for the Polymarket market matching this request: <describe market or trade, or paste a Polymarket URL>. Show source and freshness, explain the limits of the data, and do not expose an executable order.",
    },
    {
      id: "check-compliance",
      title: "Check compliance",
      detail: "Confirm eligibility before any preview or handoff.",
      prompt: "Check whether the Polymarket market matching this request is eligible for a handoff: <describe market or trade, or paste a Polymarket URL>. If compliance blocks the flow, do not show executable price, size, share, or order fields.",
    },
    {
      id: "create-watch",
      title: "Create a market watch",
      detail: "Track public probability, liquidity, or compliance changes.",
      prompt: "Create a read-only watch for the Polymarket market matching this request: <describe market or trade, or paste a Polymarket URL>. Explain which public changes it can track. Never place or auto-execute a bet from a watch.",
    },
    {
      id: "review-watch-alerts",
      title: "Review market changes",
      detail: "Summarize recent watch signals and their public context.",
      prompt: "Review recent read-only watch signals for the Polymarket market matching this request: <describe market or trade, or paste a Polymarket URL>. Summarize probability, liquidity, or compliance changes with source and freshness. Do not place a bet.",
    },
    {
      id: "preview-trade",
      title: "Buy an outcome",
      detail: "Resolve the market and prepare exact terms for wallet review.",
      prompt: "Prepare a Polymarket BUY order from this request: <describe market or trade, or paste a Polymarket URL>. Resolve the exact public market and ask for outcome, amount, and price only if missing. Check compliance. Keep the Agent draft non-submittable, then open the connected-wallet trade ticket for final review and authorization.",
      reviewedAction: "polymarket",
      reviewedActionOperation: "buy",
      reviewedActionLabel: "Open buy ticket",
    },
    {
      id: "sell-shares",
      title: "Sell shares",
      detail: "Prepare exact sell terms for connected-wallet review.",
      prompt: "Prepare a Polymarket SELL order from this request: <describe market or trade, or paste a Polymarket URL>. Resolve the exact public market and ask for outcome, shares, and price only if missing. Check compliance. Keep the Agent draft non-submittable, then open the connected-wallet trade ticket for final review and authorization.",
      reviewedAction: "polymarket",
      reviewedActionOperation: "sell",
      reviewedActionLabel: "Open sell ticket",
    },
    {
      id: "cancel-order",
      title: "Cancel orders",
      detail: "Cancel one order or all eligible open orders after review.",
      prompt: "Prepare a Polymarket order cancellation. Ask for the public wallet address and either exact public order IDs or confirmation to cancel all eligible orders. Keep the Agent draft non-submittable, then open the connected-wallet trade ticket for final review and authorization.",
      reviewedAction: "polymarket",
      reviewedActionOperation: "cancel",
      reviewedActionLabel: "Open cancel ticket",
    },
    {
      id: "import-receipt",
      title: "Import a receipt",
      detail: "Save public evidence from an external wallet flow.",
      prompt: "Import a Polymarket receipt from this public receipt or transaction reference: <paste public receipt or transaction reference>. Use public receipt metadata only and do not collect signing material.",
    },
  ],
  sui: [
    {
      id: "read-wallet",
      title: "Read Sui wallet",
      detail: "View a public address, network, and SUI balance without custody.",
      prompt: "Show my Sui wallet for this public address: <paste public Sui address>. Use public account and balance context only. Never ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
    },
    {
      id: "read-testnet-balance",
      title: "Check testnet balance",
      detail: "Read public SUI balance on Sui testnet.",
      prompt: "Show the Sui testnet balance for this public address: <paste public Sui address>. Use public balance context only and never ask for wallet secrets.",
    },
    {
      id: "read-mainnet-balance",
      title: "Check mainnet balance",
      detail: "Read public SUI balance on Sui mainnet.",
      prompt: "Show the Sui mainnet balance for this public address: <paste public Sui address>. Use public balance context only and never ask for wallet secrets.",
    },
    {
      id: "compare-networks",
      title: "Compare network balances",
      detail: "Review public balance context across mainnet and testnet.",
      prompt: "Compare mainnet and testnet Sui balance context for this public address: <paste public Sui address>. Clearly label the network and source for every value; never request signing data.",
    },
    {
      id: "validate-recipient",
      title: "Validate a recipient address",
      detail: "Check the public address format before creating a transfer preview.",
      prompt: "Validate this public Sui recipient address for a transfer preview: <paste public Sui address>. Explain that this only checks the public address format and does not authorize a transfer.",
    },
    {
      id: "sui-transfer-preview",
      title: "Review a SUI transfer",
      detail: "Prepare the exact transfer, then sign it in your Sui wallet.",
      prompt: "Prepare a Sui transfer preview. Ask for public sender address, recipient address, network, amount, and memo if needed. Signing must happen in my connected Sui wallet on web or an external Sui wallet/client on desktop.",
      reviewedAction: "sui",
      reviewedActionOperation: "transfer_sui",
      reviewedActionLabel: "Open transfer ticket",
    },
    {
      id: "token-transfer-preview",
      title: "Review a token transfer",
      detail: "Prepare a token transfer, then sign it in your Sui wallet.",
      prompt: "Prepare a Sui token transfer preview. Ask for public sender address, recipient address, network, amount, and public coin type if needed. Keep it non-custodial and require wallet signing outside chat.",
      reviewedAction: "sui",
      reviewedActionOperation: "transfer_coin",
      reviewedActionLabel: "Open transfer ticket",
    },
    {
      id: "object-transfer",
      title: "Transfer an object or NFT",
      detail: "Prepare an object transfer for connected-wallet review.",
      prompt: "Prepare a Sui object transfer. Ask for public sender address, recipient address, network, and public object ID. Keep the Agent draft non-submittable, then open the Sui ticket where my connected wallet reviews, signs, and submits the exact transfer.",
      reviewedAction: "sui",
      reviewedActionOperation: "transfer_object",
      reviewedActionLabel: "Open object transfer",
    },
    {
      id: "batch-transfer",
      title: "Send SUI to multiple recipients",
      detail: "Prepare a batch of native SUI transfers for one wallet review.",
      prompt: "Prepare a batch SUI transfer. Ask for public sender address, network, and each public recipient and amount. Keep the Agent draft non-submittable, then open the Sui ticket where my connected wallet reviews, signs, and submits the exact batch.",
      reviewedAction: "sui",
      reviewedActionOperation: "batch_transfer_sui",
      reviewedActionLabel: "Open batch transfer",
    },
    {
      id: "review-transfer-fees",
      title: "Review transfer fees",
      detail: "Use a preview to discuss network and gas considerations.",
      prompt: "Help me review Sui transfer network and gas considerations before signing. Ask for the public sender, recipient, network, amount, and coin type if needed, then keep the result as a non-custodial preview.",
    },
    {
      id: "review-signing-handoff",
      title: "Review signing handoff",
      detail: "Understand where wallet approval happens on web and desktop.",
      prompt: "Explain the Sui signing handoff for my transfer preview. On web, approval happens only in my connected Sui wallet; on desktop, Matterhorn prepares an external wallet handoff. Matterhorn must not ask for or store signing material.",
    },
    {
      id: "import-receipt",
      title: "Import transaction receipt",
      detail: "Save public transaction metadata after signing elsewhere.",
      prompt: "Import a Sui transaction receipt from this public transaction digest: <paste transaction digest>. Use public receipt metadata only and save the receipt as project evidence.",
    },
  ],
  wellness: [
    {
      id: "client-intake",
      title: "Start client intake",
      detail: "Capture audience, experience, constraints, and practical context.",
      prompt: "Start a non-medical Longevity client intake. Ask about audience, experience level, constraints, schedule, available equipment, and non-medical goals. Do not request protected health information.",
    },
    {
      id: "define-goals",
      title: "Define program goals",
      detail: "Set achievable outcomes, boundaries, and a time horizon.",
      prompt: "Help define non-medical Longevity program goals, constraints, and a realistic time horizon. Keep the guidance educational and do not diagnose, prescribe, or promise outcomes.",
    },
    {
      id: "strength-plan",
      title: "Build a strength plan",
      detail: "Draft a progressive, educational resistance-training routine.",
      prompt: "Build an educational Longevity strength plan. Ask for experience, available equipment, schedule, constraints, and goals. Keep it non-medical and include sensible progression and recovery reminders.",
    },
    {
      id: "endurance-plan",
      title: "Improve endurance and VO2 max",
      detail: "Draft an educational aerobic conditioning plan.",
      prompt: "Build an educational endurance and VO2 max improvement plan. Ask for current activity, schedule, equipment, and non-medical constraints. Do not diagnose, prescribe, or claim guaranteed results.",
    },
    {
      id: "mobility-plan",
      title: "Build a mobility and yoga plan",
      detail: "Create a practical movement routine for the week.",
      prompt: "Build an educational mobility and yoga plan. Ask about schedule, equipment, preferences, and non-medical movement goals. Do not diagnose injuries or prescribe treatment.",
    },
    {
      id: "nutrition-education",
      title: "Create nutrition education",
      detail: "Make a plain-language nutrition learning guide.",
      prompt: "Create an educational nutrition guide for a Longevity program. Ask about practical food preferences and schedule, keep it general and non-medical, and avoid diagnoses or treatment claims.",
    },
    {
      id: "recovery-tracker",
      title: "Create a recovery tracker",
      detail: "Plan habits, rest, and check-ins without medical claims.",
      prompt: "Create a non-medical recovery and habit tracker for a Longevity program. Focus on sleep routines, mobility, stress-management practices, and self-reflection without giving medical advice.",
    },
    {
      id: "weekly-schedule",
      title: "Build a weekly schedule",
      detail: "Turn the plan into a realistic weekly routine.",
      prompt: "Build a weekly Longevity schedule from my goals, availability, equipment, and preferred activities. Keep it educational, practical, and non-medical.",
    },
    {
      id: "client-packet",
      title: "Create a client packet",
      detail: "Generate a weekly plan, checklist, FAQ, and progress tracker.",
      prompt: "Create a Longevity client packet with an educational weekly plan, checklist, FAQ, and progress tracker. Keep all copy non-medical and avoid promises or treatment claims.",
    },
    {
      id: "package-service",
      title: "Package a coaching offer",
      detail: "Draft an offer, onboarding questions, and clear boundaries.",
      prompt: "Package a Longevity program as a coaching offer with draft positioning, onboarding questions, and non-medical terms/disclaimer text. Do not imply live payments, email, hosting, or medical services.",
    },
  ],
} satisfies Record<MatterhornDeskTaskStarterDesk, readonly MatterhornDeskTaskStarter[]>;

export function getMatterhornDeskTaskStarters(desk: MatterhornDeskTaskStarterDesk) {
  return MATTERHORN_DESK_TASK_STARTERS[desk];
}
