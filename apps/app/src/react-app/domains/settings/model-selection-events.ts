export const WORKSPACE_MODEL_SELECTION_CHANGED_EVENT = "matterhorn:workspace-model-selection-changed";

export type WorkspaceModelSelectionChangedDetail = {
  workspaceId: string;
};

export function notifyWorkspaceModelSelectionChanged(workspaceId: string) {
  if (typeof window === "undefined") return;
  const id = workspaceId.trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent<WorkspaceModelSelectionChangedDetail>(
    WORKSPACE_MODEL_SELECTION_CHANGED_EVENT,
    { detail: { workspaceId: id } },
  ));
}
