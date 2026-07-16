import { describe, expect, test } from "bun:test";

import { checkoutPaymentStatusAllowsSync, subscriptionStatusValue } from "./billing.js";

describe("billing event defaults", () => {
  test("does not grant checkout state without an explicitly settled payment status", () => {
    expect(checkoutPaymentStatusAllowsSync(undefined)).toBe(false);
    expect(checkoutPaymentStatusAllowsSync("unpaid")).toBe(false);
    expect(checkoutPaymentStatusAllowsSync("paid")).toBe(true);
    expect(checkoutPaymentStatusAllowsSync("no_payment_required")).toBe(true);
  });

  test("maps unknown subscription states to no entitlement", () => {
    expect(subscriptionStatusValue(undefined)).toBe("none");
    expect(subscriptionStatusValue("unexpected_future_state")).toBe("none");
    expect(subscriptionStatusValue("active")).toBe("active");
  });
});
