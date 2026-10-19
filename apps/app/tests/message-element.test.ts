import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { findMessageElement } from "../src/react-app/domains/session/surface/message-element";

function element(messageId: string | null) {
  return { getAttribute: (name: string) => name === "data-message-id" ? messageId : null };
}

describe("message scroll targets", () => {
  test.each([
    "msg_normal", 'quote"id', "back\\slash", 'trailing\\', 'a\\"], [data-other="target',
    "line\nbreak", "carriage\rreturn", "nul\u0000id", "unicode-回答", "brackets[]", "#target:has(*)",
  ])("matches the exact ID as data: %j", (id) => {
    const target = element(id);
    const decoy = element("target");
    expect(findMessageElement([decoy, target, element(`${id}-suffix`)], id)).toBe(target);
    expect(findMessageElement([decoy], id)).toBeNull();
  });

  test("retains first exact match and does not match missing attributes", () => {
    const first = element("same");
    expect(findMessageElement([element(null), first, element("same")], "same")).toBe(first);
    expect(findMessageElement([element(null)], "null")).toBeNull();
    expect(findMessageElement([], "missing")).toBeNull();
  });

  test("the nonvirtualized scroll path uses a static selector and the exact matcher", () => {
    const source = readFileSync(new URL("../src/react-app/domains/session/surface/message-list.tsx", import.meta.url), "utf8");
    expect(source).toContain('findMessageElement(container.querySelectorAll<HTMLElement>("[data-message-id]"), messageId)');
    expect(source).not.toContain('const escapedId =');
    expect(source).toContain('virtualizer.scrollToIndex(index, { align: "center" })');
    expect(source).toContain('target.scrollIntoView({ behavior, block: "center" })');
  });
});
