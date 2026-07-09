/** @jsxImportSource react */

import { useEffect, useSyncExternalStore } from "react";

import { ACTIVE_WORKSPACE_CHANGED_EVENT, readActiveWorkspaceId } from "../../shell/session-memory";
import { useQuickJotContext } from "./quick-jot-provider";
import { QuickJotSheet } from "./quick-jot-sheet";

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(ACTIVE_WORKSPACE_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ACTIVE_WORKSPACE_CHANGED_EVENT, callback);
  };
}

function readWorkspaceSnapshot() {
  return readActiveWorkspaceId() ?? "";
}

export function QuickJotGlobal() {
  const { open, closeQuickJot } = useQuickJotContext();
  const workspaceId = useSyncExternalStore(
    subscribeToStorage,
    readWorkspaceSnapshot,
    readWorkspaceSnapshot,
  );

  useEffect(() => {
    if (!workspaceId.trim() && open) closeQuickJot();
  }, [closeQuickJot, open, workspaceId]);

  if (!workspaceId.trim()) return null;
  return <QuickJotSheet workspaceId={workspaceId} />;
}
