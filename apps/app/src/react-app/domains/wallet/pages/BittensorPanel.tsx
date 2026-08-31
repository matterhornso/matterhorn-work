/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BrainCircuit,
  CircleX,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Star,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAccount, useConnect, useSignTypedData, useSwitchChain, useWalletClient } from "wagmi";
import { ProtocolBrandLogo } from "../../session/workflows/protocol-brand-logo";
import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CANCEL_ALL_CONFIRMATION,
  POLYMARKET_CANCEL_CONFIRMATION,
  POLYMARKET_LIVE_CONFIRMATION,
  cancelPolymarketOrders,
  normalizePolymarketOrderIds,
  submitPolymarketOrder,
  type PolymarketPreparedOrder,
  type PolymarketPublicReceipt,
} from "../polymarket-execution";
import {
  createBittensorWalletActionPreview,
  listBittensorExtensionAccounts,
  submitBittensorWalletAction,
  type BittensorExtensionAccount,
  type BittensorPublicReceipt,
  type BittensorWalletAction,
  type BittensorWalletActionPreview,
} from "../bittensor-execution";
import type {
  BittensorActionQuote,
  BittensorSubnetDetail,
  BittensorSubnetSummary,
  BittensorSubtensorSidecarHealth,
  BittensorWalletSnapshot,
  MarketExecutionChainGuide,
  MarketExecutionReadinessReport,
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
  ReviewedActionOperation,
  ReviewedActionValidationResponse,
} from "@matterhorn-work/types";
import {
  MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY,
  MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS,
  type CustomerBetaDemoScenario,
  type MatterhornProtocolWorkspaceManifest,
} from "@matterhorn-work/types/matterhorn-workflows";
import {
  normalizeMatterhornServerUrl,
  readMatterhornServerSettings,
} from "../../../../app/lib/matterhorn-server";
import { isPublicBetaWebDeployment } from "../../../../app/lib/matterhorn-deployment";
import {
  subscribeReviewedActionHandoff,
  takePendingReviewedActionGuard,
  takePendingReviewedActionHandoff,
} from "../reviewed-action-handoff";
import {
  createHyperliquidReviewDraft,
  type HyperliquidReviewDraft,
} from "../hyperliquid-review-draft";

const WATCH_ADDRESS_KEY = "matterhorn:bittensor:watchAddress";
const FAVORITES_KEY = "matterhorn:bittensor:favorites";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const CHECK_PENDING_LABEL = "Check pending";

type HyperliquidDraftHandoff = Extract<ReviewedActionDraftHandoff, { protocol: "hyperliquid" }>["draft"];
type PolymarketDraftHandoff = Extract<ReviewedActionDraftHandoff, { protocol: "polymarket" }>["draft"];
type BittensorDraftHandoff = Extract<ReviewedActionDraftHandoff, { protocol: "bittensor" }>["draft"];

type BittensorWalletTimelineStatus = {
  enabled: boolean;
  walletCount: number;
  snapshotCount: number;
  retentionLimit: number;
  warnings: string[];
  updatedAt: string;
};

type BittensorWalletTimelineSnapshot = {
  ss58Address: string;
  capturedAt: string;
  contentSha256: string;
};

type BittensorWalletTimelineExport = {
  generatedAt: string;
  ss58Address: string | null;
  status: BittensorWalletTimelineStatus;
  snapshots: BittensorWalletTimelineSnapshot[];
  warnings: string[];
};

type HyperliquidExecutionIntent = {
  intentId: string;
  operation: "place_order" | "cancel_order" | "modify_order" | "close_position";
  network: "testnet" | "mainnet";
  signerAddress: `0x${string}`;
  asset: string;
  side: "buy" | "sell" | null;
  size: number | null;
  orderType: "market" | "limit" | null;
  orderPrice: number | null;
  estimatedNotionalUsdc: number | null;
  slippageBps: number | null;
  reduceOnly: boolean | null;
  orderId: number | null;
  expiresAt: string;
  typedData: {
    domain: {
      name: "Exchange";
      version: "1";
      chainId: 1337;
      verifyingContract: `0x${string}`;
    };
    types: {
      Agent: readonly [
        { readonly name: "source"; readonly type: "string" },
        { readonly name: "connectionId"; readonly type: "bytes32" },
      ];
    };
    primaryType: "Agent";
    message: { source: "a" | "b"; connectionId: `0x${string}` };
  };
  confirmation: { required: boolean; phrase: "SUBMIT LIVE ORDER" | "SUBMIT LIVE ACTION" | null };
  safety: { maxOrderNotionalUsdc: number };
};

type HyperliquidExecutionReceipt = {
  intentId: string;
  operation: "place_order" | "cancel_order" | "modify_order" | "close_position";
  network: "testnet" | "mainnet";
  asset: string;
  side: "buy" | "sell" | null;
  size: number | null;
  orderId: number | null;
  status: "submitted" | "rejected" | "uncertain";
  submittedAt: string;
  venueResponse: unknown;
};

type PolymarketPreviewResponse = {
  success?: boolean;
  blocked?: boolean;
  preview?: {
    marketId: string | null;
    tokenId: string | null;
    marketLabel: string | null;
    outcome: string | null;
    size: number | null;
    price: number | null;
    estimatedShares: number | null;
    previewSha256: string;
    expiresAt: string;
    risk: { maxLossUsdc: number } | null;
    compliance: { status: "allowed" | "blocked" | "unknown"; reason: string | null };
    warnings: string[];
  };
  handoff?: Record<string, unknown> | null;
  error?: { message?: string };
};

type PolymarketSellPreviewResponse = {
  success?: boolean;
  preview?: {
    marketId: string;
    tokenId: string;
    marketLabel: string;
    outcome: string;
    shares: number;
    estimatedFillPrice: number | null;
    estimatedProceedsUsdc: number | null;
    previewSha256: string;
    expiresAt: string;
    compliance: { status: "allowed" | "blocked" | "unknown"; reason: string | null };
    warnings: string[];
  };
  error?: { message?: string };
};

type PolymarketMarketSearchResult = {
  id: string;
  question: string;
  slug: string | null;
  outcomes: string[];
  outcomePrices: Record<string, number>;
  volume: number | null;
  liquidity: number | null;
  endDate: string | null;
  source: {
    freshness: "live" | "recent" | "stale" | "fallback" | "unknown";
    fetchedAt: string;
  };
};

type PolymarketMarketSearchResponse = {
  success?: boolean;
  markets?: PolymarketMarketSearchResult[];
  error?: { message?: string };
};

type BittensorWalletActionPreviewResponse = {
  success?: boolean;
  preview?: {
    action: BittensorWalletAction;
    network: "finney" | "test" | "local";
    amountTao: number | null;
    coldkey: string | null;
    destination: string | null;
    hotkey: string | null;
    netuid: number | null;
    feeTao: number | null;
    warnings: string[];
    consequenceSummary: string;
  };
  error?: { message?: string };
};
const CUSTOMER_DEMO_COMMANDS = {
  readiness: "matterhorn-work crypto readiness --json",
  readinessApi: "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\"",
  desktopInstallGuide: "docs/desktop-beta-first-run.md",
  desktopTesterArtifact: "pnpm electron:tester-artifact -- --output-dir \"$HOME/Desktop/matterhorn-work-build-$(git rev-parse --short=8 HEAD)\" --json",
  desktopBetaDoctor: "pnpm desktop:beta-doctor -- --artifact-dir \"$HOME/Desktop/matterhorn-work-build-$(git rev-parse --short=8 HEAD)\" --strict --json",
  executionReadiness: "matterhorn-work crypto execution-readiness --json",
  executionReadinessApi: "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/market-execution-readiness\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\"",
  executionChain: "matterhorn-work crypto execution-chain --json",
  executionChainApi: "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/market-execution-chain\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\"",
  sdkValidationApi: "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/market-sdk-validation\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\"",
  executionChainSignRequest: [
    "matterhorn-work hyperliquid sign-request BTC --side buy --size 0.001 --price <testnet-price> --execution-mode testnet_external_signer --json",
    "matterhorn-work polymarket sign-request <testnet-market-id> --side yes --amount-usdc 1 --execution-mode testnet_external_signer --json",
  ].join("\n"),
  executionChainArtifact: [
    "matterhorn-work hyperliquid validate-artifact --sign-request-file <public-sign-request.json> --artifact-file <redacted-artifact.json> --json",
    "matterhorn-work polymarket validate-artifact --sign-request-file <public-sign-request.json> --artifact-file <redacted-artifact.json> --json",
  ].join("\n"),
  executionChainReceipt: [
    "matterhorn-work hyperliquid receipt --handoff-file <public-handoff.json> --receipt-file <public-receipt.json> --json",
    "matterhorn-work polymarket receipt --handoff-file <public-handoff.json> --receipt-file <public-receipt.json> --json",
  ].join("\n"),
  sdkDoctor: "matterhorn-work crypto sdk-doctor --strict --json",
  sdkValidateFixture: [
    "matterhorn-work crypto sdk-validate-public",
    "--mode fixture",
    "--input-dir qa-fixtures/market-official-sdk",
    "--output-dir /tmp/matterhorn-market-sdk-public-validation",
    "--strict",
    "--json",
  ].join(" "),
  sdkValidateTestnet: [
    "matterhorn-work crypto sdk-validate-public",
    "--mode operator_owned_testnet",
    "--input-dir /tmp/operator-public-artifacts",
    "--output-dir /tmp/matterhorn-market-sdk-public-validation",
    "--hyperliquid-network hyperliquid-testnet",
    "--hyperliquid-package-version <hyperliquid-python-sdk-version>",
    "--polymarket-network polygon-amoy",
    "--polymarket-chain-id 80002",
    "--polymarket-exchange-address <public-amoy-exchange-address>",
    "--polymarket-package-version <clob-client-version>",
    "--strict",
    "--json",
  ].join(" "),
  sdkLoop: [
    "matterhorn-work crypto sdk-loop",
    "--mode fixture",
    "--output-dir /tmp/matterhorn-market-sdk-loop",
    "--strict",
    "--json",
  ].join(" "),
  hyperliquidWatchCreate: [
    "matterhorn-work hyperliquid watch create",
    "--asset BTC",
    "--kind funding_rate",
    "--direction change",
    "--threshold 0.01",
    "--json",
  ].join(" "),
  hyperliquidWatchCheck: "matterhorn-work hyperliquid watch check --json",
  hyperliquidWatchDigest: "matterhorn-work hyperliquid watch digest --json",
  hyperliquidWatchAct: "matterhorn-work hyperliquid watch act --watch-file <public-hyperliquid-watch.json> --alert-index 0 --json",
  polymarketWatchCreate: [
    "matterhorn-work polymarket watch create",
    "<public-market-id>",
    "--json",
  ].join(" "),
  polymarketWatchCheck: "matterhorn-work polymarket watch check --json",
  polymarketWatchDigest: "matterhorn-work polymarket watch digest --json",
  polymarketWatchAct: "matterhorn-work polymarket watch act --watch-file <public-polymarket-watch.json> --alert-index 0 --json",
  mondayBetaQuickSmoke: "pnpm smoke:customer-ready-crypto && pnpm test:market-execution-safety-gate",
  mondayBetaUiGate: "pnpm test:matterhorn-customer-onboarding-ui && pnpm test:crypto-panel-ux && pnpm test:customer-readiness-ui",
  mondayBetaAppTypecheck: "pnpm --filter @matterhorn-work/app typecheck",
  mondayBetaDesktopProof: "pnpm electron:tester-artifact -- --output-dir \"$HOME/Desktop/matterhorn-work-beta-$(git rev-parse --short=8 HEAD)\" --json && pnpm desktop:beta-doctor -- --artifact-dir \"$HOME/Desktop/matterhorn-work-beta-$(git rev-parse --short=8 HEAD)\" --strict --json",
  mondayBetaWellnessProof: "pnpm test:wellness-creator-workflow && node scripts/wellness-creator-workflow.mjs --check",
  smoke: "pnpm smoke:customer-ready-crypto",
  signArtifactRoutes: "pnpm test:market-sign-artifact-routes",
  livePublicQa: "matterhorn-work crypto live-public-qa --output-dir /tmp/matterhorn-live-public-qa --fixture --strict --json",
  evidenceVerify: [
    "matterhorn-work crypto evidence-verify",
    "--bundle-json /tmp/matterhorn-market-customer-evidence.json",
    "--bundle-md /tmp/matterhorn-market-customer-evidence.md",
    "--strict",
    "--json",
  ].join(" "),
  packet: [
    "matterhorn-work crypto customer-packet",
    "--customer-ready-smoke /tmp/matterhorn-crypto-smoke.json",
    "--market-evidence-verify /tmp/matterhorn-market-evidence-verify.json",
    "--bittensor-evidence-verify /tmp/bittensor-evidence-verify.json",
    "--output /tmp/matterhorn-crypto-customer-packet.md",
    "--json-output /tmp/matterhorn-crypto-customer-packet.json",
    "--strict",
  ].join(" "),
} as const;
const MONDAY_BETA_LAUNCH_CHECKLIST = [
  {
    id: "beta-app-ui",
    title: "App opens with first-class desks",
    owner: "Operator",
    commandKey: "mondayBetaUiGate",
    proof: "Bittensor, Hyperliquid, Polymarket, and Longevity are visible as separate customer paths; desktop automation is not a default beta task.",
  },
  {
    id: "beta-safety-smoke",
    title: "Crypto safety smoke is green",
    owner: "Operator",
    commandKey: "mondayBetaQuickSmoke",
    proof: "Bittensor transfer/stake/unstake calls, Hyperliquid actions, and eligible Polymarket buy/sell/cancel actions require exact review and connected-wallet approval. Agents and watches cannot submit.",
  },
  {
    id: "beta-app-typecheck",
    title: "Production app typecheck passes",
    owner: "Engineer",
    commandKey: "mondayBetaAppTypecheck",
    proof: "The React app compiles before a tester build is cut.",
  },
  {
    id: "beta-desktop-build",
    title: "Mac tester build and doctor pass",
    owner: "Engineer",
    commandKey: "mondayBetaDesktopProof",
    proof: "Unsigned local DMG/ZIP evidence and desktop doctor output are captured before sending the app to a customer.",
  },
  {
    id: "beta-wellness-proof",
    title: "Longevity workflow remains safe",
    owner: "Operator",
    commandKey: "mondayBetaWellnessProof",
    proof: "Longevity artifacts stay educational, non-medical, and do not claim live payments, email, hosting, storage, or token-gated access.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  owner: string;
  commandKey: keyof typeof CUSTOMER_DEMO_COMMANDS;
  proof: string;
}>;
const CUSTOMER_DEMO_PROMPTS = [
  {
    id: "bittensor-image-subnets",
    label: "Bittensor discovery",
    betaVisible: true,
    prompt: "Bittensor Agent task: Find Bittensor subnets useful for image generation. Return customer-safe cards and explain which actions are read-only, which are preview-only, and which require external signing.",
  },
  {
    id: "bittensor-tao-wallet",
    label: "TAO wallet",
    betaVisible: true,
    prompt: "Bittensor Agent task: Show my TAO for the public SS58 address in context. If no public SS58 address is available, ask one concise question for a public coldkey only. Do not ask for seed phrases or private keys.",
  },
  {
    id: "hyperliquid-orderbook",
    label: "Hyperliquid read",
    betaVisible: false,
    prompt: "Hyperliquid Agent task: Show BTC Hyperliquid orderbook context. Explain that this read does not place an order and that execution is available only from the Hyperliquid trade ticket after exact-order review and connected-wallet approval.",
  },
  {
    id: "polymarket-compliance",
    label: "Polymarket compliance",
    betaVisible: false,
    prompt: "Polymarket Agent task: Find Polymarket markets about AI and show any compliance blocks without executable order terms.",
  },
  {
    id: "external-signer-preview",
    label: "Signer preview",
    betaVisible: true,
    prompt: "Matterhorn protocol task: Explain the signing boundary across Bittensor, Hyperliquid, and Polymarket. A connected wallet can review and submit Bittensor transfer/stake/unstake calls, Hyperliquid place/cancel/modify/close actions, and eligible Polymarket buy/sell/cancel actions from separate tickets. Unsupported advanced calls stay unavailable. Matterhorn never signs, custodies keys, or auto-executes.",
  },
  {
    id: "market-execution-readiness",
    label: "Execution readiness",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Explain the reviewed execution tickets for Hyperliquid and Polymarket. Show exact-intent, one-time, expiry, compliance, and connected-wallet safeguards; distinguish the non-submitting agent draft from the separately authorized wallet ticket; and explain why agents and watches cannot auto-submit.",
  },
  {
    id: "market-execution-chain",
    label: "Safe execution chain",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Explain the Hyperliquid and Polymarket agent draft -> exact wallet ticket -> connected-wallet authorization -> public receipt evidence chain. Confirm that the agent artifact cannot submit, reviewed terms cannot be changed after authorization, and Matterhorn rejects secrets, arbitrary signed payloads, hash mismatches, and unattended submission.",
  },
  {
    id: "market-sdk-validation",
    label: "SDK validation",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Explain official SDK validation for Hyperliquid and Polymarket. Show fixture and operator-owned test modes, public/redacted evidence, the non-submitting agent boundary, the separately wallet-authorized execution ticket, and why Matterhorn never receives keys, API secrets, raw signatures, arbitrary signed payloads, or wallet exports.",
  },
  {
    id: "hyperliquid-watch",
    label: "Hyperliquid watch",
    betaVisible: false,
    prompt: "Hyperliquid Agent task: Create a read-only Hyperliquid watch plan for BTC funding and orderbook movement. Show the watch kind, asset, threshold, source/freshness, watch_alert card behavior, and confirm no orders are signed, submitted, or auto-executed.",
  },
  {
    id: "polymarket-watch",
    label: "Polymarket watch",
    betaVisible: false,
    prompt: "Polymarket Agent task: Create a read-only Polymarket watch plan for a public market id. Show market status, odds/liquidity movement, compliance state, watch_alert behavior, and confirm no orders are signed, submitted, or auto-executed.",
  },
] as const;
// Beta-tester quick tasks. Each inserts a ready-to-review task into the
// composer (it does not auto-send). Copy is preview/read-only
// and never asks for secrets.
const BETA_TRY_PROMPTS = [
  {
    id: "beta-show-tao",
    label: "show my TAO",
    mode: "bittensor",
    prompt:
      "Bittensor Agent task: Show my TAO for the public SS58 address in context. If none is set, ask once for a public coldkey address only. Never ask for seed phrases, private keys, or wallet exports.",
  },
  {
    id: "beta-image-subnets",
    label: "find Bittensor subnets for image generation",
    mode: "crypto",
    prompt:
      "Bittensor Agent task: Find Bittensor subnets useful for image generation and return customer-safe cards. Explain which actions are read-only, which are preview-only, and which require external signing.",
  },
  {
    id: "beta-validators-14",
    label: "compare validators on subnet 14",
    mode: "bittensor",
    prompt:
      "Bittensor Agent task: Compare validators on subnet 14 using public metagraph context. Explain stake, trust, and emissions in beginner language. Any staking action requires exact review and approval in a connected Bittensor wallet; Matterhorn cannot sign or broadcast on the user's behalf.",
  },
  {
    id: "beta-stake-1-tao",
    label: "prepare staking 1 TAO",
    mode: "bittensor",
    prompt:
      "Bittensor Agent task: Prepare a reviewed stake for 1 TAO: show netuid, validator hotkey, expected alpha, fee, slippage, and warnings. The user must review and submit the exact call in a connected Bittensor wallet. Never ask for seed phrases or private keys.",
  },
  {
    id: "beta-hl-orderbook",
    label: "show Hyperliquid BTC orderbook",
    mode: "crypto",
    prompt:
      "Hyperliquid Agent task: Show the BTC Hyperliquid orderbook context. Explain that this read never places an order; execution requires a separate exact-order review and connected-wallet signature in the Hyperliquid trade ticket.",
  },
  {
    id: "beta-pm-summary",
    label: "summarize a Polymarket market",
    mode: "crypto",
    prompt:
      "Polymarket Agent task: Summarize a public Polymarket market: status, odds/liquidity, and any compliance block. Keep it preview-only with no executable order terms; compliance checks are required.",
  },
] as const;
const MONDAY_BETA_DEMO_SCENARIOS = Object.values(MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS);
const BITTENSOR_BETA_MODE = (() => {
  const flag = typeof import.meta.env?.VITE_MATTERHORN_BITTENSOR_BETA === "string"
    ? import.meta.env.VITE_MATTERHORN_BITTENSOR_BETA.trim().toLowerCase()
    : "";
  return flag === "1" || flag === "true";
})();

type Tab = "overview" | "demo" | "subnets" | "wallet" | "actions";
type CryptoVenue = "bittensor" | "hyperliquid" | "polymarket";
type ActionType = BittensorActionQuote["action"];

function venueForPromptId(id: string): CryptoVenue | undefined {
  if (id.includes("bittensor") || id.includes("tao") || id.includes("subnet") || id.includes("stake") || id.includes("validator")) {
    return "bittensor";
  }
  if (id.includes("hyperliquid") || id.includes("-hl-")) return "hyperliquid";
  if (id.includes("polymarket") || id.includes("-pm-")) return "polymarket";
  return undefined;
}

const BITTENSOR_STANDARD_ACTIONS = [
  {
    id: "wallet-balance",
    step: "1",
    intent: "Read",
    title: "Show TAO balance",
    summary: "Read a public SS58 coldkey, TAO balance, stake positions, and provider freshness.",
    safety: "Public address only",
    outcome: "Wallet snapshot",
    prompt:
      "Bittensor Agent task: Show my TAO balance from the public SS58 coldkey in context. If no address is set, ask once for a public coldkey only. Explain free TAO, staked TAO, validator exposure, provider source, freshness, and safe next steps.",
  },
  {
    id: "stake-positions",
    step: "2",
    intent: "Read",
    title: "Where am I staked?",
    summary: "Read current subnet stake positions for a public SS58 coldkey and explain exposure in plain language.",
    safety: "Public address only",
    outcome: "Stake position summary",
    prompt:
      "Bittensor Agent task: Show where this public SS58 coldkey is staked. If no address is set, ask once for a public coldkey only. Explain subnet exposure, validator hotkeys, estimated TAO value, source/freshness, and safe next steps without asking for wallet secrets.",
  },
  {
    id: "subnet-discovery",
    step: "3",
    intent: "Discover",
    title: "Browse all subnets",
    summary: "Discover subnets by goal, category, utility, adapter support, and public metagraph context.",
    safety: "Read-only discovery",
    outcome: "Subnet shortlist",
    prompt:
      "Bittensor Agent task: Help me find Bittensor subnets for my goal. Explain each subnet in beginner language with utility, risks, source/freshness, adapter support, and which actions require external signing.",
  },
  {
    id: "validator-compare",
    step: "4",
    intent: "Compare",
    title: "Compare validators",
    summary: "Compare validator hotkeys for a subnet using public validator/metagraph context.",
    safety: "No staking without connected-wallet approval",
    outcome: "Validator ranking",
    formAction: "compare",
    prompt:
      "Bittensor Agent task: Compare validators for the netuid in context. Explain stake, trust, rank, emissions, risks, and what I should verify before preparing any staking preview. Do not sign or broadcast anything.",
  },
  {
    id: "stake-preview",
    step: "5",
    intent: "Preview",
    title: "Prepare stake preview",
    summary: "Prepare an exact stake review with netuid, validator hotkey, expected alpha, fee, and slippage.",
    safety: "Connected wallet approval",
    outcome: "Reviewed stake transaction",
    formAction: "stake",
    prompt:
      "Bittensor Agent task: Prepare a stake transaction using the netuid, amount, and validator hotkey in context. Show consequence, fee, slippage, expected alpha, and warnings, then send the user to the connected-wallet review ticket. Never ask for seed phrases or private keys.",
  },
  {
    id: "unstake-preview",
    step: "6",
    intent: "Preview",
    title: "Prepare unstake preview",
    summary: "Review the exact unstake call and its consequence before approving it in your connected wallet.",
    safety: "Connected wallet approval",
    outcome: "Reviewed unstake transaction",
    formAction: "unstake",
    prompt:
      "Bittensor Agent task: Prepare an unstake transaction using the netuid, amount, and validator hotkey in context. Explain expected TAO/alpha effects, slippage, fee, and warnings, then send the user to the connected-wallet review ticket. Never ask for seed phrases or private keys.",
  },
  {
    id: "transfer-preview",
    step: "7",
    intent: "Preview",
    title: "Send TAO",
    summary: "Prepare exact transfer terms, then review and sign them in your connected Bittensor wallet.",
    safety: "Connected wallet approval",
    outcome: "Reviewed TAO transfer",
    prompt:
      "Bittensor Agent task: Help me prepare a TAO transfer using the amount and recipient coldkey in context. Confirm the public destination, amount, fee, consequence, and warnings. Then direct me to the reviewed transfer ticket, where my connected Bittensor wallet must show, sign, and submit the exact call. Never ask for seed phrases or private keys.",
  },
  {
    id: "watch-alert",
    step: "8",
    intent: "Monitor",
    title: "Create watch or alert",
    summary: "Monitor a wallet, subnet, validator, emission movement, or provider freshness.",
    safety: "Read-only monitoring",
    outcome: "Watch plan",
    prompt:
      "Bittensor Agent task: Create a read-only watch plan for the public wallet, subnet, validator, emissions, or provider freshness in context. Explain what will be checked, alert thresholds, source/freshness, and how the watch produces evidence without signing or moving funds.",
  },
  {
    id: "receipt-import",
    step: "9",
    intent: "Read",
    title: "Import receipt",
    summary: "Review a public Bittensor receipt and attach it to the session evidence trail.",
    safety: "Public receipt only",
    outcome: "Receipt status",
    prompt:
      "Bittensor Agent task: Import and explain a public Bittensor receipt. Verify the public transaction evidence, summarize what changed, link it to the active watch or wallet context if possible, and do not ask for raw signatures, signed payloads, seed phrases, private keys, mnemonics, or wallet exports.",
  },
  {
    id: "keys-explainer",
    step: "10",
    intent: "Learn",
    title: "Explain coldkey/hotkey",
    summary: "Clarify Bittensor wallet concepts, staking exposure, and connected-wallet approval boundaries.",
    safety: "No secrets requested",
    outcome: "Plain-English explainer",
    prompt:
      "Bittensor Agent task: Explain coldkeys, hotkeys, SS58 public addresses, validator hotkeys, staking exposure, and connected-wallet approval boundaries in beginner language. Make clear that Matterhorn never needs seed phrases, private keys, mnemonics, wallet exports, raw signatures, or signed payloads.",
  },
] satisfies Array<{
  id: string;
  step: string;
  intent: "Read" | "Discover" | "Compare" | "Preview" | "Monitor" | "Learn";
  title: string;
  summary: string;
  safety: string;
  outcome: string;
  prompt: string;
  formAction?: ActionType;
}>;
const VENUE_PROTOCOL_MANIFESTS: Record<CryptoVenue, MatterhornProtocolWorkspaceManifest> = {
  bittensor: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.bittensor,
  hyperliquid: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.hyperliquid,
  polymarket: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.polymarket,
};
const VENUE_TONES: Record<CryptoVenue, { rgb: string; accent: string; soft: string }> = {
  bittensor: { rgb: "35,211,245", accent: "#23d3f5", soft: "rgba(35,211,245,0.10)" },
  hyperliquid: { rgb: "43,211,118", accent: "#2bd376", soft: "rgba(43,211,118,0.10)" },
  polymarket: { rgb: "179,126,255", accent: "#b37eff", soft: "rgba(179,126,255,0.10)" },
};

function venueToneStyle(activeVenue: CryptoVenue): CSSProperties {
  const tone = VENUE_TONES[activeVenue];
  return {
    "--protocol-desk-rgb": tone.rgb,
    "--protocol-desk-accent": tone.accent,
    "--protocol-desk-soft": tone.soft,
  } as CSSProperties;
}

function protocolStatusLabel(status: MatterhornProtocolWorkspaceManifest["customerStatus"]): string {
  switch (status) {
    case "live":
      return "Working";
    case "beta_ready":
      return "Read and preview";
    case "preview_only":
      return "Preview only";
    case "workflow_ready":
      return "Workflow-ready";
    case "planned_not_live":
      return "Planned, not live";
    default:
      return "Available";
  }
}

function protocolSignerLabel(manifest: MatterhornProtocolWorkspaceManifest): string {
  if (manifest.safetyBoundaries.requiresExternalSigner) return "Required";
  if (manifest.id === "hyperliquid" || manifest.id === "polymarket") return "External client";
  return "Not required";
}

function readViteEnvValue(primary: string, legacy?: string) {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const primaryValue = typeof env?.[primary] === "string" ? env[primary].trim() : "";
  if (primaryValue) return primaryValue;
  return legacy && typeof env?.[legacy] === "string" ? env[legacy].trim() : "";
}

function resolveMatterhornApiConnection() {
  if (isPublicBetaWebDeployment()) {
    const baseUrl =
      typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)
        ? normalizeMatterhornServerUrl(window.location.origin) ?? ""
        : "";
    return { baseUrl, token: undefined, hostToken: undefined };
  }

  const settings = readMatterhornServerSettings();
  const envUrl = readViteEnvValue("VITE_MATTERHORN_WORK_URL", "VITE_OPENWORK_URL");
  const envPort = readViteEnvValue("VITE_MATTERHORN_WORK_PORT", "VITE_OPENWORK_PORT");
  const envToken = readViteEnvValue("VITE_MATTERHORN_WORK_TOKEN", "VITE_OPENWORK_TOKEN");
  const envHostToken = readViteEnvValue("VITE_MATTERHORN_WORK_HOST_TOKEN", "VITE_OPENWORK_HOST_TOKEN");
  const portUrl = envPort ? `http://127.0.0.1:${envPort}` : "";

  return {
    baseUrl: normalizeMatterhornServerUrl(settings.urlOverride ?? envUrl ?? portUrl ?? "") ?? "",
    token: settings.token ?? envToken ?? undefined,
    hostToken: settings.hostToken ?? envHostToken ?? undefined,
  };
}

