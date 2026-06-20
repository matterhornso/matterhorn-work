/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BrainCircuit,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Star,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  BittensorActionQuote,
  BittensorSubnetDetail,
  BittensorSubnetSummary,
  BittensorSubtensorSidecarHealth,
  BittensorWalletSnapshot,
  MarketExecutionChainGuide,
  MarketExecutionReadinessReport,
} from "@matterhorn-work/types";
import {
  MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY,
  type MatterhornProtocolWorkspaceManifest,
} from "@matterhorn-work/types/matterhorn-workflows";

const WATCH_ADDRESS_KEY = "matterhorn:bittensor:watchAddress";
const FAVORITES_KEY = "matterhorn:bittensor:favorites";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const CHECK_PENDING_LABEL = "Check pending";
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
const CUSTOMER_DEMO_PROMPTS = [
  {
    id: "bittensor-image-subnets",
    label: "Bittensor discovery",
    betaVisible: true,
    prompt: "Use Bittensor chat mode. Find Bittensor subnets useful for image generation. Return customer-safe cards and explain which actions are read-only, which are preview-only, and which require external signing.",
  },
  {
    id: "bittensor-tao-wallet",
    label: "TAO wallet",
    betaVisible: true,
    prompt: "Use Bittensor chat mode. Show my TAO for the public SS58 address in context. If no public SS58 address is available, ask one concise question for a public coldkey only. Do not ask for seed phrases or private keys.",
  },
  {
    id: "hyperliquid-orderbook",
    label: "Hyperliquid read",
    betaVisible: false,
    prompt: "Use Hyperliquid chat mode. Show BTC Hyperliquid orderbook context and explain why Matterhorn is preview-only for orders: Can submit: No, Live submission: Off, External signer required.",
  },
  {
    id: "polymarket-compliance",
    label: "Polymarket compliance",
    betaVisible: false,
    prompt: "Use Polymarket chat mode. Find Polymarket markets about AI and show any compliance blocks without executable order terms.",
  },
  {
    id: "external-signer-preview",
    label: "Signer preview",
    betaVisible: true,
    prompt: "Use Matterhorn protocol chat. Explain the external-signer preview flow across Bittensor, Hyperliquid, and Polymarket. Make clear that Matterhorn prepares safe previews; my wallet/client decides whether anything is signed externally, and Matterhorn cannot sign, submit, custody, or broadcast.",
  },
  {
    id: "market-execution-readiness",
    label: "Execution readiness",
    betaVisible: false,
    prompt: "Use Matterhorn protocol chat. Can Matterhorn submit Hyperliquid and Polymarket orders yet? Show the execution readiness contract, Can submit: No, Live submission: Off, and the missing security-review steps before any future route could change.",
  },
  {
    id: "market-execution-chain",
    label: "Safe execution chain",
    betaVisible: false,
    prompt: "Use Matterhorn protocol chat. Explain the Hyperliquid and Polymarket preview -> external sign request -> redacted artifact validation -> public receipt import chain. Confirm that Matterhorn rejects raw signatures, signed payloads, API secrets, private keys, hash mismatches, and any live submission request.",
  },
  {
    id: "market-sdk-validation",
    label: "SDK validation",
    betaVisible: false,
    prompt: "Use Matterhorn protocol chat. Explain official SDK validation for Hyperliquid and Polymarket. Show fixture mode, operator-owned testnet mode, Hyperliquid testnet, Polygon Amoy, public/redacted evidence only, Can submit: No, Live submission: Off, and why Matterhorn never receives keys, API secrets, raw signatures, signed payloads, or wallet exports.",
  },
  {
    id: "hyperliquid-watch",
    label: "Hyperliquid watch",
    betaVisible: false,
    prompt: "Use Hyperliquid chat mode. Create a read-only Hyperliquid watch plan for BTC funding and orderbook movement. Show the watch kind, asset, threshold, source/freshness, watch_alert card behavior, and confirm no orders are signed, submitted, or auto-executed.",
  },
  {
    id: "polymarket-watch",
    label: "Polymarket watch",
    betaVisible: false,
    prompt: "Use Polymarket chat mode. Create a read-only Polymarket watch plan for a public market id. Show market status, odds/liquidity movement, compliance state, watch_alert behavior, and confirm no orders are signed, submitted, or auto-executed.",
  },
] as const;
// Beta-tester "Try in chat" quick prompts. Each inserts a ready-to-review
// prompt into the composer (it does not auto-send). Copy is preview/read-only
// and never asks for secrets.
const BETA_TRY_PROMPTS = [
  {
    id: "beta-show-tao",
    label: "show my TAO",
    mode: "bittensor",
    prompt:
      "Use Bittensor chat mode. Show my TAO for the public SS58 address in context. If none is set, ask once for a public coldkey address only. Never ask for seed phrases, private keys, or wallet exports.",
  },
  {
    id: "beta-image-subnets",
    label: "find Bittensor subnets for image generation",
    mode: "crypto",
    prompt:
      "Use Bittensor chat mode. Find Bittensor subnets useful for image generation and return customer-safe cards. Explain which actions are read-only, which are preview-only, and which require external signing.",
  },
  {
    id: "beta-validators-14",
    label: "compare validators on subnet 14",
    mode: "bittensor",
    prompt:
      "Use Bittensor chat mode. Compare validators on subnet 14 using public metagraph context. Explain stake, trust, and emissions in beginner language. Any staking action requires an external Bittensor-compatible signer; Matterhorn cannot sign or broadcast.",
  },
  {
    id: "beta-stake-1-tao",
    label: "prepare staking 1 TAO",
    mode: "bittensor",
    prompt:
      "Use Bittensor chat mode. Prepare a preview for staking 1 TAO: show netuid, validator hotkey, expected alpha, fee, slippage, and warnings. Make clear this is a preview only and must be signed in an external Bittensor-compatible signer. Never ask for seed phrases or private keys.",
  },
  {
    id: "beta-hl-orderbook",
    label: "show Hyperliquid BTC orderbook",
    mode: "crypto",
    prompt:
      "Use Hyperliquid chat mode. Show the BTC Hyperliquid orderbook context and explain that Matterhorn is preview-only for orders: Can submit: No, Live submission: Off, External signer required.",
  },
  {
    id: "beta-pm-summary",
    label: "summarize a Polymarket market",
    mode: "crypto",
    prompt:
      "Use Polymarket chat mode. Summarize a public Polymarket market: status, odds/liquidity, and any compliance block. Keep it preview-only with no executable order terms; compliance checks are required.",
  },
] as const;
const BITTENSOR_BETA_MODE = (() => {
  const flag = typeof import.meta.env?.VITE_MATTERHORN_BITTENSOR_BETA === "string"
    ? import.meta.env.VITE_MATTERHORN_BITTENSOR_BETA.trim().toLowerCase()
    : "";
  return flag === "1" || flag === "true";
})();

