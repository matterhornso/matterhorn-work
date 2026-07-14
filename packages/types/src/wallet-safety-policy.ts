export const MATTERHORN_WALLET_SAFETY_POLICY_VERSION = "matterhorn.wallet.safety-policy.v1" as const;

export interface MatterhornWalletSafetyPolicy {
  version: typeof MATTERHORN_WALLET_SAFETY_POLICY_VERSION;
  maxPerTransactionUSD: number;
  maxDailySpendUSD: number;
  mainnetEnabled: boolean;
  maxSlippageBps: number;
  preferredNetwork: number | null;
  updatedAt: string;
  updatedBy?: string;
}

export interface MatterhornWalletSafetyPolicyUpdateRequest {
  maxPerTransactionUSD?: number;
  maxDailySpendUSD?: number;
  mainnetEnabled?: boolean;
  maxSlippageBps?: number;
  preferredNetwork?: number | null;
}

export interface MatterhornWalletSafetyPolicyResponse {
  success: true;
  version: typeof MATTERHORN_WALLET_SAFETY_POLICY_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
    preset: string;
  };
  storage: {
    path: string;
    exists: boolean;
  };
  policy: MatterhornWalletSafetyPolicy;
  controls: {
    writable: boolean;
    ledgerRoute: string;
    settingsRoute: string;
  };
}
