import { randomUUID } from "node:crypto";

import { encode } from "@msgpack/msgpack";
import {
  bytesToHex,
  keccak256,
  parseSignature,
  recoverTypedDataAddress,
  type Hex,
} from "viem";

export type HyperliquidExecutionNetwork = "testnet" | "mainnet";
export type HyperliquidExecutionSide = "buy" | "sell";
export type HyperliquidExecutionOrderType = "market" | "limit";

const HYPERLIQUID_ENDPOINTS = {
  testnet: {
    info: "https://api.hyperliquid-testnet.xyz/info",
    exchange: "https://api.hyperliquid-testnet.xyz/exchange",
    source: "b",
  },
  mainnet: {
    info: "https://api.hyperliquid.xyz/info",
    exchange: "https://api.hyperliquid.xyz/exchange",
    source: "a",
  },
} as const;

const AGENT_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

const AGENT_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SIGNATURE_RE = /^0x[a-fA-F0-9]{130}$/;
const DEFAULT_INTENT_TTL_MS = 90_000;
const DEFAULT_MAX_ORDER_NOTIONAL_USDC = 1_000;
const MAX_SLIPPAGE_BPS = 500;

type Fetcher = typeof fetch;

interface HyperliquidMarketMeta {
  asset: string;
  index: number;
  markPx: number;
  szDecimals: number;
}

interface HyperliquidOrderWire {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: "Gtc" | "Ioc" } };
}

interface HyperliquidOrderAction {
  type: "order";
  orders: HyperliquidOrderWire[];
  grouping: "na";
}

export interface CreateHyperliquidExecutionIntentInput {
  network: HyperliquidExecutionNetwork;
  signerAddress: string;
  asset: string;
  side: HyperliquidExecutionSide;
  size: number;
  orderType: HyperliquidExecutionOrderType;
  limitPrice?: number | null;
  slippageBps?: number | null;
  reduceOnly?: boolean;
}

export interface HyperliquidExecutionIntent {
  version: "matterhorn.hyperliquid.execution-intent.v1";
  intentId: string;
  network: HyperliquidExecutionNetwork;
  signerAddress: `0x${string}`;
  asset: string;
  side: HyperliquidExecutionSide;
  size: number;
  orderType: HyperliquidExecutionOrderType;
  orderPrice: number;
  estimatedNotionalUsdc: number;
  slippageBps: number;
  reduceOnly: boolean;
  nonce: number;
  expiresAt: string;
  typedData: {
    domain: typeof AGENT_DOMAIN;
    types: typeof AGENT_TYPES;
    primaryType: "Agent";
    message: { source: "a" | "b"; connectionId: Hex };
  };
  confirmation: {
    required: boolean;
    phrase: "SUBMIT LIVE ORDER" | null;
  };
  safety: {
    nonCustodial: true;
    walletSignsExactIntent: true;
    oneTimeSubmission: true;
    maxOrderNotionalUsdc: number;
    privateKeysAccepted: false;
    apiSecretsAccepted: false;
  };
}

export interface SubmitHyperliquidExecutionInput {
  intentId: string;
  signerAddress: string;
  signature: string;
  liveConfirmation?: string | null;
}

export interface HyperliquidExecutionReceipt {
  version: "matterhorn.hyperliquid.execution-receipt.v1";
  intentId: string;
  network: HyperliquidExecutionNetwork;
  signerAddress: string;
  asset: string;
  side: HyperliquidExecutionSide;
  size: number;
  status: "submitted" | "rejected" | "uncertain";
  submittedAt: string;
  venueResponse: unknown;
  signatureStored: false;
}

interface StoredIntent {
  publicIntent: HyperliquidExecutionIntent;
  action: HyperliquidOrderAction;
  state: "ready" | "submitting" | "complete";
  receipt: HyperliquidExecutionReceipt | null;
}

