import { SIDE_PANEL_ITEMS, type SidePanelItem } from "./ui-state-store";

export type SessionPanelNavigation = {
  search: string;
  replace: boolean;
};

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
