import { describe, expect, test } from "bun:test";

import { parseFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  test("parses valid frontmatter data and body", () => {
    expect(parseFrontmatter("---\ndescription: A useful skill\nenabled: true\n---\nbody text")).toEqual({
      data: { description: "A useful skill", enabled: true },
      body: "body text",
    });
  });

  test("throws on malformed YAML so callers can surface it", () => {
    expect(() => parseFrontmatter("---\ndescription: foo: bar\n---\nbody text")).toThrow();
  });

  test("returns empty data for non-object YAML frontmatter", () => {
    expect(parseFrontmatter("---\njust a string\n---\nbody")).toEqual({
      data: {},
      body: "body",
    });
  });

  test("returns content without frontmatter as the body", () => {
    expect(parseFrontmatter("plain body text")).toEqual({
      data: {},
      body: "plain body text",
    });
  });
});
