import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  coworkerRuntimeDatabaseExists,
  createMatterhornCoworkerRuntime,
  MatterhornCoworkerRuntimeConfigurationError,
} from "./crypto-coworker-runtime.js";

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
});
