import { isValidStructTag, normalizeStructTag } from "@mysten/sui/utils";

import type { MatterhornCryptoAppTransportExecutor } from "./crypto-app-adapter-router.js";
import {
  createPinnedJsonRequester,
  type MatterhornPinnedJsonRequester,
  type MatterhornPinnedJsonResponse,
} from "./crypto-app-https-transport.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import {
  isValidHyperliquidAddress,
} from "./tools/hyperliquid.js";
import {
  normalizeMatterhornSuiAddress,
  SUI_NATIVE_COIN_TYPE,
} from "./tools/sui.js";

type JsonObject = Record<string, unknown>;

type FirstPartyExecutorOptions = {
  requestJson?: MatterhornPinnedJsonRequester;
  now?: () => Date;
  estimateCostMicros?: (input: {
    appId: string;
    actionId: string;
    requestBytes: number;
    responseBytes: number;
  }) => number;
};

type RequestContext = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  requestJson: MatterhornPinnedJsonRequester;
  requestBytes: number;
  responseBytes: number;
  connectedAddress: string | null;
};

const HYPERLIQUID_APP_ID = "matterhorn.hyperliquid-testnet";
const SUI_APP_ID = "matterhorn.sui-testnet";
const HYPERLIQUID_NETWORK = "hyperliquid:testnet";
const SUI_NETWORK = "sui:testnet";
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SIGNED_DECIMAL_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimal(value: unknown, field: string, allowZero = true): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : nonEmptyString(value);
  if (!text || !DECIMAL_RE.test(text) || (!allowZero && Number(text) <= 0)) {
    throw new Error(`first_party_${field}_invalid`);
  }
  return text;
}

function signedDecimal(value: unknown, field: string): string {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : nonEmptyString(value);
  if (!text || !SIGNED_DECIMAL_RE.test(text)) throw new Error(`first_party_${field}_invalid`);
  return text;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error("first_party_limit_invalid");
  }
  return Number(value);
}

function boundedAsset(value: unknown): string {
  const asset = nonEmptyString(value)?.toUpperCase() ?? "";
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(asset)) throw new Error("first_party_asset_invalid");
  return asset;
}

function safeCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("first_party_cost_invalid");
  return value;
}

function newestAddress(context: RequestContext, response: MatterhornPinnedJsonResponse): void {
  context.requestBytes += response.requestBytes;
  context.responseBytes += response.responseBytes;
  context.connectedAddress = response.connectedAddress;
}

async function postJson(context: RequestContext, body: unknown): Promise<unknown> {
  const response = await context.requestJson({
    endpoint: context.endpoint,
    approvedAddresses: context.approvedAddresses,
    signal: context.signal,
    body,
  });
  newestAddress(context, response);
  return response.value;
}

async function suiRpc(
  context: RequestContext,
  id: number,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const value = await postJson(context, { jsonrpc: "2.0", id, method, params });
  const envelope = record(value);
  if (!envelope || envelope.jsonrpc !== "2.0" || envelope.id !== id || "error" in envelope || !("result" in envelope)) {
    throw new Error("first_party_sui_rpc_invalid");
  }
  return envelope.result;
}

async function hyperliquidInfo(context: RequestContext, body: JsonObject): Promise<unknown> {
  return postJson(context, body);
}

function hyperliquidUniverse(value: unknown): {
  universe: unknown[];
  contexts: unknown[];
} {
  if (!Array.isArray(value) || value.length < 2) throw new Error("first_party_hyperliquid_meta_invalid");
  const meta = record(value[0]);
  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(value[1])) {
    throw new Error("first_party_hyperliquid_meta_invalid");
  }
  return { universe: meta.universe, contexts: value[1] };
}

function marketEntry(universe: unknown[], contexts: unknown[], index: number) {
  const definition = record(universe[index]);
  const context = record(contexts[index]);
  const asset = boundedAsset(definition?.name);
  const markPrice = decimal(context?.markPx ?? "0", "hyperliquid_mark_price");
  const fundingRate = signedDecimal(context?.funding ?? "0", "hyperliquid_funding");
  const openInterest = decimal(context?.openInterest ?? "0", "hyperliquid_open_interest");
  return {
    asset,
    markPrice,
    fundingRate,
    openInterest,
    szDecimals: Number.isInteger(definition?.szDecimals) ? Number(definition?.szDecimals) : null,
    maxLeverage: finiteNumber(definition?.maxLeverage),
  };
}

function hyperliquidLevels(value: unknown): Array<{ price: string; size: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    const level = record(entry);
    try {
      return [{
        price: decimal(level?.px, "hyperliquid_book_price", false),
        size: decimal(level?.sz, "hyperliquid_book_size"),
      }];
    } catch {
      return [];
    }
  });
}

