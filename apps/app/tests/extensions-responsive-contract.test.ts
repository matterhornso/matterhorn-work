import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pluginsViewSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/domains/settings/pages/plugins-view.tsx"),
  "utf8",
);

describe("extensions responsive contracts", () => {
  test("lets long engine-plugin names shrink and wrap at the 320px launch floor", () => {
    expect(pluginsViewSource).toContain('className="w-full min-w-0 max-w-3xl space-y-6"');
    expect(pluginsViewSource).toContain("flex min-w-0 flex-wrap items-center justify-between gap-2");
    expect(pluginsViewSource).toContain('<span className="min-w-0 break-all">{plugin.name}</span>');
  });
});
