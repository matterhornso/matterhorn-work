import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornAuthStore } from "./auth-store.js";

const roots: string[] = [];
const PASSWORD = "matterhorn-outbox-password";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-auth-outbox-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  return { store: new MatterhornAuthStore(path), path };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("durable transactional email outbox", () => {
  test("commits account, verification challenge, legal acceptance, and email atomically", () => {
    const { store, path } = fixture();
    const result = store.createAccountOrQueueVerification({
      email: "new@example.com",
      password: PASSWORD,
      legalAcceptance: { termsVersion: "terms-1", privacyVersion: "privacy-1" },
      maxAccounts: 10,
    });
    expect(result).toMatchObject({ verificationRequired: true, accountCreated: true });
    const db = new Database(path, { readonly: true });
    expect(db.query("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: 1 });
    expect(db.query("SELECT COUNT(*) AS count FROM email_verification_challenges").get()).toEqual({ count: 1 });
    expect(db.query("SELECT state, template, attempts FROM email_outbox").get()).toEqual({
      state: "pending",
      template: "verification",
      attempts: 0,
    });
    expect(db.query("SELECT COUNT(*) AS count FROM account_legal_acceptances").get()).toEqual({ count: 1 });
    db.close();
    store.close();
  });

  test("returns one generic verification state for repeated signup and rate-limits enqueue", () => {
    const { store } = fixture();
    const first = store.createAccountOrQueueVerification({ email: "repeat@example.com", password: PASSWORD });
    const repeated = store.createAccountOrQueueVerification({ email: "repeat@example.com", password: "different-secure-password" });
    expect(first.accountCreated).toBe(true);
    expect(repeated.accountCreated).toBe(false);
    expect(repeated.verificationRequired).toBe(true);
    expect(store.accountCount()).toBe(1);
    expect(store.claimDueEmailOutbox()).toHaveLength(1);
    store.close();
  });

  test("retries failed delivery durably and consumes a claimed item once", () => {
    const { store, path } = fixture();
    store.createAccountOrQueueVerification({ email: "retry@example.com", password: PASSWORD });
    const [claimed] = store.claimDueEmailOutbox();
    expect(claimed?.attempts).toBe(1);
    expect(store.claimDueEmailOutbox()).toEqual([]);
    store.markEmailFailed(claimed!.id, "ses_rejected", claimed!.attempts);
    const db = new Database(path);
    db.query("UPDATE email_outbox SET next_attempt_at = 0").run();
    db.close();
    const [retried] = store.claimDueEmailOutbox();
    expect(retried?.attempts).toBe(2);
    store.markEmailAccepted(retried!.id, "ses-message-1");
    expect(store.emailOutboxStatus().pending).toBe(1);
    store.markSesDelivery("ses-message-1");
    expect(store.emailOutboxStatus().pending).toBe(0);
    store.close();
  });

  test("suppresses bounced recipients and queues password reset in the challenge transaction", () => {
    const { store } = fixture();
    const session = store.createAccount({ email: "bounce@example.com", password: PASSWORD });
    store.signOut(session.token);
    const reset = store.queuePasswordReset("bounce@example.com", "https://desks.example.com/");
    expect(reset?.resetToken.length).toBeGreaterThan(30);
    const [mail] = store.claimDueEmailOutbox();
    expect(mail?.template).toBe("passwordReset");
    expect(mail?.props.resetLink).toContain("mode=reset-password");
    store.markEmailAccepted(mail!.id, "ses-message-2");
    store.suppressEmail("bounce@example.com", "bounce", "event-1");
    expect(store.queuePasswordReset("bounce@example.com", "https://desks.example.com/")).toBeNull();
    expect(store.emailOutboxStatus().suppressed).toBe(0);
    store.close();
  });
});
