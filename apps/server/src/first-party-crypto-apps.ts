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

function signedManifest(
  options: MatterhornFirstPartyCryptoAppOptions,
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
