import { expect } from "bun:test";
import type { Page } from "playwright";

// Readiness alone also resolves with fallback fonts. Require actual bundled faces.
export async function verifyBundledFonts(page: Page) {
  const faces = await page.evaluate(async () => {
    const results = await Promise.all(["Geist Variable", "IBM Plex Sans Variable"].map(async family => {
      const loaded = await document.fonts.load(`400 16px "${family}"`, "Matterhorn Desks");
      return { family, loaded: loaded.length > 0 && loaded.every(face => face.status === "loaded") };
    }));
    await document.fonts.ready;
    return results;
  });
  expect(faces).toEqual([{ family: "Geist Variable", loaded: true }, { family: "IBM Plex Sans Variable", loaded: true }]);
}
