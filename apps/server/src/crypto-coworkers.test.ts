import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { MatterhornCoworkerProfile } from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import {
  MatterhornCoworkerError,
  MatterhornCoworkers,
  type MatterhornCoworkerCreateInput,
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

function fixture(policyVersion = "coworker-policy-1", invalidations: unknown[] = []) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-coworkers-"));
  roots.push(root);
  const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
  const coworkers = new MatterhornCoworkers({
    store,
    policyVersion,
    now: () => new Date(NOW),
    id: () => "cw_market_analyst",
    onInvalidate: (event) => invalidations.push(event),
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
      coworkers.create("ws_delete", "account_alpha", input({ name: "Alpha" }));
      coworkers.create("ws_delete", "account_beta", input({ name: "Beta" }));
      const retained = coworkers.create("ws_keep", "account_alpha", input({ name: "Retained" }));
      expect(coworkers.purgeWorkspace("ws_delete")).toBe(2);
      expect(coworkers.list("ws_delete", "account_alpha")).toEqual([]);
      expect(coworkers.list("ws_delete", "account_beta")).toEqual([]);
      expect(coworkers.list("ws_keep", "account_alpha").map((item) => item.id)).toEqual([retained.id]);
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
});
