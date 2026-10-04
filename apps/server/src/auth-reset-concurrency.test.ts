import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { MatterhornAuthStore } from "./auth-store.js";

const PASSWORD = "disposable-concurrency-password";
const WINNING_PASSWORD = "disposable-winning-password";

for (const change of ["authenticated-change", "competing-reset", "replacement-link", "expiry-at-commit"]) {
  test(`a reset verified before ${change} cannot overwrite the winning credential`, async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-reset-race-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path);
    const worker = new Worker(new URL("./fixtures/auth-reset-race-worker.ts", import.meta.url));
    const barrier = new Int32Array(new SharedArrayBuffer(4));
    try {
      const owner = store.createAccount({ email: "race@example.com", password: PASSWORD });
      const reset = store.createPasswordResetChallenge(owner.user.email);
      if (!reset) throw new Error("Missing disposable reset challenge");
      let replacementToken: string | undefined;
      let interleaved = false;
      const completed = new Promise<unknown>((resolve, reject) => {
        worker.on("error", reject);
        worker.on("exit", () => reject(new Error("Reset worker exited without a result")));
        worker.on("message", (message: unknown) => {
          if (!message || typeof message !== "object" || !("phase" in message)) {
            reject(new Error("Invalid worker message"));
            return;
          }
          if (message.phase === "result") { resolve(message); return; }
          if (message.phase !== "challenge-read") return;
          try {
            if (change === "authenticated-change") {
              store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: WINNING_PASSWORD });
            } else if (change === "competing-reset") {
              store.resetPassword(reset.resetToken, WINNING_PASSWORD);
            } else if (change === "replacement-link") {
              replacementToken = store.createPasswordResetChallenge(owner.user.email)?.resetToken;
              if (!replacementToken) throw new Error("Missing replacement fixture challenge");
            }
            interleaved = true;
          } catch (error) { reject(error); }
          finally { Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0); }
        });
        worker.postMessage({ path, token: reset.resetToken,
          password: "disposable-stale-password", barrier: barrier.buffer,
          expireAtCommit: change === "expiry-at-commit" });
      });
      expect(await completed).toEqual({ phase: "result", ok: false, code: "invalid_reset_token" });
      expect(interleaved).toBe(true);
      if (change === "expiry-at-commit") {
        expect(store.getSession(owner.token)?.user.id).toBe(owner.user.id);
        replacementToken = store.createPasswordResetChallenge(owner.user.email)?.resetToken;
        if (!replacementToken) throw new Error("Missing recovery after rejected fixture reset");
      }
      if (replacementToken) {
        expect(store.signIn(owner.user.email, PASSWORD).user.id).toBe(owner.user.id);
        store.resetPassword(replacementToken, WINNING_PASSWORD);
      }
      expect(store.signIn(owner.user.email, WINNING_PASSWORD).user.id).toBe(owner.user.id);
      expect(() => store.signIn(owner.user.email, "disposable-stale-password")).toThrow();
    } finally {
      Atomics.store(barrier, 0, 1);
      Atomics.notify(barrier, 0);
      await worker.terminate();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10000);
}
