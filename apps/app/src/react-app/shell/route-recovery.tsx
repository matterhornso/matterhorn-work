/** @jsxImportSource react */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  type AppStatusToastInput,
  useStatusToasts,
} from "../domains/shell-feedback/status-toasts";

export function unavailablePageToast(pathname: string): AppStatusToastInput {
  const page = pathname.trim() || "/";
  return {
    title: "Page unavailable",
    description: `${page} is not available. Returned to your project.`,
    tone: "warning",
    durationMs: 4200,
  };
}

export function unavailableWorkspaceToast(
  workspaceId: string,
  fallbackLabel?: string | null,
): AppStatusToastInput {
  const target = workspaceId.trim() || "The requested workspace";
  const fallback = fallbackLabel?.trim();
  return {
    title: "Workspace unavailable",
    description: fallback
      ? `${target} could not be opened. Opened ${fallback} instead.`
      : `${target} could not be opened. Returned to an available workspace.`,
    tone: "warning",
    durationMs: 4200,
  };
}

export function UnknownRouteRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useStatusToasts();
  const announcedRouteRef = useRef("");

  useEffect(() => {
    const recoveryKey = location.pathname;
    if (announcedRouteRef.current === recoveryKey) return;
    announcedRouteRef.current = recoveryKey;
    showToast(unavailablePageToast(location.pathname));
    navigate("/session", { replace: true });
  }, [location.pathname, navigate, showToast]);

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Returning to your project...
    </div>
  );
}
