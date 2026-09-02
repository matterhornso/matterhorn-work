import {
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  type MatterhornCryptoAppManifest,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppCapabilityBinding } from "./crypto-app-guarded-authorization.js";
import { canonicalCryptoAppManifestPayload } from "./crypto-app-signature.js";

type ManifestSigner = (canonicalPayload: string) => string;

export type MatterhornFirstPartyCryptoAppOptions = {
  publisherId: string;
  publisherKeyId: string;
  sign: ManifestSigner;
  suiTestnetEndpoint: string;
  hyperliquidTestnetEndpoint: string;
  privacyPolicyUrl: string;
  statusUrl?: string | null;
  securityContact: string;
};

export type MatterhornFirstPartyPolymarketResearchOptions = Omit<
  MatterhornFirstPartyCryptoAppOptions,
  "suiTestnetEndpoint" | "hyperliquidTestnetEndpoint"
> & {
  polymarketGammaEndpoint: string;
};

export type MatterhornFirstPartyPolymarketClobResearchOptions = Omit<
  MatterhornFirstPartyCryptoAppOptions,
  "suiTestnetEndpoint" | "hyperliquidTestnetEndpoint"
> & {
  polymarketClobEndpoint: string;
};

export type MatterhornFirstPartyBittensorTestnetOptions = Omit<
  MatterhornFirstPartyCryptoAppOptions,
  "suiTestnetEndpoint" | "hyperliquidTestnetEndpoint"
> & {
  bittensorTestnetSidecarEndpoint: string;
};

const FIRST_PARTY_ACTION_PROXY_TOOLS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "matterhorn.sui-testnet": {
    sui_account_read: "matterhorn_sui_get_balance",
    sui_transfer_preview: "matterhorn_sui_preview_transfer",
  },
  "matterhorn.hyperliquid-testnet": {
    hyperliquid_market_read: "matterhorn_hyperliquid_list_markets",
    hyperliquid_orderbook_read: "matterhorn_hyperliquid_get_orderbook",
    hyperliquid_account_exposure: "matterhorn_hyperliquid_get_positions",
    hyperliquid_preview_order: "matterhorn_hyperliquid_preview_order",
  },
  "matterhorn.polymarket-research": {
    polymarket_market_search: "matterhorn_polymarket_search_markets",
  },
  "matterhorn.polymarket-clob-research": {
    polymarket_orderbook_read: "matterhorn_polymarket_get_orderbook",
  },
  "matterhorn.bittensor-testnet": {
    bittensor_subnet_list: "matterhorn_bittensor_chat",
    bittensor_subnet_read: "matterhorn_bittensor_chat",
    bittensor_prepare_transfer: "matterhorn_bittensor_prepare_action",
    bittensor_prepare_stake: "matterhorn_bittensor_prepare_action",
    bittensor_prepare_unstake: "matterhorn_bittensor_prepare_action",
  },
};

export function firstPartyCryptoAppProxyTool(appId: string, actionId: string): string | null {
  return FIRST_PARTY_ACTION_PROXY_TOOLS[appId]?.[actionId] ?? null;
}

function decimalArgument(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) ? text : null;
}

