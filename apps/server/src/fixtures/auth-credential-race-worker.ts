import { Database } from "bun:sqlite";
import { parentPort } from "node:worker_threads";
import { MatterhornAuthError, MatterhornAuthStore } from "../auth-store.js";

const port = parentPort;
if (!port) throw new Error("Credential race fixture requires a worker");

port.once("message", (input: unknown) => {
  if (!input || typeof input !== "object"
    || !("path" in input) || typeof input.path !== "string"
    || !("operation" in input) || typeof input.operation !== "string"
    || !("email" in input) || typeof input.email !== "string"
    || !("password" in input) || typeof input.password !== "string"
    || !("newPassword" in input) || typeof input.newPassword !== "string"
    || !("token" in input) || typeof input.token !== "string"
    || !("code" in input) || typeof input.code !== "string"
    || !("barrier" in input) || !(input.barrier instanceof SharedArrayBuffer)) {
    throw new Error("Invalid credential race fixture input");
  }
  const store = new MatterhornAuthStore(input.path);
  const barrier = new Int32Array(input.barrier);
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, "prepare");
  if (!descriptor) throw new Error("Missing SQLite prepare method");
  const original = Database.prototype.prepare;
  let armed = true;
  const pauseAfterLock = "pauseAfterLock" in input && input.pauseAfterLock === true;
  // Pause before the first credential/session write, or after an account
  // operation acquires write authority. This interception stays inside this
  // worker; it does not modify production SQL or add a production test hook.
  Object.defineProperty(Database.prototype, "prepare", { ...descriptor,
    value: function(this: Database, sql: unknown, ...args: unknown[]) {
      if (armed && typeof sql === "string" && (pauseAfterLock
        ? /SELECT\s+token_hash,\s*user_id,\s*active_org_id,\s*expires_at\s+FROM\s+sessions/i.test(sql)
        : (
        /UPDATE\s+users\s+SET\s+(password_hash|email_verified_at)/i.test(sql)
        || /INSERT\s+INTO\s+sessions/i.test(sql)
        || /DELETE\s+FROM\s+email_verification_challenges/i.test(sql)
        || /DELETE\s+FROM\s+sessions/i.test(sql)
        || /INSERT\s+INTO\s+account_deletion_jobs/i.test(sql)
        || /UPDATE\s+sessions\s+SET\s+expires_at/i.test(sql)
      ))) {
        armed = false;
        port.postMessage({ phase: "credential-read" });
        if (Atomics.wait(barrier, 0, 0, 5000) === "timed-out") {
          throw new Error("Credential race fixture barrier timed out");
        }
      }
      return Reflect.apply(original, this, [sql, ...args]);
    },
  });
  let result: { phase: "result"; ok: boolean; code?: string };
  try {
    if (input.operation === "sign-in") store.signIn(input.email, input.password);
    else if (input.operation === "change-password") {
      store.changePassword(input.token, { currentPassword: input.password, newPassword: input.newPassword });
    } else if (input.operation === "verify-email") store.verifyEmail(input.email, input.code);
    else if (input.operation === "begin-deletion") store.beginAccountDeletion(input.token, input.password);
    else if (input.operation === "revoke-sessions") store.revokeOtherSessions(input.token);
    else throw new Error("Unknown fixture operation");
    result = { phase: "result", ok: true };
  } catch (error) {
    result = { phase: "result", ok: false,
      code: error instanceof MatterhornAuthError ? error.code : "fixture_failure" };
  } finally {
    Object.defineProperty(Database.prototype, "prepare", descriptor);
    store.close();
  }
  port.postMessage(result);
  port.close();
});
