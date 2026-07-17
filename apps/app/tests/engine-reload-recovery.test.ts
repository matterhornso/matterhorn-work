import { describe, expect, test } from "bun:test";

import { describeReloadError } from "../src/react-app/kernel/system-state";
import { refreshProviderListAfterEngineReload } from "../src/react-app/domains/connections/provider-list-query";

describe("engine reload recovery", () => {
  test("does not show a raw transport timeout as reload guidance", () => {
    expect(describeReloadError(new Error("Request timed out."))).toBe("Failed to reload the engine.");
  });

  test("keeps a successful engine reload independent from provider reconnection", async () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    let calls = 0;

    refreshProviderListAfterEngineReload({} as any, {
      refresh: async () => {
        calls += 1;
        if (calls === 1) throw new Error("engine still reconnecting");
      },
      schedule: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(750);

    scheduled[0]?.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});
