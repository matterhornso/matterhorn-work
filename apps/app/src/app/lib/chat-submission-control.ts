import { accountClientState } from "./account-client-state";
import type { ModelOperationContext } from "./model-operation-metrics";

// Only pending client preparation is controlled here. Once dispatched, stopping
// the runtime and reconciling usage remain server responsibilities.
const submissions = new Map<ModelOperationContext, AbortController>();

export class ChatSubmissionStoppedError extends Error {
  constructor() {
    super("Request stopped before the message was sent. Your draft is still available.");
  }
}

export function requireActiveChatSubmission(signal?: AbortSignal) {
  if (signal?.aborted) throw new ChatSubmissionStoppedError();
}

export function beginChatSubmission(operation: ModelOperationContext) {
  const controller = new AbortController();
  submissions.set(operation, controller);
  return {
    signal: controller.signal,
    finish: () => { if (submissions.get(operation) === controller) submissions.delete(operation); },
  };
}

export function stopChatSubmission(operation: ModelOperationContext | null) {
  if (operation) submissions.get(operation)?.abort();
}

accountClientState.register("chat-submissions", () => {
  for (const controller of submissions.values()) controller.abort();
  submissions.clear();
}, "stop");
