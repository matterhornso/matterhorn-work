import type { MatterhornServerClient } from "./matterhorn-server";

export const WALLET_CONFIRMATION_PREFIX = "matterhorn.wallet-confirmation.v1:";
export type PendingWalletConfirmation = {
  action: "evidence-renewal" | "file-renewal" | "evidence-deletion" | "evidence-anchor";
  resourceId: string;
  revision: number;
  signer: string;
  network: "testnet";
  intentId: string;
  intentHash: string;
  transactionDigest: string;
  expiresAt: string;
};
function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
function parsePending(value: unknown): PendingWalletConfirmation {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 9
    || !("action" in value) || (value.action !== "evidence-renewal" && value.action !== "file-renewal" && value.action !== "evidence-deletion" && value.action !== "evidence-anchor")
    || !("resourceId" in value) || !boundedText(value.resourceId)
    || !("revision" in value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !("signer" in value) || typeof value.signer !== "string" || !/^0x[0-9a-f]{64}$/.test(value.signer)
    || !("network" in value) || value.network !== "testnet"
    || !("intentId" in value) || !boundedText(value.intentId)
    || !("intentHash" in value) || typeof value.intentHash !== "string" || !/^[0-9a-f]{64}$/.test(value.intentHash)
    || !("transactionDigest" in value) || typeof value.transactionDigest !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.transactionDigest)
    || !("expiresAt" in value) || !boundedText(value.expiresAt) || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new WalletConfirmationRecoveryError("Saved wallet recovery details are invalid. Check your wallet before continuing.");
  }
  return {
    action: value.action, resourceId: value.resourceId, revision: value.revision, signer: value.signer,
    network: value.network, intentId: value.intentId, intentHash: value.intentHash,
    transactionDigest: value.transactionDigest, expiresAt: value.expiresAt,
  };
}
export type WalletConfirmationAction = PendingWalletConfirmation["action"];
export type ConfirmationClient = Pick<MatterhornServerClient,
  "listAgentFiles" | "listCryptoEvidence" | "confirmAgentFileRenewal"
  | "confirmCryptoEvidenceRenewal" | "confirmCryptoEvidenceWalrusDeletion" | "confirmCryptoEvidenceSuiAnchor">;

export class WalletConfirmationRecoveryError extends Error {}

