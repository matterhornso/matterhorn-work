import { describe, expect, spyOn, test } from "bun:test";
import { ApprovalService } from "./approvals.js";
import type { ApprovalRequest } from "./types.js";

const input: Omit<ApprovalRequest, "id" | "createdAt"> = {
  workspaceId: "workspace-test",
  action: "session.prompt",
  summary: "Submit a test prompt",
  paths: [],
  actor: { type: "remote" },
};

describe("pending host approvals", () => {
  for (const outcome of ["allow", "deny", "timeout", "cancelled"] as const) {
    test(`${outcome} clears the queue and cancellation listener`, async () => {
      const approvals = new ApprovalService({ mode: "manual", timeoutMs: 20 });
      const controller = new AbortController();
      const removeListener = spyOn(controller.signal, "removeEventListener");
      try {
        const pending = approvals.requestApproval(input, controller.signal);
        const id = approvals.list()[0].id;
        if (outcome === "cancelled") controller.abort();
        if (outcome === "allow" || outcome === "deny") approvals.respond(id, outcome);
        expect(await pending).toEqual({
          id,
          allowed: outcome === "allow",
          reason: outcome === "allow" ? undefined : outcome === "deny" ? "denied" : outcome,
        });
        expect(approvals.list()).toEqual([]);
        expect(removeListener).toHaveBeenCalledTimes(1);
        expect(approvals.respond(id, "allow")).toBeNull();
        controller.abort();
        expect(approvals.list()).toEqual([]);
      } finally {
        removeListener.mockRestore();
      }
    });
  }

  for (const mode of ["manual", "auto"] as const) {
    test(`already cancelled ${mode} requests cannot be allowed`, async () => {
      const approvals = new ApprovalService({ mode, timeoutMs: 20 });
      const controller = new AbortController();
      controller.abort();
      expect(await approvals.requestApproval(input, controller.signal)).toEqual({
        id: "cancelled", allowed: false, reason: "cancelled",
      });
      expect(approvals.list()).toEqual([]);
    });
  }

  test("cancelling one request does not affect another request", async () => {
    const approvals = new ApprovalService({ mode: "manual", timeoutMs: 1_000 });
    const controller = new AbortController();
    const cancelled = approvals.requestApproval(input, controller.signal);
    const active = approvals.requestApproval(input);
    const [cancelledRequest, activeRequest] = approvals.list();
    controller.abort();
    expect((await cancelled).allowed).toBe(false);
    expect(approvals.respond(cancelledRequest.id, "allow")).toBeNull();
    expect(approvals.list()).toEqual([activeRequest]);
    approvals.respond(activeRequest.id, "allow");
    expect((await active).allowed).toBe(true);
    expect(approvals.list()).toEqual([]);
  });

  test("auto mode remains immediate for active requests", async () => {
    const approvals = new ApprovalService({ mode: "auto", timeoutMs: 20 });
    expect(await approvals.requestApproval(input, new AbortController().signal)).toEqual({
      id: "auto", allowed: true,
    });
    expect(approvals.list()).toEqual([]);
  });
});
