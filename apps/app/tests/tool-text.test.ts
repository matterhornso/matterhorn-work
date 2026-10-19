import { describe, expect, test } from "bun:test";
import { normalizeToolText } from "../src/react-app/domains/session/surface/tool-text";

describe("tool text normalization", () => {
  test.each([
    ["", ""], ["text", "text"], ["text  ", "text  "], ["text\n", "text"],
    ["text  \r\n \n\t", "text  "], ["\n\n", ""], [" \n \n", " "],
    ["\r\r\n", "\r"], ["a\nb  ", "a\nb  "], ["a\nb\n", "a\nb"],
    ["line\nnot whitespace", "line\nnot whitespace"], ["line\u2028", "line\u2028"],
    ["line\n\u2028\u00a0", "line"], ["line\r", "line\r"],
  ])("preserves content and trims only final blank lines: %j", (input, expected) => {
    expect(normalizeToolText(input)).toBe(expected);
  });

  test("non-text tool values are not coerced into display text", () => {
    for (const input of [undefined, null, 123, false, {}, []]) expect(normalizeToolText(input)).toBe("");
  });

  test("large newline runs with a nonwhitespace suffix do not trigger backtracking", () => {
    const input = `header${"\n \r\n\t".repeat(100_000)}!`;
    expect(normalizeToolText(input)).toBe(input);
    expect(normalizeToolText(input.slice(0, -1))).toBe("header");
  });
});