export async function walletConfirmationScope(baseUrl: string, token: string | undefined, owner: string | null, workspaceId: string) {
  // Store only an opaque partition key, never the bearer token or account identity.
  const bytes = new TextEncoder().encode(JSON.stringify([baseUrl.replace(/\/+$/, ""), token ?? "", owner, workspaceId]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createWalletConfirmationRecovery(input: {
  scope: string;
  workspaceId: string;
  storage: Storage;
  client: ConfirmationClient;
  isCurrent: () => boolean;
  lock: (key: string, operation: () => Promise<void>) => Promise<void>;
  changed: () => void;
  now?: () => number;
}) {
  const prefix = `${WALLET_CONFIRMATION_PREFIX}${input.scope}:`;
  const now = input.now ?? Date.now;
  const assertCurrent = () => {
    if (!input.isCurrent()) throw new WalletConfirmationRecoveryError("Your account or connection changed. Reopen this workspace before continuing.");
  };
  const resourceKey = (action: WalletConfirmationAction, resourceId: string) =>
    `${prefix}${action === "file-renewal" ? "file" : "evidence"}:${encodeURIComponent(resourceId)}`;
  const read = (key: string) => {
    try {
      const raw = input.storage.getItem(key);
      if (!raw) return null;
      const value = parsePending(JSON.parse(raw));
      if (resourceKey(value.action, value.resourceId) !== key) throw new Error("scope_mismatch");
      return value;
    } catch {
      throw new WalletConfirmationRecoveryError("Saved wallet recovery details could not be read. Check your wallet before starting another transaction.");
    }
  };
  function list() {
    assertCurrent();
    const pending: PendingWalletConfirmation[] = [];
    for (let i = 0; i < input.storage.length; i++) {
      const key = input.storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const value = read(key);
      if (value) pending.push(value);
    }
    return pending;
  }
  function save(pending: PendingWalletConfirmation) {
    assertCurrent();
    const value = parsePending(pending);
    try {
      input.storage.setItem(resourceKey(value.action, value.resourceId), JSON.stringify(value));
      if (JSON.stringify(read(resourceKey(value.action, value.resourceId))) !== JSON.stringify(value)) throw new Error("write_failed");
    } catch {
      throw new WalletConfirmationRecoveryError("Wallet recovery details could not be saved. No wallet request was opened. Enable browser storage and try again.");
    }
    input.changed();
  }
  async function isRecorded(pending: PendingWalletConfirmation) {
    assertCurrent();
    if (pending.action === "file-renewal") {
      const result = await input.client.listAgentFiles(input.workspaceId);
      assertCurrent();
      return result.items.some((item) => item.id === pending.resourceId && item.revision > pending.revision
        && item.publication?.network === pending.network
        && item.publication.renewalTransactionDigest === pending.transactionDigest);
    }
    const result = await input.client.listCryptoEvidence(input.workspaceId, 1, pending.resourceId);
    assertCurrent();
    return result.items.some((item) => {
      if (item.evidenceId !== pending.resourceId || item.revision <= pending.revision) return false;
      if (pending.action === "evidence-anchor") return item.anchor?.network === pending.network
        && item.anchor.transactionDigest === pending.transactionDigest;
      if (item.publication?.network !== pending.network) return false;
      if (pending.action === "evidence-deletion") return item.state === "key_destroyed"
        && item.retention.keyAvailable === false && item.publication.deletionTransactionDigest === pending.transactionDigest;
      return item.publication.renewalTransactionDigest === pending.transactionDigest;
    });
  }
  function clear(pending: PendingWalletConfirmation) {
    assertCurrent();
    const key = resourceKey(pending.action, pending.resourceId);
    const current = read(key);
    if (current?.intentHash !== pending.intentHash || current.transactionDigest !== pending.transactionDigest) {
      throw new WalletConfirmationRecoveryError("Wallet recovery details changed. Refresh this page before continuing.");
    }
    input.storage.removeItem(key);
    input.changed();
  }
  async function reconcile(pending: PendingWalletConfirmation) {
    if (await isRecorded(pending)) { clear(pending); return; }
    if (Date.parse(pending.expiresAt) <= now()) {
      throw new WalletConfirmationRecoveryError("The confirmation window expired and no matching result is recorded. Check this transaction in your wallet and contact support. Do not submit it again.");
    }
    assertCurrent();
    const confirmation = { intentId: pending.intentId, intentHash: pending.intentHash, transactionDigest: pending.transactionDigest };
    try {
      if (pending.action === "file-renewal") await input.client.confirmAgentFileRenewal(input.workspaceId, pending.resourceId, confirmation);
      else if (pending.action === "evidence-renewal") await input.client.confirmCryptoEvidenceRenewal(input.workspaceId, pending.resourceId, confirmation);
      else if (pending.action === "evidence-deletion") await input.client.confirmCryptoEvidenceWalrusDeletion(input.workspaceId, pending.resourceId, confirmation);
      else await input.client.confirmCryptoEvidenceSuiAnchor(input.workspaceId, pending.resourceId, confirmation);
    } catch {
      assertCurrent();
      // A lost response or another tab's successful confirmation is not a failed transaction.
      if (await isRecorded(pending)) { clear(pending); return; }
      throw new WalletConfirmationRecoveryError("Matterhorn could not confirm the wallet result. Check its status in your wallet, then check confirmation again. No new wallet request will be opened.");
    }
    assertCurrent();
    if (!(await isRecorded(pending))) {
      throw new WalletConfirmationRecoveryError("The matching transaction is not recorded yet. Check confirmation again; do not submit another transaction.");
    }
    clear(pending);
  }
  return {
    list,
    async retry(pending: PendingWalletConfirmation) {
      await input.lock(resourceKey(pending.action, pending.resourceId), async () => {
        assertCurrent();
        const current = read(resourceKey(pending.action, pending.resourceId));
        if (current) {
          if (current.intentId !== pending.intentId || current.intentHash !== pending.intentHash
            || current.transactionDigest !== pending.transactionDigest || current.action !== pending.action) {
            throw new WalletConfirmationRecoveryError("Wallet recovery details changed. Refresh this page before continuing.");
          }
          await reconcile(current); return;
        }
        // Another tab may have completed and removed the entry. Missing browser
        // metadata alone is never proof of a committed wallet transaction.
        if (await isRecorded(parsePending(pending))) return;
        throw new WalletConfirmationRecoveryError("Saved wallet recovery details are no longer available and no matching result is recorded. Check your wallet and contact support before continuing.");
      });
    },
    async execute(action: WalletConfirmationAction, resourceId: string, prepare: () => Promise<{
      pending: PendingWalletConfirmation;
      submit: () => Promise<void>;
    }>) {
      await input.lock(resourceKey(action, resourceId), async () => {
        assertCurrent();
        const previous = read(resourceKey(action, resourceId));
        if (previous) { await reconcile(previous); return; }
        if (list().length >= 100) throw new WalletConfirmationRecoveryError("Resolve pending wallet confirmations before starting another transaction.");
        const prepared = await prepare();
        assertCurrent();
        if (prepared.pending.action !== action || prepared.pending.resourceId !== resourceId
          || Date.parse(prepared.pending.expiresAt) <= now()) {
          throw new WalletConfirmationRecoveryError("The wallet preview changed or expired. No wallet request was opened.");
        }
        // Persist before handing control to the wallet: a thrown wallet error may follow submission.
        save(prepared.pending);
        try { await prepared.submit(); } catch {
          assertCurrent();
          throw new WalletConfirmationRecoveryError("The wallet result is uncertain. Check its transaction status, then check confirmation below. Do not submit it again.");
        }
        assertCurrent();
        await reconcile(prepared.pending);
      });
    },
  };
}
