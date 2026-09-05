import { describe, expect, test } from "bun:test";

import {
  MatterhornDurableStateAuthority,
  type MatterhornDurableStateAuthorityEnvelope,
} from "./durable-state-authority.js";
import type { GuardedRuntimeStateRecord } from "./guarded-runtime-state-store.js";

const SECRET_A = "durable-state-authority-unit-secret-a-at-least-32-bytes";
const SECRET_B = "durable-state-authority-unit-secret-b-at-least-32-bytes";
const UPDATED_AT = Date.parse("2026-09-05T00:00:00.000Z");

type ProtectedValue = {
  revision: number;
  publication: { blobId: string } | null;
};

function sealedRecord(
  authority: MatterhornDurableStateAuthority,
): GuardedRuntimeStateRecord<MatterhornDurableStateAuthorityEnvelope<ProtectedValue>> {
  const value: ProtectedValue = { revision: 7, publication: { blobId: "blob_exact" } };
  return {
    kind: "crypto_evidence_record",
    key: "evidence_exact",
    workspaceId: "workspace_exact",
    sessionId: null,
    value: authority.seal({
      kind: "crypto_evidence_record",
      key: "evidence_exact",
      workspaceId: "workspace_exact",
      sessionId: null,
      expiresAtMs: null,
      updatedAtMs: UPDATED_AT,
      value,
    }),
    expiresAtMs: null,
    updatedAtMs: UPDATED_AT,
  };
}

describe("durable state authority", () => {
  test("round-trips an exact authenticated payload without sharing mutable references", () => {
    const authority = new MatterhornDurableStateAuthority(SECRET_A);
    try {
      const record = sealedRecord(authority);
      const opened = authority.open<ProtectedValue>(record, "record_integrity_invalid");
      expect(opened).toEqual({ revision: 7, publication: { blobId: "blob_exact" } });
      if (!opened?.publication) throw new Error("test publication missing");
      opened.publication.blobId = "caller_mutation";
      expect(authority.open<ProtectedValue>(record, "record_integrity_invalid"))
        .toEqual({ revision: 7, publication: { blobId: "blob_exact" } });
    } finally {
      authority.close();
    }
  });

  test("rejects payload mutation, row transplantation, stale-row replay, and a wrong authority key", () => {
    const authority = new MatterhornDurableStateAuthority(SECRET_A);
    const wrongAuthority = new MatterhornDurableStateAuthority(SECRET_B);
    try {
      const record = sealedRecord(authority);
      const attempts: Array<GuardedRuntimeStateRecord<unknown>> = [
        {
          ...record,
          value: {
            ...record.value,
            value: { ...record.value.value, revision: 8 },
          },
        },
        { ...record, key: "evidence_transplanted" },
        { ...record, workspaceId: "workspace_other" },
        { ...record, sessionId: "session_injected" },
        { ...record, expiresAtMs: UPDATED_AT + 60_000 },
        // An old signed value cannot be copied onto a row that has advanced.
        { ...record, updatedAtMs: UPDATED_AT + 1 },
      ];
      for (const attempt of attempts) {
        expect(() => authority.open(attempt, "record_integrity_invalid"))
          .toThrow("record_integrity_invalid");
      }
      expect(() => wrongAuthority.open(record, "record_integrity_invalid"))
        .toThrow("record_integrity_invalid");
    } finally {
      authority.close();
      wrongAuthority.close();
    }
  });

  test("rejects unsealed legacy values, malformed seals, and short signing secrets", () => {
    expect(() => new MatterhornDurableStateAuthority("short-secret"))
      .toThrow("durable_state_integrity_secret_invalid");
    const authority = new MatterhornDurableStateAuthority(SECRET_A);
    try {
      const record = sealedRecord(authority);
      expect(() => authority.open({
        ...record,
        value: record.value.value,
      }, "record_integrity_invalid")).toThrow("record_integrity_invalid");
      expect(() => authority.open({
        ...record,
        value: { ...record.value, authoritySeal: "not-a-valid-seal" },
      }, "record_integrity_invalid")).toThrow("record_integrity_invalid");
    } finally {
      authority.close();
    }
  });
});
