/** @jsxImportSource react */
// Production shell and providers, with synthetic same-origin HTTP services.
import { createRoot } from "react-dom/client";
import AuthenticatedApp from "../../src/react-app/shell/authenticated-app";
import { writeDenSettings } from "../../src/app/lib/den";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import { bootstrapTheme } from "../../src/app/theme";
import { useSessionActivityStore } from "../../src/react-app/domains/session/status/session-activity-store";
import { publishInspectorSlice } from "../../src/react-app/shell/app-inspector";

// Observe intermediate production-store transitions that later polling may
// reconcile before a rendered assertion. This never changes application state.
const activityHistory: Array<{ workspaceId: string; sessionId: string; status: string }> = [];
useSessionActivityStore.subscribe((state, previous) => {
  for (const [workspaceId, sessions] of Object.entries(state.statusesByWorkspaceId)) {
    for (const [sessionId, status] of Object.entries(sessions)) {
      if (status !== previous.statusesByWorkspaceId[workspaceId]?.[sessionId]) activityHistory.push({ workspaceId, sessionId, status });
    }
  }
  publishInspectorSlice("qa-session-activity", () => activityHistory);
});

writeDenSettings(
  { baseUrl: location.origin, apiBaseUrl: location.origin },
  { persistBootstrap: false },
);
applyRetroUi(document.documentElement, true);
bootstrapTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<AuthenticatedApp />);
