/** @jsxImportSource react */

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import type { MatterhornNote } from "./notes-types";

export type SendNoteToMemoryResult =
  | { ok: true; message: string; note: MatterhornNote }
  | { ok: false; message: string };

export type MemorySuggestionsChangedEventDetail = {
  workspaceId?: string;
  source: "user_note";
};

export function dispatchMemorySuggestionsChanged(
  workspaceId?: string,
  target?: Pick<Window, "dispatchEvent">,
): void {
  const eventTarget = target ?? (typeof window === "undefined" ? null : window);
  if (!eventTarget) return;
  eventTarget.dispatchEvent(new CustomEvent<MemorySuggestionsChangedEventDetail>(
    "matterhorn:memory-suggestions-changed",
    { detail: { workspaceId, source: "user_note" } },
  ));
}

export async function sendNoteToMemory(
  client: MatterhornServerClient | null | undefined,
  note: MatterhornNote,
): Promise<SendNoteToMemoryResult> {
  if (!client) {
    return { ok: false, message: "Matterhorn server is not connected." };
  }

  try {
    const response = await client.suggestMemoryFromNote(note.workspaceId, note.id);
    if (response.success && response.suggestionId) {
      dispatchMemorySuggestionsChanged(note.workspaceId);
      return {
        ok: true,
        message: "Sent to Memory inbox for review. It is not remembered yet.",
        note: response.note,
      };
    }
    return {
      ok: false,
      message: "Memory did not create a suggestion from this note.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not send to Memory: ${message}` };
  }
}
