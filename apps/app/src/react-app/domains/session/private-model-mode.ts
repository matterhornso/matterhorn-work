import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import type { ModelRef } from "../../../app/types";

export const MATTERHORN_PRIVATE_MODEL_PROVIDER_ID = "venice";

type PrivateModeProvider = {
  id?: string;
  models?: Record<string, unknown>;
};

export function privateModeModelFromProviders(
  providers: readonly PrivateModeProvider[],
  connectedProviderIds: readonly string[],
): ModelRef | null {
  const connected = new Set(
    connectedProviderIds.map((providerId) => providerId.trim().toLowerCase()),
  );
  if (!connected.has(MATTERHORN_PRIVATE_MODEL_PROVIDER_ID)) return null;
  const provider = providers.find(
    (candidate) => candidate.id?.trim().toLowerCase() === MATTERHORN_PRIVATE_MODEL_PROVIDER_ID,
  );
  const modelID = Object.keys(provider?.models ?? {}).find((id) => id.trim())?.trim();
  return modelID
    ? { providerID: MATTERHORN_PRIVATE_MODEL_PROVIDER_ID, modelID }
    : null;
}

export function standardModeModelFromProviders(
  providers: readonly PrivateModeProvider[],
  connectedProviderIds: readonly string[],
): ModelRef | null {
  const connected = new Set(
    connectedProviderIds.map((providerId) => providerId.trim().toLowerCase()),
  );
  for (const provider of providers) {
    const providerID = provider.id?.trim();
    if (
      !providerID ||
      providerID.toLowerCase() === MATTERHORN_PRIVATE_MODEL_PROVIDER_ID ||
      !connected.has(providerID.toLowerCase())
    ) {
      continue;
    }
    const modelID = Object.keys(provider.models ?? {}).find((id) => id.trim())?.trim();
    if (modelID) return { providerID, modelID };
  }
  return null;
}

export function isPrivateModeModel(model: ModelRef | null | undefined): boolean {
  return model?.providerID.trim().toLowerCase() === MATTERHORN_PRIVATE_MODEL_PROVIDER_ID;
}

/**
 * The provider list describes configured models, not their current privacy
 * assurance. Only the server's time-bounded policy proof may enable the
 * customer-facing Private mode claim.
 */
export function isVerifiedPrivateModePolicy(
  policy: MatterhornProviderPrivacyPolicy | null | undefined,
  model: ModelRef | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!Number.isFinite(nowMs) || nowMs < 0) return false;
  const modelId = model?.modelID.trim() ?? "";
  const verifiedAtMs = Date.parse(policy?.verifiedAt ?? "");
  const expiresAtMs = Date.parse(policy?.verificationExpiresAt ?? "");
  return policy?.providerId.trim().toLowerCase() === MATTERHORN_PRIVATE_MODEL_PROVIDER_ID
    && isPrivateModeModel(model)
    && Boolean(modelId)
    && policy.verifiedModelIds?.includes(modelId) === true
    && policy.status === "verified_no_training"
    && policy.trainingUse === "none"
    && policy.retentionDays === 0
    && policy.allowed === true
    && Number.isFinite(verifiedAtMs)
    && verifiedAtMs <= nowMs
    && Number.isFinite(expiresAtMs)
    && expiresAtMs > nowMs
    && expiresAtMs > verifiedAtMs;
}
