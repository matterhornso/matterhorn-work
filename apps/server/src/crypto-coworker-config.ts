export type MatterhornCryptoAppGatewayMode = "off" | "shadow" | "enforce";
export type MatterhornCoworkerMode = "off" | "internal" | "invite" | "public";
export type MatterhornWalrusEvidenceMode = "off" | "testnet" | "mainnet";

export type MatterhornCryptoCoworkerFeatureConfig = {
  cryptoAppGatewayMode: MatterhornCryptoAppGatewayMode;
  coworkerMode: MatterhornCoworkerMode;
  walrusEvidenceMode: MatterhornWalrusEvidenceMode;
  ready: boolean;
  issues: string[];
};

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function cryptoAppGatewayMode(value: string | undefined, issues: string[]): MatterhornCryptoAppGatewayMode {
  const mode = normalized(value);
  if (!mode || mode === "off") return "off";
  if (mode === "shadow" || mode === "enforce") return mode;
  issues.push("crypto_app_gateway_mode_invalid");
  return "off";
}

function coworkerMode(value: string | undefined, issues: string[]): MatterhornCoworkerMode {
  const mode = normalized(value);
  if (!mode || mode === "off") return "off";
  if (mode === "internal" || mode === "invite" || mode === "public") return mode;
  issues.push("coworker_mode_invalid");
  return "off";
}

function walrusEvidenceMode(value: string | undefined, issues: string[]): MatterhornWalrusEvidenceMode {
  const mode = normalized(value);
  if (!mode || mode === "off") return "off";
  if (mode === "testnet" || mode === "mainnet") return mode;
  issues.push("walrus_evidence_mode_invalid");
  return "off";
}

function isHttpsOrigin(value: string | undefined): boolean {
  const origin = value?.trim() ?? "";
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/**
 * Phase 0 configuration only. No runtime path consumes these switches yet.
 * Unknown values resolve to `off` and make readiness false so future rollout
 * cannot accidentally enable a partially configured security boundary.
 */
export function cryptoCoworkerFeatureConfig(
  env: NodeJS.ProcessEnv = process.env,
): MatterhornCryptoCoworkerFeatureConfig {
  const issues: string[] = [];
  const gatewayMode = cryptoAppGatewayMode(env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE, issues);
  const runtimeMode = normalized(env.MATTERHORN_GUARDED_RUNTIME_MODE) || "off";
  const workers = coworkerMode(env.MATTERHORN_COWORKER_MODE, issues);
  const evidence = walrusEvidenceMode(env.MATTERHORN_WALRUS_EVIDENCE_MODE, issues);

  if (gatewayMode === "enforce" && runtimeMode !== "enforce") {
    issues.push("crypto_app_gateway_requires_guarded_enforcement");
  }
  if ((workers === "invite" || workers === "public") && gatewayMode !== "enforce") {
    issues.push("coworker_rollout_requires_enforced_gateway");
  }
  if (workers === "public" && normalized(env.MATTERHORN_SIGNUPS_ENABLED) !== "true") {
    issues.push("public_coworkers_require_signups");
  }
  if (evidence !== "off") {
    if (!isHttpsOrigin(env.MATTERHORN_WALRUS_PUBLISHER_URL)) issues.push("walrus_publisher_https_required");
    if (!env.MATTERHORN_WALRUS_ENCRYPTION_KEY_ID?.trim()) issues.push("walrus_encryption_key_id_required");
  }
  if (evidence === "mainnet" && normalized(env.MATTERHORN_WALRUS_MAINNET_ACKNOWLEDGED) !== "true") {
    issues.push("walrus_mainnet_acknowledgement_required");
  }

  return {
    cryptoAppGatewayMode: gatewayMode,
    coworkerMode: workers,
    walrusEvidenceMode: evidence,
    ready: issues.length === 0,
    issues: [...new Set(issues)],
  };
}
