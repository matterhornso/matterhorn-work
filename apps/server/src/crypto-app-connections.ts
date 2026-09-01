import { randomUUID } from "node:crypto";

import {
  MATTERHORN_CRYPTO_APP_CONNECTION_VERSION,
  type MatterhornCryptoAppAuthentication,
  type MatterhornCryptoAppConnection,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppConnectionState,
  type MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCryptoAppConnectionStore } from "./crypto-app-connection-store.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";

export type CreateCryptoAppConnectionInput = {
  workspaceId: string;
  createdBy: string;
  appId: string;
  grantedActionIds: string[];
  grantedScopes: string[];
  grantedNetworks: string[];
  credential: MatterhornCryptoAppConnectionCredential;
};

export class MatterhornCryptoAppConnectionError extends Error {
  constructor(public readonly code:
    | "connection_input_invalid"
    | "app_certification_unavailable"
    | "connection_action_not_allowed"
    | "connection_scope_not_allowed"
    | "connection_network_not_allowed"
    | "connection_credential_invalid"
    | "connection_not_found"
    | "connection_transition_invalid") {
    super(code);
    this.name = "MatterhornCryptoAppConnectionError";
  }
}

type ConnectionServiceOptions = {
  registry: MatterhornCryptoAppRegistry;
  store: MatterhornCryptoAppConnectionStore;
  now?: () => Date;
  id?: () => string;
};

const TRANSITIONS: Record<MatterhornCryptoAppConnectionState, ReadonlySet<MatterhornCryptoAppConnectionState>> = {
  active: new Set(["paused", "revoked"]),
  paused: new Set(["active", "revoked"]),
  revoked: new Set(),
};

function uniqueNonEmpty(values: string[]): boolean {
  return values.length > 0
    && values.every((value) => typeof value === "string" && value.trim().length > 0)
    && new Set(values).size === values.length;
}

