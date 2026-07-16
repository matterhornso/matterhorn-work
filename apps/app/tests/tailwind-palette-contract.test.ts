import { describe, expect, test } from "bun:test";

import tailwindConfig from "../tailwind.config";

describe("Matterhorn Tailwind palette", () => {
  test("keeps standard status colors alongside Radix scales", () => {
    const colors = tailwindConfig.theme.colors as Record<string, Record<string | number, string>>;

    expect(colors.red?.[500]).toBeTruthy();
    expect(colors.amber?.[300]).toBeTruthy();
    expect(colors.sky?.[500]).toBeTruthy();
    expect(colors.emerald?.[500]).toBeTruthy();
    expect(colors.red?.[11]).toBe("var(--red-11)");
    expect(colors.gray?.[12]).toBe("var(--gray-12)");
  });
});