type Tab = "overview" | "demo" | "subnets" | "wallet" | "actions";
type CryptoVenue = "bittensor" | "hyperliquid" | "polymarket";
type ActionType = BittensorActionQuote["action"];
const VENUE_PROTOCOL_MANIFESTS: Record<CryptoVenue, MatterhornProtocolWorkspaceManifest> = {
  bittensor: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.bittensor,
  hyperliquid: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.hyperliquid,
  polymarket: MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.polymarket,
};

function protocolStatusLabel(status: MatterhornProtocolWorkspaceManifest["customerStatus"]): string {
  switch (status) {
    case "beta_ready":
      return "Beta-ready";
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

const VENUE_DESKS: Record<CryptoVenue, {
  label: string;
  shortLabel: string;
  workspaceTitle: string;
  eyebrow: string;
  headline: string;
  description: string;
  statusLabel: string;
  canSubmit: string;
  liveSubmission: string;
  signer: string;
  source: string;
  prompts: { label: string; prompt: string }[];
}> = {
  bittensor: {
    label: "Bittensor",
    shortLabel: "TAO",
    workspaceTitle: "Bittensor desk",
    eyebrow: "Wallet · subnets · validators",
    headline: "Use Bittensor without learning the CLI first.",
    description: "Read public SS58 wallets, understand subnets, compare validators, prepare staking previews, and create watches. Actions still require an external Bittensor-compatible signer.",
    statusLabel: "Beta-ready",
    canSubmit: "External signer",
    liveSubmission: "External signing required",
    signer: "External Bittensor signer required",
    source: "Subtensor sidecar, TAO.app, or fallback data",
    prompts: [
      {
        label: "Find image subnets",
        prompt: "Use Bittensor chat mode. Find Bittensor subnets useful for image generation. Explain each subnet in beginner language, adapter availability, live data freshness, risks, and safe next steps.",
      },
      {
        label: "Show my TAO",
        prompt: "Use Bittensor chat mode. Show my TAO and where I am staked for this public SS58 coldkey: <paste public coldkey SS58 address>. Do not ask for seed phrases, private keys, mnemonics, or wallet exports.",
      },
      {
        label: "Compare validators",
        prompt: "Use Bittensor chat mode. Compare validators on subnet 14 with a balanced strategy. Explain data freshness, fallback warnings, hotkey meaning, and what is missing before a staking preview.",
      },
      {
        label: "Prepare staking",
        prompt: "Use Bittensor chat mode. Prepare staking 1 TAO safely. Ask for netuid and validator hotkey if missing. Return an unsigned preview only and explain that external signing is required.",
      },
    ],
  },
  hyperliquid: {
    label: "Hyperliquid",
    shortLabel: "HL",
    workspaceTitle: "Hyperliquid desk",
    eyebrow: "Orderbook · account · previews",
    headline: "Preview Hyperliquid trades through chat, with execution off.",
    description: "Inspect orderbooks, account exposure, funding, open-order context, watch plans, and external-signer handoffs. Matterhorn does not submit live Hyperliquid orders in this build.",
    statusLabel: "Preview-only",
    canSubmit: "No",
    liveSubmission: "Off",
    signer: "External signer/client required",
    source: "Hyperliquid public info endpoints and fixture/testnet evidence",
    prompts: [
      {
        label: "BTC orderbook",
        prompt: "Use Hyperliquid chat mode. Show BTC orderbook context, spread, depth summary, stale-data warnings, and explain that this is read/preview-only with Can submit: No and Live submission: Off.",
      },
      {
        label: "Account exposure",
        prompt: "Use Hyperliquid chat mode. Show my Hyperliquid exposure for this public address: <paste public address>. Summarize account value, margin, positions, open orders, funding exposure, and risk notes where data exists.",
      },
      {
        label: "Preview order",
        prompt: "Use Hyperliquid chat mode. Prepare a preview for buying 0.001 BTC with a testnet external-signer flow. Do not submit, sign, or ask for API secrets. Show Can submit: No, Live submission: Off, missing context, and preview hash expectations.",
      },
      {
        label: "Create watch",
        prompt: "Use Hyperliquid chat mode. Create a read-only watch plan for BTC funding rate and orderbook movement. Explain threshold, source/freshness, alert card behavior, and confirm no auto-execution.",
      },
    ],
  },
  polymarket: {
    label: "Polymarket",
    shortLabel: "PM",
    workspaceTitle: "Polymarket desk",
    eyebrow: "Markets · outcomes · compliance",
    headline: "Analyze prediction markets and preview safely.",
    description: "Find markets, explain outcomes as probabilities, read orderbook/liquidity context, check compliance state, and prepare external-signer previews without sending orders from Matterhorn.",
    statusLabel: "Preview-only",
    canSubmit: "No",
    liveSubmission: "Off",
    signer: "External wallet/client required",
    source: "Polymarket Gamma/Data/CLOB public reads and fixture/testnet evidence",
    prompts: [
      {
        label: "Find markets",
        prompt: "Use Polymarket chat mode. Find and summarize Polymarket markets about this topic: <topic>. Explain outcomes, implied probabilities, liquidity/orderbook context where available, and compliance status.",
      },
      {
        label: "Compliance read",
        prompt: "Use Polymarket chat mode. Review whether this market can be previewed: <market id or URL>. If compliance-blocked, return no executable price, size, or share fields.",
      },
      {
        label: "Preview prediction",
        prompt: "Use Polymarket chat mode. Prepare a preview-only YES/NO prediction for this testnet/operator-owned market: <market id>. Do not sign, submit, or ask for API secrets. Show Can submit: No, Live submission: Off, and external signer requirements.",
      },
      {
        label: "Create watch",
        prompt: "Use Polymarket chat mode. Create a read-only watch plan for odds/liquidity movement and compliance status on this public market: <market id>. Confirm no order signing, submission, or auto-execution.",
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

export default function BittensorPanel({ initialVenue = "bittensor" }: { initialVenue?: CryptoVenue }) {
  const [venue, setVenue] = useState<CryptoVenue>(initialVenue);
  const [tab, setTab] = useState<Tab>("overview");
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
    setTab("overview");
  }, [initialVenue]);

  const loadSubnets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bittensor/subnets");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load subnets");
      const next = (json.subnets ?? []) as BittensorSubnetSummary[];
      setSubnets(next);
      setSelectedNetuid((current) => current ?? next[0]?.netuid ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bittensor subnets");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSidecarStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bittensor/sidecar/health");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load sidecar status");
      setSidecarStatus(json.health as BittensorSubtensorSidecarHealth);
    } catch {
      setSidecarStatus(null);
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const res = await fetch("/api/bittensor/readiness");
      const json = await res.json();
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
        nextActions: ["Restart or reconnect the Matterhorn Work local server, then refresh readiness."],
      });
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const loadCryptoReadiness = useCallback(async () => {
    setCryptoReadinessLoading(true);
    try {
      const res = await fetch("/api/crypto/readiness");
      const json = await res.json();
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
        nextActions: ["Run pnpm smoke:customer-ready-crypto or restart Matterhorn Work, then refresh this panel."],
      });
    } finally {
      setCryptoReadinessLoading(false);
    }
  }, []);

  const loadMarketExecutionReadiness = useCallback(async () => {
    setMarketExecutionReadinessLoading(true);
    try {
      const res = await fetch("/api/crypto/market-execution-readiness");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load market execution readiness");
      setMarketExecutionReadiness((json.report ?? json) as MarketExecutionReadinessReport);
    } catch (err) {
      setMarketExecutionReadiness({
        version: "matterhorn.market.execution-readiness.v1",
        checkedAt: new Date().toISOString(),
        readyForLiveSubmission: false,
        status: "unavailable",
        venues: [],
        controls: [{
          id: "market_execution_readiness_api",
          status: "fail",
          summary: err instanceof Error
            ? `Local Matterhorn API unavailable for /api/crypto/market-execution-readiness: ${err.message}`
            : "Local Matterhorn API unavailable for /api/crypto/market-execution-readiness.",
        }],
        nextActions: ["Restart or reconnect the Matterhorn Work local server, then refresh market execution readiness before customer demos."],
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
      const res = await fetch("/api/crypto/market-execution-chain");
      const json = await res.json();
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
      const res = await fetch("/api/crypto/market-sdk-validation");
      const json = await res.json();
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
      const res = await fetch(`/api/bittensor/subnets/${netuid}`);
      const json = await res.json();
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
      const res = await fetch(`/api/bittensor/wallet/${encodeURIComponent(addr)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load wallet");
      setWallet(json.wallet as BittensorWalletSnapshot);
    } catch (err) {
      setWallet(null);
      setWalletError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      setWalletLoading(false);
    }
  }, [watchAddress]);

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
      const res = await fetch("/api/bittensor/actions/quote", {
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
      const json = await res.json();
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
  };

  const sendToChat = async (prompt: string, context: Record<string, unknown>, options: { mode?: "bittensor" | "crypto"; source?: string } = {}) => {
    const mode = options.mode ?? "bittensor";
    const expandedPrompt = mode === "bittensor" ? buildBittensorChatPrompt(prompt, context) : prompt;
    window.dispatchEvent(new CustomEvent(mode === "crypto" ? "matterhorn:crypto-chat-handoff" : "matterhorn:bittensor-chat-handoff", {
      detail: {
        prompt: expandedPrompt,
        context,
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

  const askAgentAboutSubnet = async (subnet: BittensorSubnetSummary) => {
    const prompt = `Use Bittensor chat mode. Explain subnet ${subnet.netuid} (${subnet.name}) in beginner language, then tell me how it could help my Matterhorn Work tasks. Include utility, risks, metagraph context, whether Matterhorn can directly invoke this subnet, and which actions require external Bittensor signing.`;
    await sendToChat(prompt, { netuid: subnet.netuid, subnet });
  };

  const askAgentAboutWallet = async () => {
    const address = watchAddress.trim();
    const prompt = wallet
      ? `Use Bittensor chat mode. Review this watch-only Bittensor wallet snapshot for ${address}. Explain TAO balance, subnet stake exposure, validator hotkeys, slippage risk, provider freshness, and safe next steps. Do not ask for seed phrases or private keys.`
      : `Use Bittensor chat mode. Help me inspect this Bittensor SS58 coldkey public address: ${address || "[paste address]"}. Show wallet positions, subnet exposure, validator hotkeys, and risks.`;
    await sendToChat(prompt, { ss58Address: address, wallet });
  };

  const askAgentAboutReadiness = async () => {
    const prompt = "Use Bittensor chat mode. Review the current Matterhorn Bittensor customer readiness status. Explain any failing or warning checks, what is safe to demo, and the next command or fix to run before a test customer session.";
    await sendToChat(prompt, { readiness });
  };

  const askAgentAboutCryptoReadiness = async () => {
    const prompt = "Use Matterhorn protocol chat. Review the current Matterhorn readiness status across Bittensor, Hyperliquid, and Polymarket. Explain blockers, warnings, safe demo paths, and the next command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
    await sendToChat(prompt, { cryptoReadiness }, { mode: "crypto", source: "crypto-readiness-panel" });
  };

  const askAgentAboutMarketExecutionReadiness = async () => {
    const prompt = "Use Matterhorn protocol chat. Review the current Hyperliquid and Polymarket market execution readiness contract. Explain why live submission is disabled, which controls are passing, what is still missing before any future submit/sign route, and the next safe operator command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
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
    }, { mode: "crypto", source: "crypto-customer-demo-checklist" });
  };

  // Insert a beta "Try in chat" prompt into the composer (never auto-sends).
  const askAgentBetaTryPrompt = async (item: (typeof BETA_TRY_PROMPTS)[number]) => {
    await sendToChat(item.prompt, {
      ss58Address: watchAddress.trim() || undefined,
      wallet,
      sourcePrompt: item.id,
    }, { mode: item.mode, source: "crypto-beta-try" });
  };

  const askAgentForVenuePrompt = async (prompt: string) => {
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
      source: `${venue}-workspace-panel`,
    });
  };

  const askAgentAboutQuote = async () => {
    if (!quote) return;
    const prompt = `Use Bittensor chat mode. Review this Bittensor ${quote.action} quote. Explain the consequence, netuid, amount, expected alpha, fee, slippage, warnings, and exactly what I must do in an external Bittensor-compatible signer before anything can be broadcast.`;
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
  const marketVenueState = (venueName: string): string => {
    const venue = marketExecutionReadiness?.venues?.find((item) => item.venue?.toLowerCase() === venueName);
    if (!venue) return CHECK_PENDING_LABEL;
    return venue.blockedNow?.includes("live_submit") ? "Disabled" : "Review";
  };
  const marketExecutionSubmissionState = marketExecutionReadiness
    ? "No"
    : CHECK_PENDING_LABEL;
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
  const activeManifest = VENUE_PROTOCOL_MANIFESTS[venue];
  const activeManifestStatus = protocolStatusLabel(activeManifest.customerStatus);
  const activeManifestCanSubmit = activeManifest.safetyBoundaries.canSubmit ? "Yes" : "No";
  const activeManifestLiveSubmission = activeManifest.safetyBoundaries.liveExecutionEnabled ? "On" : "Off";
  const activeManifestSigner = protocolSignerLabel(activeManifest);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-dls-sidebar animate-fade-in">
      <div className="border-b border-dls-border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10">
              <BrainCircuit className="size-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-dls-text">{activeVenue.workspaceTitle}</h2>
              <p className="text-xs text-dls-secondary">
                {activeVenue.eyebrow} · {venue === "bittensor" && sidecarStatus?.configured ? "Subtensor sidecar ready" : activeManifestStatus}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-dls-secondary"
            onClick={refreshBittensor}
            disabled={loading || marketExecutionReadinessLoading || marketExecutionChainLoading || marketSdkValidationLoading}
          >
            <RefreshCw className={cn("size-3.5", (loading || marketExecutionReadinessLoading || marketExecutionChainLoading || marketSdkValidationLoading) && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-dls-surface p-1">
          {(["bittensor", "hyperliquid", "polymarket"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                venue === item ? "bg-[var(--matterhorn-blue)] text-[var(--matterhorn-ink)]" : "text-dls-secondary hover:text-dls-text",
              )}
              onClick={() => {
                setVenue(item);
                setTab("overview");
              }}
            >
              {VENUE_DESKS[item].label}
            </button>
          ))}
        </div>
        <div className="mb-3 rounded-xl border border-[rgba(var(--matterhorn-blue-rgb),0.24)] bg-[rgba(var(--matterhorn-blue-rgb),0.06)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">
            <span>Protocol manifest</span>
            <span className="rounded-full border border-[rgba(var(--matterhorn-blue-rgb),0.25)] px-2 py-0.5 text-[9px] text-dls-secondary">
              {activeManifestStatus}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Metric label="Can submit" value={activeManifestCanSubmit} compact />
            <Metric label="Live submission" value={activeManifestLiveSubmission} compact />
            <Metric label="External signer" value={activeManifestSigner} compact />
          </div>
          <p className="mt-2 break-words text-[11px] leading-5 text-dls-secondary">
            Allowed intents: {activeManifest.allowedIntents.join(", ")}. Panel route: {activeManifest.primaryPanelRouteId}.
          </p>
        </div>
        {venue === "bittensor" ? (
          <div className="grid grid-cols-5 gap-1 rounded-lg bg-dls-surface p-1">
            {[
              { key: "overview" as const, label: "Overview" },
              { key: "demo" as const, label: "Demo" },
              { key: "subnets" as const, label: "Subnets" },
              { key: "wallet" as const, label: "Wallet" },
              { key: "actions" as const, label: "Actions" },
            ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === item.key ? "bg-sky-500 text-white" : "text-dls-secondary hover:text-dls-text",
              )}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {venue === "bittensor" && error && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Bittensor provider">
            {error}
          </Notice>
        )}

        {venue !== "bittensor" && (
          <div className="space-y-4">
            <Section title={activeVenue.workspaceTitle} icon={venue === "hyperliquid" ? <BarChart3 className="size-4" /> : <Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-xl border border-[rgba(var(--matterhorn-blue-rgb),0.28)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">{activeVenue.eyebrow}</div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Interface" value={activeVenue.statusLabel} compact />
                  <Metric label="Can submit" value={activeVenue.canSubmit} compact />
                  <Metric label="Live submission" value={activeVenue.liveSubmission} compact />
                  <Metric label="Signer" value={activeVenue.signer} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Source: {activeVenue.source}. Matterhorn keeps this desk chat-first: ask in plain English, review cards, then use an external wallet/client only when a future approved handoff requires it.
                </p>
              </div>
            </Section>

            <Section title={`${activeVenue.label} chat starters`} icon={<BrainCircuit className="size-4" />}>
              <div className="grid gap-2">
                {activeVenue.prompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="rounded-xl border border-dls-border bg-dls-surface px-3 py-2.5 text-left transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.45)] hover:bg-dls-hover"
                    onClick={() => void askAgentForVenuePrompt(item.prompt)}
                  >
                    <span className="block text-xs font-semibold text-dls-text">{item.label}</span>
                    <span className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">{item.prompt}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={venue === "hyperliquid" ? "Exchange preview controls" : "Market preview controls"} icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Readiness" value={venue === "hyperliquid" ? hyperliquidReadinessState : polymarketReadinessState} compact />
                  <Metric label="Execution" value={marketVenueState(venue)} compact />
                  <Metric label="Can submit" value={marketExecutionSubmissionState} compact />
                  <Metric label="SDK evidence" value={marketSdkValidationState} compact />
                </div>
                <Notice tone="info" icon={<Shield className="size-4" />} title="Preview-only boundary">
                  {activeVenue.label} is separated from Bittensor because it has a different risk model. This desk supports read, preview, watch, sign-request evidence, and receipt review. It does not submit live market orders or accept private keys, API secrets, raw signatures, or signed payloads.
                </Notice>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand(venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate")}>
                    {copiedCustomerCommand === (venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate") ? "Copied" : `Create ${activeVenue.shortLabel} watch`}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainSignRequest")}>
                    {copiedCustomerCommand === "executionChainSignRequest" ? "Copied" : "Copy sign-request examples"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand(venue === "hyperliquid" ? "hyperliquidWatchDigest" : "polymarketWatchDigest")}>
                    {copiedCustomerCommand === (venue === "hyperliquid" ? "hyperliquidWatchDigest" : "polymarketWatchDigest") ? "Copied" : `Digest ${activeVenue.shortLabel} watches`}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("sdkValidateFixture")}>
                    {copiedCustomerCommand === "sdkValidateFixture" ? "Copied" : "SDK fixture validation"}
                  </Button>
                </div>
              </div>
            </Section>
          </div>
        )}

        {venue === "bittensor" && tab === "overview" && (
          <div className="space-y-4">
            <Section title="Bittensor workspace" icon={<BrainCircuit className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-xl border border-[rgba(var(--matterhorn-blue-rgb),0.28)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">{activeVenue.eyebrow}</div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Interface" value={activeVenue.statusLabel} compact />
                  <Metric label="Signing" value={activeVenue.signer} compact />
                  <Metric label="Wallet input" value="Public SS58" compact />
                  <Metric label="Custody" value="Never" compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Use this desk for TAO balance reads, subnet discovery, validator comparison, watchlists, receipts, and unsigned staking previews. Matterhorn never asks for seed phrases, private keys, mnemonics, or wallet exports.
                </p>
              </div>
            </Section>
            <div className="grid grid-cols-2 gap-2">
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

        {venue === "bittensor" && tab === "demo" && (
          <div className="space-y-4">
            <Section title="Try in chat" icon={<BrainCircuit className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Tap a prompt to drop it into the chat composer. Nothing sends automatically — review it, then press send. Public reads work without connecting an EVM wallet.
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

            <Section title="Safety status" icon={<Shield className="size-4" />}>
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Most complete beta flow. External signer required for actions; Matterhorn never holds keys.
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Hyperliquid</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Preview only, live submission off. Can submit: No.
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Polymarket</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Preview only, compliance checks required. Can submit: No.
                  </p>
                </div>
                <p className="break-words text-[11px] leading-5 text-dls-secondary">
                  Matterhorn does not custody keys, sign silently, or submit live market trades.
                </p>
              </div>
            </Section>

            <Section title="Evidence / QA" icon={<Database className="size-4" />}>
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Customer readiness smoke</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm smoke:customer-ready-crypto</code>
                </div>
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor beta packet</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm beta:bittensor:packet</code>
                </div>
                <div className="min-w-0 rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
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
                    Bittensor beta boundary: Bittensor is the customer-facing launch surface. Market previews are hidden in Bittensor beta mode and remain preview/R&amp;D only.
                  </p>
                ) : null}
                {cryptoReadinessBlocker ? (
                  <p className="text-xs leading-5 text-red-300">Blocker: {cryptoReadinessBlocker}</p>
                ) : cryptoReadinessFailures[0] ? (
                  <p className="text-xs leading-5 text-red-300">{cryptoReadinessFailures[0].label ?? "Protocol readiness"}: {cryptoReadinessFailures[0].summary ?? "Needs attention before customer demo."}</p>
                ) : cryptoReadinessWarnings[0] ? (
                  <p className="text-xs leading-5 text-amber-300">{cryptoReadinessWarnings[0].label ?? "Protocol readiness"}: {cryptoReadinessWarnings[0].summary ?? "Review before customer demo."}</p>
                ) : cryptoReadiness?.ready && readiness?.ready ? (
                  <p className="text-xs leading-5 text-emerald-300">Protocol readiness is green for Bittensor, Hyperliquid, and Polymarket read/preview demo flows.</p>
                ) : (
                  <p className="text-xs leading-5 text-dls-secondary">Refresh readiness before a test customer session.</p>
                )}
                {cryptoReadinessNextAction || readinessNextAction ? (
                  <p className="text-xs leading-5 text-sky-200">Next: {cryptoReadinessNextAction ?? readinessNextAction}</p>
                ) : null}
                {localReadinessApiUnavailable ? (
                  <Notice tone="info" icon={<Shield className="size-4" />} title="Local API check">
                    The protocol desks are installed, but the desktop panel cannot reach the local readiness API yet. This usually means the Matterhorn Work server/auth token is still starting or stale; restart or reconnect, then refresh. You can still copy the evidence commands below for a terminal check.
                  </Notice>
                ) : null}
                {/* Right-rail command groups stay single-column; viewport breakpoints are too wide for this side panel. */}
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={refreshBittensor} disabled={readinessLoading || cryptoReadinessLoading || marketExecutionReadinessLoading || marketSdkValidationLoading}>
                    {readinessLoading || cryptoReadinessLoading || marketExecutionReadinessLoading || marketSdkValidationLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutReadiness} disabled={!readiness}>
                    <BrainCircuit className="size-3.5" />
                    Bittensor Chat
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutCryptoReadiness} disabled={!cryptoReadiness}>
                    <BrainCircuit className="size-3.5" />
                    Protocol Chat
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Desktop beta" icon={<ExternalLink className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  First-run tester path: build an unsigned local DMG/ZIP, run the desktop beta doctor, then capture install, launch, readiness, and safety evidence before a customer session.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Bittensor: Beta-ready</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Read, preview, watches, receipts, and external-signer handoff.</p>
                  </div>
                  <div className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Hyperliquid/Polymarket: Preview only</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Can submit: No. Live submission: Off. No market submit.</p>
                  </div>
                  <div className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Services: Workflow/future hooks</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Wellness and decentralized services do not run live payments, email, storage, or access control.</p>
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
                  <Metric label="Hyperliquid submit" value={marketVenueState("hyperliquid")} compact />
                  <Metric label="Polymarket submit" value={marketVenueState("polymarket")} compact />
                  <Metric label="Controls" value={marketExecutionControls.length ? `${marketExecutionPassedControls}/${marketExecutionControls.length}` : "Unknown"} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  This is a readiness contract, not execution permission. Hyperliquid and Polymarket remain read/preview/external-signer only: Can submit: No, Live submission: Off.
                </p>
                {marketExecutionBlockedControls > 0 ? (
                  <p className="text-xs leading-5 text-amber-300">
                    {marketExecutionBlockedControls} execution control{marketExecutionBlockedControls === 1 ? "" : "s"} intentionally block live submit routes until a separate security review.
                  </p>
                ) : null}
                {marketExecutionNextAction ? (
                  <p className="text-xs leading-5 text-sky-200">Next: {marketExecutionNextAction}</p>
                ) : null}
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadMarketExecutionReadiness} disabled={marketExecutionReadinessLoading}>
                    {marketExecutionReadinessLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutMarketExecutionReadiness} disabled={!marketExecutionReadiness}>
                    <BrainCircuit className="size-3.5" />
                    Market Chat
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
                  Testnet-only path: preview -&gt; external sign request -&gt; redacted artifact validation -&gt; public receipt import. Each step is public/redacted and hash-bound before it can become customer evidence.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    ["Preview / handoff", "Build a no-submit plan with Can submit: No and Live submission: Off."],
                    ["External sign request", "Create public metadata for an operator-owned testnet signer only."],
                    ["Validate artifact", "Accept public/redacted metadata; reject raw signatures, signed payloads, secrets, and hash mismatches."],
                    ["Receipt import", "Attach public status or transaction evidence without private execution material."],
                  ].map(([label, description]) => (
                    <div key={label} className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
                      <p className="text-xs font-semibold text-dls-text">{label}</p>
                      <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{description}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadMarketExecutionChain} disabled={marketExecutionChainLoading}>
                    {marketExecutionChainLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChain")}>
                    {copiedCustomerCommand === "executionChain" ? "Copied" : "Chain CLI"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainApi")}>
                    {copiedCustomerCommand === "executionChainApi" ? "Copied" : "Chain API"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainSignRequest")}>
                    {copiedCustomerCommand === "executionChainSignRequest" ? "Copied" : "Sign request"}
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
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadMarketSdkValidation} disabled={marketSdkValidationLoading}>
                    {marketSdkValidationLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
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

            <Section title="Try prompts" icon={<BrainCircuit className="size-4" />}>
              <div className="grid gap-2">
                {customerDemoPrompts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-xl border border-dls-border bg-dls-surface px-3 py-2.5 text-left transition-colors hover:border-sky-500/35 hover:bg-dls-hover"
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
                  <div className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
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
                  <div className="rounded-lg border border-dls-border bg-dls-surface px-3 py-2">
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
                  "Read/preview-only",
                  "Preview Only",
                  "External signer required",
                  "No market submit",
                ].map((item) => (
                  <div key={item} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-dls-secondary">
                Demo boundary: no seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live Hyperliquid/Polymarket submission.
              </p>
              <p className="mt-2 text-xs leading-5 text-dls-secondary">
                Matterhorn prepares safe previews; your wallet/client decides whether anything is signed externally.
              </p>
              {BITTENSOR_BETA_MODE ? (
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  In Bittensor beta, Hyperliquid and Polymarket are preview/R&amp;D only and are not part of the customer launch promise.
                </p>
              ) : null}
            </Section>
          </div>
        )}

        {venue === "bittensor" && tab === "subnets" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-dls-border bg-dls-surface px-3 py-2">
                <Search className="size-4 text-dls-secondary" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search netuid, name, utility"
                  className="min-w-0 flex-1 bg-transparent text-sm text-dls-text outline-none placeholder:text-dls-secondary"
                />
              </div>
              {loading ? (
                <LoadingLabel label="Loading subnets" />
              ) : (
                <div className="space-y-2">
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
                  className="h-11 w-full rounded-xl border border-dls-border bg-dls-surface px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary"
                />
                <Button className="w-full gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={loadWallet} disabled={walletLoading}>
                  {walletLoading ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                  Watch Address
                </Button>
                <Button variant="outline" className="w-full gap-1.5" onClick={askAgentAboutWallet} disabled={!watchAddress.trim()}>
                  <BrainCircuit className="size-4" />
                  {agentPromptReady ? "Sent to Chat" : "Ask in Chat"}
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
                      <div key={`${position.netuid}:${position.validatorHotkey}`} className="rounded-xl border border-dls-border bg-dls-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-dls-text">{position.subnetName}</div>
                            <div className="text-xs text-dls-secondary">Subnet {position.netuid}</div>
                          </div>
                          <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-sky-300">
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
            <Notice tone="info" icon={<Shield className="size-4" />} title="Quote-only actions">
              Matterhorn prepares Bittensor actions for review. External Bittensor-compatible signing is required.
            </Notice>
            <Section title="Prepare Action" icon={<ArrowUpDown className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-dls-surface p-1">
                  {(["stake", "unstake", "transfer", "compare"] as ActionType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                        action === item ? "bg-sky-500 text-white" : "text-dls-secondary hover:text-dls-text",
                      )}
                      onClick={() => setAction(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {action !== "transfer" && (
                  <LabeledInput label="Netuid" value={actionNetuid} onChange={setActionNetuid} />
                )}
                {action !== "compare" && (
                  <LabeledInput label="Amount TAO" value={amountTao} onChange={setAmountTao} />
                )}
                {(action === "stake" || action === "unstake") && (
                  <LabeledInput label="Validator hotkey" value={validatorHotkey} onChange={setValidatorHotkey} />
                )}
                {action === "transfer" && (
                  <LabeledInput label="Recipient coldkey" value={recipient} onChange={setRecipient} />
                )}
                <Button className="w-full gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={requestQuote} disabled={quoteLoading}>
                  {quoteLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpDown className="size-4" />}
                  Prepare Quote
                </Button>
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
                    {agentPromptReady ? "Sent to Chat" : "Review in Chat"}
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
    <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dls-text">
        <span className="text-sky-400">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-dls-border bg-dls-surface p-3", compact && "p-2.5")}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-dls-secondary">{label}</div>
      <div className={cn("mt-1 truncate font-mono font-semibold text-dls-text", compact ? "text-sm" : "text-lg")}>{value}</div>
    </div>
  );
}

function Notice({ tone, icon, title, children }: { tone: "info" | "warning"; icon: ReactNode; title: string; children: ReactNode }) {
  const classes = tone === "warning"
    ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
    : "border-sky-500/20 bg-sky-500/10 text-sky-200";
  return (
    <div className={cn("mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5", classes)}>
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
        "rounded-xl border bg-dls-surface p-3 transition-colors",
        selected ? "border-sky-500/60" : "border-dls-border hover:border-sky-500/30",
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">#{subnet.netuid}</span>
            <span className="truncate text-sm font-medium text-dls-text">{subnet.name}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-dls-secondary">{subnet.benefitSummary}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill>{subnet.category}</Pill>
            <Pill>{subnet.symbol}</Pill>
            <Pill>{subnet.source === "tao.app" ? "Live" : "Fallback"}</Pill>
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
      <div className="rounded-xl border border-dls-border bg-dls-surface p-4 text-sm text-dls-secondary">
        Select a subnet to inspect.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-dls-border bg-dls-sidebar p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-sky-300">Subnet {detail.netuid}</div>
          <h3 className="truncate text-lg font-semibold text-dls-text">{detail.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-dls-secondary">{detail.benefitSummary}</p>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={() => onAskAgent(detail)}>
          <BrainCircuit className="size-3.5" />
          {agentPromptReady ? "Sent to Chat" : "Ask in Chat"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Price TAO" value={formatNumber(detail.priceTao, 6)} compact />
        <Metric label="Emission" value={formatNumber(detail.emission)} compact />
        <Metric label="Neurons" value={formatNumber(detail.metagraphSummary.neurons, 0)} compact />
        <Metric label="Block" value={formatNumber(detail.metagraphSummary.block, 0)} compact />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Use cases</div>
        <div className="space-y-1.5">
          {detail.knownUseCases.map((item) => (
            <div key={item} className="rounded-lg bg-dls-surface px-3 py-2 text-xs text-dls-text">{item}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Top validators</div>
        {detail.topValidators.length ? (
          <div className="space-y-1.5">
            {detail.topValidators.slice(0, 4).map((validator, index) => (
              <div key={`${validator.uid}:${validator.hotkey}:${index}`} className="rounded-lg bg-dls-surface px-3 py-2">
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
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Risks</div>
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
            className="inline-flex items-center gap-1 rounded-lg border border-dls-border px-2.5 py-1.5 text-xs text-dls-secondary transition-colors hover:text-dls-text"
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
    <span className="rounded-full border border-dls-border bg-dls-sidebar px-2 py-0.5 text-[10px] text-dls-secondary">
      {children}
    </span>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dls-secondary">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-10 w-full rounded-xl border border-dls-border bg-dls-surface px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary"
      />
    </label>
  );
}