async function fetchMatterhornApiJson<T>(path: string, init?: RequestInit): Promise<{ response: Response; json: T }> {
  const api = resolveMatterhornApiConnection();
  const headers = new Headers(init?.headers);
  if (api.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${api.token}`);
  }
  if (api.hostToken && !headers.has("X-Matterhorn-Host-Token")) {
    headers.set("X-Matterhorn-Host-Token", api.hostToken);
  }

  const response = await fetch(`${api.baseUrl}${path}`, {
    ...init,
    headers,
    ...(isPublicBetaWebDeployment() ? { credentials: "same-origin" } : {}),
  });
  const body = await response.text();
  try {
    return { response, json: JSON.parse(body) as T };
  } catch {
    const source = api.baseUrl || "current app origin";
    const preview = body.trim().slice(0, 80) || response.statusText;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || preview.startsWith("<")) {
      throw new Error(
        `Matterhorn server did not answer ${path}. The app received an HTML page from ${source} instead of JSON. Reconnect the Matterhorn Desks server from Profile & Settings, then refresh this desk.`,
      );
    }
    throw new Error(
      `Matterhorn API returned non-JSON from ${source}${path}: ${preview}. Check the local Matterhorn server connection.`,
    );
  }
}

async function validateAgentWalletDraft<T extends ReviewedActionHandoffV2>(input: {
  workspaceId?: string | null;
  guardedHandoff?: T | null;
  currentDraft: ReviewedActionDraftHandoff;
  originatedFromHandoff: boolean;
}): Promise<T | null> {
  if (!input.originatedFromHandoff) return input.guardedHandoff ?? null;
  if (!input.guardedHandoff) {
    throw new Error("This legacy agent draft is preview-only. Regenerate it from the desk so Matterhorn can simulate and hash-bind the exact wallet action.");
  }
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) throw new Error("Open this action from an authenticated workspace before wallet review.");
  const { response, json } = await fetchMatterhornApiJson<ReviewedActionValidationResponse>(
    `/workspace/${encodeURIComponent(workspaceId)}/reviewed-actions/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff: input.guardedHandoff, currentDraft: input.currentDraft }),
    },
  );
  if (!response.ok || !json.success || !json.valid) {
    const reason = json.issues?.length ? json.issues.join(", ").replaceAll("_", " ") : "validation failed";
    throw new Error(`This wallet review is no longer valid (${reason}). Regenerate and re-simulate it before signing.`);
  }
  if (!json.refreshedHandoff || json.refreshedHandoff.protocol !== input.currentDraft.protocol) {
    throw new Error("Matterhorn did not return a fresh, protocol-matched wallet review. Regenerate this action before signing.");
  }
  return json.refreshedHandoff as T;
}

function mondayBetaScenarioMode(scenario: CustomerBetaDemoScenario): "bittensor" | "crypto" {
  return scenario.mapsToCustomerTemplateId === "bittensor_operator" ? "bittensor" : "crypto";
}

const VENUE_DESKS: Record<CryptoVenue, {
  label: string;
  shortLabel: string;
  workspaceTitle: string;
  headline: string;
  description: string;
  statusLabel: string;
  canSubmit: string;
  liveSubmission: string;
  signer: string;
  source: string;
  prompts: { label: string; summary: string; prompt: string }[];
}> = {
  bittensor: {
    label: "Bittensor",
    shortLabel: "TAO",
    workspaceTitle: "Bittensor desk",
    headline: "Start with your TAO, then choose what to do next.",
    description: "Check public wallets, compare validators, prepare staking actions, and send reviewed TAO transfers from a connected Bittensor wallet.",
    statusLabel: "Read, prepare, and transfer",
    canSubmit: "Transfer, stake, and unstake",
    liveSubmission: "After wallet approval",
    signer: "Connected Bittensor wallet",
    source: "Subtensor sidecar, TAO.app, or fallback data",
    prompts: [
      {
        label: "Find image subnets",
        summary: "Discover useful image-generation subnets and adapter support.",
        prompt: "Bittensor Agent task: Find Bittensor subnets useful for image generation. Explain each subnet in beginner language, adapter availability, live data freshness, risks, and safe next steps.",
      },
      {
        label: "Show my TAO",
        summary: "Read a public SS58 wallet and explain balance/stake exposure.",
        prompt: "Bittensor Agent task: Show my TAO and where I am staked for this public SS58 coldkey: <paste public coldkey SS58 address>. Do not ask for seed phrases, private keys, mnemonics, or wallet exports.",
      },
      {
        label: "Compare validators",
        summary: "Compare subnet 14 validators with source and freshness context.",
        prompt: "Bittensor Agent task: Compare validators on subnet 14 with a balanced strategy. Explain data freshness, fallback warnings, hotkey meaning, and what is missing before a staking preview.",
      },
      {
        label: "Prepare staking",
        summary: "Build an exact stake call to review and submit with your connected Bittensor wallet.",
        prompt: "Bittensor Agent task: Prepare staking 1 TAO safely. Ask for netuid and validator hotkey if missing. Return an exact review draft and explain that connected-wallet approval is required.",
      },
    ],
  },
  hyperliquid: {
    label: "Hyperliquid",
    shortLabel: "HL",
    workspaceTitle: "Hyperliquid desk",
    headline: "Research and execute Hyperliquid perpetual orders with wallet review.",
    description: "Inspect orderbooks, account exposure, funding, and open orders, then place market or limit orders after your connected wallet signs the exact reviewed intent.",
    statusLabel: "Read and trade",
    canSubmit: "After wallet approval",
    liveSubmission: "Available",
    signer: "Connected wallet required",
    source: "Hyperliquid public info and exchange endpoints",
    prompts: [
      {
        label: "BTC orderbook",
        summary: "Read spread, depth, source, and stale-data context.",
        prompt: "Hyperliquid Agent task: Show BTC orderbook context, spread, depth summary, and stale-data warnings. Explain that this read never places an order and that execution requires the separate wallet-approved trade ticket.",
      },
      {
        label: "Account exposure",
        summary: "Summarize public account value, margin, positions, and funding.",
        prompt: "Hyperliquid Agent task: Show my Hyperliquid exposure for this public address: <paste public address>. Summarize account value, margin, positions, open orders, funding exposure, and risk notes where data exists.",
      },
      {
        label: "Prepare order",
        summary: "Review an order before wallet signing and submission.",
        prompt: "Hyperliquid Agent task: Prepare an order for buying 0.001 BTC. Ask whether I want testnet or mainnet, market or limit, and my slippage tolerance. Do not ask for keys or API secrets. Explain that the connected wallet must approve the exact order before Matterhorn submits it.",
      },
      {
        label: "Create watch",
        summary: "Create funding and orderbook alerts without automatic trading.",
        prompt: "Hyperliquid Agent task: Create a watch plan for BTC funding rate and orderbook movement. Explain threshold, source/freshness, alert behavior, and confirm that alerts never auto-execute an order.",
      },
    ],
  },
  polymarket: {
    label: "Polymarket",
    shortLabel: "PM",
    workspaceTitle: "Polymarket desk",
    headline: "Analyze prediction markets and trade with wallet approval.",
    description: "Find markets, explain probabilities and liquidity, check compliance, then review and authorize an eligible order in your connected Polygon wallet.",
    statusLabel: "Compliance gated",
    canSubmit: "Eligible buy, sell, and cancel actions",
    liveSubmission: "After wallet authorization",
    signer: "Connected Polygon wallet",
    source: "Polymarket Gamma/Data/CLOB public reads and fixture/testnet evidence",
    prompts: [
      {
        label: "Find markets",
        summary: "Find public markets and explain outcomes as probabilities.",
        prompt: "Polymarket Agent task: Find and summarize Polymarket markets about this topic: <topic>. Explain outcomes, implied probabilities, liquidity/orderbook context where available, and compliance status.",
      },
      {
        label: "Compliance read",
        summary: "Check if a market can be previewed and what gets blocked.",
        prompt: "Polymarket Agent task: Review whether this market can be previewed: <market id or URL>. If compliance-blocked, return no executable price, size, or share fields.",
      },
      {
        label: "Preview prediction",
        summary: "Prepare exact YES/NO terms for compliance and wallet review.",
        prompt: "Polymarket Agent task: Prepare a YES/NO order for this public market: <market id>. Ask for side, size, and limit price when needed, check compliance, and summarize the exact terms. Do not ask for keys or API secrets. The connected Polygon wallet must authorize the separate trade ticket before submission.",
      },
      {
        label: "Create watch",
        summary: "Watch odds, liquidity, compliance, and public receipt changes.",
        prompt: "Polymarket Agent task: Create a read-only watch plan for odds/liquidity movement and compliance status on this public market: <market id>. Confirm no order signing, submission, or auto-execution.",
      },
    ],
  },
};
type ReadinessCheck = {
  id?: string;
  label?: string;
  status?: "pass" | "warning" | "fail" | "skip";
  summary?: string;
};
type ReadinessReport = {
  ready?: boolean;
  checks?: ReadinessCheck[];
  warnings?: string[];
  blockers?: string[];
  nextActions?: string[];
  checkedAt?: string;
};
type MarketSdkValidationGuide = {
  version?: string;
  modes?: string[];
  networks?: {
    hyperliquid?: string[];
    polymarket?: string[];
  };
  safety?: {
    canSubmit?: boolean;
    liveSubmissionEnabled?: boolean;
    acceptsSecrets?: boolean;
    runsPrivateSdkSigning?: boolean;
    callsExchanges?: boolean;
  };
};
function readinessStateForVenue(checks: ReadinessCheck[], venue: string): string {
  const needle = venue.toLowerCase();
  const matches = checks.filter((check) => {
    const id = check.id?.toLowerCase() ?? "";
    const label = check.label?.toLowerCase() ?? "";
    return id.includes(needle) || label.includes(needle);
  });
  if (!matches.length) return CHECK_PENDING_LABEL;
  if (matches.some((check) => check.status === "fail")) return "Blocked";
  if (matches.some((check) => check.status === "warning" || check.status === "skip")) return "Review";
  return "Ready";
}

function isValidSs58Address(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 32 && trimmed.length <= 64 && BASE58_RE.test(trimmed);
}

function shortAddress(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatBittensorProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.trim();
  if (/unexpected token|not valid json|doctype|html/i.test(message)) {
    return "Matterhorn server did not answer the Bittensor request with JSON. Reconnect the Matterhorn Desks server, then refresh the Bittensor desk.";
  }
  if (/failed to fetch|network|load failed|econnrefused|timeout/i.test(message)) {
    return "Matterhorn could not reach the Bittensor provider. Check the local server connection, then refresh the Bittensor desk.";
  }
  return message || "Matterhorn could not load Bittensor data. Reconnect the local server, then try again.";
}

function ProtocolMark({ venue, compact = false }: { venue: CryptoVenue; compact?: boolean }) {
  const title = VENUE_DESKS[venue].label;
  const size = compact ? 20 : 36;
  return (
    <span
      aria-label={`${title} mark`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        compact ? "size-5" : "size-9",
      )}
    >
      <ProtocolBrandLogo id={venue} size={compact ? 16 : 28} />
    </span>
  );
}

function readFavorites(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: number[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }
}

function contextValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function buildBittensorChatPrompt(prompt: string, context: Record<string, unknown>): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    const formatted = contextValue(value);
    if (formatted) lines.push(`- ${label}: ${formatted}`);
  };

  add("ss58Address", context.ss58Address);
  add("netuid", context.netuid);
  add("amountTao", context.amountTao);
  add("validatorHotkey", context.validatorHotkey);
  add("recipient", context.recipient);
  add("destination", context.destination);
  add("action", context.action);

  const subnet = context.subnet as Partial<BittensorSubnetSummary> | null | undefined;
  if (subnet && typeof subnet === "object") {
    add("subnet.netuid", subnet.netuid);
    add("subnet.name", subnet.name);
    add("subnet.category", subnet.category);
    add("subnet.source", subnet.source);
  }

  const wallet = context.wallet as Partial<BittensorWalletSnapshot> | null | undefined;
  if (wallet && typeof wallet === "object") {
    add("wallet.ss58Address", wallet.ss58Address);
    add("wallet.taoBalance", wallet.taoBalance);
    add("wallet.positions", Array.isArray(wallet.stakePositions) ? wallet.stakePositions.length : null);
    add("wallet.source", wallet.source);
    add("wallet.freshness", wallet.freshness);
  }

  const quote = context.quote as Partial<BittensorActionQuote> | null | undefined;
  if (quote && typeof quote === "object") {
    add("quote.action", quote.action);
    add("quote.netuid", quote.netuid);
    add("quote.amountTao", quote.amountTao);
    add("quote.expectedAlpha", quote.expectedAlpha);
    add("quote.feeTao", quote.feeTao);
    add("quote.slippageBps", quote.slippageBps);
    add("quote.source", quote.source);
  }

  return lines.length ? `${prompt}\n\nBittensor context:\n${lines.join("\n")}` : prompt;
}

