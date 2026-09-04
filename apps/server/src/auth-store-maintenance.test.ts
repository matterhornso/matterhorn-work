import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MatterhornAuthStore } from "./auth-store.js";

const PASSWORD = "matterhorn-maintenance-password";
const DAY_MS = 24 * 60 * 60 * 1_000;
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-auth-maintenance-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  return { store: new MatterhornAuthStore(path), path };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("account security metadata maintenance", () => {
  test("atomically expires capabilities and retains only bounded finalized metadata", () => {
    const { store, path } = fixture();
    const now = Date.now();
    const olderThanRetention = now - 366 * DAY_MS;
    const recent = now - DAY_MS;

    store.createAccountOrQueueVerification({
      email: "expired-verification@example.com",
      password: PASSWORD,
    });
    store.createAccountOrQueueVerification({
      email: "live-verification@example.com",
      password: PASSWORD,
    });
    const expiredSession = store.createAccount({
      email: "expired-session@example.com",
      password: PASSWORD,
    });
    const liveSession = store.createAccount({
      email: "live-session@example.com",
      password: PASSWORD,
    });
    store.queuePasswordReset("expired-session@example.com", "https://desks.example.com/");

    const db = new Database(path);
    const userId = (email: string) => (db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
    ).get(email) as { id: string }).id;
    const expiredVerificationUser = userId("expired-verification@example.com");
    const liveVerificationUser = userId("live-verification@example.com");
    const expiredSessionUser = userId("expired-session@example.com");
    db.query("UPDATE email_verification_challenges SET expires_at = ? WHERE user_id = ?")
      .run(now - 1, expiredVerificationUser);
    db.query("UPDATE email_outbox SET state = 'sending' WHERE user_id = ? AND template = 'verification'")
      .run(expiredVerificationUser);
    db.query("UPDATE email_verification_challenges SET expires_at = ? WHERE user_id = ?")
      .run(now + DAY_MS, liveVerificationUser);
    db.query("UPDATE password_reset_challenges SET expires_at = ? WHERE user_id = ?")
      .run(now - 1, expiredSessionUser);
    db.query("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .run(now - 1, expiredSessionUser);
    db.query(`
      INSERT INTO email_outbox(
        id, idempotency_key, user_id, recipient, template, props_json, state,
        attempts, next_attempt_at, created_at, updated_at, delivered_at
      ) VALUES (?, ?, NULL, ?, 'verification', '{}', 'delivered', 1, ?, ?, ?, ?)
    `).run(
      "mail_old_final",
      "maintenance-old-final",
      "old-final@example.invalid",
      olderThanRetention,
      olderThanRetention,
      olderThanRetention,
      olderThanRetention,
    );
    db.query(`
      INSERT INTO email_outbox(
        id, idempotency_key, user_id, recipient, template, props_json, state,
        attempts, next_attempt_at, created_at, updated_at, delivered_at
      ) VALUES (?, ?, NULL, ?, 'verification', '{}', 'delivered', 1, ?, ?, ?, ?)
    `).run(
      "mail_recent_final",
      "maintenance-recent-final",
      "recent-final@example.invalid",
      recent,
      recent,
      recent,
      recent,
    );
    for (const [jobId, userIdValue, timestamp] of [
      ["account_deletion_old", "deleted_user_old", olderThanRetention],
      ["account_deletion_recent", "deleted_user_recent", recent],
    ] as const) {
      db.query(`
        INSERT INTO account_deletion_jobs(
          job_id, user_id, organization_ids_json, status, steps_json,
          attempts, created_at, updated_at, completed_at
        ) VALUES (?, ?, '[]', 'completed', ?, 1, ?, ?, ?)
      `).run(
        jobId,
        userIdValue,
        JSON.stringify({ memory: true, workspaces: true, identity: true }),
        timestamp,
        timestamp,
        timestamp,
      );
    }
    db.close();

    expect(store.maintainEphemeralSecurityState(now)).toEqual({
      expiredSessionsDeleted: 1,
      expiredVerificationChallengesDeleted: 1,
      expiredPasswordResetChallengesDeleted: 1,
      expiredEmailsTerminalized: 2,
      finalizedEmailsDeleted: 1,
      completedDeletionJobsDeleted: 1,
    });
    expect(store.getSession(expiredSession.token)).toBeNull();
    expect(store.getSession(liveSession.token)?.user.email).toBe("live-session@example.com");

    const inspector = new Database(path, { readonly: true });
    expect(inspector.query("SELECT COUNT(*) AS count FROM email_verification_challenges").get())
      .toEqual({ count: 1 });
    expect(inspector.query("SELECT COUNT(*) AS count FROM password_reset_challenges").get())
      .toEqual({ count: 0 });
    expect(inspector.query(`
      SELECT template, state, props_json FROM email_outbox
      WHERE user_id = ? ORDER BY template ASC
    `).all(expiredSessionUser)).toEqual([
      { template: "passwordReset", state: "terminal", props_json: "{}" },
    ]);
    expect(inspector.query(`
      SELECT state, props_json FROM email_outbox WHERE user_id = ?
    `).get(expiredVerificationUser)).toEqual({ state: "terminal", props_json: "{}" });
    expect(inspector.query(`
      SELECT state FROM email_outbox WHERE user_id = ?
    `).get(liveVerificationUser)).toEqual({ state: "pending" });
    expect(inspector.query("SELECT id FROM email_outbox WHERE id LIKE 'mail_%_final' ORDER BY id").all())
      .toEqual([{ id: "mail_recent_final" }]);
    expect(inspector.query("SELECT job_id FROM account_deletion_jobs ORDER BY job_id").all())
      .toEqual([{ job_id: "account_deletion_recent" }]);
    inspector.close();

    expect(store.maintainEphemeralSecurityState(now)).toEqual({
      expiredSessionsDeleted: 0,
      expiredVerificationChallengesDeleted: 0,
      expiredPasswordResetChallengesDeleted: 0,
      expiredEmailsTerminalized: 0,
      finalizedEmailsDeleted: 0,
      completedDeletionJobsDeleted: 0,
    });
    expect(() => store.maintainEphemeralSecurityState(Number.NaN))
      .toThrow("auth_maintenance_time_invalid");
    store.close();
  });
});
