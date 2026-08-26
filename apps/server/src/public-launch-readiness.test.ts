import { describe, expect, test } from "bun:test";
import { resolveProviderPrivacyPolicy } from "./provider-privacy.js";
import { evaluateMatterhornPublicLaunchReadiness } from "./public-launch-readiness.js";

const NOW = new Date("2026-08-26T00:00:00.000Z");

function launchEnvironment(): Record<string, string> {
  return {
    MATTERHORN_EMAIL_VERIFICATION_REQUIRED: "true",
    MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED: "true",
    MATTERHORN_TERMS_VERSION: "2026-08-11",
    MATTERHORN_PRIVACY_VERSION: "2026-08-11",
    MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard",
    MATTERHORN_MODEL_USAGE_DAILY_LIMIT: "250000",
    MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT: "2000000",
    MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT: "5000000",
    MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT: "50000000",
    MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS: "32000",
    MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only",
    MATTERHORN_CUDOS_TRAINING_USE: "opt-in-only",
    MATTERHORN_CUDOS_TRAINING_OPTED_IN: "false",
    MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY: "provider-policy",
    MATTERHORN_CUDOS_PRIVACY_POLICY_URL: "https://asi1.ai/legal/privacy",
    MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT: "2026-08-20T00:00:00.000Z",
    CUDOS_API_KEY: "cudos-key-long-enough",
    AWS_SES_CONFIGURATION_SET: "matterhorn-transactional",
    MATTERHORN_SES_EVENT_SECRET: "ses-event-secret-at-least-32-characters",
    MATTERHORN_APP_URL: "https://matterhorn.example",
    MATTERHORN_HOST_BACKUP_REQUIRED: "1",
    MATTERHORN_BACKUP_S3_BUCKET: "matterhorn-private-backups",
    MATTERHORN_BACKUP_KMS_KEY_ID: "alias/matterhorn-backups",
    MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID: "backup-access-key",
    MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY: "backup-secret-key",
    AWS_ACCESS_KEY_ID: "email-access-key",
    AWS_SECRET_ACCESS_KEY: "email-secret-key",
    MATTERHORN_SIGNUP_MAX_ACCOUNTS: "100",
  };
}

function evaluate(input?: {
  production?: boolean;
  env?: Record<string, string>;
  hostBackupFresh?: boolean;
  accountCount?: number;
}) {
  const env = input?.env ?? launchEnvironment();
  return evaluateMatterhornPublicLaunchReadiness({
    production: input?.production ?? true,
    env,
    emailConfig: {
      from: "updates@matterhorn.so",
      fromName: "Matterhorn Desks",
      awsSes: {
        region: "us-east-1",
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        configurationSetName: env.AWS_SES_CONFIGURATION_SET,
      },
    },
    turnstileReady: true,
    providerPolicy: resolveProviderPrivacyPolicy("cudos", "ASI:Cloud", env, NOW),
    hostBackupFresh: input?.hostBackupFresh ?? true,
    accountCount: input?.accountCount ?? 0,
  });
}

describe("public launch readiness", () => {
  test("requires every production launch boundary", () => {
    const result = evaluate();
    expect(result.ready).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  test("separates email delivery, events, and password-reset readiness", () => {
    const env = launchEnvironment();
    delete env.AWS_SES_CONFIGURATION_SET;
    delete env.MATTERHORN_APP_URL;
    const result = evaluate({ env });
    expect(result.checks.emailDelivery).toBe(true);
    expect(result.checks.emailEvents).toBe(false);
    expect(result.checks.emailTransport).toBe(false);
    expect(result.checks.appUrl).toBe(false);
    expect(result.checks.passwordReset).toBe(false);
    expect(result.ready).toBe(false);
  });

  test("requires a fresh backup with credentials isolated from SES", () => {
    const stale = evaluate({ hostBackupFresh: false });
    expect(stale.checks.backupConfiguration).toBe(true);
    expect(stale.checks.backupFresh).toBe(false);
    expect(stale.checks.backup).toBe(false);

    const sharedCredentials = launchEnvironment();
    sharedCredentials.MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID = sharedCredentials.AWS_ACCESS_KEY_ID;
    sharedCredentials.MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY = sharedCredentials.AWS_SECRET_ACCESS_KEY;
    const shared = evaluate({ env: sharedCredentials });
    expect(shared.checks.backupConfiguration).toBe(false);
    expect(shared.ready).toBe(false);
  });

  test("fails closed at the configured account capacity", () => {
    const result = evaluate({ accountCount: 100 });
    expect(result.checks.signupCapacity).toBe(false);
    expect(result.ready).toBe(false);
  });

  test("allows local console email and an HTTP app URL without weakening production", () => {
    const env = launchEnvironment();
    delete env.AWS_SES_CONFIGURATION_SET;
    env.MATTERHORN_APP_URL = "http://127.0.0.1:5173";
    const result = evaluateMatterhornPublicLaunchReadiness({
      production: false,
      env,
      emailConfig: { consoleMode: true },
      turnstileReady: false,
      providerPolicy: resolveProviderPrivacyPolicy("cudos", "ASI:Cloud", env, NOW),
      hostBackupFresh: false,
      accountCount: 0,
    });
    expect(result.checks.emailTransport).toBe(true);
    expect(result.checks.passwordReset).toBe(true);
    expect(result.ready).toBe(true);
  });
});
