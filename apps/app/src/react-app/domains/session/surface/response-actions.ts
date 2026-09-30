import type { UIMessage } from "ai";
import type { MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";
import { MATTERHORN_CONTINUE_ANSWER_TEXT } from "@matterhorn-work/types/guarded-agent-runtime";
import { AccountStateChangedError, captureAccountGeneration } from "../../../../app/lib/account-client-state";

export function failedContinuationResponseId(
  failure: { id: string; retryMessage: string } | null,
  messages: readonly UIMessage[],
): string | null {
  const latest = messages.at(-1);
  return failure?.retryMessage === MATTERHORN_CONTINUE_ANSWER_TEXT
    && latest?.role === "assistant" && latest.id === failure.id ? failure.id : null;
}

export function requireAnswerContinuationSupport(preflight: Pick<MatterhornAgentPrivacyPreflightResponse, "continuation">, messageId: string) {
  if (preflight.continuation?.messageId !== messageId || preflight.continuation.tools !== "disabled") {
    throw new Error("This backend does not support safe answer continuation yet. Ask the workspace owner to update it; your draft is unchanged.");
  }
}

export type AssistantResponseRetryTurn = {
  responseIndex: number;
  promptMessageId: string;
  prompt: string;
};

export type AssistantResponseRetryTransaction<T> = {
  prepare: () => Promise<T>;
  abort: () => Promise<void>;
  revert: () => Promise<unknown>;
  dispatch: (prepared: T) => Promise<void> | void;
  restore: () => Promise<unknown>;
};

export async function runAssistantResponseRetry<T>(
  transaction: AssistantResponseRetryTransaction<T>,
): Promise<void> {
  const isCurrentAccount = captureAccountGeneration();
  const requireCurrentAccount = () => { if (!isCurrentAccount()) throw new AccountStateChangedError(); };
  // Classification/consent preparation can be cancelled. Do not change the
  // existing conversation until it finishes successfully.
  const prepared = await transaction.prepare();
  requireCurrentAccount();
  await transaction.abort();
  requireCurrentAccount();
  await transaction.revert();
  requireCurrentAccount();
  try {
    await transaction.dispatch(prepared);
  } catch (dispatchError) {
    requireCurrentAccount();
    try {
      await transaction.restore();
    } catch {
      throw new Error(
        "Retry failed and Matterhorn could not restore the original conversation. Reload the session before continuing.",
        { cause: dispatchError },
      );
    }
    throw dispatchError;
  }
}

function retryPromptText(message: UIMessage) {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text" || part.type === "reasoning") return [part.text];
      return [];
    })
    .join("\n\n")
    .trim();
}

export function resolveAssistantResponseRetryTurn(
  messages: readonly UIMessage[],
  responseMessageId: string,
): AssistantResponseRetryTurn | null {
  const responseIndex = messages.findIndex((message) => (
    message.id === responseMessageId && message.role === "assistant"
  ));
  if (responseIndex < 0) return null;

  for (let index = responseIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role !== "user") continue;
    return {
      responseIndex,
      promptMessageId: candidate.id,
      prompt: retryPromptText(candidate),
    };
  }
  return null;
}

export function responseOutputTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/[*_`>]+/g, "").trim())
    .find(Boolean);
  if (!firstLine) return "Matterhorn response";
  return firstLine.length > 72 ? `${firstLine.slice(0, 69).trimEnd()}...` : firstLine;
}
