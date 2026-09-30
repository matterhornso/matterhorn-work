import { expect, test } from "bun:test";
import { latestFinalRunReceipt } from "../src/app/lib/latest-run-receipt";

test("a settling latest run never borrows an older receipt", () => {
  expect(latestFinalRunReceipt([{ status: "pending" }, { status: "cancelled" }])).toBeNull();
  expect(latestFinalRunReceipt([{ status: "pending" }, { status: "success" }])).toBeNull();
});

test("the newest final outcome remains truthful including failures and cancellation", () => {
  for (const status of ["success", "partial", "error", "cancelled"] as const) {
    const newest = { status };
    expect(latestFinalRunReceipt([newest, { status: "success" }])).toBe(newest);
  }
  expect(latestFinalRunReceipt([])).toBeNull();
  expect(latestFinalRunReceipt(undefined)).toBeNull();
});
