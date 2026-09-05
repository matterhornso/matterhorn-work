import { existsSync } from "node:fs";

import { MatterhornCryptoAppCatalog } from "./crypto-app-catalog.js";
import { MatterhornCryptoAppAdapterRouter } from "./crypto-app-adapter-router.js";
import {
  MatterhornCryptoAppConnectionStore,
  type MatterhornCryptoAppConnectionMaintenanceResult,
} from "./crypto-app-connection-store.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { MatterhornManagedCryptoAppCredentials } from "./crypto-app-managed-credentials.js";
import { MatterhornCryptoAppOAuthConnections } from "./crypto-app-oauth-connections.js";
import { MatterhornCryptoAppWalletConnections } from "./crypto-app-wallet-connections.js";
import { MatterhornCryptoDeveloperPortal } from "./crypto-app-developer-portal.js";
import { MatterhornCryptoDeveloperPortalStore } from "./crypto-app-developer-portal-store.js";
import { MatterhornCryptoAppOperator } from "./crypto-app-operator.js";
import {
  MatterhornCryptoAppOperationalPolicyStore,
  type MatterhornCryptoAppDeveloperUsageReport,
} from "./crypto-app-operational-policy.js";
import { MatterhornCryptoAppRegistryStore } from "./crypto-app-registry-store.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { isTrustedEd25519PublisherKey, type MatterhornTrustedPublisherKey } from "./crypto-app-signature.js";
import { cryptoCoworkerFeatureConfig, type MatterhornCryptoAppGatewayMode } from "./crypto-coworker-config.js";
import { createFirstPartyCryptoAppExecutor } from "./first-party-crypto-app-executor.js";
import { firstPartyCryptoAppProxyTool } from "./first-party-crypto-apps.js";
import {
  type MatterhornCryptoAppCredentialResolver,
} from "./crypto-app-https-transport.js";
import { createPinnedMcpHttpCryptoAppTransport } from "./crypto-app-mcp-http-transport.js";
import { createPinnedJsonRpcCryptoAppTransport } from "./crypto-app-json-rpc-transport.js";
import { createPinnedOpenApiCryptoAppTransport } from "./crypto-app-openapi-transport.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import {
  createPinnedSuiPublicTransactionVerifier,
  type MatterhornSuiPublicTransactionVerifier,
} from "./sui-public-transaction-verifier.js";
import { SUI_GRPC_URLS } from "./tools/sui.js";

export type MatterhornCryptoAppRuntimeServices = {
  mode: MatterhornCryptoAppGatewayMode;
  catalog: MatterhornCryptoAppCatalog | null;
  operator: MatterhornCryptoAppOperator | null;
  developerPortal: MatterhornCryptoDeveloperPortal | null;
  managedCredentials: MatterhornManagedCryptoAppCredentials | null;
  oauthConnections: MatterhornCryptoAppOAuthConnections | null;
  walletConnections: MatterhornCryptoAppWalletConnections | null;
  router: MatterhornCryptoAppAdapterRouter | null;
  verifySuiTransaction: MatterhornSuiPublicTransactionVerifier | null;
  ready: boolean;
  developerUsage(input: {
    appId: string;
    manifestRevision: string;
    windowDays?: number;
  }): MatterhornCryptoAppDeveloperUsageReport | null;
  maintainConnectionSetupMetadata(): MatterhornCryptoAppConnectionMaintenanceResult;
  maintainDeveloperInviteMetadata(): { invitesDeleted: number };
  purgeWorkspace(workspaceId: string): { connections: number; usage: number; circuits: number };
  purgeAccount(accountId: string): { developers: number; keys: number; submissions: number };
  close(): void;
};

export class MatterhornCryptoAppRuntimeConfigurationError extends Error {
  constructor(public readonly code:
    | "crypto_app_policy_version_required"
    | "crypto_app_publisher_keys_required"
    | "crypto_app_publisher_keys_invalid"
    | "crypto_app_publisher_key_duplicate"
    | "crypto_app_private_key_forbidden"
    | "crypto_app_connection_integrity_secret_required"
    | "crypto_app_operational_integrity_secret_required"
    | "crypto_app_oauth_encryption_key_required"
    | "crypto_app_wallet_proof_secret_required") {
    super(code);
    this.name = "MatterhornCryptoAppRuntimeConfigurationError";
  }
}

