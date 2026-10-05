import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { MatterhornAuthStore } from "./auth-store.js";
import { trackFixtureWorker } from "./fixtures/worker-lifecycle.js";

const PASSWORD = "disposable-account-authority";
const NEW_PASSWORD = "disposable-rotated-authority";

for (const operation of ["begin-deletion", "revoke-sessions"]) {
  for (const boundary of ["sign-out", "password-change", "password-reset", "session-expiry", "competing-deletion", "shared-membership"]) {
    if (boundary === "shared-membership" && operation !== "begin-deletion") continue;
    test(`${operation} rejects obsolete authority after ${boundary}`, async () => {
      const root = mkdtempSync(join(tmpdir(), "matterhorn-account-authority-"));
      const path = join(root, "accounts.db");
      const store = new MatterhornAuthStore(path);
      const db = new Database(path);
      const worker = new Worker(new URL("./fixtures/auth-credential-race-worker.ts", import.meta.url));
      const lifecycle = trackFixtureWorker(worker);
      const barrier = new Int32Array(new SharedArrayBuffer(4));
      try {
        const owner = store.createAccount({ email: "authority@example.com", password: PASSWORD });
        const other = store.createAccount({ email: "other@example.com", password: PASSWORD });
        let survivingSession = store.signIn(owner.user.email, PASSWORD).token;
        const reset = store.createPasswordResetChallenge(owner.user.email);
        let interleaved = false;
        const completed = new Promise<unknown>((resolve, reject) => {
          worker.on("error", reject);
          worker.on("exit", () => reject(new Error("Authority worker exited without a result")));
          worker.on("message", (message: unknown) => {
            if (!message || typeof message !== "object" || !("phase" in message)) {
              reject(new Error("Invalid worker message")); return;
            }
            if (message.phase === "result") { resolve(message); return; }
            if (message.phase !== "credential-read") return;
            try {
              if (boundary === "sign-out") store.signOut(owner.token);
              else if (boundary === "password-change") {
                store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
                survivingSession = store.signIn(owner.user.email, NEW_PASSWORD).token;
              } else if (boundary === "password-reset") {
                if (!reset) throw new Error("Missing fixture recovery");
                store.resetPassword(reset.resetToken, NEW_PASSWORD);
                survivingSession = store.signIn(owner.user.email, NEW_PASSWORD).token;
              } else if (boundary === "session-expiry") {
                db.query("UPDATE sessions SET expires_at = 0 WHERE token_hash = ?").run(
                  createHash("sha256").update(owner.token).digest("hex"),
                );
              } else if (boundary === "competing-deletion") store.beginAccountDeletion(survivingSession, PASSWORD);
              else {
                db.query("INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
                  .run(owner.activeOrgId, other.user.id, Date.now());
              }
              interleaved = true;
            } catch (error) { reject(error); }
            finally { Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0); }
          });
          worker.postMessage({ path, operation, email: owner.user.email,
            password: PASSWORD, newPassword: NEW_PASSWORD, token: owner.token,
            code: "", barrier: barrier.buffer });
        });
        expect(await completed).toEqual({ phase: "result", ok: false,
          code: boundary === "shared-membership" ? "account_owns_shared_organization" : "unauthorized" });
        await lifecycle.waitForExit();
        expect(interleaved).toBe(true);
        expect(store.listPendingAccountDeletionJobs()).toHaveLength(boundary === "competing-deletion" ? 1 : 0);
        expect(db.query("SELECT COUNT(*) AS count FROM users WHERE id = ?").get(owner.user.id)).toEqual({ count: 1 });
        expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
        if (boundary === "competing-deletion") {
          expect(store.getSession(survivingSession)).toBeNull();
        } else {
          expect(store.getSession(survivingSession)?.user.id).toBe(owner.user.id);
          const password = boundary === "password-change" || boundary === "password-reset" ? NEW_PASSWORD : PASSWORD;
          expect(store.signIn(owner.user.email, password).user.id).toBe(owner.user.id);
        }
        if (boundary === "shared-membership") {
          expect(store.listOrganizations(other.user.id).some((org) => org.id === owner.activeOrgId)).toBe(true);
        }
      } finally {
        Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0);
        await lifecycle.stop();
        db.close(); store.close();
        rmSync(root, { recursive: true, force: true });
      }
    }, 15000);
  }
}

