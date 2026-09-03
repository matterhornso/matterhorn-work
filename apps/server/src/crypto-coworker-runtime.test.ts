import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  coworkerRuntimeDatabaseExists,
  createMatterhornCoworkerRuntime,
  MatterhornCoworkerRuntimeConfigurationError,
} from "./crypto-coworker-runtime.js";
import { MatterhornCoworkerError } from "./crypto-coworkers.js";

const INVITE_ENV = {
  MATTERHORN_COWORKER_MODE: "invite",
  MATTERHORN_COWORKER_POLICY_VERSION: "coworker-policy-1",
  MATTERHORN_CRYPTO_APP_GATEWAY_MODE: "enforce",
  MATTERHORN_GUARDED_RUNTIME_MODE: "enforce",
} as const;

describe("crypto coworker runtime startup", () => {
  test("performs no database access while coworker mode is off", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-off-"));
    const path = join(root, "coworkers.db");
    try {
      const env = { MATTERHORN_COWORKER_DB: path };
      const runtime = createMatterhornCoworkerRuntime(env);
      expect(runtime).toMatchObject({ mode: "off", ready: true, coworkers: null });
      expect(coworkerRuntimeDatabaseExists(env)).toBe(false);
      runtime.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("requires an explicit policy version before opening persistent state", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-policy-"));
    const path = join(root, "coworkers.db");
    try {
      const env = { MATTERHORN_COWORKER_MODE: "internal", MATTERHORN_COWORKER_DB: path };
      expect(() => createMatterhornCoworkerRuntime(env))
        .toThrow(new MatterhornCoworkerRuntimeConfigurationError("coworker_policy_version_required"));
      expect(coworkerRuntimeDatabaseExists(env)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("opens durable internal state with a bounded policy version", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-on-"));
    const path = join(root, "coworkers.db");
    try {
      const env = {
        MATTERHORN_COWORKER_MODE: "internal",
        MATTERHORN_COWORKER_POLICY_VERSION: "coworker-policy-1",
        MATTERHORN_COWORKER_DB: path,
      };
      const runtime = createMatterhornCoworkerRuntime(env);
      expect(runtime).toMatchObject({ mode: "internal", ready: true });
      expect(runtime.coworkers).not.toBeNull();
      expect(coworkerRuntimeDatabaseExists(env)).toBe(true);
      runtime.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not open a service for an unsafe invite rollout", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-unsafe-"));
    const path = join(root, "coworkers.db");
    try {
      const env = {
        MATTERHORN_COWORKER_MODE: "invite",
        MATTERHORN_COWORKER_POLICY_VERSION: "coworker-policy-1",
        MATTERHORN_COWORKER_DB: path,
        MATTERHORN_CRYPTO_APP_GATEWAY_MODE: "shadow",
      };
      const runtime = createMatterhornCoworkerRuntime(env);
      expect(runtime).toMatchObject({ mode: "invite", ready: false, coworkers: null });
      expect(coworkerRuntimeDatabaseExists(env)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("enforces durable invite access across coworker resolution and revocation", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-invite-"));
    const path = join(root, "coworkers.db");
    try {
      const runtime = createMatterhornCoworkerRuntime({
        ...INVITE_ENV,
        MATTERHORN_COWORKER_DB: path,
      });
      expect(runtime).toMatchObject({ mode: "invite", ready: true });
      expect(runtime.access).not.toBeNull();
      expect(runtime.accountIsAllowed("account-a")).toBe(false);
      expect(() => runtime.coworkers?.list("workspace-a", "account-a"))
        .toThrow(new MatterhornCoworkerError("coworker_access_required"));

      const invite = runtime.access!.issueInvite();
      expect(runtime.access!.accept("account-a", invite.token)).toMatchObject({ allowed: true });
      const coworker = runtime.coworkers!.create("workspace-a", "account-a", {
        name: "Market Analyst",
        role: "market_analyst",
        mission: "Research approved public crypto evidence.",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        allowedAssets: ["SUI"],
        automaticAuthorities: ["read"],
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
      });
      expect(runtime.coworkers!.resolveActive("workspace-a", "account-a", coworker.id)?.id).toBe(coworker.id);

      runtime.access!.revoke("account-a");
      expect(runtime.accountIsAllowed("account-a")).toBe(false);
      expect(runtime.coworkers!.resolveActive("workspace-a", "account-a", coworker.id)).toBeNull();
      expect(runtime.coworkers!.matchesActiveBinding({
        id: coworker.id,
        workspaceId: coworker.workspaceId,
        ownerId: coworker.ownerId,
        revision: coworker.revision,
        policyVersion: coworker.policyVersion,
      })).toBe(false);
      runtime.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
