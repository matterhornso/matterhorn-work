/**
 * Public, dependency-free manifest types for the distributable SDK. The
 * authoritative runtime validator remains the shared Matterhorn server/types
 * implementation and is bundled into release artifacts. A compile-time
 * compatibility test prevents this public shape from drifting.
 */
export const MATTERHORN_CRYPTO_APP_MANIFEST_VERSION:
  "matterhorn.crypto-app-manifest.v1" = "matterhorn.crypto-app-manifest.v1";
export const MATTERHORN_CRYPTO_APP_OPENAPI_PROFILE_VERSION:
  "matterhorn.openapi-action.v1" = "matterhorn.openapi-action.v1";

export type MatterhornCryptoAppActionAccess =
  | "read"
  | "watch"
  | "prepare"
  | "simulate";

export type MatterhornCryptoAppActionRisk =
  | "informational"
  | "private_data"
  | "financial_low"
  | "financial_high";

export type MatterhornCryptoAppCachePolicy = "block_bound_public";

export type MatterhornCryptoAppTransportKind =
  | "mcp_http"
  | "openapi"
  | "rpc"
  | "matterhorn_sdk";

export type MatterhornCryptoAppNetworkEnvironment = "testnet" | "mainnet";

export type MatterhornCryptoAppOpenApiOperation = {
  actionId: string;
  method: "POST";
  path: string;
};

export type MatterhornCryptoAppTransport =
  | {
      kind: Exclude<MatterhornCryptoAppTransportKind, "openapi">;
      endpoint: string;
    }
  | {
      kind: "openapi";
      endpoint: string;
      profile?: typeof MATTERHORN_CRYPTO_APP_OPENAPI_PROFILE_VERSION;
      operations?: MatterhornCryptoAppOpenApiOperation[];
    };

export type MatterhornCryptoAppOAuth = {
  type: "oauth2";
  authorizationServer: string;
  resource: string;
  audience: string;
  scopes: string[];
};

export type MatterhornCryptoAppAuthentication =
  | MatterhornCryptoAppOAuth
  | {
      type: "api_key_vault" | "wallet_connection" | "none";
      scopes: string[];
    };

export type MatterhornCryptoAppAction = {
  id: string;
  title: string;
  description: string;
  access: MatterhornCryptoAppActionAccess;
  risk: MatterhornCryptoAppActionRisk;
  /**
   * Explicitly opts a signed public read into short-lived, block-bound reuse.
   * Omit this for private, authenticated, scoped, or financial actions.
   */
  cachePolicy?: MatterhornCryptoAppCachePolicy;
  inputSchema: Record<string, unknown>;
  outputProjectionSchema: Record<string, unknown>;
  requiredScopes: string[];
  requiresFreshness: boolean;
  freshnessMaxAgeMs: number | null;
  timeoutMs: number;
  simulationRequired: boolean;
  /** Financial submission is always completed by the connected wallet UI. */
  walletSubmissionOnly: true;
  /** An adapter can never advertise model-controlled submission. */
  agentMaySubmit: false;
};

export type MatterhornCryptoAppManifest = {
  version: typeof MATTERHORN_CRYPTO_APP_MANIFEST_VERSION;
  appId: string;
  displayName: string;
  description: string;
  manifestRevision: string;
  publisher: {
    id: string;
    keyId: string;
    algorithm: "ed25519";
    signature: string;
  };
  transport: MatterhornCryptoAppTransport;
  authentication: MatterhornCryptoAppAuthentication;
  networks: Array<{
    protocol: string;
    chainId: string;
    environment: MatterhornCryptoAppNetworkEnvironment;
  }>;
  actions: MatterhornCryptoAppAction[];
  support: {
    privacyPolicyUrl: string;
    securityContact: string;
    statusUrl: string | null;
  };
};
