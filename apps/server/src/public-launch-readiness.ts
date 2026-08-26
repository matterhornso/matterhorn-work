import {
  emailDeliveryConfigured,
  type EmailSendConfig,
} from "@matterhorn-work/email";
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";

type PublicLaunchEnvironment = Record<string, string | undefined>;

export type MatterhornPublicLaunchReadiness = {
  ready: boolean;
  checks: {
    emailVerification: boolean;
    legalAcceptance: boolean;
    legalVersions: boolean;
    modelUsage: boolean;
    turnstile: boolean;
    providerPrivacy: boolean;
    inference: boolean;
    emailDelivery: boolean;
    emailEvents: boolean;
    emailTransport: boolean;
    appUrl: boolean;
    passwordReset: boolean;
    backupConfiguration: boolean;
    backupFresh: boolean;
    backup: boolean;
    signupCapacity: boolean;
  };
};

function enabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function positiveInteger(value: string | undefined): number | null {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function appUrlReady(value: string | undefined, production: boolean): boolean {
  try {
    const protocol = new URL(value?.trim() ?? "").protocol;
    return protocol === "https:" || (!production && protocol === "http:");
  } catch {
    return false;
  }
}

function modelUsageReady(env: PublicLaunchEnvironment): boolean {
  const daily = positiveInteger(env.MATTERHORN_MODEL_USAGE_DAILY_LIMIT);
  const monthly = positiveInteger(env.MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT);
  const globalDaily = positiveInteger(env.MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT);
  const globalMonthly = positiveInteger(env.MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT);
  const reservation = positiveInteger(env.MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS);
  return env.MATTERHORN_MODEL_USAGE_ENFORCEMENT?.trim().toLowerCase() === "hard"
    && daily !== null
    && monthly !== null
    && monthly >= daily
    && globalDaily !== null
    && globalMonthly !== null
    && globalMonthly >= globalDaily
    && reservation !== null
    && reservation <= daily
    && reservation <= globalDaily;
}

function providerPrivacyReady(
  env: PublicLaunchEnvironment,
  policy: MatterhornProviderPrivacyPolicy,
): boolean {
  return env.MATTERHORN_PROVIDER_PRIVACY_MODE?.trim().toLowerCase() === "verified-only"
    && policy.allowed
    && policy.verifiedAt !== null;
}

function backupConfigurationReady(env: PublicLaunchEnvironment): boolean {
  const backupAccessKey = env.MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID?.trim() ?? "";
  const backupSecret = env.MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY?.trim() ?? "";
  const emailAccessKey = env.AWS_ACCESS_KEY_ID?.trim() ?? "";
  const emailSecret = env.AWS_SECRET_ACCESS_KEY?.trim() ?? "";
  return enabled(env.MATTERHORN_HOST_BACKUP_REQUIRED)
    && Boolean(env.MATTERHORN_BACKUP_S3_BUCKET?.trim())
    && Boolean(env.MATTERHORN_BACKUP_KMS_KEY_ID?.trim())
    && Boolean(backupAccessKey)
    && Boolean(backupSecret)
    && backupAccessKey !== emailAccessKey
    && backupSecret !== emailSecret;
}

export function evaluateMatterhornPublicLaunchReadiness(input: {
  production: boolean;
  env: PublicLaunchEnvironment;
  emailConfig: EmailSendConfig;
  turnstileReady: boolean;
  providerPolicy: MatterhornProviderPrivacyPolicy;
  hostBackupFresh: boolean;
  accountCount: number;
}): MatterhornPublicLaunchReadiness {
  const emailVerification = enabled(input.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED);
  const legalAcceptance = enabled(input.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED);
  const termsVersion = input.env.MATTERHORN_TERMS_VERSION?.trim() ?? "";
  const privacyVersion = input.env.MATTERHORN_PRIVACY_VERSION?.trim() ?? "";
  const legalVersions = Boolean(termsVersion && privacyVersion)
    && termsVersion.length <= 64
    && privacyVersion.length <= 64;
  const modelUsage = modelUsageReady(input.env);
  const providerPrivacy = providerPrivacyReady(input.env, input.providerPolicy);
  const inference = (input.env.CUDOS_API_KEY?.trim().length ?? 0) >= 16;
  const emailDelivery = emailDeliveryConfigured(input.emailConfig);
  const emailEvents = Boolean(
    input.env.AWS_SES_CONFIGURATION_SET?.trim()
      && (input.env.MATTERHORN_SES_EVENT_SECRET?.trim().length ?? 0) >= 32,
  );
  const emailTransport = emailDelivery && (!input.production || emailEvents);
  const appUrl = appUrlReady(input.env.MATTERHORN_APP_URL, input.production);
  const passwordReset = emailTransport && appUrl;
  const backupConfiguration = backupConfigurationReady(input.env);
  const backupFresh = input.hostBackupFresh;
  const backup = backupConfiguration && backupFresh;
  const configuredCapacity = positiveInteger(input.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS);
  const signupCapacity = configuredCapacity !== null
    && input.accountCount < configuredCapacity;
  const checks = {
    emailVerification,
    legalAcceptance,
    legalVersions,
    modelUsage,
    turnstile: input.turnstileReady,
    providerPrivacy,
    inference,
    emailDelivery,
    emailEvents,
    emailTransport,
    appUrl,
    passwordReset,
    backupConfiguration,
    backupFresh,
    backup,
    signupCapacity,
  };
  return {
    ready: !input.production || Object.values(checks).every(Boolean),
    checks,
  };
}
