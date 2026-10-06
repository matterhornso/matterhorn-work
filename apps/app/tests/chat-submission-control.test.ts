import { beforeEach, expect, test } from "bun:test";
import { accountClientState } from "../src/app/lib/account-client-state";
import { beginModelOperation } from "../src/app/lib/model-operation-metrics";
import {
  beginChatSubmission, stopChatSubmission, requireActiveChatSubmission, ChatSubmissionStoppedError,
} from "../src/app/lib/chat-submission-control";

beforeEach(() => accountClientState.clear());
const operation = (workspaceId = "workspace", sessionId = "session") => beginModelOperation({ workspaceId, sessionId, source: "chat" });

test("Stop cancels only the exact pending submission, not a newer request or another workspace", () => {
  const older = operation();
  const newer = operation();
  const other = operation("other");
  const submissions = [older, newer, other].map(beginChatSubmission);
  stopChatSubmission(older);
  stopChatSubmission(older);
  stopChatSubmission(null);
  expect(() => requireActiveChatSubmission(submissions[0].signal)).toThrow(ChatSubmissionStoppedError);
  expect(() => requireActiveChatSubmission(submissions[1].signal)).not.toThrow();
  expect(() => requireActiveChatSubmission(submissions[2].signal)).not.toThrow();
  submissions.forEach(item => item.finish());
});

test("finished submissions release their cancellation registration", () => {
  const request = operation();
  const submission = beginChatSubmission(request);
  submission.finish();
  stopChatSubmission(request);
  expect(submission.signal.aborted).toBe(false);
});

test("account reset stops all pending preparation without cancelling a new account's request", () => {
  const request = operation();
  const submission = beginChatSubmission(request);
  accountClientState.clear();
  expect(submission.signal.aborted).toBe(true);
  const next = operation();
  const nextSubmission = beginChatSubmission(next);
  submission.finish();
  stopChatSubmission(request);
  expect(nextSubmission.signal.aborted).toBe(false);
  nextSubmission.finish();
});
