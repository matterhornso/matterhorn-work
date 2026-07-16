import { describe, expect, test } from "bun:test";

import { resolveLanguageOptions } from "../src/i18n";

describe("stable launch language policy", () => {
  test("offers only reviewed English copy by default", () => {
    expect(resolveLanguageOptions(undefined).map((option) => option.value)).toEqual(["en"]);
    expect(resolveLanguageOptions({ VITE_MATTERHORN_EXPERIMENTAL_LOCALES_ENABLED: "0" })
      .map((option) => option.value)).toEqual(["en"]);
  });

  test("requires an explicit build flag for experimental locales", () => {
    const values = resolveLanguageOptions({
      VITE_MATTERHORN_EXPERIMENTAL_LOCALES_ENABLED: "1",
    }).map((option) => option.value);

    expect(values).toContain("en");
    expect(values).toContain("fr");
    expect(values).toContain("ja");
    expect(values.length).toBeGreaterThan(1);
  });
});
