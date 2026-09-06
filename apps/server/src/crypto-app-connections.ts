import { randomUUID } from "node:crypto";

import {
  MATTERHORN_CRYPTO_APP_CONNECTION_VERSION,
  type MatterhornCryptoAppAuthentication,
  type MatterhornCryptoAppConnection,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppConnectionState,
  type MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  type MatterhornCryptoAppOAuthFlowRecord,
  type MatterhornCryptoAppOAuthTokenRecord,
  MatterhornCryptoAppConnectionStore,
  MatterhornCryptoAppConnectionStoreError,
} from "./crypto-app-connection-store.js";
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

export type CryptoAppConnectionGrantInput = Omit<CreateCryptoAppConnectionInput, "credential">;

export type ValidatedCryptoAppConnectionGrant = {
  appId: string;
  displayName: string;
  manifestRevision: string;
  authentication: MatterhornCryptoAppAuthentication;
  networks: Array<{ protocol: string; chainId: string }>;
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

function safeIdentifier(value: string, maxLength = 160): boolean {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/.test(value);
}

function uniqueNonEmpty(values: string[]): boolean {
  return values.length > 0
    && values.length <= 64
    && values.every((value) => safeIdentifier(value))
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
    const { registryEntry } = this.#validateGrant(input);
    if (!credentialValid(input.credential, registryEntry.manifest.authentication)) {
      throw new MatterhornCryptoAppConnectionError("connection_credential_invalid");
    }

    const connection = this.#build(input, registryEntry.manifestRevision);
    this.#store.create(connection);
    return this.#view(connection);
  }

  validateGrant(input: CryptoAppConnectionGrantInput): ValidatedCryptoAppConnectionGrant {
    const { registryEntry } = this.#validateGrant(input);
    const grantedNetworks = new Set(input.grantedNetworks);
    return {
      appId: registryEntry.appId,
      displayName: registryEntry.manifest.displayName,
      manifestRevision: registryEntry.manifestRevision,
      authentication: structuredClone(registryEntry.manifest.authentication),
      networks: registryEntry.manifest.networks
        .filter((network) => grantedNetworks.has(network.chainId))
        .map((network) => ({ protocol: network.protocol, chainId: network.chainId })),
    };
  }

  createFromVerifiedWallet(input: CreateCryptoAppConnectionInput & {
    challenge: {
      challengeId: string;
      accountId: string;
      walletFamily: "evm" | "sui";
      addressDigest: string;
      expiresAt: string;
      proofId: string;
    };
  }): MatterhornCryptoAppConnectionView {
    const { registryEntry } = this.#validateGrant(input);
    if (input.credential.type !== "wallet_connection"
      || input.credential.walletConnectionId !== input.challenge.proofId
      || !credentialValid(input.credential, registryEntry.manifest.authentication)) {
      throw new MatterhornCryptoAppConnectionError("connection_credential_invalid");
    }
    const connection = this.#build(input, registryEntry.manifestRevision);
    const created = this.#store.finalizeWalletChallenge({
      ...input.challenge,
      workspaceId: input.workspaceId,
      appId: input.appId,
      manifestRevision: registryEntry.manifestRevision,
      actionIds: input.grantedActionIds,
      scopes: input.grantedScopes,
      networks: input.grantedNetworks,
      connection,
      consumedAt: this.#now().toISOString(),
    });
    if (!created) throw new MatterhornCryptoAppConnectionError("connection_transition_invalid");
    return this.#view(connection);
  }

  createFromOAuth(input: CreateCryptoAppConnectionInput & {
    flow: MatterhornCryptoAppOAuthFlowRecord;
    token: Omit<MatterhornCryptoAppOAuthTokenRecord, "connectionId">;
  }): MatterhornCryptoAppConnectionView {
    const { registryEntry } = this.#validateGrant(input);
    if (input.credential.type !== "oauth2"
      || input.flow.workspaceId !== input.workspaceId
      || input.flow.accountId !== input.createdBy
      || input.flow.appId !== input.appId
      || input.flow.manifestRevision !== registryEntry.manifestRevision
      || input.token.workspaceId !== input.workspaceId
      || input.token.accountId !== input.createdBy
      || input.token.appId !== input.appId
      || input.token.manifestRevision !== registryEntry.manifestRevision
      || input.token.bindingId !== input.flow.bindingId
      || input.credential.secretReference !== `vault://crypto-app-oauth/${input.token.oauthTokenId}`
      || !credentialValid(input.credential, registryEntry.manifest.authentication)) {
      throw new MatterhornCryptoAppConnectionError("connection_credential_invalid");
    }
    const connection = this.#build(input, registryEntry.manifestRevision);
    const created = this.#store.finalizeOAuthFlow({
      flow: input.flow,
      token: { ...input.token, connectionId: connection.id },
      connection,
      consumedAt: this.#now().toISOString(),
    });
    if (!created) throw new MatterhornCryptoAppConnectionError("connection_transition_invalid");
    return this.#view(connection);
  }

  #validateGrant(input: CryptoAppConnectionGrantInput): {
    registryEntry: NonNullable<ReturnType<MatterhornCryptoAppRegistry["resolve"]>>;
  } {
    if (!safeIdentifier(input.workspaceId, 256)
      || !safeIdentifier(input.createdBy, 256)
      || !safeIdentifier(input.appId, 128)) {
      throw new MatterhornCryptoAppConnectionError("connection_input_invalid");
    }
    if (!uniqueNonEmpty(input.grantedActionIds)
      || !uniqueNonEmpty(input.grantedNetworks)
      || input.grantedScopes.length > 64
      || input.grantedScopes.some((scope) => !safeIdentifier(scope))
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
    return { registryEntry };
  }

  #build(input: CreateCryptoAppConnectionInput, manifestRevision: string): MatterhornCryptoAppConnection {
    const now = this.#now().toISOString();
    return {
      version: MATTERHORN_CRYPTO_APP_CONNECTION_VERSION,
      id: this.#id(),
      workspaceId: input.workspaceId,
      appId: input.appId,
      manifestRevision,
      state: "active",
      grantedActionIds: [...input.grantedActionIds],
      grantedScopes: [...input.grantedScopes],
      grantedNetworks: [...input.grantedNetworks],
      credential: structuredClone(input.credential),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(workspaceId: string, connectionId: string): MatterhornCryptoAppConnectionView | null {
    const connection = this.#store.get(workspaceId, connectionId);
    if (connection) this.#assertStoredAuthority(connection);
    return connection ? this.#view(connection) : null;
  }

  list(workspaceId: string): MatterhornCryptoAppConnectionView[] {
    return this.#store.list(workspaceId).map((connection) => {
      this.#assertStoredAuthority(connection);
      return this.#view(connection);
    });
  }

  resolveActive(workspaceId: string, connectionId: string): MatterhornCryptoAppConnection | null {
    const connection = this.#store.get(workspaceId, connectionId);
    if (!connection || connection.state !== "active") return null;
    const registryEntry = this.#registry.resolve(connection.appId);
    if (!registryEntry || registryEntry.manifestRevision !== connection.manifestRevision) return null;
    this.#assertStoredAuthority(connection);
    return structuredClone(connection);
  }

  transition(
    workspaceId: string,
    connectionId: string,
    nextState: MatterhornCryptoAppConnectionState,
  ): MatterhornCryptoAppConnectionView {
    const current = this.#store.get(workspaceId, connectionId);
    if (!current) throw new MatterhornCryptoAppConnectionError("connection_not_found");
    this.#assertStoredAuthority(current);
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

  #assertStoredAuthority(connection: MatterhornCryptoAppConnection): void {
    const registryEntry = this.#registry.resolve(connection.appId);
    if (!registryEntry || registryEntry.manifestRevision !== connection.manifestRevision) return;
    try {
      this.#validateGrant({
        workspaceId: connection.workspaceId,
        createdBy: connection.createdBy,
        appId: connection.appId,
        grantedActionIds: connection.grantedActionIds,
        grantedScopes: connection.grantedScopes,
        grantedNetworks: connection.grantedNetworks,
      });
      if (!credentialValid(connection.credential, registryEntry.manifest.authentication)) {
        throw new MatterhornCryptoAppConnectionError("connection_credential_invalid");
      }
    } catch (error) {
      if (error instanceof MatterhornCryptoAppConnectionError) {
        throw new MatterhornCryptoAppConnectionStoreError("crypto_app_connection_state_corrupt");
      }
      throw error;
    }
  }

  #view(connection: MatterhornCryptoAppConnection): MatterhornCryptoAppConnectionView {
    const registryEntry = this.#registry.resolve(connection.appId);
    const { credential, createdBy: _createdBy, ...publicConnection } = structuredClone(connection);
    return {
      ...publicConnection,
      credential: {
        type: credential.type,
        connected: credential.type === "none"
          || ("secretReference" in credential && Boolean(credential.secretReference))
          || ("walletConnectionId" in credential && Boolean(credential.walletConnectionId)),
      },
      availability: registryEntry?.manifestRevision === connection.manifestRevision
        ? "available"
        : "certification_unavailable",
    };
  }
}
