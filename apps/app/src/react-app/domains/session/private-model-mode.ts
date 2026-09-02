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
