import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidStructTag, normalizeStructTag } from "@mysten/sui/utils";
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";

import type { MatterhornCryptoAppTransportExecutor } from "./crypto-app-adapter-router.js";
import {
  createPinnedSuiGrpcWebFetch,
  type MatterhornGrpcTransportObservation,
} from "./crypto-app-http2-grpc-fetch.js";
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
  buildSuiTransferPreview,
  normalizeMatterhornSuiAddress,
  simulateSuiTransactionPreview,
  SUI_NATIVE_COIN_TYPE,
} from "./tools/sui.js";

type JsonObject = Record<string, unknown>;

type FirstPartyExecutorOptions = {
  requestJson?: MatterhornPinnedJsonRequester;
  createSuiGrpcClient?: SuiGrpcClientFactory;
  now?: () => Date;
  estimateCostMicros?: (input: {
    appId: string;
    actionId: string;
    requestBytes: number;
    responseBytes: number;
  }) => number;
};

type SuiGrpcClientFactory = (input: {
  endpoint: URL;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  observe: (observation: MatterhornGrpcTransportObservation) => void;
}) => SuiGrpcClient;

type RequestContext = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  requestJson: MatterhornPinnedJsonRequester;
  createSuiGrpcClient: SuiGrpcClientFactory;
  requestBytes: number;
  responseBytes: number;
  connectedAddress: string | null;
};

const HYPERLIQUID_APP_ID = "matterhorn.hyperliquid-testnet";
const POLYMARKET_RESEARCH_APP_ID = "matterhorn.polymarket-research";
const SUI_APP_ID = "matterhorn.sui-testnet";
const HYPERLIQUID_NETWORK = "hyperliquid:testnet";
const POLYMARKET_RESEARCH_NETWORK = "polymarket:public";
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

