import type { MatterhornStore } from "./store";

export const selectActiveWorkspace = (state: MatterhornStore) =>
  state.workspaces.find(
    (workspace) => workspace.id === state.activeWorkspaceId,
  ) ?? null;

export const selectServerStatus = (state: MatterhornStore) => state.server.status;

export const selectServerUrl = (state: MatterhornStore) => state.server.url;

export const selectErrorBanner = (state: MatterhornStore) => state.errorBanner;
