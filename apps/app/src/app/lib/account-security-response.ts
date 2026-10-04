import type { DenAccountDeletionResult, DenAccountExport, DenAccountSecuritySummary, DenOrgSummary } from "./den";
import { DenApiError } from "./den-api-error";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function date(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function organizations(value: unknown): value is DenOrgSummary[] {
  return Array.isArray(value) && value.every((org) => record(org)
    && text(org.id) && text(org.name) && text(org.slug)
    && (org.role === "owner" || org.role === "admin" || org.role === "member"));
}

export function verifiedAccountResponse<T>(value: unknown, validate: (value: unknown) => value is T): T {
  if (!validate(value)) {
    throw new DenApiError(502, "invalid_account_security_response",
      "The server response could not be verified. Check your account status before retrying.");
  }
  return value;
}

export function isAccountSecuritySummary(value: unknown): value is DenAccountSecuritySummary {
  return record(value) && count(value.sessionCount) && value.sessionCount > 0
    && organizations(value.organizations) && organizations(value.sharedOrganizationsBlockingDeletion);
}

export function isAccountExport(value: unknown): value is DenAccountExport {
  if (!record(value) || value.version !== "matterhorn.account-export.v1"
    || !date(value.generatedAt) || !text(value.filename)
    || !/^[a-zA-Z0-9_-]+\.json$/.test(value.filename) || value.filename.length > 200
    || !record(value.account) || !text(value.account.id) || !text(value.account.email)
    || !(value.account.name === null || typeof value.account.name === "string")
    || typeof value.account.emailVerified !== "boolean" || !date(value.account.createdAt)
    || !organizations(value.organizations) || !record(value.security) || !count(value.security.activeSessionCount)
    || !strings(value.includes) || !strings(value.excludes)) return false;
  return value.legalAcceptance === null || (record(value.legalAcceptance)
    && text(value.legalAcceptance.termsVersion) && text(value.legalAcceptance.privacyVersion)
    && date(value.legalAcceptance.acceptedAt));
}

export function isSessionRevocation(value: unknown): value is { revokedSessions: number } {
  return record(value) && value.ok === true && count(value.revokedSessions);
}

export function isPasswordChange(value: unknown): value is { ok: true; signedOutEverywhere: true } {
  return record(value) && value.ok === true && value.signedOutEverywhere === true;
}

export function isAccountDeletion(value: unknown): value is DenAccountDeletionResult {
  if (!record(value) || !text(value.deletionJobId) || !count(value.deletedOrganizationCount)
    || !count(value.workspaceDataDeletionFailures)) return false;
  return (value.ok === true && value.status === "deleted" && value.workspaceDataDeletionComplete === true
      && value.workspaceDataDeletionFailures === 0)
    || (value.ok === false && value.status === "deletion_pending" && value.workspaceDataDeletionComplete === false
      && value.workspaceDataDeletionFailures > 0);
}
