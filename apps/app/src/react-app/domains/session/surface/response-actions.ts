import type { UIMessage } from "ai";
import type { MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";
import { AccountStateChangedError, captureAccountGeneration } from "../../../../app/lib/account-client-state";
import type { ComposerAttachment } from "../../../../app/types";
import { CHAT_ATTACHMENT_MAX_BYTES } from "@matterhorn-work/types/chat-attachments";

export function failedResponseId(
  responseMessageId: string | undefined,
  messages: readonly UIMessage[],
): string | null {
  const latest = messages.at(-1);
  return responseMessageId && latest?.role === "assistant" && latest.id === responseMessageId ? responseMessageId : null;
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
  attachments: Extract<UIMessage["parts"][number], { type: "file" }>[];
};

export class ResponseRetryAttachmentError extends Error {
  constructor() {
    super("The original attachments cannot be restored. Attach the files again in the composer and send a new message. The original conversation is unchanged.");
  }
}

/** Replay saved bytes only; never fetch remote, expired blob, or mutable file URLs. */
export function restoreResponseRetryAttachments(turn: AssistantResponseRetryTurn): ComposerAttachment[] {
  const unavailable = () => new ResponseRetryAttachmentError();
  if (turn.attachments.length > 64) throw unavailable();
  // Bound allocations before decoding. The gateway independently enforces its
  // decoded aggregate and encoded request limits again on submission.
  let remaining = CHAT_ATTACHMENT_MAX_BYTES * 2;
  return turn.attachments.map((part, index): ComposerAttachment => {
    if (part.url.length > Math.ceil(CHAT_ATTACHMENT_MAX_BYTES / 3) * 4 + 1024) throw unavailable();
    const match = /^data:([^,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(part.url);
    if (!match || match[2].length % 4 !== 0) throw unavailable();
    if (match[1].split(";")[0].toLowerCase() !== part.mediaType.split(";")[0].toLowerCase()) throw unavailable();
    const encoded = match[2];
    const size = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
    if (size > CHAT_ATTACHMENT_MAX_BYTES || size > remaining) throw unavailable();
    remaining -= size;
    let decoded: string;
    try { decoded = atob(encoded); } catch { throw unavailable(); }
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    const name = part.filename || "attachment";
    const file = new File([bytes], name, { type: part.mediaType });
    return { id: `retry:${turn.promptMessageId}:${index}`, name, mimeType: part.mediaType,
      size: file.size, kind: part.mediaType.startsWith("image/") ? "image" : "file", file };
  });
}

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
      attachments: candidate.parts.filter(part => part.type === "file"),
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
