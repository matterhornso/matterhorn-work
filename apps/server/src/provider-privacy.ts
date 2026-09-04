import type {
  MatterhornBackendModelProviderSummary,
  MatterhornProviderPrivacyEnforcementMode,
  MatterhornProviderPrivacyPolicy,
  MatterhornProviderPrivacySummary,
  MatterhornProviderTrainingUse,
} from "@matterhorn-work/types/backend-models";
import {
  hasRegisteredVenicePrivateModels,
  isRegisteredVenicePrivateModel,
  venicePrivateModelRegistryStatus,
  VENICE_PRIVACY_POLICY_URL,
  VENICE_PROVIDER_ID,
} from "./venice-provider.js";

type ProviderPrivacyEnvironment = Record<string, string | undefined>;

const LOCAL_PROVIDER_IDS = new Set(["ollama", "lmstudio", "local"]);
const MAX_POLICY_AGE_MS = 366 * 24 * 60 * 60 * 1_000;

function normalized(value: string | undefined): string {
  return value?.trim() ?? "";
}

function httpsUrl(value: string | undefined): string | null {
  const text = normalized(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function nonNegativeInteger(value: string | undefined): number | null {
  const text = normalized(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function currentVerificationDate(value: string | undefined, now: Date): string | null {
  const text = normalized(value);
  if (!text) return null;
  const parsed = new Date(text);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp)) return null;
  const age = now.getTime() - timestamp;
  if (age < 0 || age > MAX_POLICY_AGE_MS) return null;
  return parsed.toISOString();
}

export function providerPrivacyEnforcementMode(
  env: ProviderPrivacyEnvironment = process.env,
): MatterhornProviderPrivacyEnforcementMode {
  const signupsEnabled = new Set(["1", "true", "yes", "on"]).has(
    normalized(env.MATTERHORN_SIGNUPS_ENABLED).toLowerCase(),
  );
  return signupsEnabled ||
    normalized(env.MATTERHORN_PROVIDER_PRIVACY_MODE).toLowerCase() ===
      "verified-only"
    ? "verified_only"
    : "disclosure";
}

function cudosTrainingUse(
  env: ProviderPrivacyEnvironment,
): MatterhornProviderTrainingUse {
  const value = normalized(env.MATTERHORN_CUDOS_TRAINING_USE).toLowerCase();
  if (value === "none") return "none";
  if (value === "opt-in-only") return "opt_in_only";
  return "unknown";
}

function explicitlyDisabled(value: string | undefined): boolean {
  return new Set(["0", "false", "no", "off"]).has(
    normalized(value).toLowerCase(),
  );
}

export function resolveProviderPrivacyPolicy(
  providerId: string,
  providerName = providerId,
  env: ProviderPrivacyEnvironment = process.env,
  now = new Date(),
): MatterhornProviderPrivacyPolicy {
  const id = providerId.trim().toLowerCase();
  const suppliedName = providerName.trim();
  const name = id === "cudos" && suppliedName.toLowerCase() === "cudos"
    ? "ASI:Cloud"
    : suppliedName || providerId.trim() || "Model provider";
  const enforcementMode = providerPrivacyEnforcementMode(env);

  if (LOCAL_PROVIDER_IDS.has(id)) {
    return {
      providerId,
      providerName: name,
      status: "local_processing",
      trainingUse: "none",
      retentionDays: null,
      policyUrl: null,
      verifiedAt: null,
      allowed: true,
      label: "Processed locally",
      description:
        "This provider runs on the connected workspace runtime. Matterhorn does not send prompts to a hosted model provider.",
    };
  }

  if (id === VENICE_PROVIDER_ID && hasRegisteredVenicePrivateModels(now)) {
    const registry = venicePrivateModelRegistryStatus(now);
    return {
      providerId,
      providerName: suppliedName || "Venice Private",
      status: "verified_no_training",
      trainingUse: "none",
      retentionDays: 0,
      policyUrl: VENICE_PRIVACY_POLICY_URL,
      verifiedAt: registry.verifiedAt,
      verificationExpiresAt: registry.expiresAt,
      verifiedModelIds: registry.modelIds,
      allowed: true,
      label: "Private model · zero retention",
      description:
        "Matterhorn exposes only models that Venice currently labels private and tool-capable. Venice documents no prompt or response retention for private API models.",
    };
  }

  if (id === "cudos") {
    const trainingUse = cudosTrainingUse(env);
    const retentionDays = nonNegativeInteger(
      env.MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS,
    );
    const policyUrl = httpsUrl(env.MATTERHORN_CUDOS_PRIVACY_POLICY_URL);
    const verifiedAt = currentVerificationDate(
      env.MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT,
      now,
    );
    const fixedRetentionVerified =
      trainingUse === "none" &&
      retentionDays !== null &&
      policyUrl !== null &&
      verifiedAt !== null;
    const optInOnly = trainingUse === "opt_in_only";
    const providerPolicyRetention =
      normalized(env.MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY).toLowerCase() ===
      "provider-policy";
    const optInPolicyVerified =
      optInOnly &&
      explicitlyDisabled(env.MATTERHORN_CUDOS_TRAINING_OPTED_IN) &&
      providerPolicyRetention &&
      policyUrl !== null &&
      verifiedAt !== null;
    const verified = fixedRetentionVerified || optInPolicyVerified;

    return {
      providerId,
      providerName: name,
      status: fixedRetentionVerified
        ? "verified_no_training"
        : optInOnly
          ? "opt_in_training"
          : "unverified",
      trainingUse,
      retentionDays,
      policyUrl,
      verifiedAt,
      allowed: enforcementMode === "disclosure" || verified,
      label: verified
        ? optInPolicyVerified
          ? "Training opt-in disabled"
          : "No training verified"
        : optInOnly
          ? "Training requires provider opt-in"
          : "Provider policy not verified",
      description: optInPolicyVerified
        ? "Provider policy says customer prompts are not used for foundational-model training unless the provider account opts in; this deployment declares that opt-in disabled. Prompt retention follows the linked provider policy rather than a numeric API retention term."
        : fixedRetentionVerified
          ? `Provider terms prohibit training with customer prompts. Prompt retention is limited to ${retentionDays} day${retentionDays === 1 ? "" : "s"}.`
        : "Matterhorn has not verified this provider's training and prompt-retention terms for this deployment.",
    };
  }

  return {
    providerId,
    providerName: name,
    status: "unverified",
    trainingUse: "unknown",
    retentionDays: null,
    policyUrl: null,
    verifiedAt: null,
    allowed: enforcementMode === "disclosure",
    label: "Provider policy not verified",
    description:
      "Matterhorn has not verified this provider's training and prompt-retention terms for this deployment.",
  };
}

export function resolveModelProviderPrivacyPolicy(
  providerId: string,
  modelId: string,
  providerName = providerId,
  env: ProviderPrivacyEnvironment = process.env,
  now = new Date(),
): MatterhornProviderPrivacyPolicy {
  const policy = resolveProviderPrivacyPolicy(providerId, providerName, env, now);
  if (
    providerId.trim().toLowerCase() !== VENICE_PROVIDER_ID ||
    isRegisteredVenicePrivateModel(modelId, now)
  ) {
    return policy;
  }
  return {
    ...policy,
    status: "unverified",
    trainingUse: "unknown",
    retentionDays: null,
    verifiedAt: null,
    verificationExpiresAt: null,
    verifiedModelIds: [],
    allowed: false,
    label: "Model privacy not verified",
    description:
      "This model was not present in Matterhorn's verified Venice private-model registry and cannot receive prompts.",
  };
}

export function buildProviderPrivacySummary(
  providers: MatterhornBackendModelProviderSummary[],
  env: ProviderPrivacyEnvironment = process.env,
  now = new Date(),
): MatterhornProviderPrivacySummary {
  return {
    matterhornTrainingUse: "none",
    enforcementMode: providerPrivacyEnforcementMode(env),
    providers: providers.map((provider) =>
      resolveProviderPrivacyPolicy(provider.id, provider.name, env, now),
    ),
  };
}
