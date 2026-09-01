import { randomUUID } from "node:crypto";

import {
  MATTERHORN_COWORKER_PROFILE_VERSION,
  MATTERHORN_COWORKER_WORKING_STATE_VERSION,
  type MatterhornCoworkerAuthority,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerState,
  type MatterhornCoworkerWorkingState,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerWorkingState,
} from "@matterhorn-work/types/crypto-coworkers";
import { containsForbiddenMemorySecretMaterial } from "@matterhorn-work/types/memory";

import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";

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

type InvalidationReason = "policy_updated" | "paused" | "revoked" | "deleted";

type CoworkerServiceOptions = {
  store: MatterhornCoworkerStore;
  policyVersion: string;
  now?: () => Date;
  id?: () => string;
  onInvalidate?: (input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    revision: number;
    reason: InvalidationReason;
  }) => void;
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
    | "coworker_working_state_invalid"
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

export class MatterhornCoworkers {
  readonly #store: MatterhornCoworkerStore;
  readonly #policyVersion: string;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #onInvalidate: NonNullable<CoworkerServiceOptions["onInvalidate"]>;

  constructor(options: CoworkerServiceOptions) {
    this.#store = options.store;
    this.#policyVersion = options.policyVersion;
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => `cw_${randomUUID()}`);
    this.#onInvalidate = options.onInvalidate ?? (() => undefined);
  }

  create(workspaceId: string, ownerId: string, input: MatterhornCoworkerCreateInput): MatterhornCoworkerProfile {
    if (!validIdentity(workspaceId) || !validIdentity(ownerId)) {
      throw new MatterhornCoworkerError("coworker_input_invalid");
    }
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
    return this.#store.get(workspaceId, ownerId, coworkerId);
  }

  list(workspaceId: string, ownerId: string): MatterhornCoworkerProfile[] {
    return this.#store.list(workspaceId, ownerId);
  }

  purgeWorkspace(workspaceId: string): number {
    if (!validIdentity(workspaceId)) {
      throw new MatterhornCoworkerError("coworker_input_invalid");
    }
    return this.#store.purgeWorkspace(workspaceId);
  }

  resolveActive(workspaceId: string, ownerId: string, coworkerId: string): MatterhornCoworkerProfile | null {
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
    if (!this.#store.get(workspaceId, ownerId, coworkerId)) {
      throw new MatterhornCoworkerError("coworker_not_found");
    }
    return this.#store.getWorkingState(workspaceId, ownerId, coworkerId);
  }

  setWorkingState(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerWorkingStateInput,
  ): MatterhornCoworkerWorkingState {
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

  update(
    workspaceId: string,
    ownerId: string,
    coworkerId: string,
    input: MatterhornCoworkerUpdateInput,
  ): MatterhornCoworkerProfile {
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
    }
    this.#onInvalidate({
      workspaceId: profile.workspaceId,
      ownerId: profile.ownerId,
      coworkerId: profile.id,
      revision: profile.revision,
      reason,
    });
  }
}
