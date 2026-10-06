import { Database } from "bun:sqlite";
import { parentPort } from "node:worker_threads";
import { MatterhornAuthError, MatterhornAuthStore } from "../auth-store.js";

const port = parentPort;
if (!port) throw new Error("Workspace race fixture requires a worker");

port.once("message", (input: unknown) => {
  if (!input || typeof input !== "object"
    || !("path" in input) || typeof input.path !== "string"
    || !("operation" in input) || typeof input.operation !== "string"
    || !("token" in input) || typeof input.token !== "string"
    || !("organizationId" in input) || typeof input.organizationId !== "string"
    || !("credentialId" in input) || typeof input.credentialId !== "string"
    || !("barrier" in input) || !(input.barrier instanceof SharedArrayBuffer)) {
    throw new Error("Invalid workspace race fixture input");
  }
  const store = new MatterhornAuthStore(input.path, "disposable-workspace-race-integrity-key-only");
  const barrier = new Int32Array(input.barrier);
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, "prepare");
  if (!descriptor) throw new Error("Missing SQLite prepare method");
  const original = Database.prototype.prepare;
  let armed = true;
  // Pause after the old session/organization reads, before the first SQL
  // statement that needs current authority. Only this fixture worker is changed.
  Object.defineProperty(Database.prototype, "prepare", { ...descriptor,
    value: function(this: Database, sql: unknown, ...args: unknown[]) {
      if (armed && typeof sql === "string" && (
        /UPDATE\s+sessions\s+SET\s+(expires_at|active_org_id)/i.test(sql)
        || /INSERT\s+INTO\s+organizations/i.test(sql)
        || /FROM\s+hosted_mcp_access_tokens/i.test(sql)
      )) {
        armed = false;
        port.postMessage({ phase: "authority-read" });
        if (Atomics.wait(barrier, 0, 0, 5000) === "timed-out") {
          throw new Error("Workspace race fixture barrier timed out");
        }
      }
      return Reflect.apply(original, this, [sql, ...args]);
    },
  });
  let result: { phase: "result"; ok: boolean; code?: string };
  try {
    if (input.operation === "create-organization") {
      store.createOrganization(input.token, { name: "Stale workspace", slug: "stale-workspace" });
    } else if (input.operation === "select-organization") {
      store.setActiveOrganization(input.token, { organizationId: input.organizationId });
    } else if (input.operation === "create-access") {
      store.createHostedMcpAccessCredential(input.token, { label: "Stale request", expiresInDays: 1 });
    } else if (input.operation === "revoke-access") {
      store.revokeHostedMcpAccessCredential(input.token, input.credentialId);
    } else throw new Error("Unknown workspace fixture operation");
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
