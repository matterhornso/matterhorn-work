/**
 * Bittensor read tools.
 *
 * V1 is intentionally read-only plus quote-only. Matterhorn never handles
 * seed phrases or private keys; signed actions must use an external wallet.
 */

import { ApiClient } from "./api-client.js";

const TAO_APP_BASE_URL = "https://api.tao.app";
const CACHE_MS = 60_000;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export type BittensorProviderStatus = "ok" | "provider_unavailable";

export interface BittensorSubnetSummary {
  netuid: number;
  name: string;
  symbol: string;
  category: string;
  benefitSummary: string;
  ownerColdkey: string | null;
  ownerHotkey: string | null;
  priceTao: number | null;
  emission: number | null;
  tempo: number | null;
  updatedAt: string;
  source: string;
}

export interface BittensorSubnetDetail extends BittensorSubnetSummary {
  metagraphSummary: {
    neurons: number | null;
    totalStake: number | null;
    block: number | null;
  };
  topValidators: Array<{
    uid: number | null;
    hotkey: string | null;
    coldkey: string | null;
    stake: number | null;
    trust: number | null;
    dividends: number | null;
  }>;
  knownUseCases: string[];
  risks: string[];
  links: Array<{ label: string; url: string }>;
}

export interface BittensorStakePosition {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  alphaAmount: number | null;
  taoValue: number | null;
  slippageRisk: "unknown" | "low" | "medium" | "high";
}

export interface BittensorWalletSnapshot {
  ss58Address: string;
  taoBalance: number | null;
  stakePositions: BittensorStakePosition[];
  estimatedValueTao: number | null;
  providerStatus: BittensorProviderStatus;
  updatedAt: string;
  message?: string;
}

export interface BittensorActionQuote {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid: number | null;
  amountTao: number | null;
  expectedAlpha: number | null;
  feeTao: number | null;
  slippageBps: number | null;
  warnings: string[];
  requiresExternalSignature: true;
}

export interface BittensorProvider {
  listSubnets(): Promise<BittensorSubnetSummary[]>;
  getSubnet(netuid: number): Promise<BittensorSubnetDetail>;
  getWallet(ss58Address: string): Promise<BittensorWalletSnapshot>;
  quoteAction(input: BittensorActionQuoteInput): Promise<BittensorActionQuote>;
}

export type BittensorActionQuoteInput = {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid?: number | null;
  amountTao?: number | string | null;
  validatorHotkey?: string | null;
  recipient?: string | null;
};

export type BittensorChatIntent =
  | "learn"
  | "discover"
  | "wallet"
  | "stake_plan"
  | "subnet_use"
  | "monitor";

