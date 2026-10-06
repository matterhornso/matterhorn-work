/** Only the authenticated server can report a pending operator approval. */
export function isOperatorApprovalPending(input: {
  sending: boolean;
  currentRequest: boolean;
  sessionId: string;
  status?: { session: { id: string }; awaitingOperatorApproval?: boolean };
}) {
  return input.sending && input.currentRequest
    && input.status?.session.id === input.sessionId
    && input.status.awaitingOperatorApproval === true;
}
