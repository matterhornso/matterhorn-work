// Retain only an opaque request ID and a content hash, never prompt contents.
// A missing acknowledgement must reuse the same server-side dispatch record.
const pending = new Map<string, string>();

export async function pendingMessageRequest(scope: string, input: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([scope, input])));
  const key = `matterhorn.pending-message.${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  let storage: Storage | null = null;
  try { storage = typeof window === "undefined" ? null : window.sessionStorage; } catch { /* disabled storage */ }
  let id = pending.get(key);
  try { id ??= storage?.getItem(key) ?? undefined; } catch { /* disabled storage */ }
  id ??= crypto.randomUUID();
  pending.set(key, id);
  try { storage?.setItem(key, id); } catch { /* retain in memory */ }
  return { id, accepted: () => {
    pending.delete(key);
    try { storage?.removeItem(key); } catch { /* disabled storage */ }
  } };
}
