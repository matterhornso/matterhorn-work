import { describe, expect, test } from "bun:test";

import { assessMatterhornWalrusStorageLifecycle } from "./walrus-storage-lifecycle.js";

describe("Walrus storage lifecycle", () => {
  test("reports healthy, renewal due, and expired windows deterministically", () => {
    expect(assessMatterhornWalrusStorageLifecycle({ currentEpoch: 11, validUntilEpoch: 15 }))
      .toEqual({
        status: "healthy",
        remainingEpochs: 4,
        renewBeforeEpoch: 13,
        renewalAuthority: "wallet_or_infrastructure_only",
      });
    expect(assessMatterhornWalrusStorageLifecycle({ currentEpoch: 13, validUntilEpoch: 15 }))
      .toMatchObject({ status: "renewal_due", remainingEpochs: 2 });
    expect(assessMatterhornWalrusStorageLifecycle({ currentEpoch: 15, validUntilEpoch: 15 }))
      .toMatchObject({ status: "expired", remainingEpochs: 0 });
    expect(assessMatterhornWalrusStorageLifecycle({ currentEpoch: 16, validUntilEpoch: 15 }))
      .toMatchObject({ status: "expired", remainingEpochs: 0 });
  });

  test("fails closed for invalid epochs and thresholds", () => {
    expect(() => assessMatterhornWalrusStorageLifecycle({ currentEpoch: -1, validUntilEpoch: 15 }))
      .toThrow("walrus_storage_lifecycle_invalid");
    expect(() => assessMatterhornWalrusStorageLifecycle({
      currentEpoch: 1,
      validUntilEpoch: 15,
      renewalNoticeEpochs: -1,
    })).toThrow("walrus_storage_lifecycle_invalid");
  });
});