function textArgument(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Projects model-visible MCP arguments into the smaller, certified first-party
 * adapter contract. Unknown fields are discarded and financial defaults are
 * explicit, so a prompt cannot smuggle authority through an unrelated field.
 */
export function firstPartyCryptoAppAdapterArguments(input: {
  appId: string;
  actionId: string;
  arguments: Record<string, unknown>;
}): Record<string, unknown> {
  const args = input.arguments;
  if (input.appId === "matterhorn.sui-testnet" && input.actionId === "sui_account_read") {
    const address = textArgument(args.address);
    if (!address) throw new Error("first_party_crypto_app_arguments_invalid");
    const coinType = textArgument(args.coinType);
    return { address, ...(coinType ? { coinType } : {}) };
  }
  if (input.appId === "matterhorn.sui-testnet" && input.actionId === "sui_transfer_preview") {
    const sender = textArgument(args.sender);
    const recipient = textArgument(args.recipient);
    const amountSui = decimalArgument(args.amountSui);
    if (!sender || !recipient || !amountSui) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    const memo = typeof args.memo === "string" ? args.memo : null;
    return { sender, recipient, amountSui, ...(memo === null ? {} : { memo }) };
  }
  if (input.appId === "matterhorn.hyperliquid-testnet" && input.actionId === "hyperliquid_market_read") {
    if (args.limit === undefined) return {};
    if (!Number.isSafeInteger(args.limit) || Number(args.limit) < 1 || Number(args.limit) > 50) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { limit: Number(args.limit) };
  }
  if (input.appId === "matterhorn.hyperliquid-testnet" && input.actionId === "hyperliquid_orderbook_read") {
    const asset = textArgument(args.asset)?.toUpperCase();
    if (!asset) throw new Error("first_party_crypto_app_arguments_invalid");
    return { asset };
  }
  if (input.appId === "matterhorn.hyperliquid-testnet" && input.actionId === "hyperliquid_account_exposure") {
    const address = textArgument(args.address);
    if (!address) throw new Error("first_party_crypto_app_arguments_invalid");
    return { address };
  }
  if (input.appId === "matterhorn.hyperliquid-testnet" && input.actionId === "hyperliquid_preview_order") {
    const address = textArgument(args.address);
    const asset = textArgument(args.asset)?.toUpperCase();
    const rawSide = textArgument(args.side)?.toLowerCase();
    const side = rawSide === "buy" || rawSide === "long"
      ? "buy"
      : rawSide === "sell" || rawSide === "short"
        ? "sell"
        : null;
    const size = decimalArgument(args.size);
    const orderType = args.orderType === "limit" ? "limit" : args.orderType === undefined || args.orderType === "market"
      ? "market"
      : null;
    const price = decimalArgument(args.price);
    const slippagePercent = args.slippageTolerance === undefined
      ? 1
      : Number(args.slippageTolerance);
    if (!address || !asset || !side || !size || !orderType
      || (orderType === "limit" && !price)
      || !Number.isFinite(slippagePercent)
      || slippagePercent < 0
      || slippagePercent > 10
      || (args.reduceOnly !== undefined && typeof args.reduceOnly !== "boolean")) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return {
      address,
      asset,
      side,
      size,
      orderType,
      ...(orderType === "limit" ? { price } : {}),
      reduceOnly: args.reduceOnly === true,
      maxSlippageBps: Math.round(slippagePercent * 100),
    };
  }
  if (input.appId === "matterhorn.polymarket-research" && input.actionId === "polymarket_market_search") {
    const query = textArgument(args.query);
    const limit = args.limit === undefined ? 8 : Number(args.limit);
    if (!query
      || query.length > 200
      || /[\u0000-\u001F\u007F]/.test(query)
      || !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 10) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { query, limit };
  }
  if (input.appId === "matterhorn.polymarket-clob-research" && input.actionId === "polymarket_orderbook_read") {
    const tokenId = textArgument(args.tokenId);
    if (!tokenId
      || !/^[1-9][0-9]{0,77}$/.test(tokenId)
      || BigInt(tokenId) > ((1n << 256n) - 1n)) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { tokenId };
  }
  if (input.appId === "matterhorn.bittensor-testnet" && input.actionId === "bittensor_subnet_list") {
    const limit = args.limit === undefined ? 12 : Number(args.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { limit };
  }
  if (input.appId === "matterhorn.bittensor-testnet" && input.actionId === "bittensor_subnet_read") {
    const netuid = Number(args.netuid);
    const validatorLimit = args.limit === undefined ? 10 : Number(args.limit);
    if (!Number.isSafeInteger(netuid)
      || netuid < 0
      || netuid > 65_535
      || !Number.isSafeInteger(validatorLimit)
      || validatorLimit < 1
      || validatorLimit > 20) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { netuid, validatorLimit };
  }
  if (input.appId === "matterhorn.bittensor-testnet"
    && ["bittensor_prepare_transfer", "bittensor_prepare_stake", "bittensor_prepare_unstake"].includes(input.actionId)) {
    const sender = textArgument(args.sender);
    const amountTao = decimalArgument(args.amountTao);
    if (!sender || !amountTao || Number(amountTao) <= 0) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    if (input.actionId === "bittensor_prepare_transfer") {
      const destination = textArgument(args.destination);
      if (!destination) throw new Error("first_party_crypto_app_arguments_invalid");
      return { sender, destination, amountTao };
    }
    const hotkey = textArgument(args.hotkey);
    const netuid = Number(args.netuid);
    if (!hotkey || !Number.isSafeInteger(netuid) || netuid < 0 || netuid > 65_535) {
      throw new Error("first_party_crypto_app_arguments_invalid");
    }
    return { sender, hotkey, netuid, amountTao };
  }
  throw new Error("first_party_crypto_app_action_unsupported");
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

const decimalString = { type: "string", minLength: 1, maxLength: 96 };
const addressString = { type: "string", minLength: 3, maxLength: 128 };
const identifierString = { type: "string", minLength: 1, maxLength: 160 };
const timestampString = { type: "string", minLength: 20, maxLength: 40 };
const nullableMetric = { oneOf: [{ type: "number" }, { type: "null" }] };

type FirstPartyManifestIdentity = Pick<
  MatterhornFirstPartyCryptoAppOptions,
  "publisherId" | "publisherKeyId" | "sign" | "privacyPolicyUrl" | "statusUrl" | "securityContact"
>;

function signedManifest(
  options: FirstPartyManifestIdentity,
  manifest: Omit<MatterhornCryptoAppManifest, "version" | "publisher" | "support">,
): MatterhornCryptoAppManifest {
  const result: MatterhornCryptoAppManifest = {
    version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
    ...manifest,
    publisher: {
      id: options.publisherId,
      keyId: options.publisherKeyId,
      algorithm: "ed25519",
      signature: "pending",
    },
    support: {
      privacyPolicyUrl: options.privacyPolicyUrl,
      statusUrl: options.statusUrl ?? null,
      securityContact: options.securityContact,
    },
  };
  result.publisher.signature = options.sign(canonicalCryptoAppManifestPayload(result));
  return result;
}

function suiManifest(options: MatterhornFirstPartyCryptoAppOptions): MatterhornCryptoAppManifest {
  return signedManifest(options, {
    appId: "matterhorn.sui-testnet",
    displayName: "Sui Testnet",
    description: "Certified Sui testnet reads and wallet-reviewed transfer preparation.",
    manifestRevision: "1.0.0",
    transport: { kind: "matterhorn_sdk", endpoint: options.suiTestnetEndpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
    actions: [
      {
        id: "sui_account_read",
        title: "Read Sui balance",
        description: "Read a public Sui testnet balance with checkpoint freshness.",
        access: "read",
        risk: "private_data",
        inputSchema: objectSchema({
          address: addressString,
          coinType: { type: "string", minLength: 1, maxLength: 256 },
        }, ["address"]),
        outputProjectionSchema: objectSchema({
          address: addressString,
          coinType: { type: "string", minLength: 1, maxLength: 256 },
          balanceAtomic: decimalString,
          decimals: { type: "integer", minimum: 0, maximum: 30 },
          symbol: { type: "string", minLength: 1, maxLength: 24 },
          checkpoint: identifierString,
          observedAt: timestampString,
        }, ["address", "coinType", "balanceAtomic", "decimals", "symbol", "checkpoint", "observedAt"]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "sui_transfer_preview",
        title: "Prepare Sui transfer",
        description: "Dry-run exact Sui testnet transfer terms and create a wallet-review reference.",
        access: "prepare",
        risk: "financial_high",
        inputSchema: objectSchema({
          sender: addressString,
          recipient: addressString,
          amountSui: decimalString,
          memo: { type: "string", maxLength: 140 },
        }, ["sender", "recipient", "amountSui"]),
        outputProjectionSchema: objectSchema({
          preparedActionId: identifierString,
          network: { type: "string", const: "sui:testnet" },
          sender: addressString,
          recipient: addressString,
          amountSui: decimalString,
          estimatedGasMist: decimalString,
          simulationReference: identifierString,
          expiresAt: timestampString,
        }, [
          "preparedActionId",
          "network",
          "sender",
          "recipient",
          "amountSui",
          "estimatedGasMist",
          "simulationReference",
          "expiresAt",
        ]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 15_000,
        timeoutMs: 15_000,
        simulationRequired: true,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
    ],
  });
}

function hyperliquidManifest(options: MatterhornFirstPartyCryptoAppOptions): MatterhornCryptoAppManifest {
  const levelSchema = objectSchema({
    price: decimalString,
    size: decimalString,
  }, ["price", "size"]);
  return signedManifest(options, {
    appId: "matterhorn.hyperliquid-testnet",
    displayName: "Hyperliquid Testnet",
    description: "Certified Hyperliquid testnet market reads and wallet-reviewed order preparation.",
    manifestRevision: "1.1.0",
    transport: { kind: "matterhorn_sdk", endpoint: options.hyperliquidTestnetEndpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "hyperliquid", chainId: "hyperliquid:testnet", environment: "testnet" }],
    actions: [
      {
        id: "hyperliquid_market_read",
        title: "List Hyperliquid markets",
        description: "Read bounded Hyperliquid testnet market summaries.",
        access: "read",
        risk: "informational",
        inputSchema: objectSchema({ limit: { type: "integer", minimum: 1, maximum: 50 } }),
        outputProjectionSchema: objectSchema({
          markets: {
            type: "array",
            maxItems: 50,
            items: objectSchema({
              asset: { type: "string", minLength: 1, maxLength: 32 },
              markPrice: decimalString,
              fundingRate: decimalString,
              openInterest: decimalString,
            }, ["asset", "markPrice", "fundingRate", "openInterest"]),
          },
          observedAt: timestampString,
        }, ["markets", "observedAt"]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 15_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "hyperliquid_orderbook_read",
        title: "Read Hyperliquid orderbook",
        description: "Read a bounded Hyperliquid testnet orderbook for one asset.",
        access: "read",
        risk: "informational",
        inputSchema: objectSchema({ asset: { type: "string", minLength: 1, maxLength: 32 } }, ["asset"]),
        outputProjectionSchema: objectSchema({
          asset: { type: "string", minLength: 1, maxLength: 32 },
          bids: { type: "array", maxItems: 50, items: levelSchema },
          asks: { type: "array", maxItems: 50, items: levelSchema },
          observedAt: timestampString,
        }, ["asset", "bids", "asks", "observedAt"]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 5_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "hyperliquid_account_exposure",
        title: "Read Hyperliquid positions",
        description: "Read public position and margin state for one disclosed testnet account.",
        access: "read",
        risk: "private_data",
        inputSchema: objectSchema({ address: addressString }, ["address"]),
        outputProjectionSchema: objectSchema({
          address: addressString,
          accountValueUsd: decimalString,
          marginUsedUsd: decimalString,
          positions: {
            type: "array",
            maxItems: 100,
            items: objectSchema({
              asset: { type: "string", minLength: 1, maxLength: 32 },
              side: { type: "string", enum: ["long", "short"] },
              size: decimalString,
              entryPrice: decimalString,
              unrealizedPnlUsd: decimalString,
              leverage: decimalString,
            }, ["asset", "side", "size", "entryPrice", "unrealizedPnlUsd", "leverage"]),
          },
          observedAt: timestampString,
        }, ["address", "accountValueUsd", "marginUsedUsd", "positions", "observedAt"]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 10_000,
        timeoutMs: 10_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "hyperliquid_preview_order",
        title: "Prepare Hyperliquid order",
        description: "Refresh market and margin rules and create an exact testnet wallet-review reference.",
        access: "prepare",
        risk: "financial_high",
        inputSchema: objectSchema({
          address: addressString,
          asset: { type: "string", minLength: 1, maxLength: 32 },
          side: { type: "string", enum: ["buy", "sell"] },
          size: decimalString,
          orderType: { type: "string", enum: ["market", "limit"] },
          price: decimalString,
          reduceOnly: { type: "boolean" },
          maxSlippageBps: { type: "integer", minimum: 0, maximum: 1_000 },
        }, ["address", "asset", "side", "size", "orderType", "reduceOnly", "maxSlippageBps"]),
        outputProjectionSchema: objectSchema({
          preparedActionId: identifierString,
          network: { type: "string", const: "hyperliquid:testnet" },
          address: addressString,
          asset: { type: "string", minLength: 1, maxLength: 32 },
          side: { type: "string", enum: ["buy", "sell"] },
          size: decimalString,
          orderType: { type: "string", enum: ["market", "limit"] },
          limitPrice: { oneOf: [decimalString, { type: "null" }] },
          reduceOnly: { type: "boolean" },
          maxSlippageBps: { type: "integer", minimum: 0, maximum: 1_000 },
          notionalUsd: decimalString,
          accountValueUsd: decimalString,
          marginUsedUsd: decimalString,
          projectedReserveUsd: decimalString,
          effectiveLeverage: decimalString,
          simulationReference: identifierString,
          expiresAt: timestampString,
        }, [
          "preparedActionId",
          "network",
          "address",
          "asset",
          "side",
          "size",
          "orderType",
          "limitPrice",
          "reduceOnly",
          "maxSlippageBps",
          "notionalUsd",
          "accountValueUsd",
          "marginUsedUsd",
          "projectedReserveUsd",
          "effectiveLeverage",
          "simulationReference",
          "expiresAt",
        ]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 5_000,
        timeoutMs: 15_000,
        simulationRequired: true,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
    ],
  });
}

function bittensorSubnetSchema(): Record<string, unknown> {
  return objectSchema({
    netuid: { type: "integer", minimum: 0, maximum: 65_535 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    symbol: { type: "string", minLength: 1, maxLength: 32 },
    category: { type: "string", minLength: 1, maxLength: 160 },
    description: { type: "string", maxLength: 1_000 },
    priceTao: nullableMetric,
    emission: nullableMetric,
    tempo: nullableMetric,
  }, ["netuid", "name", "symbol", "category", "description", "priceTao", "emission", "tempo"]);
}

/**
 * Testnet-only public Subtensor reads through Matterhorn's owned sidecar. The
 * manifest intentionally excludes wallet, quote, prepare, sign, relay, submit,
 * and arbitrary-path actions even though the legacy sidecar has other routes.
 */
export function buildMatterhornFirstPartyBittensorTestnetManifest(
  options: MatterhornFirstPartyBittensorTestnetOptions,
): MatterhornCryptoAppManifest {
  const validatorSchema = objectSchema({
    uid: { type: "integer", minimum: 0 },
    hotkey: { type: "string", minLength: 32, maxLength: 64 },
    stake: nullableMetric,
    trust: nullableMetric,
    validatorTrust: nullableMetric,
    dividends: nullableMetric,
    emission: nullableMetric,
    active: { type: "boolean" },
    validatorPermit: { oneOf: [{ type: "boolean" }, { type: "null" }] },
  }, [
    "uid",
    "hotkey",
    "stake",
    "trust",
    "validatorTrust",
    "dividends",
    "emission",
    "active",
    "validatorPermit",
  ]);
  const nullableDecimal = { oneOf: [decimalString, { type: "null" }] };
  const nullableAddress = { oneOf: [addressString, { type: "null" }] };
  const nullableNetuid = {
    oneOf: [{ type: "integer", minimum: 0, maximum: 65_535 }, { type: "null" }],
  };
  const bittensorPreviewOutput = (action: "transfer" | "stake" | "unstake") => objectSchema({
    preparedActionId: identifierString,
    network: { type: "string", const: "bittensor:test" },
    action: { type: "string", const: action },
    sender: addressString,
    destination: nullableAddress,
    hotkey: nullableAddress,
    netuid: nullableNetuid,
    amountTao: decimalString,
    availableTao: decimalString,
    currentStakeTao: nullableDecimal,
    expectedAlpha: nullableDecimal,
    networkFeeTao: decimalString,
    swapFeeTao: nullableDecimal,
    slippageBps: { oneOf: [{ type: "integer", minimum: 0, maximum: 10_000 }, { type: "null" }] },
    block: { type: "integer", minimum: 0 },
    simulationReference: identifierString,
    expiresAt: timestampString,
  }, [
    "preparedActionId",
    "network",
    "action",
    "sender",
    "destination",
    "hotkey",
    "netuid",
    "amountTao",
    "availableTao",
    "currentStakeTao",
    "expectedAlpha",
    "networkFeeTao",
    "swapFeeTao",
    "slippageBps",
    "block",
    "simulationReference",
    "expiresAt",
  ]);
  const financialAction = (
    id: "bittensor_prepare_transfer" | "bittensor_prepare_stake" | "bittensor_prepare_unstake",
    action: "transfer" | "stake" | "unstake",
  ) => ({
    id,
    title: action === "transfer"
      ? "Prepare Bittensor testnet transfer"
      : `Prepare Bittensor testnet ${action}`,
    description: `Refresh exact ${action} terms, balances, fees, and testnet state for connected-wallet review.`,
    access: "prepare" as const,
    risk: "financial_high" as const,
    inputSchema: action === "transfer"
      ? objectSchema({ sender: addressString, destination: addressString, amountTao: decimalString }, ["sender", "destination", "amountTao"])
      : objectSchema({
          sender: addressString,
          hotkey: addressString,
          netuid: { type: "integer", minimum: 0, maximum: 65_535 },
          amountTao: decimalString,
        }, ["sender", "hotkey", "netuid", "amountTao"]),
    outputProjectionSchema: bittensorPreviewOutput(action),
    requiredScopes: [],
    requiresFreshness: true,
    freshnessMaxAgeMs: 10_000,
    timeoutMs: 20_000,
    simulationRequired: true,
    walletSubmissionOnly: true as const,
    agentMaySubmit: false as const,
  });
  return signedManifest(options, {
    appId: "matterhorn.bittensor-testnet",
    displayName: "Bittensor Testnet",
    description: "Certified Bittensor testnet research and wallet-reviewed transfer, stake, and unstake preparation.",
    manifestRevision: "1.1.0",
    transport: { kind: "matterhorn_sdk", endpoint: options.bittensorTestnetSidecarEndpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "bittensor", chainId: "bittensor:test", environment: "testnet" }],
    actions: [
      {
        id: "bittensor_subnet_list",
        title: "List Bittensor testnet subnets",
        description: "Read bounded public subnet metadata with block and observation freshness.",
        access: "read",
        risk: "informational",
        inputSchema: objectSchema({ limit: { type: "integer", minimum: 1, maximum: 50 } }),
        outputProjectionSchema: objectSchema({
          network: { type: "string", const: "bittensor:test" },
          subnets: { type: "array", maxItems: 50, items: bittensorSubnetSchema() },
          block: { type: "integer", minimum: 0 },
          observedAt: timestampString,
        }, ["network", "subnets", "block", "observedAt"]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 90_000,
        timeoutMs: 12_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      {
        id: "bittensor_subnet_read",
        title: "Read Bittensor testnet subnet",
        description: "Read one subnet and a bounded validator comparison from public testnet state.",
        access: "read",
        risk: "informational",
        inputSchema: objectSchema({
          netuid: { type: "integer", minimum: 0, maximum: 65_535 },
          validatorLimit: { type: "integer", minimum: 1, maximum: 20 },
        }, ["netuid"]),
        outputProjectionSchema: objectSchema({
          network: { type: "string", const: "bittensor:test" },
          subnet: bittensorSubnetSchema(),
          validators: { type: "array", maxItems: 20, items: validatorSchema },
          totalStake: nullableMetric,
          dynamicBlock: { type: "integer", minimum: 0 },
          metagraphBlock: { type: "integer", minimum: 0 },
          observedAt: timestampString,
        }, [
          "network",
          "subnet",
          "validators",
          "totalStake",
          "dynamicBlock",
          "metagraphBlock",
          "observedAt",
        ]),
        requiredScopes: [],
        requiresFreshness: true,
        freshnessMaxAgeMs: 30_000,
        timeoutMs: 15_000,
        simulationRequired: false,
        walletSubmissionOnly: true,
        agentMaySubmit: false,
      },
      financialAction("bittensor_prepare_transfer", "transfer"),
      financialAction("bittensor_prepare_stake", "stake"),
      financialAction("bittensor_prepare_unstake", "unstake"),
    ],
  });
}

/**
 * Read-only mainnet market metadata. This contract intentionally excludes the
 * CLOB, geoblock, wallet, prepare, sign, relay, and submit surfaces. Registering
 * or certifying it remains an explicit operator action.
 */
export function buildMatterhornFirstPartyPolymarketResearchManifest(
  options: MatterhornFirstPartyPolymarketResearchOptions,
): MatterhornCryptoAppManifest {
  const nullableText = { oneOf: [identifierString, { type: "null" }] };
  return signedManifest(options, {
    appId: "matterhorn.polymarket-research",
    displayName: "Polymarket Public Research",
    description: "Read-only public Polymarket market discovery. No wallet or order authority.",
    manifestRevision: "1.1.0",
    transport: { kind: "matterhorn_sdk", endpoint: options.polymarketGammaEndpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "polymarket", chainId: "polymarket:public", environment: "mainnet" }],
    actions: [{
      id: "polymarket_market_search",
      title: "Search Polymarket markets",
      description: "Search bounded public market metadata without wallet, profile, or order access.",
      access: "read",
      risk: "informational",
      inputSchema: objectSchema({
        query: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      }, ["query"]),
      outputProjectionSchema: objectSchema({
        markets: {
          type: "array",
          maxItems: 10,
          items: objectSchema({
            id: identifierString,
            question: { type: "string", minLength: 1, maxLength: 500 },
            slug: nullableText,
            conditionId: nullableText,
            eventId: nullableText,
            eventTitle: { oneOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "null" }] },
            outcomes: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 120 } },
            outcomePrices: { type: "array", maxItems: 20, items: decimalString },
            outcomeTokens: {
              type: "array",
              maxItems: 20,
              items: objectSchema({
                outcome: { type: "string", minLength: 1, maxLength: 120 },
                tokenId: { type: "string", minLength: 1, maxLength: 78 },
              }, ["outcome", "tokenId"]),
            },
            liquidity: { oneOf: [decimalString, { type: "null" }] },
            volume: { oneOf: [decimalString, { type: "null" }] },
            active: { type: "boolean" },
            closed: { type: "boolean" },
            restricted: { type: "boolean" },
            endDate: { oneOf: [timestampString, { type: "null" }] },
          }, [
            "id",
            "question",
            "slug",
            "conditionId",
            "eventId",
            "eventTitle",
            "outcomes",
            "outcomePrices",
            "outcomeTokens",
            "liquidity",
            "volume",
            "active",
            "closed",
            "restricted",
            "endDate",
          ]),
        },
        observedAt: timestampString,
      }, ["markets", "observedAt"]),
      requiredScopes: [],
      requiresFreshness: true,
      freshnessMaxAgeMs: 15_000,
      timeoutMs: 10_000,
      simulationRequired: false,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
  });
}

/**
 * Separate, read-only CLOB origin. Keeping this contract distinct from Gamma
 * prevents a certified discovery action from changing hosts or reaching any
 * authenticated order, cancellation, relayer, profile, or credential route.
 */
export function buildMatterhornFirstPartyPolymarketClobResearchManifest(
  options: MatterhornFirstPartyPolymarketClobResearchOptions,
): MatterhornCryptoAppManifest {
  const levelSchema = objectSchema({
    price: decimalString,
    size: decimalString,
  }, ["price", "size"]);
  return signedManifest(options, {
    appId: "matterhorn.polymarket-clob-research",
    displayName: "Polymarket Public Order Books",
    description: "Read-only public Polymarket order-book snapshots. No account, wallet, or order authority.",
    manifestRevision: "1.0.0",
    transport: { kind: "matterhorn_sdk", endpoint: options.polymarketClobEndpoint },
    authentication: { type: "none", scopes: [] },
    networks: [{ protocol: "polymarket", chainId: "polymarket:public", environment: "mainnet" }],
    actions: [{
      id: "polymarket_orderbook_read",
      title: "Read a Polymarket order book",
      description: "Read one bounded public order book by its exact outcome token ID.",
      access: "read",
      risk: "informational",
      inputSchema: objectSchema({
        tokenId: { type: "string", minLength: 1, maxLength: 78 },
      }, ["tokenId"]),
      outputProjectionSchema: objectSchema({
        market: identifierString,
        tokenId: { type: "string", minLength: 1, maxLength: 78 },
        snapshotTimestamp: { type: "string", minLength: 1, maxLength: 32 },
        snapshotHash: identifierString,
        bids: { type: "array", maxItems: 20, items: levelSchema },
        asks: { type: "array", maxItems: 20, items: levelSchema },
        minimumOrderSize: decimalString,
        tickSize: decimalString,
        negativeRisk: { type: "boolean" },
        lastTradePrice: decimalString,
        observedAt: timestampString,
      }, [
        "market",
        "tokenId",
        "snapshotTimestamp",
        "snapshotHash",
        "bids",
        "asks",
        "minimumOrderSize",
        "tickSize",
        "negativeRisk",
        "lastTradePrice",
        "observedAt",
      ]),
      requiredScopes: [],
      requiresFreshness: true,
      freshnessMaxAgeMs: 10_000,
      timeoutMs: 10_000,
      simulationRequired: false,
      walletSubmissionOnly: true,
      agentMaySubmit: false,
    }],
  });
}

export function buildMatterhornFirstPartyTestnetManifests(
  options: MatterhornFirstPartyCryptoAppOptions,
): MatterhornCryptoAppManifest[] {
  return [suiManifest(options), hyperliquidManifest(options)];
}

export function firstPartyCryptoAppCapabilityBindings(
  manifests: readonly MatterhornCryptoAppManifest[],
): MatterhornCryptoAppCapabilityBinding[] {
  return manifests.flatMap((manifest) => manifest.actions.map((action) => {
    const proxyToolName = firstPartyCryptoAppProxyTool(manifest.appId, action.id);
    if (!proxyToolName) throw new Error("first_party_crypto_app_binding_missing");
    return {
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      actionId: action.id,
      proxyToolName,
    };
  }));
}
