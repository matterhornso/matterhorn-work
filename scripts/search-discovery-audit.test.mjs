import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUDIT_PATHS, auditOrigin, inspectResponse, readBoundedText } from "./search-discovery-audit.mjs";

const inspect = (pathname, body, type = "text/html", extra = {}) => inspectResponse({ pathname, body, status: 200, headers: new Headers({ "content-type": type, ...extra }) });

test("detects a false-success sitemap returning the SPA", () => {
  assert.equal(inspect("/sitemap.xml", "<title>Matterhorn Desks</title>").findings.length, 1);
  assert.equal(inspect("/sitemap.xml", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', "application/xml").findings.length, 0);
});

test("recognizes public metadata without persisting body text", () => {
  const body = `<html><title>Crypto &amp; AI</title><meta name='description' content='Research'><link href='https://desks.matterhorn.so/learn/' rel='canonical'><h1>Research <span>with evidence</span></h1><p>Do not persist this paragraph</p></html>`;
  const result = inspect("/learn/", body);
  assert.equal(result.title, "Crypto & AI");
  assert.equal(result.h1, "Research with evidence");
  assert.equal(result.canonical, "https://desks.matterhorn.so/learn/");
  assert.deepEqual(result.findings, []);
  assert.equal(JSON.stringify(result).includes("Do not persist"), false);
});

test("private-route noindex can be supplied by HTML or HTTP header", () => {
  assert.equal(inspect("/session", "<h1>Sign in</h1>").findings.length, 1);
  assert.equal(inspect("/session", '<meta content="noindex, follow" name="robots">').findings.length, 0);
  assert.equal(inspect("/session", "", "text/html", { "x-robots-tag": "noindex" }).findings.length, 0);
  assert.equal(inspect("/learn/", '<title>Guide</title><h1>Guide</h1><link rel="canonical" href="https://desks.matterhorn.so/learn/"><meta name="robots" content="noindex">').findings.length, 1);
});

test("app shell is not an indexable copy of every private/unknown route", () => {
  const app = readFileSync(new URL("../apps/app/index.html", import.meta.url), "utf8");
  assert.deepEqual(inspect("/session", app).findings, []);
  assert.match(app, /Polymarket and Sui/);
  assert.doesNotMatch(app, /rel="canonical"/);
});

test("rejects URLs that could carry secrets; never follows redirects", async () => {
  for (const url of ["http://example.com", "https://user:secret@example.com", "https://example.com/session", "https://example.com/?token=secret", "https://example.com/#secret"]) {
    await assert.rejects(() => auditOrigin(url));
  }
  const paths = [];
  const result = await auditOrigin("https://example.com", async (url, options) => {
    paths.push(url.pathname);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, undefined);
    return new Response("", { status: 302, headers: { location: "https://elsewhere.invalid/" } });
  });
  assert.deepEqual(paths, AUDIT_PATHS);
  assert.equal(result.pages.every((page) => page.findings.length > 0), true);
});

test("bounds response size and treats network failure as unverified", async () => {
  await assert.rejects(() => readBoundedText(new Response("a".repeat(1_000_001))), /size limit/);
  const result = await auditOrigin("https://example.com", async () => { throw new Error("network failed"); });
  assert.equal(result.pages.length, AUDIT_PATHS.length);
  assert.equal(result.pages.every((page) => page.findings[0].includes("investigate environment")), true);
});
