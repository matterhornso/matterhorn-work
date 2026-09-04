import {
  MATTERHORN_POLICY_DECISION_VERSION,
  type MatterhornCoworkerProfile,
  type MatterhornCryptoIntent,
  type MatterhornPolicyDecision,
  validateMatterhornCoworkerProfile,
  validateMatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";

import { sha256 } from "./guarded-runtime-crypto.js";
import { validateCryptoIntentIntegrity } from "./crypto-transaction-coordinator.js";

export const MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION =
  "matterhorn.transaction-policy-intersection.v1";

export type MatterhornTransactionPolicyScope =
  | "platform"
  | "organization"
  | "user"
  | "coworker"
  | "app"
  | "run"
  | "capability";

export type MatterhornTransactionPolicyLayer = {
  scope: MatterhornTransactionPolicyScope;
  id: string;
  subjectId: string;
  revision: string;
  state: "active" | "deny";
  allowedAppIds: string[] | null;
  allowedActionIds: string[] | null;
  allowedNetworks: string[] | null;
  allowedAssets: string[] | null;
  allowedRecipients: string[] | null;
  deniedRecipients: string[];
  blockedRegions: string[];
  allowPrepare: boolean;
  walletSubmissionOnly: true;
  limits: {
    perActionUsd: number | null;
    dailyUsd: number | null;
    weeklyUsd: number | null;
    maxSlippageBps: number | null;
    maxLeverage: number | null;
    minimumReserveUsd: number | null;
    maxTransactionsPerHour: number | null;
    maxTransactionsPerDay: number | null;
  };
  expiresAt: string | null;
};

export type MatterhornTransactionPolicyLayers = {
  platform: MatterhornTransactionPolicyLayer;
  organization: MatterhornTransactionPolicyLayer | null;
  user: MatterhornTransactionPolicyLayer;
  coworker: MatterhornTransactionPolicyLayer;
  app: MatterhornTransactionPolicyLayer;
  run: MatterhornTransactionPolicyLayer;
  capability: MatterhornTransactionPolicyLayer;
};

export type MatterhornResolvedTransactionPolicy = {
  version: typeof MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION;
  policyHash: string;
  layerHashes: Array<{ scope: MatterhornTransactionPolicyScope; hash: string }>;
  evaluatedPolicyHashes: string[];
  blockedReasonCodes: string[];
  allowedAppIds: string[] | null;
  allowedActionIds: string[] | null;
  allowedNetworks: string[] | null;
  allowedAssets: string[] | null;
  allowedRecipients: string[] | null;
  deniedRecipients: string[];
  blockedRegions: string[];
  allowPrepare: boolean;
  walletSubmissionOnly: true;
  limits: MatterhornTransactionPolicyLayer["limits"];
  earliestExpiry: string | null;
};

export type MatterhornTransactionExecutionFacts = {
  workspaceId: string;
  runId: string;
  coworkerId: string;
  notionalUsd: number | null;
  dailySpendUsdBefore: number;
  weeklySpendUsdBefore: number;
  projectedReserveUsd: number | null;
  leverage: number | null;
  transactionsLastHour: number;
  transactionsToday: number;
  regionCode: string | null;
  complianceAllowed: boolean;
  capability: {
    workspaceId: string;
    runId: string;
    coworkerId: string;
    appId: string;
    actionId: string;
    access: "prepare";
    useState: "consumed_once";
    expiresAt: string;
  };
};

export type MatterhornTransactionEconomicFacts = Omit<
  MatterhornTransactionExecutionFacts,
  "workspaceId" | "runId" | "coworkerId" | "capability"
>;

function finiteNonNegative(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function finitePositive(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

function normalizedValues(values: string[] | null): string[] | null {
  if (values === null) return null;
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
}

function validValues(values: string[] | null): boolean {
  return values === null || (values.length <= 256 && values.every((value) => {
    return Boolean(value.trim()) && value.length <= 512 && !/[\u0000-\u001F\u007F]/.test(value);
  }));
}

function validateLayer(layer: MatterhornTransactionPolicyLayer, expectedScope: MatterhornTransactionPolicyScope): void {
  if (layer.scope !== expectedScope
    || !layer.id.trim()
    || layer.id.length > 256
    || /[\u0000-\u001F\u007F]/.test(layer.id)
    || !layer.subjectId.trim()
    || layer.subjectId.length > 256
    || /[\u0000-\u001F\u007F]/.test(layer.subjectId)
    || !layer.revision.trim()
    || layer.revision.length > 128
    || (layer.state !== "active" && layer.state !== "deny")
    || layer.walletSubmissionOnly !== true
    || !validValues(layer.allowedAppIds)
    || !validValues(layer.allowedActionIds)
    || !validValues(layer.allowedNetworks)
    || !validValues(layer.allowedAssets)
    || !validValues(layer.allowedRecipients)
    || !validValues(layer.deniedRecipients)
    || !validValues(layer.blockedRegions)
    || !finiteNonNegative(layer.limits.perActionUsd)
    || !finiteNonNegative(layer.limits.dailyUsd)
    || !finiteNonNegative(layer.limits.weeklyUsd)
    || !finiteNonNegative(layer.limits.maxSlippageBps)
    || !finitePositive(layer.limits.maxLeverage)
    || !finiteNonNegative(layer.limits.minimumReserveUsd)
    || !finiteNonNegative(layer.limits.maxTransactionsPerHour)
    || !finiteNonNegative(layer.limits.maxTransactionsPerDay)
    || (layer.limits.maxSlippageBps !== null && !Number.isSafeInteger(layer.limits.maxSlippageBps))
    || (layer.limits.maxTransactionsPerHour !== null && !Number.isSafeInteger(layer.limits.maxTransactionsPerHour))
    || (layer.limits.maxTransactionsPerDay !== null && !Number.isSafeInteger(layer.limits.maxTransactionsPerDay))
    || (layer.expiresAt !== null && !Number.isFinite(Date.parse(layer.expiresAt)))) {
    throw new Error(`transaction_policy_layer_invalid:${expectedScope}`);
  }
}

function layerList(layers: MatterhornTransactionPolicyLayers): MatterhornTransactionPolicyLayer[] {
  return [
    layers.platform,
    ...(layers.organization === null ? [] : [layers.organization]),
    layers.user,
    layers.coworker,
    layers.app,
    layers.run,
    layers.capability,
  ];
}

function intersectLists(lists: Array<string[] | null>): string[] | null {
  const constrained = lists
    .map(normalizedValues)
    .filter((values): values is string[] => values !== null);
  if (constrained.length === 0) return null;
  const [first, ...rest] = constrained;
  return first.filter((value) => rest.every((list) => list.includes(value))).sort();
}

function minimumLimit(values: Array<number | null>): number | null {
  const configured = values.filter((value): value is number => value !== null);
  return configured.length === 0 ? null : Math.min(...configured);
}

function maximumFloor(values: Array<number | null>): number | null {
  const configured = values.filter((value): value is number => value !== null);
  return configured.length === 0 ? null : Math.max(...configured);
}

export function coworkerTransactionPolicyLayer(
  profile: MatterhornCoworkerProfile,
): MatterhornTransactionPolicyLayer {
  if (validateMatterhornCoworkerProfile(profile).length > 0) {
    throw new Error("transaction_policy_coworker_invalid");
  }
  return {
    scope: "coworker",
    id: profile.id,
    subjectId: profile.id,
    revision: `${profile.policyVersion}:${profile.revision}`,
    state: profile.state === "active" ? "active" : "deny",
    allowedAppIds: [...profile.allowedAppIds],
    allowedActionIds: [...profile.allowedActionIds],
    allowedNetworks: [...profile.allowedNetworks],
    allowedAssets: [...profile.allowedAssets],
    allowedRecipients: null,
    deniedRecipients: [],
    blockedRegions: [],
    allowPrepare: profile.automaticAuthorities.includes("prepare")
      && profile.limits.maxPrepareCallsPerFamily > 0,
    walletSubmissionOnly: true,
    limits: {
      perActionUsd: profile.limits.perActionUsd,
      dailyUsd: profile.limits.dailyUsd,
      weeklyUsd: profile.limits.weeklyUsd,
      maxSlippageBps: profile.limits.maxSlippageBps,
      maxLeverage: profile.limits.maxLeverage,
      minimumReserveUsd: profile.limits.minimumReserveUsd,
      maxTransactionsPerHour: null,
      maxTransactionsPerDay: null,
    },
    expiresAt: null,
  };
}

export function resolveMatterhornTransactionPolicy(
  layers: MatterhornTransactionPolicyLayers,
  now = new Date(),
): MatterhornResolvedTransactionPolicy {
  validateLayer(layers.platform, "platform");
  if (layers.organization !== null) validateLayer(layers.organization, "organization");
  validateLayer(layers.user, "user");
  validateLayer(layers.coworker, "coworker");
  validateLayer(layers.app, "app");
  validateLayer(layers.run, "run");
  validateLayer(layers.capability, "capability");
  const orderedLayers = layerList(layers);
  const blockedReasonCodes: string[] = [];
  if (orderedLayers.some((layer) => layer.state === "deny")) blockedReasonCodes.push("policy_layer_denied");
  if (orderedLayers.some((layer) => layer.expiresAt !== null && Date.parse(layer.expiresAt) <= now.getTime())) {
    blockedReasonCodes.push("policy_layer_expired");
  }
  const limits = {
    perActionUsd: minimumLimit(orderedLayers.map((layer) => layer.limits.perActionUsd)),
    dailyUsd: minimumLimit(orderedLayers.map((layer) => layer.limits.dailyUsd)),
    weeklyUsd: minimumLimit(orderedLayers.map((layer) => layer.limits.weeklyUsd)),
    maxSlippageBps: minimumLimit(orderedLayers.map((layer) => layer.limits.maxSlippageBps)),
    maxLeverage: minimumLimit(orderedLayers.map((layer) => layer.limits.maxLeverage)),
    minimumReserveUsd: maximumFloor(orderedLayers.map((layer) => layer.limits.minimumReserveUsd)),
    maxTransactionsPerHour: minimumLimit(orderedLayers.map((layer) => layer.limits.maxTransactionsPerHour)),
    maxTransactionsPerDay: minimumLimit(orderedLayers.map((layer) => layer.limits.maxTransactionsPerDay)),
  };
  const effective: Omit<
    MatterhornResolvedTransactionPolicy,
    "version" | "policyHash" | "layerHashes" | "evaluatedPolicyHashes" | "blockedReasonCodes"
  > = {
    allowedAppIds: intersectLists(orderedLayers.map((layer) => layer.allowedAppIds)),
    allowedActionIds: intersectLists(orderedLayers.map((layer) => layer.allowedActionIds)),
    allowedNetworks: intersectLists(orderedLayers.map((layer) => layer.allowedNetworks)),
    allowedAssets: intersectLists(orderedLayers.map((layer) => layer.allowedAssets)),
    allowedRecipients: intersectLists(orderedLayers.map((layer) => layer.allowedRecipients)),
    deniedRecipients: [...new Set(orderedLayers.flatMap((layer) => {
      return normalizedValues(layer.deniedRecipients) ?? [];
    }))].sort(),
    blockedRegions: [...new Set(orderedLayers.flatMap((layer) => {
      return normalizedValues(layer.blockedRegions) ?? [];
    }))].sort(),
    allowPrepare: orderedLayers.every((layer) => layer.allowPrepare),
    walletSubmissionOnly: true,
    limits,
    earliestExpiry: orderedLayers.reduce<string | null>((earliest, layer) => {
      if (layer.expiresAt === null) return earliest;
      if (earliest === null || Date.parse(layer.expiresAt) < Date.parse(earliest)) return layer.expiresAt;
      return earliest;
    }, null),
  };
  if (!effective.allowPrepare) blockedReasonCodes.push("policy_prepare_denied");
  const effectiveBlockedReasons = [...new Set(blockedReasonCodes)].sort();
  const layerHashes = orderedLayers.map((layer) => sha256(layer));
  const scopedLayerHashes = orderedLayers.map((layer, index) => ({
    scope: layer.scope,
    hash: layerHashes[index],
  }));
  const material = {
    version: MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION,
    layers: scopedLayerHashes,
    blockedReasonCodes: effectiveBlockedReasons,
    effective,
  };
  const policyHash = sha256(material);
  return {
    version: MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION,
    policyHash,
    layerHashes: scopedLayerHashes,
    evaluatedPolicyHashes: [policyHash, ...layerHashes],
    blockedReasonCodes: effectiveBlockedReasons,
    ...effective,
  };
}

export function validateResolvedTransactionPolicyIntegrity(
  policy: MatterhornResolvedTransactionPolicy,
): boolean {
  const scopes = policy.layerHashes.map((layer) => layer.scope);
  const requiredScopes: MatterhornTransactionPolicyScope[] = [
    "platform",
    "user",
    "coworker",
    "app",
    "run",
    "capability",
  ];
  const effective = {
    allowedAppIds: policy.allowedAppIds,
    allowedActionIds: policy.allowedActionIds,
    allowedNetworks: policy.allowedNetworks,
    allowedAssets: policy.allowedAssets,
    allowedRecipients: policy.allowedRecipients,
    deniedRecipients: policy.deniedRecipients,
    blockedRegions: policy.blockedRegions,
    allowPrepare: policy.allowPrepare,
    walletSubmissionOnly: policy.walletSubmissionOnly,
    limits: policy.limits,
    earliestExpiry: policy.earliestExpiry,
  };
  const expectedHash = sha256({
    version: MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION,
    layers: policy.layerHashes,
    blockedReasonCodes: policy.blockedReasonCodes,
    effective,
  });
  return policy.version === MATTERHORN_TRANSACTION_POLICY_INTERSECTION_VERSION
    && policy.layerHashes.length >= 6
    && policy.layerHashes.length <= 7
    && new Set(scopes).size === scopes.length
    && requiredScopes.every((scope) => scopes.includes(scope))
    && scopes.every((scope) => requiredScopes.includes(scope) || scope === "organization")
    && policy.layerHashes.every((layer) => /^[a-f0-9]{64}$/.test(layer.hash))
    && policy.evaluatedPolicyHashes.length === policy.layerHashes.length + 1
    && policy.evaluatedPolicyHashes[0] === policy.policyHash
    && policy.layerHashes.every((layer, index) => policy.evaluatedPolicyHashes[index + 1] === layer.hash)
    && expectedHash === policy.policyHash;
}

function includesAllowed(allowed: string[] | null, value: string | null): boolean {
  if (allowed === null) return true;
  if (value === null) return false;
  return allowed.includes(value.trim().toLowerCase());
}

export function evaluateMatterhornPreparePolicyPreflight(input: {
  policy: MatterhornResolvedTransactionPolicy;
  appId: string;
  actionId: string;
  network: string;
  now?: Date;
}): { allowed: boolean; reasonCodes: string[] } {
  const reasons = [...input.policy.blockedReasonCodes];
  const now = input.now ?? new Date();
  if (!validateResolvedTransactionPolicyIntegrity(input.policy)) reasons.push("policy_integrity_invalid");
  if (!includesAllowed(input.policy.allowedAppIds, input.appId)) reasons.push("policy_app_denied");
  if (!includesAllowed(input.policy.allowedActionIds, input.actionId)) reasons.push("policy_action_denied");
  if (!includesAllowed(input.policy.allowedNetworks, input.network)) reasons.push("policy_network_denied");
  if (!input.policy.allowPrepare) reasons.push("policy_prepare_denied");
  if (!input.policy.walletSubmissionOnly) reasons.push("policy_wallet_boundary_invalid");
  if (input.policy.earliestExpiry !== null && Date.parse(input.policy.earliestExpiry) <= now.getTime()) {
    reasons.push("policy_expired");
  }
  const reasonCodes = [...new Set(reasons)].sort();
  return { allowed: reasonCodes.length === 0, reasonCodes };
}

function safeNumber(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeCount(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function appendLimit(
  limits: MatterhornPolicyDecision["limits"],
  reasons: string[],
  name: string,
  configured: number | null,
  observed: number | null,
  passes: (configuredValue: number, observedValue: number) => boolean,
): void {
  if (configured === null) return;
  const passed = observed !== null && passes(configured, observed);
  limits.push({
    name,
    configured: String(configured),
    observed: observed === null ? "unavailable" : String(observed),
    passed,
  });
  if (!passed) reasons.push(`policy_${name}_exceeded`);
}

export function evaluateMatterhornCryptoIntentPolicy(input: {
  intent: MatterhornCryptoIntent;
  policy: MatterhornResolvedTransactionPolicy;
  facts: MatterhornTransactionExecutionFacts;
  now?: Date;
}): MatterhornPolicyDecision {
  const now = input.now ?? new Date();
  const preflight = evaluateMatterhornPreparePolicyPreflight({
    policy: input.policy,
    appId: input.intent.appId,
    actionId: input.intent.actionId,
    network: input.intent.network,
    now,
  });
  const reasons = [...preflight.reasonCodes];
  const limits: MatterhornPolicyDecision["limits"] = [];
  if (validateCryptoIntentIntegrity(input.intent).length > 0) reasons.push("policy_intent_invalid");
  if (input.intent.policyHash !== input.policy.policyHash) reasons.push("policy_hash_mismatch");
  if (input.intent.workspaceId !== input.facts.workspaceId
    || input.intent.runId !== input.facts.runId
    || input.intent.coworkerId !== input.facts.coworkerId) {
    reasons.push("policy_tenant_or_run_mismatch");
  }
  if (!includesAllowed(input.policy.allowedAssets, input.intent.asset)) reasons.push("policy_asset_denied");
  if (!includesAllowed(input.policy.allowedRecipients, input.intent.recipient)) reasons.push("policy_recipient_not_allowed");
  const recipient = input.intent.recipient?.trim().toLowerCase() ?? null;
  if (recipient !== null && input.policy.deniedRecipients.includes(recipient)) reasons.push("policy_recipient_denied");
  const regionCode = input.facts.regionCode?.trim().toLowerCase() ?? null;
  if (regionCode !== null && !/^[a-z]{2}$/.test(regionCode)) reasons.push("policy_region_invalid");
  if (regionCode === null && input.policy.blockedRegions.length > 0) reasons.push("policy_region_unknown");
  if (regionCode !== null && input.policy.blockedRegions.includes(regionCode)) reasons.push("policy_region_denied");
  if (!input.facts.complianceAllowed) reasons.push("policy_compliance_denied");
  if (input.intent.capabilityClass !== "wallet_review_only") {
    reasons.push("policy_wallet_boundary_invalid");
  }
  if (Date.parse(input.intent.expiresAt) <= now.getTime()) {
    reasons.push("policy_expired");
  }
  const capability = input.facts.capability;
  if (capability.workspaceId !== input.intent.workspaceId
    || capability.runId !== input.intent.runId
    || capability.coworkerId !== input.intent.coworkerId
    || capability.appId !== input.intent.appId
    || capability.actionId !== input.intent.actionId
    || capability.access !== "prepare") {
    reasons.push("policy_capability_binding_mismatch");
  }
  if (capability.useState !== "consumed_once"
    || !Number.isFinite(Date.parse(capability.expiresAt))
    || Date.parse(capability.expiresAt) <= now.getTime()) {
    reasons.push("policy_capability_unavailable");
  }
  const notionalUsd = safeNumber(input.facts.notionalUsd);
  const dailySpend = safeNumber(input.facts.dailySpendUsdBefore);
  const weeklySpend = safeNumber(input.facts.weeklySpendUsdBefore);
  const projectedReserve = safeNumber(input.facts.projectedReserveUsd);
  const leverage = safeNumber(input.facts.leverage);
  const transactionsLastHour = safeCount(input.facts.transactionsLastHour);
  const transactionsToday = safeCount(input.facts.transactionsToday);
  appendLimit(limits, reasons, "per_action_usd", input.policy.limits.perActionUsd, notionalUsd,
    (configured, observed) => observed <= configured);
  appendLimit(limits, reasons, "daily_usd", input.policy.limits.dailyUsd,
    notionalUsd === null || dailySpend === null ? null : dailySpend + notionalUsd,
    (configured, observed) => observed <= configured);
  appendLimit(limits, reasons, "weekly_usd", input.policy.limits.weeklyUsd,
    notionalUsd === null || weeklySpend === null ? null : weeklySpend + notionalUsd,
    (configured, observed) => observed <= configured);
  if (input.intent.slippageBps !== null) {
    appendLimit(limits, reasons, "max_slippage_bps", input.policy.limits.maxSlippageBps,
      input.intent.slippageBps, (configured, observed) => observed <= configured);
  }
  if (input.intent.protocol === "hyperliquid") {
    appendLimit(limits, reasons, "max_leverage", input.policy.limits.maxLeverage, leverage,
      (configured, observed) => observed <= configured);
  }
  if (input.policy.limits.minimumReserveUsd !== 0) {
    appendLimit(limits, reasons, "minimum_reserve_usd", input.policy.limits.minimumReserveUsd,
      projectedReserve, (configured, observed) => observed >= configured);
  }
  appendLimit(limits, reasons, "max_transactions_per_hour", input.policy.limits.maxTransactionsPerHour,
    transactionsLastHour === null ? null : transactionsLastHour + 1,
    (configured, observed) => observed <= configured);
  appendLimit(limits, reasons, "max_transactions_per_day", input.policy.limits.maxTransactionsPerDay,
    transactionsToday === null ? null : transactionsToday + 1,
    (configured, observed) => observed <= configured);
  const uniqueReasons = [...new Set(reasons)].sort();
  const decision: MatterhornPolicyDecision = {
    version: MATTERHORN_POLICY_DECISION_VERSION,
    runId: input.intent.runId,
    intentHash: input.intent.intentHash,
    decision: uniqueReasons.length > 0 ? "deny" : "wallet_review_required",
    reasonCodes: uniqueReasons.length > 0 ? uniqueReasons : ["wallet_review_required"],
    evaluatedPolicyHashes: [...input.policy.evaluatedPolicyHashes],
    evaluatedAt: now.toISOString(),
    limits,
  };
  const issues = validateMatterhornPolicyDecision(decision);
  if (issues.length > 0) throw new Error(`transaction_policy_decision_invalid:${issues.join(",")}`);
  return decision;
}
