import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("responsive accessibility polish contracts", () => {
  test("keeps Settings chrome legible against its dark sidebar", () => {
    const source = readSource("react-app/domains/settings/shell/settings-page.tsx");
    expect(source).toContain("SETTINGS_SIDEBAR_HEADER_ITEM_CLASS");
    expect(source).toContain("text-[rgb(244_251_255/0.78)]");
    expect(source).toContain("className={SETTINGS_SIDEBAR_HEADER_ITEM_CLASS}");
  });

  test("treats provider glyphs as decorative when adjacent text supplies the name", () => {
    const source = readSource("react-app/design-system/provider-icon.tsx");
    expect(source.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).not.toContain('role="img"');
  });

  test("uses AA-readable light-theme labels in Settings and the composer", () => {
    expect(readSource("react-app/domains/settings/pages/general-view.tsx"))
      .toContain("text-amber-700 dark:text-amber-300");
    expect(readSource("react-app/domains/settings/pages/extensions-view.tsx"))
      .toContain("inline-flex items-center text-green-12");
    expect(readSource("react-app/domains/session/surface/composer/editor.tsx"))
      .toContain("text-[15px] leading-6 text-dls-secondary");
    expect(readSource("components/model-behavior-select.tsx"))
      .toContain("text-sm text-gray-11");
  });
});
