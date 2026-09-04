import { createHash, randomUUID } from "node:crypto";

import {
  MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
  MATTERHORN_COWORKER_PROFILE_VERSION,
  MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION,
  MATTERHORN_COWORKER_WATCH_VERSION,
  MATTERHORN_COWORKER_WORKING_STATE_VERSION,
  type MatterhornCoworkerAuthority,
  type MatterhornCoworkerInboxItem,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerResourceScope,
  type MatterhornCoworkerState,
  type MatterhornCoworkerWatch,
  type MatterhornCoworkerWatchCreateInput,
  type MatterhornCoworkerWorkingState,
  validateMatterhornCoworkerInboxItem,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerResourceScope,
  validateMatterhornCoworkerWatch,
  validateMatterhornCoworkerWorkingState,
} from "@matterhorn-work/types/crypto-coworkers";
import { containsForbiddenMemorySecretMaterial } from "@matterhorn-work/types/memory";

import {
  MatterhornCoworkerStore,
  MatterhornCoworkerStoreError,
} from "./crypto-coworker-store.js";

export type MatterhornCoworkerCreateInput = Pick<
  MatterhornCoworkerProfile,
  | "name"
  | "role"
  | "mission"
  | "allowedAppIds"
  | "allowedActionIds"
  | "allowedNetworks"
  | "allowedAssets"
  | "automaticAuthorities"
  | "limits"
  | "privacy"
>;

export type MatterhornCoworkerUpdateInput = Partial<MatterhornCoworkerCreateInput> & {
  expectedRevision: number;
};

export type MatterhornCoworkerWorkingStateInput = Omit<
  MatterhornCoworkerWorkingState,
  "version" | "workspaceId" | "ownerId" | "coworkerId" | "revision" | "createdAt" | "updatedAt"
> & {
  expectedRevision: number;
};

export type MatterhornCoworkerResourceScopeInput = Pick<
  MatterhornCoworkerResourceScope,
  "profileRevision" | "agentFiles" | "memories" | "connections"
> & {
  expectedRevision: number;
};

export type { MatterhornCoworkerWatchCreateInput } from "@matterhorn-work/types/crypto-coworkers";

export type MatterhornCoworkerInboxItemInput = Omit<
  MatterhornCoworkerInboxItem,
  "version" | "id" | "workspaceId" | "ownerId" | "coworkerId" | "profileRevision" | "state" | "createdAt" | "updatedAt"
>;

export type MatterhornCoworkerWatchCheckResult = {
  checkedAt: Date;
  resultHash: string | null;
  conditionValues: Record<string, string | null> | null;
  inboxItem?: MatterhornCoworkerInboxItemInput | null;
};

type InvalidationReason = "policy_updated" | "paused" | "revoked" | "deleted";

type CoworkerServiceOptions = {
  store: MatterhornCoworkerStore;
  policyVersion: string;
  enforceAccountAccess?: boolean;
  accountIsAllowed?: (ownerId: string) => boolean;
  now?: () => Date;
  id?: () => string;
  watchId?: () => string;
  inboxItemId?: () => string;
  onInvalidate?: (input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    revision: number;
    reason: InvalidationReason;
  }) => void;
  connectionIsActive?: (input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    network: string;
  }) => boolean;
};

const TRANSITIONS: Record<MatterhornCoworkerState, ReadonlySet<MatterhornCoworkerState>> = {
  active: new Set(["paused", "revoked"]),
  paused: new Set(["active", "revoked"]),
  revoked: new Set(),
};

export class MatterhornCoworkerError extends Error {
  constructor(public readonly code:
    | "coworker_input_invalid"
    | "coworker_not_found"
    | "coworker_revision_conflict"
    | "coworker_resource_scope_invalid"
    | "coworker_working_state_invalid"
    | "coworker_watch_invalid"
    | "coworker_watch_not_found"
    | "coworker_watch_limit"
    | "coworker_watch_transition_invalid"
    | "coworker_inbox_item_invalid"
    | "coworker_inbox_item_not_found"
    | "coworker_inbox_state_conflict"
    | "coworker_access_required"
    | "coworker_transition_invalid") {
    super(code);
    this.name = "MatterhornCoworkerError";
  }
}