export interface BittensorPlan {
  intent: BittensorChatIntent;
  confidence: number;
  summary: string;
  userGoal: string;
  netuids: number[];
  ss58Address: string | null;
  steps: string[];
  suggestedToolNames: string[];
  safetyNotes: string[];
  responseCards: Array<
    | "subnet_comparison"
    | "wallet_snapshot"
    | "validator_selection"
    | "staking_quote"
    | "signed_action_review"
    | "subnet_result"
    | "watchlist"
  >;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export interface BittensorCapabilityManifest {
  netuid: number;
  name: string;
  category: string;
  utilitySummary: string;
  supportedChatIntents: BittensorChatIntent[];
  serviceAdapter:
    | "universal"
    | "inference"
    | "data_search"
    | "compute"
    | "creative_media"
    | "agent_tooling"
    | "unsupported";
  requiredAuth: "none" | "api_key" | "external_wallet" | "unknown";
  costModel: "free_read" | "tao_fee" | "provider_priced" | "unknown";
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  safetyNotes: string[];
}

export interface BittensorSignerStatus {
  mode: "read_only" | "injected_substrate" | "desktop_handoff" | "sidecar";
  available: boolean;
  canSign: boolean;
  canSubmit: boolean;
  network: "finney" | "test" | "local";
  address: string | null;
  message: string;
}

export type BittensorExtrinsicAction =
  | "stake"
  | "unstake"
  | "move_stake"
  | "transfer"
  | "set_child_hotkey"
  | "register"
  | "serve";

export interface BittensorExtrinsicPreview {
  action: BittensorExtrinsicAction;
  network: "finney" | "test" | "local";
  netuid: number | null;
  amountTao: number | null;
  coldkey: string | null;
  hotkey: string | null;
  destination: string | null;
  feeTao: number | null;
  slippageBps: number | null;
  expectedAlpha: number | null;
  unsignedPayload: Record<string, unknown>;
  signer: BittensorSignerStatus;
  warnings: string[];
  consequenceSummary: string;
  requiresExternalSignature: true;
}

export interface BittensorSignedResult {
  status: "submitted" | "sidecar_unavailable" | "rejected" | "invalid_signature";
  txHash: string | null;
  blockHash: string | null;
  message: string;
  explorerUrl: string | null;
}

export interface BittensorSubnetInvocation {
  netuid: number;
  intent: "explain" | "metagraph" | "stake_guidance" | "wallet_guidance" | "service_call";
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  supported: boolean;
  result: Record<string, unknown>;
  message: string;
  warnings: string[];
}

export type BittensorWatch = {
  id: string;
  kind: "subnet" | "wallet" | "validator" | "emissions" | "slippage";
  label: string;
  netuid: number | null;
  ss58Address: string | null;
  threshold: number | null;
  createdAt: string;
};

export type BittensorExtrinsicPrepareInput = {
  action: BittensorExtrinsicAction;
  netuid?: number | null;
  amountTao?: number | string | null;
  coldkey?: string | null;
  hotkey?: string | null;
  destination?: string | null;
  originNetuid?: number | null;
  destinationNetuid?: number | null;
  rateTolerance?: number | null;
};

export type BittensorSignedSubmitInput = {
  preview: BittensorExtrinsicPreview;
  signature?: string | null;
  signerAddress?: string | null;
};

export type BittensorSubnetInvokeInput = {
  intent?: BittensorSubnetInvocation["intent"];
  task?: string | null;
  ss58Address?: string | null;
};

type CacheEntry<T> = { at: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();
const watchlist = new Map<string, BittensorWatch>();

const FALLBACK_SUBNETS: BittensorSubnetSummary[] = [
  {
    netuid: 0,
    name: "Root Network",
    symbol: "ROOT",
    category: "Network coordination",
    benefitSummary: "Coordinates network-wide incentives and delegation context across Bittensor.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
  {
    netuid: 1,
    name: "Subnet 1",
    symbol: "SN1",
    category: "Intelligence market",
    benefitSummary: "A Bittensor subnet whose current utility should be verified from live metadata before acting.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
  {
    netuid: 14,
    name: "TAOHash",
    symbol: "SN14",
    category: "Compute and infrastructure",
    benefitSummary: "A documented subnet example useful for testing metagraph and validator views.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function taoAppClient(): ApiClient {
  const apiKey = readEnv("TAO_APP_API_KEY");
  return new ApiClient({
    baseUrl: TAO_APP_BASE_URL,
    headers: apiKey ? { "X-API-Key": apiKey } : {},
    timeout: 12_000,
  });
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fetcher();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["data", "items", "results", "subnets", "rows"]) {
    const field = record[key];
    if (Array.isArray(field)) return field;
  }
  return [];
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function inferCategory(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (/(image|video|media|render|vision)/.test(text)) return "Creative AI";
  if (/(compute|gpu|hash|inference|hosting|cloud)/.test(text)) return "Compute and infrastructure";
  if (/(data|crawl|search|index|knowledge|retrieval)/.test(text)) return "Data and knowledge";
  if (/(agent|tool|automation|workflow)/.test(text)) return "Agent tools";
  if (/(finance|trading|market|prediction|risk)/.test(text)) return "Financial intelligence";
  if (/(health|biology|science|research)/.test(text)) return "Science and research";
  return "Intelligence market";
}

function benefitFor(category: string, description: string): string {
  if (description) return description;
  const benefits: Record<string, string> = {
    "Creative AI": "Can help users generate, evaluate, or route creative AI work.",
    "Compute and infrastructure": "Can help users access decentralized compute, model serving, or infrastructure capacity.",
    "Data and knowledge": "Can help users retrieve, index, or reason over specialized data sources.",
    "Agent tools": "Can provide agent-facing capabilities that Matterhorn workflows may call or evaluate.",
    "Financial intelligence": "Can support market analysis, risk review, or crypto-native research workflows.",
    "Science and research": "Can support domain-specific research and analysis tasks.",
    "Network coordination": "Helps users understand Bittensor-wide incentive and delegation context.",
  };
  return benefits[category] ?? "A Bittensor subnet. Verify live metadata before relying on its current utility.";
}

function normalizeSubnet(value: unknown): BittensorSubnetSummary | null {
  const record = asRecord(value);
  const netuid = firstNumber(record, ["netuid", "net_uid", "uid", "subnet_id", "id"]);
  if (netuid === null) return null;

  const name =
    firstString(record, ["subnet_name", "name", "display_name", "identity_name"]) ??
    `Subnet ${netuid}`;
  const symbol =
    firstString(record, ["symbol", "subnet_symbol", "ticker"]) ??
    (netuid === 0 ? "ROOT" : `SN${netuid}`);
  const description =
    firstString(record, ["description", "subtitle", "summary", "emission_summary", "subnet_description"]) ?? "";
  const category = inferCategory(name, description);
  const updatedAt =
    firstString(record, ["updated_at", "timestamp", "created_at"]) ??
    nowIso();

  return {
    netuid,
    name,
    symbol,
    category,
    benefitSummary: benefitFor(category, description),
    ownerColdkey: firstString(record, ["owner_coldkey", "ownerColdkey", "coldkey"]),
    ownerHotkey: firstString(record, ["owner_hotkey", "ownerHotkey", "hotkey"]),
    priceTao: firstNumber(record, ["price", "price_tao", "moving_price", "alpha_price", "subnet_price"]),
    emission: firstNumber(record, ["emission", "subnet_emission", "alpha_out_emission", "tao_in_emission"]),
    tempo: firstNumber(record, ["tempo"]),
    updatedAt,
    source: "tao.app",
  };
}

function fallbackSubnet(netuid: number): BittensorSubnetSummary {
  return FALLBACK_SUBNETS.find((subnet) => subnet.netuid === netuid) ?? {
    netuid,
    name: `Subnet ${netuid}`,
    symbol: `SN${netuid}`,
    category: "Intelligence market",
    benefitSummary: "Live metadata was unavailable. Verify this subnet before making decisions.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  };
}

function knownUseCasesFor(category: string): string[] {
  const common = ["Ask Matterhorn to explain the subnet in plain English", "Compare live metrics with similar subnets"];
  const byCategory: Record<string, string[]> = {
    "Creative AI": ["Route creative generation or evaluation tasks", "Monitor media-oriented subnet performance"],
    "Compute and infrastructure": ["Evaluate decentralized compute capacity", "Track validator and miner activity"],
    "Data and knowledge": ["Find specialized datasets or retrieval providers", "Compare data freshness and coverage"],
    "Agent tools": ["Discover subnet capabilities that can extend agent workflows", "Assess whether a subnet exposes useful APIs"],
    "Financial intelligence": ["Research market-related signals", "Review risk before staking exposure"],
    "Science and research": ["Explore domain-specific research support", "Track research-oriented subnet maturity"],
    "Network coordination": ["Understand network-level incentives", "Review delegation context"],
  };
  return [...(byCategory[category] ?? []), ...common];
}

function risksFor(summary: BittensorSubnetSummary): string[] {
  const risks = [
    "Subnet utility and participants can change quickly; verify live metadata.",
    "Staking and unstaking are subnet-local and can involve alpha-token slippage.",
    "Matterhorn v1 cannot sign or broadcast Bittensor transactions.",
  ];
  if (summary.source === "curated-fallback") {
    risks.unshift("Live provider data is unavailable; this summary may be incomplete.");
  }
  if (summary.priceTao === null) risks.push("Live alpha price was unavailable.");
  return risks;
}

function extractMetagraphSummary(raw: unknown): BittensorSubnetDetail["metagraphSummary"] {
  const record = asRecord(raw);
  const nested = asRecord(record.data ?? record.metagraph ?? record.info ?? raw);
  return {
    neurons: firstNumber(nested, ["n", "neurons", "num_uids", "active_neurons"]),
    totalStake: firstNumber(nested, ["total_stake", "totalStake", "stake"]),
    block: firstNumber(nested, ["block", "block_number", "blockNumber"]),
  };
}

function extractTopValidators(raw: unknown): BittensorSubnetDetail["topValidators"] {
  const record = asRecord(raw);
  const rows = arrayFrom(record.neurons ?? record.validators ?? record.data ?? raw);
  return rows
    .map((row) => {
      const r = asRecord(row);
      return {
        uid: firstNumber(r, ["uid", "id"]),
        hotkey: firstString(r, ["hotkey", "hotkey_ss58", "hotkeyAddress"]),
        coldkey: firstString(r, ["coldkey", "coldkey_ss58", "coldkeyAddress"]),
        stake: firstNumber(r, ["stake", "total_stake", "tao_stake", "alpha_stake"]),
        trust: firstNumber(r, ["trust", "validator_trust", "rank"]),
        dividends: firstNumber(r, ["dividends", "dividend"]),
      };
    })
    .sort((a, b) => (b.stake ?? 0) - (a.stake ?? 0))
    .slice(0, 8);
}

export function isValidSs58Address(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 32 && trimmed.length <= 64 && BASE58_RE.test(trimmed);
}

export function parseAmountTao(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildBittensorQuote(input: BittensorActionQuoteInput, subnet?: BittensorSubnetSummary): BittensorActionQuote {
  const amountTao = parseAmountTao(input.amountTao);
  const netuid = typeof input.netuid === "number" && Number.isFinite(input.netuid) ? input.netuid : null;
  const warnings: string[] = [
    "Quote only. Matterhorn v1 cannot sign or broadcast Bittensor transactions.",
    "Use an external Bittensor-compatible wallet to review and sign.",
  ];

  if (input.action === "stake" || input.action === "unstake") {
    if (netuid === null) warnings.push("Subnet netuid is required before staking or unstaking.");
    if (!amountTao) warnings.push("Enter a positive TAO amount before acting.");
    warnings.push("Subnet staking uses alpha tokens and may have slippage.");
  }
  if (input.action === "transfer") {
    if (!amountTao) warnings.push("Enter a positive TAO amount before transferring.");
    if (input.recipient && !isValidSs58Address(input.recipient)) warnings.push("Recipient does not look like a valid SS58 address.");
  }
  if (input.validatorHotkey && !isValidSs58Address(input.validatorHotkey)) {
    warnings.push("Validator hotkey does not look like a valid SS58 address.");
  }

  const price = subnet?.priceTao && subnet.priceTao > 0 ? subnet.priceTao : null;
  const expectedAlpha = amountTao && price ? amountTao / price : null;
  const slippageBps = amountTao && amountTao > 10 ? 150 : amountTao && amountTao > 1 ? 75 : amountTao ? 25 : null;

  if (!price && (input.action === "stake" || input.action === "unstake")) {
    warnings.push("Live subnet price was unavailable, so expected alpha is unknown.");
  }

  return {
    action: input.action,
    netuid,
    amountTao,
    expectedAlpha,
    feeTao: input.action === "compare" ? null : 0.0001,
    slippageBps,
    warnings,
    requiresExternalSignature: true,
  };
}

function extractNetuids(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\b(?:netuid|subnet|sn)\s*#?\s*(\d{1,3})\b/gi)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0) ids.add(value);
  }
  for (const match of text.matchAll(/\bSN(\d{1,3})\b/g)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0) ids.add(value);
  }
  return [...ids].slice(0, 8);
}

function extractSs58(text: string): string | null {
  const candidates = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,64}\b/g) ?? [];
  return candidates.find((candidate) => isValidSs58Address(candidate)) ?? null;
}

function classifyBittensorIntent(text: string): { intent: BittensorChatIntent; confidence: number } {
  const lower = text.toLowerCase();
  if (/(watch|alert|monitor|notify|track)/.test(lower)) return { intent: "monitor", confidence: 0.86 };
  if (/(i'?m new|explain|what is|teach me|learn|beginner)/.test(lower)) return { intent: "learn", confidence: 0.86 };
  if (/(stake|unstake|delegate|delegat|transfer|move stake|hotkey|coldkey|validator|slippage|alpha)/.test(lower)) return { intent: "stake_plan", confidence: 0.9 };
  if (/(wallet|balance|position|portfolio|my tao|show me my tao|allocation)/.test(lower)) return { intent: "wallet", confidence: 0.88 };
  if (/(use|run|call|invoke|ask subnet|submit.*to subnet|send.*to subnet)/.test(lower)) return { intent: "subnet_use", confidence: 0.78 };
  if (/(find|which|compare|best|recommend|discover|image|video|data|compute|agent|tool|subnet)/.test(lower)) return { intent: "discover", confidence: 0.82 };
  return { intent: "learn", confidence: /bittensor|tao|subnet/.test(lower) ? 0.8 : 0.55 };
}

function toolsForIntent(intent: BittensorChatIntent): string[] {
  const common = ["bittensor_plan_from_chat"];
  switch (intent) {
    case "learn":
      return [...common, "bittensor_list_subnets", "bittensor_explain_subnet"];
    case "discover":
      return [...common, "bittensor_find_subnets_for_goal", "bittensor_compare_subnets"];
    case "wallet":
      return [...common, "bittensor_get_wallet_positions"];
    case "stake_plan":
      return [...common, "bittensor_prepare_extrinsic", "bittensor_prepare_action"];
    case "subnet_use":
      return [...common, "bittensor_get_subnet_capabilities", "bittensor_invoke_subnet"];
    case "monitor":
      return [...common, "bittensor_create_watch"];
  }
}

function cardsForIntent(intent: BittensorChatIntent): BittensorPlan["responseCards"] {
  switch (intent) {
    case "learn":
      return ["subnet_result"];
    case "discover":
      return ["subnet_comparison"];
    case "wallet":
      return ["wallet_snapshot"];
    case "stake_plan":
      return ["staking_quote", "signed_action_review"];
    case "subnet_use":
      return ["subnet_result"];
    case "monitor":
      return ["watchlist"];
  }
}

function stepsForIntent(intent: BittensorChatIntent): string[] {
  switch (intent) {
    case "learn":
      return ["Explain the concept in beginner language", "Map jargon to coldkey, hotkey, subnet, validator, alpha, and TAO", "Offer one safe next action"];
    case "discover":
      return ["Translate the user goal into subnet categories", "Find matching subnets", "Compare utility, freshness, emissions, and risks"];
    case "wallet":
      return ["Validate the SS58 public address", "Read wallet allocation and stake positions", "Summarize exposure and provider freshness"];
    case "stake_plan":
      return ["Identify action, netuid, hotkey or recipient, and amount", "Build a non-custodial extrinsic preview", "Show fee, slippage, warnings, and external signing requirement"];
    case "subnet_use":
      return ["Check subnet capability manifest", "Call a supported adapter if one exists", "Otherwise explain what Matterhorn can do today and what adapter is missing"];
    case "monitor":
      return ["Create a watchlist entry", "Track subnet, wallet, validator, emission, or slippage state", "Report future changes in plain language"];
  }
}

export function planBittensorChat(input: { message: string; ss58Address?: string | null }): BittensorPlan {
  const message = String(input.message ?? "").trim();
  const { intent, confidence } = classifyBittensorIntent(message);
  const netuids = extractNetuids(message);
  const ss58Address = input.ss58Address && isValidSs58Address(input.ss58Address)
    ? input.ss58Address
    : extractSs58(message);
  const needsWallet = intent === "wallet" && !ss58Address;
  const needsStakeDetails = intent === "stake_plan" && !netuids.length && !/(transfer)/i.test(message);

  return {
    intent,
    confidence,
    summary: `Matterhorn will handle this as a Bittensor ${intent.replace("_", " ")} workflow.`,
    userGoal: message,
    netuids,
    ss58Address,
    steps: stepsForIntent(intent),
    suggestedToolNames: toolsForIntent(intent),
    safetyNotes: [
      "Matterhorn never asks for seed phrases, private keys, or mnemonics.",
      "Bittensor signed actions require an external signer.",
      "Subnet staking is Dynamic TAO exposure; alpha price and slippage can change the final TAO outcome.",
    ],
    responseCards: cardsForIntent(intent),
    requiresClarification: needsWallet || needsStakeDetails,
    clarificationQuestion: needsWallet
      ? "Which SS58 coldkey public address should I inspect?"
      : needsStakeDetails
        ? "Which subnet netuid should this staking plan use?"
        : null,
  };
}

function adapterForCategory(category: string): BittensorCapabilityManifest["serviceAdapter"] {
  if (category === "Creative AI") return "creative_media";
  if (category === "Compute and infrastructure") return "compute";
  if (category === "Data and knowledge") return "data_search";
  if (category === "Agent tools") return "agent_tooling";
  if (category === "Intelligence market") return "inference";
  return "universal";
}

export function capabilityFromSubnet(subnet: BittensorSubnetSummary): BittensorCapabilityManifest {
  const adapter = adapterForCategory(subnet.category);
  return {
    netuid: subnet.netuid,
    name: subnet.name,
    category: subnet.category,
    utilitySummary: subnet.benefitSummary,
    supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "monitor", "subnet_use"],
    serviceAdapter: adapter,
    requiredAuth: adapter === "universal" ? "none" : "unknown",
    costModel: adapter === "universal" ? "free_read" : "unknown",
    requestSchema: {
      type: "object",
      properties: {
        intent: { enum: ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"] },
        task: { type: "string" },
        ss58Address: { type: "string" },
      },
    },
    resultSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        result: { type: "object" },
        warnings: { type: "array", items: { type: "string" } },
      },
    },
    safetyNotes: [
      "Universal support covers explanation, metagraph, staking guidance, wallet context, and monitoring.",
      adapter === "universal"
        ? "No direct service adapter is configured for this subnet yet."
        : "Direct service calls require a subnet-specific adapter and may need auth or payment.",
      "Signed Bittensor actions require an external signer.",
    ],
  };
}

export async function listBittensorCapabilities(): Promise<BittensorCapabilityManifest[]> {
  const subnets = await bittensorProvider.listSubnets();
  return subnets.map(capabilityFromSubnet);
}

export async function getBittensorCapability(netuid: number): Promise<BittensorCapabilityManifest> {
  const detail = await bittensorProvider.getSubnet(netuid);
  return capabilityFromSubnet(detail);
}

export function getBittensorSignerStatus(address?: string | null): BittensorSignerStatus {
  const sidecar = readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL");
  if (sidecar) {
    return {
      mode: "sidecar",
      available: true,
      canSign: false,
      canSubmit: true,
      network: (readEnv("BITTENSOR_NETWORK") || "finney") as BittensorSignerStatus["network"],
      address: address && isValidSs58Address(address) ? address : null,
      message: "Subtensor sidecar is configured for signed payload submission. Signing still happens outside Matterhorn.",
    };
  }
  return {
    mode: "desktop_handoff",
    available: true,
    canSign: false,
    canSubmit: false,
    network: (readEnv("BITTENSOR_NETWORK") || "finney") as BittensorSignerStatus["network"],
    address: address && isValidSs58Address(address) ? address : null,
    message: "Matterhorn can prepare the action and hand it to an external Bittensor-compatible signer. It cannot sign or broadcast by itself.",
  };
}

function extrinsicQuoteAction(action: BittensorExtrinsicAction): BittensorActionQuoteInput["action"] {
  if (action === "stake") return "stake";
  if (action === "unstake") return "unstake";
  if (action === "transfer") return "transfer";
  return "compare";
}

function consequenceForPreview(input: BittensorExtrinsicPrepareInput, quote: BittensorActionQuote): string {
  const amount = quote.amountTao === null ? "the requested TAO amount" : `${quote.amountTao} TAO`;
  switch (input.action) {
    case "stake":
      return `If signed, this will stake ${amount} into subnet ${quote.netuid ?? input.netuid ?? "unknown"} and convert exposure into subnet alpha.`;
    case "unstake":
      return `If signed, this will unstake ${amount} from subnet ${quote.netuid ?? input.netuid ?? "unknown"} and convert alpha exposure back toward TAO.`;
    case "move_stake":
      return `If signed, this will move ${amount} of stake between subnets for the same coldkey/hotkey relationship.`;
    case "transfer":
      return `If signed, this will transfer ${amount} to ${input.destination ?? "the requested recipient"}.`;
    case "set_child_hotkey":
      return "If signed, this will change child/hotkey settings for the selected coldkey. Review this carefully in your external signer.";
    case "register":
      return "If signed, this will attempt a Bittensor registration action that may burn or lock TAO.";
    case "serve":
      return "If signed, this will publish serving metadata for a neuron on the selected subnet.";
  }
}

export async function prepareBittensorExtrinsic(input: BittensorExtrinsicPrepareInput): Promise<BittensorExtrinsicPreview> {
  const action = input.action;
  const quote = await bittensorProvider.quoteAction({
    action: extrinsicQuoteAction(action),
    netuid: input.netuid ?? input.originNetuid ?? null,
    amountTao: input.amountTao,
    validatorHotkey: input.hotkey ?? null,
    recipient: input.destination ?? null,
  });
  const coldkey = input.coldkey && isValidSs58Address(input.coldkey) ? input.coldkey : null;
  const hotkey = input.hotkey && isValidSs58Address(input.hotkey) ? input.hotkey : null;
  const destination = input.destination && isValidSs58Address(input.destination) ? input.destination : input.destination ?? null;
  const signer = getBittensorSignerStatus(coldkey);
  const warnings = [
    ...quote.warnings,
    "Unsigned preview only. Review the payload in an external Bittensor-compatible signer.",
  ];
  if (input.coldkey && !coldkey) warnings.push("Coldkey does not look like a valid SS58 address.");
  if (input.hotkey && !hotkey) warnings.push("Hotkey does not look like a valid SS58 address.");
  if (action === "transfer" && input.destination && !isValidSs58Address(input.destination)) {
    warnings.push("Destination does not look like a valid SS58 address.");
  }

  return {
    action,
    network: signer.network,
    netuid: quote.netuid ?? input.netuid ?? input.originNetuid ?? null,
    amountTao: quote.amountTao,
    coldkey,
    hotkey,
    destination,
    feeTao: quote.feeTao,
    slippageBps: quote.slippageBps,
    expectedAlpha: quote.expectedAlpha,
    unsignedPayload: {
      chain: "bittensor",
      network: signer.network,
      action,
      netuid: quote.netuid ?? input.netuid ?? null,
      originNetuid: input.originNetuid ?? null,
      destinationNetuid: input.destinationNetuid ?? null,
      amountTao: quote.amountTao,
      coldkey,
      hotkey,
      destination,
      rateTolerance: input.rateTolerance ?? 0.005,
      safeMode: true,
    },
    signer,
    warnings,
    consequenceSummary: consequenceForPreview(input, quote),
    requiresExternalSignature: true,
  };
}

export async function submitSignedBittensorExtrinsic(input: BittensorSignedSubmitInput): Promise<BittensorSignedResult> {
  if (!input.signature || input.signature.trim().length < 16) {
    return {
      status: "invalid_signature",
      txHash: null,
      blockHash: null,
      message: "A valid external signature is required before submission.",
      explorerUrl: null,
    };
  }

  const sidecar = readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL");
  if (!sidecar) {
    return {
      status: "sidecar_unavailable",
      txHash: null,
      blockHash: null,
      message: "Signed payload accepted by Matterhorn, but no Subtensor sidecar is configured to broadcast it.",
      explorerUrl: null,
    };
  }

  try {
    const res = await fetch(`${sidecar.replace(/\/$/, "")}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = asRecord(await res.json());
    const txHash = firstString(data, ["txHash", "hash", "extrinsicHash"]);
    const blockHash = firstString(data, ["blockHash", "block"]);
    return {
      status: "submitted",
      txHash,
      blockHash,
      message: "Signed Bittensor extrinsic submitted through the configured sidecar.",
      explorerUrl: txHash ? `https://taostats.io/extrinsic/${txHash}` : null,
    };
  } catch (err) {
    return {
      status: "rejected",
      txHash: null,
      blockHash: null,
      message: err instanceof Error ? err.message : "Subtensor sidecar rejected the signed payload.",
      explorerUrl: null,
    };
  }
}

export async function invokeBittensorSubnet(netuid: number, input: BittensorSubnetInvokeInput): Promise<BittensorSubnetInvocation> {
  const [detail, capability] = await Promise.all([
    bittensorProvider.getSubnet(netuid),
    getBittensorCapability(netuid),
  ]);
  const intent = input.intent ?? "explain";
  const warnings = capability.safetyNotes;

  if (intent === "metagraph") {
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: true,
      result: { metagraphSummary: detail.metagraphSummary, topValidators: detail.topValidators },
      message: `Metagraph context for ${detail.name}.`,
      warnings,
    };
  }
  if (intent === "stake_guidance") {
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: true,
      result: { subnet: detail, risks: detail.risks, priceTao: detail.priceTao },
      message: `Stake planning guidance for ${detail.name}. Signed staking still requires an external signer.`,
      warnings,
    };
  }
  if (intent === "wallet_guidance") {
    const wallet = input.ss58Address && isValidSs58Address(input.ss58Address)
      ? await bittensorProvider.getWallet(input.ss58Address)
      : null;
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: Boolean(wallet),
      result: { wallet, subnet: detail },
      message: wallet ? `Wallet exposure context for ${detail.name}.` : "Provide a valid SS58 coldkey public address for wallet guidance.",
      warnings,
    };
  }
  if (intent === "service_call") {
    return {
      netuid,
      intent,
      adapter: capability.serviceAdapter,
      supported: false,
      result: { capability, requestedTask: input.task ?? null },
      message: `Matterhorn can explain and monitor ${detail.name}, but no direct subnet service adapter is configured yet.`,
      warnings,
    };
  }

