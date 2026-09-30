import { MATTERHORN_CONTINUE_ANSWER_TEXT } from "@matterhorn-work/types/guarded-agent-runtime";
import { ApiError } from "./errors.js";
import type { SessionInfoReadModel, SessionMessageReadModel } from "./session-read-model.js";

/** This is a new answer-only turn, never a replay of the original tool run. */
export function parseAnswerContinuation(body: Record<string, unknown>): string | undefined {
  if (body.continuationOf === undefined) return undefined;
  if (typeof body.continuationOf !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(body.continuationOf)) {
    throw new ApiError(400, "continuation_invalid", "Choose an incomplete answer in this chat to continue.");
  }
  const parts = body.parts;
  const part = Array.isArray(parts) && parts.length === 1 ? parts[0] : null;
  if (!part || typeof part !== "object" || Array.isArray(part)
    || part.type !== "text" || part.text !== MATTERHORN_CONTINUE_ANSWER_TEXT
    || Object.keys(part).some(key => key !== "type" && key !== "text")
    || body.message !== undefined || body.noReply === true) {
    throw new ApiError(400, "continuation_invalid", "Continue answer accepts only the answer-continuation prompt.");
  }
  return body.continuationOf;
}

export function assertAnswerContinuationTarget(input: {
  messageId: string;
  session: SessionInfoReadModel;
  messages: SessionMessageReadModel[];
}) {
  const latest = input.messages.at(-1);
  // Reverted history may still be returned by OpenCode. Do not continue a
  // hidden answer or discard later turns to make an old answer eligible.
  if (input.session.revert || !latest || latest.info.id !== input.messageId
    || latest.info.sessionID !== input.session.id || latest.info.role !== "assistant"
    || latest.info.finish !== "length" || latest.info.error
    || typeof latest.info.time?.completed !== "number"
    || !Number.isFinite(latest.info.time.completed)
    || !latest.parts.some(part => part.type === "text" && typeof part.text === "string" && part.text.trim()
      && !part.synthetic && !part.ignored)
    || latest.parts.some(part => part.type === "tool" && (!part.state || typeof part.state !== "object"
      || !("status" in part.state) || !["completed", "error"].includes(String(part.state.status))))) {
    throw new ApiError(409, "continuation_unavailable", "Only the latest answer cut short by an output limit can be continued. Refresh this chat and try again.");
  }
}

export function answerContinuationSystemContext(messageId: string): string {
  return `Continue only the incomplete answer ${messageId} from existing conversation evidence. All tools are disabled for this turn. Resume the missing information; do not restart or repeat the cut-off text. Refer to exact long identifiers already shown in the source result rather than regenerating repetitive strings; never invent, alter, or imply a shortened identifier is the exact signing value. Do not repeat actions, claim new reads, or claim fresh evidence. If the existing evidence is insufficient, explain what is missing.`;
}