function validIdentity(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(value);
}

function normalizedProfileInput<T extends MatterhornCoworkerCreateInput>(input: T): T {
  return {
    ...structuredClone(input),
    name: input.name.trim(),
    role: input.role.trim(),
    mission: input.mission.trim(),
    allowedAppIds: input.allowedAppIds.map((value) => value.trim()),
    allowedActionIds: input.allowedActionIds.map((value) => value.trim()),
    allowedNetworks: input.allowedNetworks.map((value) => value.trim()),
    allowedAssets: input.allowedAssets.map((value) => value.trim()),
    automaticAuthorities: input.automaticAuthorities.map((value) => value.trim()) as MatterhornCoworkerAuthority[],
    privacy: {
      ...input.privacy,
      allowedDataLabels: input.privacy.allowedDataLabels.map((value) => value.trim()) as MatterhornCoworkerProfile["privacy"]["allowedDataLabels"],
    },
  };
}

function policyRelationshipsValid(profile: MatterhornCoworkerProfile): boolean {
  return profile.limits.dailyUsd >= profile.limits.perActionUsd
    && profile.limits.weeklyUsd >= profile.limits.dailyUsd
    && (!profile.automaticAuthorities.includes("prepare") || profile.limits.maxPrepareCallsPerFamily > 0)
    && (!profile.automaticAuthorities.includes("watch") || profile.limits.maxActiveWatches > 0);
}

function assertProfile(profile: MatterhornCoworkerProfile): void {
  if (validateMatterhornCoworkerProfile(profile).length > 0 || !policyRelationshipsValid(profile)) {
    throw new MatterhornCoworkerError("coworker_input_invalid");
  }
}

