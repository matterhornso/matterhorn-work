import {
  MATTERHORN_CRYPTO_APP_CATALOG_VERSION,
  type MatterhornCryptoAppActionAccess,
  type MatterhornCryptoAppActionRisk,
  type MatterhornCryptoAppCatalogActionView,
  type MatterhornCryptoAppCatalogDetail,
  type MatterhornCryptoAppCatalogSummary,
  type MatterhornCryptoAppConnectionState,
  type MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  MatterhornCryptoAppConnections,
  type CreateCryptoAppConnectionInput,
} from "./crypto-app-connections.js";
import { MatterhornCryptoAppRegistry, type MatterhornCryptoAppRegistryEntry } from "./crypto-app-registry.js";
import type { MatterhornCryptoAppGatewayMode } from "./crypto-coworker-config.js";

export type MatterhornCryptoAppCatalogQuery = {
  query?: string;
  environment?: "testnet" | "mainnet";
  access?: MatterhornCryptoAppActionAccess;
  risk?: MatterhornCryptoAppActionRisk;
};

type CatalogOptions = {
  registry: MatterhornCryptoAppRegistry;
  connections: MatterhornCryptoAppConnections;
  mode: MatterhornCryptoAppGatewayMode;
};

const SAFE_ACCESS = new Set<MatterhornCryptoAppActionAccess>(["read", "watch", "prepare", "simulate"]);
const SAFE_RISK = new Set<MatterhornCryptoAppActionRisk>([
  "informational",
  "private_data",
  "financial_low",
  "financial_high",
]);

export class MatterhornCryptoAppCatalogError extends Error {
  constructor(public readonly code: "crypto_app_gateway_disabled" | "crypto_app_catalog_query_invalid") {
    super(code);
    this.name = "MatterhornCryptoAppCatalogError";
  }
}

function actionView(action: MatterhornCryptoAppRegistryEntry["manifest"]["actions"][number]): MatterhornCryptoAppCatalogActionView {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    access: action.access,
    risk: action.risk,
    requiredScopes: [...action.requiredScopes],
    requiresFreshness: action.requiresFreshness,
    freshnessMaxAgeMs: action.freshnessMaxAgeMs,
    timeoutMs: action.timeoutMs,
    simulationRequired: action.simulationRequired,
    walletSubmissionOnly: true,
    agentMaySubmit: false,
  };
}

function summary(entry: MatterhornCryptoAppRegistryEntry): MatterhornCryptoAppCatalogSummary {
  if ((entry.certification.state !== "certified_testnet" && entry.certification.state !== "certified_mainnet")
    || !entry.certification.reportHash
    || !entry.certification.runtimeReportHash) {
    throw new MatterhornCryptoAppCatalogError("crypto_app_gateway_disabled");
  }
  return {
    version: MATTERHORN_CRYPTO_APP_CATALOG_VERSION,
    appId: entry.appId,
    displayName: entry.manifest.displayName,
    description: entry.manifest.description,
    manifestRevision: entry.manifestRevision,
    manifestHash: entry.manifestHash,
    certification: {
      state: entry.certification.state,
      reportHash: entry.certification.reportHash,
      runtimeReportHash: entry.certification.runtimeReportHash,
      policyVersion: entry.certification.policyVersion,
      updatedAt: entry.certification.updatedAt,
    },
    authentication: {
      type: entry.manifest.authentication.type,
      scopes: [...entry.manifest.authentication.scopes],
      connectionRequired: entry.manifest.authentication.type !== "none",
    },
    networks: entry.manifest.networks.map((network) => ({ ...network })),
    actions: entry.manifest.actions.map(actionView),
    support: {
      privacyPolicyUrl: entry.manifest.support.privacyPolicyUrl,
      statusUrl: entry.manifest.support.statusUrl,
    },
  };
}

function normalizedQuery(input: MatterhornCryptoAppCatalogQuery): Required<Pick<MatterhornCryptoAppCatalogQuery, "query">>
  & Omit<MatterhornCryptoAppCatalogQuery, "query"> {
  const query = input.query?.trim().toLocaleLowerCase("en-US") ?? "";
  if (query.length > 120
    || (input.environment !== undefined && input.environment !== "testnet" && input.environment !== "mainnet")
    || (input.access !== undefined && !SAFE_ACCESS.has(input.access))
    || (input.risk !== undefined && !SAFE_RISK.has(input.risk))) {
    throw new MatterhornCryptoAppCatalogError("crypto_app_catalog_query_invalid");
  }
  return { ...input, query };
}

/**
 * Account-safe Phase 1 service boundary. It exposes certified projections and
 * tenant-scoped connection views only—never adapter endpoints, publisher
 * signatures, security contacts, OAuth servers, vault references or wallet IDs.
 */
export class MatterhornCryptoAppCatalog {
  readonly #registry: MatterhornCryptoAppRegistry;
  readonly #connections: MatterhornCryptoAppConnections;
  readonly #mode: MatterhornCryptoAppGatewayMode;

  constructor(options: CatalogOptions) {
    this.#registry = options.registry;
    this.#connections = options.connections;
    this.#mode = options.mode;
  }

  #assertEnabled(): void {
    if (this.#mode === "off") throw new MatterhornCryptoAppCatalogError("crypto_app_gateway_disabled");
  }

  list(input: MatterhornCryptoAppCatalogQuery = {}): MatterhornCryptoAppCatalogSummary[] {
    this.#assertEnabled();
    const filter = normalizedQuery(input);
    const current = new Map<string, MatterhornCryptoAppRegistryEntry>();
    for (const entry of this.#registry.list()) {
      const resolved = this.#registry.resolve(entry.appId);
      if (resolved?.manifestRevision === entry.manifestRevision) current.set(entry.appId, resolved);
    }
    return [...current.values()]
      .map(summary)
      .filter((app) => {
        const searchText = [
          app.appId,
          app.displayName,
          app.description,
          ...app.networks.flatMap((network) => [network.protocol, network.chainId]),
          ...app.actions.flatMap((action) => [action.id, action.title, action.description]),
        ].join(" ").toLocaleLowerCase("en-US");
        return (!filter.query || searchText.includes(filter.query))
          && (!filter.environment || app.networks.some((network) => network.environment === filter.environment))
          && (!filter.access || app.actions.some((action) => action.access === filter.access))
          && (!filter.risk || app.actions.some((action) => action.risk === filter.risk));
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName)
        || left.appId.localeCompare(right.appId));
  }

  get(appId: string): MatterhornCryptoAppCatalogDetail | null {
    this.#assertEnabled();
    const entry = this.#registry.resolve(appId);
    if (!entry) return null;
    return {
      ...summary(entry),
      actionSchemas: entry.manifest.actions.map((action) => ({
        actionId: action.id,
        inputSchema: structuredClone(action.inputSchema),
        outputProjectionSchema: structuredClone(action.outputProjectionSchema),
      })),
    };
  }

  createConnection(input: CreateCryptoAppConnectionInput): MatterhornCryptoAppConnectionView {
    this.#assertEnabled();
    return this.#connections.create(input);
  }

  listConnections(workspaceId: string): MatterhornCryptoAppConnectionView[] {
    this.#assertEnabled();
    return this.#connections.list(workspaceId);
  }

  transitionConnection(
    workspaceId: string,
    connectionId: string,
    nextState: MatterhornCryptoAppConnectionState,
  ): MatterhornCryptoAppConnectionView {
    this.#assertEnabled();
    return this.#connections.transition(workspaceId, connectionId, nextState);
  }
}
