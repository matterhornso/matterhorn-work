import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/theme-bootstrap.js", import.meta.url), "utf8");
const canonicalKey = "matterhorn-work.react.settings.theme-mode";

function firstPaint(values: Record<string, string>, systemDark = false, storageBlocked = false) {
  const root = { dataset: { theme: "" }, style: { colorScheme: "" } };
  runInNewContext(source, {
    localStorage: { getItem(key: string) {
      if (storageBlocked) throw new Error("Storage unavailable");
      return values[key] ?? null;
    } },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: { documentElement: root },
  });
  expect(root.style.colorScheme).toBe(root.dataset.theme);
  return root.dataset.theme;
}

describe("theme first paint", () => {
  test("honors the current preference before either legacy key or the OS", () => {
    expect(firstPaint({ [canonicalKey]: "light", "openwork.themePref": "dark" }, true)).toBe("light");
    expect(firstPaint({ [canonicalKey]: "dark", "openwork.react.settings.theme-mode": "light" })).toBe("dark");
  });
  test("follows the OS only when System is selected or no preference exists", () => {
    for (const systemDark of [false, true]) {
      const expected = systemDark ? "dark" : "light";
      expect(firstPaint({}, systemDark)).toBe(expected);
      expect(firstPaint({ [canonicalKey]: "system", "openwork.themePref": "light" }, systemDark)).toBe(expected);
    }
  });
  test("reads legacy preferences in the same order as the hydrated app", () => {
    expect(firstPaint({ "openwork.react.settings.theme-mode": "dark", "openwork.themePref": "light" })).toBe("dark");
    expect(firstPaint({ "openwork.themePref": "dark" })).toBe("dark");
    expect(firstPaint({ [canonicalKey]: "invalid", "openwork.themePref": "dark" })).toBe("dark");
    expect(firstPaint({ [canonicalKey]: "invalid" }, true)).toBe("dark");
  });
  test("blocked storage does not prevent rendering", () => {
    expect(firstPaint({}, false, true)).toBe("light");
    expect(firstPaint({}, true, true)).toBe("dark");
  });
  test("runs before the body paints rather than deferring until parsing completes", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain('<script src="/theme-bootstrap.js"></script>');
    expect(html.indexOf('/theme-bootstrap.js')).toBeLessThan(html.indexOf('<body'));
  });
});
