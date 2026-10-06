import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createMatterhornServerClient } from "../src/app/lib/matterhorn-server";
import { createAccountClientState } from "../src/app/lib/account-client-state";
import {
  createWalletConfirmationRecovery, walletConfirmationScope, WALLET_CONFIRMATION_PREFIX,
  type PendingWalletConfirmation, type WalletConfirmationAction,
} from "../src/app/lib/wallet-confirmation-recovery";

function storage(): Storage {
  const rows = new Map<string, string>();
  return {
    get length() { return rows.size; }, key: (i) => [...rows.keys()][i] ?? null,
    getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); },
    removeItem: (key) => { rows.delete(key); }, clear: () => { throw new Error("broad_clear_forbidden"); },
  };
}
const mocks: Array<{ mockRestore: () => void }> = [];
afterEach(() => { while (mocks.length) mocks.pop()!.mockRestore(); });

function fixture(action: WalletConfirmationAction = "evidence-renewal") {
  const local = storage();
  const now = Date.parse("2026-10-04T12:00:00Z");
  const pending: PendingWalletConfirmation = {
    action, resourceId: "record-a", revision: 2, signer: `0x${"1".repeat(64)}`, network: "testnet",
    intentId: "intent-a", intentHash: "a".repeat(64), transactionDigest: "3".repeat(44),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  let current = true;
  let clock = now;
  let committed = false;
  let confirmationFailure = false;
  let loseAcknowledgment = false;
  let wrongDigest = false;
  let prepareCalls = 0;
  let submitCalls = 0;
  let confirmationCalls = 0;
  let onSubmit = async () => {};
  const locks = new Set<string>();
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://recovery.invalid") throw new Error("unexpected_network_request");
    if (init?.method !== "POST" && action !== "file-renewal") {
      expect(url.searchParams.get("evidenceId")).toBe(pending.resourceId);
      expect(url.searchParams.get("limit")).toBe("1");
    }
    if (init?.method === "POST") {
      confirmationCalls++;
      expect(JSON.parse(String(init.body))).toEqual({ intentId: pending.intentId, intentHash: pending.intentHash, transactionDigest: pending.transactionDigest });
      if (confirmationFailure) return Response.json({ code: "unavailable", message: "private upstream detail" }, { status: 503 });
      committed = true;
      if (loseAcknowledgment) throw new Error("lost_acknowledgment");
      return Response.json({ item: {} });
    }
    const digest = wrongDigest ? "4".repeat(44) : pending.transactionDigest;
    return Response.json({ items: [{
      id: pending.resourceId, evidenceId: pending.resourceId, revision: committed ? 3 : 2,
      state: action === "evidence-deletion" && committed ? "key_destroyed" : "published",
      retention: { keyAvailable: !(action === "evidence-deletion" && committed) },
      publication: { network: "testnet", renewalTransactionDigest: committed ? digest : null, deletionTransactionDigest: committed ? digest : null },
      anchor: committed ? { network: "testnet", transactionDigest: digest } : null,
    }] });
  });
  mocks.push(fetchMock);
  const client = createMatterhornServerClient({ baseUrl: "https://recovery.invalid" });
  const options = {
    scope: "scope-a", workspaceId: "workspace-a", storage: local, client,
    now: () => clock, isCurrent: () => current, changed: () => {},
    lock: async (key: string, operation: () => Promise<void>) => {
      if (locks.has(key)) throw new Error("already_running");
      locks.add(key);
      try { await operation(); } finally { locks.delete(key); }
    },
  };
  const recovery = createWalletConfirmationRecovery(options);
  const prepare = async () => {
    prepareCalls++;
    return { pending, submit: async () => { submitCalls++; await onSubmit(); } };
  };
  return {
    local, pending, options, recovery, prepare,
    counts: () => ({ prepareCalls, submitCalls, confirmationCalls }),
    setFailure: (value: boolean) => { confirmationFailure = value; },
    setLostAck: () => { loseAcknowledgment = true; },
    setWrongDigest: () => { wrongDigest = true; },
    setCommitted: () => { committed = true; },
    expire: () => { clock = now + 60_001; },
    switchAccount: () => { current = false; },
    onSubmit: (operation: () => Promise<void>) => { onSubmit = operation; },
  };
}

