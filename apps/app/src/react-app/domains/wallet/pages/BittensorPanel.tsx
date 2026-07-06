/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { ProtocolBrandLogo } from "../../session/workflows/protocol-brand-logo";
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
  MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS,
  type CustomerBetaDemoScenario,
  type MatterhornProtocolWorkspaceManifest,
} from "@matterhorn-work/types/matterhorn-workflows";
import {
  normalizeMatterhornServerUrl,
  readMatterhornServerSettings,
} from "../../../../app/lib/matterhorn-server";

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
    proof: "Bittensor stays non-custodial; Hyperliquid and Polymarket remain Can submit: No, Live submission: Off.",
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
    prompt: "Hyperliquid Agent task: Show BTC Hyperliquid orderbook context and explain why Matterhorn is preview-only for orders: Can submit: No, Live submission: Off, External signer required.",
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
    prompt: "Matterhorn protocol task: Explain the external-signer preview flow across Bittensor, Hyperliquid, and Polymarket. Make clear that Matterhorn prepares safe previews; my wallet/client decides whether anything is signed externally, and Matterhorn cannot sign, submit, custody, or broadcast.",
  },
  {
    id: "market-execution-readiness",
    label: "Execution readiness",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Can Matterhorn submit Hyperliquid and Polymarket orders yet? Show the execution readiness contract, Can submit: No, Live submission: Off, and the missing security-review steps before any future route could change.",
  },
  {
    id: "market-execution-chain",
    label: "Safe execution chain",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Explain the Hyperliquid and Polymarket preview -> external sign request -> redacted artifact validation -> public receipt import chain. Confirm that Matterhorn rejects raw signatures, signed payloads, API secrets, private keys, hash mismatches, and any live submission request.",
  },
  {
    id: "market-sdk-validation",
    label: "SDK validation",
    betaVisible: false,
    prompt: "Matterhorn protocol task: Explain official SDK validation for Hyperliquid and Polymarket. Show fixture mode, operator-owned testnet mode, Hyperliquid testnet, Polygon Amoy, public/redacted evidence only, Can submit: No, Live submission: Off, and why Matterhorn never receives keys, API secrets, raw signatures, signed payloads, or wallet exports.",
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
      "Bittensor Agent task: Compare validators on subnet 14 using public metagraph context. Explain stake, trust, and emissions in beginner language. Any staking action requires an external Bittensor-compatible signer; Matterhorn cannot sign or broadcast.",
  },
  {
    id: "beta-stake-1-tao",
    label: "prepare staking 1 TAO",
    mode: "bittensor",
    prompt:
      "Bittensor Agent task: Prepare a preview for staking 1 TAO: show netuid, validator hotkey, expected alpha, fee, slippage, and warnings. Make clear this is a preview only and must be signed in an external Bittensor-compatible signer. Never ask for seed phrases or private keys.",
  },
  {
    id: "beta-hl-orderbook",
    label: "show Hyperliquid BTC orderbook",
    mode: "crypto",
    prompt:
      "Hyperliquid Agent task: Show the BTC Hyperliquid orderbook context and explain that Matterhorn is preview-only for orders: Can submit: No, Live submission: Off, External signer required.",
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
    safety: "No staking unless approved externally",
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
    summary: "Prepare an unsigned stake preview with netuid, validator hotkey, expected alpha, fee, and slippage.",
    safety: "External signer required",
    outcome: "Unsigned stake preview",
    formAction: "stake",
    prompt:
      "Bittensor Agent task: Prepare a stake preview using the netuid, amount, and validator hotkey in context. Show consequence, fee, slippage, expected alpha, warnings, and the exact external-signing handoff. Never ask for seed phrases or private keys.",
  },
  {
    id: "unstake-preview",
    step: "6",
    intent: "Preview",
    title: "Prepare unstake preview",
    summary: "Review an unsigned unstake preview and explain the consequence before external signing.",
    safety: "External signer required",
    outcome: "Unsigned unstake preview",
    formAction: "unstake",
    prompt:
      "Bittensor Agent task: Prepare an unstake preview using the netuid, amount, and validator hotkey in context. Explain expected TAO/alpha effects, slippage, fee, warnings, and the external-signing step. Never ask for seed phrases or private keys.",
  },
  {
    id: "transfer-preview",
    step: "7",
    intent: "Preview",
    title: "Prepare transfer preview",
    summary: "Prepare a TAO transfer preview to a destination coldkey without signing or broadcasting.",
    safety: "External signer required",
    outcome: "Unsigned transfer preview",
    formAction: "transfer",
    prompt:
      "Bittensor Agent task: Prepare a TAO transfer preview using the amount and recipient coldkey in context. Confirm destination meaning, fee, consequence, warnings, and external-signing requirements. Never ask for seed phrases or private keys.",
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
    summary: "Clarify Bittensor wallet concepts, staking exposure, and external signer boundaries.",
    safety: "No secrets requested",
    outcome: "Plain-English explainer",
    prompt:
      "Bittensor Agent task: Explain coldkeys, hotkeys, SS58 public addresses, validator hotkeys, staking exposure, and external signer boundaries in beginner language. Make clear that Matterhorn never needs seed phrases, private keys, mnemonics, wallet exports, raw signatures, or signed payloads.",
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

function readViteEnvValue(primary: string, legacy?: string) {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const primaryValue = typeof env?.[primary] === "string" ? env[primary].trim() : "";
  if (primaryValue) return primaryValue;
  return legacy && typeof env?.[legacy] === "string" ? env[legacy].trim() : "";
}

function resolveMatterhornApiConnection() {
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

  const response = await fetch(`${api.baseUrl}${path}`, { ...init, headers });
  const body = await response.text();
  try {
    return { response, json: JSON.parse(body) as T };
  } catch {
    const source = api.baseUrl || "current app origin";
    const preview = body.trim().slice(0, 80) || response.statusText;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || preview.startsWith("<")) {
      throw new Error(
        `Matterhorn server did not answer ${path}. The app received an HTML page from ${source} instead of JSON. Reconnect the Matterhorn Work server from Profile & Settings, then refresh this desk.`,
      );
    }
    throw new Error(
      `Matterhorn API returned non-JSON from ${source}${path}: ${preview}. Check the local Matterhorn server connection.`,
    );
  }
}