type PublisherKeyEnvironmentValue = {
  publisherId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKeyPem: string;
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const CONNECTION_SETUP_METADATA_GRACE_MS = 24 * 60 * 60 * 1_000;

const EMPTY_CONNECTION_MAINTENANCE: MatterhornCryptoAppConnectionMaintenanceResult = {
  walletChallengesDeleted: 0,
  oauthFlowsDeleted: 0,
  oauthVerifiersCleared: 0,
};

function parsePublisherKeys(value: string | undefined): MatterhornTrustedPublisherKey[] {
  if (!value?.trim()) throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_required");
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_invalid");
  }
  if (!Array.isArray(decoded) || decoded.length === 0 || decoded.length > 32) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_invalid");
  }
  const seen = new Set<string>();
  return decoded.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_invalid");
    }
    const item = candidate as Partial<PublisherKeyEnvironmentValue>;
    if (Object.keys(candidate).some((key) => !["publisherId", "keyId", "algorithm", "publicKeyPem"].includes(key))
      || typeof item.publisherId !== "string"
      || !IDENTIFIER_PATTERN.test(item.publisherId)
      || typeof item.keyId !== "string"
      || !IDENTIFIER_PATTERN.test(item.keyId)
      || item.algorithm !== "ed25519"
      || typeof item.publicKeyPem !== "string") {
      throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_invalid");
    }
    if (/PRIVATE KEY/i.test(item.publicKeyPem)) {
      throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_private_key_forbidden");
    }
    if (!isTrustedEd25519PublisherKey(item.publicKeyPem)) {
      throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_keys_invalid");
    }
    const id = `${item.publisherId}\u0000${item.keyId}`;
    if (seen.has(id)) throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_publisher_key_duplicate");
    seen.add(id);
    return {
      publisherId: item.publisherId,
      keyId: item.keyId,
      algorithm: "ed25519" as const,
      publicKey: item.publicKeyPem,
    };
  });
}

/**
 * Startup boundary for Phase 1 services. In `off` mode it performs no file or
 * database access. Shadow/enforce modes require an explicit policy version and
 * public-only Ed25519 keyring, then hydrate fail-closed durable stores.
 */
export function createMatterhornCryptoAppRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: { guardedRuntime?: MatterhornGuardedAgentRuntime } = {},
): MatterhornCryptoAppRuntimeServices {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (feature.cryptoAppGatewayMode === "off") {
    return {
      mode: "off",
      catalog: null,
      operator: null,
      developerPortal: null,
      managedCredentials: null,
      oauthConnections: null,
      walletConnections: null,
      router: null,
      verifySuiTransaction: null,
      ready: true,
      developerUsage: () => null,
      maintainConnectionSetupMetadata: () => EMPTY_CONNECTION_MAINTENANCE,
      maintainDeveloperInviteMetadata: () => ({ invitesDeleted: 0 }),
      purgeWorkspace: () => ({ connections: 0, usage: 0, circuits: 0 }),
      purgeAccount: () => ({ developers: 0, keys: 0, submissions: 0 }),
      close: () => undefined,
    };
  }
  const policyVersion = env.MATTERHORN_CRYPTO_APP_POLICY_VERSION?.trim() ?? "";
  if (!POLICY_VERSION_PATTERN.test(policyVersion)) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_policy_version_required");
  }
  const walletProofSecret = env.MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET;
  const connectionIntegritySecret = env.MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET;
  const operationalIntegritySecret = env.MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET;
  const oauthConfigured = Boolean(env.MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON?.trim());
  const oauthEncryptionKey = env.MATTERHORN_CRYPTO_APP_OAUTH_ENCRYPTION_KEY;
  if (feature.cryptoAppGatewayMode === "enforce"
    && (!walletProofSecret || Buffer.byteLength(walletProofSecret, "utf8") < 32)) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_wallet_proof_secret_required");
  }
  if (!connectionIntegritySecret || Buffer.byteLength(connectionIntegritySecret, "utf8") < 32) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_connection_integrity_secret_required");
  }
  if (!operationalIntegritySecret || Buffer.byteLength(operationalIntegritySecret, "utf8") < 32) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_operational_integrity_secret_required");
  }
  if (feature.cryptoAppGatewayMode === "enforce"
    && oauthConfigured
    && (!oauthEncryptionKey || Buffer.byteLength(oauthEncryptionKey, "utf8") < 32)) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_oauth_encryption_key_required");
  }
  const publisherKeys = parsePublisherKeys(env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON);
  const registryPath = env.MATTERHORN_CRYPTO_APP_REGISTRY_DB?.trim();
  const connectionPath = env.MATTERHORN_CRYPTO_APP_CONNECTION_DB?.trim();
  const registryStore = new MatterhornCryptoAppRegistryStore(registryPath || undefined);
  let connectionStore: MatterhornCryptoAppConnectionStore | null = null;
  let developerPortalStore: MatterhornCryptoDeveloperPortalStore | null = null;
  let operationalPolicy: MatterhornCryptoAppOperationalPolicyStore | null = null;
  try {
    const registry = new MatterhornCryptoAppRegistry({
      publisherKeys,
      policyVersion,
      store: registryStore,
    });
    const activeConnectionStore = new MatterhornCryptoAppConnectionStore(
      connectionPath || undefined,
      connectionIntegritySecret,
    );
    connectionStore = activeConnectionStore;
    const connections = new MatterhornCryptoAppConnections({ registry, store: activeConnectionStore });
    const managedCredentials = new MatterhornManagedCryptoAppCredentials(env);
    const oauthConnections = oauthConfigured && oauthEncryptionKey
      ? new MatterhornCryptoAppOAuthConnections({
        connections,
        store: activeConnectionStore,
        env,
      })
      : null;
    const walletConnections = walletProofSecret
      ? new MatterhornCryptoAppWalletConnections({
        connections,
        store: activeConnectionStore,
        secret: walletProofSecret,
      })
      : null;
    const catalog = new MatterhornCryptoAppCatalog({
      registry,
      connections,
      mode: feature.cryptoAppGatewayMode,
    });
    const operator = new MatterhornCryptoAppOperator(registry);
    const developerPath = env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB?.trim();
    developerPortalStore = new MatterhornCryptoDeveloperPortalStore(developerPath || undefined);
    const developerPortal = new MatterhornCryptoDeveloperPortal({
      store: developerPortalStore,
      policyVersion,
    });
    const operationalPath = env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB?.trim();
    operationalPolicy = new MatterhornCryptoAppOperationalPolicyStore(operationalPath || undefined, {
      integritySecret: operationalIntegritySecret,
    });
    let router: MatterhornCryptoAppAdapterRouter | null = null;
    let verifySuiTransaction: MatterhornSuiPublicTransactionVerifier | null = null;
    if (feature.cryptoAppGatewayMode === "enforce" && options.guardedRuntime) {
      const authorization = options.guardedRuntime.createCryptoAppAuthorization({
        resolveBinding: (input) => {
          const entry = registry.resolve(input.appId);
          if (!entry
            || entry.manifestRevision !== input.manifestRevision
            || !entry.manifest.actions.some((action) => action.id === input.actionId)) return null;
          const proxyToolName = firstPartyCryptoAppProxyTool(input.appId, input.actionId);
          return proxyToolName ? { ...input, proxyToolName } : null;
        },
      });
      const resolveCredentialHeaders: MatterhornCryptoAppCredentialResolver = (input) => {
        if (input.credential.type === "oauth2") {
          if (!oauthConnections || !input.workspaceId || !input.connectionId) {
            throw new Error("crypto_app_oauth_token_unavailable");
          }
          return oauthConnections.resolveHeaders({
            workspaceId: input.workspaceId,
            connectionId: input.connectionId,
            appId: input.appId,
            manifestRevision: input.manifestRevision,
            secretReference: input.credential.secretReference,
          });
        }
        return managedCredentials.resolveHeaders(input);
      };
      const pinnedMcpHttpTransport = createPinnedMcpHttpCryptoAppTransport({ resolveCredentialHeaders });
      const pinnedJsonRpcTransport = createPinnedJsonRpcCryptoAppTransport({ resolveCredentialHeaders });
      const pinnedOpenApiTransport = createPinnedOpenApiCryptoAppTransport({ resolveCredentialHeaders });
      router = new MatterhornCryptoAppAdapterRouter({
        registry,
        connections,
        authorization,
        operationalPolicy,
        validateCredential: async (input) => {
          if (input.credential.type === "wallet_connection") {
            const proof = activeConnectionStore.resolveWalletProof({
              workspaceId: input.workspaceId,
              walletConnectionId: input.credential.walletConnectionId,
              connectionId: input.connectionId,
              appId: input.appId,
              manifestRevision: input.manifestRevision,
            });
            if (!proof) throw new Error("crypto_app_wallet_proof_unavailable");
          }
          if (input.credential.type === "oauth2") {
            if (!oauthConnections) throw new Error("crypto_app_oauth_token_unavailable");
            await oauthConnections.validateCredential({
              workspaceId: input.workspaceId,
              connectionId: input.connectionId,
              appId: input.appId,
              manifestRevision: input.manifestRevision,
              secretReference: input.credential.secretReference,
            });
          }
        },
        executors: {
          matterhorn_sdk: createFirstPartyCryptoAppExecutor(),
          mcp_http: pinnedMcpHttpTransport,
          openapi: pinnedOpenApiTransport,
          rpc: pinnedJsonRpcTransport,
        },
      });
      verifySuiTransaction = createPinnedSuiPublicTransactionVerifier({
        endpoint: new URL(SUI_GRPC_URLS.testnet),
      });
    }
    return {
      mode: feature.cryptoAppGatewayMode,
      catalog,
      operator,
      developerPortal,
      managedCredentials,
      oauthConnections,
      walletConnections,
      router,
      verifySuiTransaction,
      ready: feature.cryptoAppGatewayMode !== "enforce" || Boolean(router),
      developerUsage: (input) => operationalPolicy?.developerUsage(input) ?? null,
      maintainConnectionSetupMetadata: () => {
        const now = new Date();
        return activeConnectionStore.pruneSetupMetadata({
          now: now.toISOString(),
          deleteBefore: new Date(now.getTime() - CONNECTION_SETUP_METADATA_GRACE_MS).toISOString(),
        });
      },
      maintainDeveloperInviteMetadata: () => developerPortal.pruneExpiredInviteMetadata(),
      purgeWorkspace: (workspaceId) => {
        const connectionsPurged = connections.purgeWorkspace(workspaceId);
        const operational = operationalPolicy?.purgeWorkspace(workspaceId) ?? { usage: 0, circuits: 0 };
        return {
          connections: connectionsPurged,
          usage: operational.usage,
          circuits: operational.circuits,
        };
      },
      purgeAccount: (accountId) => developerPortal.purgeAccount(accountId),
      close: () => {
        operationalPolicy?.close();
        developerPortalStore?.close();
        connectionStore?.close();
        registryStore.close();
      },
    };
  } catch (error) {
    operationalPolicy?.close();
    developerPortalStore?.close();
    connectionStore?.close();
    registryStore.close();
    throw error;
  }
}

/** Test-only observability that does not expose key material. */
export function cryptoAppRuntimeDatabaseFiles(env: NodeJS.ProcessEnv): {
  registryExists: boolean;
  connectionsExist: boolean;
  developerPortalExists: boolean;
} {
  return {
    registryExists: Boolean(env.MATTERHORN_CRYPTO_APP_REGISTRY_DB && existsSync(env.MATTERHORN_CRYPTO_APP_REGISTRY_DB)),
    connectionsExist: Boolean(env.MATTERHORN_CRYPTO_APP_CONNECTION_DB && existsSync(env.MATTERHORN_CRYPTO_APP_CONNECTION_DB)),
    developerPortalExists: Boolean(
      env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB && existsSync(env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB),
    ),
  };
}
