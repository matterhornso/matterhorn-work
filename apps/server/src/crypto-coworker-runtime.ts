import { existsSync } from "node:fs";

import {
  MATTERHORN_COWORKER_ACCESS_STATUS_VERSION,
  MatterhornCoworkerAccess,
  type MatterhornCoworkerAccessStatus,
} from "./crypto-coworker-access.js";
import {
  MatterhornCoworkerStore,
  type MatterhornCoworkerAccessMaintenanceResult,
  type MatterhornCoworkerAccessPurgeResult,
} from "./crypto-coworker-store.js";
import { cryptoCoworkerFeatureConfig, type MatterhornCoworkerMode } from "./crypto-coworker-config.js";
import { MatterhornCoworkers } from "./crypto-coworkers.js";
import type { MatterhornCoworkerRunBinding } from "./agent-capability.js";

export type MatterhornCoworkerRuntimeServices = {
  mode: MatterhornCoworkerMode;
  ready: boolean;
  access: MatterhornCoworkerAccess | null;
  coworkers: MatterhornCoworkers | null;
  accountIsAllowed(ownerId: string): boolean;
  accountAccessStatus(ownerId: string): MatterhornCoworkerAccessStatus;
  purgeAccountAccess(ownerId: string): MatterhornCoworkerAccessPurgeResult;
  maintainAccessMetadata(): MatterhornCoworkerAccessMaintenanceResult;
  close(): void;
};

const EMPTY_ACCESS_PURGE: MatterhornCoworkerAccessPurgeResult = {
  accessDeleted: 0,
  inviteBindingsCleared: 0,
};

const EMPTY_ACCESS_MAINTENANCE: MatterhornCoworkerAccessMaintenanceResult = {
  revokedAccessDeleted: 0,
  invitesDeleted: 0,
};

export class MatterhornCoworkerRuntimeConfigurationError extends Error {
  constructor(public readonly code:
    | "coworker_policy_version_required"
    | "coworker_integrity_secret_required") {
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
  options: {
    onInvalidate?: ConstructorParameters<typeof MatterhornCoworkers>[0]["onInvalidate"];
    connectionIsActive?: ConstructorParameters<typeof MatterhornCoworkers>[0]["connectionIsActive"];
    now?: () => Date;
  } = {},
): MatterhornCoworkerRuntimeServices {
  const feature = cryptoCoworkerFeatureConfig(env);
  if (feature.coworkerMode === "off") {
    return {
      mode: "off",
      ready: true,
      access: null,
      coworkers: null,
      accountIsAllowed: () => false,
      accountAccessStatus: () => ({
        version: MATTERHORN_COWORKER_ACCESS_STATUS_VERSION,
        allowed: false,
        acceptedAt: null,
      }),
      purgeAccountAccess: () => EMPTY_ACCESS_PURGE,
      maintainAccessMetadata: () => EMPTY_ACCESS_MAINTENANCE,
      close: () => undefined,
    };
  }
  if (!feature.ready) {
    return {
      mode: feature.coworkerMode,
      ready: false,
      access: null,
      coworkers: null,
      accountIsAllowed: () => false,
      accountAccessStatus: () => ({
        version: MATTERHORN_COWORKER_ACCESS_STATUS_VERSION,
        allowed: false,
        acceptedAt: null,
      }),
      purgeAccountAccess: () => EMPTY_ACCESS_PURGE,
      maintainAccessMetadata: () => EMPTY_ACCESS_MAINTENANCE,
      close: () => undefined,
    };
  }
  const policyVersion = env.MATTERHORN_COWORKER_POLICY_VERSION?.trim() ?? "";
  if (!POLICY_VERSION_PATTERN.test(policyVersion)) {
    throw new MatterhornCoworkerRuntimeConfigurationError("coworker_policy_version_required");
  }
  const integritySecret = env.MATTERHORN_COWORKER_INTEGRITY_SECRET ?? "";
  if (Buffer.byteLength(integritySecret, "utf8") < 32) {
    throw new MatterhornCoworkerRuntimeConfigurationError("coworker_integrity_secret_required");
  }
  const storePath = env.MATTERHORN_COWORKER_DB?.trim();
  const store = new MatterhornCoworkerStore(storePath || undefined, integritySecret);
  const access = feature.coworkerMode === "invite"
    ? new MatterhornCoworkerAccess({ store, ...(options.now ? { now: options.now } : {}) })
    : null;
  const accountIsAllowed = (ownerId: string) => feature.coworkerMode !== "invite"
    || Boolean(access?.isAllowed(ownerId));
  const coworkers = new MatterhornCoworkers({
    store,
    policyVersion,
    ...(options.now ? { now: options.now } : {}),
    enforceAccountAccess: feature.coworkerMode === "invite",
    accountIsAllowed,
    onInvalidate: options.onInvalidate,
    connectionIsActive: options.connectionIsActive,
  });
  return {
    mode: feature.coworkerMode,
    ready: true,
    access,
    coworkers,
    accountIsAllowed,
    accountAccessStatus: (ownerId) => {
      if (feature.coworkerMode === "invite" && access) return access.getStatus(ownerId);
      return {
        version: MATTERHORN_COWORKER_ACCESS_STATUS_VERSION,
        allowed: true,
        acceptedAt: null,
      };
    },
    purgeAccountAccess: (ownerId) => access?.purgeAccount(ownerId) ?? EMPTY_ACCESS_PURGE,
    maintainAccessMetadata: () => access?.pruneExpiredMetadata() ?? EMPTY_ACCESS_MAINTENANCE,
    close: () => store.close(),
  };
}

export function coworkerBindingIsActive(
  runtime: MatterhornCoworkerRuntimeServices,
  binding: MatterhornCoworkerRunBinding,
): boolean {
  return runtime.coworkers?.matchesActiveBinding(binding) ?? false;
}

/** Test-only observability; never reveals profile content. */
export function coworkerRuntimeDatabaseExists(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MATTERHORN_COWORKER_DB && existsSync(env.MATTERHORN_COWORKER_DB));
}
