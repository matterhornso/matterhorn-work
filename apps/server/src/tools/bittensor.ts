/**
 * Bittensor read tools.
 *
 * V1 is intentionally read-only plus quote-only. Matterhorn never handles
 * seed phrases or private keys; signed actions must use an external wallet.
 */

import { ApiClient } from "./api-client.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
  block?: number | null;
  freshness?: string | null;
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
  source?: string;
  block?: number | null;
  freshness?: string | null;
  warnings?: string[];
}

export interface BittensorActionQuote {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid: number | null;
  amountTao: number | null;
  priceTao?: number | null;
  idealAlpha?: number | null;
  expectedAlpha: number | null;
  feeTao: number | null;
  slippageBps: number | null;
  rateTolerance?: number | null;
  source?: string;
  block?: number | null;
  freshness?: string | null;
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
    | "intelligence_report"
  >;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export interface BittensorCapabilityManifest {
  netuid: number;
  name: string;
  category: string;
  utilitySummary: string;
  capabilityLevel: "universal_read" | "adapter_ready" | "adapter_required" | "unsupported";
  userBenefits: string[];
  examplePrompts: string[];
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
  dataFreshness: {
    source: string;
    block: number | null;
    freshness: string | null;
    updatedAt: string;
    liveReadReady: boolean;
  };
  adapterStatus: {
    configured: boolean;
    adapter: BittensorCapabilityManifest["serviceAdapter"];
    message: string;
    requiredAuth: BittensorCapabilityManifest["requiredAuth"];
    costModel: BittensorCapabilityManifest["costModel"];
  };
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

export interface BittensorSigningHandoff {
  id: string;
  action: BittensorExtrinsicAction;
  network: BittensorSignerStatus["network"];
  netuid: number | null;
  payload: Record<string, unknown>;
  payloadJson: string;
  payloadSha256: string;
  suggestedFilename: string;
  signerMode: BittensorSignerStatus["mode"];
  createdAt: string;
  expiresAt: string;
  instructions: string[];
  warnings: string[];
  consequenceSummary: string;
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

export interface BittensorValidatorCandidate {
  netuid: number;
  subnetName: string;
  uid: number | null;
  hotkey: string | null;
  coldkey: string | null;
  stake: number | null;
  trust: number | null;
  dividends: number | null;
  score: number;
  reasons: string[];
  warnings: string[];
  source: string;
}

export interface BittensorValidatorComparison {
  netuid: number;
  subnetName: string;
  strategy: "balanced" | "yield" | "safety";
  candidates: BittensorValidatorCandidate[];
  warnings: string[];
  source: string;
  updatedAt: string;
}

export type BittensorRiskLevel = "unknown" | "low" | "medium" | "high";

export interface BittensorIntelligenceSignal {
  label: string;
  value: string;
  tone: "default" | "good" | "warning" | "danger" | "muted";
  explanation: string;
}

export interface BittensorSubnetIntelligenceReport {
  kind: "subnet";
  netuid: number;
  name: string;
  category: string;
  score: number;
  rating: "limited_provider_context" | "usable_with_caveats" | "strong_public_context";
  mechanismSummary: {
    available: boolean;
    count: number | null;
    note: string;
  };
  market: {
    priceTao: number | null;
    emission: number | null;
    tempo: number | null;
    source: string;
    block: number | null;
    freshness: string | null;
  };
  metagraph: {
    neurons: number | null;
    totalStake: number | null;
    validatorsSampled: number;
    topValidatorStakeShare: number | null;
    concentrationRisk: BittensorRiskLevel;
    dataQuality: BittensorRiskLevel;
  };
  capability: Pick<BittensorCapabilityManifest, "capabilityLevel" | "serviceAdapter" | "adapterStatus" | "userBenefits">;
  signals: BittensorIntelligenceSignal[];
  warnings: string[];
  nextQuestions: string[];
  updatedAt: string;
}

export interface BittensorWalletIntelligenceReport {
  kind: "wallet";
  ss58Address: string;
  freeTao: number | null;
  stakeTotalTao: number | null;
  estimatedValueTao: number | null;
  subnetCount: number;
  validatorCount: number;
  largestPositionShare: number | null;
  concentrationRisk: BittensorRiskLevel;
  slippageRisk: BittensorRiskLevel;
  staleDataRisk: BittensorRiskLevel;
  largestPositions: BittensorStakePosition[];
  signals: BittensorIntelligenceSignal[];
  warnings: string[];
  nextQuestions: string[];
  source: string;
  block: number | null;
  freshness: string | null;
  updatedAt: string;
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

export interface BittensorWatchEvaluation {
  watch: BittensorWatch;
  status: "ok" | "warning" | "unavailable";
  summary: string;
  observedValue: number | string | null;
  threshold: number | null;
  source: string;
  checkedAt: string;
}

export interface BittensorReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  summary: string;
  details?: Record<string, unknown>;
}

export interface BittensorReadinessReport {
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  checks: BittensorReadinessCheck[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}

export type BittensorChatCardKind =
  | "subnet_comparison"
  | "wallet_snapshot"
  | "validator_selection"
  | "staking_quote"
  | "signed_action_review"
  | "subnet_result"
  | "watchlist"
  | "signer_status"
  | "signing_handoff"
  | "unsupported_adapter"
  | "readiness_report"
  | "intelligence_report";

export interface BittensorChatCardItem {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "danger" | "muted";
}

export interface BittensorChatCardAction {
  label: string;
  kind: "copy_payload" | "open_url" | "sign_externally" | "send_to_chat";
  href?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface BittensorChatCard {
  kind: BittensorChatCardKind;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  tone?: "default" | "good" | "warning" | "danger";
  items: BittensorChatCardItem[];
  actions?: BittensorChatCardAction[];
  warnings?: string[];
  data?: Record<string, unknown>;
}

export type BittensorChatExecutionStatus =
  | "answered"
  | "clarification_required"
  | "unsigned_preview"
  | "unsupported";

export type BittensorChatContext = {
  id: string;
  ss58Address: string | null;
  netuid: number | null;
  amountTao: string | null;
  validatorHotkey: string | null;
  coldkey: string | null;
  recipient: string | null;
  destination: string | null;
  lastIntent: BittensorChatIntent | null;
  lastExecution: BittensorChatExecutionStatus | null;
  updatedAt: string;
  warnings: string[];
};

export type BittensorChatExecutionInput = {
  message: string;
  contextId?: string | null;
  context?: Partial<BittensorChatContext> | null;
  ss58Address?: string | null;
  netuid?: number | null;
  amountTao?: number | string | null;
  validatorHotkey?: string | null;
  coldkey?: string | null;
  recipient?: string | null;
  destination?: string | null;
  limit?: number | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
  rateTolerance?: number | null;
};

export type BittensorChatExecutionResult = {
  plan: BittensorPlan;
  responseText: string;
  cards: BittensorChatCard[];
  data: Record<string, unknown>;
  warnings: string[];
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  execution: BittensorChatExecutionStatus;
  context?: BittensorChatContext | null;
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

export type BittensorValidatorCompareInput = {
  netuid: number;
  hotkeys?: string[] | null;
  limit?: number | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
};

export interface BittensorSubtensorSidecarStatus {
  configured: boolean;
  network: "finney" | "test" | "local";
  canRead: boolean;
  canPrepare: boolean;
  canSubmit: boolean;
  message: string;
}

export interface BittensorSubtensorSidecarHealth extends BittensorSubtensorSidecarStatus {
  reachable: boolean;
  status: "healthy" | "unreachable" | "unconfigured";
  latencyMs: number | null;
  checkedAt: string;
}

export interface BittensorConfiguredSubnetAdapter {
  netuid: number;
  name: string;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  endpoint: string;
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  timeoutMs: number;
  authEnv?: string | null;
  safetyNotes: string[];
}

export interface BittensorSubnetDiscoveryMatch {
  subnet: BittensorSubnetSummary;
  score: number;
  reasons: string[];
}

export interface BittensorSubnetDiscoveryResult {
  goal: string;
  matches: BittensorSubnetDiscoveryMatch[];
  cards: BittensorChatCard[];
}

type CacheEntry<T> = { at: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();
const watchlist = new Map<string, BittensorWatch>();
const chatContexts = new Map<string, BittensorChatContext>();
let watchlistLoadedFromDisk = false;

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

function bittensorWatchlistPath(): string | null {
  if (readEnv("BITTENSOR_WATCHLIST_DISABLE_PERSISTENCE") === "1") return null;
  return readEnv("BITTENSOR_WATCHLIST_PATH") || join(homedir(), ".openwork", "openwork-server", "bittensor-watchlist.json");
}

function normalizePersistedWatch(value: unknown): BittensorWatch | null {
  const record = asRecord(value);
  const id = firstString(record, ["id"]);
  const kind = firstString(record, ["kind"]);
  if (!id || !["subnet", "wallet", "validator", "emissions", "slippage"].includes(kind ?? "")) return null;
  const netuid = firstNumber(record, ["netuid"]);
  const threshold = firstNumber(record, ["threshold"]);
  return {
    id,
    kind: kind as BittensorWatch["kind"],
    label: firstString(record, ["label"]) ?? "Bittensor watch",
    netuid: netuid !== null && Number.isInteger(netuid) ? netuid : null,
    ss58Address: firstString(record, ["ss58Address", "ss58_address"]),
    threshold,
    createdAt: firstString(record, ["createdAt", "created_at"]) ?? nowIso(),
  };
}

function loadPersistedWatchlist(): void {
  if (watchlistLoadedFromDisk) return;
  watchlistLoadedFromDisk = true;
  const file = bittensorWatchlistPath();
  if (!file || !existsSync(file)) return;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const rows = Array.isArray(asRecord(parsed).watches) ? asRecord(parsed).watches as unknown[] : arrayFrom(parsed);
    for (const watch of rows) {
      const normalized = normalizePersistedWatch(watch);
      if (normalized) watchlist.set(normalized.id, normalized);
    }
  } catch {
    // Corrupt persistence should not break read-only Bittensor chat flows.
  }
}

function persistWatchlist(): void {
  const file = bittensorWatchlistPath();
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ watches: [...watchlist.values()] }, null, 2)}\n`, "utf8");
  } catch {
    // Persistence is best-effort; watch creation still returns the in-memory entry.
  }
}

function taoAppClient(): ApiClient {
  const apiKey = readEnv("TAO_APP_API_KEY");
  return new ApiClient({
    baseUrl: TAO_APP_BASE_URL,
    headers: apiKey ? { "X-API-Key": apiKey } : {},
    timeout: 4_000,
  });
}

function sidecarBaseUrl(): string {
  return readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL").replace(/\/$/, "");
}

function sidecarRequestTimeoutMs(): number {
  const parsed = Number(readEnv("BITTENSOR_SUBTENSOR_SIDECAR_TIMEOUT_MS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(15_000, Math.max(1_000, parsed)) : 2_000;
}

function bittensorNetwork(): BittensorSignerStatus["network"] {
  const configured = readEnv("BITTENSOR_NETWORK");
  return configured === "test" || configured === "local" ? configured : "finney";
}

export function getSubtensorSidecarStatus(): BittensorSubtensorSidecarStatus {
  const configured = Boolean(sidecarBaseUrl());
  return {
    configured,
    network: bittensorNetwork(),
    canRead: configured,
    canPrepare: configured,
    canSubmit: false,
    message: configured
      ? "Subtensor sidecar is configured. Matterhorn can request live chain reads and unsigned payload preparation while keeping signing external; submission remains disabled for this TAO milestone."
      : "Subtensor sidecar is not configured. Matterhorn will use TAO.app analytics and local safe fallbacks.",
  };
}

async function probeSidecarPath(baseUrl: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    return asRecord(await res.json());
  } catch {
    return null;
  }
}

export async function checkSubtensorSidecarHealth(): Promise<BittensorSubtensorSidecarHealth> {
  const baseUrl = sidecarBaseUrl();
  const baseStatus = getSubtensorSidecarStatus();
  const checkedAt = nowIso();
  if (!baseUrl) {
    return {
      ...baseStatus,
      reachable: false,
      status: "unconfigured",
      latencyMs: null,
      checkedAt,
    };
  }

  const started = Date.now();
  const payload = await probeSidecarPath(baseUrl, "/liveness") || await probeSidecarPath(baseUrl, "/health") || await probeSidecarPath(baseUrl, "/status");
  const reachable = Boolean(payload);
  const latencyMs = Date.now() - started;
  return {
    ...baseStatus,
    reachable,
    status: reachable ? "healthy" : "unreachable",
    latencyMs,
    checkedAt,
    canRead: reachable && payload?.["canRead"] !== false,
    canPrepare: reachable && payload?.["canPrepare"] !== false,
    canSubmit: reachable && payload?.["canSubmit"] === true,
    message: reachable
      ? "Subtensor sidecar is configured and reachable. Matterhorn can use it for live chain reads and unsigned payload preparation while keeping signing external."
      : "Subtensor sidecar is configured but not reachable. Matterhorn will fall back to TAO.app analytics and local safe behavior.",
  };
}

class SubtensorSidecarClient {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    try {
      const { headers: _headers, ...rest } = init ?? {};
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(sidecarRequestTimeoutMs()),
      });
      if (!res.ok) return null;
      return asRecord(await res.json());
    } catch {
      return null;
    }
  }

  async getSubnetMetagraph(netuid: number): Promise<unknown | null> {
    return this.request(`/subnets/${encodeURIComponent(String(netuid))}/metagraph`);
  }

  async listSubnets(): Promise<Record<string, unknown> | null> {
    return this.request("/subnets");
  }

  async getSubnetDynamic(netuid: number): Promise<Record<string, unknown> | null> {
    return this.request(`/subnets/${encodeURIComponent(String(netuid))}/dynamic`);
  }

  async getWallet(ss58Address: string): Promise<Record<string, unknown> | null> {
    return this.request(`/wallet/${encodeURIComponent(ss58Address)}`);
  }

  async quoteAction(input: BittensorActionQuoteInput): Promise<Record<string, unknown> | null> {
    return this.request("/extrinsics/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async prepareExtrinsic(input: BittensorExtrinsicPrepareInput): Promise<Record<string, unknown> | null> {
    return this.request("/extrinsics/prepare", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

function subtensorSidecarClient(): SubtensorSidecarClient | null {
  const baseUrl = sidecarBaseUrl();
  return baseUrl ? new SubtensorSidecarClient(baseUrl) : null;
}

function normalizeServiceAdapter(value: unknown, fallback: BittensorCapabilityManifest["serviceAdapter"]): BittensorCapabilityManifest["serviceAdapter"] {
  return value === "inference" ||
    value === "data_search" ||
    value === "compute" ||
    value === "creative_media" ||
    value === "agent_tooling" ||
    value === "universal" ||
    value === "unsupported"
    ? value
    : fallback;
}

function normalizeRequiredAuth(value: unknown): BittensorCapabilityManifest["requiredAuth"] {
  return value === "none" || value === "api_key" || value === "external_wallet" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeCostModel(value: unknown): BittensorCapabilityManifest["costModel"] {
  return value === "free_read" || value === "tao_fee" || value === "provider_priced" || value === "unknown"
    ? value
    : "unknown";
}

function configuredSubnetAdapters(): BittensorConfiguredSubnetAdapter[] {
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTERS_JSON");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : Object.entries(asRecord(parsed)).map(([netuid, value]) => ({ ...asRecord(value), netuid: Number(netuid) }));
    return entries.flatMap((entry) => {
      const record = asRecord(entry);
      const netuid = firstNumber(record, ["netuid", "net_uid", "subnet"]);
      const endpoint = firstString(record, ["endpoint", "url", "baseUrl", "base_url"]);
      if (netuid === null || !Number.isInteger(netuid) || netuid < 0 || !endpoint) return [];
      const timeoutMs = firstNumber(record, ["timeoutMs", "timeout_ms"]) ?? 20_000;
      return [{
        netuid,
        name: firstString(record, ["name", "label"]) ?? `Subnet ${netuid} adapter`,
        serviceAdapter: normalizeServiceAdapter(record["serviceAdapter"] ?? record["adapter"], "unsupported"),
        endpoint,
        requiredAuth: normalizeRequiredAuth(record["requiredAuth"] ?? record["auth"]),
        costModel: normalizeCostModel(record["costModel"] ?? record["cost"]),
        timeoutMs: Math.min(60_000, Math.max(1_000, timeoutMs)),
        authEnv: firstString(record, ["authEnv", "auth_env", "apiKeyEnv", "api_key_env"]),
        safetyNotes: arrayFrom(record["safetyNotes"] ?? record["safety_notes"])
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0),
      }];
    });
  } catch {
    return [];
  }
}

export function getConfiguredSubnetAdapter(netuid: number): BittensorConfiguredSubnetAdapter | null {
  return configuredSubnetAdapters().find((adapter) => adapter.netuid === netuid) ?? null;
}

async function invokeConfiguredSubnetAdapter(
  adapter: BittensorConfiguredSubnetAdapter,
  input: BittensorSubnetInvokeInput,
): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adapter.authEnv) {
    const token = readEnv(adapter.authEnv);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(adapter.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        netuid: adapter.netuid,
        intent: input.intent ?? "service_call",
        task: input.task ?? "",
        ss58Address: input.ss58Address ?? null,
        safeMode: true,
      }),
      signal: AbortSignal.timeout(adapter.timeoutMs),
    });
    if (!res.ok) return {
      ok: false,
      status: res.status,
      message: `Adapter returned HTTP ${res.status}.`,
    };
    return asRecord(await res.json());
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Adapter invocation failed.",
    };
  }
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

function normalizeSubnet(value: unknown, sourceOverride?: string): BittensorSubnetSummary | null {
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
    firstString(record, ["updatedAt", "updated_at", "timestamp", "created_at", "fetchedAt", "fetched_at"]) ??
    nowIso();
  const source = sourceOverride ?? firstString(record, ["source", "provider", "dataSource", "data_source"]) ?? "tao.app";

  return {
    netuid,
    name,
    symbol,
    category,
    benefitSummary: benefitFor(category, description),
    ownerColdkey: firstString(record, ["owner_coldkey", "ownerColdkey", "coldkey"]),
    ownerHotkey: firstString(record, ["owner_hotkey", "ownerHotkey", "hotkey"]),
    priceTao: firstNumber(record, ["priceTao", "price_tao", "price", "moving_price", "alpha_price", "subnet_price"]),
    emission: firstNumber(record, ["emission", "subnet_emission", "alpha_out_emission", "tao_in_emission"]),
    tempo: firstNumber(record, ["tempo"]),
    updatedAt,
    source,
    block: firstNumber(record, ["block", "blockNumber", "block_number"]),
    freshness: firstString(record, ["freshness", "dataFreshness", "data_freshness"]),
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
    priceTao: price,
    idealAlpha: expectedAlpha,
    expectedAlpha,
    feeTao: input.action === "compare" ? null : 0.0001,
    slippageBps,
    rateTolerance: null,
    source: subnet?.source ?? "matterhorn-local-quote",
    block: subnet?.block ?? null,
    freshness: subnet?.freshness ?? null,
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

function extractSs58Candidates(text: string): string[] {
  const candidates = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,64}\b/g) ?? [];
  return candidates.filter((candidate, index, all) => isValidSs58Address(candidate) && all.indexOf(candidate) === index);
}

function extractSs58(text: string): string | null {
  return extractSs58Candidates(text)[0] ?? null;
}

function classifyBittensorIntent(text: string): { intent: BittensorChatIntent; confidence: number } {
  const lower = text.toLowerCase();
  if (/(watch|alert|monitor|notify|track)/.test(lower)) return { intent: "monitor", confidence: 0.86 };
  if (/(i'?m new|explain|what is|teach me|learn|beginner)/.test(lower)) return { intent: "learn", confidence: 0.86 };
  if (/(stake|staking|unstake|delegate|delegat|transfer|move stake|hotkey|coldkey|validator|slippage|alpha)/.test(lower)) return { intent: "stake_plan", confidence: 0.9 };
  if (/(wallet|balance|position|portfolio|my tao|show me my tao|allocation)/.test(lower)) return { intent: "wallet", confidence: 0.88 };
  if (/\b(use|run|call|invoke)\b|ask subnet|submit.*to subnet|send.*to subnet/.test(lower)) return { intent: "subnet_use", confidence: 0.78 };
  if (/(find|which|compare|best|recommend|discover|image|video|data|compute|agent|tool|subnet)/.test(lower)) return { intent: "discover", confidence: 0.82 };
  return { intent: "learn", confidence: /bittensor|tao|subnet/.test(lower) ? 0.8 : 0.55 };
}

function toolsForIntent(intent: BittensorChatIntent): string[] {
  const common = ["bittensor_chat", "bittensor_plan_from_chat"];
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

function uniqueWarnings(...groups: Array<Array<string | null | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const group of groups) {
    for (const item of group ?? []) {
      const warning = typeof item === "string" ? item.trim() : "";
      if (!warning || seen.has(warning)) continue;
      seen.add(warning);
      warnings.push(warning);
    }
  }
  return warnings;
}

function resolveExecutionSs58(input: BittensorChatExecutionInput, plan: BittensorPlan): string | null {
  if (input.ss58Address && isValidSs58Address(input.ss58Address)) return input.ss58Address;
  if (input.coldkey && isValidSs58Address(input.coldkey)) return input.coldkey;
  if (plan.ss58Address && isValidSs58Address(plan.ss58Address)) return plan.ss58Address;
  return extractSs58(input.message);
}

function resolveExecutionNetuid(input: BittensorChatExecutionInput, plan: BittensorPlan): number | null {
  if (typeof input.netuid === "number" && Number.isInteger(input.netuid) && input.netuid >= 0) return input.netuid;
  return plan.netuids[0] ?? null;
}

function resolveExecutionLimit(input: BittensorChatExecutionInput, fallback: number): number {
  const parsed = Number(input.limit);
  return Number.isFinite(parsed) ? Math.min(12, Math.max(1, Math.floor(parsed))) : fallback;
}

function resolveExecutionStrategy(input: BittensorChatExecutionInput): BittensorValidatorComparison["strategy"] {
  return input.strategy === "yield" || input.strategy === "safety" || input.strategy === "balanced"
    ? input.strategy
    : "balanced";
}

function resolveExecutionHotkey(input: BittensorChatExecutionInput): string | null {
  return input.validatorHotkey && isValidSs58Address(input.validatorHotkey) ? input.validatorHotkey : null;
}

function resolveExecutionDestination(input: BittensorChatExecutionInput, plan: BittensorPlan): string | null {
  const explicit = input.destination ?? input.recipient ?? null;
  if (explicit && isValidSs58Address(explicit)) return explicit;
  const occupied = new Set([
    input.ss58Address,
    input.coldkey,
    input.validatorHotkey,
    plan.ss58Address,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  return extractSs58Candidates(input.message).find((candidate) => !occupied.has(candidate)) ?? null;
}

function extractExecutionAction(message: string): BittensorExtrinsicAction {
  const lower = message.toLowerCase();
  if (/\bmove\s+stake\b/.test(lower)) return "move_stake";
  if (/\bunstake|undelegate\b/.test(lower)) return "unstake";
  if (/\btransfer|send\s+\d|send\s+tao\b/.test(lower)) return "transfer";
  if (/\bset\s+child|child\s+hotkey\b/.test(lower)) return "set_child_hotkey";
  if (/\bregister\b/.test(lower)) return "register";
  if (/\bserve\b/.test(lower)) return "serve";
  return "stake";
}

function extractExecutionAmountTao(input: BittensorChatExecutionInput): string | null {
  const explicit = parseAmountTao(input.amountTao);
  if (explicit !== null) return String(explicit);
  const message = input.message;
  const taoMatch = message.match(/\b(\d+(?:\.\d+)?)\s*TAO\b/i);
  if (taoMatch && parseAmountTao(taoMatch[1]) !== null) return taoMatch[1];
  const actionMatch = message.match(/\b(?:stake|staking|unstake|transfer)\s+(\d+(?:\.\d+)?)\b/i);
  if (actionMatch && parseAmountTao(actionMatch[1]) !== null) return actionMatch[1];
  return null;
}

function isWalletQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "wallet" || /\b(show|check|read|what'?s|where).*?\b(my\s+)?TAO\b/i.test(message);
}

function isStakePositionQuestion(message: string): boolean {
  return /\b(where|how|what).*?\bstaked\b/i.test(message) ||
    /\b(stake positions|where am i staked|where i am staked|validator exposure|allocation)\b/i.test(message);
}

function isImageDiscoveryQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "discover" && /(image|media|creative|art|render|vision|design|generate)/i.test(message);
}

function isValidatorComparisonQuestion(message: string): boolean {
  return /\b(compare|rank|find|show|which|best)\b.*\bvalidators?\b/i.test(message) ||
    /\bvalidators?\b.*\b(compare|rank|selection|shortlist)\b/i.test(message);
}

function isStakePreviewQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "stake_plan" || /\b(stake|staking|unstake|move stake|transfer|send\s+\d|send\s+tao|set child|register|serve)\b/i.test(message);
}

function isBittensorIntelligenceQuestion(message: string): boolean {
  return /\b(analy[sz]e|analysis|intelligence|risk|health|quality|score|diagnose|weak spots?|exposure|portfolio)\b/i.test(message);
}

function isWalletIntelligenceQuestion(message: string, plan: BittensorPlan): boolean {
  if (!isBittensorIntelligenceQuestion(message)) return false;
  return plan.intent === "wallet" || /\b(wallet|portfolio|my tao|balance|coldkey|stake exposure|exposure)\b/i.test(message);
}

function isSubnetIntelligenceQuestion(message: string): boolean {
  if (!isBittensorIntelligenceQuestion(message)) return false;
  return /\b(subnet|netuid|sn\d+|validator|metagraph|emission|price|slippage|adapter)\b/i.test(message);
}

function buildBittensorLearningCard(message: string): BittensorChatCard {
  const lower = message.toLowerCase();
  const glossary = [
    { label: "TAO", value: "The base token of Bittensor, used for network incentives and staking exposure." },
    { label: "Subnet", value: "A specialized market inside Bittensor where miners and validators compete around a particular capability." },
    { label: "Coldkey", value: "The public wallet identity that owns TAO and controls staking. Matterhorn only needs the public SS58 address for reads." },
    { label: "Hotkey", value: "The operational identity used by validators and miners on subnets." },
    { label: "Validator", value: "A participant that scores miners and receives stake delegation/exposure." },
    { label: "Miner", value: "A participant that provides the subnet's service or work output." },
    { label: "Alpha", value: "Subnet-local exposure created by Dynamic TAO staking; alpha price and slippage can change." },
    { label: "Metagraph", value: "The public state of a subnet, including participants and metrics." },
    { label: "Dynamic TAO", value: "The staking model where subnet alpha prices and slippage affect staking and unstaking outcomes." },
  ];
  const matched = glossary.filter((item) => lower.includes(item.label.toLowerCase()) || lower.includes(item.label.toLowerCase().replace("dynamic tao", "dtao")));
  const items = (matched.length ? matched : glossary.slice(0, 5)).map((item) => cardItem(item.label, item.value));
  return {
    kind: "subnet_result",
    title: "Bittensor explainer",
    subtitle: matched.length ? "Focused glossary" : "Beginner overview",
    summary: "Bittensor is a network of specialized subnets. Matterhorn can explain, discover, monitor, compare validators, read public wallet exposure, and prepare unsigned previews without handling secrets.",
    tone: "default",
    items,
    warnings: [
      "Matterhorn never asks for seed phrases, private keys, or mnemonics.",
      "Using a subnet service is different from staking TAO into a subnet.",
    ],
    data: { topic: message, terms: items.map((item) => item.label) },
  };
}

function inferWatchKind(message: string, input: BittensorChatExecutionInput): BittensorWatch["kind"] {
  const lower = message.toLowerCase();
  if (/\bwallet|balance|portfolio|coldkey|my tao\b/.test(lower)) return "wallet";
  if (/\bvalidator|hotkey\b/.test(lower) || input.validatorHotkey) return "validator";
  if (/\bemission|emissions\b/.test(lower)) return "emissions";
  if (/\bslippage|price|alpha\b/.test(lower)) return "slippage";
  return "subnet";
}

function labelForWatch(message: string, kind: BittensorWatch["kind"], netuid: number | null, ss58Address: string | null): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length > 8 && trimmed.length <= 80) return trimmed;
  if (netuid !== null) return `Bittensor ${kind} watch for subnet ${netuid}`;
  if (ss58Address) return `Bittensor ${kind} watch for ${shortSs58(ss58Address)}`;
  return `Bittensor ${kind} watch`;
}

function createBittensorChatContextId(): string {
  return `bt-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContextId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^bt-chat-[a-z0-9-]{6,96}$/i.test(trimmed) ? trimmed : null;
}

function normalizeContextNetuid(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function normalizeContextAmount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = parseAmountTao(value);
  return parsed === null ? null : String(value).trim();
}

function normalizeContextSs58(value: unknown): string | null {
  return typeof value === "string" && isValidSs58Address(value.trim()) ? value.trim() : null;
}

function normalizeContextWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
}

function sanitizeBittensorChatContext(value: unknown): BittensorChatContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = normalizeContextId(record.id) ?? createBittensorChatContextId();
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt
    : nowIso();
  const lastIntent = typeof record.lastIntent === "string" && ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"].includes(record.lastIntent)
    ? record.lastIntent as BittensorChatIntent
    : null;
  const lastExecution = typeof record.lastExecution === "string" && ["answered", "clarification_required", "unsigned_preview", "unsupported"].includes(record.lastExecution)
    ? record.lastExecution as BittensorChatExecutionStatus
    : null;
  return {
    id,
    ss58Address: normalizeContextSs58(record.ss58Address),
    netuid: normalizeContextNetuid(record.netuid),
    amountTao: normalizeContextAmount(record.amountTao),
    validatorHotkey: normalizeContextSs58(record.validatorHotkey),
    coldkey: normalizeContextSs58(record.coldkey),
    recipient: normalizeContextSs58(record.recipient),
    destination: normalizeContextSs58(record.destination),
    lastIntent,
    lastExecution,
    updatedAt,
    warnings: normalizeContextWarnings(record.warnings),
  };
}

function mergeBittensorChatContexts(
  stored: BittensorChatContext | null,
  inline: BittensorChatContext | null,
): BittensorChatContext | null {
  if (!stored && !inline) return null;
  const base = stored ?? inline!;
  return {
    ...base,
    ...(inline ?? {}),
    id: stored?.id ?? inline?.id ?? createBittensorChatContextId(),
    ss58Address: inline?.ss58Address ?? stored?.ss58Address ?? null,
    netuid: inline?.netuid ?? stored?.netuid ?? null,
    amountTao: inline?.amountTao ?? stored?.amountTao ?? null,
    validatorHotkey: inline?.validatorHotkey ?? stored?.validatorHotkey ?? null,
    coldkey: inline?.coldkey ?? stored?.coldkey ?? null,
    recipient: inline?.recipient ?? stored?.recipient ?? null,
    destination: inline?.destination ?? stored?.destination ?? inline?.recipient ?? stored?.recipient ?? null,
    warnings: uniqueWarnings(stored?.warnings, inline?.warnings),
  };
}

export function getBittensorChatContext(contextId: string): BittensorChatContext | null {
  const normalized = normalizeContextId(contextId);
  return normalized ? chatContexts.get(normalized) ?? null : null;
}

function resolveBittensorChatContext(input: BittensorChatExecutionInput): BittensorChatContext | null {
  const storedId = normalizeContextId(input.contextId);
  const stored = storedId ? chatContexts.get(storedId) ?? null : null;
  const inline = sanitizeBittensorChatContext(input.context);
  return mergeBittensorChatContexts(stored, inline);
}

function hydrateBittensorChatInput(input: BittensorChatExecutionInput, context: BittensorChatContext | null): BittensorChatExecutionInput {
  if (!context) return input;
  return {
    ...input,
    ss58Address: input.ss58Address ?? context.ss58Address,
    netuid: input.netuid ?? context.netuid,
    amountTao: input.amountTao ?? context.amountTao,
    validatorHotkey: input.validatorHotkey ?? context.validatorHotkey,
    coldkey: input.coldkey ?? context.coldkey,
    recipient: input.recipient ?? context.recipient,
    destination: input.destination ?? context.destination ?? context.recipient,
  };
}

function buildBittensorChatContext(
  input: BittensorChatExecutionInput,
  result: BittensorChatExecutionResult,
  previous: BittensorChatContext | null,
): BittensorChatContext {
  const planNetuid = result.plan.netuids.find((netuid) => Number.isInteger(netuid) && netuid >= 0) ?? null;
  const context: BittensorChatContext = {
    id: previous?.id ?? normalizeContextId(input.contextId) ?? normalizeContextId(input.context?.id) ?? createBittensorChatContextId(),
    ss58Address: normalizeContextSs58(input.ss58Address) ?? previous?.ss58Address ?? normalizeContextSs58(result.plan.ss58Address),
    netuid: normalizeContextNetuid(input.netuid) ?? previous?.netuid ?? planNetuid,
    amountTao: normalizeContextAmount(input.amountTao) ?? extractExecutionAmountTao(input) ?? previous?.amountTao ?? null,
    validatorHotkey: normalizeContextSs58(input.validatorHotkey) ?? previous?.validatorHotkey ?? null,
    coldkey: normalizeContextSs58(input.coldkey) ?? previous?.coldkey ?? normalizeContextSs58(input.ss58Address),
    recipient: normalizeContextSs58(input.recipient) ?? previous?.recipient ?? null,
    destination: normalizeContextSs58(input.destination) ?? normalizeContextSs58(input.recipient) ?? previous?.destination ?? previous?.recipient ?? null,
    lastIntent: result.plan.intent,
    lastExecution: result.execution,
    updatedAt: nowIso(),
    warnings: uniqueWarnings(previous?.warnings, result.warnings).slice(0, 8),
  };
  chatContexts.set(context.id, context);
  while (chatContexts.size > 128) {
    const firstKey = chatContexts.keys().next().value;
    if (!firstKey) break;
    chatContexts.delete(firstKey);
  }
  return context;
}

function buildStakePositionsCard(wallet: BittensorWalletSnapshot): BittensorChatCard {
  const positions = [...wallet.stakePositions].sort((a, b) => (b.taoValue ?? 0) - (a.taoValue ?? 0));
  const total = positions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
  const highestRisk = positions.find((position) => position.slippageRisk === "high")
    ?? positions.find((position) => position.slippageRisk === "medium")
    ?? positions[0]
    ?? null;
  return {
    kind: "wallet_snapshot",
    title: "Stake positions",
    subtitle: shortSs58(wallet.ss58Address),
    summary: positions.length
      ? `Top stake positions sorted by TAO value. Total sampled stake value: ${formatMetric(total)} TAO.`
      : "No subnet stake positions were returned by the current wallet provider.",
    tone: wallet.providerStatus === "ok" && positions.length ? "default" : "warning",
    items: [
      cardItem("Positions", positions.length),
      cardItem("Total staked value", `${formatMetric(total)} TAO`),
      cardItem("Highest slippage risk", highestRisk ? `${highestRisk.subnetName}: ${highestRisk.slippageRisk}` : "Unavailable", highestRisk?.slippageRisk === "high" ? "warning" : "muted"),
      cardItem("Source", wallet.source ?? "provider", wallet.source?.includes("fallback") ? "warning" : "muted"),
      cardItem("Block", wallet.block ?? "Unavailable", wallet.block === null || wallet.block === undefined ? "muted" : "default"),
      cardItem("Freshness", wallet.freshness ?? "Unavailable", wallet.freshness ? "default" : "muted"),
    ],
    warnings: wallet.providerStatus === "ok" ? wallet.warnings ?? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    data: { wallet, positions: positions.slice(0, 8) },
  };
}

function clarificationResult(
  plan: BittensorPlan,
  question: string,
  cards: BittensorChatCard[] = buildBittensorPlanCards({ ...plan, requiresClarification: true, clarificationQuestion: question }),
  warnings: string[] = [],
  data: Record<string, unknown> = {},
): BittensorChatExecutionResult {
  return {
    plan: { ...plan, requiresClarification: true, clarificationQuestion: question },
    responseText: question,
    cards,
    data,
    warnings: uniqueWarnings(plan.safetyNotes, warnings),
    requiresClarification: true,
    clarificationQuestion: question,
    execution: "clarification_required",
  };
}

export async function executeBittensorChatWorkflow(input: BittensorChatExecutionInput): Promise<BittensorChatExecutionResult> {
  const previousContext = resolveBittensorChatContext(input);
  const hydratedInput = hydrateBittensorChatInput(input, previousContext);
  const result = await executeBittensorChatWorkflowCore(hydratedInput);
  const context = buildBittensorChatContext(hydratedInput, result, previousContext);
  return { ...result, context };
}

async function executeBittensorChatWorkflowCore(input: BittensorChatExecutionInput): Promise<BittensorChatExecutionResult> {
  const message = String(input.message ?? "").trim();
  const plan = planBittensorChat({ message, ss58Address: input.ss58Address ?? input.coldkey ?? null });
  const answeredPlan = { ...plan, requiresClarification: false, clarificationQuestion: null };
  const warnings = [...plan.safetyNotes];

  if (!message) {
    return clarificationResult(plan, "What would you like to do with Bittensor?");
  }

  if (plan.intent === "learn") {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid !== null) {
      const invocation = await invokeBittensorSubnet(netuid, { intent: "explain", task: message, ss58Address: resolveExecutionSs58(input, plan) });
      return {
        plan: { ...answeredPlan, intent: "learn", responseCards: ["subnet_result"] },
        responseText: invocation.message,
        cards: [buildBittensorInvocationCard(invocation)],
        data: { invocation },
        warnings: uniqueWarnings(warnings, invocation.warnings),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    const card = buildBittensorLearningCard(message);
    return {
      plan: { ...answeredPlan, intent: "learn", responseCards: ["subnet_result"] },
      responseText: "Bittensor is a network of specialized AI and compute markets called subnets. Matterhorn can help you understand the terms, discover useful subnets, read public wallet exposure, monitor changes, and prepare unsigned staking previews without handling secrets.",
      cards: [card],
      data: { topic: message },
      warnings: uniqueWarnings(warnings, card.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetIntelligenceQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I analyze?");
    }
    const report = await analyzeBittensorSubnetIntelligence(netuid);
    return {
      plan: { ...answeredPlan, intent: "discover", responseCards: ["intelligence_report"] },
      responseText: `Analyzed subnet ${report.netuid} (${report.name}) from public Bittensor data. Score ${report.score}/100 reflects provider quality, market context, metagraph visibility, validator concentration, and adapter readiness; it is not financial advice.`,
      cards: [buildBittensorSubnetIntelligenceCard(report)],
      data: { intelligence: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isWalletIntelligenceQuestion(message, plan)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    if (!ss58Address) {
      return clarificationResult(plan, "I can analyze your Bittensor exposure, but I need your SS58 coldkey public address.");
    }
    const report = await analyzeBittensorWalletIntelligence(ss58Address);
    return {
      plan: { ...answeredPlan, intent: "wallet", responseCards: ["intelligence_report"] },
      responseText: `Analyzed watch-only TAO exposure for ${shortSs58(ss58Address)} across ${report.subnetCount} subnet(s) and ${report.validatorCount} validator hotkey(s). This is public wallet intelligence, not financial advice.`,
      cards: [buildBittensorWalletIntelligenceCard(report)],
      data: { intelligence: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isStakePositionQuestion(message) || isWalletQuestion(message, plan)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    if (!ss58Address) {
      return clarificationResult(plan, "I can show your TAO and stake exposure, but I need your SS58 coldkey public address.");
    }
    const wallet = await bittensorProvider.getWallet(ss58Address);
    const cards = [buildBittensorWalletCard(wallet)];
    if (isStakePositionQuestion(message) || wallet.stakePositions.length) cards.push(buildStakePositionsCard(wallet));
    const stakeTotal = wallet.stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
    return {
      plan: { ...answeredPlan, intent: "wallet", responseCards: ["wallet_snapshot"] },
      responseText: wallet.providerStatus === "ok"
        ? `Loaded watch-only TAO wallet context for ${shortSs58(ss58Address)}: ${formatMetric(wallet.taoBalance)} free TAO, ${formatMetric(stakeTotal)} TAO staked across ${wallet.stakePositions.length} position(s).`
        : wallet.message ?? `I could not load wallet data for ${shortSs58(ss58Address)} from the current provider.`,
      cards,
      data: { wallet },
      warnings: uniqueWarnings(warnings, wallet.warnings, wallet.providerStatus === "ok" ? [] : [wallet.message]),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (plan.intent === "monitor") {
    const kind = inferWatchKind(message, input);
    const netuid = resolveExecutionNetuid(input, plan);
    const ss58Address = resolveExecutionHotkey(input) ?? resolveExecutionSs58(input, plan);
    if ((kind === "subnet" || kind === "emissions" || kind === "slippage") && netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I monitor?");
    }
    if ((kind === "wallet" || kind === "validator") && !ss58Address) {
      return clarificationResult(plan, kind === "wallet"
        ? "Which SS58 coldkey public address should I monitor?"
        : "Which validator hotkey should I monitor?");
    }
    const watch = createBittensorWatch({
      kind,
      netuid,
      ss58Address,
      label: labelForWatch(message, kind, netuid, ss58Address),
      threshold: null,
    });
    return {
      plan: { ...answeredPlan, intent: "monitor", responseCards: ["watchlist"] },
      responseText: netuid !== null
        ? `Created a ${kind} watch for subnet ${netuid}.`
        : `Created a ${kind} watch for ${shortSs58(ss58Address)}.`,
      cards: buildBittensorWatchCards([watch]),
      data: { watch },
      warnings: uniqueWarnings(warnings, ["Watches use public/provider data and may be delayed if live providers are unavailable."]),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isImageDiscoveryQuestion(message, plan) || (plan.intent === "discover" && !isValidatorComparisonQuestion(message))) {
    const goal = isImageDiscoveryQuestion(message, plan) ? "image generation" : message;
    const discovery = await findBittensorSubnetsForGoal({ goal, limit: resolveExecutionLimit(input, isImageDiscoveryQuestion(message, plan) ? 5 : 8) });
    const sourceWarnings = discovery.matches.some((match) => match.subnet.source === "curated-fallback")
      ? ["Some matches use fallback metadata because live provider data was unavailable."]
      : [];
    return {
      plan: { ...answeredPlan, intent: "discover", responseCards: ["subnet_comparison"] },
      responseText: discovery.matches.length
        ? `I found ${discovery.matches.length} Bittensor subnet candidate(s) for ${goal}. Treat this as discovery context, not financial advice.`
        : `I could not find a strong Bittensor subnet match for ${goal} from the current provider data.`,
      cards: discovery.cards,
      data: { discovery },
      warnings: uniqueWarnings(warnings, sourceWarnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isValidatorComparisonQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I use to compare validators?");
    }
    const comparison = await compareBittensorValidators({
      netuid,
      strategy: resolveExecutionStrategy(input),
      limit: resolveExecutionLimit(input, 6),
    });
    const fallbackWarnings = comparison.source === "curated-fallback"
      ? ["Live provider data was unavailable; this validator comparison is fallback-only and incomplete."]
      : [];
    return {
      plan: { ...answeredPlan, responseCards: ["validator_selection"] },
      responseText: `Compared validator candidates for subnet ${netuid} using a ${comparison.strategy} strategy. This is an informational shortlist, not a staking recommendation.`,
      cards: buildBittensorValidatorComparisonCards(comparison),
      data: { comparison },
      warnings: uniqueWarnings(warnings, comparison.warnings, fallbackWarnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isStakePreviewQuestion(message, plan)) {
    const action = extractExecutionAction(message);
    const amountTao = extractExecutionAmountTao(input);
    const netuid = resolveExecutionNetuid(input, plan);
    const hotkey = resolveExecutionHotkey(input);
    const destination = resolveExecutionDestination(input, plan);
    if (action === "move_stake") {
      return clarificationResult(plan, "Move-stake previews need both origin and destination subnet context. Which origin netuid, destination netuid, and validator hotkey should I use?");
    }
    if (action === "set_child_hotkey" || action === "register" || action === "serve") {
      return {
        plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["signed_action_review"] },
        responseText: `${titleCase(action)} is not enabled in the general chat executor yet. I can explain the action and risks, but I will not build a payload until it is explicitly enabled.`,
        cards: buildBittensorPlanCards(plan),
        data: { action },
        warnings: uniqueWarnings(warnings, [`${titleCase(action)} requires explicit product enablement and external signing review.`]),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "unsupported",
      };
    }
    if (!amountTao) {
      return clarificationResult(plan, `How much TAO should I use for this ${action.replace("_", " ")} preview?`);
    }
    if (action !== "transfer" && netuid === null) {
      return clarificationResult(plan, `Which subnet netuid should this ${action.replace("_", " ")} preview use?`);
    }
    if ((action === "stake" || action === "unstake") && !hotkey) {
      const comparison = await compareBittensorValidators({
        netuid: netuid ?? 0,
        strategy: resolveExecutionStrategy(input),
        limit: resolveExecutionLimit(input, 6),
      });
      return clarificationResult(
        plan,
        `Which validator hotkey should I use for the unsigned ${action} preview?`,
        buildBittensorValidatorComparisonCards(comparison),
        comparison.warnings,
        { comparison, amountTao, netuid, action },
      );
    }
    if (action === "transfer" && !destination) {
      return clarificationResult(plan, "Which SS58 recipient address should I use for the unsigned TAO transfer preview?");
    }

    const coldkey = input.coldkey && isValidSs58Address(input.coldkey)
      ? input.coldkey
      : input.ss58Address && isValidSs58Address(input.ss58Address)
        ? input.ss58Address
        : plan.ss58Address;
    const preview = await prepareBittensorExtrinsic({
      action,
      netuid,
      amountTao,
      coldkey,
      hotkey,
      destination,
      rateTolerance: input.rateTolerance ?? null,
    });
    return {
      plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["signed_action_review"] },
      responseText: `${preview.consequenceSummary} This is unsigned and requires external signing before anything can move.`,
      cards: [buildBittensorExtrinsicPreviewCard(preview)],
      data: { preview },
      warnings: uniqueWarnings(warnings, preview.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "unsigned_preview",
    };
  }

  if (plan.intent === "subnet_use") {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I inspect or use?");
    }
    const invocation = await invokeBittensorSubnet(netuid, {
      intent: "service_call",
      task: message,
      ss58Address: resolveExecutionSs58(input, plan),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["subnet_result"] },
      responseText: invocation.message,
      cards: [buildBittensorInvocationCard(invocation)],
      data: { invocation },
      warnings: uniqueWarnings(warnings, invocation.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: invocation.supported ? "answered" : "unsupported",
    };
  }

  return {
    plan: plan.requiresClarification ? plan : answeredPlan,
    responseText: plan.summary,
    cards: buildBittensorPlanCards(plan),
    data: { plan },
    warnings: uniqueWarnings(warnings),
    requiresClarification: plan.requiresClarification,
    clarificationQuestion: plan.clarificationQuestion,
    execution: plan.requiresClarification ? "clarification_required" : "answered",
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

function capabilityLevelFor(
  adapter: BittensorCapabilityManifest["serviceAdapter"],
  configuredAdapter: BittensorConfiguredSubnetAdapter | null,
): BittensorCapabilityManifest["capabilityLevel"] {
  if (configuredAdapter?.serviceAdapter !== "unsupported" && configuredAdapter && adapter !== "unsupported") return "adapter_ready";
  if (adapter === "unsupported") return "unsupported";
  if (adapter === "universal") return "universal_read";
  return "adapter_required";
}

function benefitsForCapability(subnet: BittensorSubnetSummary, adapter: BittensorCapabilityManifest["serviceAdapter"]): string[] {
  const categoryBenefits: Record<string, string[]> = {
    "Creative AI": [
      "Find subnets that may help generate, transform, or evaluate images and media.",
      "Compare price, emissions, and adapter readiness before trying a creative workflow.",
    ],
    "Compute and infrastructure": [
      "Inspect compute-oriented subnet health, validator context, and staking exposure.",
      "Monitor emissions or slippage before allocating TAO into compute markets.",
    ],
    "Data and knowledge": [
      "Discover data, search, retrieval, or knowledge subnets for research-heavy tasks.",
      "Track subnet freshness and service-readiness before depending on a data source.",
    ],
    "Agent tools": [
      "Identify subnets that may extend agent workflows, automation, or tool execution.",
      "Separate staking into a subnet from actually invoking its service adapter.",
    ],
    "Intelligence market": [
      "Explore inference or model-market subnets in beginner language.",
      "Compare visible validator context before preparing any staking preview.",
    ],
  };
  return [
    subnet.benefitSummary,
    ...(categoryBenefits[subnet.category] ?? [
      "Explain what this subnet appears to do and how it may fit a user goal.",
      "Read public network, wallet, stake, and monitoring context where provider data exists.",
    ]),
    adapter === "universal"
      ? "Matterhorn can explain, compare, monitor, and guide staking for this subnet now."
      : "Direct service execution depends on a configured subnet adapter.",
  ].filter(Boolean).slice(0, 4);
}

function examplePromptsForCapability(subnet: BittensorSubnetSummary): string[] {
  return [
    `Explain subnet ${subnet.netuid} in beginner language.`,
    `Is subnet ${subnet.netuid} useful for my current task?`,
    `Compare validators on subnet ${subnet.netuid}.`,
    `Monitor subnet ${subnet.netuid} emissions.`,
    `Prepare staking 1 TAO on subnet ${subnet.netuid} after I choose a validator hotkey.`,
  ];
}

function adapterStatusForCapability(
  adapter: BittensorCapabilityManifest["serviceAdapter"],
  configuredAdapter: BittensorConfiguredSubnetAdapter | null,
): BittensorCapabilityManifest["adapterStatus"] {
  if (configuredAdapter?.serviceAdapter !== "unsupported" && configuredAdapter && adapter !== "unsupported") {
    return {
      configured: true,
      adapter,
      message: `Direct service adapter configured: ${configuredAdapter.name}.`,
      requiredAuth: configuredAdapter.requiredAuth,
      costModel: configuredAdapter.costModel,
    };
  }
  if (adapter === "universal") {
    return {
      configured: false,
      adapter,
      message: "Universal read, explanation, comparison, monitoring, and unsigned preview workflows are available.",
      requiredAuth: "none",
      costModel: "free_read",
    };
  }
  return {
    configured: false,
    adapter,
    message: `No ${adapter.replace(/_/g, " ")} service adapter is configured yet; Matterhorn can still explain, compare, monitor, and prepare safe previews.`,
    requiredAuth: "unknown",
    costModel: "unknown",
  };
}

export function capabilityFromSubnet(subnet: BittensorSubnetSummary): BittensorCapabilityManifest {
  const configuredAdapter = getConfiguredSubnetAdapter(subnet.netuid);
  const adapter = configuredAdapter?.serviceAdapter === "unsupported"
    ? adapterForCategory(subnet.category)
    : configuredAdapter?.serviceAdapter ?? adapterForCategory(subnet.category);
  const adapterStatus = adapterStatusForCapability(adapter, configuredAdapter);
  return {
    netuid: subnet.netuid,
    name: subnet.name,
    category: subnet.category,
    utilitySummary: subnet.benefitSummary,
    capabilityLevel: capabilityLevelFor(adapter, configuredAdapter),
    userBenefits: benefitsForCapability(subnet, adapter),
    examplePrompts: examplePromptsForCapability(subnet),
    supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "monitor", "subnet_use"],
    serviceAdapter: adapter,
    requiredAuth: adapterStatus.requiredAuth,
    costModel: adapterStatus.costModel,
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
    dataFreshness: {
      source: subnet.source,
      block: subnet.block ?? null,
      freshness: subnet.freshness ?? null,
      updatedAt: subnet.updatedAt,
      liveReadReady: subnet.source !== "curated-fallback",
    },
    adapterStatus,
    safetyNotes: [
      "Universal support covers explanation, metagraph, staking guidance, wallet context, and monitoring.",
      adapterStatus.message,
      ...(configuredAdapter?.safetyNotes ?? []),
      "Signed Bittensor actions require an external signer.",
    ],
  };
}

function goalCategoryHints(goal: string): Array<{ category: string; reason: string }> {
  const lower = goal.toLowerCase();
  const hints: Array<{ category: string; reason: string }> = [];
  if (/(image|video|media|creative|art|render|vision|design|generate)/.test(lower)) {
    hints.push({ category: "Creative AI", reason: "The goal looks like a creative or media task." });
  }
  if (/(compute|gpu|hash|infrastructure|hosting|serve|serving|cloud)/.test(lower)) {
    hints.push({ category: "Compute and infrastructure", reason: "The goal needs compute, hosting, or infrastructure." });
  }
  if (/(search|data|dataset|crawl|index|retrieval|knowledge|document|web)/.test(lower)) {
    hints.push({ category: "Data and knowledge", reason: "The goal needs data, search, or retrieval." });
  }
  if (/(agent|tool|automation|workflow|mcp|assistant)/.test(lower)) {
    hints.push({ category: "Agent tools", reason: "The goal mentions agent tooling or workflow automation." });
  }
  if (/(inference|model|chat|text|prompt|llm|language)/.test(lower)) {
    hints.push({ category: "Intelligence market", reason: "The goal looks like a model or inference task." });
  }
  if (/(market|finance|trading|risk|price|prediction)/.test(lower)) {
    hints.push({ category: "Financial intelligence", reason: "The goal looks like market or financial intelligence." });
  }
  if (/(science|research|biology|health|paper|lab)/.test(lower)) {
    hints.push({ category: "Science and research", reason: "The goal looks like a research task." });
  }
  return hints;
}

function tokenizeGoal(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !["the", "and", "for", "with", "use", "using", "subnet", "bittensor"].includes(token))
    .slice(0, 16);
}

export function scoreBittensorSubnetForGoal(subnet: BittensorSubnetSummary, goal: string): BittensorSubnetDiscoveryMatch {
  const lowerGoal = goal.toLowerCase();
  const searchable = `${subnet.netuid} ${subnet.name} ${subnet.symbol} ${subnet.category} ${subnet.benefitSummary}`.toLowerCase();
  const hints = goalCategoryHints(goal);
  const tokens = tokenizeGoal(goal);
  const reasons: string[] = [];
  let score = 0;

  for (const hint of hints) {
    if (subnet.category === hint.category) {
      score += 10;
      reasons.push(hint.reason);
    }
  }

  for (const token of tokens) {
    if (searchable.includes(token)) {
      score += 2;
      reasons.push(`Matched "${token}" in subnet metadata.`);
    }
  }

  if (lowerGoal.includes(String(subnet.netuid)) || lowerGoal.includes(`sn${subnet.netuid}`)) {
    score += 8;
    reasons.push("The prompt names this netuid directly.");
  }
  if (subnet.emission !== null && subnet.emission > 0) score += 1;
  if (subnet.source !== "curated-fallback") score += 1;
  if (!reasons.length) reasons.push("Included as a fallback candidate because no stronger match was available.");

  return { subnet, score, reasons: [...new Set(reasons)].slice(0, 4) };
}

export async function findBittensorSubnetsForGoal(input: { goal: string; limit?: number | null }): Promise<BittensorSubnetDiscoveryResult> {
  const goal = input.goal.trim() || "Find useful Bittensor subnets";
  const limit = Math.min(12, Math.max(1, Number(input.limit ?? 8) || 8));
  const subnets = await bittensorProvider.listSubnets();
  const scored = subnets
    .map((subnet) => scoreBittensorSubnetForGoal(subnet, goal))
    .sort((a, b) => b.score - a.score || a.subnet.netuid - b.subnet.netuid);
  const confident = scored.filter((match) => match.score > 0);
  const matches = (confident.length ? confident : scored).slice(0, limit);
  const cards = buildBittensorSubnetCards(matches.map((match) => match.subnet)).map((card, index) => {
    const match = matches[index];
    return {
      ...card,
      summary: match ? `${card.summary ?? ""} Match reason: ${match.reasons[0]}`.trim() : card.summary,
      data: { ...(card.data ?? {}), match },
    };
  });
  return { goal, matches, cards };
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
      canSubmit: false,
      network: bittensorNetwork(),
      address: address && isValidSs58Address(address) ? address : null,
      message: "Subtensor sidecar is configured for live reads and unsigned payload preparation. Submission stays disabled until signed-payload verification is tested.",
    };
  }
  return {
    mode: "desktop_handoff",
    available: true,
    canSign: false,
    canSubmit: false,
    network: bittensorNetwork(),
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
  const sidecar = subtensorSidecarClient();
  const sidecarPreview = sidecar ? await sidecar.prepareExtrinsic(input) : null;
  const sidecarPayload = sidecarPreview
    ? asRecord(sidecarPreview["unsignedPayload"] ?? sidecarPreview["payload"] ?? sidecarPreview["call"] ?? sidecarPreview["extrinsic"])
    : {};
  const sidecarWarnings = sidecarPreview
    ? arrayFrom(sidecarPreview["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (sidecarPreview) warnings.push("Unsigned payload enriched by configured Subtensor sidecar.", ...sidecarWarnings);

  return {
    action,
    network: signer.network,
    netuid: quote.netuid ?? input.netuid ?? input.originNetuid ?? null,
    amountTao: quote.amountTao,
    coldkey,
    hotkey,
    destination,
    feeTao: firstNumber(sidecarPreview ?? {}, ["feeTao", "fee_tao", "partialFeeTao", "partial_fee_tao"]) ?? quote.feeTao,
    slippageBps: firstNumber(sidecarPreview ?? {}, ["slippageBps", "slippage_bps", "priceImpactBps", "price_impact_bps"]) ?? quote.slippageBps,
    expectedAlpha: firstNumber(sidecarPreview ?? {}, ["expectedAlpha", "expected_alpha", "alphaOut", "alpha_out"]) ?? quote.expectedAlpha,
    unsignedPayload: Object.keys(sidecarPayload).length ? sidecarPayload : {
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

const HANDOFF_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i;

function findForbiddenHandoffKey(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenHandoffKey(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (HANDOFF_FORBIDDEN_KEY_RE.test(key)) {
      return [...path, key].join(".");
    }
    const nested = findForbiddenHandoffKey(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function createBittensorSigningHandoff(preview: BittensorExtrinsicPreview): BittensorSigningHandoff {
  if (!preview.requiresExternalSignature) {
    throw new Error("Bittensor handoff requires an external-signature preview.");
  }
  const payload = asRecord(preview.unsignedPayload);
  if (!Object.keys(payload).length) {
    throw new Error("Unsigned payload is required before creating a Bittensor signing handoff.");
  }
  const forbiddenKey = findForbiddenHandoffKey(payload);
  if (forbiddenKey) {
    throw new Error(`Unsigned payload contains a disallowed signing-material field: ${forbiddenKey}`);
  }
  const payloadJson = stableJson(payload);
  const payloadSha256 = createHash("sha256").update(payloadJson).digest("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const netuidPart = preview.netuid === null ? "network" : `subnet-${preview.netuid}`;
  const suggestedFilename = `bittensor-${preview.action}-${netuidPart}-${payloadSha256.slice(0, 10)}.json`;
  return {
    id: `bt-handoff-${payloadSha256.slice(0, 16)}`,
    action: preview.action,
    network: preview.network,
    netuid: preview.netuid,
    payload,
    payloadJson,
    payloadSha256,
    suggestedFilename,
    signerMode: preview.signer.mode,
    createdAt,
    expiresAt,
    instructions: [
      "Review the action, network, netuid, amount, destination, fee, and slippage in Matterhorn.",
      "Open the payload in a Bittensor-compatible external signer or CLI flow.",
      "Confirm the signer shows the same payload SHA-256 before signing.",
      "Return only the signed payload or signature to Matterhorn for optional sidecar submission.",
    ],
    warnings: [
      ...preview.warnings,
      "Matterhorn cannot sign this payload. The external signer is the final authority.",
      "If the signer displays different action details, cancel and rebuild the preview.",
    ],
    consequenceSummary: preview.consequenceSummary,
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
    const configuredAdapter = getConfiguredSubnetAdapter(netuid);
    if (configuredAdapter) {
      const adapterResult = await invokeConfiguredSubnetAdapter(configuredAdapter, input);
      const ok = adapterResult?.["ok"] !== false;
      return {
        netuid,
        intent,
        adapter: configuredAdapter.serviceAdapter,
        supported: Boolean(ok && adapterResult),
        result: {
          capability,
          requestedTask: input.task ?? null,
          adapter: {
            name: configuredAdapter.name,
            requiredAuth: configuredAdapter.requiredAuth,
            costModel: configuredAdapter.costModel,
          },
          output: adapterResult,
        },
        message: ok && adapterResult
          ? `Matterhorn invoked the configured ${configuredAdapter.name} adapter for ${detail.name}.`
          : `The configured ${configuredAdapter.name} adapter for ${detail.name} did not complete successfully.`,
        warnings: [...warnings, ...configuredAdapter.safetyNotes],
      };
    }
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

function normalizeForScore(value: number | null, max: number): number {
  if (value === null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function validatorStrategyWeights(strategy: BittensorValidatorComparison["strategy"]): { stake: number; trust: number; dividends: number } {
  if (strategy === "yield") return { stake: 0.25, trust: 0.25, dividends: 0.5 };
  if (strategy === "safety") return { stake: 0.45, trust: 0.4, dividends: 0.15 };
  return { stake: 0.35, trust: 0.35, dividends: 0.3 };
}

function normalizeValidatorStrategy(value: unknown): BittensorValidatorComparison["strategy"] {
  return value === "yield" || value === "safety" || value === "balanced" ? value : "balanced";
}

export async function compareBittensorValidators(input: BittensorValidatorCompareInput): Promise<BittensorValidatorComparison> {
  const netuid = Number.isInteger(input.netuid) && input.netuid >= 0 ? input.netuid : 0;
  const detail = await bittensorProvider.getSubnet(netuid);
  const strategy = normalizeValidatorStrategy(input.strategy);
  const requestedHotkeys = new Set((input.hotkeys ?? []).filter((item): item is string => typeof item === "string" && isValidSs58Address(item)));
  const limit = Math.min(12, Math.max(1, Number(input.limit ?? 6) || 6));
  const validators = requestedHotkeys.size
    ? detail.topValidators.filter((validator) => Boolean(validator.hotkey && requestedHotkeys.has(validator.hotkey)))
    : detail.topValidators;
  const maxStake = Math.max(0, ...validators.map((validator) => validator.stake ?? 0));
  const maxTrust = Math.max(0, ...validators.map((validator) => validator.trust ?? 0));
  const maxDividends = Math.max(0, ...validators.map((validator) => validator.dividends ?? 0));
  const weights = validatorStrategyWeights(strategy);

  const candidates = validators
    .map((validator): BittensorValidatorCandidate => {
      const stakeScore = normalizeForScore(validator.stake, maxStake);
      const trustScore = maxTrust > 1
        ? normalizeForScore(validator.trust, maxTrust)
        : Math.max(0, Math.min(1, validator.trust ?? 0));
      const dividendScore = maxDividends > 1
        ? normalizeForScore(validator.dividends, maxDividends)
        : Math.max(0, Math.min(1, validator.dividends ?? 0));
      const score = Math.round(100 * (
        stakeScore * weights.stake +
        trustScore * weights.trust +
        dividendScore * weights.dividends
      ));
      const reasons = [
        validator.stake !== null ? `Stake sample: ${formatMetric(validator.stake)}.` : "Stake sample unavailable.",
        validator.trust !== null ? `Trust sample: ${formatMetric(validator.trust, "", 4)}.` : "Trust sample unavailable.",
        validator.dividends !== null ? `Dividend sample: ${formatMetric(validator.dividends, "", 4)}.` : "Dividend sample unavailable.",
      ];
      const warnings = [
        "Validator comparison is informational, not financial advice.",
        "Verify validator identity, commission/fees where applicable, and recent behavior in an external explorer before staking.",
      ];
      if (!validator.hotkey) warnings.push("Validator hotkey is unavailable in this metagraph sample.");
      if (detail.source === "curated-fallback") warnings.push("Live provider data was unavailable; this comparison is incomplete.");

      return {
        netuid,
        subnetName: detail.name,
        uid: validator.uid,
        hotkey: validator.hotkey,
        coldkey: validator.coldkey,
        stake: validator.stake,
        trust: validator.trust,
        dividends: validator.dividends,
        score,
        reasons,
        warnings,
        source: detail.source,
      };
    })
    .sort((a, b) => b.score - a.score || (b.stake ?? 0) - (a.stake ?? 0))
    .slice(0, limit);

  const warnings = [
    "This is a deterministic inspection shortlist, not a recommendation to stake.",
    "Matterhorn uses public metagraph/provider data only and never handles Bittensor seed phrases or private keys.",
  ];
  if (!detail.topValidators.length) warnings.push("No validator sample was available for this subnet.");
  if (requestedHotkeys.size && !candidates.length) warnings.push("None of the requested validator hotkeys appeared in the available top-validator sample.");
  if (detail.source === "curated-fallback") warnings.push("Live provider data was unavailable; connect TAO.app or a Subtensor sidecar for stronger results.");

  return {
    netuid,
    subnetName: detail.name,
    strategy,
    candidates,
    warnings,
    source: detail.source,
    updatedAt: nowIso(),
  };
}

function riskFromShare(share: number | null): BittensorRiskLevel {
  if (share === null || !Number.isFinite(share)) return "unknown";
  if (share >= 0.5) return "high";
  if (share >= 0.33) return "medium";
  return "low";
}

function riskFromSlippagePositions(positions: BittensorStakePosition[]): BittensorRiskLevel {
  if (!positions.length) return "unknown";
  if (positions.some((position) => position.slippageRisk === "high")) return "high";
  if (positions.some((position) => position.slippageRisk === "medium")) return "medium";
  if (positions.some((position) => position.slippageRisk === "low")) return "low";
  return "unknown";
}

function riskTone(risk: BittensorRiskLevel): BittensorChatCardItem["tone"] {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "good";
  return "muted";
}

function reportRating(score: number): BittensorSubnetIntelligenceReport["rating"] {
  if (score >= 75) return "strong_public_context";
  if (score >= 50) return "usable_with_caveats";
  return "limited_provider_context";
}

function subnetDataQualityRisk(detail: BittensorSubnetDetail): BittensorRiskLevel {
  if (detail.source === "curated-fallback") return "high";
  if (!detail.topValidators.length || detail.metagraphSummary.neurons === null) return "medium";
  if (!detail.freshness && detail.block === null && detail.block === undefined) return "medium";
  return "low";
}

function subnetIntelligenceScore(input: {
  detail: BittensorSubnetDetail;
  concentrationRisk: BittensorRiskLevel;
  dataQualityRisk: BittensorRiskLevel;
  capability: BittensorCapabilityManifest;
}): number {
  const { detail, concentrationRisk, dataQualityRisk, capability } = input;
  let score = 45;
  if (detail.source !== "curated-fallback") score += 12;
  if (detail.block !== null && detail.block !== undefined) score += 8;
  if (detail.freshness) score += 6;
  if (detail.priceTao !== null) score += 5;
  if (detail.emission !== null) score += 4;
  if (detail.metagraphSummary.neurons !== null) score += 6;
  if (detail.topValidators.length) score += 6;
  if (capability.capabilityLevel === "adapter_ready") score += 5;
  if (capability.capabilityLevel === "adapter_required") score += 2;
  if (concentrationRisk === "high") score -= 14;
  if (concentrationRisk === "medium") score -= 7;
  if (dataQualityRisk === "high") score -= 20;
  if (dataQualityRisk === "medium") score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function analyzeBittensorSubnetIntelligence(netuid: number): Promise<BittensorSubnetIntelligenceReport> {
  let detail = fallbackSubnet(netuid);
  let detailReadWarning: string | null = null;
  try {
    detail = await bittensorProvider.getSubnet(netuid);
  } catch (err) {
    detailReadWarning = err instanceof Error ? err.message : "Live subnet detail read failed.";
  }
  const capability = capabilityFromSubnet(detail);
  const totalStake = detail.metagraphSummary.totalStake;
  const topStake = Math.max(0, ...detail.topValidators.map((validator) => validator.stake ?? 0));
  const topValidatorStakeShare = totalStake && totalStake > 0 && topStake > 0 ? topStake / totalStake : null;
  const concentrationRisk = riskFromShare(topValidatorStakeShare);
  const dataQualityRisk = subnetDataQualityRisk(detail);
  const score = subnetIntelligenceScore({ detail, concentrationRisk, dataQualityRisk, capability });
  const mechanismAvailable = false;
  const warnings = uniqueWarnings(
    detailReadWarning ? [`Live subnet detail read failed: ${detailReadWarning}. Falling back to curated subnet context.`] : [],
    detail.source === "curated-fallback" ? ["Live provider data was unavailable; this report uses curated fallback metadata."] : [],
    !detail.topValidators.length ? ["No validator sample was available for this subnet."] : [],
    detail.priceTao === null ? ["Dynamic TAO price was unavailable from the current provider."] : [],
    concentrationRisk === "high" ? ["The visible validator sample appears highly concentrated."] : [],
    concentrationRisk === "medium" ? ["The visible validator sample shows moderate concentration."] : [],
    !mechanismAvailable ? ["Mechanism-specific metagraph fields are not exposed by the current provider contract yet."] : [],
    ["This is public-data intelligence, not financial advice."],
  );
  const signals: BittensorIntelligenceSignal[] = [
    {
      label: "Provider quality",
      value: dataQualityRisk === "low" ? "Live-shaped" : dataQualityRisk === "medium" ? "Partial" : "Fallback",
      tone: riskTone(dataQualityRisk),
      explanation: "Scores whether the current provider returned live/fresh subnet and metagraph context.",
    },
    {
      label: "Validator concentration",
      value: topValidatorStakeShare === null ? "Unknown" : `${Math.round(topValidatorStakeShare * 100)}% top visible stake`,
      tone: riskTone(concentrationRisk),
      explanation: "Uses the largest visible validator stake share from the current metagraph sample.",
    },
    {
      label: "Adapter readiness",
      value: titleCase(capability.capabilityLevel.replace(/_/g, " ")),
      tone: capability.capabilityLevel === "adapter_ready" ? "good" : capability.capabilityLevel === "adapter_required" ? "warning" : "default",
      explanation: capability.adapterStatus.message,
    },
    {
      label: "Market context",
      value: detail.priceTao === null ? "Price unavailable" : `${formatMetric(detail.priceTao)} TAO price`,
      tone: detail.priceTao === null ? "muted" : "default",
      explanation: "Uses Dynamic TAO-style pricing fields when the provider exposes them.",
    },
  ];

  return {
    kind: "subnet",
    netuid: detail.netuid,
    name: detail.name,
    category: detail.category,
    score,
    rating: reportRating(score),
    mechanismSummary: {
      available: mechanismAvailable,
      count: mechanismAvailable ? 1 : null,
      note: mechanismAvailable
        ? "Mechanism data is available from the provider."
        : "Current provider data is a subnet-level summary. Mechanism-specific metagraph support is a follow-up contract.",
    },
    market: {
      priceTao: detail.priceTao,
      emission: detail.emission,
      tempo: detail.tempo,
      source: detail.source,
      block: detail.block ?? detail.metagraphSummary.block ?? null,
      freshness: detail.freshness ?? null,
    },
    metagraph: {
      neurons: detail.metagraphSummary.neurons,
      totalStake,
      validatorsSampled: detail.topValidators.length,
      topValidatorStakeShare,
      concentrationRisk,
      dataQuality: dataQualityRisk,
    },
    capability: {
      capabilityLevel: capability.capabilityLevel,
      serviceAdapter: capability.serviceAdapter,
      adapterStatus: capability.adapterStatus,
      userBenefits: capability.userBenefits,
    },
    signals,
    warnings,
    nextQuestions: [
      `Compare validators on subnet ${detail.netuid}.`,
      `Monitor subnet ${detail.netuid} emissions and slippage.`,
      `Prepare staking 1 TAO on subnet ${detail.netuid} after I choose a validator hotkey.`,
    ],
    updatedAt: nowIso(),
  };
}

export async function analyzeBittensorWalletIntelligence(ss58Address: string): Promise<BittensorWalletIntelligenceReport> {
  const wallet = await bittensorProvider.getWallet(ss58Address);
  const positions = wallet.stakePositions;
  const stakeValues = positions.map((position) => position.taoValue).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const stakeTotalTao = stakeValues.length ? stakeValues.reduce((sum, value) => sum + value, 0) : null;
  const largestPosition = stakeValues.length ? Math.max(...stakeValues) : null;
  const largestPositionShare = stakeTotalTao && largestPosition !== null && stakeTotalTao > 0 ? largestPosition / stakeTotalTao : null;
  const subnetCount = new Set(positions.map((position) => position.netuid)).size;
  const validatorCount = new Set(positions.map((position) => position.validatorHotkey).filter(Boolean)).size;
  const concentrationRisk = riskFromShare(largestPositionShare);
  const slippageRisk = riskFromSlippagePositions(positions);
  const staleDataRisk: BittensorRiskLevel = wallet.providerStatus !== "ok"
    ? "high"
    : !wallet.freshness && wallet.block === null
      ? "medium"
      : "low";
  const largestPositions = [...positions]
    .sort((a, b) => (b.taoValue ?? 0) - (a.taoValue ?? 0))
    .slice(0, 5);
  const warnings = uniqueWarnings(
    wallet.providerStatus === "ok" ? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    concentrationRisk === "high" ? ["Wallet stake appears concentrated in one visible position."] : [],
    concentrationRisk === "medium" ? ["Wallet stake has moderate visible concentration."] : [],
    slippageRisk === "high" ? ["At least one visible position has high slippage risk."] : [],
    slippageRisk === "medium" ? ["At least one visible position has medium slippage risk."] : [],
    staleDataRisk !== "low" ? ["Wallet data freshness is limited from the current provider."] : [],
    ["This is watch-only public wallet intelligence, not financial advice."],
    wallet.warnings ?? [],
  );
  const signals: BittensorIntelligenceSignal[] = [
    {
      label: "Stake concentration",
      value: largestPositionShare === null ? "Unknown" : `${Math.round(largestPositionShare * 100)}% largest position`,
      tone: riskTone(concentrationRisk),
      explanation: "Largest visible stake position as a share of visible staked TAO value.",
    },
    {
      label: "Subnet spread",
      value: `${subnetCount} subnet${subnetCount === 1 ? "" : "s"}`,
      tone: subnetCount > 1 ? "good" : subnetCount === 1 ? "warning" : "muted",
      explanation: "Counts distinct subnets returned by the watch-only wallet provider.",
    },
    {
      label: "Validator spread",
      value: `${validatorCount} validator hotkey${validatorCount === 1 ? "" : "s"}`,
      tone: validatorCount > 1 ? "good" : validatorCount === 1 ? "warning" : "muted",
      explanation: "Counts distinct validator hotkeys returned by the watch-only wallet provider.",
    },
    {
      label: "Data freshness",
      value: wallet.freshness ?? "Unavailable",
      tone: riskTone(staleDataRisk),
      explanation: "Uses provider freshness and block labels where available.",
    },
  ];

  return {
    kind: "wallet",
    ss58Address: wallet.ss58Address,
    freeTao: wallet.taoBalance,
    stakeTotalTao,
    estimatedValueTao: wallet.estimatedValueTao,
    subnetCount,
    validatorCount,
    largestPositionShare,
    concentrationRisk,
    slippageRisk,
    staleDataRisk,
    largestPositions,
    signals,
    warnings,
    nextQuestions: [
      "Where am I staked?",
      "Create watches for my riskiest Bittensor positions.",
      "Compare validators for my largest subnet exposure.",
    ],
    source: wallet.source ?? "provider",
    block: wallet.block ?? null,
    freshness: wallet.freshness ?? null,
    updatedAt: nowIso(),
  };
}

export function listBittensorWatches(): BittensorWatch[] {
  loadPersistedWatchlist();
  return [...watchlist.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createBittensorWatch(input: Partial<BittensorWatch>): BittensorWatch {
  loadPersistedWatchlist();
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
  persistWatchlist();
  return watch;
}

function compareThreshold(observedValue: number | null, threshold: number | null, mode: "min" | "max"): BittensorWatchEvaluation["status"] {
  if (observedValue === null) return "unavailable";
  if (threshold === null) return "ok";
  return mode === "min"
    ? observedValue >= threshold ? "ok" : "warning"
    : observedValue <= threshold ? "ok" : "warning";
}

export async function evaluateBittensorWatch(watch: BittensorWatch): Promise<BittensorWatchEvaluation> {
  const checkedAt = nowIso();
  if (watch.kind === "wallet") {
    if (!watch.ss58Address) {
      return {
        watch,
        status: "unavailable",
        summary: "Wallet watch needs an SS58 coldkey public address.",
        observedValue: null,
        threshold: watch.threshold,
        source: "matterhorn",
        checkedAt,
      };
    }
    const wallet = await bittensorProvider.getWallet(watch.ss58Address);
    return {
      watch,
      status: wallet.providerStatus === "ok" ? "ok" : "unavailable",
      summary: wallet.providerStatus === "ok"
        ? `Wallet has ${wallet.stakePositions.length} subnet stake position(s).`
        : wallet.message ?? "Wallet provider data is unavailable.",
      observedValue: wallet.estimatedValueTao,
      threshold: watch.threshold,
      source: wallet.providerStatus === "ok" ? "provider" : "matterhorn",
      checkedAt,
    };
  }

  if (watch.netuid === null) {
    return {
      watch,
      status: "unavailable",
      summary: "This watch needs a subnet netuid before it can be checked.",
      observedValue: null,
      threshold: watch.threshold,
      source: "matterhorn",
      checkedAt,
    };
  }

  const subnet = await bittensorProvider.getSubnet(watch.netuid);
  if (watch.kind === "emissions") {
    const status = compareThreshold(subnet.emission, watch.threshold, "min");
    return {
      watch,
      status,
      summary: subnet.emission === null
        ? `Emission data for ${subnet.name} is unavailable.`
        : status === "warning"
          ? `${subnet.name} emission is below the configured threshold.`
          : `${subnet.name} emission is within the configured range.`,
      observedValue: subnet.emission,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    };
  }

  if (watch.kind === "slippage") {
    return {
      watch,
      status: subnet.priceTao === null ? "unavailable" : "ok",
      summary: subnet.priceTao === null
        ? `Live alpha price for ${subnet.name} is unavailable; quote-specific slippage cannot be inferred.`
        : `${subnet.name} alpha price is ${subnet.priceTao} TAO. Build an action preview for quote-specific slippage.`,
      observedValue: subnet.priceTao,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    };
  }

  if (watch.kind === "validator") {
    const target = watch.ss58Address;
    const match = target
      ? subnet.topValidators.find((validator) => validator.hotkey === target || validator.coldkey === target)
      : null;
    return {
      watch,
      status: target && match ? "ok" : target ? "warning" : "unavailable",
      summary: target
        ? match
          ? `Validator ${shortSs58(target)} appears in the top validator sample for ${subnet.name}.`
          : `Validator ${shortSs58(target)} was not found in the top validator sample for ${subnet.name}.`
        : "Validator watch needs a hotkey or coldkey public address.",
      observedValue: match?.stake ?? null,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    };
  }

  return {
    watch,
    status: subnet.source === "curated-fallback" ? "warning" : "ok",
    summary: subnet.source === "curated-fallback"
      ? `Only fallback metadata is available for ${subnet.name}.`
      : `${subnet.name} metadata is available from ${subnet.source}.`,
    observedValue: subnet.metagraphSummary.neurons ?? subnet.emission ?? subnet.priceTao,
    threshold: watch.threshold,
    source: subnet.source,
    checkedAt,
  };
}

export async function evaluateBittensorWatches(): Promise<BittensorWatchEvaluation[]> {
  const watches = listBittensorWatches();
  return Promise.all(watches.map((watch) => evaluateBittensorWatch(watch)));
}

function readinessStatus(checks: BittensorReadinessCheck[]): BittensorReadinessReport["status"] {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

function secretFieldPath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = secretFieldPath(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i.test(key)) return [...path, key].join(".");
    const nested = secretFieldPath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

export async function auditBittensorReadiness(): Promise<BittensorReadinessReport> {
  const checks: BittensorReadinessCheck[] = [];
  const checkedAt = nowIso();

  try {
    const samples: Array<[string, BittensorChatIntent]> = [
      ["I'm new to Bittensor, explain coldkeys and hotkeys", "learn"],
      ["Which subnet helps with image generation?", "discover"],
      ["Show my Bittensor wallet", "wallet"],
      ["Stake 1 TAO to subnet 14 safely", "stake_plan"],
      ["Use subnet 14 for this task", "subnet_use"],
      ["Monitor subnet 14 emissions", "monitor"],
    ];
    const plans = samples.map(([message]) => planBittensorChat({ message }));
    const mismatches = plans.flatMap((plan, index) => plan.intent === samples[index]?.[1] ? [] : [`${samples[index]?.[0]} -> ${plan.intent}`]);
    checks.push({
      id: "chat_intents",
      label: "Chat intent planner",
      status: mismatches.length ? "fail" : "pass",
      summary: mismatches.length ? "Some Bittensor chat intents classified incorrectly." : "Core Bittensor chat intents classify into deterministic workflows.",
      details: { mismatches, intents: plans.map((plan) => plan.intent) },
    });
  } catch (err) {
    checks.push({ id: "chat_intents", label: "Chat intent planner", status: "fail", summary: err instanceof Error ? err.message : "Intent planner failed." });
  }

  try {
    const result = await executeBittensorChatWorkflow({ message: "explain Bittensor context memory" });
    const disallowed = secretFieldPath(result.context);
    checks.push({
      id: "chat_context",
      label: "Public chat context",
      status: result.context && !disallowed ? "pass" : "fail",
      summary: result.context && !disallowed
        ? "Bittensor chat returns reusable public context without signing-material fields."
        : "Bittensor chat context was missing or carried a disallowed field.",
      details: { contextId: result.context?.id ?? null, disallowed },
    });
  } catch (err) {
    checks.push({ id: "chat_context", label: "Public chat context", status: "fail", summary: err instanceof Error ? err.message : "Chat context audit failed." });
  }

  let subnets: BittensorSubnetSummary[] = [];
  try {
    subnets = await bittensorProvider.listSubnets();
    const fallbackOnly = subnets.length > 0 && subnets.every((subnet) => subnet.source === "curated-fallback");
    const providerBacked = subnets.filter((subnet) => subnet.source !== "curated-fallback");
    const providerBackedWithFreshness = providerBacked.filter((subnet) => (subnet.block !== null && subnet.block !== undefined) || Boolean(subnet.freshness));
    checks.push({
      id: "subnet_discovery",
      label: "Subnet discovery",
      status: subnets.length ? fallbackOnly ? "warning" : "pass" : "fail",
      summary: subnets.length
        ? fallbackOnly
          ? "Subnet discovery is available, but only fallback metadata is loaded."
          : "Subnet discovery returned live or provider-backed subnet metadata."
        : "Subnet discovery returned no subnets.",
      details: { count: subnets.length, sources: [...new Set(subnets.map((subnet) => subnet.source))] },
    });
    checks.push({
      id: "live_read_freshness",
      label: "Live-read freshness",
      status: providerBacked.length === 0 ? "warning" : providerBackedWithFreshness.length ? "pass" : "warning",
      summary: providerBacked.length === 0
        ? "No provider-backed subnet freshness was available; Matterhorn will label fallback data clearly."
        : providerBackedWithFreshness.length
          ? "Provider-backed subnet metadata includes block or freshness labels for chat cards."
          : "Provider-backed subnet metadata is available but does not include block or freshness labels.",
      details: {
        providerBacked: providerBacked.length,
        withFreshness: providerBackedWithFreshness.length,
        fallback: subnets.length - providerBacked.length,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_discovery", label: "Subnet discovery", status: "fail", summary: err instanceof Error ? err.message : "Subnet discovery failed." });
  }

  try {
    const capabilities = subnets.length ? subnets.map(capabilityFromSubnet) : await listBittensorCapabilities();
    const missingUniversal = capabilities.filter((capability) =>
      !capability.supportedChatIntents.includes("learn") ||
      !capability.supportedChatIntents.includes("discover") ||
      !capability.supportedChatIntents.includes("wallet") ||
      !capability.supportedChatIntents.includes("stake_plan") ||
      !capability.supportedChatIntents.includes("monitor")
    );
    const missingV2Fields = capabilities.filter((capability) =>
      !capability.capabilityLevel ||
      !Array.isArray(capability.userBenefits) ||
      !capability.userBenefits.length ||
      !Array.isArray(capability.examplePrompts) ||
      !capability.examplePrompts.length ||
      !capability.adapterStatus ||
      !capability.dataFreshness
    );
    checks.push({
      id: "capabilities",
      label: "Subnet capability registry",
      status: missingUniversal.length || missingV2Fields.length ? "fail" : capabilities.length ? "pass" : "warning",
      summary: missingUniversal.length
        ? "Some capability manifests are missing universal chat support."
        : missingV2Fields.length
          ? "Some capability manifests are missing Phase 3/4 capability metadata."
        : capabilities.length
          ? "Capability manifests include universal Bittensor chat support, adapter readiness, examples, and freshness labels."
          : "No capability manifests were available to audit.",
      details: {
        count: capabilities.length,
        missingNetuids: missingUniversal.map((capability) => capability.netuid),
        missingV2Netuids: missingV2Fields.map((capability) => capability.netuid),
        adapterReady: capabilities.filter((capability) => capability.capabilityLevel === "adapter_ready").length,
        adapterRequired: capabilities.filter((capability) => capability.capabilityLevel === "adapter_required").length,
      },
    });
  } catch (err) {
    checks.push({ id: "capabilities", label: "Subnet capability registry", status: "fail", summary: err instanceof Error ? err.message : "Capability audit failed." });
  }

  try {
    const wallet = await bittensorProvider.getWallet("invalid-ss58");
    checks.push({
      id: "wallet_safety",
      label: "Wallet read safety",
      status: wallet.providerStatus === "provider_unavailable" && wallet.message?.includes("valid watch-only SS58") ? "pass" : "fail",
      summary: wallet.providerStatus === "provider_unavailable"
        ? "Wallet reads reject invalid SS58 addresses without asking for secrets."
        : "Wallet read did not reject an invalid SS58 address as expected.",
      details: { providerStatus: wallet.providerStatus },
    });
  } catch (err) {
    checks.push({ id: "wallet_safety", label: "Wallet read safety", status: "fail", summary: err instanceof Error ? err.message : "Wallet safety check failed." });
  }

  try {
    const preview = await prepareBittensorExtrinsic({ action: "stake", netuid: 14, amountTao: "1" });
    const handoff = createBittensorSigningHandoff(preview);
    const forbiddenPath = secretFieldPath({ preview, handoff });
    checks.push({
      id: "signing_safety",
      label: "Signing safety",
      status: forbiddenPath ? "fail" : preview.requiresExternalSignature && handoff.payloadSha256.length === 64 ? "pass" : "fail",
      summary: forbiddenPath
        ? `Unsigned signing flow exposes a forbidden field: ${forbiddenPath}.`
        : "Extrinsic previews and handoffs stay unsigned, checksumed, and external-signature-only.",
      details: {
        action: preview.action,
        signerMode: preview.signer.mode,
        canSign: preview.signer.canSign,
        canSubmit: preview.signer.canSubmit,
      },
    });
  } catch (err) {
    checks.push({ id: "signing_safety", label: "Signing safety", status: "fail", summary: err instanceof Error ? err.message : "Signing safety check failed." });
  }

  try {
    const signer = getBittensorSignerStatus();
    const sidecar = await checkSubtensorSidecarHealth();
    checks.push({
      id: "sidecar_status",
      label: "Subtensor sidecar status",
      status: sidecar.status === "healthy" ? "pass" : "warning",
      summary: sidecar.status === "healthy"
        ? "Subtensor sidecar is configured and reachable for live chain reads and signed-payload submission."
        : sidecar.status === "unreachable"
          ? "Subtensor sidecar is configured but unreachable; Matterhorn will rely on provider data and safe fallbacks."
          : "Subtensor sidecar is not configured; Matterhorn will rely on provider data and safe fallbacks.",
      details: { signerMode: signer.mode, canSubmit: signer.canSubmit, network: sidecar.network, reachable: sidecar.reachable },
    });
  } catch (err) {
    checks.push({ id: "sidecar_status", label: "Subtensor sidecar status", status: "fail", summary: err instanceof Error ? err.message : "Sidecar status check failed." });
  }

  try {
    const comparison = await compareBittensorValidators({ netuid: 14, strategy: "balanced", limit: 3 });
    checks.push({
      id: "validator_comparison",
      label: "Validator comparison",
      status: comparison.candidates.length ? "pass" : "warning",
      summary: comparison.candidates.length
        ? "Validator comparison returned public metagraph candidates."
        : "Validator comparison works, but no validator candidates are available from the current provider sample.",
      details: { candidates: comparison.candidates.length, source: comparison.source },
    });
  } catch (err) {
    checks.push({ id: "validator_comparison", label: "Validator comparison", status: "fail", summary: err instanceof Error ? err.message : "Validator comparison failed." });
  }

  try {
    const watch: BittensorWatch = {
      id: "bt-readiness-watch",
      kind: "subnet",
      netuid: 14,
      label: "Readiness watch",
      ss58Address: null,
      threshold: null,
      createdAt: checkedAt,
    };
    const evaluation = await evaluateBittensorWatch(watch);
    checks.push({
      id: "monitoring",
      label: "Monitoring and watches",
      status: evaluation.status === "unavailable" ? "warning" : "pass",
      summary: evaluation.status === "unavailable"
        ? "Watch evaluation is wired, but provider data is unavailable for the sample watch."
        : "Watch creation and evaluation are wired for Bittensor monitoring.",
      details: { status: evaluation.status, source: evaluation.source },
    });
  } catch (err) {
    checks.push({ id: "monitoring", label: "Monitoring and watches", status: "fail", summary: err instanceof Error ? err.message : "Monitoring check failed." });
  }

  const status = readinessStatus(checks);
  const blockers = checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.summary}`);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => `${check.label}: ${check.summary}`);
  return {
    status,
    checkedAt,
    checks,
    blockers,
    warnings,
    nextActions: [
      "Run this readiness audit after every Bittensor change and before starting Hyperliquid or Polymarket execution work.",
      sidecarBaseUrl()
        ? "Use the configured Subtensor sidecar for live metagraph, wallet, quote, and signed-payload submission checks."
        : "Configure BITTENSOR_SUBTENSOR_SIDECAR_URL to upgrade fallback warnings into live-chain checks.",
      "Add subnet service adapters only behind explicit capability manifests and unsupported-adapter fallbacks.",
      "Keep external signing mandatory until a separate custody/security review is complete.",
    ],
  };
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;
}

function formatPercentFromBps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function shortSs58(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value.length > 16 ? `${value.slice(0, 7)}...${value.slice(-6)}` : value;
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cardItem(label: string, value: string | number | null | undefined, tone?: BittensorChatCardItem["tone"]): BittensorChatCardItem {
  return { label, value: value === null || value === undefined || value === "" ? "Unavailable" : String(value), tone };
}

export function buildBittensorPlanCards(plan: BittensorPlan): BittensorChatCard[] {
  return [{
    kind: "subnet_result",
    title: "Bittensor chat plan",
    subtitle: titleCase(plan.intent),
    summary: plan.requiresClarification
      ? plan.clarificationQuestion
      : "Matterhorn has enough context to continue this Bittensor workflow safely.",
    tone: plan.requiresClarification ? "warning" : "default",
    items: [
      cardItem("Intent", titleCase(plan.intent)),
      cardItem("Confidence", `${Math.round(plan.confidence * 100)}%`),
      cardItem("Netuids", plan.netuids.length ? plan.netuids.join(", ") : "None detected", plan.netuids.length ? "default" : "muted"),
      cardItem("Wallet", plan.ss58Address ? shortSs58(plan.ss58Address) : "Not provided", plan.ss58Address ? "default" : "muted"),
    ],
    warnings: plan.safetyNotes,
    data: { plan },
  }];
}

export function buildBittensorSubnetCards(subnets: BittensorSubnetSummary[]): BittensorChatCard[] {
  return subnets.slice(0, 6).map((subnet) => {
    const capability = capabilityFromSubnet(subnet);
    const adapterWarning = capability.capabilityLevel === "adapter_required"
      ? "Matterhorn can explain and monitor this subnet, but direct service execution needs a configured subnet adapter."
      : null;
    return {
      kind: "subnet_comparison",
      title: `${subnet.name} (${subnet.symbol})`,
      subtitle: `Subnet ${subnet.netuid} · ${subnet.category}`,
      summary: subnet.benefitSummary,
      tone: subnet.source === "curated-fallback" ? "warning" : "default",
      items: [
        cardItem("Price", subnet.priceTao === null ? "Unavailable" : `${formatMetric(subnet.priceTao)} TAO`),
        cardItem("Emission", formatMetric(subnet.emission)),
        cardItem("Tempo", formatMetric(subnet.tempo)),
        cardItem("Capability", titleCase(capability.capabilityLevel.replace(/_/g, " ")), capability.capabilityLevel === "adapter_ready" ? "good" : capability.capabilityLevel === "adapter_required" ? "warning" : "default"),
        cardItem("Adapter", capability.adapterStatus.configured ? capability.serviceAdapter.replace(/_/g, " ") : "Not configured", capability.adapterStatus.configured ? "good" : "muted"),
        cardItem("Freshness", subnet.freshness ?? "Unavailable", subnet.freshness ? "default" : "muted"),
        cardItem("Source", subnet.source, subnet.source === "curated-fallback" ? "warning" : "muted"),
      ],
      actions: [{
        label: "Inspect subnet",
        kind: "send_to_chat",
        payload: { prompt: `Explain Bittensor subnet ${subnet.netuid} (${subnet.name}) and how it can help my work.` },
      }],
      warnings: uniqueWarnings(
        subnet.source === "curated-fallback" ? ["Live provider data was unavailable for this subnet."] : [],
        adapterWarning ? [adapterWarning] : [],
      ),
      data: { subnet, capability },
    } satisfies BittensorChatCard;
  });
}

export function buildBittensorWalletCard(wallet: BittensorWalletSnapshot): BittensorChatCard {
  const stakeTotal = wallet.stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
  const riskiest = wallet.stakePositions.find((position) => position.slippageRisk === "high")
    ?? wallet.stakePositions.find((position) => position.slippageRisk === "medium")
    ?? wallet.stakePositions[0]
    ?? null;
  return {
    kind: "wallet_snapshot",
    title: "Bittensor wallet snapshot",
    subtitle: shortSs58(wallet.ss58Address),
    summary: wallet.providerStatus === "ok"
      ? "Watch-only balance and stake exposure loaded."
      : wallet.message ?? "Wallet provider data is unavailable.",
    tone: wallet.providerStatus === "ok" ? "default" : "warning",
    items: [
      cardItem("Free TAO", wallet.taoBalance === null ? "Unavailable" : `${formatMetric(wallet.taoBalance)} TAO`),
      cardItem("Staked value", `${formatMetric(stakeTotal)} TAO`),
      cardItem("Positions", wallet.stakePositions.length),
      cardItem("Highest risk", riskiest ? `${riskiest.subnetName}: ${riskiest.slippageRisk}` : "Unavailable", riskiest?.slippageRisk === "high" ? "warning" : "muted"),
      cardItem("Source", wallet.source ?? "provider", wallet.source?.includes("mock") ? "warning" : "muted"),
      cardItem("Block", wallet.block ?? "Unavailable", wallet.block === null || wallet.block === undefined ? "muted" : "default"),
    ],
    warnings: wallet.providerStatus === "ok" ? wallet.warnings ?? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    data: { wallet },
  };
}

export function buildBittensorSubnetIntelligenceCard(report: BittensorSubnetIntelligenceReport): BittensorChatCard {
  return {
    kind: "intelligence_report",
    title: `${report.name} intelligence`,
    subtitle: `Subnet ${report.netuid} · ${report.category}`,
    summary: `Public-data score ${report.score}/100: ${titleCase(report.rating.replace(/_/g, " "))}.`,
    tone: report.rating === "limited_provider_context" ? "warning" : "default",
    items: [
      cardItem("Score", `${report.score}/100`, report.score >= 75 ? "good" : report.score >= 50 ? "warning" : "danger"),
      cardItem("Provider", report.market.source, report.market.source === "curated-fallback" ? "warning" : "default"),
      cardItem("Freshness", report.market.freshness ?? "Unavailable", report.market.freshness ? "default" : "muted"),
      cardItem("Price", report.market.priceTao === null ? "Unavailable" : `${formatMetric(report.market.priceTao)} TAO`),
      cardItem("Validators sampled", report.metagraph.validatorsSampled),
      cardItem("Concentration", report.metagraph.concentrationRisk, riskTone(report.metagraph.concentrationRisk)),
      cardItem("Mechanisms", report.mechanismSummary.available ? String(report.mechanismSummary.count ?? "Available") : "Not exposed", report.mechanismSummary.available ? "good" : "muted"),
      cardItem("Adapter", report.capability.adapterStatus.configured ? report.capability.serviceAdapter.replace(/_/g, " ") : "Not configured", report.capability.adapterStatus.configured ? "good" : "muted"),
    ],
    actions: [
      {
        label: "Compare validators",
        kind: "send_to_chat",
        payload: { prompt: `Compare validators on subnet ${report.netuid}.` },
      },
      {
        label: "Create watch",
        kind: "send_to_chat",
        payload: { prompt: `Monitor subnet ${report.netuid} emissions and slippage.` },
      },
    ],
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorWalletIntelligenceCard(report: BittensorWalletIntelligenceReport): BittensorChatCard {
  return {
    kind: "intelligence_report",
    title: "Bittensor wallet intelligence",
    subtitle: shortSs58(report.ss58Address),
    summary: `Watch-only exposure across ${report.subnetCount} subnet(s) and ${report.validatorCount} validator hotkey(s).`,
    tone: report.staleDataRisk === "high" || report.concentrationRisk === "high" || report.slippageRisk === "high" ? "warning" : "default",
    items: [
      cardItem("Free TAO", report.freeTao === null ? "Unavailable" : `${formatMetric(report.freeTao)} TAO`),
      cardItem("Staked TAO", report.stakeTotalTao === null ? "Unavailable" : `${formatMetric(report.stakeTotalTao)} TAO`),
      cardItem("Largest position", report.largestPositionShare === null ? "Unknown" : `${Math.round(report.largestPositionShare * 100)}%`, riskTone(report.concentrationRisk)),
      cardItem("Concentration", report.concentrationRisk, riskTone(report.concentrationRisk)),
      cardItem("Slippage", report.slippageRisk, riskTone(report.slippageRisk)),
      cardItem("Freshness", report.freshness ?? "Unavailable", riskTone(report.staleDataRisk)),
      cardItem("Source", report.source, report.source.includes("fallback") ? "warning" : "muted"),
      cardItem("Block", report.block ?? "Unavailable", report.block === null ? "muted" : "default"),
    ],
    actions: [
      {
        label: "Show stake positions",
        kind: "send_to_chat",
        payload: { prompt: "Where am I staked?" },
      },
      {
        label: "Create watches",
        kind: "send_to_chat",
        payload: { prompt: "Create watches for my riskiest Bittensor positions." },
      },
    ],
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorQuoteCard(quote: BittensorActionQuote): BittensorChatCard {
  return {
    kind: "staking_quote",
    title: `${titleCase(quote.action)} quote`,
    subtitle: quote.netuid === null ? "Bittensor action" : `Subnet ${quote.netuid}`,
    summary: "Quote only. Nothing can move until the user reviews and signs externally.",
    tone: quote.warnings.length ? "warning" : "default",
    items: [
      cardItem("Amount", quote.amountTao === null ? "Unavailable" : `${formatMetric(quote.amountTao)} TAO`),
      cardItem("Price", quote.priceTao === null || quote.priceTao === undefined ? "Unavailable" : `${formatMetric(quote.priceTao)} TAO`),
      cardItem("Ideal alpha", formatMetric(quote.idealAlpha)),
      cardItem("Expected alpha", formatMetric(quote.expectedAlpha)),
      cardItem("Estimated fee", quote.feeTao === null ? "Unavailable" : `${formatMetric(quote.feeTao, " TAO", 6)}`),
      cardItem("Slippage", formatPercentFromBps(quote.slippageBps), quote.slippageBps && quote.slippageBps > 100 ? "warning" : "default"),
      cardItem("Source", quote.source ?? "provider", quote.source?.includes("mock") ? "warning" : "muted"),
    ],
    actions: [{
      label: "Review in chat",
      kind: "send_to_chat",
      payload: { prompt: `Review this Bittensor ${quote.action} quote before external signing.` },
    }],
    warnings: quote.warnings,
    data: { quote },
  };
}

export function buildBittensorExtrinsicPreviewCard(preview: BittensorExtrinsicPreview): BittensorChatCard {
  return {
    kind: "signed_action_review",
    title: `${titleCase(preview.action)} review`,
    subtitle: preview.netuid === null ? preview.network : `Subnet ${preview.netuid} · ${preview.network}`,
    summary: preview.consequenceSummary,
    tone: preview.warnings.length ? "warning" : "default",
    items: [
      cardItem("Coldkey", shortSs58(preview.coldkey)),
      cardItem("Hotkey", shortSs58(preview.hotkey)),
      cardItem("Amount", preview.amountTao === null ? "Unavailable" : `${formatMetric(preview.amountTao)} TAO`),
      cardItem("Signer", preview.signer.message, preview.signer.canSign ? "good" : "warning"),
      cardItem("Slippage", formatPercentFromBps(preview.slippageBps), preview.slippageBps && preview.slippageBps > 100 ? "warning" : "default"),
    ],
    actions: [{
      label: "Sign externally",
      kind: "sign_externally",
      payload: preview.unsignedPayload,
    }],
    warnings: preview.warnings,
    data: { preview },
  };
}

export function buildBittensorSigningHandoffCard(handoff: BittensorSigningHandoff): BittensorChatCard {
  return {
    kind: "signing_handoff",
    title: "External signing handoff",
    subtitle: `${titleCase(handoff.action)} · ${handoff.network}`,
    summary: handoff.consequenceSummary,
    tone: handoff.warnings.length ? "warning" : "default",
    items: [
      cardItem("Payload SHA-256", handoff.payloadSha256.slice(0, 20), "muted"),
      cardItem("Filename", handoff.suggestedFilename),
      cardItem("Expires", handoff.expiresAt, "muted"),
      cardItem("Signer mode", titleCase(handoff.signerMode)),
    ],
    actions: [
      {
        label: "Copy payload",
        kind: "copy_payload",
        payload: {
          filename: handoff.suggestedFilename,
          payload: handoff.payload,
          payloadSha256: handoff.payloadSha256,
        },
      },
      {
        label: "Sign externally",
        kind: "sign_externally",
        payload: handoff.payload,
      },
    ],
    warnings: handoff.warnings,
    data: { handoff },
  };
}

export function buildBittensorSignerCard(signer: BittensorSignerStatus): BittensorChatCard {
  return {
    kind: "signer_status",
    title: "Bittensor signer status",
    subtitle: titleCase(signer.mode),
    summary: signer.message,
    tone: signer.canSubmit || signer.canSign ? "default" : "warning",
    items: [
      cardItem("Network", signer.network),
      cardItem("Can sign", signer.canSign ? "Yes" : "No", signer.canSign ? "good" : "warning"),
      cardItem("Can submit", signer.canSubmit ? "Yes" : "No", signer.canSubmit ? "good" : "warning"),
      cardItem("Address", shortSs58(signer.address)),
    ],
    warnings: signer.canSign ? [] : ["Matterhorn does not hold signing authority. Use an external Bittensor-compatible signer."],
    data: { signer },
  };
}

export function buildBittensorSidecarHealthCard(health: BittensorSubtensorSidecarHealth): BittensorChatCard {
  return {
    kind: "signer_status",
    title: "Subtensor sidecar health",
    subtitle: titleCase(health.status),
    summary: health.message,
    tone: health.status === "healthy" ? "good" : "warning",
    items: [
      cardItem("Network", health.network),
      cardItem("Configured", health.configured ? "Yes" : "No", health.configured ? "good" : "warning"),
      cardItem("Reachable", health.reachable ? "Yes" : "No", health.reachable ? "good" : "warning"),
      cardItem("Latency", health.latencyMs === null ? "Unavailable" : `${health.latencyMs} ms`, health.latencyMs === null ? "muted" : "default"),
    ],
    warnings: health.status === "healthy" ? [] : [health.message],
    data: { health },
  };
}

export function buildBittensorSignedResultCard(result: BittensorSignedResult): BittensorChatCard {
  const submitted = result.status === "submitted";
  const invalid = result.status === "invalid_signature" || result.status === "rejected";
  return {
    kind: "signed_action_review",
    title: submitted ? "Bittensor action submitted" : "Bittensor action not submitted",
    subtitle: titleCase(result.status),
    summary: result.message,
    tone: submitted ? "good" : invalid ? "danger" : "warning",
    items: [
      cardItem("Status", titleCase(result.status), submitted ? "good" : invalid ? "danger" : "warning"),
      cardItem("Transaction", result.txHash ?? "Unavailable", result.txHash ? "default" : "muted"),
      cardItem("Block", result.blockHash ?? "Unavailable", result.blockHash ? "default" : "muted"),
      cardItem("Explorer", result.explorerUrl ?? "Unavailable", result.explorerUrl ? "default" : "muted"),
    ],
    actions: result.explorerUrl ? [{
      label: "Open explorer",
      kind: "open_url",
      href: result.explorerUrl,
    }] : [],
    warnings: submitted ? [] : [result.message],
    data: { result },
  };
}

export function buildBittensorInvocationCard(invocation: BittensorSubnetInvocation): BittensorChatCard {
  return {
    kind: invocation.supported ? "subnet_result" : "unsupported_adapter",
    title: invocation.supported ? `Subnet ${invocation.netuid} result` : `Subnet ${invocation.netuid} adapter unavailable`,
    subtitle: `${titleCase(invocation.intent)} · ${titleCase(invocation.adapter)}`,
    summary: invocation.message,
    tone: invocation.supported ? "default" : "warning",
    items: [
      cardItem("Netuid", invocation.netuid),
      cardItem("Intent", titleCase(invocation.intent)),
      cardItem("Adapter", titleCase(invocation.adapter)),
      cardItem("Supported", invocation.supported ? "Yes" : "No", invocation.supported ? "good" : "warning"),
    ],
    warnings: invocation.warnings,
    data: { invocation },
  };
}

export function buildBittensorValidatorComparisonCards(comparison: BittensorValidatorComparison): BittensorChatCard[] {
  if (!comparison.candidates.length) {
    return [{
      kind: "validator_selection",
      title: "Validator comparison",
      subtitle: `Subnet ${comparison.netuid} · ${titleCase(comparison.strategy)}`,
      summary: "No validator candidates were available from the current provider sample.",
      tone: "warning",
      items: [
        cardItem("Subnet", comparison.subnetName),
        cardItem("Candidates", 0, "warning"),
        cardItem("Source", comparison.source, comparison.source === "curated-fallback" ? "warning" : "muted"),
      ],
      warnings: comparison.warnings,
      data: { comparison },
    }];
  }

  return comparison.candidates.slice(0, 6).map((candidate, index) => ({
    kind: "validator_selection",
    title: `Validator candidate ${index + 1}`,
    subtitle: `${comparison.subnetName} · Score ${candidate.score}/100`,
    summary: candidate.reasons.join(" "),
    tone: candidate.score >= 70 ? "good" : candidate.score >= 40 ? "default" : "warning",
    items: [
      cardItem("UID", candidate.uid ?? "Unavailable", candidate.uid === null ? "muted" : "default"),
      cardItem("Hotkey", shortSs58(candidate.hotkey)),
      cardItem("Stake", formatMetric(candidate.stake)),
      cardItem("Trust", formatMetric(candidate.trust, "", 4)),
      cardItem("Dividends", formatMetric(candidate.dividends, "", 4)),
      cardItem("Source", candidate.source, candidate.source === "curated-fallback" ? "warning" : "muted"),
    ],
    actions: candidate.hotkey ? [{
      label: "Plan stake",
      kind: "send_to_chat",
      payload: {
        prompt: `Prepare a safe Bittensor staking plan for subnet ${candidate.netuid} using validator hotkey ${candidate.hotkey}.`,
      },
    }] : [],
    warnings: [...comparison.warnings, ...candidate.warnings],
    data: { candidate, comparison },
  }));
}

export function buildBittensorReadinessCard(report: BittensorReadinessReport): BittensorChatCard {
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const warning = report.checks.filter((check) => check.status === "warning").length;
  const failed = report.checks.filter((check) => check.status === "fail").length;
  return {
    kind: "readiness_report",
    title: "Bittensor readiness audit",
    subtitle: titleCase(report.status),
    summary: failed
      ? "Bittensor needs fixes before expanding into more execution surfaces."
      : warning
        ? "Bittensor chat is functional, with provider/runtime warnings to resolve before calling it perfect."
        : "Bittensor chat workflows passed the readiness gate.",
    tone: report.status === "pass" ? "good" : report.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Passed", passed, "good"),
      cardItem("Warnings", warning, warning ? "warning" : "muted"),
      cardItem("Failed", failed, failed ? "danger" : "muted"),
      cardItem("Checked", report.checkedAt, "muted"),
    ],
    warnings: [...report.blockers, ...report.warnings],
    data: { report },
  };
}

export function buildBittensorWatchCards(watches: BittensorWatch[]): BittensorChatCard[] {
  if (!watches.length) {
    return [{
      kind: "watchlist",
      title: "Bittensor watchlist",
      summary: "No Bittensor watches are configured yet.",
      tone: "default",
      items: [cardItem("Watches", 0, "muted")],
      data: { watches },
    }];
  }
  return watches.slice(0, 6).map((watch) => ({
    kind: "watchlist",
    title: watch.label,
    subtitle: titleCase(watch.kind),
    summary: watch.netuid === null ? "Wallet or validator watch." : `Watching subnet ${watch.netuid}.`,
    tone: "default",
    items: [
      cardItem("Kind", titleCase(watch.kind)),
      cardItem("Netuid", watch.netuid ?? "Any", watch.netuid === null ? "muted" : "default"),
      cardItem("Wallet", watch.ss58Address ? shortSs58(watch.ss58Address) : "Not scoped", "muted"),
      cardItem("Threshold", watch.threshold ?? "Not set", watch.threshold === null ? "muted" : "default"),
    ],
    data: { watch },
  }));
}

export function buildBittensorWatchEvaluationCards(evaluations: BittensorWatchEvaluation[]): BittensorChatCard[] {
  if (!evaluations.length) {
    return [{
      kind: "watchlist",
      title: "Bittensor watch check",
      summary: "No Bittensor watches are configured yet.",
      tone: "default",
      items: [cardItem("Watches checked", 0, "muted")],
      data: { evaluations },
    }];
  }
  return evaluations.slice(0, 8).map((evaluation) => ({
    kind: "watchlist",
    title: evaluation.watch.label,
    subtitle: `${titleCase(evaluation.watch.kind)} · ${titleCase(evaluation.status)}`,
    summary: evaluation.summary,
    tone: evaluation.status === "ok" ? "good" : evaluation.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Status", titleCase(evaluation.status), evaluation.status === "ok" ? "good" : evaluation.status === "warning" ? "warning" : "danger"),
      cardItem("Observed", evaluation.observedValue ?? "Unavailable", evaluation.observedValue === null ? "muted" : "default"),
      cardItem("Threshold", evaluation.threshold ?? "Not set", evaluation.threshold === null ? "muted" : "default"),
      cardItem("Source", evaluation.source, evaluation.source === "curated-fallback" ? "warning" : "muted"),
    ],
    warnings: evaluation.status === "ok" ? [] : [evaluation.summary],
    data: { evaluation },
  }));
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
    validatorHotkey: firstString(record, ["hotkey", "validatorHotkey", "validator_hotkey", "delegateHotkey", "delegate_hotkey"]),
    alphaAmount,
    taoValue,
    slippageRisk,
  };
}

function normalizeSidecarWalletSnapshot(
  raw: Record<string, unknown>,
  ss58Address: string,
  subnets: BittensorSubnetSummary[],
): BittensorWalletSnapshot | null {
  const source = asRecord(raw.data ?? raw.wallet ?? raw);
  const positionsSource =
    source.stakePositions ??
    source.stakes ??
    source.delegations ??
    source.positions ??
    source.allocations ??
    [];
  const stakePositions = arrayFrom(positionsSource)
    .map((row) => normalizeStakePosition(row, subnets))
    .filter(Boolean) as BittensorStakePosition[];
  const taoBalance = firstNumber(source, ["taoBalance", "tao_balance", "freeBalance", "free_balance", "balance", "free"]);
  const estimatedValueTao =
    firstNumber(source, ["estimatedValueTao", "estimated_value_tao", "totalValueTao", "total_value_tao"]) ??
    ((taoBalance ?? 0) + stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0));

  if (taoBalance === null && !stakePositions.length && !("data" in raw) && !("wallet" in raw)) {
    return null;
  }

  return {
    ss58Address,
    taoBalance,
    stakePositions,
    estimatedValueTao,
    providerStatus: "ok",
    updatedAt: firstString(source, ["updatedAt", "updated_at", "timestamp"]) ?? nowIso(),
    message: `Loaded from configured Subtensor sidecar${firstString(source, ["source"]) ? ` (${firstString(source, ["source"])})` : ""}.`,
    source: firstString(source, ["source", "provider", "dataSource", "data_source"]) ?? "subtensor-sidecar",
    block: firstNumber(source, ["block", "blockNumber", "block_number"]),
    freshness: firstString(source, ["freshness", "dataFreshness", "data_freshness"]),
    warnings: arrayFrom(source["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0),
  };
}

export class TaoAppBittensorProvider implements BittensorProvider {
  async listSubnets(): Promise<BittensorSubnetSummary[]> {
    return cached(`bittensor:subnets:${sidecarBaseUrl() || "tao-app"}`, async () => {
      const sidecar = subtensorSidecarClient();
      if (sidecar) {
        const data = await sidecar.listSubnets();
        const normalized = arrayFrom(data?.["subnets"] ?? data)
          .map((row) => normalizeSubnet(row, firstString(asRecord(row), ["source"]) ?? "subtensor-sidecar"))
          .filter(Boolean) as BittensorSubnetSummary[];
        if (normalized.length) return normalized.sort((a, b) => a.netuid - b.netuid);
        if (data) return FALLBACK_SUBNETS;
      }

      try {
        const data = await taoAppClient().get("/api/beta/analytics/subnets/info");
        const normalized = arrayFrom(data).map((row) => normalizeSubnet(row, "tao.app")).filter(Boolean) as BittensorSubnetSummary[];
        return normalized.length ? normalized.sort((a, b) => a.netuid - b.netuid) : FALLBACK_SUBNETS;
      } catch {
        return FALLBACK_SUBNETS;
      }
    });
  }

  async getSubnet(netuid: number): Promise<BittensorSubnetDetail> {
    return cached(`bittensor:subnet:${sidecarBaseUrl() || "tao-app"}:${netuid}`, async () => {
      const subnets = await this.listSubnets();
      let summary = subnets.find((item) => item.netuid === netuid) ?? fallbackSubnet(netuid);
      let metagraphRaw: unknown = null;
      const sidecar = subtensorSidecarClient();

      if (sidecar) {
        const dynamicRaw = await sidecar.getSubnetDynamic(netuid);
        const dynamicSummary = dynamicRaw ? normalizeSubnet(dynamicRaw, firstString(dynamicRaw, ["source"]) ?? "subtensor-sidecar") : null;
        if (dynamicSummary) summary = dynamicSummary;
      }

      if (!sidecar && !summary.source.includes("sidecar") && !summary.source.includes("bittensor-python-sdk")) {
        try {
          const data = await taoAppClient().get(`/api/beta/analytics/subnets/info/${netuid}`);
          summary = normalizeSubnet(data, "tao.app") ?? summary;
        } catch {
          // Keep list/fallback summary.
        }
      }

      if (sidecar) {
        metagraphRaw = await sidecar.getSubnetMetagraph(netuid);
      }

      if (!sidecar && !metagraphRaw) {
        try {
          metagraphRaw = await taoAppClient().get(`/api/beta/analytics/subnets/metagraph/${netuid}`);
        } catch {
          metagraphRaw = null;
        }
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

    const sidecar = subtensorSidecarClient();
    if (sidecar) {
      const [sidecarWallet, subnets] = await Promise.all([
        sidecar.getWallet(ss58Address),
        this.listSubnets(),
      ]);
      if (sidecarWallet) {
        const wallet = normalizeSidecarWalletSnapshot(sidecarWallet, ss58Address, subnets);
        if (wallet) return wallet;
      }
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
    const local = buildBittensorQuote(input, subnet);
    const sidecar = subtensorSidecarClient();
    if (!sidecar) return local;
    const sidecarQuote = await sidecar.quoteAction(input);
    if (!sidecarQuote) return local;
    const sidecarWarnings = arrayFrom(sidecarQuote["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return {
      ...local,
      priceTao: firstNumber(sidecarQuote, ["priceTao", "price_tao", "price"]) ?? local.priceTao,
      idealAlpha: firstNumber(sidecarQuote, ["idealAlpha", "ideal_alpha"]) ?? local.idealAlpha,
      expectedAlpha: firstNumber(sidecarQuote, ["expectedAlpha", "expected_alpha", "alphaOut", "alpha_out"]) ?? local.expectedAlpha,
      feeTao: firstNumber(sidecarQuote, ["feeTao", "fee_tao", "partialFeeTao", "partial_fee_tao"]) ?? local.feeTao,
      slippageBps: firstNumber(sidecarQuote, ["slippageBps", "slippage_bps", "priceImpactBps", "price_impact_bps"]) ?? local.slippageBps,
      rateTolerance: firstNumber(sidecarQuote, ["rateTolerance", "rate_tolerance"]) ?? local.rateTolerance,
      source: firstString(sidecarQuote, ["source", "provider", "dataSource", "data_source"]) ?? local.source,
      block: firstNumber(sidecarQuote, ["block", "blockNumber", "block_number"]) ?? local.block,
      freshness: firstString(sidecarQuote, ["freshness", "dataFreshness", "data_freshness"]) ?? local.freshness,
      warnings: [...local.warnings, "Quote enriched by configured Subtensor sidecar.", ...sidecarWarnings],
    };
  }
}

export const bittensorProvider: BittensorProvider = new TaoAppBittensorProvider();
