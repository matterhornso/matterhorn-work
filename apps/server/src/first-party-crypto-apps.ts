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
    manifestRevision: "1.0.0",
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
