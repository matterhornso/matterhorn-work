import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("MCP docs GitHub link contract", () => {
  test("MCP cards use GitHub as the docs destination", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain("https://github.com/matterhornso/matterhorn-work/blob/dev/docs/mcp");
    expect(source).toContain("githubUrl: `${MATTERHORN_MCP_DOCS_GITHUB_BASE}/${slug}.md`");
  });

  test("Full docs and every visible tool chip open GitHub docs", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain("const docsHref = props.card.docs.githubUrl");
    expect(source).toContain("const toolsHref = `${docsHref}#tools`");
    expect(source).toContain("href={docsHref}");
    expect(source).toContain("href={toolsHref}");
    expect(source).toContain("aria-label={`Open GitHub docs for ${tool}`}");
  });

  test("inline MCP docs body stays out of the app UI", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).not.toContain("props.card.docs.sections.map");
    expect(source).not.toContain("props.card.docs.examples.map");
  });

  test("GitHub MCP docs include a Tools section for linked tool chips", () => {
    const docs = [
      "bittensor",
      "core-agent",
      "evidence",
      "hyperliquid",
      "memory",
      "polymarket",
      "workflow",
    ];

    for (const doc of docs) {
      const markdown = readRepoFile(`docs/mcp/${doc}.md`);
      expect(markdown).toContain("## Tools");
    }
  });
});
