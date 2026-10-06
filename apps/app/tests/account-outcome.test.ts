import { describe, expect, test } from "bun:test";
import { ACCOUNT_OUTCOME_KEY, ACCOUNT_OUTCOME_MESSAGES, ACCOUNT_OUTCOME_TTL_MS, rememberAccountOutcome, takeAccountOutcome } from "../src/app/lib/account-outcome";

function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); } };
}
describe("same-tab account outcome notices", () => {
  test("all fixed outcomes survive navigation once without account data", () => {
    for (const code of ["password_changed", "account_deleted", "deletion_pending"] satisfies Array<keyof typeof ACCOUNT_OUTCOME_MESSAGES>) {
      const target = storage();
      expect(rememberAccountOutcome(code, target, 1000)).toBe(true);
      expect(JSON.parse(target.getItem(ACCOUNT_OUTCOME_KEY)!)).toEqual({ code, createdAt: 1000 });
      expect(takeAccountOutcome(target, 1001)).toBe(ACCOUNT_OUTCOME_MESSAGES[code]);
      expect(takeAccountOutcome(target, 1002)).toBeNull();
    }
  });
  test("expires at the boundary and rejects future clocks", () => {
    for (const now of [999, 1000 + ACCOUNT_OUTCOME_TTL_MS, Number.NaN]) {
      const target = storage();
      rememberAccountOutcome("deletion_pending", target, 1000);
      expect(takeAccountOutcome(target, now)).toBeNull();
      expect(target.getItem(ACCOUNT_OUTCOME_KEY)).toBeNull();
    }
    const target = storage();
    rememberAccountOutcome("deletion_pending", target, 1000);
    expect(takeAccountOutcome(target, 1000 + ACCOUNT_OUTCOME_TTL_MS - 1)).toContain("pending");
  });
  test("malformed or arbitrary stored text cannot become a notice", () => {
    for (const raw of ["<script>private</script>", "null", "[]", "{}", "x".repeat(257), JSON.stringify({code:"private-account-message",createdAt:1000}), JSON.stringify({code:"password_changed",createdAt:"1000"})]) {
      const target = storage(); target.setItem(ACCOUNT_OUTCOME_KEY, raw);
      expect(takeAccountOutcome(target, 1001)).toBeNull();
      expect(target.getItem(ACCOUNT_OUTCOME_KEY)).toBeNull();
    }
  });
  test("storage failures never block cleanup or surface storage errors", () => {
    const denied = () => { throw new Error("Synthetic storage denial"); };
    const target = { getItem: denied, setItem: denied, removeItem: denied };
    expect(rememberAccountOutcome("account_deleted", target)).toBe(false);
    expect(takeAccountOutcome(target)).toBeNull();
    expect(rememberAccountOutcome("account_deleted", null)).toBe(false);
    expect(takeAccountOutcome(null)).toBeNull();
  });
  test("a notice cannot be displayed when removal fails", () => {
    const target = storage(); rememberAccountOutcome("account_deleted", target, 1000);
    expect(takeAccountOutcome({ ...target, removeItem: () => { throw new Error("denied"); } }, 1001)).toBeNull();
  });
  test("a failed replacement write cannot replay the previous outcome", () => {
    const target = storage(); rememberAccountOutcome("account_deleted", target, 1000);
    expect(rememberAccountOutcome("deletion_pending", { ...target, setItem: () => { throw new Error("denied"); } }, 1001)).toBe(false);
    expect(takeAccountOutcome(target, 1002)).toBeNull();
  });
});
