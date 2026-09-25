import { beforeEach, describe, expect, test } from "bun:test";
import { useComposerStateStore as store } from "../src/react-app/domains/session/surface/composer-state-store";

beforeEach(() => store.setState({ sessions: {} }));

describe("composer settlement after asynchronous dispatch", () => {
  test("clears an unchanged accepted submission", () => {
    store.getState().setDraft("a", "Original prompt");
    const submitted = store.getState().sessions.a;
    expect(store.getState().clearSubmittedSession("a", submitted)).toBe(true);
    expect(store.getState().sessions.a).toBeUndefined();
  });

  test("preserves newer text when the older send succeeds", () => {
    store.getState().setDraft("a", "Original prompt");
    const submitted = store.getState().sessions.a;
    store.getState().setDraft("a", "New unsent prompt 🏔️");
    expect(store.getState().clearSubmittedSession("a", submitted)).toBe(false);
    expect(store.getState().sessions.a.draft).toBe("New unsent prompt 🏔️");
  });

  test("preserves edits even if the user changes text back to the original", () => {
    store.getState().setDraft("a", "Original prompt");
    const submitted = store.getState().sessions.a;
    store.getState().setDraft("a", "Different prompt");
    store.getState().setDraft("a", "Original prompt");
    expect(store.getState().clearSubmittedSession("a", submitted)).toBe(false);
    expect(store.getState().sessions.a.draft).toBe("Original prompt");
  });

  for (const edit of ["attachments", "mentions", "pasteParts"] as const) {
    test(`preserves changed ${edit} while an older send settles`, () => {
      store.getState().setDraft("a", "Original prompt");
      const submitted = store.getState().sessions.a;
      if (edit === "attachments") store.getState().setAttachments("a", [{
        id: "new-file", name: "new.txt", mimeType: "text/plain", size: 3,
        kind: "file", file: new File(["new"], "new.txt"),
      }]);
      if (edit === "mentions") store.getState().setMentions("a", { research: "agent" });
      if (edit === "pasteParts") store.getState().setPasteParts("a", [{ id: "paste1", label: "1", text: "Unsent content", lines: 1 }]);
      const current = store.getState().sessions.a;
      expect(store.getState().clearSubmittedSession("a", submitted)).toBe(false);
      expect(store.getState().sessions.a).toBe(current);
    });
  }

  test("settling a previous session leaves the current session untouched", () => {
    store.getState().setDraft("a", "Original prompt");
    const submitted = store.getState().sessions.a;
    store.getState().setDraft("b", "Another desk's unsent draft");
    expect(store.getState().clearSubmittedSession("a", submitted)).toBe(true);
    expect(store.getState().sessions.b.draft).toBe("Another desk's unsent draft");
  });

  test("missing or already consumed snapshots cannot remove a later draft", () => {
    expect(store.getState().clearSubmittedSession("a", undefined)).toBe(false);
    store.getState().setDraft("a", "Original prompt");
    const submitted = store.getState().sessions.a;
    store.getState().clearSubmittedSession("a", submitted);
    store.getState().setDraft("a", "New prompt");
    expect(store.getState().clearSubmittedSession("a", submitted)).toBe(false);
    expect(store.getState().sessions.a.draft).toBe("New prompt");
  });
});
