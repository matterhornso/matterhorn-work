import type { MatterhornWorkspaceInfo } from "../../../app/lib/matterhorn-server";
import { normalizeDirectoryPath } from "../../../app/utils";

export async function openLocalWorkspaceFolder(
  folder: string,
  options: {
    workspaces: readonly MatterhornWorkspaceInfo[];
    selectWorkspace: (workspaceId: string) => boolean | Promise<boolean>;
    createWorkspace: (folder: string) => Promise<boolean>;
  },
) {
  const path = normalizeDirectoryPath(folder);
  if (!path) return false;
  const existing = options.workspaces.find(
    (workspace) => workspace.workspaceType !== "remote" &&
      normalizeDirectoryPath(workspace.path) === path,
  );
  // Reopening must not reapply a preset or overwrite the workspace's settings.
  return existing
    ? options.selectWorkspace(existing.id)
    : options.createWorkspace(folder);
}
