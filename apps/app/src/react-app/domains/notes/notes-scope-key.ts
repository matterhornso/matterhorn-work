import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";

const clientIds = new WeakMap<MatterhornServerClient, number>();
let nextClientId = 1;

// Workspace IDs are only meaningful within a connection. Use object identity,
// not credentials or URLs, to isolate editor state when a connection changes.
export function notesScopeKey(workspaceId: string, client: MatterhornServerClient | null): string {
  if (!client) return JSON.stringify([workspaceId, 0]);
  let clientId = clientIds.get(client);
  if (clientId === undefined) {
    clientId = nextClientId++;
    clientIds.set(client, clientId);
  }
  return JSON.stringify([workspaceId, clientId]);
}
