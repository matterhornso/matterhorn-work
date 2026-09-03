import { createHash, randomBytes } from "node:crypto";

import {
  MatterhornCoworkerStore,
  MatterhornCoworkerStoreError,
  type MatterhornCoworkerAccessRecord,
} from "./crypto-coworker-store.js";

export const MATTERHORN_COWORKER_ACCESS_STATUS_VERSION = "matterhorn.coworker-access-status.v1" as const;

export type MatterhornCoworkerAccessStatus = {
  version: typeof MATTERHORN_COWORKER_ACCESS_STATUS_VERSION;
  allowed: boolean;
  acceptedAt: string | null;
};

export class MatterhornCoworkerAccessError extends Error {
  constructor(public readonly code:
    | "coworker_access_input_invalid"
    | "coworker_access_invite_invalid"
    | "coworker_access_invite_expired"
    | "coworker_access_invite_consumed"
    | "coworker_access_already_active"
    | "coworker_access_not_found") {
    super(code);
    this.name = "MatterhornCoworkerAccessError";
  }
}

const OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const INVITE_TOKEN_PATTERN = /^mhci_[A-Za-z0-9_-]{40,96}$/;
const MAX_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

function inviteHash(token: string): string {
  return createHash("sha256").update(`matterhorn.coworker-access-invite.v1\u0000${token}`).digest("hex");
}

function mapStoreError(error: unknown): never {
  if (error instanceof MatterhornCoworkerStoreError && (
    error.code === "coworker_access_invite_invalid"
    || error.code === "coworker_access_invite_expired"
    || error.code === "coworker_access_invite_consumed"
    || error.code === "coworker_access_already_active"
    || error.code === "coworker_access_not_found"
  )) {
    throw new MatterhornCoworkerAccessError(error.code);
  }
  throw error;
}

function status(record: MatterhornCoworkerAccessRecord | null): MatterhornCoworkerAccessStatus {
  return {
    version: MATTERHORN_COWORKER_ACCESS_STATUS_VERSION,
    allowed: record?.state === "active",
    acceptedAt: record?.state === "active" ? record.grantedAt : null,
  };
}

/**
 * Durable account boundary for invite-only Crypto Coworkers. Raw invite tokens
 * are returned once to the host and are never persisted.
 */
export class MatterhornCoworkerAccess {
  readonly #store: MatterhornCoworkerStore;
  readonly #now: () => Date;

  constructor(options: { store: MatterhornCoworkerStore; now?: () => Date }) {
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
  }

  issueInvite(ttlMs = 24 * 60 * 60 * 1_000): { token: string; expiresAt: string } {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > MAX_INVITE_TTL_MS) {
      throw new MatterhornCoworkerAccessError("coworker_access_input_invalid");
    }
    const now = this.#now();
    const token = `mhci_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    this.#store.issueAccessInvite(inviteHash(token), expiresAt, now.toISOString());
    return { token, expiresAt };
  }

  accept(ownerId: string, token: string): MatterhornCoworkerAccessStatus {
    if (!OWNER_ID_PATTERN.test(ownerId) || !INVITE_TOKEN_PATTERN.test(token)) {
      throw new MatterhornCoworkerAccessError("coworker_access_input_invalid");
    }
    try {
      return status(this.#store.consumeAccessInvite({
        inviteHash: inviteHash(token),
        ownerId,
        now: this.#now().toISOString(),
      }));
    } catch (error) {
      mapStoreError(error);
    }
  }

  getStatus(ownerId: string): MatterhornCoworkerAccessStatus {
    if (!OWNER_ID_PATTERN.test(ownerId)) {
      throw new MatterhornCoworkerAccessError("coworker_access_input_invalid");
    }
    return status(this.#store.getAccountAccess(ownerId));
  }

  isAllowed(ownerId: string): boolean {
    return OWNER_ID_PATTERN.test(ownerId) && this.#store.getAccountAccess(ownerId)?.state === "active";
  }

  revoke(ownerId: string): MatterhornCoworkerAccessStatus {
    if (!OWNER_ID_PATTERN.test(ownerId)) {
      throw new MatterhornCoworkerAccessError("coworker_access_input_invalid");
    }
    try {
      return status(this.#store.revokeAccountAccess(ownerId, this.#now().toISOString()));
    } catch (error) {
      mapStoreError(error);
    }
  }

  list(limit = 100): MatterhornCoworkerAccessRecord[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new MatterhornCoworkerAccessError("coworker_access_input_invalid");
    }
    return this.#store.listAccountAccess(limit);
  }
}