describe("wallet confirmation recovery", () => {
  for (const action of ["evidence-renewal", "file-renewal", "evidence-deletion", "evidence-anchor"] satisfies WalletConfirmationAction[]) {
    test(`${action}: reload and retry confirm the saved digest without another wallet request`, async () => {
      const f = fixture(action);
      f.setFailure(true);
      await expect(f.recovery.execute(action, f.pending.resourceId, f.prepare)).rejects.toThrow("No new wallet request");
      expect(f.recovery.list()).toEqual([f.pending]);
      const reloaded = createWalletConfirmationRecovery(f.options);
      f.setFailure(false);
      await reloaded.retry(reloaded.list()[0]!);
      expect(reloaded.list()).toEqual([]);
      expect(f.counts()).toEqual({ prepareCalls: 1, submitCalls: 1, confirmationCalls: 2 });
    });
    test(`${action}: a lost acknowledgment resolves only through the saved exact digest`, async () => {
      const f = fixture(action);
      f.setLostAck();
      await f.recovery.execute(action, f.pending.resourceId, f.prepare);
      expect(f.recovery.list()).toEqual([]);
      expect(f.counts()).toEqual({ prepareCalls: 1, submitCalls: 1, confirmationCalls: 1 });
    });
  }
  test("a changed digest does not claim completion or clear the pending request", async () => {
    const f = fixture();
    f.setLostAck(); f.setWrongDigest();
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("could not confirm");
    expect(f.recovery.list()).toEqual([f.pending]);
  });
  test("missing recovery metadata cannot report success without a matching recorded transaction", async () => {
    const f = fixture();
    f.setFailure(true);
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow();
    f.local.removeItem(`${WALLET_CONFIRMATION_PREFIX}scope-a:evidence:record-a`);
    await expect(f.recovery.retry(f.pending)).rejects.toThrow("details are no longer available");
    expect(f.counts()).toEqual({ prepareCalls: 1, submitCalls: 1, confirmationCalls: 1 });
    // A different tab can legitimately finish and clear the same pending request.
    f.setCommitted();
    await f.recovery.retry(f.pending);
    expect(f.counts().confirmationCalls).toBe(1);
  });
  test("a stale retry cannot confirm a replacement intent from another tab", async () => {
    const f = fixture();
    const replacement = { ...f.pending, intentId: "intent-b", intentHash: "b".repeat(64) };
    f.local.setItem(`${WALLET_CONFIRMATION_PREFIX}scope-a:evidence:record-a`, JSON.stringify(replacement));
    await expect(f.recovery.retry(f.pending)).rejects.toThrow("details changed");
    expect(f.recovery.list()).toEqual([replacement]);
    expect(f.counts()).toEqual({ prepareCalls: 0, submitCalls: 0, confirmationCalls: 0 });
  });
  test("expired unconfirmed requests remain blocked; committed expired requests can reconcile", async () => {
    const f = fixture();
    f.setFailure(true);
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow();
    f.expire(); f.setFailure(false);
    await expect(f.recovery.retry(f.pending)).rejects.toThrow("window expired");
    expect(f.counts().confirmationCalls).toBe(1);
    expect(f.recovery.list()).toEqual([f.pending]);
    f.setCommitted();
    await f.recovery.retry(f.pending);
    expect(f.recovery.list()).toEqual([]);
    expect(f.counts().confirmationCalls).toBe(1);
  });
  test("an uncertain wallet exception remains recoverable and never starts another submission", async () => {
    const f = fixture();
    f.onSubmit(async () => { throw new Error("unknown wallet result"); });
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("wallet result is uncertain");
    f.setCommitted();
    await f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare);
    expect(f.counts()).toEqual({ prepareCalls: 1, submitCalls: 1, confirmationCalls: 0 });
  });
  test("account change during wallet submission stops confirmation and cannot recreate cleared metadata", async () => {
    const f = fixture();
    const boundary = createAccountClientState(() => f.local, () => null);
    boundary.bind("https://recovery.invalid", "owner-a");
    f.onSubmit(async () => { f.switchAccount(); boundary.clear(); });
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("account or connection changed");
    expect(f.counts().confirmationCalls).toBe(0);
    for (let i = 0; i < f.local.length; i++) expect(f.local.key(i)).not.toStartWith(WALLET_CONFIRMATION_PREFIX);
  });
  test("storage write failure prevents opening the wallet", async () => {
    const f = fixture();
    f.local.setItem = () => { throw new Error("quota"); };
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("No wallet request was opened");
    expect(f.counts().submitCalls).toBe(0);
  });
  test("malformed persisted data blocks new preparation rather than discarding recovery evidence", async () => {
    const f = fixture();
    f.local.setItem(`${WALLET_CONFIRMATION_PREFIX}scope-a:evidence:record-a`, "{invalid");
    await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("could not be read");
    expect(f.counts().prepareCalls).toBe(0);
  });
  test("a second click cannot enter preparation while the first wallet request is open", async () => {
    const f = fixture();
    let release = () => {};
    let started = () => {};
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    f.onSubmit(async () => { started(); await waiting; });
    const first = f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare);
    await entered;
    try {
      await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("already_running");
    } finally { release(); }
    await first;
    expect(f.counts().submitCalls).toBe(1);
  });
  test("stored credentials or a transplanted resource cannot be accepted as recovery metadata", async () => {
    const f = fixture();
    const key = `${WALLET_CONFIRMATION_PREFIX}scope-a:evidence:record-a`;
    for (const invalid of [
      { ...f.pending, token: "synthetic-secret" },
      { ...f.pending, resourceId: "another-resource" },
      { ...f.pending, network: "mainnet" },
      { ...f.pending, expiresAt: "invalid" },
    ]) {
      f.local.setItem(key, JSON.stringify(invalid));
      await expect(f.recovery.execute(f.pending.action, f.pending.resourceId, f.prepare)).rejects.toThrow("could not be read");
    }
    expect(f.counts()).toEqual({ prepareCalls: 0, submitCalls: 0, confirmationCalls: 0 });
  });
  test("persistent partitions differ by backend, credential, account and workspace without storing them", async () => {
    const baseline = await walletConfirmationScope("https://one.invalid/", "synthetic-key-a", "owner-a", "ws-a");
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    expect(await walletConfirmationScope("https://one.invalid", "synthetic-key-a", "owner-a", "ws-a")).toBe(baseline);
    for (const values of [
      ["https://two.invalid", "synthetic-key-a", "owner-a", "ws-a"],
      ["https://one.invalid", "synthetic-key-b", "owner-a", "ws-a"],
      ["https://one.invalid", "synthetic-key-a", "owner-b", "ws-a"],
      ["https://one.invalid", "synthetic-key-a", "owner-a", "ws-b"],
    ]) expect(await walletConfirmationScope(values[0]!, values[1]!, values[2]!, values[3]!)).not.toBe(baseline);
  });
});