function finitePositive(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number.`);
  return parsed;
}

function normalizeAsset(value: string): string {
  const asset = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,31}$/.test(asset)) throw new Error("Choose a valid Hyperliquid asset.");
  return asset;
}

function normalizeNumberString(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function roundSizeDown(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor + Number.EPSILON) / factor;
}

function formatHyperliquidPrice(value: number, szDecimals: number): string {
  const fiveSignificantFigures = Number(value.toPrecision(5));
  const maxDecimals = Math.max(0, 6 - szDecimals);
  return normalizeNumberString(Number(fiveSignificantFigures.toFixed(maxDecimals)), maxDecimals);
}

function normalizeForActionHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForActionHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, normalizeForActionHash(child)]));
  }
  if (typeof value === "string" && /^-?\d+\.\d+$/.test(value)) return value.replace(/\.?0+$/, "");
  return value;
}

export function hashHyperliquidAction(
  action: unknown,
  nonce: number,
  vaultAddress: string | null = null,
  expiresAfter: number | null = null,
): Hex {
  const packed = encode(normalizeForActionHash(action));
  const vaultLength = vaultAddress === null ? 1 : 21;
  const expiryLength = expiresAfter === null ? 0 : 9;
  const suffixLength = 8 + vaultLength + expiryLength;
  const data = new Uint8Array(packed.length + suffixLength);
  data.set(packed);
  const view = new DataView(data.buffer);
  view.setBigUint64(packed.length, BigInt(nonce), false);
  let offset = packed.length + 8;
  if (vaultAddress === null) {
    view.setUint8(offset, 0);
    offset += 1;
  } else {
    if (!ADDRESS_RE.test(vaultAddress)) throw new Error("vaultAddress must be a valid address.");
    view.setUint8(offset, 1);
    offset += 1;
    const bytes = Uint8Array.from(vaultAddress.slice(2).match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    data.set(bytes, offset);
    offset += bytes.length;
  }
  if (expiresAfter !== null) {
    if (!Number.isSafeInteger(expiresAfter) || expiresAfter <= 0) throw new Error("expiresAfter must be a positive millisecond timestamp.");
    view.setUint8(offset, 0);
    view.setBigUint64(offset + 1, BigInt(expiresAfter), false);
  }
  return keccak256(bytesToHex(data));
}

async function readMarketMeta(fetcher: Fetcher, network: HyperliquidExecutionNetwork, asset: string): Promise<HyperliquidMarketMeta> {
  const endpoint = HYPERLIQUID_ENDPOINTS[network].info;
  const [metaResponse, midsResponse] = await Promise.all([
    fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meta" }),
    }),
    fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    }),
  ]);
  if (!metaResponse.ok || !midsResponse.ok) throw new Error(`Hyperliquid ${network} market data is unavailable.`);
  const meta = await metaResponse.json() as { universe?: Array<{ name?: string; szDecimals?: number }> };
  const mids = await midsResponse.json() as Record<string, string>;
  const universe = Array.isArray(meta.universe) ? meta.universe : [];
  const index = universe.findIndex((row) => row?.name?.toUpperCase() === asset);
  if (index < 0) throw new Error(`${asset} is not available on Hyperliquid ${network}.`);
  const markPx = finitePositive(mids[asset], `${asset} mark price`);
  const szDecimals = Number(universe[index]?.szDecimals);
  if (!Number.isInteger(szDecimals) || szDecimals < 0 || szDecimals > 8) throw new Error(`${asset} size precision is unavailable.`);
  return { asset, index, markPx, szDecimals };
}

function maxOrderNotionalUsdc(): number {
  const configured = Number(process.env.MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_ORDER_NOTIONAL_USDC;
}

function venueAcceptedOrder(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (root.status !== "ok") return false;
  const response = root.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const data = (response as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const statuses = (data as Record<string, unknown>).statuses;
  return Array.isArray(statuses)
    && statuses.length > 0
    && statuses.every((status) => !(status && typeof status === "object" && !Array.isArray(status) && "error" in status));
}

export class HyperliquidExecutionIntentStore {
  private readonly intents = new Map<string, StoredIntent>();

  constructor(
    private readonly options: {
      fetcher?: Fetcher;
      now?: () => number;
      ttlMs?: number;
    } = {},
  ) {}

  async create(input: CreateHyperliquidExecutionIntentInput): Promise<HyperliquidExecutionIntent> {
    const fetcher = this.options.fetcher ?? globalThis.fetch;
    const now = this.options.now?.() ?? Date.now();
    const network = input.network;
    if (network !== "testnet" && network !== "mainnet") throw new Error("network must be testnet or mainnet.");
    if (!ADDRESS_RE.test(input.signerAddress)) throw new Error("Connect a valid EVM wallet before preparing an order.");
    if (input.side !== "buy" && input.side !== "sell") throw new Error("side must be buy or sell.");
    if (input.orderType !== "market" && input.orderType !== "limit") throw new Error("orderType must be market or limit.");

    const asset = normalizeAsset(input.asset);
    const requestedSize = finitePositive(input.size, "size");
    const slippageBps = input.slippageBps == null ? 100 : Math.trunc(Number(input.slippageBps));
    if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > MAX_SLIPPAGE_BPS) {
      throw new Error(`slippageBps must be between 1 and ${MAX_SLIPPAGE_BPS}.`);
    }

    const market = await readMarketMeta(fetcher, network, asset);
    const size = roundSizeDown(requestedSize, market.szDecimals);
    if (size <= 0) throw new Error(`Size is below ${asset}'s minimum precision.`);
    const requestedPrice = input.orderType === "limit" ? finitePositive(input.limitPrice, "limitPrice") : null;
    const marketBoundary = market.markPx * (input.side === "buy" ? 1 + slippageBps / 10_000 : 1 - slippageBps / 10_000);
    const priceWire = formatHyperliquidPrice(requestedPrice ?? marketBoundary, market.szDecimals);
    const orderPrice = Number(priceWire);
    const estimatedNotionalUsdc = Number((size * market.markPx).toFixed(2));
    const notionalLimit = maxOrderNotionalUsdc();
    if (estimatedNotionalUsdc > notionalLimit) {
      throw new Error(`Order notional ${estimatedNotionalUsdc.toFixed(2)} USDC exceeds the Matterhorn limit of ${notionalLimit.toFixed(2)} USDC.`);
    }

    const action: HyperliquidOrderAction = {
      type: "order",
      orders: [{
        a: market.index,
        b: input.side === "buy",
        p: priceWire,
        s: normalizeNumberString(size, market.szDecimals),
        r: input.reduceOnly === true,
        t: { limit: { tif: input.orderType === "market" ? "Ioc" : "Gtc" } },
      }],
      grouping: "na",
    };
    const nonce = now;
    const intentId = randomUUID();
    const expiresAtMs = now + (this.options.ttlMs ?? DEFAULT_INTENT_TTL_MS);
    const connectionId = hashHyperliquidAction(action, nonce, null, expiresAtMs);
    const typedData = {
      domain: AGENT_DOMAIN,
      types: AGENT_TYPES,
      primaryType: "Agent" as const,
      message: { source: HYPERLIQUID_ENDPOINTS[network].source, connectionId },
    };
    const publicIntent: HyperliquidExecutionIntent = {
      version: "matterhorn.hyperliquid.execution-intent.v1",
      intentId,
      network,
      signerAddress: input.signerAddress as `0x${string}`,
      asset,
      side: input.side,
      size,
      orderType: input.orderType,
      orderPrice,
      estimatedNotionalUsdc,
      slippageBps,
      reduceOnly: input.reduceOnly === true,
      nonce,
      expiresAt: new Date(expiresAtMs).toISOString(),
      typedData,
      confirmation: {
        required: network === "mainnet",
        phrase: network === "mainnet" ? "SUBMIT LIVE ORDER" : null,
      },
      safety: {
        nonCustodial: true,
        walletSignsExactIntent: true,
        oneTimeSubmission: true,
        maxOrderNotionalUsdc: notionalLimit,
        privateKeysAccepted: false,
        apiSecretsAccepted: false,
      },
    };
    this.prune(now);
    this.intents.set(intentId, { publicIntent, action, state: "ready", receipt: null });
    return publicIntent;
  }

  async submit(input: SubmitHyperliquidExecutionInput): Promise<HyperliquidExecutionReceipt> {
    const allowedKeys = new Set(["intentId", "signerAddress", "signature", "liveConfirmation"]);
    const extraKey = Object.keys(input as unknown as Record<string, unknown>).find((key) => !allowedKeys.has(key));
    if (extraKey) throw new Error(`Unexpected submission field: ${extraKey}. Submit only the intent id, public signer address, signature, and confirmation.`);
    const stored = this.intents.get(input.intentId);
    if (!stored) throw new Error("Execution intent was not found or has expired. Prepare the order again.");
    if (stored.state === "complete" && stored.receipt) return stored.receipt;
    if (stored.state !== "ready") throw new Error("This execution intent is already being submitted.");
    const intent = stored.publicIntent;
    const now = this.options.now?.() ?? Date.now();
    if (Date.parse(intent.expiresAt) <= now) {
      this.intents.delete(intent.intentId);
      throw new Error("Execution intent expired. Review current market data and prepare the order again.");
    }
    if (!ADDRESS_RE.test(input.signerAddress) || input.signerAddress.toLowerCase() !== intent.signerAddress.toLowerCase()) {
      throw new Error("The submitting wallet does not match the wallet that reviewed this intent.");
    }
    if (!SIGNATURE_RE.test(input.signature)) throw new Error("A valid wallet signature is required.");
    if (intent.network === "mainnet" && input.liveConfirmation !== "SUBMIT LIVE ORDER") {
      throw new Error("Type SUBMIT LIVE ORDER to confirm mainnet execution.");
    }

    const recovered = await recoverTypedDataAddress({
      ...intent.typedData,
      signature: input.signature as Hex,
    });
    if (recovered.toLowerCase() !== intent.signerAddress.toLowerCase()) {
      throw new Error("Wallet signature does not authorize this exact order intent.");
    }

    const parsed = parseSignature(input.signature as Hex);
    const v = parsed.v !== undefined ? Number(parsed.v) : (parsed.yParity ?? 0) + 27;
    const requestBody = {
      action: stored.action,
      nonce: intent.nonce,
      signature: { r: parsed.r, s: parsed.s, v },
      vaultAddress: null,
      expiresAfter: Date.parse(intent.expiresAt),
    };
    stored.state = "submitting";
    const submittedAt = new Date(now).toISOString();
    let venueResponse: unknown = null;
    let status: HyperliquidExecutionReceipt["status"] = "uncertain";
    try {
      const response = await (this.options.fetcher ?? globalThis.fetch)(HYPERLIQUID_ENDPOINTS[intent.network].exchange, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const text = await response.text();
      try {
        venueResponse = text ? JSON.parse(text) : null;
      } catch {
        venueResponse = { status: response.status, message: text.slice(0, 240) };
      }
      status = response.ok && venueAcceptedOrder(venueResponse) ? "submitted" : "rejected";
    } catch (error) {
      venueResponse = { message: error instanceof Error ? error.message : "Hyperliquid submission status is unknown." };
      status = "uncertain";
    }
    const receipt: HyperliquidExecutionReceipt = {
      version: "matterhorn.hyperliquid.execution-receipt.v1",
      intentId: intent.intentId,
      network: intent.network,
      signerAddress: intent.signerAddress,
      asset: intent.asset,
      side: intent.side,
      size: intent.size,
      status,
      submittedAt,
      venueResponse,
      signatureStored: false,
    };
    stored.state = "complete";
    stored.receipt = receipt;
    return receipt;
  }

  private prune(now: number): void {
    for (const [id, intent] of this.intents) {
      if (Date.parse(intent.publicIntent.expiresAt) <= now && intent.state !== "submitting") this.intents.delete(id);
    }
  }
}

export const hyperliquidExecutionIntentStore = new HyperliquidExecutionIntentStore();
