import { expect, test } from "bun:test";
import { pendingMessageRequest } from "../src/app/lib/message-request-id";

test("lost acknowledgement retries keep their identity; acknowledged sends can be repeated intentionally", async () => {
  const first = await pendingMessageRequest("ws_a/ses_a", { message: "synthetic" });
  const retry = await pendingMessageRequest("ws_a/ses_a", { message: "synthetic" });
  const other = await pendingMessageRequest("ws_b/ses_a", { message: "synthetic" });
  expect(retry.id).toBe(first.id);
  expect(other.id).not.toBe(first.id);
  retry.accepted();
  const next = await pendingMessageRequest("ws_a/ses_a", { message: "synthetic" });
  expect(next.id).not.toBe(first.id);
  next.accepted();
  other.accepted();
});
