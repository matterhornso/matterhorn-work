/** @jsxImportSource react */

import { useSyncExternalStore } from "react";

import { ACTIVE_WORKSPACE_CHANGED_EVENT, readActiveWorkspaceId } from "../../shell/session-memory";
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
  const workspaceId = useSyncExternalStore(
    subscribeToStorage,
    readWorkspaceSnapshot,
    readWorkspaceSnapshot,
  );
  return <QuickJotSheet workspaceId={workspaceId} />;
}
