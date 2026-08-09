import { SIDE_PANEL_ITEMS, type SidePanelItem } from "./ui-state-store";

export const SESSION_WORKFLOW_DESKS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
] as const;
export type SessionWorkflowDesk = (typeof SESSION_WORKFLOW_DESKS)[number];

export type SessionPanelNavigation = {
  search: string;
  replace: boolean;
};

export type SessionDeskNavigation = SessionPanelNavigation;

export function readSessionPanelFromSearch(
  search: string,
  options?: { notesAvailable?: boolean },
): SidePanelItem | null {
  const requestedPanel = new URLSearchParams(search).get("panel");
  if (requestedPanel === "notes" && options?.notesAvailable === false) {
    return null;
  }
  return SIDE_PANEL_ITEMS.includes(requestedPanel as SidePanelItem)
    ? (requestedPanel as SidePanelItem)
    : null;
}

export function readSessionDeskFromSearch(search: string): SessionWorkflowDesk | null {
  const requestedDesk = new URLSearchParams(search).get("desk");
  return SESSION_WORKFLOW_DESKS.includes(requestedDesk as SessionWorkflowDesk)
    ? (requestedDesk as SessionWorkflowDesk)
    : null;
}

export function resolveSessionPanelNavigation(
  search: string,
  nextPanel: SidePanelItem | null,
): SessionPanelNavigation | null {
  const params = new URLSearchParams(search);
  const hasPanelParam = params.has("panel");
  const currentPanel = readSessionPanelFromSearch(search);

  if (currentPanel === nextPanel) {
    // A stale or unavailable panel parameter resolves to null, but still needs
    // to be removed when the user closes the visible panel surface.
    if (nextPanel !== null || !hasPanelParam) return null;
  }

  if (nextPanel) {
    params.set("panel", nextPanel);
    params.delete("desk");
  } else {
    params.delete("panel");
  }

  const serialized = params.toString();
  return {
    search: serialized ? `?${serialized}` : "",
    // The first open creates one history entry so Back closes the panel.
    // Switching or explicitly closing updates that entry without creating a
    // loop that reopens panels after the user closes them.
    replace: nextPanel === null || currentPanel !== null,
  };
}

export function resolveSessionDeskNavigation(
  search: string,
  nextDesk: SessionWorkflowDesk | null,
): SessionDeskNavigation | null {
  const params = new URLSearchParams(search);
  const hasDeskParam = params.has("desk");
  const currentDesk = readSessionDeskFromSearch(search);

  if (currentDesk === nextDesk) {
    // Unknown/stale desk parameters resolve to null but still need to be
    // removed when the visible surface recovers to Project Home.
    if (nextDesk !== null || !hasDeskParam) return null;
  }

  if (nextDesk) {
    params.set("desk", nextDesk);
    params.delete("panel");
  } else {
    params.delete("desk");
  }

  const serialized = params.toString();
  return {
    search: serialized ? `?${serialized}` : "",
    // Opening is a reversible destination. Switching or explicitly closing
    // updates the current destination without creating reopen loops.
    replace: nextDesk === null || currentDesk !== null,
  };
}
