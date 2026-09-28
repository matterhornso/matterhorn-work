import { beforeEach, expect, test } from "bun:test";
import type { ComposerDraft } from "../src/app/types";
import { useComposerStateStore as store } from "../src/react-app/domains/session/surface/composer-state-store";
import { sessionDraftForStorage } from "../src/react-app/domains/session/sync/draft-store";

beforeEach(() => store.setState({ sessions: {} }));

test("restores exact Unicode, indentation and trailing newlines only once", () => {
  const text = "  Draft 🏔️\n    indented\n\n";
  expect(store.getState().hydrateDraft("one", text)).toBe(true);
  expect(store.getState().sessions.one.draft).toBe(text);
  expect(store.getState().hydrateDraft("one", "older text")).toBe(false);
  expect(store.getState().sessions.one.draft).toBe(text);
});

test("clearing a draft cannot resurrect the previous persistence snapshot", () => {
  store.getState().setDraft("one", "old draft");
  store.getState().setDraft("one", "");
  expect(store.getState().hydrateDraft("one", "old draft")).toBe(false);
  expect(store.getState().sessions.one.draft).toBe("");
});

test("whitespace edits and attachment-only state are not overwritten", () => {
  store.getState().setDraft("one", "  ");
  store.getState().setAttachments("two", [{
    id: "file", name: "test.txt", mimeType: "text/plain", size: 4,
    kind: "file", file: new File(["test"], "test.txt"),
  }]);
  expect(store.getState().hydrateDraft("one", "old")).toBe(false);
  expect(store.getState().hydrateDraft("two", "old")).toBe(false);
  expect(store.getState().sessions.one.draft).toBe("  ");
  expect(store.getState().sessions.two.attachments).toHaveLength(1);
});

test("restores each session independently and can restore after an actual remount", () => {
  store.getState().hydrateDraft("one", "Bittensor");
  store.getState().hydrateDraft("two", "Sui");
  expect(store.getState().sessions.one.draft).toBe("Bittensor");
  expect(store.getState().sessions.two.draft).toBe("Sui");
  store.setState({ sessions: {} });
  expect(store.getState().hydrateDraft("one", "Bittensor")).toBe(true);
  expect(store.getState().hydrateDraft("empty", "")).toBe(false);
});

test("stores pasted content rather than an unrecoverable marker", () => {
  const draft: ComposerDraft = {
    mode: "prompt", attachments: [], text: "  Before [pasted text block] after\n",
    parts: [{ type: "paste", id: "p1", label: "block", text: "Line 1\n  Line 2\n", lines: 3 }],
    resolvedText: "PRIVATE_MODEL_CONTEXT_DO_NOT_PERSIST",
    privacy: { consentToken: "PRIVATE_CONSENT_DO_NOT_PERSIST", memoryIds: ["memory-only"] },
  };
  const result = sessionDraftForStorage(draft);
  expect(result).toEqual({ text: "  Before Line 1\n  Line 2\n after\n", mode: "prompt" });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  expect(JSON.stringify(result)).not.toContain("memory-only");
});

test("only expands known paste markers once, without recursive or replacement-string interpolation", () => {
  const draft: ComposerDraft = {
    mode: "prompt", attachments: [], text: "[pasted text one] [pasted text one] [pasted text unknown] @agent",
    parts: [
      { type: "paste", id: "p1", label: "one", text: "$& [pasted text two]", lines: 1 },
      { type: "paste", id: "p2", label: "two", text: "do not expand recursively", lines: 1 },
    ],
  };
  expect(sessionDraftForStorage(draft).text).toBe("$& [pasted text two] $& [pasted text two] [pasted text unknown] @agent");
});
