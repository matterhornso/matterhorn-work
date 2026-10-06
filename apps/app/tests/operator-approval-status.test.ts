import { describe, expect, test } from "bun:test";
import { isOperatorApprovalPending } from "../src/react-app/domains/session/surface/operator-approval-status";

describe("operator approval status", () => {
  const pending = { sending: true, currentRequest: true, sessionId: "session-a",
    status: { session: { id: "session-a" }, awaitingOperatorApproval: true } };

  test("shows waiting only for an authoritative current-session pending approval", () => {
    expect(isOperatorApprovalPending(pending)).toBe(true);
    expect(isOperatorApprovalPending({ ...pending, status: { ...pending.status, awaitingOperatorApproval: false } })).toBe(false);
  });
  test("does not infer approval from an older server, loading, idle, or failed status", () => {
    expect(isOperatorApprovalPending({ ...pending, status: undefined })).toBe(false);
    expect(isOperatorApprovalPending({ ...pending, status: { session: { id: "session-a" } } })).toBe(false);
  });
  test("drops status after completion/cancellation, navigation, account change or supersession", () => {
    expect(isOperatorApprovalPending({ ...pending, sending: false })).toBe(false);
    expect(isOperatorApprovalPending({ ...pending, currentRequest: false })).toBe(false);
    expect(isOperatorApprovalPending({ ...pending, sessionId: "session-b" })).toBe(false);
  });
  test("surface polling is request-scoped and never adds an account approval action", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url)).text();
    expect(source).toContain('["session-operator-approval", props.workspaceId, props.sessionId, activeModelOperation?.id]');
    expect(source).toContain("isCurrentView() && isLatestModelOperation(operation)");
    expect(source).toContain("Waiting for operator approval");
    expect(source).not.toContain("props.client.approve");
  });
});
