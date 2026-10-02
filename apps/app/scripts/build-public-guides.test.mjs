import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPublicGuides, escapeHtml, publicGuideRoutes, renderGuide, renderSitemap, searchPublication, validateGuides } from "./build-public-guides.mjs";
import { CONTENT_DATE, PUBLIC_ORIGIN, guidePath, publicGuides } from "../content/public-guides.mjs";

test("publication requires explicit approval and a production build", () => {
  for (const env of [{}, { MATTERHORN_SEARCH_INDEXABLE: "1" }, { MATTERHORN_SEARCH_INDEXABLE: "1", VERCEL_ENV: "preview" }, { MATTERHORN_SEARCH_INDEXABLE: "0", VERCEL_ENV: "production" }]) {
    assert.equal(searchPublication(env), false);
  }
  assert.equal(searchPublication({ MATTERHORN_SEARCH_INDEXABLE: "1", VERCEL_ENV: "production" }), true);
  assert.throws(() => searchPublication({ MATTERHORN_SEARCH_INDEXABLE: "yes" }), /must be 0 or 1/);
});

test("seven unique public guides contain the five primary desks and a verification workflow", () => {
  validateGuides(publicGuides);
  assert.deepEqual(publicGuides.map((g) => g.slug), ["", "private-ai", "bittensor", "hyperliquid", "polymarket", "sui", "check-an-ai-crypto-answer"]);
  assert.equal(new Set(publicGuides.map((g) => g.description)).size, 7);
  assert.throws(() => validateGuides([...publicGuides, publicGuides[0]]), /duplicate/);
  assert.throws(() => validateGuides([{ ...publicGuides[0], slug: "../session" }]), /slug/);
  for (const href of ["javascript:alert(1)", "http://docs.sui.io/", "https://docs.sui.io/?secret=test", "https://user:pass@docs.sui.io/", "/workspace/private", "https://unapproved.example/"]) {
    assert.throws(() => validateGuides([{ ...publicGuides[0], sections: [{ title: "Source", links: [[href, "Source"]] }] }]));
  }
});

test("HTML and structured-data text are escaped without executing content", () => {
  const value = '<script>"hello" & \'world\'</script>';
  assert.equal(escapeHtml(value), "&lt;script&gt;&quot;hello&quot; &amp; &#39;world&#39;&lt;/script&gt;");
  const html = renderGuide({ ...publicGuides[0], title: value, answer: value });
  assert.ok(!html.includes(value));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema["@graph"].find((n) => n["@type"] === "WebPage").name, value);
  assert.throws(() => renderGuide(publicGuides[0], { buildCommit: '<script>' }), /full SHA/);
});

test("guidance qualifies model defaults, processing privacy and live readiness", () => {
  const index = renderGuide(publicGuides[0]);
  assert.match(index, /Workspace defaults can apply when no model is selected/);
  assert.doesNotMatch(index, /does not substitute a different model without your choice/);
  assert.match(index, /not a live availability guarantee/);
  assert.match(renderGuide(publicGuides[1]), /does not guarantee on-device processing/);
});

test("every public page is useful HTML without loading the authenticated app", () => {
  for (const guide of publicGuides) {
    const html = renderGuide(guide);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.ok(html.includes(escapeHtml(guide.answer)));
    assert.ok(html.includes(`rel="canonical" href="${PUBLIC_ORIGIN}${guidePath(guide)}"`));
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /href="#content">Skip to content/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /src="\/theme-bootstrap.js"/);
    assert.doesNotMatch(html, /type="module"|src="\/src\/|(?:href|src)="\/api\/|ws_web_|ses_[a-z0-9]|localStorage|fetch\(/);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.deepEqual(schema["@graph"].map((node) => node["@type"]), ["Organization", "WebSite", "WebPage", "BreadcrumbList"]);
    assert.equal(schema["@graph"][2].dateModified, CONTENT_DATE);
    assert.doesNotMatch(JSON.stringify(schema), /aggregateRating|reviewCount|offers|Person/);
  }
});

