import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  MatterhornCoworkerAccess,
  MatterhornCoworkerAccessError,
} from "./crypto-coworker-access.js";
import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";

function fixture(now = new Date("2026-09-03T08:00:00.000Z")) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-access-"));
  const path = join(root, "coworkers.db");
  const store = new MatterhornCoworkerStore(path);
  let clock = now;
  const access = new MatterhornCoworkerAccess({ store, now: () => clock });
  return {
    access,
    path,
    setNow: (value: Date) => { clock = value; },
    close: () => {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe("crypto coworker invite access", () => {
  test("backfills opaque access IDs for pre-invite-management databases", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-access-migration-"));
    const path = join(root, "coworkers.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE crypto_coworker_account_access (
        owner_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revoked_at TEXT
      );
      INSERT INTO crypto_coworker_account_access(
        owner_id, state, granted_at, updated_at, revoked_at
      ) VALUES (
        'legacy-account', 'active',
        '2026-09-03T08:00:00.000Z', '2026-09-03T08:00:00.000Z', NULL
      );
    `);
    legacy.close();
    const store = new MatterhornCoworkerStore(path);
    try {
      const access = new MatterhornCoworkerAccess({ store });
      const listed = access.list();
      expect(listed).toHaveLength(1);
      expect(listed[0].accessId).toMatch(/^mhca_[A-Za-z0-9_-]{20,64}$/);
      expect(JSON.stringify(listed)).not.toContain("legacy-account");
      expect(access.isAllowed("legacy-account")).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("stores only the invite hash and binds one-time acceptance to one account", () => {
    const state = fixture();
    try {
      const invite = state.access.issueInvite();
      expect(state.access.getStatus("account-a")).toEqual({
        version: "matterhorn.coworker-access-status.v1",
        allowed: false,
        acceptedAt: null,
      });
      expect(state.access.accept("account-a", invite.token)).toMatchObject({ allowed: true });
      expect(state.access.isAllowed("account-a")).toBe(true);
      expect(state.access.accept("account-a", invite.token)).toMatchObject({ allowed: true });
      expect(() => state.access.accept("account-b", invite.token)).toThrow(
        new MatterhornCoworkerAccessError("coworker_access_invite_consumed"),
      );

      for (const file of readdirSync(join(state.path, ".."))) {
        const candidate = join(state.path, "..", file);
        if (existsSync(candidate)) {
          expect(readFileSync(candidate).includes(Buffer.from(invite.token))).toBe(false);
        }
      }
    } finally {
      state.close();
    }
  });

  test("rejects expired and malformed invites", () => {
    const state = fixture();
    try {
      const invite = state.access.issueInvite(60_000);
      state.setNow(new Date("2026-09-03T08:01:00.001Z"));
      expect(() => state.access.accept("account-a", invite.token)).toThrow(
        new MatterhornCoworkerAccessError("coworker_access_invite_expired"),
      );
      expect(() => state.access.accept("account-a", "not-an-invite")).toThrow(
        new MatterhornCoworkerAccessError("coworker_access_input_invalid"),
      );
    } finally {
      state.close();
    }
  });

  test("revocation is immediate and requires a fresh invite to restore access", () => {
    const state = fixture();
    try {
      const original = state.access.issueInvite();
      state.access.accept("account-a", original.token);
      const listed = state.access.list();
      expect(listed).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toContain("account-a");
      expect(state.access.revokeByAccessId(listed[0].accessId)).toEqual({
        version: "matterhorn.coworker-access-status.v1",
        allowed: false,
        acceptedAt: null,
      });
      expect(state.access.isAllowed("account-a")).toBe(false);
      expect(() => state.access.accept("account-a", original.token)).toThrow(
        new MatterhornCoworkerAccessError("coworker_access_invite_consumed"),
      );

      const replacement = state.access.issueInvite();
      expect(state.access.accept("account-a", replacement.token)).toMatchObject({ allowed: true });
      const replacementAccessId = state.access.list()[0].accessId;
      expect(replacementAccessId).not.toBe(listed[0].accessId);
      expect(() => state.access.revokeByAccessId(listed[0].accessId)).toThrow(
        new MatterhornCoworkerAccessError("coworker_access_not_found"),
      );
      expect(state.access.isAllowed("account-a")).toBe(true);
      expect(state.access.revokeByAccessId(replacementAccessId)).toMatchObject({ allowed: false });
    } finally {
      state.close();
    }
  });
});
