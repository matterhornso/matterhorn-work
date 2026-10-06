import { pathToFileURL } from "node:url";
import { PUBLIC_ORIGIN, guidePath, publicGuides } from "../apps/app/content/public-guides.mjs";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;
const guidePaths = publicGuides.map(guidePath);
export const AUDIT_PATHS = ["/", "/robots.txt", "/sitemap.xml", "/session", ...guidePaths];

function decode(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function attributes(tag) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g), (match) => [match[1].toLowerCase(), decode(match[2] ?? match[3]) ]));
}

const preventsIndexing = (value) => value.split(/[,\s]+/).some((rule) => /^(?:noindex|none)$/i.test(rule));

function headerIndexingRules(value) {
  let scope = "";
  let generic = false;
  let any = false;
  for (const part of (value ?? "").split(",")) {
    let rule = part.trim();
    // Preserve crawler scope across comma-separated rules. Parameterized rules
    // such as max-image-preview:none are not the standalone `none` directive.
    const scoped = rule.match(/^([\w-]+):\s*(.*)$/);
    if (scoped && !["max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"].includes(scoped[1].toLowerCase())) {
      scope = scoped[1]; rule = scoped[2];
    }
    if (/^(?:noindex|none)$/i.test(rule)) {
      any = true;
      if (!scope) generic = true;
    }
  }
  return { generic, any };
}

function inspectRobotsText(body, sitemapPublished) {
  // Validate this release's deliberately simple crawl policy, not arbitrary
  // robots syntax. A changed policy needs operator review, never auto-rewriting.
  const lines = body.split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim()).filter(Boolean);
  const normalized = lines.map((line) => line.replace(/^([^:]+):\s*/, (_, name) => `${name.toLowerCase()}: `));
  const expected = ["user-agent: *", "disallow: "];
  if (sitemapPublished) expected.push(`sitemap: ${PUBLIC_ORIGIN}/sitemap.xml`);
  return normalized.length === expected.length && normalized.every((line, index) => line === expected[index]);
}