function HyperliquidTradeExecution({
  initialDraft,
  guardedHandoff: initialGuardedHandoff,
  initialOperation,
  executionAvailable,
  workspaceId,
  sessionId,
}: {
  initialDraft?: HyperliquidDraftHandoff | null;
  guardedHandoff?: Extract<ReviewedActionHandoffV2, { protocol: "hyperliquid" }> | null;
  initialOperation?: HyperliquidExecutionIntent["operation"] | null;
  executionAvailable?: boolean | null;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const { signTypedDataAsync } = useSignTypedData();
  const [operation, setOperation] = useState<HyperliquidExecutionIntent["operation"]>("place_order");
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [asset, setAsset] = useState("BTC");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("0.001");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [slippageBps, setSlippageBps] = useState("100");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [reviewDraft, setReviewDraft] = useState<HyperliquidReviewDraft | null>(null);
  const [intent, setIntent] = useState<HyperliquidExecutionIntent | null>(null);
  const [liveConfirmation, setLiveConfirmation] = useState("");
  const [receipt, setReceipt] = useState<HyperliquidExecutionReceipt | null>(null);
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState<"prepare" | "submit" | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [guardedHandoff, setGuardedHandoff] = useState(initialGuardedHandoff ?? null);
  useEffect(() => setGuardedHandoff(initialGuardedHandoff ?? null), [initialGuardedHandoff]);
  // Execution must fail closed until the deployment reports this exact route is enabled.
  const executionUnavailable = executionAvailable !== true;
  const executionStatusMessage = executionAvailable === false
    ? "This deployment has not enabled Hyperliquid wallet submission yet."
    : "Matterhorn could not verify that Hyperliquid wallet submission is enabled for this deployment.";

  const resetReview = useCallback(() => {
    setReviewDraft(null);
    setIntent(null);
    setReceipt(null);
    setEvidencePath(null);
    setEvidenceWarning(null);
    setTradeError(null);
    setLiveConfirmation("");
  }, []);

  useEffect(() => {
    if (initialDraft || !initialOperation) return;
    setOperation(initialOperation);
    resetReview();
  }, [initialDraft, initialOperation, resetReview]);

  useEffect(() => {
    if (!initialDraft) return;
    setOperation(initialDraft.operation);
    setNetwork(initialDraft.network);
    setAsset(initialDraft.asset);
    setOrderId(initialDraft.orderId === null ? "" : String(initialDraft.orderId));
    if (initialDraft.side !== null) setSide(initialDraft.side);
    if (initialDraft.size !== null) setSize(String(initialDraft.size));
    if (initialDraft.orderType !== null) setOrderType(initialDraft.orderType);
    setLimitPrice(initialDraft.limitPrice === null ? "" : String(initialDraft.limitPrice));
    if (initialDraft.slippageBps !== null) setSlippageBps(String(initialDraft.slippageBps));
    if (initialDraft.reduceOnly !== null) setReduceOnly(initialDraft.reduceOnly);
    resetReview();
    setReviewDraft(initialDraft);
  }, [initialDraft, resetReview]);

  const reviewAction = useCallback(() => {
    try {
      const draft = createHyperliquidReviewDraft({
        operation,
        network,
        asset,
        side,
        size,
        orderType,
        limitPrice,
        slippageBps,
        reduceOnly,
        orderId,
      });
      setReviewDraft(draft);
      setIntent(null);
      setReceipt(null);
      setTradeError(null);
      setLiveConfirmation("");
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Could not review the Hyperliquid action.");
    }
  }, [asset, limitPrice, network, operation, orderId, orderType, reduceOnly, side, size, slippageBps]);

  const prepareIntent = useCallback(async () => {
    if (!reviewDraft) {
      setTradeError("Review the exact Hyperliquid action before preparing it for wallet signing.");
      return;
    }
    if (!address) {
      setTradeError("Connect the EVM wallet authorized for this Hyperliquid account to prepare the signing intent.");
      return;
    }
    setBusy("prepare");
    setTradeError(null);
    setReceipt(null);
    try {
      const refreshedHandoff = await validateAgentWalletDraft({
        workspaceId,
        guardedHandoff,
        originatedFromHandoff: Boolean(initialDraft),
        currentDraft: {
          version: "matterhorn.reviewed-action-handoff.v1",
          protocol: "hyperliquid",
          source: guardedHandoff?.source ?? "agent-card",
          draft: reviewDraft as HyperliquidDraftHandoff,
        },
      });
      setGuardedHandoff(refreshedHandoff);
      const actionBody = reviewDraft.operation === "cancel_order"
        ? {
            operation: reviewDraft.operation,
            network: reviewDraft.network,
            signerAddress: address,
            asset: reviewDraft.asset,
            orderId: reviewDraft.orderId,
          }
        : {
            operation: reviewDraft.operation,
            network: reviewDraft.network,
            signerAddress: address,
            asset: reviewDraft.asset,
            ...(reviewDraft.operation === "modify_order" ? { orderId: reviewDraft.orderId } : {}),
            side: reviewDraft.side,
            size: reviewDraft.size,
            orderType: reviewDraft.orderType,
            limitPrice: reviewDraft.limitPrice,
            slippageBps: reviewDraft.slippageBps,
            ...(reviewDraft.operation === "close_position" ? {} : { reduceOnly: reviewDraft.reduceOnly }),
          };
      const { response, json } = await fetchMatterhornApiJson<{
        success?: boolean;
        intent?: HyperliquidExecutionIntent;
        error?: { message?: string };
      }>("/api/hyperliquid/actions/execution-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionBody),
      });
      if (!response.ok || !json.success || !json.intent) {
        throw new Error(json.error?.message ?? "Could not prepare the Hyperliquid action.");
      }
      setIntent(json.intent);
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Could not prepare the Hyperliquid action.");
    } finally {
      setBusy(null);
    }
  }, [address, guardedHandoff, initialDraft, reviewDraft, workspaceId]);

  const signAndSubmit = useCallback(async () => {
    if (!intent || !address) return;
    if (intent.network === "mainnet" && liveConfirmation !== intent.confirmation.phrase) {
      setTradeError(`Type ${intent.confirmation.phrase} before sending a mainnet action.`);
      return;
    }
    setBusy("submit");
    setTradeError(null);
    try {
      const signature = await signTypedDataAsync(intent.typedData);
      const { response, json } = await fetchMatterhornApiJson<{
        success?: boolean;
        receipt?: HyperliquidExecutionReceipt;
        evidence?: { outputPath?: string };
        evidenceWarning?: string;
        error?: { message?: string };
      }>("/api/hyperliquid/orders/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: intent.intentId,
          signerAddress: address,
          signature,
          liveConfirmation: intent.network === "mainnet" ? liveConfirmation : null,
          workspaceId: workspaceId || null,
          sessionId: sessionId || null,
          ...(guardedHandoff ? {
            reviewedAction: guardedHandoff,
            receiptIntentHash: guardedHandoff.intentHash,
          } : {}),
        }),
      });
      if (!json.receipt) throw new Error(json.error?.message ?? "Hyperliquid did not return a submission receipt.");
      setReceipt(json.receipt);
      setEvidencePath(json.evidence?.outputPath ?? null);
      if (workspaceId && !json.evidence?.outputPath) {
        setEvidenceWarning(json.evidenceWarning ?? "The action reached Hyperliquid, but its public receipt was not added to this workspace.");
      }
      if (!response.ok || json.receipt.status !== "submitted") {
        setTradeError(json.receipt.status === "uncertain"
          ? "Submission status is uncertain. Check your Hyperliquid open orders before trying again."
          : "Hyperliquid rejected the action. Review the receipt before preparing another action.");
      }
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Wallet signing or action submission failed.");
    } finally {
      setBusy(null);
    }
  }, [address, guardedHandoff, intent, liveConfirmation, sessionId, signTypedDataAsync, workspaceId]);

  const shortWalletAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;
  const firstConnector = connectors.find((connector) => connector.id !== "injected") ?? connectors[0];
  const operationCopy: Record<HyperliquidExecutionIntent["operation"], { label: string; title: string; description: string }> = {
    place_order: { label: "Place", title: "Place a perpetual order", description: "Create a new market or limit order." },
    cancel_order: { label: "Cancel", title: "Cancel an open order", description: "Cancel one open order by its Hyperliquid order ID." },
    modify_order: { label: "Modify", title: "Modify an open order", description: "Replace an open order with the exact terms you review." },
    close_position: { label: "Close", title: "Close a position", description: "Submit a reduce-only IOC order for the size you choose." },
  };
  const activeOperation = operationCopy[operation];
  const needsOrderId = operation === "cancel_order" || operation === "modify_order";
  const showsOrderTerms = operation !== "cancel_order";
  const reviewRows: Array<[string, string]> = intent
    ? intent.operation === "cancel_order"
      ? [
          ["Action", "Cancel order"],
          ["Asset", intent.asset],
          ["Order ID", String(intent.orderId)],
          ["Network", intent.network === "mainnet" ? "Mainnet · real funds" : "Testnet"],
          ["Expires", new Date(intent.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
        ]
      : [
          ["Action", operationCopy[intent.operation].label],
          ["Order", `${intent.size} ${intent.asset}`],
          [intent.orderType === "market" ? "Slippage boundary" : "Limit price", intent.orderPrice === null ? "Not available" : `$${intent.orderPrice.toLocaleString()}`],
          ["Estimated notional", intent.estimatedNotionalUsdc === null ? "Not available" : `$${intent.estimatedNotionalUsdc.toLocaleString()}`],
          ["Network", intent.network === "mainnet" ? "Mainnet · real funds" : "Testnet"],
          ["Reduce only", intent.reduceOnly ? "Yes" : "No"],
          ...(intent.orderId === null ? [] : [["Order ID", String(intent.orderId)] as [string, string]]),
          ["Expires", new Date(intent.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
        ]
    : reviewDraft
      ? reviewDraft.operation === "cancel_order"
        ? [
            ["Action", "Cancel order"],
            ["Asset", reviewDraft.asset],
            ["Order ID", String(reviewDraft.orderId)],
            ["Network", reviewDraft.network === "mainnet" ? "Mainnet · real funds" : "Testnet"],
          ]
        : [
            ["Action", operationCopy[reviewDraft.operation].label],
            ["Order", `${reviewDraft.size} ${reviewDraft.asset}`],
            [reviewDraft.orderType === "market" ? "Max slippage" : "Limit price", reviewDraft.orderType === "market" ? `${reviewDraft.slippageBps} bps` : `$${reviewDraft.limitPrice?.toLocaleString()}`],
            ["Network", reviewDraft.network === "mainnet" ? "Mainnet · real funds" : "Testnet"],
            ["Reduce only", reviewDraft.reduceOnly ? "Yes" : "No"],
            ...(reviewDraft.orderId === null ? [] : [["Order ID", String(reviewDraft.orderId)] as [string, string]]),
          ]
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-dls-text">{activeOperation.title}</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-dls-secondary">
            {executionUnavailable
              ? `The agent can prepare the exact action. ${executionStatusMessage}`
              : `${activeOperation.description} Matterhorn submits only after you review and sign the short-lived intent.`}
          </p>
        </div>
        <div className="text-right text-[11px] leading-5 text-dls-secondary">
          <div className={cn("font-medium", isConnected ? "text-emerald-300" : "text-dls-secondary")}>{shortWalletAddress ?? "Wallet not connected"}</div>
          <div>{network === "mainnet" ? "Mainnet · real funds" : "Testnet"}</div>
        </div>
      </div>

      {executionUnavailable ? (
        <Notice tone="info" icon={<Shield className="size-4" />} title="Action review available">
          You can connect a wallet and review the exact action now. {executionStatusMessage}
        </Notice>
      ) : null}

      {!isConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <p className="text-xs leading-5 text-dls-secondary">Connect the wallet associated with your Hyperliquid account.</p>
          <Button size="sm" disabled={!firstConnector || connectPending} onClick={() => firstConnector && connect({ connector: firstConnector })}>
            {connectPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Wallet className="mr-2 size-3.5" />}
            Connect wallet
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-dls-surface-muted/30 p-1" aria-label="Hyperliquid action">
        {(Object.keys(operationCopy) as Array<HyperliquidExecutionIntent["operation"]>).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={operation === item}
            onClick={() => {
              setOperation(item);
              if (item === "close_position") setReduceOnly(true);
              resetReview();
            }}
            className={cn(
              "h-9 rounded-md text-xs font-semibold transition-colors",
              operation === item
                ? "bg-dls-surface-raised text-dls-text shadow-sm"
                : "text-dls-secondary hover:bg-dls-surface-muted/40 hover:text-dls-text",
            )}
          >
            {operationCopy[item].label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-dls-secondary">
          Network
          <select value={network} onChange={(event) => { setNetwork(event.target.value as "testnet" | "mainnet"); resetReview(); }} className="h-10 w-full rounded-lg border-0 bg-dls-surface-muted/45 px-3 text-sm text-dls-text outline-none ring-1 ring-dls-border/35 focus:ring-[var(--protocol-desk-accent)]">
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet · real funds</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-dls-secondary">
          Asset
          <Input value={asset} onChange={(event) => { setAsset(event.target.value.toUpperCase()); resetReview(); }} placeholder="BTC" />
        </label>
        {needsOrderId ? (
          <label className="space-y-1.5 text-xs text-dls-secondary">
            Open order ID
            <Input value={orderId} inputMode="numeric" onChange={(event) => { setOrderId(event.target.value); resetReview(); }} placeholder="123456789" />
          </label>
        ) : null}
        {showsOrderTerms ? (
          <>
            <fieldset className="space-y-1.5 text-xs text-dls-secondary">
              <legend>{operation === "close_position" ? "Closing side" : "Side"}</legend>
              <div className="grid h-10 grid-cols-2 rounded-lg bg-dls-surface-muted/35 p-1">
                {(["buy", "sell"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={side === item}
                    onClick={() => { setSide(item); resetReview(); }}
                    className={cn("rounded-md text-xs font-semibold capitalize transition-colors", side === item ? item === "buy" ? "bg-emerald-500/18 text-emerald-200" : "bg-red-500/18 text-red-200" : "text-dls-secondary hover:text-dls-text")}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="space-y-1.5 text-xs text-dls-secondary">
              {operation === "close_position" ? "Size to close" : "Size"}
              <Input value={size} inputMode="decimal" onChange={(event) => { setSize(event.target.value); resetReview(); }} placeholder="0.001" />
            </label>
            <label className="space-y-1.5 text-xs text-dls-secondary">
              Order type
              <select value={orderType} onChange={(event) => { setOrderType(event.target.value as "market" | "limit"); resetReview(); }} disabled={operation === "close_position"} className="h-10 w-full rounded-lg border-0 bg-dls-surface-muted/45 px-3 text-sm text-dls-text outline-none ring-1 ring-dls-border/35 focus:ring-[var(--protocol-desk-accent)] disabled:opacity-70">
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </label>
            {orderType === "limit" && operation !== "close_position" ? (
              <label className="space-y-1.5 text-xs text-dls-secondary">
                Limit price (USDC)
                <Input value={limitPrice} inputMode="decimal" onChange={(event) => { setLimitPrice(event.target.value); resetReview(); }} placeholder="65000" />
              </label>
            ) : (
              <label className="space-y-1.5 text-xs text-dls-secondary">
                Max slippage
                <div className="relative">
                  <Input value={slippageBps} inputMode="numeric" onChange={(event) => { setSlippageBps(event.target.value); resetReview(); }} />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-dls-secondary">bps</span>
                </div>
              </label>
            )}
          </>
        ) : null}
      </div>

      {operation === "close_position" ? (
        <p className="text-xs text-dls-secondary">Choose sell to close a long position or buy to close a short. Reduce-only is enforced.</p>
      ) : showsOrderTerms ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-dls-secondary">
          <input type="checkbox" checked={reduceOnly} onChange={(event) => { setReduceOnly(event.target.checked); resetReview(); }} className="size-4 accent-[var(--protocol-desk-accent)]" />
          Reduce-only order
        </label>
      ) : null}

      {reviewDraft ? (
        <div className="space-y-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-dls-text">Review exact action</span>
            {reviewDraft.side ? (
              <span className={cn("text-xs font-semibold capitalize", reviewDraft.side === "buy" ? "text-emerald-300" : "text-red-300")}>{reviewDraft.side}</span>
            ) : (
              <span className="text-xs font-semibold text-dls-text">{operationCopy[reviewDraft.operation].label}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3">
            {reviewRows.map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] text-dls-secondary">{label}</div>
                <div className="mt-0.5 font-medium text-dls-text">{value}</div>
              </div>
            ))}
          </div>
          {intent?.network === "mainnet" && intent.confirmation.phrase ? (
            <label className="block space-y-1.5 text-xs text-red-200">
              Type <span className="font-semibold">{intent.confirmation.phrase}</span>
              <Input value={liveConfirmation} onChange={(event) => setLiveConfirmation(event.target.value)} autoComplete="off" />
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetReview} disabled={busy !== null}>Edit action</Button>
            {!isConnected ? (
              <Button size="sm" disabled={!firstConnector || connectPending} onClick={() => firstConnector && connect({ connector: firstConnector })}>
                {connectPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Wallet className="mr-2 size-3.5" />}
                Connect wallet to continue
              </Button>
            ) : !intent ? (
              <Button size="sm" onClick={() => void prepareIntent()} disabled={executionUnavailable || busy !== null}>
                {busy === "prepare" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Shield className="mr-2 size-3.5" />}
                Prepare wallet signature
              </Button>
            ) : (
              <Button size="sm" onClick={() => void signAndSubmit()} disabled={executionUnavailable || busy !== null || !isConnected || (intent.network === "mainnet" && liveConfirmation !== intent.confirmation.phrase)}>
                {busy === "submit" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Shield className="mr-2 size-3.5" />}
                Sign and submit
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={reviewAction} disabled={busy !== null}>
            Review action
          </Button>
        </div>
      )}

      {receipt ? (
        <div className={cn("rounded-lg px-3 py-3 text-xs leading-5", receipt.status === "submitted" ? "bg-emerald-500/10 text-emerald-200" : "bg-red-500/10 text-red-200")}>
          <div className="font-semibold">{receipt.status === "submitted" ? `${operationCopy[receipt.operation].label} action sent to Hyperliquid` : `Action ${receipt.status}`}</div>
          <div className="mt-1 opacity-80">Receipt {receipt.intentId.slice(0, 8)} · {new Date(receipt.submittedAt).toLocaleString()}</div>
          {evidencePath ? <div className="mt-1 break-all opacity-80">Saved to Outputs · {evidencePath}</div> : null}
        </div>
      ) : null}
      {evidenceWarning ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Receipt not saved">{evidenceWarning}</Notice> : null}
      {tradeError ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Hyperliquid action">{tradeError}</Notice> : null}
      <p className="text-[11px] leading-5 text-dls-secondary">
        {executionUnavailable
          ? `${executionStatusMessage} Exact action review remains available, but this deployment cannot submit it.`
          : operation === "cancel_order"
            ? "Cancellation is bound to the exact order ID shown in review."
            : operation === "modify_order"
              ? "Modification atomically replaces the selected open order with the reviewed terms."
              : operation === "close_position"
                ? "Position closing uses a reduce-only IOC order at the reviewed slippage boundary."
                : orderType === "market"
                  ? "Market orders use an IOC limit at the reviewed slippage boundary."
                  : "Limit orders use the exact price shown in review."}{" "}
        The connected wallet must be authorized for the Hyperliquid account. Matterhorn never stores the wallet signature after submission.
      </p>
    </div>
  );
}

function PolymarketTradeExecution({
  initialDraft,
  guardedHandoff: initialGuardedHandoff,
  initialOperation,
  workspaceId,
  sessionId,
}: {
  initialDraft?: PolymarketDraftHandoff | null;
  guardedHandoff?: Extract<ReviewedActionHandoffV2, { protocol: "polymarket" }> | null;
  initialOperation?: "buy" | "sell" | "cancel" | null;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const [tradeAction, setTradeAction] = useState<"BUY" | "SELL" | "CANCEL">("BUY");
  const [marketId, setMarketId] = useState("");
  const [outcome, setOutcome] = useState("Yes");
  const [amountUsdc, setAmountUsdc] = useState("5");
  const [amountShares, setAmountShares] = useState("1");
  const [slippageTolerance, setSlippageTolerance] = useState("2");
  const [cancelOrderIds, setCancelOrderIds] = useState("");
  const [cancelAll, setCancelAll] = useState(false);
  const [cancelReview, setCancelReview] = useState<{ orderIds: string[]; cancelAll: boolean } | null>(null);
  const [prepared, setPrepared] = useState<PolymarketPreparedOrder | null>(null);
  const [handoff, setHandoff] = useState<Record<string, unknown> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [receipt, setReceipt] = useState<PolymarketPublicReceipt | null>(null);
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState<"prepare" | "submit" | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [guardedHandoff, setGuardedHandoff] = useState(initialGuardedHandoff ?? null);
  useEffect(() => setGuardedHandoff(initialGuardedHandoff ?? null), [initialGuardedHandoff]);
  const [marketQuery, setMarketQuery] = useState("");
  const [markets, setMarkets] = useState<PolymarketMarketSearchResult[]>([]);
  const [marketSearchBusy, setMarketSearchBusy] = useState(false);
  const [marketSearchError, setMarketSearchError] = useState<string | null>(null);

  const resetReview = useCallback(() => {
    setPrepared(null);
    setHandoff(null);
    setCancelReview(null);
    setConfirmation("");
    setReceipt(null);
    setEvidencePath(null);
    setEvidenceWarning(null);
    setTradeError(null);
  }, []);

  useEffect(() => {
    if (initialDraft || !initialOperation) return;
    setTradeAction(initialOperation.toUpperCase() as "BUY" | "SELL" | "CANCEL");
    resetReview();
  }, [initialDraft, initialOperation, resetReview]);

  useEffect(() => {
    if (!initialDraft) return;
    setTradeAction(initialDraft.operation.toUpperCase() as "BUY" | "SELL" | "CANCEL");
    setMarketId(initialDraft.marketId ?? "");
    setOutcome(initialDraft.outcome ?? "");
    if (initialDraft.amountUsdc !== null) setAmountUsdc(String(initialDraft.amountUsdc));
    if (initialDraft.amountShares !== null) setAmountShares(String(initialDraft.amountShares));
    if (initialDraft.slippageTolerance !== null) setSlippageTolerance(String(initialDraft.slippageTolerance));
    setCancelOrderIds(initialDraft.orderIds.join(", "));
    setCancelAll(initialDraft.cancelAll);
    resetReview();
  }, [initialDraft, resetReview]);

  const searchMarkets = useCallback(async (query: string) => {
    setMarketSearchBusy(true);
    setMarketSearchError(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: "8" });
      const { response, json } = await fetchMatterhornApiJson<PolymarketMarketSearchResponse>(
        `/api/polymarket/markets?${params.toString()}`,
      );
      if (!response.ok || !json.success || !Array.isArray(json.markets)) {
        throw new Error(json.error?.message ?? "Could not load Polymarket markets.");
      }
      setMarkets(json.markets);
      if (json.markets.length === 0) {
        setMarketSearchError("No active markets matched that search.");
      }
    } catch (error) {
      setMarkets([]);
      setMarketSearchError(error instanceof Error ? error.message : "Could not load Polymarket markets.");
    } finally {
      setMarketSearchBusy(false);
    }
  }, []);

  useEffect(() => {
    void searchMarkets("");
  }, [searchMarkets]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === marketId) ?? null,
    [marketId, markets],
  );

  const selectMarket = useCallback((market: PolymarketMarketSearchResult) => {
    setMarketId(market.id);
    setOutcome(market.outcomes.find((candidate) => candidate.toLowerCase() === "yes") ?? market.outcomes[0] ?? "Yes");
    resetReview();
  }, [resetReview]);

  const submitMarketSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchMarkets(marketQuery);
  }, [marketQuery, searchMarkets]);

  const marketFreshnessLabel = useCallback((freshness: PolymarketMarketSearchResult["source"]["freshness"]) => {
    if (freshness === "live") return "Live";
    if (freshness === "recent") return "Recent";
    if (freshness === "fallback") return "Fallback data";
    if (freshness === "stale") return "Stale data";
    return "Source age unknown";
  }, []);

  const prepareOrder = useCallback(async () => {
    try {
      const source = guardedHandoff?.source ?? "agent-card";
      const currentDraft: ReviewedActionDraftHandoff = tradeAction === "CANCEL"
        ? {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "polymarket",
            source,
            draft: {
              operation: "cancel",
              marketId: null,
              outcome: null,
              amountUsdc: null,
              amountShares: null,
              slippageTolerance: null,
              orderIds: cancelAll ? [] : normalizePolymarketOrderIds(cancelOrderIds),
              cancelAll,
            },
          }
        : tradeAction === "SELL"
          ? {
              version: "matterhorn.reviewed-action-handoff.v1",
              protocol: "polymarket",
              source,
              draft: {
                operation: "sell",
                marketId: marketId.trim(),
                outcome: outcome.trim(),
                amountUsdc: null,
                amountShares: Number(amountShares),
                slippageTolerance: Number(slippageTolerance),
                orderIds: [],
                cancelAll: false,
              },
            }
          : {
              version: "matterhorn.reviewed-action-handoff.v1",
              protocol: "polymarket",
              source,
              draft: {
                operation: "buy",
                marketId: marketId.trim(),
                outcome: outcome.trim(),
                amountUsdc: Number(amountUsdc),
                amountShares: null,
                slippageTolerance: Number(slippageTolerance),
                orderIds: [],
                cancelAll: false,
              },
            };
      const refreshedHandoff = await validateAgentWalletDraft({
        workspaceId,
        guardedHandoff,
        currentDraft,
        originatedFromHandoff: Boolean(initialDraft),
      });
      setGuardedHandoff(refreshedHandoff);
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "This agent wallet draft must be regenerated before review.");
      return;
    }
    if (tradeAction === "CANCEL") {
      try {
        const orderIds = cancelAll ? [] : normalizePolymarketOrderIds(cancelOrderIds);
        setCancelReview({ orderIds, cancelAll });
        setConfirmation("");
        setReceipt(null);
        setTradeError(null);
      } catch (error) {
        setTradeError(error instanceof Error ? error.message : "Could not review this cancellation.");
      }
      return;
    }
    const amount = Number(amountUsdc);
    const shares = Number(amountShares);
    if (!marketId.trim()) {
      setTradeError("Select an active market or enter its exact public market ID.");
      return;
    }
    if (tradeAction === "BUY" && !(amount > 0)) {
      setTradeError("Enter a positive USDC amount to spend.");
      return;
    }
    if (tradeAction === "SELL" && !(shares > 0)) {
      setTradeError("Enter a positive share quantity to sell.");
      return;
    }
    setBusy("prepare");
    setTradeError(null);
    setReceipt(null);
    try {
      if (tradeAction === "SELL") {
        const { response, json } = await fetchMatterhornApiJson<PolymarketSellPreviewResponse>("/api/polymarket/orders/sell-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: marketId.trim(),
            outcome: outcome.trim() || null,
            side: "yes",
            shares,
            slippageTolerance: Number(slippageTolerance),
          }),
        });
        if (!response.ok || !json.success || !json.preview) {
          throw new Error(json.error?.message ?? "Could not prepare the Polymarket sale.");
        }
        setPrepared({
          tradeSide: "SELL",
          marketId: json.preview.marketId,
          tokenId: json.preview.tokenId,
          marketLabel: json.preview.marketLabel,
          outcome: json.preview.outcome,
          amountUsdc: null,
          amountShares: json.preview.shares,
          estimatedFillPrice: json.preview.estimatedFillPrice,
          estimatedShares: json.preview.shares,
          estimatedProceedsUsdc: json.preview.estimatedProceedsUsdc,
          maxLossUsdc: null,
          previewSha256: json.preview.previewSha256,
          expiresAt: json.preview.expiresAt,
          compliance: json.preview.compliance,
          warnings: json.preview.warnings,
        });
        setHandoff(null);
        return;
      }
      const { response, json } = await fetchMatterhornApiJson<PolymarketPreviewResponse>("/api/polymarket/orders/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: marketId.trim(),
          outcome: outcome.trim() || null,
          side: "yes",
          amountUsdc: amount,
          slippageTolerance: Number(slippageTolerance),
        }),
      });
      if (!response.ok || !json.success || !json.preview) {
        throw new Error(json.error?.message ?? "Could not prepare the Polymarket order.");
      }
      if (json.blocked || json.preview.compliance.status !== "allowed") {
        throw new Error(json.preview.compliance.reason || "Polymarket trading is unavailable in this region.");
      }
      if (!json.preview.marketId || !json.preview.tokenId || !json.preview.marketLabel || !json.preview.outcome || !json.preview.size || !json.preview.risk) {
        throw new Error("The agent preview is missing an exact market, outcome, token, amount, or risk value.");
      }
      setPrepared({
        tradeSide: "BUY",
        marketId: json.preview.marketId,
        tokenId: json.preview.tokenId,
        marketLabel: json.preview.marketLabel,
        outcome: json.preview.outcome,
        amountUsdc: json.preview.size,
        amountShares: null,
        estimatedFillPrice: json.preview.price,
        estimatedShares: json.preview.estimatedShares,
        estimatedProceedsUsdc: null,
        maxLossUsdc: json.preview.risk.maxLossUsdc,
        previewSha256: json.preview.previewSha256,
        expiresAt: json.preview.expiresAt,
        compliance: json.preview.compliance,
        warnings: json.preview.warnings,
      });
      setHandoff(json.handoff ?? null);
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Could not prepare the Polymarket order.");
    } finally {
      setBusy(null);
    }
  }, [amountShares, amountUsdc, cancelAll, cancelOrderIds, guardedHandoff, initialDraft, marketId, outcome, slippageTolerance, tradeAction, workspaceId]);

  const signAndSubmit = useCallback(async () => {
    if ((!prepared && !cancelReview) || !walletClient || !address) return;
    const requiredConfirmation = cancelReview
      ? cancelReview.cancelAll
        ? POLYMARKET_CANCEL_ALL_CONFIRMATION
        : POLYMARKET_CANCEL_CONFIRMATION
      : POLYMARKET_LIVE_CONFIRMATION;
    if (confirmation !== requiredConfirmation) {
      setTradeError(`Type ${requiredConfirmation} before continuing.`);
      return;
    }
    if (walletClient.chain?.id !== POLYMARKET_CHAIN_ID) {
      setTradeError("Switch the connected wallet to Polygon before submitting.");
      return;
    }
    setBusy("submit");
    setTradeError(null);
    try {
      if (cancelReview) {
        const publicReceipt = await cancelPolymarketOrders({
          walletClient,
          orderIds: cancelReview.orderIds,
          cancelAll: cancelReview.cancelAll,
        });
        setReceipt(publicReceipt);
        if (workspaceId) {
          try {
            const { response, json } = await fetchMatterhornApiJson<{
              success?: boolean;
              evidence?: { outputPath?: string };
              error?: { message?: string };
            }>(`/workspace/${encodeURIComponent(workspaceId)}/polymarket/cancellations/receipt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: sessionId || null,
                cancellation: cancelReview,
                receipt: publicReceipt,
                ...(guardedHandoff ? {
                  reviewedAction: guardedHandoff,
                  receiptIntentHash: guardedHandoff.intentHash,
                } : {}),
              }),
            });
            if (!response.ok || !json.success) {
              setEvidenceWarning(json.error?.message ?? "The cancellation succeeded, but its public receipt was not added to this workspace.");
            } else {
              setEvidencePath(json.evidence?.outputPath ?? null);
            }
          } catch {
            setEvidenceWarning("The cancellation succeeded, but its public receipt was not added to this workspace.");
          }
        }
        return;
      }
      if (!prepared) return;
      const publicReceipt = await submitPolymarketOrder({ walletClient, order: prepared });
      setReceipt(publicReceipt);
      if (handoff) {
        const receiptPath = workspaceId
          ? `/workspace/${encodeURIComponent(workspaceId)}/polymarket/orders/receipt`
          : "/api/polymarket/orders/receipt";
        try {
          const { response, json } = await fetchMatterhornApiJson<{
            success?: boolean;
            evidence?: { outputPath?: string };
            error?: { message?: string };
          }>(receiptPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionId || null,
              handoff,
              ...(guardedHandoff ? {
                reviewedAction: guardedHandoff,
                receiptIntentHash: guardedHandoff.intentHash,
              } : {}),
              receipt: {
                previewSha256: prepared.previewSha256,
                handoffSha256: typeof handoff.handoffSha256 === "string" ? handoff.handoffSha256 : null,
                orderId: publicReceipt.orderId,
                txHash: publicReceipt.transactionHashes[0] ?? null,
                status: publicReceipt.status,
                marketId: prepared.marketId,
                outcome: prepared.outcome,
                side: prepared.tradeSide.toLowerCase(),
                submittedAt: publicReceipt.submittedAt,
              },
            }),
          });
          if (!response.ok || !json.success) {
            setEvidenceWarning(json.error?.message ?? "The order succeeded, but its public receipt was not added to this workspace.");
          } else {
            setEvidencePath(json.evidence?.outputPath ?? null);
          }
        } catch {
          setEvidenceWarning("The order succeeded, but its public receipt was not added to this workspace.");
        }
      }
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Wallet authorization or Polymarket submission failed.");
    } finally {
      setBusy(null);
    }
  }, [address, cancelReview, confirmation, guardedHandoff, handoff, prepared, sessionId, walletClient, workspaceId]);

  const firstConnector = connectors.find((connector) => connector.id !== "injected") ?? connectors[0];
  const onPolygon = walletClient?.chain?.id === POLYMARKET_CHAIN_ID;
  const shortWalletAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;
  const actionTitle = tradeAction === "BUY" ? "Buy an outcome" : tradeAction === "SELL" ? "Sell outcome shares" : "Cancel open orders";
  const requiredConfirmation = cancelReview
    ? cancelReview.cancelAll
      ? POLYMARKET_CANCEL_ALL_CONFIRMATION
      : POLYMARKET_CANCEL_CONFIRMATION
    : POLYMARKET_LIVE_CONFIRMATION;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-dls-text">{actionTitle}</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-dls-secondary">
            {tradeAction === "CANCEL"
              ? "Choose exact order IDs or cancel every open order. Your connected wallet authorizes access to your Polymarket account."
              : "Select a live market, review the exact terms and compliance result, then authorize the order with your connected wallet."}
          </p>
        </div>
        <div className="text-right text-[11px] leading-5 text-dls-secondary">
          <div className={cn("font-medium", isConnected ? "text-emerald-300" : "text-dls-secondary")}>{shortWalletAddress ?? "Wallet not connected"}</div>
          <div>{onPolygon ? "Polygon · real funds" : "Polygon required"}</div>
        </div>
      </div>

      <div className="inline-flex min-h-9 rounded-lg bg-dls-surface-muted/45 p-1" aria-label="Polymarket action">
        {(["BUY", "SELL", "CANCEL"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--protocol-desk-accent)]",
              tradeAction === candidate ? "bg-dls-active text-dls-text" : "text-dls-secondary hover:text-dls-text",
            )}
            onClick={() => {
              setTradeAction(candidate);
              resetReview();
            }}
          >
            {candidate === "BUY" ? "Buy" : candidate === "SELL" ? "Sell" : "Cancel orders"}
          </button>
        ))}
      </div>

      {tradeAction !== "CANCEL" ? <div className="space-y-2">
        <form className="flex gap-2" onSubmit={submitMarketSearch}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dls-secondary" />
            <Input
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
              className="pl-9"
              placeholder="Search active markets"
              aria-label="Search active Polymarket markets"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={marketSearchBusy}>
            {marketSearchBusy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Search
          </Button>
        </form>

        {markets.length > 0 ? (
          <div className="divide-y divide-dls-border/30 overflow-hidden rounded-lg bg-dls-surface-muted/25">
            {markets.map((market) => {
              const yesPrice = market.outcomePrices.Yes ?? market.outcomePrices.yes ?? null;
              const selected = market.id === marketId;
              return (
                <button
                  key={market.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-dls-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--protocol-desk-accent)]",
                    selected && "bg-[var(--protocol-desk-soft)]",
                  )}
                  onClick={() => selectMarket(market)}
                >
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-xs font-medium leading-5 text-dls-text">{market.question}</span>
                    <span className="mt-0.5 block text-[10px] text-dls-secondary">
                      {marketFreshnessLabel(market.source.freshness)}
                      {market.liquidity === null ? "" : ` · $${Math.round(market.liquidity).toLocaleString()} liquidity`}
                    </span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs font-semibold text-[var(--protocol-desk-accent)]">
                    {yesPrice === null ? "Select" : `${Math.round(yesPrice * 100)}% Yes`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : marketSearchBusy ? (
          <div className="h-24 animate-pulse rounded-lg bg-dls-surface-muted/25" aria-label="Loading active markets" />
        ) : null}
        {marketSearchError ? <p className="text-xs leading-5 text-amber-200">{marketSearchError}</p> : null}
      </div> : null}

      {!isConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <p className="text-xs leading-5 text-dls-secondary">Connect the EVM wallet that holds your Polymarket funds.</p>
          <Button size="sm" disabled={!firstConnector || connectPending} onClick={() => firstConnector && connect({ connector: firstConnector })}>
            {connectPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Wallet className="mr-2 size-3.5" />}
            Connect wallet
          </Button>
        </div>
      ) : !onPolygon ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-500/8 px-3 py-3">
          <p className="text-xs leading-5 text-amber-100">Polymarket orders settle on Polygon.</p>
          <Button size="sm" variant="outline" disabled={switchPending} onClick={() => void switchChainAsync({ chainId: POLYMARKET_CHAIN_ID })}>
            {switchPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Switch to Polygon
          </Button>
        </div>
      ) : null}

      {tradeAction === "CANCEL" ? (
        <div className="space-y-3 rounded-lg bg-dls-surface-muted/25 px-3 py-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={cancelAll}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--protocol-desk-accent)]",
              cancelAll ? "bg-red-500/10 text-red-100" : "bg-dls-surface-muted/35 text-dls-text hover:bg-dls-hover/70",
            )}
            onClick={() => {
              setCancelAll((value) => !value);
              resetReview();
            }}
          >
            <span>
              <span className="block text-xs font-semibold">Cancel every open order</span>
              <span className="mt-0.5 block text-[11px] text-dls-secondary">Clear every currently open order for this wallet.</span>
            </span>
            <span className={cn("size-4 rounded-full border", cancelAll ? "border-red-300 bg-red-300" : "border-dls-border")} />
          </button>
          {!cancelAll ? (
            <label className="block space-y-1.5 text-xs text-dls-secondary">
              Exact order IDs
              <Input
                value={cancelOrderIds}
                onChange={(event) => { setCancelOrderIds(event.target.value); resetReview(); }}
                placeholder="Paste IDs separated by commas"
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs text-dls-secondary sm:col-span-2">
          Exact market ID
          <Input
            value={marketId}
            onChange={(event) => { setMarketId(event.target.value); resetReview(); }}
            placeholder="Select a live market above or enter its public ID"
          />
          {selectedMarket ? (
            <span className="block text-[11px] leading-5 text-dls-text">{selectedMarket.question}</span>
          ) : null}
        </label>
        {selectedMarket?.outcomes.length ? (
          <fieldset className="space-y-1.5 text-xs text-dls-secondary">
            <legend>Outcome</legend>
            <div className="grid min-h-10 grid-cols-2 rounded-lg bg-dls-surface-muted/35 p-1">
              {selectedMarket.outcomes.slice(0, 2).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs transition-colors",
                    outcome === candidate ? "bg-dls-active text-dls-text" : "text-dls-secondary hover:text-dls-text",
                  )}
                  onClick={() => { setOutcome(candidate); resetReview(); }}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <label className="space-y-1.5 text-xs text-dls-secondary">
            Outcome
            <Input value={outcome} onChange={(event) => { setOutcome(event.target.value); resetReview(); }} placeholder="Yes" />
          </label>
        )}
        <label className="space-y-1.5 text-xs text-dls-secondary">
          {tradeAction === "BUY" ? "Amount (USDC)" : "Shares to sell"}
          <Input
            value={tradeAction === "BUY" ? amountUsdc : amountShares}
            inputMode="decimal"
            onChange={(event) => {
              if (tradeAction === "BUY") setAmountUsdc(event.target.value);
              else setAmountShares(event.target.value);
              resetReview();
            }}
          />
        </label>
        <label className="space-y-1.5 text-xs text-dls-secondary">
          Max estimated slippage
          <div className="relative">
            <Input value={slippageTolerance} inputMode="decimal" onChange={(event) => { setSlippageTolerance(event.target.value); resetReview(); }} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-dls-secondary">%</span>
          </div>
        </label>
      </div>
      )}

      {prepared ? (
        <div className="space-y-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-dls-text">Review exact order</span>
            <span className="text-xs font-semibold text-[var(--protocol-desk-accent)]">{prepared.outcome}</span>
          </div>
          <p className="text-xs font-medium leading-5 text-dls-text">{prepared.marketLabel}</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3">
            {(prepared.tradeSide === "BUY" ? [
              ["Spend", `$${(prepared.amountUsdc ?? 0).toFixed(2)} USDC`],
              ["Estimated fill", prepared.estimatedFillPrice === null ? "Unavailable" : `${(prepared.estimatedFillPrice * 100).toFixed(1)}¢`],
              ["Estimated shares", prepared.estimatedShares?.toFixed(3) ?? "Unavailable"],
              ["Maximum loss", `$${(prepared.maxLossUsdc ?? 0).toFixed(2)}`],
              ["Network", "Polygon · real funds"],
              ["Expires", new Date(prepared.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
            ] : [
              ["Shares", (prepared.amountShares ?? 0).toFixed(3)],
              ["Estimated fill", prepared.estimatedFillPrice === null ? "Unavailable" : `${(prepared.estimatedFillPrice * 100).toFixed(1)}¢`],
              ["Estimated proceeds", prepared.estimatedProceedsUsdc === null ? "Unavailable" : `$${prepared.estimatedProceedsUsdc.toFixed(2)} USDC`],
              ["Network", "Polygon · real funds"],
              ["Expires", new Date(prepared.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
            ]).map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] text-dls-secondary">{label}</div>
                <div className="mt-0.5 font-medium text-dls-text">{value}</div>
              </div>
            ))}
          </div>
          <label className="block space-y-1.5 text-xs text-red-200">
            Type <span className="font-semibold">{POLYMARKET_LIVE_CONFIRMATION}</span>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetReview} disabled={busy !== null}>Edit order</Button>
            <Button size="sm" onClick={() => void signAndSubmit()} disabled={busy !== null || !isConnected || !onPolygon || confirmation !== POLYMARKET_LIVE_CONFIRMATION}>
              {busy === "submit" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Shield className="mr-2 size-3.5" />}
              Authorize and submit
            </Button>
          </div>
        </div>
      ) : cancelReview ? (
        <div className="space-y-3 rounded-lg bg-red-500/7 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-dls-text">Review cancellation</span>
            <span className="text-xs font-medium text-red-200">
              {cancelReview.cancelAll ? "All open orders" : `${cancelReview.orderIds.length} selected`}
            </span>
          </div>
          {!cancelReview.cancelAll ? (
            <p className="break-all text-[11px] leading-5 text-dls-secondary">{cancelReview.orderIds.join(", ")}</p>
          ) : (
            <p className="text-[11px] leading-5 text-red-100">Every open Polymarket order for this account will be cancelled.</p>
          )}
          <label className="block space-y-1.5 text-xs text-red-200">
            Type <span className="font-semibold">{requiredConfirmation}</span>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetReview} disabled={busy !== null}>Edit cancellation</Button>
            <Button size="sm" onClick={() => void signAndSubmit()} disabled={busy !== null || !isConnected || !onPolygon || confirmation !== requiredConfirmation}>
              {busy === "submit" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <CircleX className="mr-2 size-3.5" />}
              Authorize cancellation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void prepareOrder()} disabled={busy !== null}>
            {busy === "prepare" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            {tradeAction === "CANCEL" ? "Review cancellation" : "Review order"}
          </Button>
        </div>
      )}

      {receipt ? (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-3 text-xs leading-5 text-emerald-200">
          <div className="font-semibold">{tradeAction === "CANCEL" ? "Cancellation sent to Polymarket" : "Order sent to Polymarket"}</div>
          <div className="mt-1 opacity-80">{receipt.orderId ? `Order ${receipt.orderId}` : receipt.status} · {new Date(receipt.submittedAt).toLocaleString()}</div>
          {evidencePath ? <div className="mt-1 break-all opacity-80">Saved to Outputs · {evidencePath}</div> : null}
        </div>
      ) : null}
      {evidenceWarning ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Receipt not saved">{evidenceWarning}</Notice> : null}
      {tradeError ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Polymarket order">{tradeError}</Notice> : null}
      <p className="text-[11px] leading-5 text-dls-secondary">
        Browser-wallet EOA accounts are supported in this release. The temporary CLOB credential exists only in memory for this submission and is cleared immediately afterward.
      </p>
    </div>
  );
}

function BittensorConnectedWalletExecution({
  initialDraft,
  guardedHandoff: initialGuardedHandoff,
  initialOperation,
  workspaceId,
  sessionId,
}: {
  initialDraft?: BittensorDraftHandoff | null;
  guardedHandoff?: Extract<ReviewedActionHandoffV2, { protocol: "bittensor" }> | null;
  initialOperation?: BittensorWalletAction | null;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const [walletAction, setWalletAction] = useState<BittensorWalletAction>("transfer");
  const [accounts, setAccounts] = useState<BittensorExtensionAccount[]>([]);
  const [sender, setSender] = useState("");
  const [destination, setDestination] = useState("");
  const [hotkey, setHotkey] = useState("");
  const [netuid, setNetuid] = useState("1");
  const [amountTao, setAmountTao] = useState("0.1");
  const [backendPreview, setBackendPreview] = useState<BittensorWalletActionPreviewResponse["preview"] | null>(null);
  const [prepared, setPrepared] = useState<BittensorWalletActionPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [receipt, setReceipt] = useState<BittensorPublicReceipt | null>(null);
  const [busy, setBusy] = useState<"connect" | "prepare" | "submit" | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [guardedHandoff, setGuardedHandoff] = useState(initialGuardedHandoff ?? null);
  useEffect(() => setGuardedHandoff(initialGuardedHandoff ?? null), [initialGuardedHandoff]);

  const resetReview = useCallback(() => {
    setBackendPreview(null);
    setPrepared(null);
    setConfirmation("");
    setReceipt(null);
    setEvidenceWarning(null);
    setEvidencePath(null);
  }, []);

  useEffect(() => {
    if (initialDraft || !initialOperation) return;
    setWalletAction(initialOperation);
    resetReview();
  }, [initialDraft, initialOperation, resetReview]);

  useEffect(() => {
    if (!initialDraft) return;
    setWalletAction(initialDraft.operation);
    if (initialDraft.sender) setSender(initialDraft.sender);
    setDestination(initialDraft.destination ?? "");
    setHotkey(initialDraft.hotkey ?? "");
    if (initialDraft.netuid !== null) setNetuid(String(initialDraft.netuid));
    setAmountTao(initialDraft.amountTao);
    resetReview();
  }, [initialDraft, resetReview]);

  const connectWallet = useCallback(async () => {
    setBusy("connect");
    setTransferError(null);
    try {
      const next = await listBittensorExtensionAccounts();
      setAccounts(next);
      setSender((current) => next.some((account) => account.address === current) ? current : next[0]?.address ?? "");
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "Could not connect a Bittensor wallet extension.");
    } finally {
      setBusy(null);
    }
  }, []);

  const prepareWalletAction = useCallback(async () => {
    setBusy("prepare");
    setTransferError(null);
    setEvidenceWarning(null);
    try {
      if (!sender) throw new Error("Connect and choose the Bittensor account that will send TAO.");
      const parsedNetuid = Number(netuid);
      if (walletAction !== "transfer" && (!Number.isInteger(parsedNetuid) || parsedNetuid < 0)) {
        throw new Error("Enter a valid non-negative subnet netuid.");
      }
      const source = guardedHandoff?.source ?? "agent-card";
      const currentDraft: ReviewedActionDraftHandoff = walletAction === "transfer"
        ? {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "bittensor",
            source,
            draft: {
              operation: "transfer",
              sender: sender || null,
              destination: destination.trim(),
              hotkey: null,
              netuid: null,
              amountTao,
            },
          }
        : {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "bittensor",
            source,
            draft: {
              operation: walletAction,
              sender: sender || null,
              destination: null,
              hotkey: hotkey.trim(),
              netuid: parsedNetuid,
              amountTao,
            },
          };
      const refreshedHandoff = await validateAgentWalletDraft({
        workspaceId,
        guardedHandoff,
        currentDraft,
        originatedFromHandoff: Boolean(initialDraft),
      });
      setGuardedHandoff(refreshedHandoff);
      const { response, json } = await fetchMatterhornApiJson<BittensorWalletActionPreviewResponse>("/api/bittensor/extrinsics/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: walletAction,
          amountTao,
          coldkey: sender,
          destination: walletAction === "transfer" ? destination : null,
          hotkey: walletAction === "transfer" ? null : hotkey,
          netuid: walletAction === "transfer" ? null : parsedNetuid,
        }),
      });
      if (!response.ok || !json.success || !json.preview) {
        throw new Error(json.error?.message ?? `Matterhorn could not prepare the Bittensor ${walletAction}.`);
      }
      if (json.preview.network !== "finney") {
        throw new Error("Connected-wallet transfers currently require the Bittensor Finney network.");
      }
      if (json.preview.amountTao === null || json.preview.amountTao <= 0) {
        throw new Error("Enter a valid TAO amount greater than zero.");
      }
      if (walletAction === "transfer" && json.preview.destination !== destination.trim()) {
        throw new Error("The destination is not a valid Bittensor SS58 address.");
      }
      if (walletAction !== "transfer" && json.preview.hotkey !== hotkey.trim()) {
        throw new Error("The validator hotkey is not a valid Bittensor SS58 address.");
      }
      const invalidPublicAddress = json.preview.warnings.some((warning) => /(?:destination|hotkey).*not.*valid/i.test(warning));
      if (invalidPublicAddress) throw new Error("The public Bittensor address is not valid.");

      const reviewedWarnings = json.preview.warnings.filter((warning) =>
        !/unsigned preview|external .*signer|cannot sign|cannot broadcast/i.test(warning)
      );
      const reviewed = walletAction === "transfer"
        ? createBittensorWalletActionPreview({
            action: "transfer",
            sender,
            destination: json.preview.destination ?? "",
            amountTao,
            feeTao: json.preview.feeTao,
            warnings: reviewedWarnings,
          })
        : createBittensorWalletActionPreview({
            action: walletAction,
            sender,
            hotkey: json.preview.hotkey ?? "",
            netuid: json.preview.netuid ?? parsedNetuid,
            amountTao,
            feeTao: json.preview.feeTao,
            warnings: reviewedWarnings,
          });
      setBackendPreview(json.preview);
      setPrepared(reviewed);
      setConfirmation("");
      setReceipt(null);
    } catch (error) {
      setBackendPreview(null);
      setPrepared(null);
      setTransferError(error instanceof Error ? error.message : `Could not prepare the Bittensor ${walletAction}.`);
    } finally {
      setBusy(null);
    }
  }, [amountTao, destination, guardedHandoff, hotkey, initialDraft, netuid, sender, walletAction, workspaceId]);

  const signAndSubmit = useCallback(async () => {
    if (!prepared || !backendPreview) return;
    setBusy("submit");
    setTransferError(null);
    setEvidenceWarning(null);
    try {
      const publicReceipt = await submitBittensorWalletAction({
        preview: prepared,
        confirmation,
      });
      setReceipt(publicReceipt);

      try {
        const receiptPath = workspaceId
          ? `/workspace/${encodeURIComponent(workspaceId)}/bittensor/extrinsics/receipt`
          : "/api/bittensor/extrinsics/receipt";
        const payload = {
          preview: backendPreview,
          signerAddress: publicReceipt.signerAddress,
          result: {
            status: "submitted",
            txHash: publicReceipt.txHash,
            blockHash: publicReceipt.blockHash,
            message: `Connected Bittensor wallet finalized the reviewed ${publicReceipt.action}.`,
            explorerUrl: null,
          },
          ...(guardedHandoff ? {
            reviewedAction: guardedHandoff,
            receiptIntentHash: guardedHandoff.intentHash,
          } : {}),
        };
        const { response, json } = await fetchMatterhornApiJson<{ success?: boolean; evidence?: { outputPath?: string }; error?: { message?: string } }>(receiptPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workspaceId ? { sessionId: sessionId || null, payload } : payload),
        });
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? "Could not save public transaction evidence.");
        }
        setEvidencePath(json.evidence?.outputPath ?? null);
      } catch (error) {
        setEvidenceWarning(
          `The ${prepared.action} finalized, but Matterhorn could not save its public receipt: ${
            error instanceof Error ? error.message : "unknown evidence error"
          }`,
        );
      }
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : `The Bittensor wallet did not complete the ${prepared.action}.`);
    } finally {
      setBusy(null);
    }
  }, [backendPreview, confirmation, guardedHandoff, prepared, sessionId, workspaceId]);

  const shortSender = sender ? shortAddress(sender) : "Not connected";
  const actionCopy = {
    transfer: {
      label: "Transfer",
      title: "Transfer TAO",
      summary: "Send TAO to another public SS58 address.",
      review: "Review exact transfer",
    },
    stake: {
      label: "Stake",
      title: "Stake TAO",
      summary: "Add TAO stake to a validator on a subnet.",
      review: "Review exact stake",
    },
    unstake: {
      label: "Unstake",
      title: "Unstake TAO",
      summary: "Remove TAO stake from a validator on a subnet.",
      review: "Review exact unstake",
    },
  } as const;
  const selectedCopy = actionCopy[walletAction];
  const requiredConfirmation = prepared?.confirmation.phrase ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-dls-text">{selectedCopy.title}</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-dls-secondary">
            {selectedCopy.summary} Your connected wallet shows and authorizes the exact Finney call.
          </p>
        </div>
        <div className="text-right text-[11px] leading-5 text-dls-secondary">
          <div className={cn("font-medium", sender ? "text-emerald-300" : "text-dls-secondary")}>{shortSender}</div>
          <div>Finney · connected-wallet approval</div>
        </div>
      </div>

      <div className="inline-flex rounded-lg bg-dls-surface-muted/35 p-1" aria-label="Bittensor transaction type">
        {(Object.keys(actionCopy) as BittensorWalletAction[]).map((item) => (
          <button
            key={item}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              walletAction === item
                ? "bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)]"
                : "text-dls-secondary hover:bg-dls-hover/45 hover:text-dls-text",
            )}
            onClick={() => {
              setWalletAction(item);
              setTransferError(null);
              resetReview();
            }}
          >
            {actionCopy[item].label}
          </button>
        ))}
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <p className="text-xs leading-5 text-dls-secondary">
            Use an installed Substrate wallet such as Talisman, SubWallet, or Polkadot.js.
          </p>
          <Button size="sm" onClick={() => void connectWallet()} disabled={busy !== null}>
            {busy === "connect" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Wallet className="mr-2 size-3.5" />}
            Connect Bittensor wallet
          </Button>
        </div>
      ) : (
        <label className="block space-y-1.5 text-xs text-dls-secondary">
          Signing account
          <select
            value={sender}
            onChange={(event) => { setSender(event.currentTarget.value); resetReview(); }}
            className="h-10 w-full rounded-lg border-0 bg-dls-surface-muted/45 px-3 text-sm text-dls-text outline-none ring-1 ring-dls-border/35 focus:ring-[var(--protocol-desk-accent)]"
          >
            {accounts.map((account) => (
              <option key={account.address} value={account.address}>
                {account.name} · {shortAddress(account.address)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={cn("grid gap-3", walletAction === "transfer" ? "sm:grid-cols-[minmax(0,1fr)_10rem]" : "sm:grid-cols-[minmax(0,1fr)_8rem_10rem]")}>
        {walletAction === "transfer" ? (
          <label className="space-y-1.5 text-xs text-dls-secondary">
            Recipient SS58 address
            <Input
              value={destination}
              onChange={(event) => { setDestination(event.target.value); resetReview(); }}
              placeholder="5..."
              autoComplete="off"
            />
          </label>
        ) : (
          <>
            <label className="space-y-1.5 text-xs text-dls-secondary">
              Validator hotkey
              <Input
                value={hotkey}
                onChange={(event) => { setHotkey(event.target.value); resetReview(); }}
                placeholder="5..."
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5 text-xs text-dls-secondary">
              Netuid
              <Input
                value={netuid}
                inputMode="numeric"
                onChange={(event) => { setNetuid(event.target.value); resetReview(); }}
                autoComplete="off"
              />
            </label>
          </>
        )}
        <label className="space-y-1.5 text-xs text-dls-secondary">
          Amount (TAO)
          <Input
            value={amountTao}
            inputMode="decimal"
            onChange={(event) => { setAmountTao(event.target.value); resetReview(); }}
            autoComplete="off"
          />
        </label>
      </div>

      {prepared ? (
        <div className="space-y-3 rounded-lg bg-dls-surface-muted/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-dls-text">{selectedCopy.review}</span>
            <span className="text-xs font-semibold text-[var(--protocol-desk-accent)]">{prepared.amountTao} TAO</span>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <div className="text-[10px] text-dls-secondary">Signing account</div>
              <div className="mt-0.5 break-all font-mono text-dls-text">{prepared.sender}</div>
            </div>
            <div>
              <div className="text-[10px] text-dls-secondary">{prepared.action === "transfer" ? "Recipient" : "Validator hotkey"}</div>
              <div className="mt-0.5 break-all font-mono text-dls-text">{prepared.action === "transfer" ? prepared.destination : prepared.hotkey}</div>
            </div>
            {prepared.action !== "transfer" ? (
              <div>
                <div className="text-[10px] text-dls-secondary">Subnet</div>
                <div className="mt-0.5 font-medium text-dls-text">Netuid {prepared.netuid}</div>
              </div>
            ) : null}
            <div>
              <div className="text-[10px] text-dls-secondary">Network</div>
              <div className="mt-0.5 font-medium text-dls-text">Bittensor Finney</div>
            </div>
            <div>
              <div className="text-[10px] text-dls-secondary">Estimated fee</div>
              <div className="mt-0.5 font-medium text-dls-text">{prepared.feeTao === null ? "Wallet will estimate" : `${prepared.feeTao} TAO`}</div>
            </div>
          </div>
          <p className="text-xs leading-5 text-dls-secondary">{prepared.consequenceSummary}</p>
          <label className="block space-y-1.5 text-xs text-red-200">
            Type <span className="font-semibold">{requiredConfirmation}</span>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetReview} disabled={busy !== null}>Edit {prepared.action}</Button>
            <Button
              size="sm"
              onClick={() => void signAndSubmit()}
              disabled={busy !== null || confirmation !== requiredConfirmation}
            >
              {busy === "submit" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Shield className="mr-2 size-3.5" />}
              Review in wallet
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void prepareWalletAction()} disabled={busy !== null || !sender}>
            {busy === "prepare" ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Review {walletAction}
          </Button>
        </div>
      )}

      {receipt ? (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-3 text-xs leading-5 text-emerald-200">
          <div className="font-semibold">Bittensor {receipt.action} finalized</div>
          <div className="mt-1 break-all opacity-80">Transaction {receipt.txHash} · Block {receipt.blockHash}</div>
          {evidencePath ? <div className="mt-1 break-all opacity-80">Saved to Outputs · {evidencePath}</div> : null}
        </div>
      ) : null}
      {evidenceWarning ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Receipt not saved">{evidenceWarning}</Notice> : null}
      {transferError ? <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Bittensor transaction">{transferError}</Notice> : null}
      <p className="text-[11px] leading-5 text-dls-secondary">
        Matterhorn receives only public account, transaction, and block hashes. Seed phrases, private keys, and raw signatures never enter Matterhorn.
      </p>
    </div>
  );
}

export default function BittensorPanel({
  initialVenue = "bittensor",
  openReviewedAction = false,
  initialOperation = null,
  workspaceId = null,
  sessionId = null,
}: {
  initialVenue?: CryptoVenue;
  openReviewedAction?: boolean;
  initialOperation?: ReviewedActionOperation | null;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const [venue, setVenue] = useState<CryptoVenue>(initialVenue);
  const [tab, setTab] = useState<Tab>("overview");
  const [draftHandoff, setDraftHandoff] = useState<ReviewedActionDraftHandoff | null>(null);
  const [guardedHandoff, setGuardedHandoff] = useState<ReviewedActionHandoffV2 | null>(null);
  const [subnets, setSubnets] = useState<BittensorSubnetSummary[]>([]);
  const [selectedNetuid, setSelectedNetuid] = useState<number | null>(null);
  const [detail, setDetail] = useState<BittensorSubnetDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchAddress, setWatchAddress] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(WATCH_ADDRESS_KEY) ?? "" : "",
  );
  const [wallet, setWallet] = useState<BittensorWalletSnapshot | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletTimelineStatus, setWalletTimelineStatus] = useState<BittensorWalletTimelineStatus | null>(null);
  const [walletTimeline, setWalletTimeline] = useState<BittensorWalletTimelineExport | null>(null);
  const [walletTimelineLoading, setWalletTimelineLoading] = useState(false);
  const [walletTimelineAction, setWalletTimelineAction] = useState<"capture" | "export" | "clear" | null>(null);
  const [walletTimelineMessage, setWalletTimelineMessage] = useState<string | null>(null);
  const [confirmWalletTimelineClear, setConfirmWalletTimelineClear] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(readFavorites);
  const [action, setAction] = useState<ActionType>("stake");
  const [actionNetuid, setActionNetuid] = useState("14");
  const [amountTao, setAmountTao] = useState("1");
  const [validatorHotkey, setValidatorHotkey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<BittensorActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<BittensorSubtensorSidecarHealth | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [cryptoReadiness, setCryptoReadiness] = useState<ReadinessReport | null>(null);
  const [marketExecutionReadiness, setMarketExecutionReadiness] = useState<MarketExecutionReadinessReport | null>(null);
  const [marketExecutionChain, setMarketExecutionChain] = useState<MarketExecutionChainGuide | null>(null);
  const [marketSdkValidation, setMarketSdkValidation] = useState<MarketSdkValidationGuide | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [cryptoReadinessLoading, setCryptoReadinessLoading] = useState(false);
  const [marketExecutionReadinessLoading, setMarketExecutionReadinessLoading] = useState(false);
  const [marketExecutionChainLoading, setMarketExecutionChainLoading] = useState(false);
  const [marketSdkValidationLoading, setMarketSdkValidationLoading] = useState(false);
  const [copiedCustomerCommand, setCopiedCustomerCommand] = useState<string | null>(null);
  const [agentPromptReady, setAgentPromptReady] = useState(false);
  const [loadedSavedWatchAddress, setLoadedSavedWatchAddress] = useState(false);

  useEffect(() => {
    setVenue(initialVenue);
    setTab(openReviewedAction && initialVenue === "bittensor" ? "actions" : "overview");
  }, [initialVenue, openReviewedAction]);

  useEffect(() => {
    const applyHandoff = (handoff: ReviewedActionDraftHandoff, guard: ReviewedActionHandoffV2 | null) => {
      if (handoff.protocol === "sui") return;
      setDraftHandoff(handoff);
      setGuardedHandoff(guard?.protocol === handoff.protocol ? guard : null);
      setVenue(handoff.protocol);
      setTab(handoff.protocol === "bittensor" ? "actions" : "overview");
    };
    const pending = takePendingReviewedActionHandoff();
    const pendingGuard = takePendingReviewedActionGuard();
    if (pending) applyHandoff(pending, pendingGuard);
    return subscribeReviewedActionHandoff((handoff) => {
      takePendingReviewedActionHandoff();
      applyHandoff(handoff, takePendingReviewedActionGuard());
    });
  }, []);

  const loadSubnets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; subnets?: BittensorSubnetSummary[]; error?: { message?: string } }>("/api/bittensor/subnets");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load subnets");
      const next = (json.subnets ?? []) as BittensorSubnetSummary[];
      setSubnets(next);
      setSelectedNetuid((current) => current ?? next[0]?.netuid ?? null);
    } catch (err) {
      setError(formatBittensorProviderError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSidecarStatus = useCallback(async () => {
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; health?: BittensorSubtensorSidecarHealth; error?: { message?: string } }>("/api/bittensor/sidecar/health");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load sidecar status");
      setSidecarStatus(json.health as BittensorSubtensorSidecarHealth);
    } catch {
      setSidecarStatus(null);
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; report?: ReadinessReport; error?: { message?: string } }>("/api/bittensor/readiness");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load Bittensor readiness");
      setReadiness(json.report as ReadinessReport);
    } catch (err) {
      setReadiness({
        ready: false,
        checks: [{
          id: "readiness_api",
          label: "Readiness API",
          status: "fail",
          summary: err instanceof Error
            ? `Local Matterhorn API unavailable for /api/bittensor/readiness: ${err.message}`
            : "Local Matterhorn API unavailable for /api/bittensor/readiness.",
        }],
        warnings: ["This is a local server/auth availability check, not a Bittensor wallet or subnet failure."],
        nextActions: ["Restart or reconnect the Matterhorn Desks local server, then refresh readiness."],
      });
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const loadCryptoReadiness = useCallback(async () => {
    setCryptoReadinessLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; report?: ReadinessReport; error?: { message?: string } }>("/api/crypto/readiness");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load crypto readiness");
      setCryptoReadiness((json.report ?? json) as ReadinessReport);
    } catch (err) {
      setCryptoReadiness({
        ready: false,
        checks: [{
          id: "crypto_readiness_api",
          label: "Protocol readiness API",
          status: "fail",
          summary: err instanceof Error
            ? `Local Matterhorn API unavailable for /api/crypto/readiness: ${err.message}`
            : "Local Matterhorn API unavailable for /api/crypto/readiness.",
        }],
        warnings: ["This blocks live customer evidence collection until the local server/auth token is healthy, but it is not a protocol or wallet failure."],
        nextActions: ["Run pnpm smoke:customer-ready-crypto or restart Matterhorn Desks, then refresh this panel."],
      });
    } finally {
      setCryptoReadinessLoading(false);
    }
  }, []);

  const loadMarketExecutionReadiness = useCallback(async () => {
    setMarketExecutionReadinessLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; report?: MarketExecutionReadinessReport; error?: { message?: string } }>("/api/crypto/market-execution-readiness");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load market execution readiness");
      setMarketExecutionReadiness((json.report ?? json) as MarketExecutionReadinessReport);
    } catch (err) {
      setMarketExecutionReadiness({
        version: "matterhorn.market.execution-readiness.v1",
        checkedAt: new Date().toISOString(),
        readyForLiveSubmission: false,
        status: "unavailable",
        venues: [],
        reviewedWalletTickets: {
          hyperliquid: {
            available: false,
            scope: "Unavailable until the local Matterhorn Desks engine reconnects.",
          },
          polymarket: {
            available: false,
            scope: "Unavailable until the local Matterhorn Desks engine reconnects.",
          },
          bittensor: {
            available: false,
            scope: "Unavailable until the local Matterhorn Desks engine reconnects.",
          },
        },
        controls: [{
          id: "market_execution_readiness_api",
          status: "fail",
          summary: err instanceof Error
            ? `Local Matterhorn API unavailable for /api/crypto/market-execution-readiness: ${err.message}`
            : "Local Matterhorn API unavailable for /api/crypto/market-execution-readiness.",
        }],
        nextActions: ["Restart or reconnect the Matterhorn Desks local server, then refresh market execution readiness before production use."],
        safety: {
          nonCustodial: true,
          liveSubmissionEnabled: false,
          canSubmit: false,
          signsOrSubmits: false,
          acceptsSecrets: false,
          acceptsRawSignatures: false,
          acceptsSignedPayloads: false,
        },
      });
    } finally {
      setMarketExecutionReadinessLoading(false);
    }
  }, []);

  const loadMarketExecutionChain = useCallback(async () => {
    setMarketExecutionChainLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; guide?: MarketExecutionChainGuide; error?: { message?: string } }>("/api/crypto/market-execution-chain");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load market execution chain");
      setMarketExecutionChain((json.guide ?? json) as MarketExecutionChainGuide);
    } catch {
      setMarketExecutionChain(null);
    } finally {
      setMarketExecutionChainLoading(false);
    }
  }, []);

  const loadMarketSdkValidation = useCallback(async () => {
    setMarketSdkValidationLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; guide?: MarketSdkValidationGuide; error?: { message?: string } }>("/api/crypto/market-sdk-validation");
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load market SDK validation");
      setMarketSdkValidation((json.guide ?? json) as MarketSdkValidationGuide);
    } catch {
      setMarketSdkValidation(null);
    } finally {
      setMarketSdkValidationLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (netuid: number) => {
    setDetailLoading(true);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; subnet?: BittensorSubnetDetail; error?: { message?: string } }>(`/api/bittensor/subnets/${netuid}`);
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load subnet");
      setDetail(json.subnet as BittensorSubnetDetail);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async () => {
    const addr = watchAddress.trim();
    if (!addr) {
      setWallet(null);
      setWalletError(null);
      return;
    }
    if (!isValidSs58Address(addr)) {
      setWallet(null);
      setWalletError("Enter a valid SS58 public address.");
      return;
    }
    setWalletLoading(true);
    setWalletError(null);
    try {
      window.localStorage.setItem(WATCH_ADDRESS_KEY, addr);
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; wallet?: BittensorWalletSnapshot; error?: { message?: string } }>(`/api/bittensor/wallet/${encodeURIComponent(addr)}`);
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load wallet");
      setWallet(json.wallet as BittensorWalletSnapshot);
    } catch (err) {
      setWallet(null);
      setWalletError(formatBittensorProviderError(err));
    } finally {
      setWalletLoading(false);
    }
  }, [watchAddress]);

  const loadWalletTimeline = useCallback(async () => {
    const address = watchAddress.trim();
    setWalletTimelineLoading(true);
    try {
      const statusRequest = fetchMatterhornApiJson<{
        success?: boolean;
        status?: BittensorWalletTimelineStatus;
        error?: { message?: string };
      }>("/api/bittensor/wallet/timeline/status");
      const timelineRequest = isValidSs58Address(address)
        ? fetchMatterhornApiJson<{
            success?: boolean;
            timeline?: BittensorWalletTimelineExport;
            error?: { message?: string };
          }>(`/api/bittensor/wallet/timeline/export?ss58Address=${encodeURIComponent(address)}`)
        : null;
      const [statusResult, timelineResult] = await Promise.all([statusRequest, timelineRequest]);
      if (!statusResult.response.ok || !statusResult.json.success || !statusResult.json.status) {
        throw new Error(statusResult.json.error?.message ?? "Could not read wallet history status");
      }
      setWalletTimelineStatus(statusResult.json.status);
      if (timelineResult) {
        if (!timelineResult.response.ok || !timelineResult.json.success || !timelineResult.json.timeline) {
          throw new Error(timelineResult.json.error?.message ?? "Could not read wallet history");
        }
        setWalletTimeline(timelineResult.json.timeline);
      } else {
        setWalletTimeline(null);
      }
    } catch (timelineError) {
      setWalletTimelineStatus(null);
      setWalletTimeline(null);
      setWalletTimelineMessage(timelineError instanceof Error ? timelineError.message : "Could not read wallet history.");
    } finally {
      setWalletTimelineLoading(false);
    }
  }, [watchAddress]);

  const captureWalletTimelineSnapshot = useCallback(async () => {
    const address = watchAddress.trim();
    if (!isValidSs58Address(address)) return;
    setWalletTimelineAction("capture");
    setWalletTimelineMessage(null);
    try {
      const { response, json } = await fetchMatterhornApiJson<{
        success?: boolean;
        snapshot?: BittensorWalletTimelineSnapshot;
        wallet?: BittensorWalletSnapshot;
        error?: { message?: string };
      }>("/api/bittensor/wallet/timeline/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ss58Address: address }),
      });
      if (!response.ok || !json.success || !json.snapshot) {
        throw new Error(json.error?.message ?? "Could not save wallet snapshot");
      }
      if (json.wallet) setWallet(json.wallet);
      setWalletTimelineMessage(`Snapshot saved at ${new Date(json.snapshot.capturedAt).toLocaleString()}.`);
      await loadWalletTimeline();
    } catch (timelineError) {
      setWalletTimelineMessage(timelineError instanceof Error ? timelineError.message : "Could not save wallet snapshot.");
    } finally {
      setWalletTimelineAction(null);
    }
  }, [loadWalletTimeline, watchAddress]);

  const exportWalletTimeline = useCallback(async () => {
    const address = watchAddress.trim();
    if (!isValidSs58Address(address)) return;
    setWalletTimelineAction("export");
    setWalletTimelineMessage(null);
    try {
      const { response, json } = await fetchMatterhornApiJson<{
        success?: boolean;
        timeline?: BittensorWalletTimelineExport;
        error?: { message?: string };
      }>(`/api/bittensor/wallet/timeline/export?ss58Address=${encodeURIComponent(address)}`);
      if (!response.ok || !json.success || !json.timeline) {
        throw new Error(json.error?.message ?? "Could not export wallet history");
      }
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(json.timeline, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `bittensor-wallet-history-${address.slice(0, 8)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      setWalletTimeline(json.timeline);
      setWalletTimelineMessage(`Exported ${json.timeline.snapshots.length} public snapshot${json.timeline.snapshots.length === 1 ? "" : "s"}.`);
    } catch (timelineError) {
      setWalletTimelineMessage(timelineError instanceof Error ? timelineError.message : "Could not export wallet history.");
    } finally {
      setWalletTimelineAction(null);
    }
  }, [watchAddress]);

  const clearWalletTimeline = useCallback(async () => {
    const address = watchAddress.trim();
    if (!isValidSs58Address(address)) return;
    if (!confirmWalletTimelineClear) {
      setConfirmWalletTimelineClear(true);
      setWalletTimelineMessage("Press Clear history again to remove this public wallet history.");
      return;
    }
    setWalletTimelineAction("clear");
    setWalletTimelineMessage(null);
    try {
      const { response, json } = await fetchMatterhornApiJson<{
        success?: boolean;
        report?: { persistentSnapshotsCleared?: number };
        error?: { message?: string };
      }>("/api/bittensor/wallet/timeline/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ss58Address: address }),
      });
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? "Could not clear wallet history");
      const cleared = json.report?.persistentSnapshotsCleared ?? 0;
      setWalletTimelineMessage(`Cleared ${cleared} public snapshot${cleared === 1 ? "" : "s"}.`);
      setConfirmWalletTimelineClear(false);
      await loadWalletTimeline();
    } catch (timelineError) {
      setWalletTimelineMessage(timelineError instanceof Error ? timelineError.message : "Could not clear wallet history.");
    } finally {
      setWalletTimelineAction(null);
    }
  }, [confirmWalletTimelineClear, loadWalletTimeline, watchAddress]);

  useEffect(() => {
    loadSubnets();
  }, [loadSubnets]);

  useEffect(() => {
    void loadSidecarStatus();
    void loadReadiness();
    void loadCryptoReadiness();
    void loadMarketExecutionReadiness();
    void loadMarketExecutionChain();
    void loadMarketSdkValidation();
  }, [loadCryptoReadiness, loadMarketExecutionChain, loadMarketExecutionReadiness, loadMarketSdkValidation, loadReadiness, loadSidecarStatus]);

  useEffect(() => {
    if (selectedNetuid !== null) loadDetail(selectedNetuid);
  }, [loadDetail, selectedNetuid]);

  useEffect(() => {
    if (loadedSavedWatchAddress) return;
    setLoadedSavedWatchAddress(true);
    if (watchAddress.trim()) void loadWallet();
  }, [loadWallet, loadedSavedWatchAddress, watchAddress]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWalletTimeline(), 200);
    return () => window.clearTimeout(timer);
  }, [loadWalletTimeline]);

  useEffect(() => {
    setConfirmWalletTimelineClear(false);
    setWalletTimelineMessage(null);
  }, [watchAddress]);

  const filteredSubnets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subnets;
    return subnets.filter((subnet) =>
      `${subnet.netuid} ${subnet.name} ${subnet.symbol} ${subnet.category} ${subnet.benefitSummary}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, subnets]);

  const favoriteSubnets = useMemo(
    () => subnets.filter((subnet) => favorites.includes(subnet.netuid)),
    [favorites, subnets],
  );

  const recentSubnets = useMemo(
    () => [...subnets]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4),
    [subnets],
  );
  const customerDemoPrompts = useMemo(
    () => CUSTOMER_DEMO_PROMPTS.filter((item) => !BITTENSOR_BETA_MODE || item.betaVisible),
    [],
  );

  const toggleFavorite = (netuid: number) => {
    setFavorites((current) => {
      const next = current.includes(netuid)
        ? current.filter((item) => item !== netuid)
        : [...current, netuid];
      writeFavorites(next);
      return next;
    });
  };

  const requestQuote = async () => {
    setQuoteLoading(true);
    setQuote(null);
    try {
      const { response: res, json } = await fetchMatterhornApiJson<{ success?: boolean; quote?: BittensorActionQuote; error?: { message?: string } }>("/api/bittensor/actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          netuid: action === "transfer" ? null : Number(actionNetuid),
          amountTao,
          validatorHotkey,
          recipient,
        }),
      });
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to quote action");
      setQuote(json.quote as BittensorActionQuote);
    } catch (err) {
      setQuote({
        action,
        netuid: action === "transfer" ? null : Number(actionNetuid),
        amountTao: Number(amountTao) || null,
        expectedAlpha: null,
        feeTao: null,
        slippageBps: null,
        requiresExternalSignature: true,
        warnings: [err instanceof Error ? err.message : "Quote failed"],
      });
    } finally {
      setQuoteLoading(false);
    }
  };

  const refreshBittensor = () => {
    void loadSubnets();
    void loadSidecarStatus();
    void loadReadiness();
    void loadCryptoReadiness();
    void loadMarketExecutionReadiness();
    void loadMarketExecutionChain();
    void loadMarketSdkValidation();
    void loadWalletTimeline();
  };

  const sendToChat = async (
    prompt: string,
    context: Record<string, unknown>,
    options: { mode?: "bittensor" | "crypto"; source?: string; venue?: CryptoVenue } = {},
  ) => {
    const mode = options.mode ?? "bittensor";
    const promptVenue = options.venue ?? (mode === "bittensor" ? "bittensor" : undefined);
    const isBittensorHandoff = promptVenue === "bittensor";
    const expandedPrompt = isBittensorHandoff ? buildBittensorChatPrompt(prompt, context) : prompt;
    window.dispatchEvent(new CustomEvent(isBittensorHandoff ? "matterhorn:bittensor-chat-handoff" : "matterhorn:crypto-chat-handoff", {
      detail: {
        prompt: expandedPrompt,
        context,
        venue: promptVenue,
        source: options.source ?? "bittensor-panel",
      },
    }));
    setAgentPromptReady(true);
    window.setTimeout(() => setAgentPromptReady(false), 2000);
  };

  const copyCustomerDemoCommand = async (kind: keyof typeof CUSTOMER_DEMO_COMMANDS) => {
    await navigator.clipboard?.writeText(CUSTOMER_DEMO_COMMANDS[kind]);
    setCopiedCustomerCommand(kind);
    window.setTimeout(() => setCopiedCustomerCommand(null), 2000);
  };

  const copyMondayBetaScenarioCommand = async (scenarioId: string) => {
    const command = `node scripts/customer-demo-evidence-pack.mjs --scenario ${scenarioId} --output-dir ./tmp/monday-beta-evidence`;
    await navigator.clipboard?.writeText(command);
    setCopiedCustomerCommand(`monday-beta:${scenarioId}`);
    window.setTimeout(() => setCopiedCustomerCommand(null), 2000);
  };

  const askAgentAboutSubnet = async (subnet: BittensorSubnetSummary) => {
    const prompt = `Bittensor Agent task: Explain subnet ${subnet.netuid} (${subnet.name}) in beginner language, then tell me how it could help my Matterhorn Desks tasks. Include utility, risks, metagraph context, whether Matterhorn can directly invoke this subnet, and which actions require external Bittensor signing.`;
    await sendToChat(prompt, { netuid: subnet.netuid, subnet });
  };

  const askAgentAboutWallet = async () => {
    const address = watchAddress.trim();
    const prompt = wallet
      ? `Bittensor Agent task: Review this watch-only Bittensor wallet snapshot for ${address}. Explain TAO balance, subnet stake exposure, validator hotkeys, slippage risk, provider freshness, and safe next steps. Do not ask for seed phrases or private keys.`
      : `Bittensor Agent task: Help me inspect this Bittensor SS58 coldkey public address: ${address || "[paste address]"}. Show wallet positions, subnet exposure, validator hotkeys, and risks.`;
    await sendToChat(prompt, { ss58Address: address, wallet });
  };

  const askAgentAboutReadiness = async () => {
    const prompt = "Bittensor Agent task: Review the current Matterhorn Bittensor customer readiness status. Explain any failing or warning checks, the supported production boundaries, and the next command or fix to run before customer use.";
    await sendToChat(prompt, { readiness });
  };

  const askAgentAboutCryptoReadiness = async () => {
    const prompt = "Matterhorn protocol task: Review the current Matterhorn readiness status across Bittensor, Hyperliquid, and Polymarket. Explain blockers, warnings, safe demo paths, and the next command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
    await sendToChat(prompt, { cryptoReadiness }, { mode: "crypto", source: "crypto-readiness-panel" });
  };

  const askAgentAboutMarketExecutionReadiness = async () => {
    const prompt = "Matterhorn protocol task: Review the current Hyperliquid and Polymarket execution contract. Explain which agent/server controls are passing, how the separate connected-wallet tickets submit exact reviewed terms, which Polymarket buy, sell, and cancel actions are eligible, which cases remain external handoffs, and the next safe operator action. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
    await sendToChat(prompt, { marketExecutionReadiness }, { mode: "crypto", source: "market-execution-readiness-panel" });
  };

  const askAgentForCustomerDemo = async (item: (typeof CUSTOMER_DEMO_PROMPTS)[number]) => {
    await sendToChat(item.prompt, {
      ss58Address: watchAddress.trim() || undefined,
      wallet,
      readiness,
      cryptoReadiness,
      marketExecutionReadiness,
      marketExecutionChain,
      marketSdkValidation,
      sourcePrompt: item.id,
    }, { mode: "crypto", source: "crypto-customer-demo-checklist", venue: venueForPromptId(item.id) });
  };

  // Insert a beta agent task into the composer (never auto-sends).
  const askAgentBetaTryPrompt = async (item: (typeof BETA_TRY_PROMPTS)[number]) => {
    await sendToChat(item.prompt, {
      ss58Address: watchAddress.trim() || undefined,
      wallet,
      sourcePrompt: item.id,
    }, { mode: item.mode, source: "crypto-beta-try", venue: venueForPromptId(item.id) });
  };

  const askAgentForMondayBetaScenario = async (scenario: CustomerBetaDemoScenario) => {
    const prompt = [
      "Use Matterhorn guided test mode.",
      scenario.entryPrompt,
      "Keep all outputs public/redacted and customer-safe.",
      "Do not ask for seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, live market submission, or real funds.",
    ].join(" ");
    await sendToChat(prompt, {
      scenarioId: scenario.id,
      betaCustomers: scenario.assignedBetaCustomers,
      expectedArtifacts: scenario.expectedArtifacts.map((artifact) => artifact.name),
      evidenceCommand: `node scripts/customer-demo-evidence-pack.mjs --scenario ${scenario.id} --output-dir ./tmp/monday-beta-evidence`,
      safetyBoundaries: scenario.safetyBoundaries,
      ss58Address: watchAddress.trim() || undefined,
      wallet,
    }, { mode: mondayBetaScenarioMode(scenario), source: "monday-beta-panel" });
  };

  const askAgentForVenuePrompt = async (prompt: string, options: { source?: string } = {}) => {
    await sendToChat(prompt, {
      venue,
      ss58Address: watchAddress.trim() || undefined,
      wallet,
      readiness,
      cryptoReadiness,
      marketExecutionReadiness,
      marketExecutionChain,
      marketSdkValidation,
    }, {
      mode: venue === "bittensor" ? "bittensor" : "crypto",
      venue,
      source: options.source ?? `${venue}-workspace-panel`,
    });
  };

  const askAgentForStandardBittensorAction = async (item: (typeof BITTENSOR_STANDARD_ACTIONS)[number]) => {
    if (item.formAction) {
      setAction(item.formAction);
    }
    await sendToChat(item.prompt, {
      standardAction: item.id,
      action: item.formAction,
      ss58Address: watchAddress.trim() || undefined,
      netuid: Number.isFinite(Number(actionNetuid)) ? Number(actionNetuid) : undefined,
      amountTao: amountTao.trim() || undefined,
      validatorHotkey: validatorHotkey.trim() || undefined,
      recipient: recipient.trim() || undefined,
      destination: recipient.trim() || undefined,
      wallet,
    }, { source: "bittensor-standard-action", venue: "bittensor" });
  };

  const askAgentAboutQuote = async () => {
    if (!quote) return;
    const prompt = `Bittensor Agent task: Review this Bittensor ${quote.action} quote. Explain the consequence, netuid, amount, expected alpha, fee, slippage, warnings, and exactly what I must do in an external Bittensor-compatible signer before anything can be broadcast.`;
    await sendToChat(prompt, {
      action: quote.action,
      netuid: quote.netuid,
      amountTao: quote.amountTao,
      validatorHotkey,
      recipient,
      destination: recipient,
      quote,
    });
  };

  const readinessChecks = readiness?.checks ?? [];
  const readinessFailures = readinessChecks.filter((check) => check.status === "fail");
  const readinessNextAction = readiness?.nextActions?.find(Boolean) ?? null;
  const readinessState = readiness
    ? readiness.ready === true && readinessFailures.length === 0
      ? "Ready"
      : readinessFailures.length
        ? "Blocked"
        : "Review"
    : CHECK_PENDING_LABEL;
  const cryptoReadinessChecks = cryptoReadiness?.checks ?? [];
  const cryptoReadinessFailures = cryptoReadinessChecks.filter((check) => check.status === "fail");
  const cryptoReadinessWarnings = cryptoReadinessChecks.filter((check) => check.status === "warning" || check.status === "skip");
  const cryptoReadinessBlocker = cryptoReadiness?.blockers?.find(Boolean) ?? null;
  const cryptoReadinessNextAction = cryptoReadiness?.nextActions?.find(Boolean) ?? null;
  const localReadinessApiUnavailable = [...readinessChecks, ...cryptoReadinessChecks].some((check) =>
    check.id === "readiness_api" || check.id === "crypto_readiness_api",
  );
  const cryptoReadinessState = cryptoReadiness
    ? cryptoReadiness.ready === true && cryptoReadinessFailures.length === 0
      ? "Ready"
      : cryptoReadinessFailures.length
        ? "Blocked"
        : "Review"
    : CHECK_PENDING_LABEL;
  const hyperliquidReadinessState = readinessStateForVenue(cryptoReadinessChecks, "hyperliquid");
  const polymarketReadinessState = readinessStateForVenue(cryptoReadinessChecks, "polymarket");
  const marketExecutionControls = marketExecutionReadiness?.controls ?? [];
  const marketExecutionPassedControls = marketExecutionControls.filter((control) => control.status === "pass").length;
  const marketExecutionBlockedControls = marketExecutionControls.filter((control) => control.status === "blocked" || control.status === "fail").length;
  const marketExecutionNextAction = marketExecutionReadiness?.nextActions?.find(Boolean) ?? null;
  const marketExecutionSubmissionState = marketExecutionReadiness
    ? marketExecutionReadiness.readyForLiveSubmission
      ? "Wallet approved"
      : "No"
    : CHECK_PENDING_LABEL;
  const marketVenueState = (venueName: string): string => {
    const venue = marketExecutionReadiness?.venues?.find((item) => item.venue?.toLowerCase() === venueName);
    if (!venue) return CHECK_PENDING_LABEL;
    if (venue.canSubmit === true || venue.liveSubmissionEnabled === true) return "Wallet approved";
    return venue.blockedNow?.includes("live_submit") ? "Disabled" : "Review";
  };
  const marketExecutionChainStages = marketExecutionChain?.stages ?? [];
  const marketExecutionChainStageCount = marketExecutionChainStages.length ? String(marketExecutionChainStages.length) : CHECK_PENDING_LABEL;
  const marketExecutionChainSubmitState = marketExecutionChain?.safety?.canSubmit === false ? "No" : CHECK_PENDING_LABEL;
  const marketExecutionChainSignerState = marketExecutionChain?.safety?.externalSignerRequired === true ? "Required" : CHECK_PENDING_LABEL;
  const marketExecutionChainState = marketExecutionChain
    ? marketExecutionChain.safety?.liveSubmissionEnabled === false && marketExecutionChain.safety?.canSubmit === false
      ? "Safe"
      : "Review"
    : CHECK_PENDING_LABEL;
  const marketSdkValidationState = marketSdkValidation
    ? marketSdkValidation.safety?.liveSubmissionEnabled === false && marketSdkValidation.safety?.canSubmit === false
      ? "Safe"
      : "Review"
    : CHECK_PENDING_LABEL;
  const marketSdkValidationModeCount = marketSdkValidation?.modes?.length ? String(marketSdkValidation.modes.length) : CHECK_PENDING_LABEL;
  const marketSdkValidationSecretState = marketSdkValidation?.safety?.acceptsSecrets === false ? "No" : CHECK_PENDING_LABEL;
  const marketSdkValidationPrivateSdkState = marketSdkValidation?.safety?.runsPrivateSdkSigning === false && marketSdkValidation?.safety?.callsExchanges === false
    ? "No"
    : CHECK_PENDING_LABEL;
  const activeVenue = VENUE_DESKS[venue];
  const activeTransactionStatus = venue === "hyperliquid"
    ? marketExecutionReadiness?.reviewedWalletTickets.hyperliquid.available === true
      ? "Ready in connected wallet"
      : marketExecutionReadiness?.reviewedWalletTickets.hyperliquid.available === false
        ? "Preview only"
        : "Checking availability"
    : "Wallet approval required";
  const activeManifest = VENUE_PROTOCOL_MANIFESTS[venue];
  const activeManifestStatus = activeVenue.statusLabel;
  const activeManifestCanSubmit = activeVenue.canSubmit;
  const activeManifestLiveSubmission = activeVenue.liveSubmission;
  const activeManifestSigner = activeVenue.signer;
  const activeSafetyBadge = venue === "bittensor"
    ? "TAO transfer with wallet review"
    : venue === "hyperliquid"
      ? "Wallet approval required"
      : "Eligible buy, sell, or cancel with wallet approval";
  const activeSafetyCopy = venue === "bittensor"
    ? "Matterhorn can prepare exact TAO transfer, stake, and unstake calls for review and submission by your connected Bittensor wallet. Unsupported advanced calls stay unavailable until audited. Never paste seed phrases, private keys, mnemonics, or wallet exports."
    : venue === "hyperliquid"
      ? "Hyperliquid orders can submit only after you review the network, asset, side, size, price or slippage boundary, and reduce-only state, then sign the exact short-lived intent in your connected wallet. Matterhorn never accepts private keys or API secrets."
      : "Eligible Polymarket EOA buy, sell, and cancel actions can submit only after compliance passes and you authorize the exact action in a connected Polygon wallet. Proxy accounts, watches, and agents cannot submit. Matterhorn never accepts private keys, API secrets, raw signatures, signed payloads, or wallet exports.";

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain max-h-full bg-dls-canvas text-[15px] animate-fade-in [scrollbar-gutter:stable]"
      style={venueToneStyle(venue)}
    >
      <div className="bg-dls-surface p-4 shadow-[0_1px_0_rgb(var(--protocol-desk-rgb)/0.12)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProtocolMark venue={venue} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-dls-text">{activeVenue.workspaceTitle}</h2>
              <p className="text-[12px] leading-5 text-dls-secondary">
                {venue === "bittensor" && sidecarStatus?.configured ? "Subtensor sidecar ready" : activeManifestStatus}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text"
            onClick={refreshBittensor}
            disabled={loading || marketExecutionReadinessLoading || marketExecutionChainLoading || marketSdkValidationLoading}
            aria-label="Refresh protocol desk"
            title="Refresh protocol desk"
          >
            <RefreshCw className={cn("size-3.5", (loading || marketExecutionReadinessLoading || marketExecutionChainLoading || marketSdkValidationLoading) && "animate-spin")} />
          </Button>
        </div>
        <div className="mb-3 grid grid-cols-1 gap-1 rounded-lg bg-dls-surface-muted/35 p-1 sm:grid-cols-3">
          {(["bittensor", "hyperliquid", "polymarket"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                venue === item ? "bg-[var(--protocol-desk-accent)] text-[var(--matterhorn-ink)]" : "text-dls-secondary hover:bg-dls-hover/70 hover:text-dls-text",
              )}
              onClick={() => {
                setVenue(item);
                setTab("overview");
              }}
            >
              <span style={venueToneStyle(item)}>
                <ProtocolMark venue={item} compact />
              </span>
              {VENUE_DESKS[item].label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-dls-surface-muted/12 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className="size-4 shrink-0 text-[var(--protocol-desk-accent)]" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-dls-text">Safety & signing</div>
              <div className="truncate text-[11px] leading-5 text-dls-secondary">{activeSafetyBadge}</div>
            </div>
          </div>
          <Popover>
            <PopoverTrigger
              render={(
                <button
                  type="button"
                  aria-label={`${activeVenue.label} safety details`}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-dls-secondary transition-colors hover:bg-dls-hover/45 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              )}
            />
            <PopoverContent
              side="bottom"
              align="end"
              className="w-80 rounded-lg border border-dls-border bg-dls-surface p-3 text-left shadow-none"
            >
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-dls-text">{activeVenue.label} safety</div>
                  <p className="mt-1 text-xs leading-5 text-dls-secondary">{activeSafetyCopy}</p>
                </div>
                <div className="grid gap-1 text-xs">
                  {[
                    ["Can submit", activeManifestCanSubmit],
                    ["Live submission", activeManifestLiveSubmission],
                    ["External signer", activeManifestSigner],
                    ["Status", activeManifestStatus],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-dls-surface-muted/[0.08] px-2 py-1.5">
                      <span className="text-dls-secondary">{label}</span>
                      <span className="text-right font-medium text-dls-text">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="break-words text-[11px] leading-5 text-dls-secondary">
                  Allowed intents: {activeManifest.allowedIntents.join(", ")}.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <UnifiedWalletPanel
          venue={venue}
          watchAddress={watchAddress}
          wallet={wallet}
          executionAvailable={venue === "hyperliquid"
            ? marketExecutionReadiness?.reviewedWalletTickets.hyperliquid.available ?? null
            : true}
          onOpenAction={() => {
            if (venue === "bittensor") {
              setTab("wallet");
              return;
            }
            document.getElementById(`${venue}-trade-ticket`)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        />
        {venue === "bittensor" ? (
          <div className="mt-3 grid grid-cols-1 gap-1 rounded-lg bg-dls-surface-muted/35 p-1 sm:grid-cols-5">
            {[
              { key: "overview" as const, label: "Overview" },
              ...(BITTENSOR_BETA_MODE ? [{ key: "demo" as const, label: "Demo" }] : []),
              { key: "subnets" as const, label: "Subnets" },
              { key: "wallet" as const, label: "Wallet" },
              { key: "actions" as const, label: "Actions" },
            ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                tab === item.key ? "bg-[var(--protocol-desk-accent)] text-[var(--matterhorn-ink)]" : "text-dls-secondary hover:bg-dls-hover/60 hover:text-dls-text",
              )}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 p-4 pb-8 sm:p-5">
        {venue === "bittensor" && error && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Bittensor provider">
            {error}
          </Notice>
        )}

        {venue !== "bittensor" && (
          <div className="space-y-4">
            <Section title={activeVenue.workspaceTitle} icon={venue === "hyperliquid" ? <BarChart3 className="size-4" /> : <Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--protocol-desk-soft)] p-3">
                  <h3 className="text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Metric label="Interface" value={activeVenue.statusLabel} compact />
                  <Metric label="Transaction status" value={activeTransactionStatus} compact />
                  <Metric label="Signer" value={activeVenue.signer} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Source: {activeVenue.source}. {venue === "hyperliquid"
                    ? "Agent prompts prepare context only. To trade, use the order ticket below, review every field, and approve the exact intent in your connected wallet."
                    : "Ask the Polymarket Agent in plain English, review the prepared terms, then use the ticket below to authorize an eligible buy, sell, or cancel action in your connected Polygon wallet."}
                </p>
              </div>
            </Section>

            {venue === "hyperliquid" ? (
              <div id="hyperliquid-trade-ticket" className="scroll-mt-4">
                <Section title="Trade Hyperliquid" icon={<ArrowUpDown className="size-4" />}>
                  <HyperliquidTradeExecution
                    initialDraft={draftHandoff?.protocol === "hyperliquid" ? draftHandoff.draft : null}
                    guardedHandoff={guardedHandoff?.protocol === "hyperliquid" ? guardedHandoff : null}
                    initialOperation={initialOperation === "place_order" || initialOperation === "cancel_order" || initialOperation === "modify_order" || initialOperation === "close_position" ? initialOperation : null}
                    executionAvailable={marketExecutionReadiness?.reviewedWalletTickets.hyperliquid.available ?? null}
                    workspaceId={workspaceId}
                    sessionId={sessionId}
                  />
                </Section>
              </div>
            ) : null}

            {venue === "polymarket" ? (
              <div id="polymarket-trade-ticket" className="scroll-mt-4">
                <Section title="Trade Polymarket" icon={<ArrowUpDown className="size-4" />}>
                  <PolymarketTradeExecution
                    initialDraft={draftHandoff?.protocol === "polymarket" ? draftHandoff.draft : null}
                    guardedHandoff={guardedHandoff?.protocol === "polymarket" ? guardedHandoff : null}
                    initialOperation={initialOperation === "buy" || initialOperation === "sell" || initialOperation === "cancel" ? initialOperation : null}
                    workspaceId={workspaceId}
                    sessionId={sessionId}
                  />
                </Section>
              </div>
            ) : null}

            <Section title={venue === "hyperliquid" ? "Standard Hyperliquid actions" : "Standard Polymarket actions"} icon={<BrainCircuit className="size-4" />}>
              <p className="mb-3 text-xs leading-5 text-dls-secondary">
                These stage editable {activeVenue.label} Agent tasks in the composer. The full instruction stays editable before you send. Agent prompts never auto-execute.{" "}
                {venue === "hyperliquid"
                  ? "Orders require a separate review and wallet signature in the trade ticket."
                  : "Orders require a separate compliance-gated review and wallet authorization in the trade ticket."}
              </p>
              <div className="grid gap-2">
                {activeVenue.prompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-[var(--protocol-desk-soft)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--protocol-desk-rgb)/0.30)]"
                    onClick={() => void askAgentForVenuePrompt(item.prompt, { source: `${venue}-standard-action` })}
                  >
                    <span className="block text-xs font-semibold text-dls-text">{item.label}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-dls-secondary">{item.summary}</span>
                    <span className="mt-2 inline-flex rounded-md bg-[var(--protocol-desk-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--protocol-desk-accent)]">
                      Ask Agent -&gt;
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={venue === "hyperliquid" ? "Exchange safeguards" : "Market preview controls"} icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--protocol-desk-soft)] px-3 py-2.5">
                  <p className="text-xs font-semibold text-dls-text">{venue === "hyperliquid" ? "Wallet-authorized execution" : "Compliance-gated execution"}</p>
                  <p className="mt-1 text-[11px] leading-5 text-dls-secondary">
                    {venue === "hyperliquid"
                      ? "Every order is hash-bound to the reviewed terms, expires quickly, can submit once, and must be signed by the connected wallet. Mainnet also requires a typed live-order confirmation."
                      : "Eligible EOA buy, sell, and cancel actions can submit only after compliance passes and the connected Polygon wallet authorizes the exact action."}
                  </p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Metric label="Readiness" value={venue === "hyperliquid" ? hyperliquidReadinessState : polymarketReadinessState} compact />
                  <Metric label="Transaction status" value={activeTransactionStatus} compact />
                  <Metric label="SDK evidence" value={marketSdkValidationState} compact />
                </div>
                <Notice tone="info" icon={<Shield className="size-4" />} title="Execution boundary">
                  {venue === "hyperliquid"
                    ? "Matterhorn submits only a short-lived order intent that this server prepared and your connected wallet signed. It does not accept private keys, API secrets, arbitrary signed payloads, alternate exchange URLs, or automatic watch-triggered orders."
                    : "Matterhorn prepares the exact Polymarket action and checks compliance first. An eligible browser-wallet EOA must authorize each buy, sell, or cancel. Proxy accounts, watch-triggered orders, and unattended execution are not supported in this release."}
                </Notice>
                <details className="group rounded-md bg-dls-surface-muted/[0.10] px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--protocol-desk-rgb)/0.30)] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-dls-text">Developer tools</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">Copy CLI commands. Nothing runs automatically.</span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-dls-secondary group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs text-dls-secondary hover:bg-dls-hover/45 hover:text-dls-text" onClick={() => void copyCustomerDemoCommand(venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate")}>
                      <Copy className="size-3.5" />
                      {copiedCustomerCommand === (venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate") ? "Copied" : "Copy watch setup command"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs text-dls-secondary hover:bg-dls-hover/45 hover:text-dls-text" onClick={() => void copyCustomerDemoCommand("executionChainSignRequest")}>
                      <Copy className="size-3.5" />
                      {copiedCustomerCommand === "executionChainSignRequest" ? "Copied" : "Copy signer examples"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs text-dls-secondary hover:bg-dls-hover/45 hover:text-dls-text" onClick={() => void copyCustomerDemoCommand(venue === "hyperliquid" ? "hyperliquidWatchDigest" : "polymarketWatchDigest")}>
                      <Copy className="size-3.5" />
                      {copiedCustomerCommand === (venue === "hyperliquid" ? "hyperliquidWatchDigest" : "polymarketWatchDigest") ? "Copied" : "Copy watch digest command"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 text-xs text-dls-secondary hover:bg-dls-hover/45 hover:text-dls-text" onClick={() => void copyCustomerDemoCommand("sdkValidateFixture")}>
                      <Copy className="size-3.5" />
                      {copiedCustomerCommand === "sdkValidateFixture" ? "Copied" : "Copy SDK check command"}
                    </Button>
                  </div>
                </details>
              </div>
            </Section>
          </div>
        )}

        {venue === "bittensor" && tab === "overview" && (
          <div className="space-y-4">
            <Section title="Bittensor workspace" icon={<BrainCircuit className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-lg bg-[var(--protocol-desk-soft)] p-3">
                  <h3 className="text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Metric label="Interface" value={activeVenue.statusLabel} compact />
                  <Metric label="Signing" value={activeVenue.signer} compact />
                  <Metric label="Wallet input" value="Public SS58" compact />
                  <Metric label="Custody" value="Never" compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Use this desk for TAO balance reads, subnet discovery, validator comparison, watchlists, receipts, and reviewed transfer, stake, or unstake calls. Matterhorn never asks for seed phrases, private keys, mnemonics, or wallet exports.
                </p>
              </div>
            </Section>
            <Section title="Standard Bittensor actions" icon={<ListChecks className="size-4" />}>
              <p className="mb-3 text-sm leading-6 text-dls-secondary">
                These are the core Bittensor workflows Matterhorn should make easy. Each one stages an editable Bittensor Agent task with public context; nothing auto-sends, signs, broadcasts, stakes, unstakes, transfers, or asks for wallet secrets.
              </p>
              <BittensorStandardActionList onAction={(item) => void askAgentForStandardBittensorAction(item)} />
            </Section>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
              <Metric label="Subnets" value={subnets.length ? String(subnets.length) : "—"} />
              <Metric label="Favorites" value={String(favorites.length)} />
              <Metric label="Source" value={subnets.some((s) => s.source === "tao.app") ? "Live" : "Fallback"} />
              <Metric
                label="Sidecar"
                value={sidecarStatus?.status === "healthy" ? "Healthy" : sidecarStatus?.status === "unreachable" ? "Unreachable" : "Off"}
              />
            </div>
            {sidecarStatus?.status === "unreachable" ? (
              <p className="text-xs leading-5 text-amber-300">{sidecarStatus.message}</p>
            ) : null}

            <Section title="Watched Wallet" icon={<Wallet className="size-4" />}>
              {watchAddress.trim() ? (
                <div className="space-y-2">
                  <div className="font-mono text-sm text-dls-text break-all">{watchAddress.trim()}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="TAO" value={formatNumber(wallet?.taoBalance)} compact />
                    <Metric label="Stake" value={formatNumber(wallet?.estimatedValueTao)} compact />
                  </div>
                  {wallet?.providerStatus === "provider_unavailable" && (
                    <p className="text-xs text-amber-300">{wallet.message ?? "Portfolio provider unavailable."}</p>
                  )}
                  <details className="group rounded-md bg-dls-surface-muted/[0.10] px-3 py-2">
                    <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--protocol-desk-rgb)/0.30)] [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-dls-text">Public wallet history</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">
                          {walletTimelineLoading
                            ? "Checking history…"
                            : walletTimelineStatus?.enabled
                              ? `${walletTimeline?.snapshots.length ?? 0} saved for this address`
                              : "Off until public snapshot persistence is enabled"}
                        </span>
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 text-dls-secondary transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 space-y-2 pt-2">
                      <p className="text-[11px] leading-4 text-dls-secondary">
                        Stores public, watch-only balance and stake snapshots. Matterhorn never stores keys, seed phrases, or signatures here.
                      </p>
                      {walletTimelineStatus?.enabled ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Metric label="Snapshots" value={String(walletTimeline?.snapshots.length ?? 0)} compact />
                          <Metric
                            label="Latest"
                            value={walletTimeline?.snapshots.at(-1)?.capturedAt
                              ? new Date(walletTimeline.snapshots.at(-1)?.capturedAt ?? "").toLocaleDateString()
                              : "Not saved"}
                            compact
                          />
                        </div>
                      ) : (
                        <p className="rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] leading-4 text-amber-200">
                          Wallet history is unavailable on this deployment. Existing wallet reads remain available.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={!walletTimelineStatus?.enabled || walletTimelineAction !== null}
                          onClick={() => void captureWalletTimelineSnapshot()}
                        >
                          {walletTimelineAction === "capture" ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                          Save snapshot
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={!walletTimeline?.snapshots.length || walletTimelineAction !== null}
                          onClick={() => void exportWalletTimeline()}
                        >
                          {walletTimelineAction === "export" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                          Export JSON
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn("h-8", confirmWalletTimelineClear && "text-red-300 hover:text-red-200")}
                          disabled={!walletTimeline?.snapshots.length || walletTimelineAction !== null}
                          onClick={() => void clearWalletTimeline()}
                        >
                          {walletTimelineAction === "clear" ? <Loader2 className="size-3.5 animate-spin" /> : <CircleX className="size-3.5" />}
                          {confirmWalletTimelineClear ? "Confirm clear" : "Clear history"}
                        </Button>
                      </div>
                      {walletTimelineMessage ? (
                        <p className="text-[11px] leading-4 text-dls-secondary" role="status" aria-live="polite">
                          {walletTimelineMessage}
                        </p>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-sm text-dls-secondary">No Bittensor watch address saved.</p>
              )}
            </Section>

            <Section title="Favorites" icon={<Star className="size-4" />}>
              {favoriteSubnets.length ? (
                <div className="space-y-2">
                  {favoriteSubnets.map((subnet) => (
                    <SubnetRow
                      key={subnet.netuid}
                      subnet={subnet}
                      selected={selectedNetuid === subnet.netuid}
                      favorite
                      onSelect={() => {
                        setSelectedNetuid(subnet.netuid);
                        setTab("subnets");
                      }}
                      onFavorite={() => toggleFavorite(subnet.netuid)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-dls-secondary">No favorite subnets yet.</p>
              )}
            </Section>

            <Section title="Recent Subnets" icon={<Database className="size-4" />}>
              <div className="space-y-2">
                {recentSubnets.map((subnet) => (
                  <SubnetRow
                    key={subnet.netuid}
                    subnet={subnet}
                    selected={selectedNetuid === subnet.netuid}
                    favorite={favorites.includes(subnet.netuid)}
                    onSelect={() => {
                      setSelectedNetuid(subnet.netuid);
                      setTab("subnets");
                    }}
                    onFavorite={() => toggleFavorite(subnet.netuid)}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}

        {BITTENSOR_BETA_MODE && venue === "bittensor" && tab === "demo" && (
          <div className="space-y-4">
            <Section title="Ask Agent ->" icon={<BrainCircuit className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Pick a task to stage it in the composer. Nothing sends automatically; review it, then press send. Public reads work without connecting an EVM wallet.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BETA_TRY_PROMPTS.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    size="sm"
                    className="h-auto min-w-0 justify-start whitespace-normal break-words py-2 text-left text-xs"
                    onClick={() => void askAgentBetaTryPrompt(item)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Guided test scenarios" icon={<Star className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Use these five operator scripts to verify customer journeys. Each task is editable and each evidence command is fixture/offline unless you supply public inputs.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {MONDAY_BETA_DEMO_SCENARIOS.map((scenario) => {
                  const copied = copiedCustomerCommand === `monday-beta:${scenario.id}`;
                  return (
                    <div key={scenario.id} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-dls-text">{scenario.displayName}</p>
                          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{scenario.targetCustomerPersona}</p>
                        </div>
                        <span className="rounded-md bg-dls-card px-2 py-0.5 text-[9px] font-medium text-dls-secondary">
                          {scenario.status === "demo_ready" ? "Demo-ready" : scenario.status === "preview_only" ? "Preview only" : "Planned, not live"}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-dls-secondary">
                        <span className="font-medium text-dls-text">Customers:</span> {scenario.assignedBetaCustomers.join(", ")}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-dls-secondary">
                        <span className="font-medium text-dls-text">Artifacts:</span> {scenario.expectedArtifacts.slice(0, 3).map((artifact) => artifact.name).join(", ")}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => void askAgentForMondayBetaScenario(scenario)}>
                          Stage demo task
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyMondayBetaScenarioCommand(scenario.id)}>
                          {copied ? "Copied" : "Copy evidence command"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Release test checklist" icon={<Shield className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Run this launch-room checklist before customer use. Every command is local, public/redacted, and evidence-oriented; none signs, submits, custodies, or broadcasts.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {MONDAY_BETA_LAUNCH_CHECKLIST.map((item) => {
                  const copied = copiedCustomerCommand === item.commandKey;
                  return (
                    <div key={item.id} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-dls-text">{item.title}</p>
                          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{item.proof}</p>
                        </div>
                        <span className="rounded-md bg-[rgb(var(--matterhorn-blue-rgb)/0.12)] px-2 py-0.5 text-[9px] font-medium text-sky-200">
                          {item.owner}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-auto w-full justify-start whitespace-normal break-words text-left text-xs text-dls-secondary"
                        onClick={() => void copyCustomerDemoCommand(item.commandKey)}
                      >
                        {copied ? "Copied" : "Copy launch check"}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Notice tone="info" icon={<Shield className="size-4" />} title="Release boundary">
                Agents prepare drafts only. Connected-wallet tickets can submit reviewed Bittensor transfer/stake/unstake calls, Hyperliquid actions, and eligible Polymarket buy/sell/cancel actions. Longevity remains a separate, non-medical workflow.
              </Notice>
            </Section>

            <Section title="Safety status" icon={<Shield className="size-4" />}>
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Public reads and reviewed TAO transfer, stake, and unstake calls. The connected wallet signs; Matterhorn never holds keys.
                  </p>
                </div>
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Hyperliquid</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Manual execution is available in the trade ticket after exact-order review and connected-wallet approval. Agent prompts and watches never auto-submit.
                  </p>
                </div>
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Polymarket</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Eligible EOA buy, sell, and cancel actions require compliance checks, exact review, and connected Polygon wallet authorization.
                  </p>
                </div>
                <p className="break-words text-[11px] leading-5 text-dls-secondary">
                  Matterhorn never custodies keys or signs silently. Agents and watches cannot submit; each supported action requires a separate, short-lived wallet approval.
                </p>
              </div>
            </Section>

            <Section title="Evidence / QA" icon={<Database className="size-4" />}>
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Customer readiness smoke</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm smoke:customer-ready-crypto</code>
                </div>
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor beta packet</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm beta:bittensor:packet</code>
                </div>
                <div className="min-w-0 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Market SDK validation evidence</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">matterhorn-work crypto sdk-validate-public --mode fixture</code>
                </div>
              </div>
            </Section>

            <Section title="Readiness" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label={BITTENSOR_BETA_MODE ? "Bittensor Beta" : "Bittensor"} value={readinessState} compact />
                  <Metric label="Hyperliquid" value={hyperliquidReadinessState} compact />
                  <Metric label="Polymarket" value={polymarketReadinessState} compact />
                  <Metric label="All-protocol smoke" value={cryptoReadinessState} compact />
                </div>
                {BITTENSOR_BETA_MODE ? (
                  <p className="text-xs leading-5 text-sky-200">
                    Bittensor beta boundary: market desks are hidden in Bittensor-only mode. Connected-wallet transfer, stake, and unstake calls remain explicit, one-at-a-time actions.
                  </p>
                ) : null}
                {cryptoReadinessBlocker ? (
                  <p className="text-xs leading-5 text-red-300">Blocker: {cryptoReadinessBlocker}</p>
                ) : cryptoReadinessFailures[0] ? (
                  <p className="text-xs leading-5 text-red-300">{cryptoReadinessFailures[0].label ?? "Protocol readiness"}: {cryptoReadinessFailures[0].summary ?? "Needs attention before production use."}</p>
                ) : cryptoReadinessWarnings[0] ? (
                  <p className="text-xs leading-5 text-amber-300">{cryptoReadinessWarnings[0].label ?? "Protocol readiness"}: {cryptoReadinessWarnings[0].summary ?? "Review before production use."}</p>
                ) : cryptoReadiness?.ready && readiness?.ready ? (
                  <p className="text-xs leading-5 text-emerald-300">Protocol readiness is green within each desk boundary: Bittensor reviewed transfer/stake/unstake calls, Hyperliquid wallet-approved actions, and eligible Polymarket buy/sell/cancel actions.</p>
                ) : (
                  <p className="text-xs leading-5 text-dls-secondary">Check readiness before customer use.</p>
                )}
                {cryptoReadinessNextAction || readinessNextAction ? (
                  <p className="text-xs leading-5 text-sky-200">Next: {cryptoReadinessNextAction ?? readinessNextAction}</p>
                ) : null}
                {localReadinessApiUnavailable ? (
                  <Notice tone="info" icon={<Shield className="size-4" />} title="Local API check">
                    The protocol desks are installed, but the desktop panel cannot reach the local readiness API yet. This usually means the Matterhorn Desks server/auth token is still starting or stale; restart or reconnect, then refresh. You can still copy the evidence commands below for a terminal check.
                  </Notice>
                ) : null}
                {/* Right-rail command groups stay single-column; viewport breakpoints are too wide for this side panel. */}
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={refreshBittensor} disabled={readinessLoading || cryptoReadinessLoading || marketExecutionReadinessLoading || marketSdkValidationLoading} aria-label="Refresh readiness" title="Refresh readiness">
                    {readinessLoading || cryptoReadinessLoading || marketExecutionReadinessLoading || marketSdkValidationLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutReadiness} disabled={!readiness}>
                    <BrainCircuit className="size-3.5" />
                    Bittensor Agent
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutCryptoReadiness} disabled={!cryptoReadiness}>
                    <BrainCircuit className="size-3.5" />
                    Protocol Agent
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Desktop release checks" icon={<ExternalLink className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  First-run test path: build an unsigned local DMG/ZIP, run the desktop release doctor, then capture install, launch, readiness, and safety evidence before customer use.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Bittensor: Read, prepare, and transfer</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Connected-wallet TAO transfer, stake, and unstake calls; unsupported advanced calls stay unavailable.</p>
                  </div>
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Markets: Wallet-approved trading</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Hyperliquid and eligible Polymarket buy, sell, and cancel actions require exact review and a fresh wallet approval.</p>
                  </div>
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Longevity workflow: Standalone</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Client-safe plans and packets. Not Web3, not medical advice, and no live payments or email.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("desktopInstallGuide")}>
                    {copiedCustomerCommand === "desktopInstallGuide" ? "Copied" : "Open install guide"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("desktopTesterArtifact")}>
                    {copiedCustomerCommand === "desktopTesterArtifact" ? "Copied" : "Copy tester build"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("desktopBetaDoctor")}>
                    {copiedCustomerCommand === "desktopBetaDoctor" ? "Copied" : "Copy doctor"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Execution readiness" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Ready for live submission" value={marketExecutionSubmissionState} compact />
                  <Metric label="Hyperliquid agent route" value={marketVenueState("hyperliquid")} compact />
                  <Metric label="Polymarket agent route" value={marketVenueState("polymarket")} compact />
                  <Metric label="Hyperliquid ticket" value="Wallet approved" compact />
                  <Metric label="Polymarket ticket" value="Eligible buy/sell/cancel" compact />
                  <Metric label="Controls" value={marketExecutionControls.length ? `${marketExecutionPassedControls}/${marketExecutionControls.length}` : "Unknown"} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Agent artifacts never submit. Separate wallet tickets can submit exact, expiring Hyperliquid actions and eligible Polymarket buy, sell, and cancel actions after compliance and connected-wallet authorization.
                </p>
                {marketExecutionBlockedControls > 0 ? (
                  <p className="text-xs leading-5 text-amber-300">
                    {marketExecutionBlockedControls} execution control{marketExecutionBlockedControls === 1 ? "" : "s"} still require review or intentionally block unsupported execution paths.
                  </p>
                ) : null}
                {marketExecutionNextAction ? (
                  <p className="text-xs leading-5 text-sky-200">Next: {marketExecutionNextAction}</p>
                ) : null}
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={loadMarketExecutionReadiness} disabled={marketExecutionReadinessLoading} aria-label="Refresh execution readiness" title="Refresh execution readiness">
                    {marketExecutionReadinessLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutMarketExecutionReadiness} disabled={!marketExecutionReadiness}>
                    <BrainCircuit className="size-3.5" />
                    Market Agent
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => void copyCustomerDemoCommand("executionReadiness")}>
                    {copiedCustomerCommand === "executionReadiness" ? "Copied" : "Execution CLI"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Execution chain" icon={<ExternalLink className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Chain API" value={marketExecutionChainState} compact />
                  <Metric label="Stages" value={marketExecutionChainStageCount} compact />
                  <Metric label="External signer" value={marketExecutionChainSignerState} compact />
                  <Metric label="Can submit" value={marketExecutionChainSubmitState} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Testnet-only path: preview -&gt; external-signer request -&gt; redacted artifact validation -&gt; public receipt import. Each step is public/redacted and hash-bound before it can become customer evidence.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    ["Preview / handoff", "Build a no-submit plan with Can submit: No and Live submission: Off."],
                    ["External-signer request", "Create public metadata for an operator-owned testnet signer only."],
                    ["Validate artifact", "Accept public/redacted metadata; reject raw signatures, signed payloads, secrets, and hash mismatches."],
                    ["Receipt import", "Attach public status or transaction evidence without private execution material."],
                  ].map(([label, description]) => (
                    <div key={label} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                      <p className="text-xs font-semibold text-dls-text">{label}</p>
                      <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{description}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={loadMarketExecutionChain} disabled={marketExecutionChainLoading} aria-label="Refresh execution chain" title="Refresh execution chain">
                    {marketExecutionChainLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChain")}>
                    {copiedCustomerCommand === "executionChain" ? "Copied" : "Chain CLI"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainApi")}>
                    {copiedCustomerCommand === "executionChainApi" ? "Copied" : "Chain API"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainSignRequest")}>
                    {copiedCustomerCommand === "executionChainSignRequest" ? "Copied" : "Signer request"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainArtifact")}>
                    {copiedCustomerCommand === "executionChainArtifact" ? "Copied" : "Validate artifact"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainReceipt")}>
                    {copiedCustomerCommand === "executionChainReceipt" ? "Copied" : "Receipt import"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="SDK validation" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="SDK API" value={marketSdkValidationState} compact />
                  <Metric label="Modes" value={marketSdkValidationModeCount} compact />
                  <Metric label="Secrets accepted" value={marketSdkValidationSecretState} compact />
                  <Metric label="Private SDK run" value={marketSdkValidationPrivateSdkState} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Official SDK validation is public/redacted evidence only. Fixture mode runs in CI; operator-owned testnet mode validates Hyperliquid testnet and Polygon Amoy artifacts without sending keys, API secrets, raw signatures, signed payloads, wallet exports, or live orders to Matterhorn.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={loadMarketSdkValidation} disabled={marketSdkValidationLoading} aria-label="Refresh SDK validation" title="Refresh SDK validation">
                    {marketSdkValidationLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("sdkValidationApi")}>
                    {copiedCustomerCommand === "sdkValidationApi" ? "Copied" : "SDK API"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("sdkDoctor")}>
                    {copiedCustomerCommand === "sdkDoctor" ? "Copied" : "SDK doctor"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("sdkValidateFixture")}>
                    {copiedCustomerCommand === "sdkValidateFixture" ? "Copied" : "Fixture validate"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("sdkValidateTestnet")}>
                    {copiedCustomerCommand === "sdkValidateTestnet" ? "Copied" : "Testnet validate"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("sdkLoop")}>
                    {copiedCustomerCommand === "sdkLoop" ? "Copied" : "SDK loop"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Ask Agent ->" icon={<BrainCircuit className="size-4" />}>
              <div className="grid gap-2">
                {customerDemoPrompts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-dls-hover"
                    onClick={() => void askAgentForCustomerDemo(item)}
                  >
                    <span className="block text-xs font-semibold text-dls-text">{item.label}</span>
                    <span className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Market watches" icon={<AlertTriangle className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  Hyperliquid and Polymarket watches are read-only alert plans. They check public market/account context, surface watch_alert cards, and never sign, submit, custody, broadcast, or auto-execute orders.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Hyperliquid watches</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">
                      Funding, price/orderbook, position margin, open orders, and market availability. Alert actions are review-only alert actions.
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("hyperliquidWatchCreate")}>
                        {copiedCustomerCommand === "hyperliquidWatchCreate" ? "Copied" : "Create HL watch"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("hyperliquidWatchCheck")}>
                        {copiedCustomerCommand === "hyperliquidWatchCheck" ? "Copied" : "Check HL watches"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("hyperliquidWatchDigest")}>
                        {copiedCustomerCommand === "hyperliquidWatchDigest" ? "Copied" : "Digest HL watches"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("hyperliquidWatchAct")}>
                        {copiedCustomerCommand === "hyperliquidWatchAct" ? "Copied" : "Act HL alert"}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Polymarket watches</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">
                      Market status, odds/liquidity movement, compliance block state, and public receipt/status changes. Alert actions are review-only alert actions.
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("polymarketWatchCreate")}>
                        {copiedCustomerCommand === "polymarketWatchCreate" ? "Copied" : "Create PM watch"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("polymarketWatchCheck")}>
                        {copiedCustomerCommand === "polymarketWatchCheck" ? "Copied" : "Check PM watches"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("polymarketWatchDigest")}>
                        {copiedCustomerCommand === "polymarketWatchDigest" ? "Copied" : "Digest PM watches"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("polymarketWatchAct")}>
                        {copiedCustomerCommand === "polymarketWatchAct" ? "Copied" : "Act PM alert"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Evidence" icon={<Database className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  Copy customer-safe commands for smoke, route contracts, live public QA, customer packet, and evidence verification.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("smoke")}>
                    {copiedCustomerCommand === "smoke" ? "Copied" : "Smoke"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("signArtifactRoutes")}>
                    {copiedCustomerCommand === "signArtifactRoutes" ? "Copied" : "Route contract"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("livePublicQa")}>
                    {copiedCustomerCommand === "livePublicQa" ? "Copied" : "Live public QA"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("packet")}>
                    {copiedCustomerCommand === "packet" ? "Copied" : "Customer packet"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("evidenceVerify")}>
                    {copiedCustomerCommand === "evidenceVerify" ? "Copied" : "Evidence verify"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("readiness")}>
                    {copiedCustomerCommand === "readiness" ? "Copied" : "Readiness CLI"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("readinessApi")}>
                    {copiedCustomerCommand === "readinessApi" ? "Copied" : "Readiness API"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("executionReadiness")}>
                    {copiedCustomerCommand === "executionReadiness" ? "Copied" : "Execution CLI"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("executionReadinessApi")}>
                    {copiedCustomerCommand === "executionReadinessApi" ? "Copied" : "Execution API"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("executionChainApi")}>
                    {copiedCustomerCommand === "executionChainApi" ? "Copied" : "Chain API"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Safety" icon={<Shield className="size-4" />}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  "Non-custodial",
                  "Automatic execution off",
                  "Wallet approval per action",
                  "Polymarket compliance gate",
                  "Bittensor actions require connected-wallet approval",
                ].map((item) => (
                  <div key={item} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-dls-secondary">
                No seed phrases, private keys, API secrets, raw signatures, arbitrary signed payloads, wallet exports, custody, or automatic execution.
              </p>
              <p className="mt-2 text-xs leading-5 text-dls-secondary">
                Every supported transfer or trade uses a separate reviewed ticket and connected-wallet approval. Unsupported advanced Bittensor calls and Polymarket proxy-account flows stay unavailable.
              </p>
              {BITTENSOR_BETA_MODE ? (
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  In Bittensor-only mode, the market desks remain hidden from the customer launch surface.
                </p>
              ) : null}
            </Section>
          </div>
        )}

        {venue === "bittensor" && tab === "subnets" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-dls-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-dls-text">All Bittensor subnets</div>
                  <div className="mt-0.5 text-xs text-dls-secondary">
                    Dynamic subnet list from the Matterhorn Bittensor API. {filteredSubnets.length} shown from {subnets.length || "0"} loaded subnets.
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text" onClick={loadSubnets} disabled={loading} aria-label="Refresh subnet list" title="Refresh subnet list">
                  <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                </Button>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                <Search className="size-4 text-dls-secondary" />
                <span className="sr-only">Search Bittensor subnets</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search by netuid, name, symbol, category, or utility"
                  className="min-w-0 flex-1 bg-transparent text-sm text-dls-text outline-none placeholder:text-dls-secondary"
                />
              </label>
              {loading ? (
                <LoadingLabel label="Loading subnets" />
              ) : error && subnets.length === 0 ? (
                <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Subnet list unavailable">
                  The subnet browser is live-data backed, not hardcoded. Reconnect the Matterhorn Desks server or refresh this desk, then the full subnet list will appear here with search by netuid, name, symbol, category, or utility.
                </Notice>
              ) : filteredSubnets.length === 0 ? (
                <Notice tone="info" icon={<Search className="size-4" />} title="No matching subnets">
                  Clear the search or try a category like image, data, inference, validator, or compute.
                </Notice>
              ) : (
                <div className="mt-3 grid gap-1">
                  {filteredSubnets.map((subnet) => (
                    <SubnetRow
                      key={subnet.netuid}
                      subnet={subnet}
                      selected={selectedNetuid === subnet.netuid}
                      favorite={favorites.includes(subnet.netuid)}
                      onSelect={() => setSelectedNetuid(subnet.netuid)}
                      onFavorite={() => toggleFavorite(subnet.netuid)}
                    />
                  ))}
                </div>
              )}
            </div>
            <SubnetDetailCard
              detail={detail}
              loading={detailLoading}
              agentPromptReady={agentPromptReady}
              onAskAgent={askAgentAboutSubnet}
            />
          </div>
        )}

        {venue === "bittensor" && tab === "wallet" && (
          <div className="space-y-4">
            <Section title="Watch Coldkey" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <input
                  value={watchAddress}
                  onChange={(event) => {
                    setWatchAddress(event.currentTarget.value);
                    setWalletError(null);
                  }}
                  placeholder="SS58 coldkey public address"
                  className="h-11 w-full rounded-lg bg-dls-surface-muted/40 px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary focus:ring-2 focus:ring-[rgb(var(--protocol-desk-rgb)/0.32)]"
                />
                <Button className="w-full gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={loadWallet} disabled={walletLoading}>
                  {walletLoading ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                  Watch Address
                </Button>
                <Button variant="outline" className="w-full gap-1.5" onClick={askAgentAboutWallet} disabled={!watchAddress.trim()}>
                  <BrainCircuit className="size-4" />
                  {agentPromptReady ? "Task ready" : "Ask Agent"}
                </Button>
                {walletError && <p className="text-xs text-red-300">{walletError}</p>}
              </div>
            </Section>

            {wallet && (
              <Section title="Wallet Snapshot" icon={<Wallet className="size-4" />}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="TAO balance" value={formatNumber(wallet.taoBalance)} compact />
                    <Metric label="Total TAO value" value={formatNumber(wallet.estimatedValueTao)} compact />
                  </div>
                  {wallet.providerStatus === "provider_unavailable" && (
                    <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Provider unavailable">
                      {wallet.message ?? "Wallet portfolio data is unavailable."}
                    </Notice>
                  )}
                  <div className="space-y-2">
                    {wallet.stakePositions.map((position) => (
                      <div key={`${position.netuid}:${position.validatorHotkey}`} className="rounded-lg bg-dls-surface-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-dls-text">{position.subnetName}</div>
                            <div className="text-xs text-dls-secondary">Subnet {position.netuid}</div>
                          </div>
                          <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-300">
                            {position.slippageRisk}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Metric label="Alpha" value={formatNumber(position.alphaAmount)} compact />
                          <Metric label="TAO value" value={formatNumber(position.taoValue)} compact />
                        </div>
                        <div className="mt-2 text-[11px] text-dls-secondary">
                          Validator hotkey: <span className="font-mono">{shortAddress(position.validatorHotkey)}</span>
                        </div>
                      </div>
                    ))}
                    {wallet.stakePositions.length === 0 && wallet.providerStatus === "ok" && (
                      <p className="text-sm text-dls-secondary">No subnet stake positions returned.</p>
                    )}
                  </div>
                </div>
              </Section>
            )}
          </div>
        )}

        {venue === "bittensor" && tab === "actions" && (
          <div className="space-y-4">
            <Notice tone="info" icon={<Shield className="size-4" />} title="Reviewed Bittensor actions">
              Transfer, stake, and unstake calls can be reviewed and submitted through a connected Bittensor wallet. Advanced calls remain external-signer handoffs until their runtime contracts are audited.
            </Notice>
            <Section title="Standard Bittensor actions" icon={<ListChecks className="size-4" />}>
              <div className="space-y-3">
                <p className="text-sm leading-6 text-dls-secondary">
                  Start from the common Bittensor workflows below. These stage an editable Bittensor Agent task with public context;
                  they do not auto-send, sign, broadcast, stake, unstake, transfer, or ask for wallet secrets.
                </p>
                <BittensorStandardActionList onAction={(item) => void askAgentForStandardBittensorAction(item)} />
              </div>
            </Section>
            <Section title="Transfer and stake" icon={<Wallet className="size-4" />}>
              <BittensorConnectedWalletExecution
                initialDraft={draftHandoff?.protocol === "bittensor" ? draftHandoff.draft : null}
                guardedHandoff={guardedHandoff?.protocol === "bittensor" ? guardedHandoff : null}
                initialOperation={initialOperation === "transfer" || initialOperation === "stake" || initialOperation === "unstake" ? initialOperation : null}
                workspaceId={workspaceId}
                sessionId={sessionId}
              />
            </Section>
            <Section title="Agent preview and validator comparison" icon={<ArrowUpDown className="size-4" />}>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-lg bg-[var(--protocol-desk-soft)] px-3 py-2.5 text-xs leading-5 text-dls-secondary">
                    <div className="font-semibold text-[var(--protocol-desk-accent)]">How this works</div>
                    <div className="mt-1">
                      Use this research preview to compare validators or inspect expected stake effects. To submit transfer, stake,
                      or unstake, use the connected-wallet ticket above; Matterhorn never auto-signs or auto-submits.
                    </div>
                  </div>
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5 text-xs leading-5 text-dls-secondary">
                    <div className="font-semibold text-dls-text">Public fields only</div>
                    <ul className="mt-1.5 space-y-1">
                      <li>Use netuid, amount, validator hotkey, or SS58 public address.</li>
                      <li>Never paste seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.</li>
                      <li>Ask the Bittensor Agent to review the preview before signing externally.</li>
                    </ul>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-dls-surface-muted/30 p-1">
                  {(["stake", "unstake", "compare"] as ActionType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "rounded-md px-3 py-1.5 text-left text-xs font-semibold capitalize transition-colors",
                        action === item
                          ? "bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)]"
                          : "text-dls-secondary hover:bg-dls-hover/40 hover:text-dls-text",
                      )}
                      onClick={() => setAction(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput label="Subnet netuid" value={actionNetuid} onChange={setActionNetuid} hint="Example: 14. A subnet is the Bittensor market you are acting in." />
                  {action !== "compare" && (
                    <LabeledInput label="Amount TAO" value={amountTao} onChange={setAmountTao} hint="The amount to preview. This is not submitted from Matterhorn." />
                  )}
                  {(action === "stake" || action === "unstake") && (
                    <LabeledInput label="Validator hotkey" value={validatorHotkey} onChange={setValidatorHotkey} hint="Paste a public validator hotkey. Never paste a seed phrase or private key." />
                  )}
                </div>
                <div className="grid gap-3 rounded-lg bg-dls-surface-muted/35 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="text-xs leading-5 text-dls-secondary">
                    Missing context is safe. The Bittensor Agent can ask for the exact public netuid, hotkey, or address before a preview is trusted. This button creates an unsigned preview only.
                  </div>
                  <Button className="gap-1.5 rounded-md bg-[var(--protocol-desk-accent)] text-[var(--matterhorn-ink)] hover:opacity-90" onClick={requestQuote} disabled={quoteLoading}>
                    {quoteLoading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    Prepare unsigned preview
                  </Button>
                </div>
              </div>
            </Section>

            {quote && (
              <Section title="Quote" icon={<Shield className="size-4" />}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Expected alpha" value={formatNumber(quote.expectedAlpha)} compact />
                    <Metric label="Fee TAO" value={formatNumber(quote.feeTao, 6)} compact />
                    <Metric label="Slippage" value={quote.slippageBps === null ? "—" : `${quote.slippageBps} bps`} compact />
                    <Metric label="Signer" value={quote.requiresExternalSignature ? "External" : "Matterhorn"} compact />
                  </div>
                  <div className="space-y-2">
                    {quote.warnings.map((warning) => (
                      <div key={warning} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full gap-1.5" onClick={askAgentAboutQuote}>
                    <BrainCircuit className="size-4" />
                    {agentPromptReady ? "Task ready" : "Review with agent"}
                  </Button>
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-dls-card p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-dls-text">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[rgb(var(--protocol-desk-rgb)/0.16)] text-[var(--protocol-desk-accent)]">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function BittensorStandardActionList({
  onAction,
}: {
  onAction: (item: (typeof BITTENSOR_STANDARD_ACTIONS)[number]) => void;
}) {
  return (
    <div className="grid gap-2">
      {BITTENSOR_STANDARD_ACTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="group grid w-full gap-3 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-3 text-left transition-colors hover:bg-[var(--protocol-desk-soft)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[rgb(var(--protocol-desk-rgb)/0.32)] sm:grid-cols-[minmax(0,1fr)_auto]"
          onClick={() => onAction(item)}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--protocol-desk-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--protocol-desk-accent)]">
                {item.intent}
              </span>
              <span className="text-sm font-semibold text-dls-text">{item.title}</span>
            </div>
            <div className="mt-1.5 text-xs leading-5 text-dls-secondary">{item.summary}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-dls-secondary">
              <span>Outcome: {item.outcome}</span>
              <span aria-hidden="true">·</span>
              <span>Safety: {item.safety}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 sm:min-w-[9rem] sm:justify-end">
            <span className="text-xs font-medium text-[var(--protocol-desk-accent)] group-hover:text-dls-text">
              Start task
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function UnifiedWalletPanel({
  venue,
  watchAddress,
  wallet,
  executionAvailable,
  onOpenAction,
}: {
  venue: CryptoVenue;
  watchAddress: string;
  wallet: BittensorWalletSnapshot | null;
  executionAvailable: boolean | null;
  onOpenAction: () => void;
}) {
  const action = venue === "bittensor"
    ? {
        label: "TAO transfer, stake, and unstake",
        value: watchAddress.trim() ? "Review and submit in wallet" : "Connect wallet to submit",
        detail: "Prepare the exact call here, then approve it in your connected Bittensor wallet. Unsupported advanced calls are not shown as executable.",
        button: watchAddress.trim() ? "Open wallet" : "Connect wallet",
      }
    : venue === "hyperliquid"
      ? executionAvailable === true
        ? {
            label: "Perpetual orders",
            value: "Ready in connected wallet",
            detail: "Review the exact order, sign its short-lived intent in your connected EVM wallet, and submit it from the trade ticket.",
            button: "Open order ticket",
          }
        : executionAvailable === false
          ? {
              label: "Perpetual orders",
              value: "Preview only",
              detail: "Order preparation works, but this deployment has not enabled wallet submission. No order can be sent until the execution gate is enabled.",
              button: "Review order ticket",
            }
          : {
              label: "Perpetual orders",
              value: "Checking availability",
              detail: "Matterhorn is checking whether reviewed wallet submission is enabled for this deployment.",
              button: "Open order ticket",
            }
      : {
          label: "Eligible buy, sell, and cancel actions",
          value: "Authorize and submit",
          detail: "Choose an eligible market, review the maximum loss, then authorize and submit with your connected Polygon wallet.",
          button: "Open order ticket",
        };
  return (
    <div className="rounded-lg bg-dls-surface-muted/35 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-dls-text">
            <Wallet className="size-4 text-[var(--protocol-desk-accent)]" />
            Wallet execution
          </div>
          <div className="mt-1 text-xs leading-5 text-dls-secondary">
            {action.label}: <span className="font-medium text-dls-text">{action.value}</span>
            {venue === "bittensor" && wallet?.providerStatus === "ok" ? (
              <span> · {formatNumber(wallet.estimatedValueTao)} TAO tracked</span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-dls-secondary">
            {action.detail}
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={onOpenAction}>
          {action.button}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-lg bg-dls-surface-muted/40 p-3.5", compact && "p-3")}>
      <div className="text-[11px] font-medium text-dls-secondary">{label}</div>
      <div className={cn("mt-1.5 break-words font-mono font-semibold leading-snug text-dls-text", compact ? "text-sm" : "text-xl")}>{value}</div>
    </div>
  );
}

function Notice({ tone, icon, title, children }: { tone: "info" | "warning"; icon: ReactNode; title: string; children: ReactNode }) {
  const classes = tone === "warning"
    ? "bg-amber-500/10 text-amber-200"
    : "bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)]";
  return (
    <div className={cn("mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5", classes)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-xs font-semibold">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-dls-secondary">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function SubnetRow({
  subnet,
  selected,
  favorite,
  onSelect,
  onFavorite,
}: {
  subnet: BittensorSubnetSummary;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-dls-surface-muted/[0.045] transition-colors",
        selected ? "bg-[var(--protocol-desk-soft)]" : "hover:bg-dls-hover/70",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3">
        <button type="button" className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 text-left" onClick={onSelect}>
          <div className="font-mono text-xs font-semibold text-[var(--protocol-desk-accent)]">#{subnet.netuid}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-dls-text">{subnet.name}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-dls-secondary">{subnet.benefitSummary}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill>{subnet.category}</Pill>
              <Pill>{subnet.symbol}</Pill>
              <Pill>{subnet.source === "tao.app" ? "Live" : "Fallback"}</Pill>
            </div>
          </div>
        </button>
        <button
          type="button"
          className={cn("rounded-lg p-1.5 transition-colors", favorite ? "text-amber-300" : "text-dls-secondary hover:text-dls-text")}
          onClick={onFavorite}
          title={favorite ? "Remove favorite" : "Add favorite"}
        >
          <Star className={cn("size-4", favorite && "fill-current")} />
        </button>
      </div>
    </div>
  );
}

function SubnetDetailCard({
  detail,
  loading,
  agentPromptReady,
  onAskAgent,
}: {
  detail: BittensorSubnetDetail | null;
  loading: boolean;
  agentPromptReady: boolean;
  onAskAgent: (subnet: BittensorSubnetSummary) => void;
}) {
  if (loading) return <LoadingLabel label="Loading subnet detail" />;
  if (!detail) {
    return (
      <div className="rounded-lg bg-dls-surface-muted/35 p-4 text-sm text-dls-secondary">
        Select a subnet to inspect.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-dls-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-sky-300">Subnet {detail.netuid}</div>
          <h3 className="truncate text-lg font-semibold text-dls-text">{detail.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-dls-secondary">{detail.benefitSummary}</p>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={() => onAskAgent(detail)}>
          <BrainCircuit className="size-3.5" />
          {agentPromptReady ? "Task ready" : "Ask Agent"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Price TAO" value={formatNumber(detail.priceTao, 6)} compact />
        <Metric label="Emission" value={formatNumber(detail.emission)} compact />
        <Metric label="Neurons" value={formatNumber(detail.metagraphSummary.neurons, 0)} compact />
        <Metric label="Block" value={formatNumber(detail.metagraphSummary.block, 0)} compact />
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-dls-secondary">Use cases</div>
        <div className="space-y-1.5">
          {detail.knownUseCases.map((item) => (
            <div key={item} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2 text-xs text-dls-text">{item}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-dls-secondary">Top validators</div>
        {detail.topValidators.length ? (
          <div className="space-y-1.5">
            {detail.topValidators.slice(0, 4).map((validator, index) => (
              <div key={`${validator.uid}:${validator.hotkey}:${index}`} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-dls-text">UID {validator.uid ?? "—"}</span>
                  <span className="font-mono text-xs text-dls-secondary">{formatNumber(validator.stake)}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-dls-secondary">Hotkey {shortAddress(validator.hotkey)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-dls-secondary">Validator data unavailable.</p>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-dls-secondary">Risks</div>
        <div className="space-y-1.5">
          {detail.risks.map((risk) => (
            <div key={risk} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {risk}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {detail.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-dls-surface-muted/40 px-2.5 py-1.5 text-xs text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text"
          >
            <ExternalLink className="size-3" />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-dls-surface-muted/50 px-2 py-0.5 text-[10px] text-dls-secondary">
      {children}
    </span>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dls-secondary">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-10 w-full rounded-lg bg-dls-surface-muted/40 px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary focus:ring-2 focus:ring-[rgb(var(--protocol-desk-rgb)/0.32)]"
      />
      {hint ? <span className="mt-1 block text-[11px] leading-5 text-dls-secondary">{hint}</span> : null}
    </label>
  );
}
