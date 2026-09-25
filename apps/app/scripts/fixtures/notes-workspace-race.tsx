/** @jsxImportSource react */
// Real NotesPage with synthetic responses. No accounts or network requests.
import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { createMatterhornServerClient, type MatterhornNoteListResponse } from "../../src/app/lib/matterhorn-server";
import { NotesPage } from "../../src/react-app/domains/notes/notes-page";
import { StatusToastsProvider } from "../../src/react-app/domains/shell-feedback/status-toasts";
import type { MatterhornNoteUpdateRequest } from "@matterhorn-work/types";

function response(workspaceId: string): MatterhornNoteListResponse {
  return { success: true, count: 1, items: [{
    version: "matterhorn.note.v1", id: `note_${workspaceId}`, workspaceId,
    title: `Only workspace ${workspaceId}`, body: "Disposable fixture note",
    tags: [], links: [], source: "manual", filePath: `notes/${workspaceId}.md`,
    createdAt: "2026-09-25T00:00:00Z", updatedAt: "2026-09-25T00:00:00Z",
  }] };
}

function Fixture() {
  const [workspaceId, setWorkspaceId] = useState("A");
  const release = useRef<() => void>(() => {});
  const pendingSaves = useRef<Array<() => void>>([]);
  const stored = useRef(response("B").items[0]);
  const [pendingCount, setPendingCount] = useState(0);
  const [savedBody, setSavedBody] = useState(stored.current.body);
  const client = useMemo(() => Object.assign(createMatterhornServerClient({ baseUrl: "http://127.0.0.1:1" }), {
    listNotes: async (id: string): Promise<MatterhornNoteListResponse> => {
      if (id === "A") await new Promise<void>((resolve) => { release.current = resolve; });
      if (id === "C") throw new Error("Fixture workspace unavailable");
      return id === "B" ? { success: true, count: 1, items: [stored.current] } : response(id);
    },
    updateNote: async (_workspaceId: string, _noteId: string, patch: MatterhornNoteUpdateRequest) => {
      await new Promise<void>((resolve) => {
        pendingSaves.current.push(resolve);
        setPendingCount(pendingSaves.current.length);
      });
      stored.current = { ...stored.current, title: patch.title ?? stored.current.title,
        body: patch.body ?? stored.current.body, tags: patch.tags ?? stored.current.tags };
      setSavedBody(stored.current.body);
      return { success: true, note: stored.current };
    },
  }), []);
  return <MemoryRouter><StatusToastsProvider>
    <p>Current workspace: {workspaceId}</p>
    <button onClick={() => setWorkspaceId("B")}>Switch to B</button>
    <button onClick={() => setWorkspaceId("C")}>Switch to unavailable C</button>
    <button onClick={() => release.current()}>Complete old A request</button>
    <button onClick={() => {
      pendingSaves.current.shift()?.();
      setPendingCount(pendingSaves.current.length);
    }}>Complete next note save</button>
    <p>Pending API saves: {pendingCount}</p>
    <p>Persisted fixture body: {savedBody}</p>
    <NotesPage workspaceId={workspaceId} client={client} />
  </StatusToastsProvider></MemoryRouter>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
