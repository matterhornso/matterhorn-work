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
};

/**
 * Desk-specific starter tasks. These remain prompts instead of hidden automation:
 * the selected desk agent gathers any missing public context and keeps its signer,
 * compliance, and safety boundary visible before it prepares a result.
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
      title: "Prepare stake preview",
      detail: "Draft an unsigned stake handoff for external review.",
      prompt: "Prepare a Bittensor stake preview. Ask for public coldkey, validator hotkey, amount, and subnet if needed. Keep it unsigned and require an external Bittensor-compatible signer.",
    },
    {
      id: "unstake-preview",
      title: "Prepare unstake preview",
      detail: "Draft an unsigned unstake handoff for external review.",
      prompt: "Prepare a Bittensor unstake preview. Ask for public coldkey, validator hotkey, amount, and subnet if needed. Keep it unsigned and require an external Bittensor-compatible signer.",
    },
    {
      id: "transfer-preview",
      title: "Prepare transfer preview",
      detail: "Draft an unsigned TAO transfer handoff.",
      prompt: "Prepare a Bittensor TAO transfer preview. Ask for public sender, public recipient, amount, and optional memo. Keep it unsigned and require an external Bittensor-compatible signer.",
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
      title: "Prepare an order",
      detail: "Draft an order for exact review and connected-wallet approval.",
      prompt: "Prepare a Hyperliquid order. Ask for network, symbol, side, size, market or limit, slippage, and reduce-only state. Chat prepares a reviewable draft but does not submit it; execution requires a separate review and wallet signature in the Hyperliquid desk.",
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
      prompt: "Summarize this Polymarket market: <paste market URL or slug>. Include outcomes, liquidity/orderbook context, compliance state, source, freshness, and no bet placement.",
    },
    {
      id: "compare-outcomes",
      title: "Compare outcomes",
      detail: "Review public probability context and what may move it.",
      prompt: "Compare the public outcome probabilities for this Polymarket market: <paste market URL or slug>. Explain source, freshness, uncertainty, and the factors that could move the market. Do not place a bet.",
    },
    {
      id: "review-liquidity",
      title: "Review liquidity",
      detail: "Inspect visible orderbook depth before considering a preview.",
      prompt: "Review liquidity and visible orderbook context for this Polymarket market: <paste market URL or slug>. Show source and freshness, explain the limits of the data, and do not expose an executable order.",
    },
    {
      id: "check-compliance",
      title: "Check compliance",
      detail: "Confirm eligibility before any preview or handoff.",
      prompt: "Check whether this Polymarket market is eligible for a handoff: <paste market URL or slug>. If compliance blocks the flow, do not show executable price, size, share, or order fields.",
    },
    {
      id: "create-watch",
      title: "Create a market watch",
      detail: "Track public probability, liquidity, or compliance changes.",
      prompt: "Create a read-only watch for this Polymarket market: <paste market URL or slug>. Explain which public changes it can track. Never place or auto-execute a bet from a watch.",
    },
    {
      id: "review-watch-alerts",
      title: "Review market changes",
      detail: "Summarize recent watch signals and their public context.",
      prompt: "Review recent read-only watch signals for this Polymarket market: <paste market URL or slug>. Summarize probability, liquidity, or compliance changes with source and freshness. Do not place a bet.",
    },
    {
      id: "preview-trade",
      title: "Preview a trade",
      detail: "Model a non-submittable outcome preview for review only.",
      prompt: "Prepare a Polymarket trade preview for this market: <paste market URL or slug>. Ask for the outcome and amount if needed. Keep Can submit: No and Live submission: Off; do not place a bet.",
    },
    {
      id: "prepare-handoff",
      title: "Prepare wallet handoff",
      detail: "Draft a compliance-gated external-wallet handoff.",
      prompt: "Prepare a Polymarket compliance-gated external-wallet handoff for this market: <paste market URL or slug>. Ask for the outcome and amount if needed. Keep Can submit: No and Live submission: Off. Never ask for private keys, raw signatures, signed payloads, API secrets, or wallet exports.",
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
      title: "Preview a SUI transfer",
      detail: "Prepare a non-custodial transfer before wallet signing.",
      prompt: "Prepare a Sui transfer preview. Ask for public sender address, recipient address, network, amount, and memo if needed. Signing must happen in my connected Sui wallet on web or an external Sui wallet/client on desktop.",
    },
    {
      id: "token-transfer-preview",
      title: "Preview a token transfer",
      detail: "Prepare a non-custodial transfer with a public coin type.",
      prompt: "Prepare a Sui token transfer preview. Ask for public sender address, recipient address, network, amount, and public coin type if needed. Keep it non-custodial and require wallet signing outside chat.",
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