function accountSummary(value: unknown, address: string) {
  const state = record(value);
  if (!state) throw new Error("first_party_hyperliquid_account_invalid");
  const margin = record(state.marginSummary) ?? record(state.crossMarginSummary) ?? {};
  const accountValueUsd = decimal(margin.accountValue ?? margin.totalRawUsd ?? "0", "hyperliquid_account_value");
  const marginUsedUsd = decimal(margin.totalMarginUsed ?? margin.marginUsed ?? "0", "hyperliquid_margin_used");
  const positions = Array.isArray(state.assetPositions) ? state.assetPositions.slice(0, 100).flatMap((entry) => {
    const position = record(record(entry)?.position);
    const signedSize = finiteNumber(position?.szi);
    if (!position || signedSize === null || signedSize === 0) return [];
    const leverage = record(position.leverage);
    return [{
      asset: boundedAsset(position.coin),
      side: signedSize > 0 ? "long" as const : "short" as const,
      size: decimal(String(Math.abs(signedSize)), "hyperliquid_position_size", false),
      entryPrice: decimal(position.entryPx ?? "0", "hyperliquid_entry_price"),
      unrealizedPnlUsd: signedDecimal(position.unrealizedPnl ?? "0", "hyperliquid_unrealized_pnl"),
      leverage: decimal(leverage?.value ?? "0", "hyperliquid_leverage"),
    }];
  }) : [];
  return { address, accountValueUsd, marginUsedUsd, positions };
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? value.split(".")[1]!.length : 0;
}

function normalizedHyperliquidLimitPrice(value: string, sizeDecimals: number): string {
  const price = decimal(value, "hyperliquid_limit_price", false);
  const numeric = finiteNumber(price);
  if (!numeric || numeric <= 0) throw new Error("first_party_hyperliquid_limit_price_invalid");
  const canonical = price.includes(".") ? price.replace(/0+$/, "").replace(/\.$/, "") : price;
  const maximumDecimals = Math.max(0, 6 - sizeDecimals);
  if (decimalPlaces(canonical) > maximumDecimals) {
    throw new Error("first_party_hyperliquid_price_precision_invalid");
  }
  // Hyperliquid permits integer prices regardless of significant figures. A
  // non-integer perp price is limited to five significant figures.
  if (canonical.includes(".")) {
    const significant = canonical.replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length;
    if (significant > 5) throw new Error("first_party_hyperliquid_price_precision_invalid");
  }
  return canonical;
}

function protectiveHyperliquidPrice(
  value: number,
  side: "buy" | "sell",
  sizeDecimals: number,
): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error("first_party_hyperliquid_price_invalid");
  const integerDigits = Math.max(1, Math.floor(Math.log10(value)) + 1);
  const decimals = Math.max(0, Math.min(6 - sizeDecimals, 5 - integerDigits));
  const scale = 10 ** decimals;
  const scaled = value * scale;
  const rounded = side === "buy"
    ? Math.ceil(scaled - Number.EPSILON * Math.abs(scaled)) / scale
    : Math.floor(scaled + Number.EPSILON * Math.abs(scaled)) / scale;
  return normalizedHyperliquidLimitPrice(rounded.toFixed(decimals), sizeDecimals);
}

async function executeSui(
  context: RequestContext,
  actionId: string,
  network: string,
  args: JsonObject,
  observedAt: string,
): Promise<{ data: unknown; source: string; observedAt: string; blockOrVersion: string }> {
  if (network !== SUI_NETWORK) throw new Error("first_party_sui_network_invalid");
  if (actionId === "sui_transfer_preview") {
    // A Sui transfer needs exact object/gas selection plus dry-run. The current
    // Sui SDK path is gRPC-based and cannot yet share this IPv4-pinned socket.
    // Fail closed instead of returning a local preview that looks simulated.
    throw new Error("first_party_sui_pinned_simulation_unavailable");
  }
  if (actionId !== "sui_account_read") throw new Error("first_party_sui_action_invalid");
  const address = normalizeMatterhornSuiAddress(nonEmptyString(args.address) ?? "");
  const requestedCoinType = nonEmptyString(args.coinType) ?? SUI_NATIVE_COIN_TYPE;
  if (!isValidStructTag(requestedCoinType)) throw new Error("first_party_sui_coin_type_invalid");
  const coinType = normalizeStructTag(requestedCoinType);
  const balance = record(await suiRpc(context, 1, "suix_getBalance", [address, coinType]));
  if (!balance) throw new Error("first_party_sui_balance_invalid");
  const checkpoint = nonEmptyString(await suiRpc(context, 2, "sui_getLatestCheckpointSequenceNumber", []));
  if (!checkpoint) throw new Error("first_party_sui_checkpoint_invalid");
  let decimals = 9;
  let symbol = "SUI";
  if (coinType !== SUI_NATIVE_COIN_TYPE) {
    const metadata = record(await suiRpc(context, 3, "suix_getCoinMetadata", [coinType]));
    if (!metadata || !Number.isInteger(metadata.decimals) || Number(metadata.decimals) < 0 || Number(metadata.decimals) > 30) {
      throw new Error("first_party_sui_metadata_invalid");
    }
    decimals = Number(metadata.decimals);
    symbol = nonEmptyString(metadata.symbol) ?? "TOKEN";
  }
  return {
    data: {
      address,
      coinType,
      balanceAtomic: decimal(balance.totalBalance ?? "0", "sui_balance"),
      decimals,
      symbol: symbol.slice(0, 24),
      checkpoint,
      observedAt,
    },
    source: "Sui testnet JSON-RPC",
    observedAt,
    blockOrVersion: checkpoint,
  };
}

