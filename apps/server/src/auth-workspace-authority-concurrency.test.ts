import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { MatterhornAuthStore } from "./auth-store.js";
import { trackFixtureWorker } from "./fixtures/worker-lifecycle.js";

const PASSWORD = "disposable-workspace-authority";
const NEW_PASSWORD = "disposable-workspace-new-authority";
const INTEGRITY_SECRET = "disposable-workspace-race-integrity-key-only";

for (const operation of ["create-organization", "select-organization", "create-access", "revoke-access"]) {
  const boundaries = ["sign-out", "password-change", "deletion", "session-expiry"];
  if (operation === "select-organization" || operation === "create-access") boundaries.push("membership-removed");
  if (operation === "create-access") boundaries.push("workspace-switched", "capacity-filled");
  for (const boundary of boundaries) {
    test(`${operation} rejects stale authority after ${boundary}`, async () => {
      const root = mkdtempSync(join(tmpdir(), "matterhorn-workspace-authority-"));
      const path = join(root, "accounts.db");
      const store = new MatterhornAuthStore(path, INTEGRITY_SECRET);
      const db = new Database(path);
      const worker = new Worker(new URL("./fixtures/auth-workspace-race-worker.ts", import.meta.url));
      const lifecycle = trackFixtureWorker(worker);
      const barrier = new Int32Array(new SharedArrayBuffer(4));
      try {
        const owner = store.createAccount({ email: "workspace@example.com", password: PASSWORD });
        const originalOrgId = owner.activeOrgId;
        if (!originalOrgId) throw new Error("Fixture account has no personal workspace");
        const other = store.createAccount({ email: "other@example.com", password: PASSWORD });
        const target = store.createOrganization(owner.token, { name: "Second workspace", slug: "second-workspace" });
        store.setActiveOrganization(owner.token, { organizationId: owner.activeOrgId });
        const existing = store.createHostedMcpAccessCredential(owner.token, { label: "Existing key" });
        const otherKey = store.createHostedMcpAccessCredential(other.token, { label: "Other account key" });
        let survivor = store.signIn(owner.user.email, PASSWORD).token;
        let interleaved = false;
        const completed = new Promise<unknown>((resolve, reject) => {
          worker.on("error", reject);
          worker.on("exit", () => reject(new Error("Workspace worker exited without a result")));
          worker.on("message", (message: unknown) => {
            if (!message || typeof message !== "object" || !("phase" in message)) {
              reject(new Error("Invalid worker message")); return;
            }
            if (message.phase === "result") { resolve(message); return; }
            if (message.phase !== "authority-read") return;
            try {
              if (boundary === "sign-out") store.signOut(owner.token);
              else if (boundary === "password-change") {
                store.changePassword(owner.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
                survivor = store.signIn(owner.user.email, NEW_PASSWORD).token;
              } else if (boundary === "deletion") store.beginAccountDeletion(survivor, PASSWORD);
              else if (boundary === "session-expiry") {
                db.query("UPDATE sessions SET expires_at = 0 WHERE token_hash = ?").run(
                  createHash("sha256").update(owner.token).digest("hex"),
                );
              } else if (boundary === "membership-removed") {
                db.query("DELETE FROM organization_members WHERE user_id = ? AND organization_id = ?")
                  .run(owner.user.id, operation === "select-organization" ? target.id : owner.activeOrgId);
              } else if (boundary === "capacity-filled") {
                for (let index = 0; index < 4; index += 1) {
                  store.createHostedMcpAccessCredential(owner.token, { label: `Competing key ${index}` });
                }
              } else store.setActiveOrganization(owner.token, { organizationId: target.id });
              interleaved = true;
            } catch (error) { reject(error); }
            finally { Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0); }
          });
          worker.postMessage({ path, operation, token: owner.token, organizationId: target.id,
            credentialId: existing.id, barrier: barrier.buffer });
        });
        const code = boundary === "membership-removed" || boundary === "workspace-switched"
          ? operation === "select-organization" ? "invalid_organization" : "hosted_mcp_access_invalid"
          : boundary === "capacity-filled" ? "hosted_mcp_access_limit_reached" : "unauthorized";
        expect(await completed).toEqual({ phase: "result", ok: false, code });
        await lifecycle.waitForExit();
        expect(interleaved).toBe(true);
        expect(db.query("SELECT COUNT(*) AS count FROM organizations WHERE slug = 'stale-workspace'").get()).toEqual({ count: 0 });
        expect(db.query("SELECT COUNT(*) AS count FROM hosted_mcp_access_tokens WHERE user_id = ?").get(owner.user.id))
          .toEqual({ count: boundary === "capacity-filled" ? 5 : 1 });
        expect(db.query("SELECT revoked_at FROM hosted_mcp_access_tokens WHERE id = ?").get(existing.id)).toEqual({ revoked_at: null });
        expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
        expect(store.resolveHostedMcpAccessCredential(otherKey.token)?.user.id).toBe(other.user.id);
        if (boundary === "deletion") {
          expect(store.getSession(survivor)).toBeNull();
          expect(store.listPendingAccountDeletionJobs()[0]?.deletedOrganizationIds.sort()).toEqual([originalOrgId, target.id].sort());
        } else {
          expect(store.getSession(survivor)?.user.id).toBe(owner.user.id);
          if (boundary === "workspace-switched") expect(store.getSession(owner.token)?.activeOrgId).toBe(target.id);
          if (boundary === "membership-removed" && operation === "select-organization") {
            expect(store.getSession(owner.token)?.activeOrgId).toBe(owner.activeOrgId);
          }
        }
      } finally {
        Atomics.store(barrier, 0, 1); Atomics.notify(barrier, 0);
        await lifecycle.stop(); db.close(); store.close();
        rmSync(root, { recursive: true, force: true });
      }
    }, 15000);
  }
}

