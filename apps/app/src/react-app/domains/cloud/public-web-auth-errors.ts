import { DenApiError } from "../../../app/lib/den-api-error";

const SAFE_ACTION_ERROR_CODES = new Set([
  "email_delivery_failed",
  "email_delivery_unavailable",
  "legal_acceptance_configuration_invalid",
  "signup_capacity_reached",
  "signup_security_configuration_invalid",
  "signups_paused",
]);

export function publicWebAuthErrorMessage(error: unknown): string {
  if (error instanceof DenApiError) {
    if (SAFE_ACTION_ERROR_CODES.has(error.code)) return error.message;
    if (error.status >= 500) {
      return "Account access is temporarily unavailable. Please try again shortly.";
    }
    return error.message;
  }
  if (error instanceof Error && /timed out/i.test(error.message)) {
    return "The request took too long. Check your connection and try again.";
  }
  return "Matterhorn could not complete that request. Please try again.";
}