async function executeHyperliquid(
  context: RequestContext,
  actionId: string,
  network: string,
  args: JsonObject,
  observedAt: string,
): Promise<{ data: unknown; source: string; observedAt: string; blockOrVersion: string }> {
  if (network !== HYPERLIQUID_NETWORK) throw new Error("first_party_hyperliquid_network_invalid");
  const source = "Hyperliquid testnet public info API";
  if (actionId === "hyperliquid_market_read") {
    const { universe, contexts } = hyperliquidUniverse(await hyperliquidInfo(context, { type: "metaAndAssetCtxs" }));
    const limit = positiveInteger(args.limit, 20, 50);
    return {
      data: { markets: universe.slice(0, limit).map((_entry, index) => {
        const market = marketEntry(universe, contexts, index);
        return {
          asset: market.asset,
          markPrice: market.markPrice,
          fundingRate: market.fundingRate,
          openInterest: market.openInterest,
        };
      }), observedAt },
      source,
      observedAt,
      blockOrVersion: observedAt,
    };
  }
  if (actionId === "hyperliquid_orderbook_read") {
    const asset = boundedAsset(args.asset);
    const book = record(await hyperliquidInfo(context, { type: "l2Book", coin: asset }));
    if (!book || !Array.isArray(book.levels)) throw new Error("first_party_hyperliquid_book_invalid");
    return {
      data: {
        asset,
        bids: hyperliquidLevels(book.levels[0]),
        asks: hyperliquidLevels(book.levels[1]),
        observedAt,
      },
      source,
      observedAt,
      blockOrVersion: nonEmptyString(book.time) ?? observedAt,
    };
  }
  if (actionId === "hyperliquid_account_exposure") {
    const address = nonEmptyString(args.address) ?? "";
    if (!isValidHyperliquidAddress(address)) throw new Error("first_party_hyperliquid_address_invalid");
    const state = await hyperliquidInfo(context, { type: "clearinghouseState", user: address });
    return {
      data: { ...accountSummary(state, address), observedAt },
      source,
      observedAt,
      blockOrVersion: observedAt,
    };
  }
  if (actionId !== "hyperliquid_preview_order") throw new Error("first_party_hyperliquid_action_invalid");
  const address = nonEmptyString(args.address) ?? "";
  if (!isValidHyperliquidAddress(address)) throw new Error("first_party_hyperliquid_address_invalid");
  const asset = boundedAsset(args.asset);
  const side = args.side === "buy" || args.side === "sell" ? args.side : null;
  const orderType = args.orderType === "market" || args.orderType === "limit" ? args.orderType : null;
  if (!side || !orderType || typeof args.reduceOnly !== "boolean" || !Number.isInteger(args.maxSlippageBps)) {
    throw new Error("first_party_hyperliquid_order_invalid");
  }
  const size = decimal(args.size, "hyperliquid_order_size", false);
  const maxSlippageBps = Number(args.maxSlippageBps);
  if (maxSlippageBps < 0 || maxSlippageBps > 1_000) throw new Error("first_party_hyperliquid_slippage_invalid");
  const [metaValue, bookValue, stateValue] = await Promise.all([
    hyperliquidInfo(context, { type: "metaAndAssetCtxs" }),
    hyperliquidInfo(context, { type: "l2Book", coin: asset }),
    hyperliquidInfo(context, { type: "clearinghouseState", user: address }),
  ]);
  const { universe, contexts } = hyperliquidUniverse(metaValue);
  const marketIndex = universe.findIndex((entry) => {
    try { return boundedAsset(record(entry)?.name) === asset; } catch { return false; }
  });
  if (marketIndex < 0) throw new Error("first_party_hyperliquid_market_missing");
  const market = marketEntry(universe, contexts, marketIndex);
  if (market.szDecimals === null || decimalPlaces(size) > market.szDecimals) {
    throw new Error("first_party_hyperliquid_size_precision_invalid");
  }
  const book = record(bookValue);
  if (!book || !Array.isArray(book.levels)) throw new Error("first_party_hyperliquid_book_invalid");
  const bids = hyperliquidLevels(book.levels[0]);
  const asks = hyperliquidLevels(book.levels[1]);
  const top = side === "buy" ? asks[0]?.price : bids[0]?.price;
  const referencePrice = finiteNumber(top ?? market.markPrice);
  if (!referencePrice || referencePrice <= 0) throw new Error("first_party_hyperliquid_reference_price_invalid");
  let limitPrice: string;
  if (orderType === "limit") {
    limitPrice = normalizedHyperliquidLimitPrice(
      decimal(args.price, "hyperliquid_limit_price", false),
      market.szDecimals,
    );
  } else {
    const multiplier = side === "buy" ? 1 + maxSlippageBps / 10_000 : 1 - maxSlippageBps / 10_000;
    limitPrice = protectiveHyperliquidPrice(referencePrice * multiplier, side, market.szDecimals);
  }
  const account = accountSummary(stateValue, address);
  const accountValue = finiteNumber(account.accountValueUsd) ?? 0;
  const marginUsed = finiteNumber(account.marginUsedUsd) ?? 0;
  const numericSize = finiteNumber(size);
  const numericLimitPrice = finiteNumber(limitPrice);
  if (!numericSize || !numericLimitPrice) throw new Error("first_party_hyperliquid_order_invalid");
  const notional = numericSize * numericLimitPrice;
  if (!Number.isFinite(notional) || (!args.reduceOnly && notional < 10)) {
    throw new Error("first_party_hyperliquid_notional_invalid");
  }
  if (args.reduceOnly) {
    const position = account.positions.find((item) => item.asset === asset);
    const expectedSide = side === "buy" ? "short" : "long";
    if (!position || position.side !== expectedSide || numericSize > Number(position.size)) {
      throw new Error("first_party_hyperliquid_reduce_only_invalid");
    }
  }
  if (!args.reduceOnly && market.maxLeverage && notional > Math.max(0, accountValue - marginUsed) * market.maxLeverage) {
    throw new Error("first_party_hyperliquid_margin_insufficient");
  }
  const exactIntent = {
    version: "matterhorn.hyperliquid.testnet-preview.v1",
    network,
    address,
    asset,
    side,
    size,
    orderType,
    limitPrice,
    reduceOnly: args.reduceOnly,
    maxSlippageBps,
    market: {
      index: marketIndex,
      markPrice: market.markPrice,
      sizeDecimals: market.szDecimals,
      maxLeverage: market.maxLeverage,
    },
    account: {
      accountValueUsd: account.accountValueUsd,
      marginUsedUsd: account.marginUsedUsd,
    },
    observedAt,
  };
  const simulationReference = `sha256:${sha256(exactIntent)}`;
  const expiresAt = new Date(new Date(observedAt).getTime() + 30_000).toISOString();
  return {
    data: {
      preparedActionId: `hl_preview_${sha256(exactIntent).slice(0, 20)}`,
      network,
      address,
      asset,
      side,
      size,
      orderType,
      limitPrice,
      reduceOnly: args.reduceOnly,
      maxSlippageBps,
      simulationReference,
      expiresAt,
    },
    source,
    observedAt,
    blockOrVersion: simulationReference,
  };
}

export function createFirstPartyCryptoAppExecutor(
  options: FirstPartyExecutorOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = options.requestJson ?? createPinnedJsonRequester();
  const now = options.now ?? (() => new Date());
  return async (input) => {
    if (input.credential.type !== "none") throw new Error("first_party_credentials_not_supported");
    const observedAt = now().toISOString();
    const context: RequestContext = {
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      signal: input.signal,
      requestJson,
      requestBytes: 0,
      responseBytes: 0,
      connectedAddress: null,
    };
    const result = input.appId === SUI_APP_ID
      ? await executeSui(context, input.action.id, input.network, input.arguments, observedAt)
      : input.appId === HYPERLIQUID_APP_ID
        ? await executeHyperliquid(context, input.action.id, input.network, input.arguments, observedAt)
        : Promise.reject(new Error("first_party_app_unsupported"));
    if (!context.connectedAddress) throw new Error("first_party_network_observation_required");
    const costMicros = safeCost(options.estimateCostMicros?.({
      appId: input.appId,
      actionId: input.action.id,
      requestBytes: context.requestBytes,
      responseBytes: context.responseBytes,
    }) ?? 0);
    return { ...result, costMicros, connectedAddress: context.connectedAddress };
  };
}
