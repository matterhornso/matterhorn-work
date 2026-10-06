import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { accountClientState, captureAccountGeneration } from "../../../app/lib/account-client-state";
import {
  createWalletConfirmationRecovery, walletConfirmationScope, WALLET_CONFIRMATION_PREFIX,
  WalletConfirmationRecoveryError, type PendingWalletConfirmation,
} from "../../../app/lib/wallet-confirmation-recovery";

type Recovery = ReturnType<typeof createWalletConfirmationRecovery>;
const UPDATED = "matterhorn-wallet-confirmation-updated";

async function lock(key: string, operation: () => Promise<void>) {
  if (!navigator.locks) throw new WalletConfirmationRecoveryError("This browser cannot safely coordinate wallet requests. Use a browser with Web Locks support before opening a wallet request.");
  await navigator.locks.request(key, { ifAvailable: true }, async (held) => {
    if (!held) throw new WalletConfirmationRecoveryError("This wallet action is already running in a Matterhorn tab. Wait for it to finish, then check confirmation.");
    await operation();
  });
}

export function useWalletConfirmationRecovery(client: MatterhornServerClient | null | undefined, workspaceId: string) {
  const id = useId();
  const live = useRef({ client, workspaceId });
  live.current = { client, workspaceId };
  const controller = useRef<Recovery | null>(null);
  const [boundary, setBoundary] = useState(0);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<PendingWalletConfirmation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => accountClientState.register(`wallet-confirmation:${id}`, () => {
    controller.current = null;
    setPending([]);
    setReady(false);
    setError(null);
    setBusy(false);
    setBoundary((value) => value + 1);
  }, "stop"), [id]);

  useEffect(() => {
    let mounted = true;
    const accountCurrent = captureAccountGeneration();
    const current = () => mounted && accountCurrent() && live.current.workspaceId === workspaceId
      && live.current.client?.baseUrl === client?.baseUrl && live.current.client?.token === client?.token;
    controller.current = null;
    setPending([]);
    setReady(false);
    setError(null);
    setBusy(false);
    const refresh = () => {
      if (!current() || !controller.current) return;
      try { setPending(controller.current.list()); }
      catch { setError("Saved wallet recovery details are unavailable. Check your wallet before starting another transaction."); setReady(false); }
    };
    if (client && workspaceId) {
      void walletConfirmationScope(client.baseUrl, client.token, accountClientState.owner(), workspaceId).then((scope) => {
        if (!current()) return;
        controller.current = createWalletConfirmationRecovery({
          scope, client, workspaceId, storage: window.localStorage, isCurrent: current, lock,
          changed: () => window.dispatchEvent(new Event(UPDATED)),
        });
        setReady(true);
        refresh();
      }).catch(() => {
        if (current()) setError("Wallet recovery storage is unavailable. No new wallet request can be opened.");
      });
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(WALLET_CONFIRMATION_PREFIX)) refresh();
    };
    window.addEventListener(UPDATED, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      window.removeEventListener(UPDATED, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [client?.baseUrl, client?.token, workspaceId, boundary]);

  const execute: Recovery["execute"] = useCallback(async (...args) => {
    if (!controller.current) throw new WalletConfirmationRecoveryError("Wallet recovery is still loading. Wait before opening a wallet request.");
    return controller.current.execute(...args);
  }, []);
  const retry = useCallback(async (item: PendingWalletConfirmation, onConfirmed: () => Promise<void>) => {
    const active = controller.current;
    if (!active) return;
    const accountCurrent = captureAccountGeneration();
    const connection = live.current;
    const current = () => controller.current === active && accountCurrent()
      && live.current.workspaceId === connection.workspaceId
      && live.current.client?.baseUrl === connection.client?.baseUrl
      && live.current.client?.token === connection.client?.token;
    setBusy(true);
    setError(null);
    try {
      await active.retry(item);
      if (current()) await onConfirmed();
    } catch (cause) {
      if (current()) setError(cause instanceof WalletConfirmationRecoveryError
        ? cause.message : "Confirmation could not be checked. Check your wallet and try again; do not submit another transaction.");
    } finally { if (current()) setBusy(false); }
  }, []);
  return { ready, pending, error, busy, execute, retry };
}
