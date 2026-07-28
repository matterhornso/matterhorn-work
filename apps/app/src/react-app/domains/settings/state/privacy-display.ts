import type { MatterhornDataStoreDescriptor } from "@matterhorn-work/types/backend-capabilities";

export function settingsStorageLocationLabel(
  store: MatterhornDataStoreDescriptor,
): string {
  if (store.scope === "opencode_runtime") return "Local chat history";
  if (store.scope === "workspace") return "Project files";
  if (store.scope === "machine_global") return "Local app data";
  if (store.scope === "matterhorn_cloud") return "Matterhorn Cloud";
  return "Location unavailable";
}
