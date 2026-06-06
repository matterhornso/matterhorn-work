/**
 * Global job cron hook — runs in session-page.tsx (always mounted).
 * Ensures jobs execute even when AgentWorkspace is not visible.
 */
import { useEffect, useRef } from "react";
import { useWalletStore, type WalletStore } from "../state/wallet-store";
import { useJobQueue } from "./useJobQueue";
import { executeJob, type JobExecutionContext } from "../lib/execute-job";

export function useJobCron(store: WalletStore) {
  const state = useWalletStore(store);
  const { jobs, logRun, pause, pendingJobs } = useJobQueue();
  const hasRunRef = useRef<Set<string>>(new Set());

  // Execute pending jobs whenever state changes (wallet connected, new jobs, balances update)
  useEffect(() => {
    if (!state.address || !state.chainId) return;
    for (const job of pendingJobs) {
      // Prevent duplicate execution within same 60s window
      const key = `${job.id}_${Math.floor(Date.now() / 60000)}`;
      if (hasRunRef.current.has(key)) continue;
      hasRunRef.current.add(key);

      const ctx: JobExecutionContext = {
        address: state.address,
        chainId: state.chainId,
        store,
        ethBalance: state.ethBalance,
        usdcBalance: state.usdcBalance,
        logRun,
        pause,
        notificationsEnabled: "Notification" in window && Notification.permission === "granted",
      };
      executeJob(ctx, job);
    }
  }, [state.address, state.chainId, pendingJobs.length, state.ethBalance, state.usdcBalance, store, logRun, pause]);

  // Also listen for global cron tick from useJobQueue (every 30s)
  useEffect(() => {
    function handleCron(e: Event) {
      const detail = (e as CustomEvent).detail as { jobs: typeof jobs } | undefined;
      if (!detail?.jobs || !state.address || !state.chainId) return;
      for (const job of detail.jobs) {
        const key = `${job.id}_${Math.floor(Date.now() / 60000)}`;
        if (hasRunRef.current.has(key)) continue;
        hasRunRef.current.add(key);

        const ctx: JobExecutionContext = {
          address: state.address,
          chainId: state.chainId,
          store,
          ethBalance: state.ethBalance,
          usdcBalance: state.usdcBalance,
          logRun,
          pause,
          notificationsEnabled: "Notification" in window && Notification.permission === "granted",
        };
        executeJob(ctx, job);
      }
    }
    window.addEventListener("matterhorn:jobs-due", handleCron);
    return () => window.removeEventListener("matterhorn:jobs-due", handleCron);
  }, [state.address, state.chainId, store, logRun, pause, state.ethBalance, state.usdcBalance]);
}