  return {
    netuid,
    intent: "explain",
    adapter: "universal",
    supported: true,
    result: { subnet: detail, capability },
    message: `${detail.name}: ${detail.benefitSummary}`,
    warnings,
  };
}

export function listBittensorWatches(): BittensorWatch[] {
  return [...watchlist.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createBittensorWatch(input: Partial<BittensorWatch>): BittensorWatch {
  const id = `bt-watch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const watch: BittensorWatch = {
    id,
    kind: input.kind ?? "subnet",
    label: input.label?.trim() || "Bittensor watch",
    netuid: typeof input.netuid === "number" && Number.isInteger(input.netuid) ? input.netuid : null,
    ss58Address: input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null,
    threshold: typeof input.threshold === "number" && Number.isFinite(input.threshold) ? input.threshold : null,
    createdAt: nowIso(),
  };
  watchlist.set(id, watch);
  return watch;
}

function normalizeStakePosition(value: unknown, subnets: BittensorSubnetSummary[]): BittensorStakePosition | null {
  const record = asRecord(value);
  const netuid = firstNumber(record, ["netuid", "net_uid", "subnet_id"]);
  if (netuid === null || netuid < 0) return null;
  const subnet = subnets.find((item) => item.netuid === netuid);
  const taoValue = firstNumber(record, ["tao_value", "taoValue", "value_tao", "stake_tao", "tao"]);
  const alphaAmount = firstNumber(record, ["alpha", "alpha_amount", "alphaAmount", "stake", "stake_alpha"]);
  const slippageRisk =
    taoValue === null ? "unknown" :
    taoValue > 100 ? "high" :
    taoValue > 10 ? "medium" :
    "low";

  return {
    netuid,
    subnetName: subnet?.name ?? firstString(record, ["subnet_name", "name"]) ?? `Subnet ${netuid}`,
    validatorHotkey: firstString(record, ["hotkey", "validator_hotkey", "delegate_hotkey"]),
    alphaAmount,
    taoValue,
    slippageRisk,
  };
}

export class TaoAppBittensorProvider implements BittensorProvider {
  async listSubnets(): Promise<BittensorSubnetSummary[]> {
    return cached("bittensor:subnets", async () => {
      try {
        const data = await taoAppClient().get("/api/beta/analytics/subnets/info");
        const normalized = arrayFrom(data).map(normalizeSubnet).filter(Boolean) as BittensorSubnetSummary[];
        return normalized.length ? normalized.sort((a, b) => a.netuid - b.netuid) : FALLBACK_SUBNETS;
      } catch {
        return FALLBACK_SUBNETS;
      }
    });
  }

  async getSubnet(netuid: number): Promise<BittensorSubnetDetail> {
    return cached(`bittensor:subnet:${netuid}`, async () => {
      const subnets = await this.listSubnets();
      let summary = subnets.find((item) => item.netuid === netuid) ?? fallbackSubnet(netuid);
      let metagraphRaw: unknown = null;

      try {
        const data = await taoAppClient().get(`/api/beta/analytics/subnets/info/${netuid}`);
        summary = normalizeSubnet(data) ?? summary;
      } catch {
        // Keep list/fallback summary.
      }

      try {
        metagraphRaw = await taoAppClient().get(`/api/beta/analytics/subnets/metagraph/${netuid}`);
      } catch {
        metagraphRaw = null;
      }

      return {
        ...summary,
        metagraphSummary: extractMetagraphSummary(metagraphRaw),
        topValidators: extractTopValidators(metagraphRaw),
        knownUseCases: knownUseCasesFor(summary.category),
        risks: risksFor(summary),
        links: [
          { label: "TAO.app", url: `https://www.tao.app/subnets/${netuid}` },
          { label: "Bittensor docs", url: "https://docs.learnbittensor.org/subnets/working-with-subnets" },
        ],
      };
    });
  }

  async getWallet(ss58Address: string): Promise<BittensorWalletSnapshot> {
    if (!isValidSs58Address(ss58Address)) {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "Address must be a valid watch-only SS58 public address.",
      };
    }

    if (!readEnv("TAO_APP_API_KEY")) {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "TAO_APP_API_KEY is not configured. Wallet portfolio endpoints are unavailable.",
      };
    }

    try {
      const [allocation, subnets] = await Promise.all([
        taoAppClient().get("/api/beta/portfolio/allocation", { coldkey: ss58Address }),
        this.listSubnets(),
      ]);
      const rows = arrayFrom(allocation);
      let taoBalance: number | null = null;
      const stakePositions = rows
        .map((row) => {
          const record = asRecord(row);
          const netuid = firstNumber(record, ["netuid", "net_uid", "subnet_id"]);
          if (netuid === -1) {
            taoBalance = firstNumber(record, ["tao", "tao_value", "balance", "amount"]);
            return null;
          }
          return normalizeStakePosition(row, subnets);
        })
        .filter(Boolean) as BittensorStakePosition[];
      const stakeTotal = stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
      return {
        ss58Address,
        taoBalance,
        stakePositions,
        estimatedValueTao: (taoBalance ?? 0) + stakeTotal,
        providerStatus: "ok",
        updatedAt: nowIso(),
      };
    } catch {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "Wallet provider data is unavailable for this address.",
      };
    }
  }

  async quoteAction(input: BittensorActionQuoteInput): Promise<BittensorActionQuote> {
    const netuid = typeof input.netuid === "number" && Number.isFinite(input.netuid) ? input.netuid : null;
    const subnet = netuid === null ? undefined : await this.getSubnet(netuid).catch(() => fallbackSubnet(netuid));
    return buildBittensorQuote(input, subnet);
  }
}

export const bittensorProvider: BittensorProvider = new TaoAppBittensorProvider();