for (const operation of ["create-organization", "select-organization", "create-access", "revoke-access"]) {
  test(`${operation} rolls back failed writes without losing the session or other account`, () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-workspace-rollback-"));
    const path = join(root, "accounts.db");
    const store = new MatterhornAuthStore(path, INTEGRITY_SECRET);
    const db = new Database(path);
    try {
      const owner = store.createAccount({ email: "rollback@example.com", password: PASSWORD });
      const other = store.createAccount({ email: "other@example.com", password: PASSWORD });
      const target = store.createOrganization(owner.token, { name: "Target", slug: "target" });
      store.setActiveOrganization(owner.token, { organizationId: owner.activeOrgId });
      const existing = store.createHostedMcpAccessCredential(owner.token, { label: "Existing" });
      const otherKey = store.createHostedMcpAccessCredential(other.token, { label: "Other" });
      const mutation = () => {
        if (operation === "create-organization") return store.createOrganization(owner.token, { name: "New", slug: "new-workspace" });
        if (operation === "select-organization") return store.setActiveOrganization(owner.token, { organizationId: target.id });
        if (operation === "create-access") return store.createHostedMcpAccessCredential(owner.token, { label: "New key" });
        return store.revokeHostedMcpAccessCredential(owner.token, existing.id);
      };
      const trigger = operation === "create-organization" ? "BEFORE INSERT ON organization_members"
        : operation === "select-organization" ? "BEFORE UPDATE OF active_org_id ON sessions"
        : operation === "create-access" ? "BEFORE INSERT ON hosted_mcp_access_tokens"
        : "BEFORE UPDATE OF revoked_at ON hosted_mcp_access_tokens";
      db.run(`CREATE TRIGGER reject_mutation ${trigger} BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`);
      expect(mutation).toThrow("fixture write failure");
      expect(store.getSession(owner.token)?.activeOrgId).toBe(owner.activeOrgId);
      expect(store.getSession(owner.token)?.expiresAt).toBe(owner.expiresAt);
      expect(store.listOrganizations(owner.user.id)).toHaveLength(2);
      expect(db.query("SELECT COUNT(*) AS count FROM organizations WHERE slug = 'new-workspace'").get()).toEqual({ count: 0 });
      expect(store.listHostedMcpAccessCredentials(owner.token)).toHaveLength(1);
      expect(store.hostedMcpAccessIntegrityReady()).toBe(true);
      expect(store.resolveHostedMcpAccessCredential(existing.token)?.user.id).toBe(owner.user.id);
      expect(store.resolveHostedMcpAccessCredential(otherKey.token)?.user.id).toBe(other.user.id);
      db.run("DROP TRIGGER reject_mutation");
      expect(mutation).not.toThrow();
      if (operation === "create-organization") expect(store.listOrganizations(owner.user.id)).toHaveLength(3);
      if (operation === "select-organization") expect(store.getSession(owner.token)?.activeOrgId).toBe(target.id);
      if (operation === "create-access") expect(store.listHostedMcpAccessCredentials(owner.token)).toHaveLength(2);
      if (operation === "revoke-access") expect(store.resolveHostedMcpAccessCredential(existing.token)).toBeNull();
      expect(store.getSession(other.token)?.user.id).toBe(other.user.id);
    } finally {
      db.close(); store.close(); rmSync(root, { recursive: true, force: true });
    }
  });
}
