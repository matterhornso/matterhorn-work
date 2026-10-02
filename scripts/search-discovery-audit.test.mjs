import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUDIT_PATHS, auditOrigin, inspectResponse, readBoundedText } from "./search-discovery-audit.mjs";
import { publicGuides, guidePath } from "../apps/app/content/public-guides.mjs";
import { renderGuide, renderSitemap } from "../apps/app/scripts/build-public-guides.mjs";

const inspect = (pathname, body, type = "text/html", extra = {}) => inspectResponse({ pathname, body, status: 200, headers: new Headers({ "content-type": type, ...extra }) });

test("detects a false-success sitemap returning the SPA", () => {
  assert.equal(inspect("/sitemap.xml", "<title>Matterhorn Desks</title>").findings.length, 1);
  assert.equal(inspect("/sitemap.xml", renderSitemap(true), "application/xml").findings.length, 0);
  assert.match(inspect("/sitemap.xml", renderSitemap(false), "application/xml").findings[0], /allowlist/);
  assert.match(inspect("/sitemap.xml", renderSitemap(true).replace('/learn</loc>', '/workspace/private</loc>'), "application/xml").findings[0], /allowlist/);
});

test("recognizes public metadata without persisting body text", () => {
  const body = renderGuide(publicGuides[0], { indexable: true }).replace('</article>', '<p>Do not persist this paragraph</p></article>');
  const result = inspect("/learn/", body);
  assert.equal(result.title, `${publicGuides[0].title} | Matterhorn Desks`);
  assert.equal(result.h1, publicGuides[0].title);
  assert.equal(result.canonical, "https://desks.matterhorn.so/learn");
  assert.deepEqual(result.findings, []);
  assert.equal(JSON.stringify(result).includes("Do not persist"), false);
});

test("private-route noindex can be supplied by HTML or HTTP header", () => {
  assert.equal(inspect("/session", "<h1>Sign in</h1>").findings.length, 1);
  assert.equal(inspect("/session", '<meta content="noindex, follow" name="robots">').findings.length, 0);
  assert.equal(inspect("/session", "", "text/html", { "x-robots-tag": "noindex" }).findings.length, 0);
  assert.equal(inspect("/learn/", renderGuide(publicGuides[0])).findings.length, 1);
});

test("combines robots directives and recognizes none without mistaking image settings", () => {
  const html = renderGuide(publicGuides[0], { indexable: true });
  for (const extra of ['<meta name="robots" content="none">', '<meta name="GOOGLEBOT" content="NOINDEX">', '<meta name="bingbot" content="noindex">']) {
    assert.ok(inspect('/learn', html.replace('</head>', `${extra}</head>`)).findings.some((f) => f.includes('noindex')));
  }
  assert.deepEqual(inspect('/learn', html.replace('max-image-preview:large', 'max-image-preview:none')).findings, []);
  for (const body of ['<meta name="robots" content="none">', '<meta name="robots" content="index"><meta name="robots" content="NOINDEX">']) {
    assert.deepEqual(inspect('/session', body).findings, []);
  }
  assert.ok(inspect('/session', '<meta name="googlebot" content="noindex">').findings.length > 0);
  assert.ok(inspect('/session', '', 'text/html', { 'x-robots-tag': 'otherbot: noindex, nofollow' }).findings.length > 0);
  assert.ok(inspect('/session', '', 'text/html', { 'x-robots-tag': 'googlebot: max-snippet:0, noindex' }).findings.length > 0);
  assert.deepEqual(inspect('/session', '', 'text/html', { 'x-robots-tag': 'max-image-preview:none, noindex' }).findings, []);
  assert.deepEqual(inspect('/session', '', 'text/html', { 'x-robots-tag': 'none' }).findings, []);
  assert.ok(inspect('/', '<h1>Sign in</h1>').findings.length > 0);
});

test("robots text must match reviewed crawl access and canonical sitemap declaration", () => {
  const expected = 'User-agent: *\nDisallow:\nSitemap: https://desks.matterhorn.so/sitemap.xml\n';
  assert.deepEqual(inspect('/robots.txt', expected, 'text/plain').findings, []);
  assert.deepEqual(inspect('/robots.txt', `# comment\n${expected}`, 'text/plain').findings, []);
  for (const body of ['', 'User-agent: *\nDisallow: /', expected.replace('/sitemap.xml', '/private.xml'), `${expected}User-agent: Googlebot\nDisallow: /learn`]) {
    assert.ok(inspect('/robots.txt', body, 'text/plain').findings.length > 0);
  }
  assert.deepEqual(inspectResponse({ pathname: '/robots.txt', status: 200, headers: new Headers({ 'content-type': 'text/plain' }), body: 'User-agent: *\nDisallow:', expectIndexable: false }).findings, []);
});

test("detects malformed schema, wrong-page fallback and non-HTML guides", () => {
  const html = renderGuide(publicGuides[1], { indexable: true });
  assert.deepEqual(inspect('/learn/private-ai', html).findings, []);
  assert.ok(inspect('/learn/bittensor', html).findings.some((f) => f.includes('release drift')));
  assert.ok(inspect('/learn/private-ai', html.replace('"@graph":', 'invalid:')).findings.some((f) => f.includes('structured data')));
  assert.ok(inspect('/learn/private-ai', '{}', 'application/json').findings.some((f) => f.includes('must return HTML')));
});

test("production and preview fixture audits cover all seven guides without contacting an app", async () => {
  for (const expectIndexable of [true, false]) {
    const result = await auditOrigin('https://example.com', async (url) => {
      let body = '<meta name="robots" content="noindex, follow">';
      let type = 'text/html';
      if (url.pathname === '/robots.txt') { body = `User-agent: *\nDisallow:\n${expectIndexable ? 'Sitemap: https://desks.matterhorn.so/sitemap.xml\n' : ''}`; type = 'text/plain'; }
      if (url.pathname === '/sitemap.xml') { body = renderSitemap(expectIndexable); type = 'application/xml'; }
      const guide = publicGuides.find((g) => guidePath(g) === url.pathname);
      if (guide) body = renderGuide(guide, { indexable: expectIndexable });
      return new Response(body, { headers: { 'content-type': type } });
    }, { expectIndexable });
    assert.equal(result.pages.length, 11);
    assert.deepEqual(result.pages.flatMap((page) => page.findings), []);
  }
});

test("production aliases keep the production sitemap but require general HTTP noindex", async () => {
  const fixture = async (url, withHeader) => {
    let body = '<meta name="robots" content="noindex, follow">';
    let type = 'text/html';
    if (url.pathname === '/robots.txt') { body = 'User-agent: *\nDisallow:\nSitemap: https://desks.matterhorn.so/sitemap.xml'; type = 'text/plain'; }
    if (url.pathname === '/sitemap.xml') { body = renderSitemap(true); type = 'application/xml'; }
    const guide = publicGuides.find((g) => guidePath(g) === url.pathname);
    if (guide) body = renderGuide(guide, { indexable: true });
    return new Response(body, { headers: { 'content-type': type, ...(withHeader ? { 'x-robots-tag': 'noindex, follow' } : {}) } });
  };
  const options = { expectIndexable: false, sitemapPublished: true, requireHeaderNoindex: true };
  const pass = await auditOrigin('https://alias.example', (url) => fixture(url, true), options);
  assert.deepEqual(pass.pages.flatMap((page) => page.findings), []);
  const fail = await auditOrigin('https://alias.example', (url) => fixture(url, false), options);
  assert.equal(fail.pages.every((page) => page.findings.some((f) => f.includes('HTTP header'))), true);
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
