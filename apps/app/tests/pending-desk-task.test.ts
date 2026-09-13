import { describe, expect, test } from "bun:test";

import {
  isCompactPendingDeskTaskId,
  pendingDeskTaskReturnSearch,
} from "../src/react-app/shell/pending-desk-task";

describe("pending desk task return route", () => {
  test.each(["bittensor", "hyperliquid", "polymarket", "sui"] as const)(
    "returns %s to the compact desk panel",
    (deskId) => {
      expect(isCompactPendingDeskTaskId(deskId)).toBe(true);
      expect(pendingDeskTaskReturnSearch(deskId)).toBe(`?panel=${deskId}`);
    },
  );

  test("keeps staged non-crypto workflows on the workflow route", () => {
    expect(isCompactPendingDeskTaskId("wellness")).toBe(false);
    expect(pendingDeskTaskReturnSearch("wellness")).toBe("?desk=wellness");
  });
});
