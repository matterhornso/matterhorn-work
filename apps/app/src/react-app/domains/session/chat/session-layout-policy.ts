import { useEffect, useState } from "react";

export const SESSION_DOCKED_PANE_BREAKPOINT = 1280;
export const SESSION_FULL_SCREEN_PANE_BREAKPOINT = 1024;

export type SessionSidePanelPresentation = "full-screen" | "sheet" | "docked";

export function resolveSessionSidePanelPresentation(viewportWidth: number): SessionSidePanelPresentation {
  if (viewportWidth < SESSION_FULL_SCREEN_PANE_BREAKPOINT) return "full-screen";
  if (viewportWidth < SESSION_DOCKED_PANE_BREAKPOINT) return "sheet";
  return "docked";
}

function currentPresentation(): SessionSidePanelPresentation {
  if (typeof window === "undefined") return "full-screen";
  return resolveSessionSidePanelPresentation(window.innerWidth);
}

export function useSessionSidePanelPresentation(): SessionSidePanelPresentation {
  const [presentation, setPresentation] = useState<SessionSidePanelPresentation>(currentPresentation);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${SESSION_DOCKED_PANE_BREAKPOINT}px)`);
    const onViewportChange = () => setPresentation(currentPresentation());
    query.addEventListener("change", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    onViewportChange();
    return () => {
      query.removeEventListener("change", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
    };
  }, []);

  return presentation;
}