for (const operation of ["begin-deletion", "revoke-sessions"]) {
  test(`${operation} holds write authority through its remaining checks`, async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-account-serialized-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path);
    const db = new Database(path);
    db.exec("PRAGMA busy_timeout = 0");
    const worker = new Worker(new URL("./fixtures/auth-credential-race-worker.ts", import.meta.url));
    const lifecycle = trackFixtureWorker(worker);
    const barrier = new Int32Array(new SharedArrayBuffer(4));
    try {
      const owner = store.createAccount({ email: "serialized@example.com", password: PASSWORD });
      const second = store.signIn(owner.user.email, PASSWORD);
      const other = store.createAccount({ email: "separate@example.com", password: PASSWORD });
      let serialized = false;
      const completed = new Promise<unknown>((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", () => reject(new Error("Authority worker exited without a result")));
        worker.on("message", (message: unknown) => {
          if (!message || typeof message !== "object" || !("phase" in message)) {
            reject(new Error("Invalid worker message")); return;
          }
          if (message.phase === "result") { resolve(message); return; }
          if (message.phase !== "credential-read") return;
          try {
            expect(() => db.query("DELETE FROM sessions WHERE user_id = ?").run(owner.user.id)).toThrow(/locked|busy/i);
            expect(() => db.query("UPDATE users SET password_hash = password_hash WHERE id = ?").run(owner.user.id)).toThrow(/locked|busy/i);
            expect(() => db.query("INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
              .run(owner.activeOrgId, other.user.id, Date.now())).toThrow(/locked|busy/i);
            serialized = true;
          } catch (error) { reject(error); }
          finally { Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0); }
        });
        worker.postMessage({ path, operation, email: owner.user.email, password: PASSWORD,
          newPassword: NEW_PASSWORD, token: owner.token, code: "", barrier: barrier.buffer, pauseAfterLock: true });
      });
      expect(await completed).toEqual({ phase: "result", ok: true });
      await lifecycle.waitForExit();
      expect(serialized).toBe(true);
      expect(store.getSession(second.token)).toBeNull();
      expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
      if (operation === "begin-deletion") {
        expect(store.getSession(owner.token)).toBeNull();
        expect(store.listPendingAccountDeletionJobs()).toHaveLength(1);
      } else {
        expect(store.getSession(owner.token)?.expiresAt).toBe(owner.expiresAt);
        expect(store.revokeOtherSessions(owner.token)).toBe(0);
      }
    } finally {
      Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0);
      await lifecycle.stop(); db.close(); store.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);

  test(`${operation} preserves authority and deletion state on failed commit`, () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-account-rollback-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path);
    const db = new Database(path);
    try {
      const owner = store.createAccount({ email: "rollback@example.com", password: PASSWORD });
      const second = store.signIn(owner.user.email, PASSWORD);
      const mutate = () => operation === "begin-deletion" ? store.beginAccountDeletion(owner.token, PASSWORD)
        : store.revokeOtherSessions(owner.token);
      db.run("CREATE TRIGGER reject_revocation BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'fixture revoke failure'); END");
      expect(mutate).toThrow("fixture revoke failure");
      expect(store.listPendingAccountDeletionJobs()).toHaveLength(0);
      expect(store.getSession(owner.token)?.expiresAt).toBe(owner.expiresAt);
      expect(store.getSession(second.token)?.user.id).toBe(owner.user.id);
      db.run("DROP TRIGGER reject_revocation");
      if (operation === "begin-deletion") {
        expect(() => store.beginAccountDeletion(owner.token, "wrong-disposable-password")).toThrow("Password is incorrect");
        expect(store.getSession(owner.token)?.expiresAt).toBe(owner.expiresAt);
      }
      expect(mutate).not.toThrow();
    } finally {
      db.close(); store.close(); rmSync(root, { recursive: true, force: true });
    }
  });
}
