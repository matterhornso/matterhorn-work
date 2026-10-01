import { describe, expect, test } from "bun:test";
import { jevDraftText, jevPreferenceKey } from "../src/react-app/domains/session/surface/use-jev-chat";
import { sessionDraftForStorage } from "../src/react-app/domains/session/sync/draft-store";
import type { ComposerDraft } from "../src/app/types";
const draft: ComposerDraft = { mode: "prompt", text: "Compare validators", parts: [{ type: "text", text: "Compare validators" }], attachments: [] };
describe("Jev message preparation", () => {
  test("uses only actual composer text, never resolved workspace overlays", () => {
    expect(jevDraftText({ ...draft, resolvedText: "Private wallet overlay" })).toBe("Compare validators");
    expect(jevDraftText({ ...draft, parts: [{ type: "text", text: "Compare" }, { type: "paste", id: "p", text: "validators", label: "1", lines: 1 }] })).toBe("Compare\nvalidators");
  });
  test("private contexts, files, commands and long text are ineligible", () => {
    for (const privacy of [{ mode: "private_workspace" }, { mode: "transaction" }, { memoryIds: ["m"] }, { agentFileIds: ["f"] }, { coworkerId: "c" }, { attachmentIds: ["a"] }] satisfies NonNullable<ComposerDraft["privacy"]>[]) {
      expect(jevDraftText({ ...draft, privacy })).toBeNull();
    }
    expect(jevDraftText({ ...draft, command: { name: "compact", arguments: "" } })).toBeNull();
    expect(jevDraftText({ ...draft, parts: [{ type: "file", path: "/private", label: "private" }] })).toBeNull();
    expect(jevDraftText({ ...draft, parts: [{ type: "text", text: "x".repeat(4001) }] })).toBeNull();
  });
  test("receipts never enter persisted drafts and preference keys include scope and consent version", () => {
    expect(JSON.stringify(sessionDraftForStorage({ ...draft, jevReceipt: "ephemeral-receipt" }))).not.toContain("ephemeral-receipt");
    expect(jevPreferenceKey("alice")).not.toBe(jevPreferenceKey("bob"));
    expect(jevPreferenceKey("alice")).toContain("jev-current-message-v1");
  });
});
