import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HOSTED_MCP_ACCESS_MAX_DAYS,
  MatterhornAuthError,
  MatterhornAuthStore,
} from "./auth-store.js";

const PASSWORD = "matterhorn-hosted-mcp-password";
const INTEGRITY_SECRET = "matterhorn-hosted-mcp-integrity-secret-32-bytes";
const DAY_MS = 24 * 60 * 60 * 1_000;
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-hosted-mcp-"));
  roots.push(root);
  const path = join(root, "accounts.db");
  return { store: new MatterhornAuthStore(path, INTEGRITY_SECRET), path };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("hosted MCP access credentials", () => {
  test("stores only a hash and resolves one account-bound expiring credential", () => {
    const { store, path } = fixture();
    const session = store.createAccount({
      email: "owner@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const issued = store.createHostedMcpAccessCredential(session.token, {
      label: "Codex on laptop",
      expiresInDays: 7,
    });
    const activeOrgId = session.activeOrgId;
    if (!activeOrgId) throw new Error("Expected a personal workspace.");

    expect(issued.token).toMatch(/^mhmcp_[A-Za-z0-9_-]{43}$/);
    expect(issued.activeOrgId).toBe(activeOrgId);
    expect(issued.expiresAt - issued.createdAt).toBe(7 * DAY_MS);
    expect(store.resolveHostedMcpAccessCredential(issued.token)).toEqual({
      credentialId: issued.id,
      user: session.user,
      activeOrgId,
      expiresAt: issued.expiresAt,
    });
    expect(store.listHostedMcpAccessCredentials(session.token)).toEqual([
      expect.objectContaining({
        id: issued.id,
        label: "Codex on laptop",
        activeOrgId,
      }),
    ]);
    expect(JSON.stringify(store.listHostedMcpAccessCredentials(session.token)))
      .not.toContain(issued.token);

    const db = new Database(path, { readonly: true });
    const row = db.query(
      "SELECT token_hash, label, authority_seal FROM hosted_mcp_access_tokens WHERE id = ?",
    ).get(issued.id) as { token_hash: string; label: string; authority_seal: string };
    db.close();
    expect(row.label).toBe("Codex on laptop");
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.token_hash).not.toContain(issued.token);
    expect(row.authority_seal).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.hostedMcpAccessIntegrityReady()).toBe(true);
    store.close();
  });

  test("fails closed when restored authority is extended, reassigned, unrevoked, or opened with the wrong key", () => {
    const { store, path } = fixture();
    const owner = store.createAccount({
      email: "integrity-owner@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const other = store.createAccount({
      email: "integrity-other@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const issued = store.createHostedMcpAccessCredential(owner.token, {
      label: "Claude Desktop",
      expiresInDays: 7,
    });
    store.close();

    const wrongKey = new MatterhornAuthStore(
      path,
      "matterhorn-hosted-mcp-wrong-integrity-secret",
    );
    expect(wrongKey.hostedMcpAccessIntegrityReady()).toBe(false);
    expect(wrongKey.resolveHostedMcpAccessCredential(issued.token)).toBeNull();
    wrongKey.close();

    const cases = [
      { assignment: "expires_at = expires_at + ?", value: DAY_MS, revokeFirst: false },
      { assignment: "user_id = ?", value: other.user.id, revokeFirst: false },
      { assignment: "revoked_at = NULL", value: null, revokeFirst: true },
    ] as const;
    let credential = issued;
    for (const { assignment, value, revokeFirst } of cases) {
      if (revokeFirst) {
        const revoker = new MatterhornAuthStore(path, INTEGRITY_SECRET);
        expect(revoker.revokeHostedMcpAccessCredential(owner.token, credential.id)).toBe(true);
        revoker.close();
      }
      const db = new Database(path);
      db.exec("DROP TRIGGER IF EXISTS hosted_mcp_access_authority_seal_update");
      if (value === null) {
        db.query(`UPDATE hosted_mcp_access_tokens SET ${assignment} WHERE id = ?`)
          .run(credential.id);
      } else {
        db.query(`UPDATE hosted_mcp_access_tokens SET ${assignment} WHERE id = ?`)
          .run(value, credential.id);
      }
      db.close();
      const restored = new MatterhornAuthStore(path, INTEGRITY_SECRET);
      expect(restored.hostedMcpAccessIntegrityReady()).toBe(false);
      expect(restored.resolveHostedMcpAccessCredential(credential.token)).toBeNull();
      restored.close();

      const repair = new Database(path);
      repair.query("DELETE FROM hosted_mcp_access_tokens WHERE id = ?").run(credential.id);
      repair.close();
      const fresh = new MatterhornAuthStore(path, INTEGRITY_SECRET);
      credential = fresh.createHostedMcpAccessCredential(owner.token, {
        label: "Claude Desktop",
        expiresInDays: 7,
      });
      fresh.close();
    }
  });

  test("fails closed for expiry, revocation, cross-account revocation, and invalid lifetimes", () => {
    const { store } = fixture();
    const owner = store.createAccount({
      email: "owner-two@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const other = store.createAccount({
      email: "other@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const issued = store.createHostedMcpAccessCredential(owner.token, {
      label: "Claude Code",
      expiresInDays: 1,
    });

    expect(store.resolveHostedMcpAccessCredential(issued.token, issued.expiresAt))
      .toBeNull();
    expect(store.revokeHostedMcpAccessCredential(other.token, issued.id)).toBe(false);
    expect(store.revokeHostedMcpAccessCredential(owner.token, issued.id)).toBe(true);
    expect(store.revokeHostedMcpAccessCredential(owner.token, issued.id)).toBe(false);
    expect(store.resolveHostedMcpAccessCredential(issued.token)).toBeNull();
    expect(store.listHostedMcpAccessCredentials(owner.token)).toEqual([]);

    for (const expiresInDays of [0, HOSTED_MCP_ACCESS_MAX_DAYS + 1, 1.5]) {
      expect(() => store.createHostedMcpAccessCredential(owner.token, {
        label: "Invalid",
        expiresInDays,
      })).toThrow(MatterhornAuthError);
    }
    expect(() => store.createHostedMcpAccessCredential(owner.token, {
      label: "\n",
    })).toThrow(MatterhornAuthError);
    store.close();
  });

  test("caps active credentials and removes only metadata older than 365 days", () => {
    const { store, path } = fixture();
    const session = store.createAccount({
      email: "bounded@example.com",
      password: PASSWORD,
      emailVerified: true,
    });
    const credentials = Array.from({ length: 5 }, (_, index) =>
      store.createHostedMcpAccessCredential(session.token, {
        label: `Client ${index + 1}`,
      }),
    );
    expect(() => store.createHostedMcpAccessCredential(session.token, {
      label: "Client 6",
    })).toThrow("Revoke an existing access key");

    const now = Date.now();
    expect(store.revokeHostedMcpAccessCredential(session.token, credentials[0]!.id)).toBe(true);
    expect(
      store.maintainEphemeralSecurityState(now + 364 * DAY_MS)
        .expiredHostedMcpCredentialsDeleted,
    ).toBe(0);
    expect(
      store.maintainEphemeralSecurityState(now + 366 * DAY_MS)
        .expiredHostedMcpCredentialsDeleted,
    ).toBe(1);
    const inspector = new Database(path, { readonly: true });
    expect(inspector.query(
      "SELECT COUNT(*) AS count FROM hosted_mcp_access_tokens",
    ).get()).toEqual({ count: 4 });
    inspector.close();
    store.close();
  });
});
