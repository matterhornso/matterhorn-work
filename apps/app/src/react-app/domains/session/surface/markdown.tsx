/** @jsxImportSource react */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import { markedEmoji } from "marked-emoji";
import markedShiki from "marked-shiki";
import emojiKeywords from "emojilib";
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { createHighlighterCore } from "shiki/core";
import type { LanguageRegistration } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import wasm from "shiki/wasm";
import githubDark from "shiki/themes/github-dark.mjs";
import js from "shiki/langs/javascript.mjs";
import ts from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import jsx from "shiki/langs/jsx.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import solidity from "shiki/langs/solidity.mjs";
import markdown from "shiki/langs/markdown.mjs";
import html from "shiki/langs/html.mjs";
import css from "shiki/langs/css.mjs";
import shell from "shiki/langs/shellscript.mjs";
import json from "shiki/langs/json.mjs";
import yaml from "shiki/langs/yaml.mjs";
import sql from "shiki/langs/sql.mjs";
import go from "shiki/langs/go.mjs";

import { applyTextHighlights } from "./text-highlights";

type MarkedParser = {
  parseInline(tokens: unknown[]): string;
  parse(tokens: unknown[]): string;
};

type MarkedRendererThis = {
  parser: MarkedParser;
  listitem(item: Tokens.ListItem): string;
  tablecell(cell: Tokens.TableCell & { header?: boolean }): string;
  tablerow(row: { text: string }): string;
};

type MarkedCompatibleParser = {
  use(...extensions: unknown[]): MarkedCompatibleParser;
  parse(markdown: string, options?: { async?: false }): string;
  parse(markdown: string, options: { async: true }): Promise<string>;
};

type MarkedCompatibleOptions = {
  async: boolean;
  breaks: boolean;
  gfm: boolean;
  pedantic: boolean;
  silent: boolean;
  renderer: Record<string, unknown> & ThisType<MarkedRendererThis>;
};

const MarkedCompatible = Marked as unknown as {
  new(options?: MarkedCompatibleOptions): MarkedCompatibleParser;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return "#";
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return trimmed;
  } catch {
    return "#";
  }
  return "#";
}

function alignAttribute(align: Tokens.TableCell["align"]) {
  return align ? ` style="text-align: ${align}"` : "";
}

function codeLanguageClass(lang: string | undefined) {
  const normalized = lang?.trim().split(/\s+/)[0];
  return normalized ? ` class="language-${escapeAttribute(normalized)}"` : "";
}

function createEmojiAliases() {
  const aliases: Record<string, string> = {};
  for (const [emoji, names] of Object.entries(emojiKeywords)) {
    for (const name of names) {
      if (aliases[name] === undefined) aliases[name] = emoji;
    }
  }
  return aliases;
}

const emojiAliases = createEmojiAliases();

const languageMap: Record<string, LanguageRegistration[]> = {
  javascript: js,
  typescript: ts,
  tsx,
  jsx,
  python,
  rust,
  solidity,
  markdown,
  html,
  css,
  shellscript: shell,
  shell: shell,
  bash: shell,
  json,
  yaml,
  yml: yaml,
  sql,
  go,
};

let highlighter: Awaited<ReturnType<typeof createHighlighterCore>> | undefined;

async function ensureHighlighter() {
  if (highlighter) return highlighter;
  highlighter = await createHighlighterCore({
    engine: createOnigurumaEngine(wasm),
    themes: [githubDark],
    langs: Object.values(languageMap),
  });
  return highlighter;
}

function normalizeShikiLanguage(lang: string) {
  const normalized = lang.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return normalized in languageMap ? normalized : "text";
}