// A bounded raw-response diagnostic, not a replacement for browser rendering or
// an HTML/schema validator. Never retain response bodies or account identifiers.
export function inspectResponse({ pathname, status, headers, body, expectIndexable = true, sitemapPublished = expectIndexable, requireHeaderNoindex = false }) {
  const contentType = headers.get("content-type") ?? "";
  const html = /text\/html/i.test(contentType);
  const meta = html ? Array.from(body.matchAll(/<meta\b[^>]*>/gi), (match) => attributes(match[0])) : [];
  const links = html ? Array.from(body.matchAll(/<link\b[^>]*>/gi), (match) => attributes(match[0])) : [];
  const text = (value) => value ? decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() : null;
  const title = html ? text(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) : null;
  const h1 = html ? text(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) : null;
  const robots = meta.filter((item) => item.name?.toLowerCase() === "robots").map((item) => item.content ?? "").join(",") || null;
  const crawlerRobots = meta.filter((item) => ["googlebot", "bingbot"].includes(item.name?.toLowerCase())).map((item) => item.content ?? "");
  const headerRobots = headers.get("x-robots-tag");
  const canonical = links.find((item) => item.rel?.toLowerCase() === "canonical")?.href ?? null;
  const description = meta.find((item) => item.name?.toLowerCase() === "description")?.content ?? null;
  const headerRules = headerIndexingRules(headerRobots);
  const noindex = preventsIndexing(robots ?? "") || headerRules.generic;
  const anyNoindex = noindex || headerRules.any || crawlerRobots.some(preventsIndexing);
  const findings = [];
  if (status !== 200) findings.push(`HTTP ${status}; this route is not an accepted public discovery document`);
  if (pathname === "/sitemap.xml" && (!/(?:application|text)\/xml/i.test(contentType) || !/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(body))) {
    findings.push("Sitemap must return XML with the sitemap namespace, not an app fallback");
  } else if (pathname === "/sitemap.xml") {
    const urls = [...body.matchAll(/<loc>(.*?)<\/loc>/gs)].map((match) => decode(match[1].trim()));
    const expected = sitemapPublished ? guidePaths.map((path) => PUBLIC_ORIGIN + path) : [];
    if (urls.length !== expected.length || new Set(urls).size !== urls.length || urls.some((url) => !expected.includes(url))) {
      findings.push("Sitemap does not match the approved public-guide allowlist for this publication mode");
    }
  }
  if (pathname === "/robots.txt") {
    if (!/^text\/plain/i.test(contentType)) findings.push("robots.txt must be plain text");
    if (!inspectRobotsText(body, sitemapPublished)) findings.push("robots.txt differs from the reviewed crawl policy or sitemap declaration; inspect before release");
  }
  if (["/", "/session"].includes(pathname) && !noindex) findings.push("Account/session entry has no observed general noindex directive");
  if (requireHeaderNoindex && !headerRules.generic) findings.push("Production alias lacks the required general noindex HTTP header");
  const guide = publicGuides.find((item) => guidePath(item) === pathname.replace(/\/$/, ""));
  if (guide) {
    if (!html) findings.push("Public guide must return HTML");
    if (canonical?.replace(/\/$/, "") !== PUBLIC_ORIGIN + guidePath(guide)) findings.push("Public guide lacks its exact canonical URL");
    if (!title || !h1) findings.push("Public guide lacks a raw-HTML title or H1");
    if (h1 !== guide.title || title !== `${guide.title} | Matterhorn Desks`) findings.push("Public guide title/H1 does not match the intended page; check fallback routing or release drift");
    if (!description) findings.push("Public guide lacks a description");
    if (expectIndexable && anyNoindex) findings.push("Public guide is noindex; expected for previews, not an approved production indexable page");
    if (!expectIndexable && !noindex) findings.push("Preview guide lacks a noindex directive");
    try {
      const script = [...body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find((match) => attributes(match[1]).type === "application/ld+json");
      const schema = JSON.parse(script?.[2] ?? "null");
      const page = schema?.["@graph"]?.find((node) => node["@type"] === "WebPage");
      if (schema?.["@context"] !== "https://schema.org" || page?.url !== PUBLIC_ORIGIN + guidePath(guide) || page?.name !== guide.title) throw new Error("Mismatched schema");
    } catch {
      findings.push("Public guide has missing, malformed or mismatched WebPage structured data");
    }
  }
  return { pathname, status, contentType, bytes: Buffer.byteLength(body), title, h1, canonical, description, robots, headerRobots, findings };
}

export async function readBoundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Public response exceeds audit size limit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function auditOrigin(origin, fetcher = fetch, { expectIndexable = true, sitemapPublished = expectIndexable, requireHeaderNoindex = false } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Provide an HTTPS origin without credentials, path, query or fragment");
  }
  const pages = [];
  for (const pathname of AUDIT_PATHS) {
    try {
      const response = await fetcher(new URL(pathname, base), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        headers: { Accept: pathname.endsWith(".xml") ? "application/xml" : pathname.endsWith(".txt") ? "text/plain" : "text/html" },
      });
      const body = await readBoundedText(response);
      pages.push(inspectResponse({ pathname, status: response.status, headers: response.headers, body, expectIndexable, sitemapPublished, requireHeaderNoindex }));
    } catch {
      pages.push({ pathname, findings: ["Public request failed or exceeded timeout/size limit; investigate environment before diagnosing a site outage"] });
    }
  }
  return { version: 3, generatedAt: new Date().toISOString(), origin: base.origin, expectIndexable, sitemapPublished, requireHeaderNoindex, scope: "Unauthenticated raw HTTP only; no ranking, rendering or runtime acceptance claim", pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2 || (args[1] && !["--preview", "--production-alias"].includes(args[1]))) throw new Error("Usage: node scripts/search-discovery-audit.mjs https://desks.matterhorn.so [--preview|--production-alias]");
  const result = await auditOrigin(args[0], fetch, { expectIndexable: !args[1], sitemapPublished: args[1] !== "--preview", requireHeaderNoindex: args[1] === "--production-alias" });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pages.some((page) => page.findings.length) ? 1 : 0;
}
