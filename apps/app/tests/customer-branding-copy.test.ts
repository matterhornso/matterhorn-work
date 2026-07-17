import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const localeDirectory = new URL("../src/i18n/locales/", import.meta.url);

function legacyBrandingViolations(): string[] {
  return readdirSync(localeDirectory)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => {
      const source = readFileSync(join(localeDirectory.pathname, file), "utf8");
      return /openwork/i.test(source);
    });
}

describe("customer-facing Matterhorn Work branding", () => {
  test("does not ship legacy product copy in translated UI strings", () => {
    expect(legacyBrandingViolations()).toEqual([]);
  });
});
