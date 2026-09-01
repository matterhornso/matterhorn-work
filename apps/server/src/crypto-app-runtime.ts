import { existsSync } from "node:fs";

import { MatterhornCryptoAppCatalog } from "./crypto-app-catalog.js";
import { MatterhornCryptoAppAdapterRouter } from "./crypto-app-adapter-router.js";
import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { MatterhornCryptoAppOperator } from "./crypto-app-operator.js";
import { MatterhornCryptoAppOperationalPolicyStore } from "./crypto-app-operational-policy.js";
import { MatterhornCryptoAppRegistryStore } from "./crypto-app-registry-store.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { isTrustedEd25519PublisherKey, type MatterhornTrustedPublisherKey } from "./crypto-app-signature.js";
import { cryptoCoworkerFeatureConfig, type MatterhornCryptoAppGatewayMode } from "./crypto-coworker-config.js";
import { createFirstPartyCryptoAppExecutor } from "./first-party-crypto-app-executor.js";
import { firstPartyCryptoAppProxyTool } from "./first-party-crypto-apps.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";

export type MatterhornCryptoAppRuntimeServices = {
  mode: MatterhornCryptoAppGatewayMode;
  catalog: MatterhornCryptoAppCatalog | null;
  operator: MatterhornCryptoAppOperator | null;
  router: MatterhornCryptoAppAdapterRouter | null;
  ready: boolean;
  purgeWorkspace(workspaceId: string): { connections: number; usage: number; circuits: number };
  close(): void;
};

export class MatterhornCryptoAppRuntimeConfigurationError extends Error {
  constructor(public readonly code:
    | "crypto_app_policy_version_required"
    | "crypto_app_publisher_keys_required"
    | "crypto_app_publisher_keys_invalid"
    | "crypto_app_publisher_key_duplicate"
    | "crypto_app_private_key_forbidden") {
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
      router: null,
      ready: true,
      purgeWorkspace: () => ({ connections: 0, usage: 0, circuits: 0 }),
      close: () => undefined,
    };
  }
  const policyVersion = env.MATTERHORN_CRYPTO_APP_POLICY_VERSION?.trim() ?? "";
  if (!POLICY_VERSION_PATTERN.test(policyVersion)) {
    throw new MatterhornCryptoAppRuntimeConfigurationError("crypto_app_policy_version_required");
  }
  const publisherKeys = parsePublisherKeys(env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON);
  const registryPath = env.MATTERHORN_CRYPTO_APP_REGISTRY_DB?.trim();
  const connectionPath = env.MATTERHORN_CRYPTO_APP_CONNECTION_DB?.trim();
  const registryStore = new MatterhornCryptoAppRegistryStore(registryPath || undefined);
  let connectionStore: MatterhornCryptoAppConnectionStore | null = null;
  let operationalPolicy: MatterhornCryptoAppOperationalPolicyStore | null = null;
  try {
    const registry = new MatterhornCryptoAppRegistry({
      publisherKeys,
      policyVersion,
      store: registryStore,
    });
    connectionStore = new MatterhornCryptoAppConnectionStore(connectionPath || undefined);
    const connections = new MatterhornCryptoAppConnections({ registry, store: connectionStore });
    const catalog = new MatterhornCryptoAppCatalog({
      registry,
      connections,
      mode: feature.cryptoAppGatewayMode,
    });
    const operator = new MatterhornCryptoAppOperator(registry);
    let router: MatterhornCryptoAppAdapterRouter | null = null;
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
      const operationalPath = env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB?.trim();
      operationalPolicy = new MatterhornCryptoAppOperationalPolicyStore(operationalPath || undefined);
      router = new MatterhornCryptoAppAdapterRouter({
        registry,
        connections,
        authorization,
        operationalPolicy,
        executors: { matterhorn_sdk: createFirstPartyCryptoAppExecutor() },
      });
    }
    return {
      mode: feature.cryptoAppGatewayMode,
      catalog,
      operator,
      router,
      ready: feature.cryptoAppGatewayMode !== "enforce" || Boolean(router),
      purgeWorkspace: (workspaceId) => {
        const connectionsPurged = connections.purgeWorkspace(workspaceId);
        const operational = operationalPolicy?.purgeWorkspace(workspaceId) ?? { usage: 0, circuits: 0 };
        return {
          connections: connectionsPurged,
          usage: operational.usage,
          circuits: operational.circuits,
        };
      },
      close: () => {
        operationalPolicy?.close();
        connectionStore?.close();
        registryStore.close();
      },
    };
  } catch (error) {
    operationalPolicy?.close();
    connectionStore?.close();
    registryStore.close();
    throw error;
  }
}

/** Test-only observability that does not expose key material. */
export function cryptoAppRuntimeDatabaseFiles(env: NodeJS.ProcessEnv): {
  registryExists: boolean;
  connectionsExist: boolean;
} {
  return {
    registryExists: Boolean(env.MATTERHORN_CRYPTO_APP_REGISTRY_DB && existsSync(env.MATTERHORN_CRYPTO_APP_REGISTRY_DB)),
    connectionsExist: Boolean(env.MATTERHORN_CRYPTO_APP_CONNECTION_DB && existsSync(env.MATTERHORN_CRYPTO_APP_CONNECTION_DB)),
  };
}
