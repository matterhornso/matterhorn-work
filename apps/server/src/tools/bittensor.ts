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

type CacheEntry<T> = { at: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();

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

