import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { ApprovalService } from "./approvals.js";
import { ApiError } from "./errors.js";
import { GOOGLE_WORKSPACE_EXTENSION_ACTIONS } from "./extensions/google-workspace.js";
import {
  googleWorkspaceExtensionOperation,
  runGoogleWorkspaceOperation,
  type GoogleWorkspaceOperation,
} from "./google-workspace-access.js";
import type { Actor } from "./types.js";

const operations: GoogleWorkspaceOperation[] = [
  "status", "connect_status", "connect", "disconnect", "test", "smoke_test",
  "calendar_list_events", "gmail_create_draft", "drive_search_files", "drive_read_file",
];
const mutations: GoogleWorkspaceOperation[] = ["connect", "disconnect", "smoke_test", "gmail_create_draft"];

function context(options: {
  actor?: Actor;
  hosted?: boolean;
  hostedMcp?: boolean;
  readOnly?: boolean;
  manual?: boolean;
  timeoutMs?: number;
} = {}) {
  return {
    actor: options.actor ?? { type: "remote", scope: "owner" } satisfies Actor,
    matterhornSession: options.hosted ? { user: { id: "synthetic-hosted-user" } } : undefined,
    hostedMcpAccess: options.hostedMcp ? {} : undefined,
    config: { readOnly: options.readOnly ?? false },
    request: new AbortController(),
    approvals: new ApprovalService({ mode: options.manual ? "manual" : "auto", timeoutMs: options.timeoutMs ?? 1000 }),
  };
}

describe("host-global Google Workspace access", () => {
  for (const operation of operations) {
    test(`${operation} denies viewers, collaborators, unscoped and hosted identities before effects`, async () => {
      for (const access of [
        context({ actor: { type: "remote", scope: "viewer" } }),
        context({ actor: { type: "remote", scope: "collaborator" } }),
        context({ actor: { type: "remote" } }),
        context({ hosted: true }),
        context({ hostedMcp: true }),
      ]) {
        let effects = 0;
        await expect(runGoogleWorkspaceOperation(access, operation, async () => ++effects)).rejects.toMatchObject({
          status: 403, code: "forbidden",
        });
        expect(effects).toBe(0);
        expect(access.approvals.list()).toEqual([]);
      }
    });
    test(`${operation} respects readonly including credential refresh writes`, async () => {
      const access = context({ readOnly: true });
      let effects = 0;
      const pending = runGoogleWorkspaceOperation(access, operation, async () => ++effects);
      if (operation === "status" || operation === "connect_status") {
        expect(await pending).toBe(1);
      } else {
        await expect(pending).rejects.toMatchObject({ status: 403, code: "read_only" });
        expect(effects).toBe(0);
      }
      expect(access.approvals.list()).toEqual([]);
    });
  }

  for (const operation of mutations) {
    for (const outcome of ["allow", "deny", "timeout", "cancelled"]) {
      test(`${operation}: manual ${outcome} gates the external operation`, async () => {
        const access = context({ manual: true, timeoutMs: outcome === "timeout" ? 10 : 1000 });
        let effects = 0;
        const pending = runGoogleWorkspaceOperation(access, operation, async () => ({ mockedProviderCall: ++effects }));
        const queued = access.approvals.list();
        expect(queued).toHaveLength(1);
        expect(queued[0]).toMatchObject({
          workspaceId: "global:google-workspace", action: `google_workspace.${operation}`, paths: [],
        });
        expect(queued[0].summary).toContain("global Google Workspace account");
        expect(effects).toBe(0);
        if (outcome === "allow" || outcome === "deny") access.approvals.respond(queued[0].id, outcome);
        if (outcome === "cancelled") access.request.abort();
        if (outcome === "allow") {
          expect(await pending).toEqual({ mockedProviderCall: 1 });
        } else {
          await expect(pending).rejects.toMatchObject({
            status: 403, code: "write_denied",
            details: { reason: outcome === "deny" ? "denied" : outcome },
          });
          expect(effects).toBe(0);
        }
        expect(access.approvals.list()).toEqual([]);
      });
    }
  }

  test("approved then cancelled and auto-mode cancelled requests still have no effects", async () => {
    for (const manual of [true, false]) {
      const access = context({ manual });
      let effects = 0;
      const pending = runGoogleWorkspaceOperation(access, "gmail_create_draft", async () => ++effects);
      const queued = access.approvals.list();
      if (manual) access.approvals.respond(queued[0].id, "allow");
      access.request.abort();
      await expect(pending).rejects.toMatchObject({ status: 403, code: "write_denied" });
      expect(effects).toBe(0);
    }
  });

  test("owner provider reads use no mutation approval and auto policy remains supported", async () => {
    for (const operation of operations) {
      const access = context();
      expect(await runGoogleWorkspaceOperation(access, operation, async () => "mocked-owner-result")).toBe("mocked-owner-result");
      expect(access.approvals.list()).toEqual([]);
    }
  });

  test("the extension registry has an explicit policy for every supported action", () => {
    for (const action of GOOGLE_WORKSPACE_EXTENSION_ACTIONS) {
      expect(action.action).toBe(googleWorkspaceExtensionOperation(action));
    }
    expect(googleWorkspaceExtensionOperation({ extensionId: " google-workspace ", action: " gmail_create_draft " })).toBe("gmail_create_draft");
    for (const input of [{}, { extensionId: "another-account", action: "status" }, { extensionId: "google-workspace", action: "send_email" }]) {
      expect(() => googleWorkspaceExtensionOperation(input)).toThrow(ApiError);
    }
  });

  test("all reachable account routes and generic dispatch use the same guard", async () => {
    const source = await readFile(new URL("./server.ts", import.meta.url), "utf8");
    const routes = [
      ["/experimental/google-workspace/status", '"status"'],
      ["/experimental/google-workspace/connect/start", '"connect"'],
      ["/experimental/google-workspace/connect/status/:flowId", '"connect_status"'],
      ["/experimental/google-workspace/disconnect", '"disconnect"'],
      ["/experimental/google-workspace/test", '"test"'],
      ["/experimental/google-workspace/smoke-test", '"smoke_test"'],
      ["/experimental/extensions/call", "googleWorkspaceExtensionOperation(body)"],
    ];
    for (const [path, operation] of routes) {
      const start = source.indexOf(`, "${path}", "client",`);
      expect(start).toBeGreaterThan(0);
      const route = source.slice(start, source.indexOf('\n  });', start));
      expect(route).toContain(`runGoogleWorkspaceOperation(ctx, ${operation},`);
    }
  });
});
