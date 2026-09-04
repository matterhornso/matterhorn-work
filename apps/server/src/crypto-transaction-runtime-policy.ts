import type {
  MatterhornCryptoAppResult,
  MatterhornCryptoIntent,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentJurisdictionPolicyContext } from "@matterhorn-work/types/guarded-agent-runtime";
import type { MatterhornWalletSafetyPolicy } from "@matterhorn-work/types/wallet-safety-policy";

import type { MatterhornPendingCryptoIntent } from "./crypto-pending-intent-store.js";
import type {
  MatterhornTransactionEconomicFacts,
  MatterhornTransactionPolicyLayer,
  MatterhornTransactionPolicyLayers,
  MatterhornTransactionPolicyScope,
} from "./crypto-transaction-policy.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import {
  MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH,
  MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION,
} from "./polymarket-jurisdiction-policy.js";

type NonCoworkerPolicyLayers = Omit<MatterhornTransactionPolicyLayers, "coworker">;

type PolicyInput = {
  workspaceId: string;
  ownerId: string;
  organizationId: string | null;
  appId: string;
  actionId: string;
  network: string;
  runId: string;
  callId: string;
  walletPolicy: MatterhornWalletSafetyPolicy;
  now?: Date;
};

type FactsInput = {
  adapterResult: MatterhornCryptoAppResult;
  intent: MatterhornCryptoIntent;
  existingIntents: readonly MatterhornPendingCryptoIntent[];
  jurisdictionPolicy?: MatterhornAgentJurisdictionPolicyContext | null;
  now?: Date;
};

const ACTIVE_BUDGET_STATES = new Set(["wallet_review", "wallet_approved", "submitted", "confirmed"]);
const BITTENSOR_TESTNET_PREPARE_ACTIONS = new Set([
  "bittensor_prepare_transfer",
  "bittensor_prepare_stake",
  "bittensor_prepare_unstake",
]);

function limits(input: Partial<MatterhornTransactionPolicyLayer["limits"]> = {}): MatterhornTransactionPolicyLayer["limits"] {
  return {
    perActionUsd: null,
    dailyUsd: null,
    weeklyUsd: null,
    maxSlippageBps: null,
    maxLeverage: null,
    minimumReserveUsd: null,
    maxTransactionsPerHour: null,
    maxTransactionsPerDay: null,
    ...input,
  };
}

function layer(input: {
  scope: MatterhornTransactionPolicyScope;
  id: string;
  subjectId: string;
  revision: string;
  appId: string;
  actionId: string;
  network: string;
  state?: "active" | "deny";
  allowedAssets?: string[] | null;
  limits?: Partial<MatterhornTransactionPolicyLayer["limits"]>;
  expiresAt?: string | null;
}): MatterhornTransactionPolicyLayer {
  return {
    scope: input.scope,
    id: input.id,
    subjectId: input.subjectId,
    revision: input.revision,
    state: input.state ?? "active",
    allowedAppIds: [input.appId],
    allowedActionIds: [input.actionId],
    allowedNetworks: [input.network],
    allowedAssets: input.allowedAssets ?? null,
    allowedRecipients: null,
    deniedRecipients: [],
    blockedRegions: [],
    allowPrepare: true,
    walletSubmissionOnly: true,
    limits: limits(input.limits),
    expiresAt: input.expiresAt ?? null,
  };
}

function supportedFirstPartyAction(input: Pick<PolicyInput, "appId" | "actionId" | "network">): boolean {
  return (input.appId === "matterhorn.sui-testnet"
      && input.actionId === "sui_transfer_preview"
      && input.network === "sui:testnet")
    || (input.appId === "matterhorn.hyperliquid-testnet"
      && input.actionId === "hyperliquid_preview_order"
      && input.network === "hyperliquid:testnet")
    || (input.appId === "matterhorn.bittensor-testnet"
      && BITTENSOR_TESTNET_PREPARE_ACTIONS.has(input.actionId)
      && input.network === "bittensor:test")
    || (input.appId === "matterhorn.polymarket-wallet-preview"
      && input.actionId === "polymarket_preview_order"
      && input.network === "polymarket:polygon");
}

function certifiedTestNetwork(input: Pick<PolicyInput, "appId" | "network">): boolean {
  return (input.appId === "matterhorn.sui-testnet" && input.network === "sui:testnet")
    || (input.appId === "matterhorn.hyperliquid-testnet" && input.network === "hyperliquid:testnet")
    || (input.appId === "matterhorn.bittensor-testnet" && input.network === "bittensor:test");
}

