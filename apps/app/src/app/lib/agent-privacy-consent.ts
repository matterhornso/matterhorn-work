// Browser events and malformed API responses must never become consent tokens.
// Reject rather than silently discard them: only an explicit server-issued
// string can request the exact-request consent path. The server validates it.
export function validatePrivacyConsentToken(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Privacy approval is invalid. Review privacy details and try again.");
  }
  return value;
}