function hasFencedCodeBlock(text: string) {
  return /(^|\n)```/.test(text);
}

const baseMarkedOptions: MarkedCompatibleOptions = {
  async: false,
  breaks: false,
  gfm: true,
  pedantic: false,
  silent: true,
  renderer: {
    html() {
      return "";
    },
    paragraph(this: MarkedRendererThis, { tokens }: Tokens.Paragraph) {
      return `<p class="my-3 leading-relaxed">${this.parser.parseInline(tokens)}</p>`;
    },
    heading(this: MarkedRendererThis, { tokens, depth }: Tokens.Heading) {
      const className = depth === 1
        ? "my-5 text-xl font-semibold"
        : depth === 2
          ? "my-4 text-lg font-semibold"
          : "my-3 text-base font-semibold";
      return `<h${depth} class="${className}">${this.parser.parseInline(tokens)}</h${depth}>`;
    },
    list(this: MarkedRendererThis, token: Tokens.List) {
      const tag = token.ordered ? "ol" : "ul";
      const className = token.ordered ? "my-3 list-decimal pl-6" : "my-3 list-disc pl-6";
      const start = token.ordered && typeof token.start === "number" && token.start !== 1
        ? ` start="${token.start}"`
        : "";
      return `<${tag}${start} class="${className}">${token.items.map((item) => this.listitem(item)).join("")}</${tag}>`;
    },
    listitem(this: MarkedRendererThis, item: Tokens.ListItem) {
      const checkbox = item.task
        ? `<input disabled="" type="checkbox"${item.checked ? " checked=\"\"" : ""}> `
        : "";
      return `<li class="my-1">${checkbox}${this.parser.parse(item.tokens)}</li>`;
    },
    blockquote(this: MarkedRendererThis, { tokens }: Tokens.Blockquote) {
      return `<blockquote class="my-4 rounded-r-lg border-l border-dls-border bg-dls-hover/40 pl-4 italic text-muted-foreground">${this.parser.parse(tokens)}</blockquote>`;
    },
    code({ text, lang }: Tokens.Code) {
      return `<pre class="my-4 overflow-x-auto rounded-lg bg-dls-surface-muted/20 px-4 py-3 text-xs leading-6 text-dls-secondary"><code${codeLanguageClass(lang)}>${escapeHtml(text)}</code></pre>`;
    },
    codespan({ text }: Tokens.Codespan) {
      return `<code class="rounded-md bg-gray-2/70 px-1.5 py-0.5 font-mono text-sm text-foreground">${escapeHtml(text)}</code>`;
    },
    del(this: MarkedRendererThis, { raw, tokens }: Tokens.Del) {
      if (!raw.startsWith("~~")) return escapeHtml(raw);
      return `<del>${this.parser.parseInline(tokens)}</del>`;
    },
    link(this: MarkedRendererThis, { href, title, tokens }: Tokens.Link) {
      const safe = escapeAttribute(safeHref(href));
      const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
      return `<a href="${safe}"${titleAttr} target="_blank" rel="noreferrer noopener" class="text-indigo-10 underline underline-offset-2 transition-colors hover:text-indigo-8">${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const safe = escapeAttribute(safeHref(href));
      const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
      return `<img src="${safe}" alt="${escapeAttribute(text)}"${titleAttr} loading="lazy" decoding="async" class="my-4 max-w-full rounded-lg border border-dls-border/70">`;
    },
    table(this: MarkedRendererThis, token: Tokens.Table) {
      const header = token.header.map((cell) => this.tablecell({ ...cell, header: true })).join("");
      const body = token.rows.map((row) => this.tablerow({ text: row.map((cell) => this.tablecell(cell)).join("") })).join("");
      return `<table class="my-4 w-full border-collapse"><thead>${this.tablerow({ text: header })}</thead><tbody>${body}</tbody></table>`;
    },
    tablerow({ text }: { text: string }) {
      return `<tr>${text}</tr>`;
    },
    tablecell(this: MarkedRendererThis, { tokens, header, align }: Tokens.TableCell & { header?: boolean }) {
      const tag = header ? "th" : "td";
      const className = header
        ? "border border-dls-border bg-dls-hover p-2 text-left"
        : "border border-dls-border p-2 align-top";
      return `<${tag}${alignAttribute(align)} class="${className}">${this.parser.parseInline(tokens)}</${tag}>`;
    },
    hr() {
      return `<hr class="my-6 border-none h-px bg-gray-4">`;
    },
  },
};

const markdownParser = new MarkedCompatible(baseMarkedOptions).use(
  markedEmoji({
    emojis: emojiAliases,
    renderer: (token) => escapeHtml(token.emoji),
  }) as unknown,
);

const highlightedMarkdownParser = new MarkedCompatible({
  ...baseMarkedOptions,
  async: true,
}).use(
  markedEmoji({
    emojis: emojiAliases,
    renderer: (token) => escapeHtml(token.emoji),
  }) as unknown,
  markedShiki({
    async highlight(code, lang, props) {
      const language = normalizeShikiLanguage(lang);
      const highlighter = await ensureHighlighter();
      return highlighter.codeToHtml(code, {
        lang: language,
        meta: { __raw: props.join(" ") },
        theme: "github-dark",
        transformers: [
          transformerNotationDiff({ matchAlgorithm: "v3" }),
          transformerNotationHighlight({ matchAlgorithm: "v3" }),
          transformerNotationWordHighlight({ matchAlgorithm: "v3" }),
          transformerNotationFocus({ matchAlgorithm: "v3" }),
          transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
          transformerMetaHighlight(),
          transformerMetaWordHighlight(),
        ],
      });
    },
    container: `<div data-matterhorn-shiki="true" class="my-4 overflow-hidden rounded-lg bg-dls-surface-muted/20 p-4 text-xs leading-6">%s</div>`,
  }) as unknown,
);

function MarkdownBlockInner(props: {
  text: string;
  streaming?: boolean;
  highlightQuery?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const syncHtml = useMemo(() => {
    if (!props.text.trim()) return "";
    return markdownParser.parse(props.text, { async: false });
  }, [props.text]);
  const [highlightedHtml, setHighlightedHtml] = useState<{ text: string; html: string } | null>(null);

  useEffect(() => {
    if (props.streaming || !hasFencedCodeBlock(props.text)) {
      setHighlightedHtml(null);
      return;
    }

    let cancelled = false;
    void highlightedMarkdownParser.parse(props.text, { async: true }).then((html) => {
      if (!cancelled && html.trim()) setHighlightedHtml({ text: props.text, html });
    }).catch(() => {
      if (!cancelled) setHighlightedHtml(null);
    });
    return () => {
      cancelled = true;
    };
  }, [props.streaming, props.text]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    queueMicrotask(() => {
      if (!rootRef.current || rootRef.current !== root) return;
      applyTextHighlights(root, props.highlightQuery ?? "");
    });
  }, [props.highlightQuery, props.streaming, props.text]);

  const html = highlightedHtml?.text === props.text ? highlightedHtml.html : syncHtml;

  if (!html) return null;

  return (
    <div
      ref={rootRef}
      className="markdown-content max-w-none text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Memoize so a message block that has already been rendered — the usual
 * case for every assistant bubble above the currently-streaming one —
 * doesn't re-parse its markdown on every token. Only re-renders when its
 * own text / streaming / highlightQuery props change.
 */
export const MarkdownBlock = memo(MarkdownBlockInner);
MarkdownBlock.displayName = "MarkdownBlock";
