import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { createHighlighterCore, type LanguageRegistration } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import wasm from "shiki/wasm";
import githubDark from "shiki/themes/github-dark.mjs";
import css from "shiki/langs/css.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import js from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import shell from "shiki/langs/shellscript.mjs";
import solidity from "shiki/langs/solidity.mjs";
import sql from "shiki/langs/sql.mjs";
import ts from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import yaml from "shiki/langs/yaml.mjs";

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
  shell,
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

export async function highlightCode(code: string, lang: string, props: string[]) {
  const resolvedHighlighter = await ensureHighlighter();
  return resolvedHighlighter.codeToHtml(code, {
    lang: normalizeShikiLanguage(lang),
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
}