function decimalParts(value: string): { units: bigint; scale: number } {
  const [whole = "0", fraction = ""] = value.split(".");
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function decimalFromParts(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale) || "0";
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function multiplyDecimals(left: string, right: string): string {
  const a = decimalParts(left);
  const b = decimalParts(right);
  return decimalFromParts(a.units * b.units, a.scale + b.scale);
}

function subtractDecimalsAtZero(first: string, ...rest: string[]): string {
  const values = [first, ...rest].map(decimalParts);
  const scale = Math.max(...values.map((value) => value.scale));
  const normalized = values.map((value) => value.units * (10n ** BigInt(scale - value.scale)));
  const [head = 0n, ...tail] = normalized;
  const result = tail.reduce((current, value) => current - value, head);
  return decimalFromParts(result < 0n ? 0n : result, scale);
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

function observeGrpc(context: RequestContext, observation: MatterhornGrpcTransportObservation): void {
  context.requestBytes += observation.requestBytes;
  context.responseBytes += observation.responseBytes;
  context.connectedAddress = observation.connectedAddress;
}

function nonNegativeBigInt(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new Error(`first_party_${field}_invalid`);
}

function estimatedSuiGasMist(effects: unknown): string {
  const gasUsed = record(record(effects)?.gasUsed);
  if (!gasUsed) throw new Error("first_party_sui_gas_summary_invalid");
  const computationCost = nonNegativeBigInt(gasUsed.computationCost, "sui_computation_cost");
  const storageCost = nonNegativeBigInt(gasUsed.storageCost, "sui_storage_cost");
  const nonRefundableStorageFee = nonNegativeBigInt(
    gasUsed.nonRefundableStorageFee,
    "sui_non_refundable_storage_fee",
  );
  const storageRebate = nonNegativeBigInt(gasUsed.storageRebate, "sui_storage_rebate");
  const gross = computationCost + storageCost + nonRefundableStorageFee;
  return (gross > storageRebate ? gross - storageRebate : 0n).toString();
}

async function postJson(context: RequestContext, body: unknown): Promise<unknown> {
  const response = await context.requestJson({
    endpoint: context.endpoint,
    approvedAddresses: context.approvedAddresses,
    method: "POST",
    signal: context.signal,
    body,
  });
  newestAddress(context, response);
  return response.value;
}

async function getJson(context: RequestContext, endpoint: URL): Promise<unknown> {
  const response = await context.requestJson({
    endpoint,
    approvedAddresses: context.approvedAddresses,
    method: "GET",
    signal: context.signal,
  });
  newestAddress(context, response);
  return response.value;
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
  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(value[1])
    || meta.universe.length !== value[1].length) {
    throw new Error("first_party_hyperliquid_meta_invalid");
  }
  return { universe: meta.universe, contexts: value[1] };
}

function marketEntry(universe: unknown[], contexts: unknown[], index: number) {
  const definition = record(universe[index]);
  const context = record(contexts[index]);
  if (!definition || !context) throw new Error("first_party_hyperliquid_market_invalid");
  const asset = boundedAsset(definition?.name);
  const markPrice = decimal(context.markPx, "hyperliquid_mark_price");
  const fundingRate = signedDecimal(context.funding, "hyperliquid_funding");
  const openInterest = decimal(context.openInterest, "hyperliquid_open_interest");
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
  if (!Array.isArray(value)) throw new Error("first_party_hyperliquid_book_invalid");
  return value.slice(0, 50).map((entry) => {
    const level = record(entry);
    if (!level) throw new Error("first_party_hyperliquid_book_invalid");
    return {
      price: decimal(level.px, "hyperliquid_book_price", false),
      size: decimal(level.sz, "hyperliquid_book_size"),
    };
  });
}

function accountSummary(value: unknown, address: string) {
  const state = record(value);
  if (!state) throw new Error("first_party_hyperliquid_account_invalid");
  const margin = record(state.marginSummary) ?? record(state.crossMarginSummary);
  if (!margin || !Array.isArray(state.assetPositions)) throw new Error("first_party_hyperliquid_account_invalid");
  const accountValueUsd = decimal(margin.accountValue ?? margin.totalRawUsd, "hyperliquid_account_value");
  const marginUsedUsd = decimal(margin.totalMarginUsed ?? margin.marginUsed, "hyperliquid_margin_used");
  const positions = state.assetPositions.slice(0, 100).flatMap((entry) => {
    const position = record(record(entry)?.position);
    const signedSize = finiteNumber(position?.szi);
    if (!position || signedSize === null) throw new Error("first_party_hyperliquid_position_invalid");
    if (signedSize === 0) return [];
    const leverage = record(position.leverage);
    if (!leverage) throw new Error("first_party_hyperliquid_position_invalid");
    return [{
      asset: boundedAsset(position.coin),
      side: signedSize > 0 ? "long" as const : "short" as const,
      size: decimal(String(Math.abs(signedSize)), "hyperliquid_position_size", false),
      entryPrice: decimal(position.entryPx, "hyperliquid_entry_price"),
      unrealizedPnlUsd: signedDecimal(position.unrealizedPnl, "hyperliquid_unrealized_pnl"),
      leverage: decimal(leverage.value, "hyperliquid_leverage"),
    }];
  });
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
    const sender = normalizeMatterhornSuiAddress(nonEmptyString(args.sender) ?? "");
    const recipient = normalizeMatterhornSuiAddress(nonEmptyString(args.recipient) ?? "");
    const amountSui = decimal(args.amountSui, "sui_transfer_amount", false);
    const memo = args.memo === undefined ? undefined : nonEmptyString(args.memo);
    if (args.memo !== undefined && (memo == null || memo.length > 140)) {
      throw new Error("first_party_sui_memo_invalid");
    }
    const now = () => new Date(observedAt);
    const previewInput = {
      network: "testnet",
      kind: "transfer_sui",
      sender,
      recipient,
      amountSui,
      memo,
    } as const;
    const preview = buildSuiTransferPreview(previewInput, { now, ttlMs: 15_000 });
    const client = context.createSuiGrpcClient({
      endpoint: context.endpoint,
      approvedAddresses: context.approvedAddresses,
      signal: context.signal,
      observe: (observation) => observeGrpc(context, observation),
    });
    const simulation = await simulateSuiTransactionPreview(previewInput, {
      client,
      now,
      ttlMs: 15_000,
    });
    const simulationReference = `sha256:${simulation.reference}`;
    return {
      data: {
        preparedActionId: preview.id,
        network,
        sender: preview.sender,
        recipient: preview.recipient,
        amountSui: preview.amountSui,
        estimatedGasMist: estimatedSuiGasMist(simulation.gasSummary),
        simulationReference,
        expiresAt: preview.expiresAt,
      },
      source: "Sui testnet pinned gRPC simulation",
      observedAt: simulation.simulatedAt,
      blockOrVersion: simulation.block ?? simulationReference,
    };
  }
  if (actionId !== "sui_account_read") throw new Error("first_party_sui_action_invalid");
  const address = normalizeMatterhornSuiAddress(nonEmptyString(args.address) ?? "");
  const requestedCoinType = nonEmptyString(args.coinType) ?? SUI_NATIVE_COIN_TYPE;
  if (!isValidStructTag(requestedCoinType)) throw new Error("first_party_sui_coin_type_invalid");
  const coinType = normalizeStructTag(requestedCoinType);
  const client = context.createSuiGrpcClient({
    endpoint: context.endpoint,
    approvedAddresses: context.approvedAddresses,
    signal: context.signal,
    observe: (observation) => observeGrpc(context, observation),
  });
  const [balanceResult, serviceInfoCall, metadataResult] = await Promise.all([
    client.getBalance({ owner: address, coinType, signal: context.signal }),
    client.ledgerService.getServiceInfo({}, { abort: context.signal }),
    coinType === SUI_NATIVE_COIN_TYPE
      ? null
      : client.getCoinMetadata({ coinType, signal: context.signal }),
  ]);
  const serviceInfo = await serviceInfoCall.response;
  const balance = balanceResult.balance;
  const returnedCoinType = nonEmptyString(balance.coinType);
  if (!returnedCoinType || !isValidStructTag(returnedCoinType)
    || normalizeStructTag(returnedCoinType) !== coinType) {
    throw new Error("first_party_sui_balance_conflict");
  }
  const balanceAtomic = nonEmptyString(balance.balance);
  if (!balanceAtomic) throw new Error("first_party_sui_balance_invalid");
  const checkpoint = serviceInfo.checkpointHeight?.toString() ?? "";
  if (!/^(?:0|[1-9][0-9]*)$/.test(checkpoint)) throw new Error("first_party_sui_checkpoint_invalid");
  let decimals = 9;
  let symbol = "SUI";
  if (coinType !== SUI_NATIVE_COIN_TYPE) {
    const metadata = metadataResult?.coinMetadata;
    if (!metadata || !Number.isInteger(metadata.decimals) || metadata.decimals < 0 || metadata.decimals > 30) {
      throw new Error("first_party_sui_metadata_invalid");
    }
    decimals = metadata.decimals;
    symbol = nonEmptyString(metadata.symbol) ?? "TOKEN";
  }
  return {
    data: {
      address,
      coinType,
      balanceAtomic: decimal(balanceAtomic, "sui_balance"),
      decimals,
      symbol: symbol.slice(0, 24),
      checkpoint,
      observedAt,
    },
    source: "Sui testnet pinned gRPC reads",
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
    if (boundedAsset(book.coin) !== asset) throw new Error("first_party_hyperliquid_book_conflict");
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
  if (boundedAsset(book.coin) !== asset) throw new Error("first_party_hyperliquid_book_conflict");
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
  const notionalUsd = multiplyDecimals(size, limitPrice);
  const notional = Number(notionalUsd);
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
  const existingPosition = account.positions.find((item) => item.asset === asset);
  const effectiveLeverage = finiteNumber(existingPosition?.leverage) ?? market.maxLeverage;
  if (!effectiveLeverage || effectiveLeverage <= 0) {
    throw new Error("first_party_hyperliquid_leverage_unavailable");
  }
  // Reserve assumes one-times collateral for a new order. This is stricter
  // than venue maximum leverage and avoids overstating remaining capacity.
  const projectedReserveUsd = subtractDecimalsAtZero(
    account.accountValueUsd,
    account.marginUsedUsd,
    ...(args.reduceOnly ? [] : [notionalUsd]),
  );
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
      notionalUsd,
      accountValueUsd: account.accountValueUsd,
      marginUsedUsd: account.marginUsedUsd,
      projectedReserveUsd,
      effectiveLeverage: String(effectiveLeverage),
      simulationReference,
      expiresAt,
    },
    source,
    observedAt,
    blockOrVersion: simulationReference,
  };
}

