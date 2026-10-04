export const ACCOUNT_OUTCOME_KEY = "matterhorn.account-outcome.v1";
export const ACCOUNT_OUTCOME_TTL_MS = 5 * 60 * 1000;
export const ACCOUNT_OUTCOME_MESSAGES = {
  password_changed: "Password changed. Sign in again on this device.",
  account_deleted: "Account and owned workspace data deleted.",
  deletion_pending: "Account deletion is pending. You have been signed out; contact support to confirm completion.",
};
export type AccountOutcome = keyof typeof ACCOUNT_OUTCOME_MESSAGES;
type NoticeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): NoticeStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
function isOutcome(value: unknown): value is AccountOutcome {
  return value === "password_changed" || value === "account_deleted" || value === "deletion_pending";
}

// A same-tab navigation notice, not account data or evidence of authorization.
// Written only after account cleanup; intentionally survives that sign-out reload.
export function rememberAccountOutcome(code: AccountOutcome, target = storage(), now = Date.now()): boolean {
  if (!target) return false;
  try {
    target.removeItem(ACCOUNT_OUTCOME_KEY);
    target.setItem(ACCOUNT_OUTCOME_KEY, JSON.stringify({ code, createdAt: now }));
    return true;
  } catch { return false; }
}

export function takeAccountOutcome(target = storage(), now = Date.now()): string | null {
  if (!target) return null;
  try {
    const raw = target.getItem(ACCOUNT_OUTCOME_KEY);
    target.removeItem(ACCOUNT_OUTCOME_KEY);
    if (!raw || raw.length > 256) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("code" in value) || !isOutcome(value.code)
      || !("createdAt" in value) || typeof value.createdAt !== "number"
      || !Number.isFinite(value.createdAt) || !Number.isFinite(now)
      || now < value.createdAt || now - value.createdAt >= ACCOUNT_OUTCOME_TTL_MS) return null;
    return ACCOUNT_OUTCOME_MESSAGES[value.code];
  } catch { return null; }
}
