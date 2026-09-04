import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import type { MatterhornCoworkerProfile } from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCoworkerStore, MatterhornCoworkerStoreError } from "./crypto-coworker-store.js";
import { MatterhornCoworkerAccess } from "./crypto-coworker-access.js";
import {
  MatterhornCoworkerError,
  MatterhornCoworkers,
  type MatterhornCoworkerCreateInput,
  type MatterhornCoworkerInboxItemInput,
  type MatterhornCoworkerResourceScopeInput,
  type MatterhornCoworkerWatchCreateInput,
  type MatterhornCoworkerWorkingStateInput,
} from "./crypto-coworkers.js";

const NOW = "2026-09-01T12:00:00.000Z";
const roots: string[] = [];

function input(overrides: Partial<MatterhornCoworkerCreateInput> = {}): MatterhornCoworkerCreateInput {
  return {
    name: "Market Analyst",
    role: "market_analyst",
    mission: "Research approved crypto markets and return cited, non-custodial analysis.",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read", "write_note"],
    limits: {
      perActionUsd: 0,
      dailyUsd: 0,
      weeklyUsd: 0,
      maxSlippageBps: 0,
      maxLeverage: 1,
      minimumReserveUsd: 0,
      maxActiveWatches: 0,
      maxReadCallsPerRun: 12,
      maxPrepareCallsPerFamily: 0,
    },
    privacy: {
      allowedDataLabels: ["public", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
    ...overrides,
  };
}

function workingStateInput(
  overrides: Partial<MatterhornCoworkerWorkingStateInput> = {},
): MatterhornCoworkerWorkingStateInput {
  return {
    expectedRevision: 0,
    profileRevision: 1,
    evidenceReferences: [{
      id: "ev_sui_balance",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      referenceHash: "a".repeat(64),
      freshness: "fresh",
      observedAt: NOW,
    }],
    decisions: [{
      id: "decision_watch_sui",
      summary: "Continue observing the approved Sui testnet balance.",
      status: "active",
      evidenceReferenceIds: ["ev_sui_balance"],
      decidedAt: NOW,
    }],
    positions: [{
      id: "position_sui",
      appId: "matterhorn.sui-testnet",
      network: "sui:testnet",
      asset: "SUI",
      side: "neutral",
      size: "10.0",
      evidenceReferenceId: "ev_sui_balance",
      observedAt: NOW,
    }],
    unresolvedRisks: [{
      id: "risk_stale_balance",
      severity: "medium",
      summary: "Refresh the public balance before making a new decision.",
      evidenceReferenceIds: ["ev_sui_balance"],
      openedAt: NOW,
    }],
    pendingActions: [{
      id: "pending_wallet_review",
      intentHash: "b".repeat(64),
      status: "wallet_review",
      expiresAt: "2026-09-01T12:05:00.000Z",
    }],
    approvedMemoryIds: ["mem_public_strategy"],
    ...overrides,
  };
}

function resourceScopeInput(
  overrides: Partial<MatterhornCoworkerResourceScopeInput> = {},
): MatterhornCoworkerResourceScopeInput {
  return {
    expectedRevision: 0,
    profileRevision: 1,
    agentFiles: [{
      id: "afile_market_policy",
      revision: 2,
      contentSha256: "d".repeat(64),
      sizeBytes: 1_024,
    }],
    memories: [{
      id: "mem_public_strategy",
      version: NOW,
      contentHash: "e".repeat(64),
    }],
    connections: [{
      id: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionIds: ["sui_account_read"],
      networks: ["sui:testnet"],
    }],
    ...overrides,
  };
}

function watchInput(overrides: Partial<MatterhornCoworkerWatchCreateInput> = {}): MatterhornCoworkerWatchCreateInput {
  return {
    profileRevision: 1,
    connectionId: "cxc_sui",
    name: "Sui balance change",
    appId: "matterhorn.sui-testnet",
    actionId: "sui_account_read",
    network: "sui:testnet",
    parameters: { address: "0x1234" },
    schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
    budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
    conditions: [{ id: "balance_changed", metric: "totalBalance", operator: "changed", value: null }],
    ...overrides,
  };
}

function watchResourceScopeInput(
  overrides: Partial<MatterhornCoworkerResourceScopeInput> = {},
): MatterhornCoworkerResourceScopeInput {
  return resourceScopeInput({ agentFiles: [], memories: [], ...overrides });
}

function inboxInput(watchId: string, overrides: Partial<MatterhornCoworkerInboxItemInput> = {}): MatterhornCoworkerInboxItemInput {
  return {
    watchId,
    kind: "alert",
    severity: "medium",
    title: "Sui balance changed",
    summary: "The observed Sui balance changed since the previous approved check.",
    reasonCodes: ["balance_changed"],
    source: {
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      evidenceReferenceHash: "c".repeat(64),
      freshness: "fresh",
      observedAt: NOW,
    },
    budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 1_000 },
    nextSafeAction: { kind: "review", label: "Review the fresh balance evidence" },
    ...overrides,
  };
}

function fixture(
  policyVersion = "coworker-policy-1",
  invalidations: unknown[] = [],
  connectionIsActive?: ConstructorParameters<typeof MatterhornCoworkers>[0]["connectionIsActive"],
) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-coworkers-"));
  roots.push(root);
  const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
  const coworkers = new MatterhornCoworkers({
    store,
    policyVersion,
    now: () => new Date(NOW),
    id: () => "cw_market_analyst",
    watchId: () => "cwatch_sui_balance",
    inboxItemId: () => "cinbox_sui_balance",
    onInvalidate: (event) => invalidations.push(event),
    connectionIsActive,
  });
  return { root, store, coworkers };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("durable crypto coworkers", () => {
  test("creates a bounded profile with a server-owned wallet boundary", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input());
      expect(profile).toMatchObject({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        revision: 1,
        policyVersion: "coworker-policy-1",
        state: "active",
        escalation: {
          privateDataRequiresDisclosure: true,
          transactionRequiresWalletReview: true,
          walletSubmission: "connected_wallet_only",
        },
      });
      expect(coworkers.resolveActive("ws_alpha", "account_alpha", profile.id)?.id).toBe(profile.id);
      expect(coworkers.matchesActiveBinding({
        id: profile.id,
        workspaceId: profile.workspaceId,
        ownerId: profile.ownerId,
        revision: profile.revision,
        policyVersion: profile.policyVersion,
      })).toBe(true);
    } finally {
      store.close();
    }
  });

  test("rejects crypto secret formats in model-facing profile text", () => {
    const { store, coworkers } = fixture();
    const secret = `suiprivkey1${"p".repeat(58)}`;
    try {
      expect(() => coworkers.create("ws_alpha", "account_alpha", input({ mission: secret })))
        .toThrow(new MatterhornCoworkerError("coworker_input_invalid"));
      expect(coworkers.list("ws_alpha", "account_alpha")).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("isolates identical coworker ids by both workspace and owner", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-isolation-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    let sequence = 0;
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => `cw_${++sequence}`,
    });
    try {
      const alpha = coworkers.create("ws_shared", "account_alpha", input({ name: "Alpha" }));
      const beta = coworkers.create("ws_shared", "account_beta", input({ name: "Beta" }));
      const otherWorkspace = coworkers.create("ws_other", "account_alpha", input({ name: "Other" }));
      expect(coworkers.list("ws_shared", "account_alpha").map((item) => item.id)).toEqual([alpha.id]);
      expect(coworkers.list("ws_shared", "account_beta").map((item) => item.id)).toEqual([beta.id]);
      expect(coworkers.list("ws_other", "account_alpha").map((item) => item.id)).toEqual([otherWorkspace.id]);
      expect(coworkers.get("ws_shared", "account_beta", alpha.id)).toBeNull();
      expect(coworkers.get("ws_other", "account_alpha", alpha.id)).toBeNull();
    } finally {
      store.close();
    }
  });

  test("purges every owner profile in only the selected workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-purge-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    let sequence = 0;
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => `cw_${++sequence}`,
    });
    try {
      const deletedStateOwner = coworkers.create("ws_delete", "account_alpha", input({ name: "Alpha" }));
      coworkers.create("ws_delete", "account_beta", input({ name: "Beta" }));
      const retained = coworkers.create("ws_keep", "account_alpha", input({ name: "Retained" }));
      coworkers.setWorkingState("ws_delete", "account_alpha", deletedStateOwner.id, workingStateInput());
      coworkers.setWorkingState("ws_keep", "account_alpha", retained.id, workingStateInput());
      expect(coworkers.purgeWorkspace("ws_delete")).toBe(2);
      expect(coworkers.list("ws_delete", "account_alpha")).toEqual([]);
      expect(coworkers.list("ws_delete", "account_beta")).toEqual([]);
      expect(store.getWorkingState("ws_delete", "account_alpha", deletedStateOwner.id)).toBeNull();
      expect(coworkers.list("ws_keep", "account_alpha").map((item) => item.id)).toEqual([retained.id]);
      expect(store.getWorkingState("ws_keep", "account_alpha", retained.id)?.coworkerId).toBe(retained.id);
    } finally {
      store.close();
    }
  });

  test("serializes edits with optimistic revisions and rebinds the policy version", () => {
    const { root, store, coworkers } = fixture("coworker-policy-1");
    const created = coworkers.create("ws_alpha", "account_alpha", input());
    const secondStore = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    const upgraded = new MatterhornCoworkers({
      store: secondStore,
      policyVersion: "coworker-policy-2",
      now: () => new Date("2026-09-01T12:01:00.000Z"),
    });
    try {
      expect(upgraded.resolveActive("ws_alpha", "account_alpha", created.id)).toBeNull();
      const updated = upgraded.update("ws_alpha", "account_alpha", created.id, {
        expectedRevision: 1,
        mission: "Compare Sui market evidence and retain citations.",
      });
      expect(updated.revision).toBe(2);
      expect(updated.policyVersion).toBe("coworker-policy-2");
      expect(upgraded.resolveActive("ws_alpha", "account_alpha", created.id)?.revision).toBe(2);
      expect(() => coworkers.update("ws_alpha", "account_alpha", created.id, {
        expectedRevision: 1,
        name: "Stale writer",
      })).toThrow(new MatterhornCoworkerError("coworker_revision_conflict"));
    } finally {
      secondStore.close();
      store.close();
    }
  });

  test("pauses immediately, makes revocation terminal, and deletes only with a fresh revision", () => {
    const invalidations: unknown[] = [];
    const { store, coworkers } = fixture("coworker-policy-1", invalidations);
    try {
      const created = coworkers.create("ws_alpha", "account_alpha", input());
      const paused = coworkers.transition("ws_alpha", "account_alpha", created.id, "paused", 1);
      expect(paused.revision).toBe(2);
      expect(coworkers.resolveActive("ws_alpha", "account_alpha", created.id)).toBeNull();
      expect(coworkers.matchesActiveBinding({
        id: paused.id,
        workspaceId: paused.workspaceId,
        ownerId: paused.ownerId,
        revision: paused.revision,
        policyVersion: paused.policyVersion,
      })).toBe(false);
      const resumed = coworkers.transition("ws_alpha", "account_alpha", created.id, "active", 2);
      const revoked = coworkers.transition("ws_alpha", "account_alpha", created.id, "revoked", resumed.revision);
      expect(() => coworkers.transition("ws_alpha", "account_alpha", created.id, "active", revoked.revision))
        .toThrow(new MatterhornCoworkerError("coworker_transition_invalid"));
      expect(() => coworkers.delete("ws_alpha", "account_alpha", created.id, revoked.revision - 1))
        .toThrow(new MatterhornCoworkerError("coworker_revision_conflict"));
      coworkers.delete("ws_alpha", "account_alpha", created.id, revoked.revision);
      expect(coworkers.get("ws_alpha", "account_alpha", created.id)).toBeNull();
      expect(invalidations).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason: "paused" }),
        expect.objectContaining({ reason: "revoked" }),
        expect.objectContaining({ reason: "deleted" }),
      ]));
    } finally {
      store.close();
    }
  });

  test("rejects unsafe budgets, authority broadening and malformed privacy labels", () => {
    const { store, coworkers } = fixture();
    try {
      const unsafeInputs: MatterhornCoworkerCreateInput[] = [
        input({ automaticAuthorities: ["submit" as never] }),
        input({ limits: { ...input().limits, dailyUsd: 1, perActionUsd: 2 } }),
        input({ privacy: { ...input().privacy, allowedDataLabels: ["secret" as never] } }),
        input({ automaticAuthorities: ["watch"], limits: { ...input().limits, maxActiveWatches: 0 } }),
      ];
      for (const unsafe of unsafeInputs) {
        expect(() => coworkers.create("ws_alpha", "account_alpha", unsafe))
          .toThrow(new MatterhornCoworkerError("coworker_input_invalid"));
      }
      expect(coworkers.list("ws_alpha", "account_alpha")).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("returns defensive copies instead of mutable store state", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input());
      (profile.allowedAppIds as string[]).push("malicious.app");
      (profile.limits as MatterhornCoworkerProfile["limits"]).dailyUsd = 999;
      const stored = coworkers.get("ws_alpha", "account_alpha", profile.id)!;
      expect(stored.allowedAppIds).toEqual(["matterhorn.sui-testnet"]);
      expect(stored.limits.dailyUsd).toBe(0);
    } finally {
      store.close();
    }
  });

  test("persists structured state without transcript replay and isolates it by tenant", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-state-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    let sequence = 0;
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => `cw_${++sequence}`,
    });
    try {
      const alpha = coworkers.create("ws_shared", "account_alpha", input({ name: "Alpha" }));
      const beta = coworkers.create("ws_shared", "account_beta", input({ name: "Beta" }));
      const state = coworkers.setWorkingState("ws_shared", "account_alpha", alpha.id, workingStateInput());
      expect(state).toMatchObject({ revision: 1, profileRevision: 1, coworkerId: alpha.id });
      expect(JSON.stringify(state)).not.toContain("transcript");
      expect(coworkers.getWorkingState("ws_shared", "account_alpha", alpha.id)?.decisions[0]?.id)
        .toBe("decision_watch_sui");
      expect(coworkers.getWorkingState("ws_shared", "account_beta", beta.id)).toBeNull();
      expect(() => coworkers.getWorkingState("ws_shared", "account_beta", alpha.id))
        .toThrow(new MatterhornCoworkerError("coworker_not_found"));

      const reopenedStore = new MatterhornCoworkerStore(join(root, "coworkers.db"));
      try {
        const reopened = new MatterhornCoworkers({ store: reopenedStore, policyVersion: "coworker-policy-1" });
        expect(reopened.getWorkingState("ws_shared", "account_alpha", alpha.id)?.approvedMemoryIds)
          .toEqual(["mem_public_strategy"]);
      } finally {
        reopenedStore.close();
      }
    } finally {
      store.close();
    }
  });

  test("persists an exact private resource scope and isolates it by workspace and owner", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-resources-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    let sequence = 0;
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => `cw_${++sequence}`,
    });
    const privateInput = input({
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: true,
      },
    });
    try {
      const alpha = coworkers.create("ws_shared", "account_alpha", privateInput);
      const beta = coworkers.create("ws_shared", "account_beta", privateInput);
      const scope = coworkers.setResourceScope(
        "ws_shared",
        "account_alpha",
        alpha.id,
        resourceScopeInput(),
      );
      expect(scope).toMatchObject({
        revision: 1,
        profileRevision: 1,
        coworkerId: alpha.id,
        privacy: { mode: "private_workspace", unverifiedProviderConsent: false },
      });
      expect(scope.scopeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(scope)).not.toContain("wallet export");
      expect(coworkers.getResourceScope("ws_shared", "account_alpha", alpha.id)?.scopeHash)
        .toBe(scope.scopeHash);
      expect(coworkers.getResourceScope("ws_shared", "account_beta", beta.id)).toBeNull();
      expect(() => coworkers.getResourceScope("ws_shared", "account_beta", alpha.id))
        .toThrow(new MatterhornCoworkerError("coworker_not_found"));

      const reopenedStore = new MatterhornCoworkerStore(join(root, "coworkers.db"));
      try {
        const reopened = new MatterhornCoworkers({ store: reopenedStore, policyVersion: "coworker-policy-1" });
        expect(reopened.getResourceScope("ws_shared", "account_alpha", alpha.id)?.connections)
          .toEqual(scope.connections);
      } finally {
        reopenedStore.close();
      }
    } finally {
      store.close();
    }
  });

  test("fails closed for stale, broadened, or privacy-incompatible resource scopes", () => {
    const { store, coworkers } = fixture();
    try {
      const publicProfile = coworkers.create("ws_alpha", "account_alpha", input());
      expect(() => coworkers.setResourceScope(
        "ws_alpha",
        "account_alpha",
        publicProfile.id,
        resourceScopeInput(),
      )).toThrow(new MatterhornCoworkerError("coworker_resource_scope_invalid"));

      const privateProfile = coworkers.update("ws_alpha", "account_alpha", publicProfile.id, {
        expectedRevision: publicProfile.revision,
        privacy: {
          allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
          allowUnverifiedProviderConsent: true,
        },
      });
      const created = coworkers.setResourceScope(
        "ws_alpha",
        "account_alpha",
        privateProfile.id,
        resourceScopeInput({ profileRevision: privateProfile.revision }),
      );
      expect(() => coworkers.setResourceScope(
        "ws_alpha",
        "account_alpha",
        privateProfile.id,
        resourceScopeInput({ profileRevision: privateProfile.revision }),
      )).toThrow(new MatterhornCoworkerError("coworker_revision_conflict"));
      expect(() => coworkers.setResourceScope(
        "ws_alpha",
        "account_alpha",
        privateProfile.id,
        resourceScopeInput({
          expectedRevision: created.revision,
          profileRevision: privateProfile.revision,
          connections: [{
            ...resourceScopeInput().connections[0],
            appId: "malicious.exchange",
          }],
        }),
      )).toThrow(new MatterhornCoworkerError("coworker_resource_scope_invalid"));

      const revised = coworkers.update("ws_alpha", "account_alpha", privateProfile.id, {
        expectedRevision: privateProfile.revision,
        mission: "Use only resources that the user reviews again after this change.",
      });
      expect(coworkers.resolveActiveResourceScope("ws_alpha", "account_alpha", privateProfile.id)).toBeNull();
      expect(coworkers.getResourceScope("ws_alpha", "account_alpha", privateProfile.id)?.profileRevision)
        .toBe(privateProfile.revision);
      coworkers.delete("ws_alpha", "account_alpha", privateProfile.id, revised.revision);
      expect(store.getResourceScope("ws_alpha", "account_alpha", privateProfile.id)).toBeNull();
    } finally {
      store.close();
    }
  });

  test("detects resource-scope mutation when durable state is reopened", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-resource-integrity-"));
    roots.push(root);
    const path = join(root, "coworkers.db");
    const store = new MatterhornCoworkerStore(path);
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => "cw_integrity",
    });
    const profile = coworkers.create("ws_alpha", "account_alpha", input({
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
      },
    }));
    coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, resourceScopeInput());
    store.close();

    const database = new Database(path);
    const row = database.query("SELECT scope_json FROM crypto_coworker_resource_scopes LIMIT 1")
      .get() as { scope_json: string };
    const tampered = JSON.parse(row.scope_json) as Record<string, unknown>;
    tampered.memories = [];
    database.query("UPDATE crypto_coworker_resource_scopes SET scope_json = ?")
      .run(JSON.stringify(tampered));
    database.close();

    const reopenedStore = new MatterhornCoworkerStore(path);
    try {
      const reopened = new MatterhornCoworkers({ store: reopenedStore, policyVersion: "coworker-policy-1" });
      expect(() => reopened.getResourceScope("ws_alpha", "account_alpha", profile.id))
        .toThrow(new MatterhornCoworkerStoreError("coworker_state_corrupt"));
    } finally {
      reopenedStore.close();
    }
  });

  test("rejects stale, malformed and secret-bearing structured state", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input());
      const created = coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput());
      expect(() => coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput()))
        .toThrow(new MatterhornCoworkerError("coworker_revision_conflict"));
      expect(() => coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput({
        expectedRevision: created.revision,
        decisions: [{
          ...workingStateInput().decisions[0]!,
          summary: `suiprivkey1${"q".repeat(58)}`,
        }],
      }))).toThrow(new MatterhornCoworkerError("coworker_working_state_invalid"));
      expect(() => coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput({
        expectedRevision: created.revision,
        decisions: [{
          ...workingStateInput().decisions[0]!,
          evidenceReferenceIds: ["missing_evidence"],
        }],
      }))).toThrow(new MatterhornCoworkerError("coworker_working_state_invalid"));
    } finally {
      store.close();
    }
  });

  test("clears pending financial work on policy or lifecycle changes and deletes state with the coworker", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input());
      coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput());
      const updated = coworkers.update("ws_alpha", "account_alpha", profile.id, {
        expectedRevision: profile.revision,
        mission: "Continue public research under the revised policy.",
      });
      expect(coworkers.getWorkingState("ws_alpha", "account_alpha", profile.id)).toMatchObject({
        revision: 2,
        profileRevision: updated.revision,
        pendingActions: [],
      });
      const paused = coworkers.transition("ws_alpha", "account_alpha", profile.id, "paused", updated.revision);
      expect(coworkers.getWorkingState("ws_alpha", "account_alpha", profile.id)).toMatchObject({
        revision: 3,
        profileRevision: paused.revision,
        pendingActions: [],
      });
      coworkers.delete("ws_alpha", "account_alpha", profile.id, paused.revision);
      expect(store.getWorkingState("ws_alpha", "account_alpha", profile.id)).toBeNull();
    } finally {
      store.close();
    }
  });

  test("persists bounded tenant-scoped watches and enforces the active-watch limit atomically", () => {
    const { root, store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
      expect(watch).toMatchObject({
        state: "active",
        pauseReason: null,
        profileRevision: profile.revision,
        connectionBinding: { connectionId: "cxc_sui", manifestRevision: "1.0.0" },
        schedule: { nextCheckAt: "2026-09-01T12:05:00.000Z", lastCheckedAt: null },
      });
      expect(coworkers.listWatches("ws_alpha", "account_alpha", profile.id)).toHaveLength(1);
      expect(() => coworkers.listWatches("ws_alpha", "account_beta", profile.id))
        .toThrow(new MatterhornCoworkerError("coworker_not_found"));
      expect(() => coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput({ name: "Second watch" })))
        .toThrow(new MatterhornCoworkerError("coworker_watch_limit"));

      const reopenedStore = new MatterhornCoworkerStore(join(root, "coworkers.db"));
      try {
        const reopened = new MatterhornCoworkers({ store: reopenedStore, policyVersion: "coworker-policy-1" });
        expect(reopened.getWatch("ws_alpha", "account_alpha", profile.id, watch.id)?.conditions[0]?.operator)
          .toBe("changed");
      } finally {
        reopenedStore.close();
      }
    } finally {
      store.close();
    }
  });

  test("pauses only active watches bound to a disconnected app connection", () => {
    const { store, coworkers } = fixture();
    try {
      const profileInput = input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      });
      const alpha = coworkers.create("ws_shared", "account_alpha", profileInput);
      const beta = coworkers.create("ws_shared", "account_beta", profileInput);
      const otherWorkspace = coworkers.create("ws_other", "account_alpha", profileInput);
      for (const [workspaceId, ownerId, profile] of [
        ["ws_shared", "account_alpha", alpha],
        ["ws_shared", "account_beta", beta],
        ["ws_other", "account_alpha", otherWorkspace],
      ] as const) {
        coworkers.setResourceScope(workspaceId, ownerId, profile.id, watchResourceScopeInput());
        coworkers.createWatch(workspaceId, ownerId, profile.id, watchInput());
      }

      expect(coworkers.pauseWatchesForConnection("ws_shared", "cxc_sui")).toBe(2);
      expect(coworkers.listWatches("ws_shared", "account_alpha", alpha.id)[0]).toMatchObject({
        revision: 2,
        state: "paused",
        pauseReason: "app_disconnected",
      });
      expect(coworkers.listWatches("ws_shared", "account_beta", beta.id)[0]).toMatchObject({
        revision: 2,
        state: "paused",
        pauseReason: "app_disconnected",
      });
      expect(coworkers.listWatches("ws_other", "account_alpha", otherWorkspace.id)[0]).toMatchObject({
        revision: 1,
        state: "active",
        pauseReason: null,
      });
      expect(coworkers.pauseWatchesForConnection("ws_shared", "cxc_sui")).toBe(0);
    } finally {
      store.close();
    }
  });

  test("requires the exact app connection to be active before a paused watch can resume", () => {
    let connectionActive = true;
    const { store, coworkers } = fixture(
      "coworker-policy-1",
      [],
      (binding) => connectionActive
        && binding.workspaceId === "ws_alpha"
        && binding.connectionId === "cxc_sui"
        && binding.manifestRevision === "1.0.0",
    );
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
      expect(coworkers.pauseWatchesForConnection("ws_alpha", "cxc_sui")).toBe(1);
      connectionActive = false;
      expect(() => coworkers.transitionWatch(
        "ws_alpha", "account_alpha", profile.id, watch.id, "active", 2,
      )).toThrow(new MatterhornCoworkerError("coworker_watch_invalid"));
      connectionActive = true;
      expect(coworkers.transitionWatch(
        "ws_alpha", "account_alpha", profile.id, watch.id, "active", 2,
      )).toMatchObject({ revision: 3, state: "active", pauseReason: null });
    } finally {
      store.close();
    }
  });

  test("rejects watches outside profile scope, budgets, cadence, or secret boundary", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 2 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      const unsafe: MatterhornCoworkerWatchCreateInput[] = [
        watchInput({ connectionId: "unapproved_connection" }),
        watchInput({ appId: "unapproved.app" }),
        watchInput({ actionId: "unapproved_action" }),
        watchInput({ network: "sui:mainnet" }),
        watchInput({ budgets: { ...watchInput().budgets, maxReadCallsPerCheck: 13 } }),
        watchInput({ schedule: { intervalMs: 1_000, maxChecksPerDay: 1_000 } }),
        watchInput({ parameters: { privateKey: "secret material" } }),
        watchInput({ parameters: { note: `suiprivkey1${"r".repeat(58)}` } }),
        watchInput({
          conditions: [{ id: "unsafe_hash", metric: "matterhorn_result_hash", operator: "eq", value: "attacker" }],
        }),
      ];
      for (const candidate of unsafe) {
        expect(() => coworkers.createWatch("ws_alpha", "account_alpha", profile.id, candidate))
          .toThrow(new MatterhornCoworkerError("coworker_watch_invalid"));
      }
      expect(coworkers.listWatches("ws_alpha", "account_alpha", profile.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("rejects secret-shaped values returned by a scheduled check", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
      const [claimed] = coworkers.claimDueWatches(new Date("2026-09-01T12:05:00.000Z"));

      expect(() => coworkers.completeWatchCheck(claimed!, {
        checkedAt: new Date("2026-09-01T12:05:01.000Z"),
        resultHash: "f".repeat(64),
        conditionValues: { balance_changed: `suiprivkey1${"s".repeat(58)}` },
        inboxItem: null,
      })).toThrow(new MatterhornCoworkerError("coworker_watch_invalid"));
    } finally {
      store.close();
    }
  });

  test("rescans restored profile, state, watch, and inbox rows before use", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-secret-rescan-"));
    roots.push(root);
    const path = join(root, "coworkers.db");
    const store = new MatterhornCoworkerStore(path);
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => "cw_secret_rescan",
      watchId: () => "cwatch_secret_rescan",
      inboxItemId: () => "cinbox_secret_rescan",
    });
    const profile = coworkers.create("ws_alpha", "account_alpha", input({
      automaticAuthorities: ["read", "watch"],
      limits: { ...input().limits, maxActiveWatches: 1 },
    }));
    coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
    coworkers.setWorkingState("ws_alpha", "account_alpha", profile.id, workingStateInput());
    const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
    const item = coworkers.createInboxItem("ws_alpha", "account_alpha", profile.id, inboxInput(watch.id));
    store.close();

    const secret = `suiprivkey1${"t".repeat(58)}`;
    const database = new Database(path);
    const mutations = [
      ["crypto_coworkers", "profile_json", "mission"],
      ["crypto_coworker_working_state", "state_json", "decisions"],
      ["crypto_coworker_watches", "watch_json", "parameters"],
      ["crypto_coworker_inbox", "item_json", "summary"],
    ] as const;
    for (const [table, column, field] of mutations) {
      const row = database.query(`SELECT ${column} AS payload FROM ${table} LIMIT 1`)
        .get() as { payload: string };
      const payload = JSON.parse(row.payload) as Record<string, any>;
      if (field === "decisions") payload.decisions[0].summary = secret;
      else if (field === "parameters") payload.parameters.note = secret;
      else payload[field] = secret;
      database.query(`UPDATE ${table} SET ${column} = ?`).run(JSON.stringify(payload));
    }
    database.close();

    const reopened = new MatterhornCoworkerStore(path);
    try {
      expect(() => reopened.get("ws_alpha", "account_alpha", profile.id))
        .toThrow(new MatterhornCoworkerStoreError("coworker_state_corrupt"));
      expect(() => reopened.getWorkingState("ws_alpha", "account_alpha", profile.id))
        .toThrow(new MatterhornCoworkerStoreError("coworker_state_corrupt"));
      expect(() => reopened.getWatch("ws_alpha", "account_alpha", profile.id, watch.id))
        .toThrow(new MatterhornCoworkerStoreError("coworker_state_corrupt"));
      expect(() => reopened.getInboxItem("ws_alpha", "account_alpha", profile.id, item.id))
        .toThrow(new MatterhornCoworkerStoreError("coworker_state_corrupt"));
    } finally {
      reopened.close();
    }
  });

  test("pauses every schedule on profile or lifecycle changes and requires an explicit safe resume", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 2 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
      const updated = coworkers.update("ws_alpha", "account_alpha", profile.id, {
        expectedRevision: profile.revision,
        mission: "Monitor the approved Sui balance and surface only evidence-backed changes.",
      });
      expect(coworkers.getWatch("ws_alpha", "account_alpha", profile.id, watch.id)).toMatchObject({
        state: "paused",
        pauseReason: "profile_changed",
        profileRevision: updated.revision,
      });
      expect(() => coworkers.transitionWatch(
        "ws_alpha", "account_alpha", profile.id, watch.id, "active", 2,
      )).toThrow(new MatterhornCoworkerError("coworker_watch_invalid"));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput({
        expectedRevision: 1,
        profileRevision: updated.revision,
      }));
      const resumedWatch = coworkers.transitionWatch(
        "ws_alpha", "account_alpha", profile.id, watch.id, "active", 2,
      );
      expect(resumedWatch).toMatchObject({ state: "active", pauseReason: null, profileRevision: updated.revision });
      const pausedCoworker = coworkers.transition("ws_alpha", "account_alpha", profile.id, "paused", updated.revision);
      expect(coworkers.getWatch("ws_alpha", "account_alpha", profile.id, watch.id)).toMatchObject({
        state: "paused",
        pauseReason: "coworker_paused",
        profileRevision: pausedCoworker.revision,
      });
      expect(store.listDueWatches("2026-09-02T00:00:00.000Z")).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("stores evidence-backed inbox alerts without transaction authority and isolates their state", () => {
    const { store, coworkers } = fixture();
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());
      const item = coworkers.createInboxItem("ws_alpha", "account_alpha", profile.id, inboxInput(watch.id));
      expect(item).toMatchObject({ state: "unread", watchId: watch.id, kind: "alert" });
      expect(JSON.stringify(item)).not.toMatch(/sign|submit|relay|broadcast|private.?key/i);
      expect(coworkers.listInbox({ workspaceId: "ws_alpha", ownerId: "account_alpha", coworkerId: profile.id }))
        .toHaveLength(1);
      expect(() => coworkers.listInbox({ workspaceId: "ws_alpha", ownerId: "account_beta", coworkerId: profile.id }))
        .toThrow(new MatterhornCoworkerError("coworker_not_found"));
      const read = coworkers.transitionInboxItem(
        "ws_alpha",
        "account_alpha",
        profile.id,
        item.id,
        "read",
        "unread",
      );
      expect(read.state).toBe("read");
      expect(() => coworkers.transitionInboxItem(
        "ws_alpha",
        "account_alpha",
        profile.id,
        item.id,
        "dismissed",
        "unread",
      )).toThrow(new MatterhornCoworkerError("coworker_inbox_state_conflict"));
      expect(() => coworkers.createInboxItem("ws_alpha", "account_alpha", profile.id, inboxInput(watch.id, {
        summary: `suiprivkey1${"u".repeat(58)}`,
      }))).toThrow(new MatterhornCoworkerError("coworker_inbox_item_invalid"));
      expect(() => coworkers.createInboxItem("ws_alpha", "account_alpha", profile.id, inboxInput(watch.id, {
        budgetImpact: { readCallsConsumed: 2, modelTokensConsumed: 0, costMicros: 1_000 },
      }))).toThrow(new MatterhornCoworkerError("coworker_inbox_item_invalid"));

      coworkers.delete("ws_alpha", "account_alpha", profile.id, profile.revision);
      expect(store.getWatch("ws_alpha", "account_alpha", profile.id, watch.id)).toBeNull();
      expect(store.getInboxItem("ws_alpha", "account_alpha", profile.id, item.id)).toBeNull();
    } finally {
      store.close();
    }
  });

  test("stops scheduled checks at claim and completion boundaries after invite revocation", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-access-watch-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    const access = new MatterhornCoworkerAccess({ store, now: () => new Date(NOW) });
    const invite = access.issueInvite();
    access.accept("account_alpha", invite.token);
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date(NOW),
      id: () => "cw_access_watch",
      watchId: () => "cwatch_access_watch",
      enforceAccountAccess: true,
      accountIsAllowed: (ownerId) => access.isAllowed(ownerId),
    });
    try {
      const profile = coworkers.create("ws_alpha", "account_alpha", input({
        automaticAuthorities: ["read", "watch"],
        limits: { ...input().limits, maxActiveWatches: 1 },
      }));
      coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, watchResourceScopeInput());
      coworkers.createWatch("ws_alpha", "account_alpha", profile.id, watchInput());

      access.revoke("account_alpha");
      expect(coworkers.claimDueWatches(new Date("2026-09-01T12:05:00.000Z"))).toEqual([]);
      const replacement = access.issueInvite();
      access.accept("account_alpha", replacement.token);
      const [claimed] = coworkers.claimDueWatches(new Date("2026-09-01T12:05:00.000Z"));
      expect(claimed?.id).toBe("cwatch_access_watch");

      access.revoke("account_alpha");
      expect(coworkers.completeWatchCheck(claimed!, {
        checkedAt: new Date("2026-09-01T12:05:01.000Z"),
        resultHash: "f".repeat(64),
        conditionValues: { balance_changed: "true" },
        inboxItem: null,
      })).toBeNull();
      expect(() => coworkers.listWatches("ws_alpha", "account_alpha", profile.id))
        .toThrow(new MatterhornCoworkerError("coworker_access_required"));
    } finally {
      store.close();
    }
  });
});