function boundedPublicText(value: unknown, field: string, maximum: number): string {
  const text = nonEmptyString(value);
  if (!text || text.length > maximum || /[\u0000-\u001F\u007F]/.test(text)) {
    throw new Error(`first_party_polymarket_${field}_invalid`);
  }
  return text;
}

function nullablePublicText(value: unknown, field: string, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return boundedPublicText(value, field, maximum);
}

function polymarketStringArray(value: unknown, field: string): string[] {
  let parsed = value;
  if (typeof value === "string") {
    if (value.length > 8_192) throw new Error(`first_party_polymarket_${field}_invalid`);
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`first_party_polymarket_${field}_invalid`);
    }
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
    throw new Error(`first_party_polymarket_${field}_invalid`);
  }
  return parsed.map((item) => boundedPublicText(item, field, 120));
}

function polymarketDecimal(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return decimal(value, `polymarket_${field}`);
}

function polymarketSearchEndpoint(base: URL, query: string, limit: number): URL {
  if (base.protocol !== "https:"
    || base.username
    || base.password
    || base.pathname !== "/"
    || base.search
    || base.hash) {
    throw new Error("first_party_polymarket_endpoint_invalid");
  }
  const endpoint = new URL("/public-search", base.origin);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("events_status", "active");
  endpoint.searchParams.set("limit_per_type", String(limit));
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("keep_closed_markets", "0");
  endpoint.searchParams.set("search_tags", "false");
  endpoint.searchParams.set("search_profiles", "false");
  if (endpoint.origin !== base.origin || endpoint.href.length > 8_192) {
    throw new Error("first_party_polymarket_endpoint_invalid");
  }
  return endpoint;
}