/**
 * Builds the server-owned layers used by the transaction airlock. Callers may
 * narrow these policies through the coworker profile, but no client or model
 * field can broaden them.
 */
export function buildMatterhornRuntimeTransactionPolicyLayers(input: PolicyInput): NonCoworkerPolicyLayers {
  const now = input.now ?? new Date();
  const exactActionSupported = supportedFirstPartyAction(input);
  const revision = sha256({
    version: input.walletPolicy.version,
    updatedAt: input.walletPolicy.updatedAt,
    workspaceId: input.workspaceId,
  });
  const common = {
    appId: input.appId,
    actionId: input.actionId,
    network: input.network,
  };
  const appAssets = input.appId === "matterhorn.sui-testnet"
    ? ["SUI"]
    : input.appId === "matterhorn.bittensor-testnet" ? ["TAO"] : null;
  const mainnetDenied = !input.walletPolicy.mainnetEnabled && !certifiedTestNetwork(input);
  return {
    platform: layer({
      ...common,
      scope: "platform",
      id: "matterhorn_crypto_wallet_boundary",
      subjectId: "matterhorn",
      revision: "wallet-only-v1",
      state: exactActionSupported && !mainnetDenied ? "active" : "deny",
      allowedAssets: appAssets,
      limits: {
        maxSlippageBps: 1_000,
        maxTransactionsPerHour: 20,
        maxTransactionsPerDay: 100,
      },
    }),
    organization: input.organizationId ? layer({
      ...common,
      scope: "organization",
      id: `organization_${sha256(input.organizationId).slice(0, 24)}`,
      subjectId: input.organizationId,
      revision,
    }) : null,
    user: layer({
      ...common,
      scope: "user",
      id: `wallet_policy_${sha256(input.ownerId).slice(0, 24)}`,
      subjectId: input.ownerId,
      revision,
      limits: {
        perActionUsd: input.walletPolicy.maxPerTransactionUSD,
        dailyUsd: input.walletPolicy.maxDailySpendUSD,
        maxSlippageBps: input.walletPolicy.maxSlippageBps,
      },
    }),
    app: layer({
      ...common,
      scope: "app",
      id: `certified_app_${sha256(input.appId).slice(0, 24)}`,
      subjectId: input.appId,
      revision: "certified-action-v1",
      allowedAssets: appAssets,
    }),
    run: layer({
      ...common,
      scope: "run",
      id: `run_${sha256(input.runId).slice(0, 24)}`,
      subjectId: input.runId,
      revision: "single-run-v1",
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    }),
    capability: layer({
      ...common,
      scope: "capability",
      id: `call_${sha256(input.callId).slice(0, 24)}`,
      subjectId: input.callId,
      revision: "single-use-v1",
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    }),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNonNegative(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000001);
}

function recordedNotional(intent: MatterhornPendingCryptoIntent): number | null {
  const observation = intent.policyDecision.limits.find((item) => item.name === "per_action_usd")?.observed;
  return finiteNonNegative(observation);
}

function historyFacts(
  existingIntents: readonly MatterhornPendingCryptoIntent[],
  now: Date,
): Pick<MatterhornTransactionEconomicFacts,
  "dailySpendUsdBefore" | "weeklySpendUsdBefore" | "transactionsLastHour" | "transactionsToday"> {
  let dailySpendUsdBefore = 0;
  let weeklySpendUsdBefore = 0;
  let transactionsLastHour = 0;
  let transactionsToday = 0;
  for (const item of existingIntents) {
    if (!ACTIVE_BUDGET_STATES.has(item.state)) continue;
    const createdAt = Date.parse(item.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > now.getTime()) continue;
    const ageMs = now.getTime() - createdAt;
    const notionalUsd = recordedNotional(item);
    if (ageMs <= 7 * 24 * 60 * 60_000 && notionalUsd !== null) weeklySpendUsdBefore += notionalUsd;
    if (ageMs <= 24 * 60 * 60_000) {
      transactionsToday += 1;
      if (notionalUsd !== null) dailySpendUsdBefore += notionalUsd;
    }
    if (ageMs <= 60 * 60_000) transactionsLastHour += 1;
  }
  return { dailySpendUsdBefore, weeklySpendUsdBefore, transactionsLastHour, transactionsToday };
}

function currentPolymarketJurisdictionAllows(
  context: MatterhornAgentJurisdictionPolicyContext | null | undefined,
  now: Date,
): boolean {
  return Boolean(context
    && context.policyVersion === MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION
    && context.policyHash === MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH
    && context.polymarketOpenPositionAllowed === true
    && /^[a-f0-9]{64}$/.test(context.evidenceHash)
    && /^[a-f0-9]{64}$/.test(context.decisionHash)
    && Number.isFinite(Date.parse(context.validUntil))
    && Date.parse(context.validUntil) > now.getTime());
}

/**
 * Resolves only deterministic facts emitted by the pinned first-party
 * executors. Missing, contradictory, or third-party facts remain unavailable,
 * causing any configured economic limit to fail closed.
 */
export function resolveMatterhornRuntimeTransactionFacts(input: FactsInput): MatterhornTransactionEconomicFacts {
  const now = input.now ?? new Date();
  const result = record(input.adapterResult.result);
  let notionalUsd: number | null = null;
  let projectedReserveUsd: number | null = null;
  let leverage: number | null = null;
  if (result
    && input.intent.appId === "matterhorn.sui-testnet"
    && input.intent.actionId === "sui_transfer_preview"
    && input.intent.network === "sui:testnet") {
    // Sui testnet assets have no cash value. A positive reserve requirement
    // still fails closed because no trusted USD reserve fact exists.
    notionalUsd = 0;
  } else if (result
    && input.intent.appId === "matterhorn.bittensor-testnet"
    && BITTENSOR_TESTNET_PREPARE_ACTIONS.has(input.intent.actionId)
    && input.intent.network === "bittensor:test") {
    // Testnet TAO has no cash value. As with Sui testnet, reserve limits still
    // fail closed because this boundary does not invent a trusted USD reserve.
    notionalUsd = 0;
  } else if (result
    && input.intent.appId === "matterhorn.hyperliquid-testnet"
    && input.intent.actionId === "hyperliquid_preview_order"
    && input.intent.network === "hyperliquid:testnet") {
    const size = finiteNonNegative(result.size);
    const limitPrice = finiteNonNegative(result.limitPrice);
    const reportedNotional = finiteNonNegative(result.notionalUsd);
    const accountValue = finiteNonNegative(result.accountValueUsd);
    const marginUsed = finiteNonNegative(result.marginUsedUsd);
    const reportedReserve = finiteNonNegative(result.projectedReserveUsd);
    const reportedLeverage = finiteNonNegative(result.effectiveLeverage);
    const reduceOnly = result.reduceOnly === true;
    if (size !== null && limitPrice !== null && reportedNotional !== null
      && accountValue !== null && marginUsed !== null && reportedReserve !== null
      && reportedLeverage !== null && reportedLeverage > 0) {
      const computedNotional = size * limitPrice;
      const computedReserve = Math.max(0, accountValue - marginUsed - (reduceOnly ? 0 : computedNotional));
      if (approximatelyEqual(reportedNotional, computedNotional)
        && approximatelyEqual(reportedReserve, computedReserve)) {
        notionalUsd = reportedNotional;
        projectedReserveUsd = reportedReserve;
        leverage = reportedLeverage;
      }
    }
  } else if (result
    && input.intent.appId === "matterhorn.polymarket-wallet-preview"
    && input.intent.actionId === "polymarket_preview_order"
    && input.intent.network === "polymarket:polygon") {
    const side = result.side;
    const maximumSpend = finiteNonNegative(result.maximumSpendUsdc);
    const estimatedProceeds = finiteNonNegative(result.estimatedProceedsUsdc);
    const requestedShares = finiteNonNegative(result.amountShares);
    const requestedUsdc = finiteNonNegative(result.amountUsdc);
    if (side === "buy"
      && maximumSpend !== null
      && requestedUsdc !== null
      && approximatelyEqual(maximumSpend, requestedUsdc)) {
      notionalUsd = maximumSpend;
    } else if (side === "sell"
      && estimatedProceeds !== null
      && requestedShares !== null
      && estimatedProceeds > 0) {
      // Counting expected sale proceeds against the per-action and daily
      // limits is conservative and avoids granting unbounded financial value
      // to a sell action merely because it does not spend collateral.
      notionalUsd = estimatedProceeds;
    }
  }
  const supported = supportedFirstPartyAction({
    appId: input.intent.appId,
    actionId: input.intent.actionId,
    network: input.intent.network,
  });
  const jurisdictionAllowed = input.intent.protocol !== "polymarket"
    || currentPolymarketJurisdictionAllows(input.jurisdictionPolicy, now);
  return {
    notionalUsd,
    ...historyFacts(input.existingIntents, now),
    projectedReserveUsd,
    leverage,
    regionCode: null,
    complianceAllowed: supported && jurisdictionAllowed,
  };
}