function credentialValid(
  credential: MatterhornCryptoAppConnectionCredential,
  authentication: MatterhornCryptoAppAuthentication,
): boolean {
  if (!credential || typeof credential !== "object" || credential.type !== authentication.type) return false;
  if (credential.type === "oauth2" || credential.type === "api_key_vault") {
    const reference = credential.secretReference;
    const segments = reference.replace(/^vault:\/\//, "").split("/");
    return Object.keys(credential).every((key) => key === "type" || key === "secretReference")
      && /^vault:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{2,255}$/.test(reference)
      && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }
  if (credential.type === "wallet_connection") {
    return Object.keys(credential).every((key) => key === "type" || key === "walletConnectionId")
      && /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/.test(credential.walletConnectionId);
  }
  return Object.keys(credential).length === 1;
}

export class MatterhornCryptoAppConnections {
  readonly #registry: MatterhornCryptoAppRegistry;
  readonly #store: MatterhornCryptoAppConnectionStore;
  readonly #now: () => Date;
  readonly #id: () => string;

  constructor(options: ConnectionServiceOptions) {
    this.#registry = options.registry;
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => `cxc_${randomUUID()}`);
  }

  create(input: CreateCryptoAppConnectionInput): MatterhornCryptoAppConnectionView {
    if (![input.workspaceId, input.createdBy, input.appId].every((value) => typeof value === "string" && value.trim())) {
      throw new MatterhornCryptoAppConnectionError("connection_input_invalid");
    }
    if (!uniqueNonEmpty(input.grantedActionIds)
      || !uniqueNonEmpty(input.grantedNetworks)
      || input.grantedScopes.some((scope) => !scope.trim())
      || new Set(input.grantedScopes).size !== input.grantedScopes.length) {
      throw new MatterhornCryptoAppConnectionError("connection_input_invalid");
    }

    const registryEntry = this.#registry.resolve(input.appId);
    if (!registryEntry) throw new MatterhornCryptoAppConnectionError("app_certification_unavailable");
    const actions = new Map(registryEntry.manifest.actions.map((action) => [action.id, action]));
    if (input.grantedActionIds.some((actionId) => !actions.has(actionId))) {
      throw new MatterhornCryptoAppConnectionError("connection_action_not_allowed");
    }
    const manifestScopes = new Set(registryEntry.manifest.authentication.scopes);
    if (input.grantedScopes.some((scope) => !manifestScopes.has(scope))
      || input.grantedActionIds.some((actionId) => actions.get(actionId)?.requiredScopes.some((scope) => !input.grantedScopes.includes(scope)))) {
      throw new MatterhornCryptoAppConnectionError("connection_scope_not_allowed");
    }
    const manifestNetworks = new Map(registryEntry.manifest.networks.map((network) => [network.chainId, network]));
    if (input.grantedNetworks.some((network) => !manifestNetworks.has(network))) {
      throw new MatterhornCryptoAppConnectionError("connection_network_not_allowed");
    }
    if (input.grantedNetworks.some((network) => manifestNetworks.get(network)?.environment === "mainnet")
      && registryEntry.certification.state !== "certified_mainnet") {
      throw new MatterhornCryptoAppConnectionError("connection_network_not_allowed");
    }
    if (!credentialValid(input.credential, registryEntry.manifest.authentication)) {
      throw new MatterhornCryptoAppConnectionError("connection_credential_invalid");
    }

    const now = this.#now().toISOString();
    const connection: MatterhornCryptoAppConnection = {
      version: MATTERHORN_CRYPTO_APP_CONNECTION_VERSION,
      id: this.#id(),
      workspaceId: input.workspaceId,
      appId: input.appId,
      manifestRevision: registryEntry.manifestRevision,
      state: "active",
      grantedActionIds: [...input.grantedActionIds],
      grantedScopes: [...input.grantedScopes],
      grantedNetworks: [...input.grantedNetworks],
      credential: structuredClone(input.credential),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.#store.create(connection);
    return this.#view(connection);
  }

  get(workspaceId: string, connectionId: string): MatterhornCryptoAppConnectionView | null {
    const connection = this.#store.get(workspaceId, connectionId);
    return connection ? this.#view(connection) : null;
  }

  list(workspaceId: string): MatterhornCryptoAppConnectionView[] {
    return this.#store.list(workspaceId).map((connection) => this.#view(connection));
  }

  resolveActive(workspaceId: string, connectionId: string): MatterhornCryptoAppConnection | null {
    const connection = this.#store.get(workspaceId, connectionId);
    if (!connection || connection.state !== "active") return null;
    const registryEntry = this.#registry.resolve(connection.appId);
    if (!registryEntry || registryEntry.manifestRevision !== connection.manifestRevision) return null;
    return structuredClone(connection);
  }

  transition(
    workspaceId: string,
    connectionId: string,
    nextState: MatterhornCryptoAppConnectionState,
  ): MatterhornCryptoAppConnectionView {
    const current = this.#store.get(workspaceId, connectionId);
    if (!current) throw new MatterhornCryptoAppConnectionError("connection_not_found");
    if (!TRANSITIONS[current.state].has(nextState)) {
      throw new MatterhornCryptoAppConnectionError("connection_transition_invalid");
    }
    if (nextState === "active") {
      const registryEntry = this.#registry.resolve(current.appId);
      if (!registryEntry || registryEntry.manifestRevision !== current.manifestRevision) {
        throw new MatterhornCryptoAppConnectionError("app_certification_unavailable");
      }
    }
    const updated = this.#store.transition({
      workspaceId,
      connectionId,
      expectedState: current.state,
      nextState,
      updatedAt: this.#now().toISOString(),
    });
    if (!updated) throw new MatterhornCryptoAppConnectionError("connection_transition_invalid");
    return this.#view(updated);
  }

  purgeWorkspace(workspaceId: string): number {
    return this.#store.purgeWorkspace(workspaceId);
  }

  #view(connection: MatterhornCryptoAppConnection): MatterhornCryptoAppConnectionView {
    const registryEntry = this.#registry.resolve(connection.appId);
    return {
      ...structuredClone(connection),
      credential: {
        type: connection.credential.type,
        connected: connection.credential.type === "none"
          || ("secretReference" in connection.credential && Boolean(connection.credential.secretReference))
          || ("walletConnectionId" in connection.credential && Boolean(connection.credential.walletConnectionId)),
      },
      availability: registryEntry?.manifestRevision === connection.manifestRevision
        ? "available"
        : "certification_unavailable",
    };
  }
}