function polymarketMarket(
  value: unknown,
  event: { id: string; title: string; restricted: boolean },
): {
  id: string;
  question: string;
  slug: string | null;
  conditionId: string | null;
  eventId: string;
  eventTitle: string;
  outcomes: string[];
  outcomePrices: string[];
  liquidity: string | null;
  volume: string | null;
  active: boolean;
  closed: boolean;
  restricted: boolean;
  endDate: string | null;
} {
  const market = record(value);
  if (!market || typeof market.active !== "boolean" || typeof market.closed !== "boolean") {
    throw new Error("first_party_polymarket_market_invalid");
  }
  const outcomes = polymarketStringArray(market.outcomes, "outcomes");
  const outcomePrices = polymarketStringArray(market.outcomePrices, "outcome_prices")
    .map((price) => decimal(price, "polymarket_outcome_price"));
  if (outcomes.length !== outcomePrices.length
    || outcomePrices.some((price) => Number(price) < 0 || Number(price) > 1)) {
    throw new Error("first_party_polymarket_outcome_prices_invalid");
  }
  const endDate = nullablePublicText(market.endDate, "end_date", 40);
  if (endDate !== null && !Number.isFinite(Date.parse(endDate))) {
    throw new Error("first_party_polymarket_end_date_invalid");
  }
  return {
    id: boundedPublicText(market.id ?? market.conditionId, "market_id", 160),
    question: boundedPublicText(market.question ?? market.title, "question", 500),
    slug: nullablePublicText(market.slug, "slug", 160),
    conditionId: nullablePublicText(market.conditionId, "condition_id", 160),
    eventId: event.id,
    eventTitle: event.title,
    outcomes,
    outcomePrices,
    liquidity: polymarketDecimal(market.liquidity, "liquidity"),
    volume: polymarketDecimal(market.volume, "volume"),
    active: market.active,
    closed: market.closed,
    restricted: typeof market.restricted === "boolean" ? market.restricted : event.restricted,
    endDate,
  };
}

