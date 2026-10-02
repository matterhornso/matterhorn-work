import { pathToFileURL } from "node:url";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;
export const AUDIT_PATHS = ["/", "/robots.txt", "/sitemap.xml", "/session", "/learn/"];

function decode(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function attributes(tag) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g), (match) => [match[1].toLowerCase(), decode(match[2] ?? match[3]) ]));
}

// A bounded raw-response diagnostic, not a replacement for browser rendering or
// an HTML/schema validator. Never retain response bodies or account identifiers.
export function inspectResponse({ pathname, status, headers, body }) {
  const contentType = headers.get("content-type") ?? "";
  const html = /text\/html/i.test(contentType);
  const meta = html ? Array.from(body.matchAll(/<meta\b[^>]*>/gi), (match) => attributes(match[0])) : [];
  const links = html ? Array.from(body.matchAll(/<link\b[^>]*>/gi), (match) => attributes(match[0])) : [];
  const text = (value) => value ? decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() : null;
  const title = html ? text(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) : null;
  const h1 = html ? text(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) : null;
  const robots = meta.find((item) => item.name?.toLowerCase() === "robots")?.content ?? null;
  const headerRobots = headers.get("x-robots-tag");
  const canonical = links.find((item) => item.rel?.toLowerCase() === "canonical")?.href ?? null;
  const findings = [];
  if (status !== 200) findings.push(`HTTP ${status}; this route is not an accepted public discovery document`);
  if (pathname === "/sitemap.xml" && (!/(?:application|text)\/xml/i.test(contentType) || !/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(body))) {
    findings.push("Sitemap must return XML with the sitemap namespace, not an app fallback");
  }
  if (pathname === "/robots.txt" && !/^text\/plain/i.test(contentType)) findings.push("robots.txt must be plain text");
  if (pathname === "/session" && !/\bnoindex\b/i.test(`${robots ?? ""},${headerRobots ?? ""}`)) findings.push("Account/session entry has no observed noindex directive");
  if (pathname === "/learn/" && html) {
    if (!canonical) findings.push("Public guide lacks a canonical URL");
    if (!title || !h1) findings.push("Public guide lacks a raw-HTML title or H1");
    if (/\bnoindex\b/i.test(`${robots ?? ""},${headerRobots ?? ""}`)) findings.push("Public guide is noindex; expected for previews, not an approved production indexable page");
  }
  return { pathname, status, contentType, bytes: Buffer.byteLength(body), title, h1, canonical, robots, headerRobots, findings };
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

export async function auditOrigin(origin, fetcher = fetch) {
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
      pages.push(inspectResponse({ pathname, status: response.status, headers: response.headers, body }));
    } catch {
      pages.push({ pathname, findings: ["Public request failed or exceeded timeout/size limit; investigate environment before diagnosing a site outage"] });
    }
  }
  return { version: 1, generatedAt: new Date().toISOString(), origin: base.origin, scope: "Unauthenticated raw HTTP only; no ranking, rendering or runtime acceptance claim", pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("Usage: node scripts/search-discovery-audit.mjs https://desks.matterhorn.so");
  const result = await auditOrigin(args[0]);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pages.some((page) => page.findings.length) ? 1 : 0;
}
