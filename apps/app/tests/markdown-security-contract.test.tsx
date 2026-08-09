import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownBlock } from "../src/react-app/domains/session/surface/markdown";

function readMarkdownSource() {
  return readFileSync(new URL("../src/react-app/domains/session/surface/markdown.tsx", import.meta.url), "utf8");
}

function readShikiHighlighterSource() {
  return readFileSync(
    new URL("../src/react-app/domains/session/surface/shiki-highlighter.ts", import.meta.url),
    "utf8",
  );
}

describe("Markdown security and dark-code rendering", () => {
  test("raw HTML from model output is not passed through by a Shiki marker substring", () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownBlock, {
        text: '<img src=x onerror="alert(1)" data-matterhorn-shiki="true">',
      }),
    );

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-matterhorn-shiki");
  });

  test("code blocks use the dark Matterhorn code surface", () => {
    const source = readMarkdownSource();
    const highlighterSource = readShikiHighlighterSource();

    expect(source).toContain('import("./shiki-highlighter")');
    expect(highlighterSource).toContain('shiki/themes/github-dark.mjs');
    expect(highlighterSource).toContain('theme: "github-dark"');
    expect(source).toContain("bg-dls-surface-muted/20");
    expect(highlighterSource).not.toContain('theme: "github-light"');
    expect(source).not.toContain('text.includes(\'data-matterhorn-shiki="true"\')');
    expect(source).not.toContain("rounded-[18px]");
  });
});