async function executePolymarketResearch(
  context: RequestContext,
  actionId: string,
  network: string,
  args: JsonObject,
  observedAt: string,
): Promise<{ data: unknown; source: string; observedAt: string; blockOrVersion: string }> {
  if (network !== POLYMARKET_RESEARCH_NETWORK) {
    throw new Error("first_party_polymarket_network_invalid");
  }
  if (actionId !== "polymarket_market_search") {
    throw new Error("first_party_polymarket_action_invalid");
  }
  const query = boundedPublicText(args.query, "query", 200);
  const limit = positiveInteger(args.limit, 8, 10);
  const payload = record(await getJson(context, polymarketSearchEndpoint(context.endpoint, query, limit)));
  if (!payload || !Array.isArray(payload.events)) {
    throw new Error("first_party_polymarket_search_invalid");
  }
  const unique = new Map<string, ReturnType<typeof polymarketMarket>>();
  for (const rawEvent of payload.events.slice(0, 50)) {
    const event = record(rawEvent);
    if (!event || !Array.isArray(event.markets) || typeof event.restricted !== "boolean") {
      throw new Error("first_party_polymarket_event_invalid");
    }
    const summary = {
      id: boundedPublicText(event.id, "event_id", 160),
      title: boundedPublicText(event.title ?? event.question, "event_title", 500),
      restricted: event.restricted,
    };
    for (const rawMarket of event.markets.slice(0, 50)) {
      const market = polymarketMarket(rawMarket, summary);
      if (market.active && !market.closed) unique.set(market.id, market);
      if (unique.size >= limit) break;
    }
    if (unique.size >= limit) break;
  }
  return {
    data: { markets: [...unique.values()], observedAt },
    source: "Polymarket Gamma public research API",
    observedAt,
    blockOrVersion: observedAt,
  };
}

export function createFirstPartyCryptoAppExecutor(
  options: FirstPartyExecutorOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = options.requestJson ?? createPinnedJsonRequester();
  const now = options.now ?? (() => new Date());
  const createSuiGrpcClient = options.createSuiGrpcClient ?? ((input) => {
    const transport = new GrpcWebFetchTransport({
      baseUrl: input.endpoint.href.replace(/\/$/, ""),
      format: "binary",
      fetch: createPinnedSuiGrpcWebFetch({
        endpoint: input.endpoint,
        approvedAddresses: input.approvedAddresses,
        outerSignal: input.signal,
        onObservation: input.observe,
      }),
    });
    return new SuiGrpcClient({
      network: "testnet",
      transport,
    });
  });
  return async (input) => {
    if (input.credential.type !== "none") throw new Error("first_party_credentials_not_supported");
    const observedAt = now().toISOString();
    const context: RequestContext = {
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      signal: input.signal,
      requestJson,
      createSuiGrpcClient,
      requestBytes: 0,
      responseBytes: 0,
      connectedAddress: null,
    };
    const result = input.appId === SUI_APP_ID
      ? await executeSui(context, input.action.id, input.network, input.arguments, observedAt)
      : input.appId === HYPERLIQUID_APP_ID
        ? await executeHyperliquid(context, input.action.id, input.network, input.arguments, observedAt)
        : input.appId === POLYMARKET_RESEARCH_APP_ID
          ? await executePolymarketResearch(context, input.action.id, input.network, input.arguments, observedAt)
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
