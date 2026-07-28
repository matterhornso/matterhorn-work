/** @jsxImportSource react */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation } from "react-router";

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
  const location = useLocation();
  const storedWorkspaceId = useSyncExternalStore(
    subscribeToStorage,
    readWorkspaceSnapshot,
    readWorkspaceSnapshot,
  );
  const routeWorkspaceId = useMemo(() => {
    const match = location.pathname.match(/^\/workspace\/([^/]+)(?:\/|$)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1] ?? "").trim();
    } catch {
      return "";
    }
  }, [location.pathname]);
  const workspaceId = routeWorkspaceId && routeWorkspaceId === storedWorkspaceId ? routeWorkspaceId : "";

  useEffect(() => {
    if (!workspaceId.trim() && open) closeQuickJot();
  }, [closeQuickJot, open, workspaceId]);

  if (!workspaceId.trim()) return null;
  return <QuickJotSheet workspaceId={workspaceId} />;
}
