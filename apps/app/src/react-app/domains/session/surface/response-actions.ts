import type { UIMessage } from "ai";

export type AssistantResponseRetryTurn = {
  responseIndex: number;
  promptMessageId: string;
  prompt: string;
};

export type AssistantResponseRetryTransaction = {
  abort: () => Promise<void>;
  revert: () => Promise<unknown>;
  dispatch: () => Promise<void> | void;
  restore: () => Promise<unknown>;
};

export async function runAssistantResponseRetry(
  transaction: AssistantResponseRetryTransaction,
): Promise<void> {
  await transaction.abort();
  await transaction.revert();
  try {
    await transaction.dispatch();
  } catch (dispatchError) {
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
