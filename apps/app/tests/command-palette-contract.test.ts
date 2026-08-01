import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("global command palette ownership", () => {
  test("keeps one functional palette in the session shell", () => {
    const routeSource = readAppSource("shell/session-route.tsx");
    const pageSource = readAppSource("domains/session/chat/session-page.tsx");

    expect(routeSource).toContain('from "./command-palette"');
    expect(routeSource).toContain("const [commandPaletteOpen, setCommandPaletteOpen]");
    expect(routeSource).toContain("<CommandPalette");

    expect(pageSource).not.toContain("wallet/components/CommandPalette");
    expect(pageSource).not.toContain("const [commandOpen");
    expect(pageSource).not.toContain("Send tokens");
    expect(pageSource).not.toContain("Swap tokens (CoW)");
    expect(pageSource).not.toContain("Aave deposits");
    expect(pageSource).not.toContain("Bridge assets");
  });
});