test("sitemap contains only canonical public guides; preview has no URLs", () => {
  assert.match(renderSitemap(false), /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.doesNotMatch(renderSitemap(false), /<loc>/);
  const urls = [...renderSitemap(true).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(urls, publicGuideRoutes.map((path) => PUBLIC_ORIGIN + path));
  assert.doesNotMatch(renderSitemap(true), /workspace|session|reset|token|verify|canary|localhost/);
});

test("isolated generation writes seven pages, existing shared styles and safe crawler files", async (t) => {
  const outDir = await mkdtemp(join(tmpdir(), "matterhorn-guides-test-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const sha = "a".repeat(40);
  const result = await buildPublicGuides({ outDir, env: { VITE_MATTERHORN_BUILD_COMMIT: sha } });
  assert.equal(result.pages, 7);
  assert.equal(result.indexable, false);
  assert.equal((await readdir(join(outDir, "learn"))).filter((f) => f.endsWith(".html")).length, 7);
  assert.doesNotMatch(await readFile(join(outDir, "robots.txt"), "utf8"), /Sitemap:/);
  assert.match(await readFile(join(outDir, "learn/index.html"), "utf8"), /data-matterhorn-ui="retro"/);
  assert.equal(await readFile(join(outDir, "learn.html"), "utf8"), await readFile(join(outDir, "learn/index.html"), "utf8"));
  assert.equal(await readFile(join(outDir, "learn/retro.css"), "utf8"), await readFile(new URL("../src/styles/retro.css", import.meta.url), "utf8"));
  await buildPublicGuides({ outDir, env: { MATTERHORN_SEARCH_INDEXABLE: "1", VERCEL_ENV: "production", VITE_MATTERHORN_RETRO_UI: "0", VITE_MATTERHORN_BUILD_COMMIT: sha } });
  const html = await readFile(join(outDir, "learn/index.html"), "utf8");
  assert.match(html, /content="index, follow, max-image-preview:large"/);
  assert.doesNotMatch(html, /data-matterhorn-ui|href="\/learn\/retro.css"/);
  assert.match(html, new RegExp(`name="matterhorn-build-commit" content="${sha}"`));
  assert.match(await readFile(join(outDir, "robots.txt"), "utf8"), /Sitemap: https:\/\/desks.matterhorn.so\/sitemap.xml/);
});

test("both Vercel layouts route approved guides ahead of SPA fallback and noindex aliases", async () => {
  const configs = await Promise.all([new URL("../vercel.json", import.meta.url), new URL("../../../vercel.json", import.meta.url)].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  assert.deepEqual(configs[0].headers, configs[1].headers);
  assert.deepEqual(configs[0].rewrites, configs[1].rewrites);
  for (const config of configs) {
    assert.deepEqual(config.rewrites.at(-1), { source: "/(.*)", destination: "/index.html" });
    const aliasRule = config.headers.find((rule) => rule.headers.some((h) => h.key === "X-Robots-Tag"));
    assert.deepEqual(aliasRule, { source: "/(.*)", missing: [{ type: "host", value: "desks.matterhorn.so" }], headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] });
    assert.ok(config.rewrites.some((r) => r.source === "/learn" && r.destination === "/learn/index.html"));
    const guideRule = config.rewrites.find((r) => r.source.startsWith("/learn/:guide("));
    assert.equal(guideRule.destination, "/learn/:guide.html");
    const slugs = guideRule.source.slice("/learn/:guide(".length, -1).split("|");
    assert.deepEqual(slugs, publicGuides.filter((g) => g.slug).map((g) => g.slug));
    assert.ok(config.rewrites.some((r) => r.source === "/api/:path*" && r.destination.includes("matterhorn-proxy")));
  }
});

test("app shell remains noindex and both sign-in render paths link to the guides", async () => {
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(index, /name="robots" content="noindex, follow"/);
  for (const path of ["../vite.config.ts", "../src/react-app/domains/cloud/public-web-signin-page.tsx"]) {
    assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /href="\/learn">Explore the desks<\/a>/);
  }
});
