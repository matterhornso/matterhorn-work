import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "./guarded-runtime-crypto.js";
import type {
  GuardedRuntimeStateKind,
  GuardedRuntimeStateRecord,
} from "./guarded-runtime-state-store.js";

const AUTHORITY_VERSION = "matterhorn.durable-state-authority-envelope.v1" as const;
const AUTHORITY_DOMAIN = "matterhorn:durable-state-authority:v1";
const AUTHORITY_SALT = Buffer.from("matterhorn:durable-state-authority:salt:v1", "utf8");
const MINIMUM_SECRET_BYTES = 32;
const SEAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type MatterhornDurableStateAuthorityEnvelope<T> = {
  version: typeof AUTHORITY_VERSION;
  value: T;
  authoritySeal: string;
};

function exactEnvelope(value: unknown): value is MatterhornDurableStateAuthorityEnvelope<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3
    && keys[0] === "authoritySeal"
    && keys[1] === "value"
    && keys[2] === "version"
    && (value as { version?: unknown }).version === AUTHORITY_VERSION
    && typeof (value as { authoritySeal?: unknown }).authoritySeal === "string";
}

function authorityValue<T>(input: {
  kind: GuardedRuntimeStateKind;
  key: string;
  workspaceId: string;
  sessionId?: string | null;
  expiresAtMs?: number | null;
  updatedAtMs: number;
  value: T;
}) {
  return {
    domain: AUTHORITY_DOMAIN,
    kind: input.kind,
    key: input.key,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    expiresAtMs: input.expiresAtMs ?? null,
    updatedAtMs: input.updatedAtMs,
    value: input.value,
  };
}

/**
 * Authenticates security-relevant SQLite payloads and their row metadata.
 *
 * Encryption protects private bytes, but it does not authenticate mutable
 * outer fields such as tenant ownership, record revision, publication state,
 * or expiry. This server-only authority seals those fields before persistence
 * and rejects legacy, wrong-key, transplanted, or mutated rows on admission.
 */
export class MatterhornDurableStateAuthority {
  readonly #key: Buffer;

  constructor(secret: string) {
    const input = Buffer.from(secret, "utf8");
    if (input.byteLength < MINIMUM_SECRET_BYTES) {
      input.fill(0);
      throw new Error("durable_state_integrity_secret_invalid");
    }
    try {
      this.#key = Buffer.from(hkdfSync(
        "sha256",
        input,
        AUTHORITY_SALT,
        AUTHORITY_DOMAIN,
        32,
      ));
    } finally {
      input.fill(0);
    }
  }

  seal<T>(input: {
    kind: GuardedRuntimeStateKind;
    key: string;
    workspaceId: string;
    sessionId?: string | null;
    expiresAtMs?: number | null;
    updatedAtMs: number;
    value: T;
  }): MatterhornDurableStateAuthorityEnvelope<T> {
    const value = structuredClone(input.value);
    const signed = authorityValue({ ...input, value });
    return {
      version: AUTHORITY_VERSION,
      value,
      authoritySeal: createHmac("sha256", this.#key)
        .update(canonicalJson(signed), "utf8")
        .digest("base64url"),
    };
  }

  open<T>(
    record: GuardedRuntimeStateRecord<unknown> | null,
    invalidCode = "durable_state_integrity_invalid",
  ): T | null {
    if (!record) return null;
    if (!exactEnvelope(record.value) || !SEAL_PATTERN.test(record.value.authoritySeal)) {
      throw new Error(invalidCode);
    }
    const signed = authorityValue({
      kind: record.kind,
      key: record.key,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      expiresAtMs: record.expiresAtMs,
      updatedAtMs: record.updatedAtMs,
      value: record.value.value,
    });
    const expected = Buffer.from(
      createHmac("sha256", this.#key).update(canonicalJson(signed), "utf8").digest("base64url"),
      "base64url",
    );
    const actual = Buffer.from(record.value.authoritySeal, "base64url");
    try {
      if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
        throw new Error(invalidCode);
      }
    } finally {
      expected.fill(0);
      actual.fill(0);
    }
    return structuredClone(record.value.value) as T;
  }

  close(): void {
    this.#key.fill(0);
  }
}
