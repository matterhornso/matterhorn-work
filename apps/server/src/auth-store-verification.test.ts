import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MatterhornAuthError,
  MatterhornAuthStore,
} from "./auth-store.js";

const PASSWORD = "matterhorn-verification-password";
const NEW_PASSWORD = "matterhorn-new-recovery-password";
const roots: string[] = [];

function createStore() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-auth-verification-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  return { store: new MatterhornAuthStore(path), path };
}

function expectAuthCode(
  callback: () => unknown,
  code: MatterhornAuthError["code"],
) {
  try {
    callback();
    throw new Error(`Expected Matterhorn auth error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(MatterhornAuthError);
    expect((error as MatterhornAuthError).code).toBe(code);
  }
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("account verification and password recovery", () => {
  test("requires a single-use email challenge before issuing a sign-in session", () => {
    const { store, path } = createStore();
    const provisional = store.createAccount({
      email: "new.user@example.com",
      password: PASSWORD,
      emailVerified: false,
    });
    store.signOut(provisional.token);

    expect(provisional.user.emailVerified).toBe(false);
    expectAuthCode(
      () => store.signIn("new.user@example.com", PASSWORD),
      "email_unverified",
    );

    const challenge = store.createEmailVerificationChallenge(
      "new.user@example.com",
    );
    expect(challenge?.verificationCode).toMatch(/^\d{6}$/);
    const inspector = new Database(path);
    const persisted = inspector
      .query("SELECT code_hash, code_salt FROM email_verification_challenges")
      .get() as { code_hash: string; code_salt: string };
    expect(persisted.code_hash).not.toContain(challenge!.verificationCode);
    expect(persisted.code_salt).not.toBe("");
    inspector.close();

    expectAuthCode(
      () => store.verifyEmail("new.user@example.com", "000000"),
      "invalid_verification_code",
    );
    const verified = store.verifyEmail(
      "new.user@example.com",
      challenge!.verificationCode,
    );
    expect(verified.user.emailVerified).toBe(true);
    expectAuthCode(
      () => store.verifyEmail("new.user@example.com", challenge!.verificationCode),
      "invalid_verification_code",
    );
    expect(store.signIn("new.user@example.com", PASSWORD).user.emailVerified).toBe(true);
    store.close();
  });

  test("expires verification codes and reset links", () => {
    const { store, path } = createStore();
    const provisional = store.createAccount({
      email: "expiry@example.com",
      password: PASSWORD,
      emailVerified: false,
    });
    store.signOut(provisional.token);
    const verification = store.createEmailVerificationChallenge("expiry@example.com")!;
    const inspector = new Database(path);
    inspector.query("UPDATE email_verification_challenges SET expires_at = 0").run();
    expectAuthCode(
      () => store.verifyEmail("expiry@example.com", verification.verificationCode),
      "expired_verification_code",
    );

    const nextVerification = store.createEmailVerificationChallenge("expiry@example.com")!;
    store.verifyEmail("expiry@example.com", nextVerification.verificationCode);
    const reset = store.createPasswordResetChallenge("expiry@example.com")!;
    inspector.query("UPDATE password_reset_challenges SET expires_at = 0").run();
    expectAuthCode(
      () => store.resetPassword(reset.resetToken, NEW_PASSWORD),
      "expired_reset_token",
    );
    inspector.close();
    store.close();
  });

  test("uses opaque single-use reset tokens and revokes existing sessions", () => {
    const { store, path } = createStore();
    const original = store.createAccount({
      email: "recovery@example.com",
      password: PASSWORD,
    });
    const second = store.signIn("recovery@example.com", PASSWORD);
    const reset = store.createPasswordResetChallenge("recovery@example.com")!;

    const inspector = new Database(path);
    const persisted = inspector
      .query("SELECT token_hash FROM password_reset_challenges")
      .get() as { token_hash: string };
    expect(persisted.token_hash).not.toBe(reset.resetToken);
    expect(persisted.token_hash).toHaveLength(64);
    inspector.close();

    store.resetPassword(reset.resetToken, NEW_PASSWORD);
    expect(store.getSession(original.token)).toBeNull();
    expect(store.getSession(second.token)).toBeNull();
    expectAuthCode(
      () => store.resetPassword(reset.resetToken, NEW_PASSWORD),
      "invalid_reset_token",
    );
    expectAuthCode(
      () => store.signIn("recovery@example.com", PASSWORD),
      "invalid_credentials",
    );
    expect(store.signIn("recovery@example.com", NEW_PASSWORD).user.email).toBe(
      "recovery@example.com",
    );
    store.close();
  });

  test("migrates existing accounts as verified without locking them out", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-auth-migration-"));
    roots.push(root);
    const path = join(root, "accounts.db");
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    const salt = randomBytes(16);
    const passwordHash = scryptSync(PASSWORD, salt, 64);
    legacy.query(
      `INSERT INTO users
        (id, email, name, password_hash, password_salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "usr_legacy",
      "legacy@example.com",
      "Legacy User",
      passwordHash.toString("hex"),
      salt.toString("hex"),
      Date.now(),
    );
    legacy.close();

    const store = new MatterhornAuthStore(path);
    const inspector = new Database(path);
    const columns = inspector.query("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    expect(columns.some((column) => column.name === "email_verified_at")).toBe(true);
    expect(store.signIn("legacy@example.com", PASSWORD).user.emailVerified).toBe(true);
    inspector.close();
    store.close();
  });

  test("prepares account deletion without removing the recoverable account", () => {
    const fixture = createStore();
    const session = fixture.store.createAccount({
      email: "deletion-plan@example.com",
      password: PASSWORD,
    });

    const plan = fixture.store.prepareAccountDeletion(session.token, PASSWORD);
    expect(plan.userId).toBe(session.user.id);
    expect(plan.deletedOrganizationIds).toHaveLength(1);
    expect(fixture.store.getSession(session.token)?.user.email).toBe(
      "deletion-plan@example.com",
    );

    fixture.store.deleteAccount(session.token, PASSWORD);
    expect(fixture.store.getSession(session.token)).toBeNull();
    fixture.store.close();
  });
});
