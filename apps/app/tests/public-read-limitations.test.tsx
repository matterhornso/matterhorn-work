/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PublicReadLimitations, readPublicReadLimitations } from "../src/react-app/domains/session/surface/public-read-limitations";

const tool = "matterhorn-work_matterhorn_hyperliquid_get_orderbook";
const warning = "Orderbook is read-only and limited to the levels returned by Hyperliquid info endpoint.";
const output = { success: true, orderbook: { warnings: [warning], source: { warnings: [] } } };

test("shows the real orderbook limitation even with empty source warnings", () => {
  expect(readPublicReadLimitations(tool, JSON.stringify(output))).toEqual([warning]);
  const html = renderToStaticMarkup(<PublicReadLimitations tool={tool} output={output} />);
  expect(html).toContain('aria-label="Tool limitations"');
  expect(html).toContain(warning);
  expect(html).not.toContain("<details");
});

test("preserves result and freshness warnings with deduplication", () => {
  expect(readPublicReadLimitations("matterhorn_hyperliquid_get_funding", {
    success: true, funding: { warnings: ["Limited", "Limited", null], source: { warnings: ["Stale", "Limited"] } },
  })).toEqual(["Limited", "Stale"]);
});

test("does not infer warnings from unrelated, failed, malformed or oversized output", () => {
  expect(readPublicReadLimitations("untrusted_" + tool, output)).toEqual([]);
  for (const value of [null, [], "{", "x".repeat(1_000_001), { ...output, success: false }, { success: true, orderbook: [] }]) {
    expect(readPublicReadLimitations(tool, value)).toEqual([]);
  }
  expect(renderToStaticMarkup(<PublicReadLimitations tool={tool} output={{}} />)).toBe("");
});

test("renders warning text safely and discloses bounded presentation", () => {
  const html = renderToStaticMarkup(<PublicReadLimitations tool={tool} output={{ success: true,
    orderbook: { warnings: ["<img src=x onerror=alert(1)>", "z".repeat(2_001), ...Array.from({ length: 9 }, (_, i) => `Warning ${i}`)] },
  }} />);
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
  expect(html).toContain("Open Result for the full warning");
  expect(html).toContain("3 additional warnings");
});

test("transcript displays limitations outside the technical disclosure", () => {
  const source = readFileSync(new URL("../src/react-app/domains/session/surface/message-list.tsx", import.meta.url), "utf8");
  expect(source).toContain('<PublicReadLimitations tool={props.part.tool} output={toolOutput} />');
  expect(source.indexOf('<PublicReadLimitations tool={props.part.tool}')).toBeLessThan(source.indexOf('{props.expanded ? (', source.indexOf('data-matterhorn-tool-disclosure')));
});
