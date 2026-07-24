import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const appStyles = readFileSync(
  new URL("../src/app/index.css", import.meta.url),
  "utf8",
);

describe("Dark theme text contrast", () => {
  test("secondary and tertiary text remain readable without flattening the hierarchy", () => {
    expect(appStyles).toContain("--dls-text-primary: #fafcff;");
    expect(appStyles).toContain("--dls-text-secondary: #dbe4ee;");
    expect(appStyles).toContain("--muted-foreground: #d2dbe5;");
    expect(appStyles).toContain("--gray-9: #858b94;");
    expect(appStyles).toContain("--gray-10: #9ca3ad;");
    expect(appStyles).toContain("--gray-11: #c5cbd3;");
    expect(appStyles).toContain("--slate-9: #838b96;");
    expect(appStyles).toContain("--slate-10: #9aa2ad;");
    expect(appStyles).toContain("--slate-11: #c4cbd4;");
  });
});
