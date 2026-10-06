import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornAuthError, MatterhornAuthStore } from "./auth-store.js";

const PASSWORD = "disposable-original-password";
const NEW_PASSWORD = "disposable-changed-password";
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-password-lifecycle-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  return { store: new MatterhornAuthStore(path), db: new Database(path) };
}

function invalidReset(callback: () => void) {
  try {
    callback();
    throw new Error("Obsolete reset unexpectedly succeeded");
  } catch (error) {
    if (!(error instanceof MatterhornAuthError)) throw error;
    expect(error.code).toBe("invalid_reset_token");
  }
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("password change invalidates obsolete recovery authority", () => {
  test("authenticated rotation invalidates old reset links without affecting another account", () => {
    const { store, db } = fixture();
    try {
      const owner = store.createAccount({ email: "owner@example.com", password: PASSWORD });
      const secondSession = store.signIn(owner.user.email, PASSWORD);
      const other = store.createAccount({ email: "other@example.com", password: PASSWORD });
      const old = store.createPasswordResetChallenge(owner.user.email);
      const otherReset = store.createPasswordResetChallenge(other.user.email);
      if (!old || !otherReset) throw new Error("Missing fixture challenge");

      // A failed change must not consume a legitimate recovery link.
      expect(() => store.changePassword(owner.token, {
        currentPassword: "wrong-current-password", newPassword: NEW_PASSWORD,
      })).toThrow(MatterhornAuthError);
      expect(db.query("SELECT COUNT(*) AS count FROM password_reset_challenges").get()).toEqual({ count: 2 });
      store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      invalidReset(() => store.resetPassword(old.resetToken, "disposable-unwanted-password"));
      expect(store.getSession(owner.token)).toBeNull();
      expect(store.getSession(secondSession.token)).toBeNull();
      expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
      expect(store.signIn(owner.user.email, NEW_PASSWORD).user.id).toBe(owner.user.id);
      store.resetPassword(otherReset.resetToken, NEW_PASSWORD);
      expect(store.signIn(other.user.email, NEW_PASSWORD).user.id).toBe(other.user.id);
      const fresh = store.createPasswordResetChallenge(owner.user.email);
      if (!fresh) throw new Error("Missing new fixture challenge");
      store.resetPassword(fresh.resetToken, "disposable-fresh-recovery-password");
      expect(store.signIn(owner.user.email, "disposable-fresh-recovery-password").user.id).toBe(owner.user.id);
    } finally { db.close(); store.close(); }
  });

  for (const method of ["authenticated", "reset"]) {
    for (const state of ["pending", "retry", "sending"]) {
      test(`${method} change retires ${state} reset email without altering other users or delivery history`, () => {
        const { store, db } = fixture();
        try {
          const owner = store.createAccount({ email: "owner@example.com", password: PASSWORD });
          store.queuePasswordReset(owner.user.email, "https://example.com/");
          const [accepted] = store.claimDueEmailOutbox();
          if (!accepted) throw new Error("Missing fixture email");
          store.markEmailAccepted(accepted.id, "fixture-accepted-message");
          const reset = store.queuePasswordReset(owner.user.email, "https://example.com/");
          if (!reset) throw new Error("Missing fixture challenge");
          let claimedId: string | undefined;
          if (state !== "pending") {
            const [claimed] = store.claimDueEmailOutbox();
            if (!claimed) throw new Error("Missing fixture email");
            claimedId = claimed.id;
            if (state === "retry") store.markEmailFailed(claimed.id, "fixture_unavailable", claimed.attempts);
          }
          store.createAccount({ email: "other@example.com", password: PASSWORD });
          store.queuePasswordReset("other@example.com", "https://example.com/");
          store.createAccountOrQueueVerification({ email: "unverified@example.com", password: PASSWORD });
          if (method === "authenticated") {
            store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
          } else {
            store.resetPassword(reset.resetToken, NEW_PASSWORD);
          }
          // Late delivery callbacks must not resurrect a retired queue item.
          if (claimedId) {
            store.markEmailFailed(claimedId, "fixture_late_failure", 1);
            store.markEmailAccepted(claimedId, "fixture_late_acceptance");
          }
          expect(db.query("SELECT state, last_error_code, props_json = '{}' AS payloadCleared FROM email_outbox WHERE user_id = ? AND id <> ?").get(owner.user.id, accepted.id)).toEqual({
            state: "terminal", last_error_code: "password_changed", payloadCleared: 1,
          });
          expect(db.query("SELECT state FROM email_outbox WHERE id = ?").get(accepted.id)).toEqual({ state: "accepted" });
          expect(store.claimDueEmailOutbox(10, Date.now() + 120_000).map(mail => mail.recipient).sort()).toEqual([
            "other@example.com", "unverified@example.com",
          ]);
          invalidReset(() => store.resetPassword(reset.resetToken, "disposable-unwanted-password"));
          expect(store.signIn(owner.user.email, NEW_PASSWORD).user.id).toBe(owner.user.id);
        } finally { db.close(); store.close(); }
      });
    }

    for (const failure of ["challenge", "outbox"]) {
      test(`${method} rotation rolls back if ${failure} invalidation cannot commit`, () => {
        const { store, db } = fixture();
        try {
          const owner = store.createAccount({ email: "rollback@example.com", password: PASSWORD });
          const reset = store.queuePasswordReset(owner.user.email, "https://example.com/");
          if (!reset) throw new Error("Missing fixture challenge");
          db.run(failure === "challenge"
            ? "CREATE TRIGGER reject_reset_cleanup BEFORE DELETE ON password_reset_challenges BEGIN SELECT RAISE(ABORT, 'fixture cleanup failure'); END"
            : "CREATE TRIGGER reject_reset_cleanup BEFORE UPDATE ON email_outbox BEGIN SELECT RAISE(ABORT, 'fixture cleanup failure'); END");
          expect(() => method === "authenticated"
            ? store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
            : store.resetPassword(reset.resetToken, NEW_PASSWORD)).toThrow("fixture cleanup failure");
          expect(store.getSession(owner.token)?.user.id).toBe(owner.user.id);
          expect(store.signIn(owner.user.email, PASSWORD).user.id).toBe(owner.user.id);
          expect(db.query("SELECT state FROM email_outbox").get()).toEqual({ state: "pending" });
          db.run("DROP TRIGGER reject_reset_cleanup");
          store.resetPassword(reset.resetToken, NEW_PASSWORD);
          expect(store.signIn(owner.user.email, NEW_PASSWORD).user.id).toBe(owner.user.id);
        } finally { db.close(); store.close(); }
      });
    }
  }
});