function mondayBetaScenarioMode(scenario: CustomerBetaDemoScenario): "bittensor" | "crypto" {
  return scenario.mapsToCustomerTemplateId === "bittensor_operator" ? "bittensor" : "crypto";
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
  prompts: { label: string; summary: string; prompt: string }[];
}> = {
  bittensor: {
    label: "Bittensor",
    shortLabel: "TAO",
    workspaceTitle: "Bittensor desk",
    eyebrow: "TAO wallet · subnets · validators",
    headline: "Start with your TAO, then choose what to do next.",
    description: "Matterhorn explains Bittensor in plain language: check a public wallet, browse subnets, compare validators, prepare staking or transfer previews, and keep every action external-signer only.",
    statusLabel: "Beta-ready",
    canSubmit: "Unsigned preview only",
    liveSubmission: "External signer only",
    signer: "External Bittensor signer required",
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
        summary: "Build an unsigned stake preview and external signer handoff.",
        prompt: "Bittensor Agent task: Prepare staking 1 TAO safely. Ask for netuid and validator hotkey if missing. Return an unsigned preview only and explain that external signing is required.",
      },
    ],
  },
  hyperliquid: {
    label: "Hyperliquid",
    shortLabel: "HL",
    workspaceTitle: "Hyperliquid desk",
    eyebrow: "Orderbook · account · previews",
    headline: "Preview Hyperliquid trades with the Hyperliquid Agent, with execution off.",
    description: "Inspect orderbooks, account exposure, funding, open-order context, watch plans, and external-signer handoffs. Matterhorn does not submit live Hyperliquid orders in this build.",
    statusLabel: "Preview-only",
    canSubmit: "No",
    liveSubmission: "Off",
    signer: "External signer/client required",
    source: "Hyperliquid public info endpoints and fixture/testnet evidence",
    prompts: [
      {
        label: "BTC orderbook",
        summary: "Read spread, depth, source, and stale-data context.",
        prompt: "Hyperliquid Agent task: Show BTC orderbook context, spread, depth summary, stale-data warnings, and explain that this is read/preview-only with Can submit: No and Live submission: Off.",
      },
      {
        label: "Account exposure",
        summary: "Summarize public account value, margin, positions, and funding.",
        prompt: "Hyperliquid Agent task: Show my Hyperliquid exposure for this public address: <paste public address>. Summarize account value, margin, positions, open orders, funding exposure, and risk notes where data exists.",
      },
      {
        label: "Preview order",
        summary: "Prepare a no-submit testnet preview with hash expectations.",
        prompt: "Hyperliquid Agent task: Prepare a preview for buying 0.001 BTC with a testnet external-signer flow. Do not submit, sign, or ask for API secrets. Show Can submit: No, Live submission: Off, missing context, and preview hash expectations.",
      },
      {
        label: "Create watch",
        summary: "Create read-only funding and orderbook movement watches.",
        prompt: "Hyperliquid Agent task: Create a read-only watch plan for BTC funding rate and orderbook movement. Explain threshold, source/freshness, alert card behavior, and confirm no auto-execution.",
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
        summary: "Prepare a preview-only YES/NO plan with no executable submit path.",
        prompt: "Polymarket Agent task: Prepare a preview-only YES/NO prediction for this testnet/operator-owned market: <market id>. Do not sign, submit, or ask for API secrets. Show Can submit: No, Live submission: Off, and external signer requirements.",
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
    return "Matterhorn server did not answer the Bittensor request with JSON. Reconnect the Matterhorn Work server, then refresh the Bittensor desk.";
  }
  if (/failed to fetch|network|load failed|econnrefused|timeout/i.test(message)) {
    return "Matterhorn could not reach the Bittensor provider. Check the local server connection, then refresh the Bittensor desk.";
  }
  return message || "Matterhorn could not load Bittensor data. Refresh this desk after reconnecting the local server.";
}

function ProtocolMark({ venue, compact = false }: { venue: CryptoVenue; compact?: boolean }) {
  const title = VENUE_DESKS[venue].label;
  const size = compact ? 20 : 36;
  return (
    <span
      aria-label={`${title} mark`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
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
        nextActions: ["Restart or reconnect the Matterhorn Work local server, then refresh readiness."],
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
        nextActions: ["Run pnpm smoke:customer-ready-crypto or restart Matterhorn Work, then refresh this panel."],
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
    const prompt = `Bittensor Agent task: Explain subnet ${subnet.netuid} (${subnet.name}) in beginner language, then tell me how it could help my Matterhorn Work tasks. Include utility, risks, metagraph context, whether Matterhorn can directly invoke this subnet, and which actions require external Bittensor signing.`;
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
    const prompt = "Bittensor Agent task: Review the current Matterhorn Bittensor customer readiness status. Explain any failing or warning checks, what is safe to demo, and the next command or fix to run before a test customer session.";
    await sendToChat(prompt, { readiness });
  };

  const askAgentAboutCryptoReadiness = async () => {
    const prompt = "Matterhorn protocol task: Review the current Matterhorn readiness status across Bittensor, Hyperliquid, and Polymarket. Explain blockers, warnings, safe demo paths, and the next command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
    await sendToChat(prompt, { cryptoReadiness }, { mode: "crypto", source: "crypto-readiness-panel" });
  };

  const askAgentAboutMarketExecutionReadiness = async () => {
    const prompt = "Matterhorn protocol task: Review the current Hyperliquid and Polymarket market execution readiness contract. Explain why live submission is disabled, which controls are passing, what is still missing before any future submit/sign route, and the next safe operator command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
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
      "Use Matterhorn Monday beta demo mode.",
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
  const activeSafetyBadge = venue === "bittensor" ? "Read/preview + external signer" : "Preview Only";
  const activeSafetyCopy = venue === "bittensor"
    ? "Bittensor safety: share only public SS58/coldkey or validator hotkey addresses. Matterhorn can read balances, explain subnets, create watches, and prepare unsigned previews. You review and sign elsewhere; never paste seed phrases, private keys, mnemonics, or wallet exports."
    : `Safety strip: ${activeVenue.label} is Preview Only. Can submit: No. Live submission: Off. External signer/client required. Matterhorn never accepts private keys, API secrets, raw signatures, signed payloads, or wallet exports.`;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain max-h-full bg-dls-canvas text-[15px] animate-fade-in [scrollbar-gutter:stable]"
      style={venueToneStyle(venue)}
    >
      <div className="bg-[radial-gradient(circle_at_18%_0%,rgba(var(--protocol-desk-rgb),0.18),transparent_42%),linear-gradient(180deg,var(--dls-sidebar),var(--dls-surface))] p-4 shadow-[0_1px_0_rgba(var(--protocol-desk-rgb),0.14)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProtocolMark venue={venue} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-dls-text">{activeVenue.workspaceTitle}</h2>
              <p className="text-[12px] leading-5 text-dls-secondary">
                {activeVenue.eyebrow} · {venue === "bittensor" && sidecarStatus?.configured ? "Subtensor sidecar ready" : activeManifestStatus}
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
        <div className="mb-3 grid grid-cols-1 gap-1 rounded-xl bg-dls-surface-muted/35 p-1 sm:grid-cols-3">
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
        <div className="mb-3 rounded-lg bg-dls-surface-muted/20 p-3.5">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[var(--protocol-desk-accent)]">
            <span>Boundary</span>
            <span>Protocol manifest</span>
            <span className="rounded-md bg-dls-surface/55 px-2 py-0.5 text-[9px] text-dls-secondary">
              {activeSafetyBadge}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-1.5">
            <Metric label="Can submit" value={activeManifestCanSubmit} compact />
            <Metric label="Live submission" value={activeManifestLiveSubmission} compact />
            <Metric label="External signer" value={activeManifestSigner} compact />
          </div>
          <p className="mt-2 break-words text-[11px] leading-5 text-dls-secondary">
            {activeSafetyCopy}
          </p>
          <p className="mt-2 break-words text-[11px] leading-5 text-dls-secondary">
            Status: {activeManifestStatus}. Allowed intents: {activeManifest.allowedIntents.join(", ")}. Panel route: {activeManifest.primaryPanelRouteId}.
          </p>
        </div>
        <UnifiedWalletPanel
          venue={venue}
          watchAddress={watchAddress}
          wallet={wallet}
          onOpenWallet={() => {
            setVenue("bittensor");
            setTab("wallet");
          }}
        />
        {venue === "bittensor" ? (
          <div className="mt-3 grid grid-cols-1 gap-1 rounded-xl bg-dls-surface-muted/35 p-1 sm:grid-cols-5">
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
                <div className="rounded-xl bg-[var(--protocol-desk-soft)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--protocol-desk-accent)]">{activeVenue.eyebrow}</div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Metric label="Interface" value={activeVenue.statusLabel} compact />
                  <Metric label="Can submit" value={activeVenue.canSubmit} compact />
                  <Metric label="Live submission" value={activeVenue.liveSubmission} compact />
                  <Metric label="Signer" value={activeVenue.signer} compact />
                </div>
                <p className="text-xs leading-5 text-dls-secondary">
                  Source: {activeVenue.source}. Ask the {activeVenue.label} Agent in plain English, review cards, then use an external wallet/client only when an approved handoff requires it.
                </p>
              </div>
            </Section>

            <Section title={venue === "hyperliquid" ? "Standard Hyperliquid actions" : "Standard Polymarket actions"} icon={<BrainCircuit className="size-4" />}>
              <p className="mb-3 text-xs leading-5 text-dls-secondary">
                These stage editable {activeVenue.label} Agent tasks in the composer. One-click tasks stay short; the full instruction stays editable before you send. They do not auto-send, sign, submit, place orders, bet, or ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.
              </p>
              <div className="grid gap-2">
                {activeVenue.prompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="rounded-xl bg-dls-surface-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-[var(--protocol-desk-soft)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--protocol-desk-rgb),0.30)]"
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

            <Section title={venue === "hyperliquid" ? "Exchange preview controls" : "Market preview controls"} icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="rounded-xl bg-[var(--protocol-desk-soft)] px-3 py-2.5">
                  <p className="text-xs font-semibold text-dls-text">Read-only market context</p>
                  <p className="mt-1 text-[11px] leading-5 text-dls-secondary">
                    Preview boundary: show the user what can be read, what context is missing, and why no market action can submit from Matterhorn.
                  </p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Metric label="Readiness" value={venue === "hyperliquid" ? hyperliquidReadinessState : polymarketReadinessState} compact />
                  <Metric label="Execution" value={marketVenueState(venue)} compact />
                  <Metric label="Can submit" value={marketExecutionSubmissionState} compact />
                  <Metric label="SDK evidence" value={marketSdkValidationState} compact />
                </div>
                <Notice tone="info" icon={<Shield className="size-4" />} title="Preview-only boundary">
                  {activeVenue.label} is separated from Bittensor because it has a different risk model. This desk supports read, preview, watch, external-signer request evidence, and receipt review. It does not submit live market orders or accept private keys, API secrets, raw signatures, signed payloads, or wallet exports.
                </Notice>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand(venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate")}>
                    {copiedCustomerCommand === (venue === "hyperliquid" ? "hyperliquidWatchCreate" : "polymarketWatchCreate") ? "Copied" : `Create ${activeVenue.shortLabel} watch`}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("executionChainSignRequest")}>
                    {copiedCustomerCommand === "executionChainSignRequest" ? "Copied" : "Copy external-signer examples"}
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
                <div className="rounded-xl bg-[var(--protocol-desk-soft)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--protocol-desk-accent)]">{activeVenue.eyebrow}</div>
                  <h3 className="mt-2 text-sm font-semibold leading-5 text-dls-text">{activeVenue.headline}</h3>
                  <p className="mt-2 text-xs leading-5 text-dls-secondary">{activeVenue.description}</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
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
            <Section title="Standard Bittensor actions" icon={<BrainCircuit className="size-4" />}>
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

            <Section title="Monday beta scenarios" icon={<Star className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Use these five guided scripts for the first 10 customer demos. Each task is editable and each evidence command is fixture/offline unless you supply public inputs.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {MONDAY_BETA_DEMO_SCENARIOS.map((scenario) => {
                  const copied = copiedCustomerCommand === `monday-beta:${scenario.id}`;
                  return (
                    <div key={scenario.id} className="rounded-xl bg-dls-surface-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-dls-text">{scenario.displayName}</p>
                          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{scenario.targetCustomerPersona}</p>
                        </div>
                        <span className="rounded-md bg-dls-card px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
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

            <Section title="Monday beta launch checklist" icon={<Shield className="size-4" />}>
              <p className="text-[11px] leading-5 text-dls-secondary">
                Run this launch-room checklist before each Monday beta customer call. Every command is local, public/redacted, and evidence-oriented; none signs, submits, custodies, or broadcasts.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {MONDAY_BETA_LAUNCH_CHECKLIST.map((item) => {
                  const copied = copiedCustomerCommand === item.commandKey;
                  return (
                    <div key={item.id} className="rounded-xl bg-dls-surface-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-dls-text">{item.title}</p>
                          <p className="mt-1 text-[11px] leading-5 text-dls-secondary">{item.proof}</p>
                        </div>
                        <span className="rounded-md bg-[rgba(var(--matterhorn-blue-rgb),0.12)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-sky-200">
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
              <Notice tone="info" icon={<Shield className="size-4" />} title="Monday beta promise">
                Bittensor is the most mature beta path. Hyperliquid and Polymarket are separate preview desks with external-signer language. Longevity is a standalone workflow surface, not Web3 and not medical care.
              </Notice>
            </Section>

            <Section title="Safety status" icon={<Shield className="size-4" />}>
              <div className="grid grid-cols-1 gap-2">
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Most complete beta flow. External signer required for actions; Matterhorn never holds keys.
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Hyperliquid</p>
                  <p className="mt-1 break-words text-[11px] leading-5 text-dls-secondary">
                    Preview only, live submission off. Can submit: No.
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Customer readiness smoke</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm smoke:customer-ready-crypto</code>
                </div>
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                  <p className="text-xs font-semibold text-dls-text">Bittensor beta packet</p>
                  <code className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">pnpm beta:bittensor:packet</code>
                </div>
                <div className="min-w-0 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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

            <Section title="Desktop beta" icon={<ExternalLink className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  First-run tester path: build an unsigned local DMG/ZIP, run the desktop beta doctor, then capture install, launch, readiness, and safety evidence before a customer session.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Bittensor: Beta-ready</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Read, preview, watches, receipts, and external-signer handoff.</p>
                  </div>
                  <div className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold text-dls-text">Hyperliquid/Polymarket: Preview only</p>
                    <p className="mt-1 text-[11px] leading-5 text-dls-secondary">Can submit: No. Live submission: Off. No market submit.</p>
                  </div>
                  <div className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                    <div key={label} className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                    className="rounded-xl bg-dls-surface-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-dls-hover"
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
                  <div className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                  <div className="rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                  <div key={item} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
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
              <label className="mt-3 flex items-center gap-2 rounded-xl bg-dls-surface-muted/40 px-3 py-2">
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
                  The subnet browser is live-data backed, not hardcoded. Reconnect the Matterhorn Work server or refresh this desk, then the full subnet list will appear here with search by netuid, name, symbol, category, or utility.
                </Notice>
              ) : filteredSubnets.length === 0 ? (
                <Notice tone="info" icon={<Search className="size-4" />} title="No matching subnets">
                  Clear the search or try a category like image, data, inference, validator, or compute.
                </Notice>
              ) : (
                <div className="mt-3 divide-y divide-dls-border/70 overflow-hidden rounded-xl bg-dls-surface-muted/30">
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
                  className="h-11 w-full rounded-xl bg-dls-surface-muted/40 px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary focus:ring-2 focus:ring-[rgba(var(--protocol-desk-rgb),0.32)]"
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
                      <div key={`${position.netuid}:${position.validatorHotkey}`} className="rounded-xl bg-dls-surface-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-dls-text">{position.subnetName}</div>
                            <div className="text-xs text-dls-secondary">Subnet {position.netuid}</div>
                          </div>
                          <span className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-sky-300">
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
            <Notice tone="info" icon={<Shield className="size-4" />} title="Unsigned action flow">
              Matterhorn prepares Bittensor action previews for review. External Bittensor-compatible signing is required, and nothing is broadcast from this panel.
            </Notice>
            <Section title="Standard Bittensor actions" icon={<BrainCircuit className="size-4" />}>
              <div className="space-y-3">
                <p className="text-sm leading-6 text-dls-secondary">
                  Start from the common Bittensor workflows below. These stage an editable Bittensor Agent task with public context;
                  they do not auto-send, sign, broadcast, stake, unstake, transfer, or ask for wallet secrets.
                </p>
                <BittensorStandardActionList onAction={(item) => void askAgentForStandardBittensorAction(item)} />
              </div>
            </Section>
            <Section title="Prepare an unsigned preview" icon={<ArrowUpDown className="size-4" />}>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-lg bg-[var(--protocol-desk-soft)] px-3 py-2.5 text-xs leading-5 text-dls-secondary">
                    <div className="font-semibold text-[var(--protocol-desk-accent)]">How this works</div>
                    <div className="mt-1">
                      Choose an action, add only public routing details, then review the quote. Matterhorn does not sign,
                      broadcast, stake, unstake, transfer, or move TAO; the next step is always an external Bittensor-compatible signer.
                    </div>
                  </div>
                  <div className="rounded-lg bg-dls-surface-muted/40 px-3 py-2.5 text-xs leading-5 text-dls-secondary">
                    <div className="font-semibold text-dls-text">Public fields only</div>
                    <ul className="mt-1.5 space-y-1">
                      <li>Use netuid, amount, validator hotkey, recipient coldkey, or SS58 public address.</li>
                      <li>Never paste seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.</li>
                      <li>Ask the Bittensor Agent to review the preview before signing externally.</li>
                    </ul>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-dls-border/50">
                  {(["stake", "unstake", "transfer", "compare"] as ActionType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "border-b-2 px-0 pb-2 pt-1 text-left text-xs font-semibold capitalize transition-colors",
                        action === item
                          ? "border-[var(--protocol-desk-accent)] text-[var(--protocol-desk-accent)]"
                          : "border-transparent text-dls-secondary hover:text-dls-text",
                      )}
                      onClick={() => setAction(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {action !== "transfer" && (
                    <LabeledInput label="Subnet netuid" value={actionNetuid} onChange={setActionNetuid} hint="Example: 14. A subnet is the Bittensor market you are acting in." />
                  )}
                  {action !== "compare" && (
                    <LabeledInput label="Amount TAO" value={amountTao} onChange={setAmountTao} hint="The amount to preview. This is not submitted from Matterhorn." />
                  )}
                  {(action === "stake" || action === "unstake") && (
                    <LabeledInput label="Validator hotkey" value={validatorHotkey} onChange={setValidatorHotkey} hint="Paste a public validator hotkey. Never paste a seed phrase or private key." />
                  )}
                  {action === "transfer" && (
                    <LabeledInput label="Recipient coldkey" value={recipient} onChange={setRecipient} hint="Paste the public destination coldkey only." />
                  )}
                </div>
                <div className="grid gap-3 rounded-lg bg-dls-surface-muted/35 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="text-xs leading-5 text-dls-secondary">
                    Missing context is safe. The Bittensor Agent can ask for the exact public netuid, hotkey, recipient, or address before a preview is trusted. This button creates an unsigned preview only.
                  </div>
                  <Button className="gap-1.5 rounded-md bg-[var(--protocol-desk-accent)] text-[var(--matterhorn-ink)] hover:opacity-90" onClick={requestQuote} disabled={quoteLoading}>
                    {quoteLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpDown className="size-4" />}
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
    <div className="rounded-lg bg-[linear-gradient(145deg,rgba(var(--protocol-desk-rgb),0.06),rgba(var(--protocol-desk-rgb),0.015)),var(--dls-card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-dls-text">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[rgba(var(--protocol-desk-rgb),0.16)] text-[var(--protocol-desk-accent)]">{icon}</span>
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
    <div className="divide-y divide-dls-border/50">
      {BITTENSOR_STANDARD_ACTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="group grid w-full gap-3 rounded-md px-2.5 py-3 text-left transition-colors hover:bg-[var(--protocol-desk-soft)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[rgba(var(--protocol-desk-rgb),0.32)] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
          onClick={() => onAction(item)}
        >
          <span
            aria-label={`Step ${item.step}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--protocol-desk-soft)] text-xs font-semibold text-[var(--protocol-desk-accent)]"
          >
            {item.step}
          </span>
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
  onOpenWallet,
}: {
  venue: CryptoVenue;
  watchAddress: string;
  wallet: BittensorWalletSnapshot | null;
  onOpenWallet: () => void;
}) {
  const label = venue === "bittensor" ? "SS58 public wallet" : "External wallet/client";
  const value = venue === "bittensor"
    ? (watchAddress.trim() ? shortAddress(watchAddress.trim()) : "Not connected")
    : "Preview-only beta";
  return (
    <div className="rounded-xl bg-dls-surface-muted/35 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-dls-text">
            <Wallet className="size-4 text-[var(--protocol-desk-accent)]" />
            Matterhorn Wallet
          </div>
          <div className="mt-1 text-xs leading-5 text-dls-secondary">
            {label}: <span className="font-mono text-dls-text">{value}</span>
            {venue === "bittensor" && wallet?.providerStatus === "ok" ? (
              <span> · {formatNumber(wallet.estimatedValueTao)} TAO tracked</span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-dls-secondary">
            One wallet layer is the product direction. Today this beta uses public reads and external signer/client handoffs; Matterhorn never takes custody or secrets.
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={onOpenWallet}>
          {venue === "bittensor" ? "Open wallet" : "Wallet status"}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-dls-surface-muted/40 p-3.5", compact && "p-3")}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-dls-secondary">{label}</div>
      <div className={cn("mt-1.5 break-words font-mono font-semibold leading-snug text-dls-text", compact ? "text-sm" : "text-xl")}>{value}</div>
    </div>
  );
}

function Notice({ tone, icon, title, children }: { tone: "info" | "warning"; icon: ReactNode; title: string; children: ReactNode }) {
  const classes = tone === "warning"
    ? "bg-amber-500/10 text-amber-200"
    : "bg-[var(--protocol-desk-soft)] text-[var(--protocol-desk-accent)]";
  return (
    <div className={cn("mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5", classes)}>
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
        "bg-dls-surface transition-colors",
        selected ? "bg-[var(--protocol-desk-soft)]" : "hover:bg-dls-hover",
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
      <div className="rounded-xl bg-dls-surface-muted/35 p-4 text-sm text-dls-secondary">
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
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Use cases</div>
        <div className="space-y-1.5">
          {detail.knownUseCases.map((item) => (
            <div key={item} className="rounded-lg bg-dls-surface-muted/40 px-3 py-2 text-xs text-dls-text">{item}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Top validators</div>
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
        className="h-10 w-full rounded-lg bg-dls-surface-muted/40 px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary focus:ring-2 focus:ring-[rgba(var(--protocol-desk-rgb),0.32)]"
      />
      {hint ? <span className="mt-1 block text-[11px] leading-5 text-dls-secondary">{hint}</span> : null}
    </label>
  );
}
