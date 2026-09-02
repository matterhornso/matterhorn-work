import type { MatterhornWalrusStorageLifecycle } from "@matterhorn-work/types/crypto-coworkers";

export const MATTERHORN_WALRUS_RENEWAL_NOTICE_EPOCHS = 2;

function validEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Deterministic storage-window assessment. This reports when renewal is due;
 * it never grants an agent signing, payment, or publication authority.
 */
export function assessMatterhornWalrusStorageLifecycle(input: {
  currentEpoch: number;
  validUntilEpoch: number;
  renewalNoticeEpochs?: number;
}): MatterhornWalrusStorageLifecycle {
  const renewalNoticeEpochs = input.renewalNoticeEpochs
    ?? MATTERHORN_WALRUS_RENEWAL_NOTICE_EPOCHS;
  if (!validEpoch(input.currentEpoch)
    || !validEpoch(input.validUntilEpoch)
    || !Number.isSafeInteger(renewalNoticeEpochs)
    || renewalNoticeEpochs < 0) {
    throw new Error("walrus_storage_lifecycle_invalid");
  }
  const remainingEpochs = Math.max(0, input.validUntilEpoch - input.currentEpoch);
  const renewBeforeEpoch = Math.max(0, input.validUntilEpoch - renewalNoticeEpochs);
  return {
    status: remainingEpochs === 0
      ? "expired"
      : remainingEpochs <= renewalNoticeEpochs ? "renewal_due" : "healthy",
    remainingEpochs,
    renewBeforeEpoch,
    renewalAuthority: "wallet_or_infrastructure_only",
  };
}