function resourceScopeHash(input: Pick<
  MatterhornCoworkerResourceScope,
  "workspaceId" | "ownerId" | "coworkerId" | "profileRevision" | "agentFiles" | "memories" | "connections" | "privacy"
>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function normalizeResourceScopeInput(input: MatterhornCoworkerResourceScopeInput) {
  return {
    profileRevision: input.profileRevision,
    agentFiles: structuredClone(input.agentFiles).sort((left, right) => left.id.localeCompare(right.id)),
    memories: structuredClone(input.memories).sort((left, right) => left.id.localeCompare(right.id)),
    connections: structuredClone(input.connections)
      .map((connection) => ({
        ...connection,
        actionIds: [...connection.actionIds].sort(),
        networks: [...connection.networks].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export class MatterhornCoworkers {
  readonly #store: MatterhornCoworkerStore;
  readonly #policyVersion: string;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #watchId: () => string;
  readonly #inboxItemId: () => string;
  readonly #enforceAccountAccess: boolean;
  readonly #accountIsAllowed: NonNullable<CoworkerServiceOptions["accountIsAllowed"]>;
  readonly #onInvalidate: NonNullable<CoworkerServiceOptions["onInvalidate"]>;
  readonly #connectionIsActive: CoworkerServiceOptions["connectionIsActive"];

  constructor(options: CoworkerServiceOptions) {
    this.#store = options.store;
    this.#policyVersion = options.policyVersion;
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => `cw_${randomUUID()}`);
    this.#watchId = options.watchId ?? (() => `cwatch_${randomUUID()}`);
    this.#inboxItemId = options.inboxItemId ?? (() => `cinbox_${randomUUID()}`);
    this.#enforceAccountAccess = options.enforceAccountAccess === true;
    this.#accountIsAllowed = options.accountIsAllowed ?? (() => true);
    this.#onInvalidate = options.onInvalidate ?? (() => undefined);
    this.#connectionIsActive = options.connectionIsActive;
  }

  create(workspaceId: string, ownerId: string, input: MatterhornCoworkerCreateInput): MatterhornCoworkerProfile {
    if (!validIdentity(workspaceId) || !validIdentity(ownerId)) {
      throw new MatterhornCoworkerError("coworker_input_invalid");
    }
    this.#assertAccountAccess(ownerId);
    const normalized = normalizedProfileInput(input);
    const now = this.#now().toISOString();
    const profile: MatterhornCoworkerProfile = {
      version: MATTERHORN_COWORKER_PROFILE_VERSION,
      id: this.#id(),
      workspaceId,
      ownerId,
      revision: 1,
      policyVersion: this.#policyVersion,
      ...normalized,
      state: "active",
      escalation: {
        privateDataRequiresDisclosure: true,
        transactionRequiresWalletReview: true,
        walletSubmission: "connected_wallet_only",
      },
      createdAt: now,
      updatedAt: now,
    };
    assertProfile(profile);
    return this.#store.create(profile);
  }

  get(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerProfile | null {
    this.#assertAccountAccess(ownerId);
    return this.#store.get(workspaceId, ownerId, coworkerId);
  }

  list(workspaceId: string, ownerId: string): MatterhornCoworkerProfile[] {
    this.#assertAccountAccess(ownerId);
    return this.#store.list(workspaceId, ownerId);
  }

  purgeWorkspace(workspaceId: string): number {
    if (!validIdentity(workspaceId)) {
      throw new MatterhornCoworkerError("coworker_input_invalid");
    }
    return this.#store.purgeWorkspace(workspaceId);
  }

  resolveActive(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerProfile | null {
    if (!this.#accountIsAllowed(ownerId)) return null;
    const profile = this.#store.get(workspaceId, ownerId, coworkerId);
    return profile?.state === "active" && profile.policyVersion === this.#policyVersion ? profile : null;
  }

  matchesActiveBinding(input: {
    id: string;
    workspaceId: string;
    ownerId: string;
    revision: number;
    policyVersion: string;
  }): boolean {
    if (!this.#accountIsAllowed(input.ownerId)) return false;
    const profile = this.#store.get(input.workspaceId, input.ownerId, input.id);
    return profile?.state === "active"
      && profile.revision === input.revision
      && profile.policyVersion === input.policyVersion
      && profile.policyVersion === this.#policyVersion;
  }

  getWorkingState(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
  ): MatterhornCoworkerWorkingState | null {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    return this.#store.getWorkingState(workspaceId, ownerId, coworkerId);
  }

  getResourceScope(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
  ): MatterhornCoworkerResourceScope | null {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    return this.#store.getResourceScope(workspaceId, ownerId, coworkerId);
  }

  resolveActiveResourceScope(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
  ): MatterhornCoworkerResourceScope | null {
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) return null;
    const scope = this.#store.getResourceScope(workspaceId, ownerId, coworkerId);
    return scope?.profileRevision === profile.revision ? scope : null;
  }

  setResourceScope(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerResourceScopeInput,
  ): MatterhornCoworkerResourceScope {
    this.#assertAccountAccess(ownerId);
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) throw new MatterhornCoworkerError("coworker_not_found");
    if (input.profileRevision !== profile.revision) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
    const current = this.#store.getResourceScope(workspaceId, ownerId, coworkerId);
    if (!Number.isSafeInteger(input.expectedRevision)
      || input.expectedRevision < 0
      || (current?.revision ?? 0) !== input.expectedRevision) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
    const normalized = normalizeResourceScopeInput(input);
    if ((normalized.agentFiles.length > 0 || normalized.memories.length > 0)
      && !profile.privacy.allowedDataLabels.includes("workspace_private")) {
      throw new MatterhornCoworkerError("coworker_resource_scope_invalid");
    }
    const connectionPolicyValid = normalized.connections.every((connection) => (
      profile.allowedAppIds.includes(connection.appId)
      && connection.actionIds.every((actionId) => profile.allowedActionIds.includes(actionId))
      && connection.networks.every((network) => profile.allowedNetworks.includes(network))
    ));
    if (!connectionPolicyValid) throw new MatterhornCoworkerError("coworker_resource_scope_invalid");
    const now = this.#now().toISOString();
    const content = {
      workspaceId,
      ownerId,
      coworkerId,
      profileRevision: normalized.profileRevision,
      agentFiles: normalized.agentFiles,
      memories: normalized.memories,
      connections: normalized.connections,
      privacy: {
        mode: "private_workspace" as const,
        unverifiedProviderConsent: false as const,
      },
    };
    const scope: MatterhornCoworkerResourceScope = {
      version: MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION,
      ...content,
      revision: input.expectedRevision + 1,
      scopeHash: resourceScopeHash(content),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (validateMatterhornCoworkerResourceScope(scope).length > 0) {
      throw new MatterhornCoworkerError("coworker_resource_scope_invalid");
    }
    if (!current) return this.#store.createResourceScope(scope);
    const replaced = this.#store.replaceResourceScope(scope, input.expectedRevision);
    if (!replaced) throw new MatterhornCoworkerError("coworker_revision_conflict");
    return replaced;
  }

  setWorkingState(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerWorkingStateInput,
  ): MatterhornCoworkerWorkingState {
    this.#assertAccountAccess(ownerId);
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) throw new MatterhornCoworkerError("coworker_not_found");
    if (input.profileRevision !== profile.revision) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
    const expectedRevision = input.expectedRevision;
    const content = structuredClone({
      profileRevision: input.profileRevision,
      decisions: input.decisions,
      positions: input.positions,
      unresolvedRisks: input.unresolvedRisks,
      pendingActions: input.pendingActions,
      evidenceReferences: input.evidenceReferences,
      approvedMemoryIds: input.approvedMemoryIds,
    });
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
      || containsForbiddenMemorySecretMaterial(content)) {
      throw new MatterhornCoworkerError("coworker_working_state_invalid");
    }
    const current = this.#store.getWorkingState(workspaceId, ownerId, coworkerId);
    if ((current?.revision ?? 0) !== expectedRevision) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
    const now = this.#now().toISOString();
    const state: MatterhornCoworkerWorkingState = {
      version: MATTERHORN_COWORKER_WORKING_STATE_VERSION,
      workspaceId,
      ownerId,
      coworkerId,
      revision: expectedRevision + 1,
      ...content,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (validateMatterhornCoworkerWorkingState(state).length > 0) {
      throw new MatterhornCoworkerError("coworker_working_state_invalid");
    }
    if (!current) return this.#store.createWorkingState(state);
    const replaced = this.#store.replaceWorkingState(state, expectedRevision);
    if (!replaced) throw new MatterhornCoworkerError("coworker_revision_conflict");
    return replaced;
  }

  listWatches(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerWatch[] {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    return this.#store.listWatches(workspaceId, ownerId, coworkerId);
  }

  getWatch(workspaceId: string, ownerId: string, coworkerId: string, watchId: string): MatterhornCoworkerWatch | null {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    return this.#store.getWatch(workspaceId, ownerId, coworkerId, watchId);
  }

  pauseWatchesForConnection(workspaceId: string, connectionId: string): number {
    if (!validIdentity(workspaceId) || !validIdentity(connectionId)) {
      throw new MatterhornCoworkerError("coworker_input_invalid");
    }
    return this.#store.pauseWatchesForConnection({
      workspaceId,
      connectionId,
      updatedAt: this.#now().toISOString(),
    });
  }

  createWatch(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerWatchCreateInput,
  ): MatterhornCoworkerWatch {
    this.#assertAccountAccess(ownerId);
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) throw new MatterhornCoworkerError("coworker_not_found");
    if (input.profileRevision !== profile.revision) throw new MatterhornCoworkerError("coworker_revision_conflict");
    const normalized = structuredClone({
      ...input,
      connectionId: input.connectionId.trim(),
      name: input.name.trim(),
      appId: input.appId.trim(),
      actionId: input.actionId.trim(),
      network: input.network.trim(),
    });
    const resourceScope = this.resolveActiveResourceScope(workspaceId, ownerId, coworkerId);
    const connectionBinding = resourceScope?.connections.find((connection) => (
      connection.id === normalized.connectionId
      && connection.appId === normalized.appId
      && connection.actionIds.includes(normalized.actionId)
      && connection.networks.includes(normalized.network)
    ));
    const connectionIsActive = connectionBinding && (!this.#connectionIsActive || this.#connectionIsActive({
      workspaceId,
      connectionId: connectionBinding.id,
      appId: connectionBinding.appId,
      manifestRevision: connectionBinding.manifestRevision,
      actionId: normalized.actionId,
      network: normalized.network,
    }));
    const invalidResultChangeCondition = normalized.conditions.some((condition) => (
      condition.metric === "matterhorn_result_hash"
      && (condition.operator !== "changed" || condition.value !== null)
    ));
    if (!profile.automaticAuthorities.includes("watch")
      || profile.limits.maxActiveWatches < 1
      || !connectionBinding
      || !connectionIsActive
      || invalidResultChangeCondition
      || !profile.allowedAppIds.includes(normalized.appId)
      || !profile.allowedActionIds.includes(normalized.actionId)
      || !profile.allowedNetworks.includes(normalized.network)
      || normalized.budgets.maxReadCallsPerCheck > profile.limits.maxReadCallsPerRun
      || containsForbiddenMemorySecretMaterial(normalized)) {
      throw new MatterhornCoworkerError("coworker_watch_invalid");
    }
    const now = this.#now();
    const nowIso = now.toISOString();
    const watch: MatterhornCoworkerWatch = {
      version: MATTERHORN_COWORKER_WATCH_VERSION,
      id: this.#watchId(),
      workspaceId,
      ownerId,
      coworkerId,
      revision: 1,
      profileRevision: profile.revision,
      state: "active",
      pauseReason: null,
      name: normalized.name,
      appId: normalized.appId,
      actionId: normalized.actionId,
      network: normalized.network,
      connectionBinding: {
        connectionId: connectionBinding.id,
        manifestRevision: connectionBinding.manifestRevision,
      },
      parameters: normalized.parameters,
      schedule: {
        intervalMs: normalized.schedule.intervalMs,
        maxChecksPerDay: normalized.schedule.maxChecksPerDay,
        nextCheckAt: new Date(now.getTime() + normalized.schedule.intervalMs).toISOString(),
        lastCheckedAt: null,
        dayBucket: nowIso.slice(0, 10),
        checksToday: 0,
        lastResultHash: null,
        lastConditionValues: {},
      },
      budgets: normalized.budgets,
      conditions: normalized.conditions,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    if (validateMatterhornCoworkerWatch(watch).length > 0) {
      throw new MatterhornCoworkerError("coworker_watch_invalid");
    }
    try {
      return this.#store.createWatch(watch, profile.limits.maxActiveWatches);
    } catch (error) {
      if (error instanceof MatterhornCoworkerStoreError && error.code === "coworker_watch_limit") {
        throw new MatterhornCoworkerError("coworker_watch_limit");
      }
      throw error;
    }
  }

  claimDueWatches(now = this.#now(), limit = 20): MatterhornCoworkerWatch[] {
    return this.#store.claimDueWatches(
      now.toISOString(),
      limit,
      120_000,
      this.#enforceAccountAccess,
    );
  }

  completeWatchCheck(
    claimed: MatterhornCoworkerWatch,
    result: MatterhornCoworkerWatchCheckResult,
  ): MatterhornCoworkerWatch | null {
    if (!this.#accountIsAllowed(claimed.ownerId)) return null;
    const conditionIds = new Set(claimed.conditions.map((condition) => condition.id));
    if (validateMatterhornCoworkerWatch(claimed).length > 0
      || !Number.isFinite(result.checkedAt.getTime())
      || (result.resultHash !== null && !/^[a-f0-9]{64}$/.test(result.resultHash))
      || (result.conditionValues !== null && (Object.keys(result.conditionValues).length > 8
        || Object.entries(result.conditionValues).some(([key, value]) => !conditionIds.has(key)
          || (value !== null && (typeof value !== "string"
            || value.length > 160
            || /[\u0000-\u001f\u007f]/.test(value))))))) {
      throw new MatterhornCoworkerError("coworker_watch_invalid");
    }
    let inboxItem: MatterhornCoworkerInboxItem | null = null;
    if (result.inboxItem) {
      const content = structuredClone(result.inboxItem);
      if (containsForbiddenMemorySecretMaterial(content)
        || content.watchId !== claimed.id
        || (content.source !== null && (content.source.appId !== claimed.appId
          || content.source.actionId !== claimed.actionId))
        || content.budgetImpact.readCallsConsumed > claimed.budgets.maxReadCallsPerCheck
        || content.budgetImpact.modelTokensConsumed > claimed.budgets.maxModelTokensPerCheck
        || content.budgetImpact.costMicros > claimed.budgets.maxCostMicrosPerCheck) {
        throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
      }
      const completedAt = result.checkedAt.toISOString();
      inboxItem = {
        ...content,
        version: MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
        id: this.#inboxItemId(),
        workspaceId: claimed.workspaceId,
        ownerId: claimed.ownerId,
        coworkerId: claimed.coworkerId,
        profileRevision: claimed.profileRevision,
        state: "unread",
        createdAt: completedAt,
        updatedAt: completedAt,
      };
      if (validateMatterhornCoworkerInboxItem(inboxItem).length > 0) {
        throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
      }
    }
    return this.#store.completeWatchCheck({
      workspaceId: claimed.workspaceId,
      ownerId: claimed.ownerId,
      coworkerId: claimed.coworkerId,
      watchId: claimed.id,
      claimedRevision: claimed.revision,
      checkedAt: result.checkedAt.toISOString(),
      resultHash: result.resultHash,
      conditionValues: result.conditionValues,
      inboxItem,
    }, this.#enforceAccountAccess);
  }

  transitionWatch(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    watchId: string,
    nextState: "active" | "paused",
    expectedRevision: number,
  ): MatterhornCoworkerWatch {
    this.#assertAccountAccess(ownerId);
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) throw new MatterhornCoworkerError("coworker_not_found");
    const current = this.#store.getWatch(workspaceId, ownerId, coworkerId, watchId);
    if (!current) throw new MatterhornCoworkerError("coworker_watch_not_found");
    if (current.revision !== expectedRevision) throw new MatterhornCoworkerError("coworker_revision_conflict");
    if (current.state === nextState) throw new MatterhornCoworkerError("coworker_watch_transition_invalid");
    const resourceConnection = nextState === "active"
      ? this.resolveActiveResourceScope(workspaceId, ownerId, coworkerId)?.connections.find((connection) => (
          connection.id === current.connectionBinding?.connectionId
          && connection.appId === current.appId
          && connection.manifestRevision === current.connectionBinding?.manifestRevision
          && connection.actionIds.includes(current.actionId)
          && connection.networks.includes(current.network)
        ))
      : null;
    if (nextState === "active" && (!profile.automaticAuthorities.includes("watch")
      || profile.limits.maxActiveWatches < 1
      || !profile.allowedAppIds.includes(current.appId)
      || !profile.allowedActionIds.includes(current.actionId)
      || !profile.allowedNetworks.includes(current.network)
      || !current.connectionBinding
      || !resourceConnection
      || (this.#connectionIsActive && !this.#connectionIsActive({
        workspaceId,
        connectionId: resourceConnection.id,
        appId: resourceConnection.appId,
        manifestRevision: resourceConnection.manifestRevision,
        actionId: current.actionId,
        network: current.network,
      })))) {
      throw new MatterhornCoworkerError("coworker_watch_invalid");
    }
    const now = this.#now();
    const next: MatterhornCoworkerWatch = {
      ...current,
      revision: current.revision + 1,
      profileRevision: profile.revision,
      state: nextState,
      pauseReason: nextState === "paused" ? "user_paused" : null,
      schedule: {
        ...current.schedule,
        ...(nextState === "active" ? { nextCheckAt: new Date(now.getTime() + current.schedule.intervalMs).toISOString() } : {}),
      },
      updatedAt: now.toISOString(),
    };
    let replaced: MatterhornCoworkerWatch | null;
    try {
      replaced = this.#store.replaceWatch(
        next,
        current.revision,
        nextState === "active" ? profile.limits.maxActiveWatches : undefined,
      );
    } catch (error) {
      if (error instanceof MatterhornCoworkerStoreError && error.code === "coworker_watch_limit") {
        throw new MatterhornCoworkerError("coworker_watch_limit");
      }
      throw error;
    }
    if (!replaced) throw new MatterhornCoworkerError("coworker_revision_conflict");
    return replaced;
  }

  deleteWatch(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    watchId: string,
    expectedRevision: number,
  ): void {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) throw new MatterhornCoworkerError("coworker_not_found");
    if (!this.#store.getWatch(workspaceId, ownerId, coworkerId, watchId)) {
      throw new MatterhornCoworkerError("coworker_watch_not_found");
    }
    if (!this.#store.deleteWatch(workspaceId, ownerId, coworkerId, watchId, expectedRevision)) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
  }

  createInboxItem(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerInboxItemInput,
  ): MatterhornCoworkerInboxItem {
    this.#assertAccountAccess(ownerId);
    const profile = this.resolveActive(workspaceId, ownerId, coworkerId);
    if (!profile) throw new MatterhornCoworkerError("coworker_not_found");
    const watch = input.watchId === null
      ? null
      : this.#store.getWatch(workspaceId, ownerId, coworkerId, input.watchId);
    if (input.watchId !== null && (!watch
      || (input.source !== null && (input.source.appId !== watch.appId || input.source.actionId !== watch.actionId))
      || input.budgetImpact.readCallsConsumed > watch.budgets.maxReadCallsPerCheck
      || input.budgetImpact.modelTokensConsumed > watch.budgets.maxModelTokensPerCheck
      || input.budgetImpact.costMicros > watch.budgets.maxCostMicrosPerCheck)) {
      throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
    }
    const content = structuredClone(input);
    if (containsForbiddenMemorySecretMaterial(content)) {
      throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
    }
    const now = this.#now().toISOString();
    const item: MatterhornCoworkerInboxItem = {
      ...content,
      version: MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
      id: this.#inboxItemId(),
      workspaceId,
      ownerId,
      coworkerId,
      profileRevision: profile.revision,
      state: "unread",
      createdAt: now,
      updatedAt: now,
    };
    if (validateMatterhornCoworkerInboxItem(item).length > 0) {
      throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
    }
    return this.#store.createInboxItem(item);
  }

  listInbox(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    includeDismissed?: boolean;
    limit?: number;
  }): MatterhornCoworkerInboxItem[] {
    this.#assertAccountAccess(input.ownerId);
    if (!this.#store.get(input.workspaceId, input.ownerId, input.coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(100, input.limit!)) : 50;
    return this.#store.listInbox({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      includeDismissed: input.includeDismissed === true,
      limit,
    });
  }

  transitionInboxItem(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    itemId: string,
    nextState: MatterhornCoworkerInboxItem["state"],
    expectedState: MatterhornCoworkerInboxItem["state"],
  ): MatterhornCoworkerInboxItem {
    this.#assertAccountAccess(ownerId);
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) throw new MatterhornCoworkerError("coworker_not_found");
    const current = this.#store.getInboxItem(workspaceId, ownerId, coworkerId, itemId);
    if (!current) throw new MatterhornCoworkerError("coworker_inbox_item_not_found");
    if (current.state !== expectedState) throw new MatterhornCoworkerError("coworker_inbox_state_conflict");
    if (nextState !== "read" && nextState !== "dismissed") {
      throw new MatterhornCoworkerError("coworker_inbox_item_invalid");
    }
    const next: MatterhornCoworkerInboxItem = {
      ...current,
      state: nextState,
      updatedAt: this.#now().toISOString(),
    };
    const replaced = this.#store.replaceInboxItem(next, expectedState);
    if (!replaced) throw new MatterhornCoworkerError("coworker_inbox_state_conflict");
    return replaced;
  }

  update(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerUpdateInput,
  ): MatterhornCoworkerProfile {
    this.#assertAccountAccess(ownerId);
    const current = this.#store.get(workspaceId, ownerId, coworkerId);
    if (!current) throw new MatterhornCoworkerError("coworker_not_found");
    if (current.state === "revoked") throw new MatterhornCoworkerError("coworker_transition_invalid");
    if (current.revision !== input.expectedRevision) throw new MatterhornCoworkerError("coworker_revision_conflict");
    const { expectedRevision: _expectedRevision, ...changes } = input;
    const normalized = normalizedProfileInput({
      name: changes.name ?? current.name,
      role: changes.role ?? current.role,
      mission: changes.mission ?? current.mission,
      allowedAppIds: changes.allowedAppIds ?? current.allowedAppIds,
      allowedActionIds: changes.allowedActionIds ?? current.allowedActionIds,
      allowedNetworks: changes.allowedNetworks ?? current.allowedNetworks,
      allowedAssets: changes.allowedAssets ?? current.allowedAssets,
      automaticAuthorities: changes.automaticAuthorities ?? current.automaticAuthorities,
      limits: changes.limits ?? current.limits,
      privacy: changes.privacy ?? current.privacy,
    });
    const next: MatterhornCoworkerProfile = {
      ...current,
      ...normalized,
      revision: current.revision + 1,
      policyVersion: this.#policyVersion,
      updatedAt: this.#now().toISOString(),
    };
    assertProfile(next);
    const replaced = this.#store.replace(next, current.revision);
    if (!replaced) throw new MatterhornCoworkerError("coworker_revision_conflict");
    this.#invalidate(replaced, "policy_updated");
    return replaced;
  }

  transition(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    nextState: MatterhornCoworkerState,
    expectedRevision: number,
  ): MatterhornCoworkerProfile {
    this.#assertAccountAccess(ownerId);
    const current = this.#store.get(workspaceId, ownerId, coworkerId);
    if (!current) throw new MatterhornCoworkerError("coworker_not_found");
    if (current.revision !== expectedRevision) throw new MatterhornCoworkerError("coworker_revision_conflict");
    if (!TRANSITIONS[current.state].has(nextState)) throw new MatterhornCoworkerError("coworker_transition_invalid");
    const next: MatterhornCoworkerProfile = {
      ...current,
      state: nextState,
      revision: current.revision + 1,
      policyVersion: this.#policyVersion,
      updatedAt: this.#now().toISOString(),
    };
    const replaced = this.#store.replace(next, current.revision);
    if (!replaced) throw new MatterhornCoworkerError("coworker_revision_conflict");
    this.#invalidate(replaced, nextState === "paused" ? "paused" : nextState === "revoked" ? "revoked" : "policy_updated");
    return replaced;
  }

  delete(workspaceId: string, ownerId: string, coworkerId: string, expectedRevision: number): void {
    this.#assertAccountAccess(ownerId);
    const current = this.#store.get(workspaceId, ownerId, coworkerId);
    if (!current) throw new MatterhornCoworkerError("coworker_not_found");
    if (current.revision !== expectedRevision) throw new MatterhornCoworkerError("coworker_revision_conflict");
    if (!this.#store.delete(workspaceId, ownerId, coworkerId, expectedRevision)) {
      throw new MatterhornCoworkerError("coworker_revision_conflict");
    }
    this.#invalidate(current, "deleted");
  }

  #invalidate(profile: MatterhornCoworkerProfile, reason: InvalidationReason): void {
    if (reason === "deleted") {
      this.#store.deleteWorkingState(profile.workspaceId, profile.ownerId, profile.id);
    } else {
      const state = this.#store.getWorkingState(profile.workspaceId, profile.ownerId, profile.id);
      if (state) {
        const next: MatterhornCoworkerWorkingState = {
          ...state,
          revision: state.revision + 1,
          profileRevision: profile.revision,
          pendingActions: [],
          updatedAt: this.#now().toISOString(),
        };
        this.#store.replaceWorkingState(next, state.revision);
      }
      this.#store.pauseWatches({
        workspaceId: profile.workspaceId,
        ownerId: profile.ownerId,
        coworkerId: profile.id,
        profileRevision: profile.revision,
        reason: reason === "policy_updated" ? "profile_changed" : "coworker_paused",
        updatedAt: this.#now().toISOString(),
      });
    }
    this.#onInvalidate({
      workspaceId: profile.workspaceId,
      ownerId: profile.ownerId,
      coworkerId: profile.id,
      revision: profile.revision,
      reason,
    });
  }

  #assertAccountAccess(ownerId: string): void {
    if (!this.#accountIsAllowed(ownerId)) {
      throw new MatterhornCoworkerError("coworker_access_required");
    }
  }
}
