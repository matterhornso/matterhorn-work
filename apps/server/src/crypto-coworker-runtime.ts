import { existsSync } from "node:fs";

import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import { cryptoCoworkerFeatureConfig, type MatterhornCoworkerMode } from "./crypto-coworker-config.js";
import { MatterhornCoworkers } from "./crypto-coworkers.js";

export type MatterhornCoworkerRuntimeServices = {
  mode: MatterhornCoworkerMode;
  ready: boolean;
  coworkers: MatterhornCoworkers | null;
  close(): void;
};

export class MatterhornCoworkerRuntimeConfigurationError extends Error {
  constructor(public readonly code: "coworker_policy_version_required") {
    super(code);
    this.name = "MatterhornCoworkerRuntimeConfigurationError";
  }
}

const POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;

/**
 * Persistent Phase 2 profile boundary. Off mode performs no filesystem access.
 * Misconfigured invite/public rollout remains visible but has no usable service.
 */
export function createMatterhornCoworkerRuntime(
  env: NodeJS.ProcessEnv = process.env,
): MatterhornCoworkerRuntimeServices {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (feature.coworkerMode === "off") {
    return { mode: "off", ready: true, coworkers: null, close: () => undefined };
  }
  if (!feature.ready) {
    return { mode: feature.coworkerMode, ready: false, coworkers: null, close: () => undefined };
  }
  const policyVersion = env.MATTERHORN_COWORKER_POLICY_VERSION?.trim() ?? "";
  if (!POLICY_VERSION_PATTERN.test(policyVersion)) {
    throw new MatterhornCoworkerRuntimeConfigurationError("coworker_policy_version_required");
  }
  const storePath = env.MATTERHORN_COWORKER_DB?.trim();
  const store = new MatterhornCoworkerStore(storePath || undefined);
  const coworkers = new MatterhornCoworkers({ store, policyVersion });
  return {
    mode: feature.coworkerMode,
    ready: true,
    coworkers,
    close: () => store.close(),
  };
}

/** Test-only observability; never reveals profile content. */
export function coworkerRuntimeDatabaseExists(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MATTERHORN_COWORKER_DB && existsSync(env.MATTERHORN_COWORKER_DB));
}
