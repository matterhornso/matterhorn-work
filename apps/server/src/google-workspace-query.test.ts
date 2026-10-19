import { describe, expect, test } from "bun:test";

import { googleDriveSearchQuery } from "./extensions/google-workspace.js";

describe("Google Drive name search query", () => {
  test("preserves ordinary names and the non-trashed filter", () => {
    expect(googleDriveSearchQuery("Quarterly report")).toBe("name contains 'Quarterly report' and trashed = false");
  });

  test("escapes backslashes before apostrophes, including adjacent escapes", () => {
    const cases = [
      ["quinn's paper\\essay", String.raw`quinn\'s paper\\essay`],
      ["a\\'b", String.raw`a\\\'b`],
      ["ends\\", String.raw`ends\\`],
      ["a\\\\'b", String.raw`a\\\\\'b`],
    ];
    for (const [input, escaped] of cases) {
      expect(googleDriveSearchQuery(input!)).toBe(`name contains '${escaped}' and trashed = false`);
    }
  });

  test("keeps query-looking text inside a single escaped string literal", () => {
    const input = "report\\' or trashed = true or name contains '";
    const query = googleDriveSearchQuery(input);
    const match = /^name contains '((?:\\[\\']|[^\\'])*)' and trashed = false$/.exec(query);
    expect(match).not.toBeNull();
    expect(match?.[1]?.replace(/\\([\\'])/g, "$1")).toBe(input);
  });
});
