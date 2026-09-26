import type { DenClient } from "../../../../app/lib/den";

const connections = new WeakMap<DenClient, number>();
let nextConnection = 1;

export function accountSecurityQueryKey(userId: string, client: DenClient) {
  let connection = connections.get(client);
  if (connection === undefined) {
    connection = nextConnection++;
    connections.set(client, connection);
  }
  // No token, email or endpoint is exposed in the cache key.
  return ["account-security", userId, connection];
}
