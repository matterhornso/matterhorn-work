import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { MatterhornAuthStore } from "./auth-store.js";
import { trackFixtureWorker } from "./fixtures/worker-lifecycle.js";

const PASSWORD = "disposable-original-credential";
const WINNER = "disposable-winning-credential";
const STALE = "disposable-stale-credential";

const scenarios = [
  { operation: "sign-in", boundary: "password-change", legacy: false },
  { operation: "sign-in", boundary: "password-reset", legacy: false },
  { operation: "sign-in", boundary: "password-change", legacy: true },
  { operation: "change-password", boundary: "password-change", legacy: false },
  { operation: "change-password", boundary: "password-reset", legacy: false },
  { operation: "change-password", boundary: "sign-out", legacy: false },
  { operation: "verify-email", boundary: "replacement-code", legacy: false },
  { operation: "verify-email", boundary: "expired-code-replacement", legacy: false },
  { operation: "verify-email", boundary: "competing-verification", legacy: false },
  { operation: "verify-email", boundary: "verification-then-reset", legacy: false },
];

for (const scenario of scenarios) {
  test(`${scenario.operation} rejects stale authority after ${scenario.boundary}${scenario.legacy ? " during hash upgrade" : ""}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-credential-race-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path);
    const db = new Database(path);
    const worker = new Worker(new URL("./fixtures/auth-credential-race-worker.ts", import.meta.url));
    const lifecycle = trackFixtureWorker(worker);
    const barrier = new Int32Array(new SharedArrayBuffer(4));
    try {
      const verify = scenario.operation === "verify-email";
      const owner = store.createAccount({ email: "race@example.com", password: PASSWORD, emailVerified: !verify });
      const other = store.createAccount({ email: "other@example.com", password: PASSWORD });
      if (scenario.legacy) {
        const salt = randomBytes(16);
        db.query("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
          scryptSync(PASSWORD, salt, 64).toString("hex"), salt.toString("hex"), owner.user.id,
        );
      }
      if (verify) store.signOut(owner.token);
      const verification = verify ? store.createEmailVerificationChallenge(owner.user.email) : null;
      if (scenario.boundary === "expired-code-replacement") {
        db.query("UPDATE email_verification_challenges SET expires_at = 0 WHERE user_id = ?").run(owner.user.id);
      }
      const reset = !verify ? store.createPasswordResetChallenge(owner.user.email) : null;
      let replacementCode: string | undefined;
      let winnerSession: string | undefined;
      let interleaved = false;
      const completed = new Promise<unknown>((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", () => reject(new Error("Credential worker exited without a result")));
        worker.on("message", (message: unknown) => {
          if (!message || typeof message !== "object" || !("phase" in message)) {
            reject(new Error("Invalid worker message")); return;
          }
          if (message.phase === "result") { resolve(message); return; }
          if (message.phase !== "credential-read") return;
          try {
            if (scenario.boundary === "password-change") {
              store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: WINNER });
              winnerSession = store.signIn(owner.user.email, WINNER).token;
            } else if (scenario.boundary === "password-reset") {
              if (!reset) throw new Error("Missing fixture reset");
              store.resetPassword(reset.resetToken, WINNER);
              winnerSession = store.signIn(owner.user.email, WINNER).token;
            } else if (scenario.boundary === "sign-out") store.signOut(owner.token);
            else if (scenario.boundary === "replacement-code" || scenario.boundary === "expired-code-replacement") {
              replacementCode = store.createEmailVerificationChallenge(owner.user.email)?.verificationCode;
              if (!replacementCode) throw new Error("Missing fixture replacement");
            } else {
              if (!verification) throw new Error("Missing fixture verification");
              winnerSession = store.verifyEmail(owner.user.email, verification.verificationCode).token;
              if (scenario.boundary === "verification-then-reset") {
                const recovery = store.createPasswordResetChallenge(owner.user.email);
                if (!recovery) throw new Error("Missing fixture recovery");
                store.resetPassword(recovery.resetToken, WINNER);
                winnerSession = store.signIn(owner.user.email, WINNER).token;
              }
            }
            interleaved = true;
          } catch (error) { reject(error); }
          finally { Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0); }
        });
        worker.postMessage({ path, operation: scenario.operation, email: owner.user.email,
          password: PASSWORD, newPassword: STALE, token: owner.token,
          code: verification?.verificationCode ?? "", barrier: barrier.buffer });
      });
      const expectedCode = scenario.boundary === "expired-code-replacement" ? "expired_verification_code" : verify ? "invalid_verification_code"
        : scenario.operation === "change-password" ? "unauthorized" : "invalid_credentials";
      expect(await completed).toEqual({ phase: "result", ok: false, code: expectedCode });
      await lifecycle.waitForExit();
      expect(interleaved).toBe(true);
      expect(db.query("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(owner.user.id)).toEqual({ count: winnerSession ? 1 : 0 });
      if (winnerSession) expect(store.getSession(winnerSession)?.user.id).toBe(owner.user.id);
      if (replacementCode) {
        expect(() => store.signIn(owner.user.email, PASSWORD)).toThrow();
        expect(store.verifyEmail(owner.user.email, replacementCode).user.id).toBe(owner.user.id);
      }
      const winnerPassword = scenario.boundary === "sign-out" || scenario.boundary === "replacement-code"
        || scenario.boundary === "expired-code-replacement" || scenario.boundary === "competing-verification" ? PASSWORD : WINNER;
      expect(store.signIn(owner.user.email, winnerPassword).user.id).toBe(owner.user.id);
      expect(() => store.signIn(owner.user.email, STALE)).toThrow();
      expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
      if (scenario.boundary === "sign-out" && reset) {
        store.resetPassword(reset.resetToken, WINNER);
        expect(store.signIn(owner.user.email, WINNER).user.id).toBe(owner.user.id);
      }
    } finally {
      Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0);
      await lifecycle.stop();
      db.close(); store.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
}

for (const operation of ["sign-in", "verify-email"]) {
  test(`${operation} rolls back credential changes if session issuance fails`, () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-session-rollback-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path);
    const db = new Database(path);
    try {
      const owner = store.createAccount({ email: "rollback@example.com", password: PASSWORD, emailVerified: operation === "sign-in" });
      store.signOut(owner.token);
      const challenge = store.createEmailVerificationChallenge(owner.user.email);
      if (operation === "sign-in") {
        const salt = randomBytes(16);
        db.query("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
          scryptSync(PASSWORD, salt, 64).toString("hex"), salt.toString("hex"), owner.user.id,
        );
      }
      db.run("CREATE TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'fixture session failure'); END");
      const issue = () => operation === "sign-in" ? store.signIn(owner.user.email, PASSWORD)
        : store.verifyEmail(owner.user.email, challenge?.verificationCode ?? "");
      expect(issue).toThrow("fixture session failure");
      expect(db.query("SELECT COUNT(*) AS count FROM sessions").get()).toEqual({ count: 0 });
      if (operation === "sign-in") {
        expect(db.query("SELECT password_hash LIKE 'scrypt-v2$%' AS upgraded FROM users WHERE id = ?").get(owner.user.id)).toEqual({ upgraded: 0 });
      } else {
        expect(db.query("SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id = ?").get(owner.user.id)).toEqual({ verified: 0 });
        expect(db.query("SELECT COUNT(*) AS count FROM email_verification_challenges").get()).toEqual({ count: 1 });
      }
      db.run("DROP TRIGGER reject_session");
      expect(issue().user.id).toBe(owner.user.id);
      expect(store.signIn(owner.user.email, PASSWORD).user.emailVerified).toBe(true);
    } finally {
      db.close(); store.close(); rmSync(root, { recursive: true, force: true });
    }
  });
}
