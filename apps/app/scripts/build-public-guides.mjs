import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTENT_DATE, PUBLIC_ORIGIN, REPOSITORY, guidePath, publicGuides } from "../content/public-guides.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
export const publicGuideRoutes = publicGuides.map(guidePath);
const publicAppLinks = new Set(["/session", "/privacy", "/security", "/terms", "/support", "/status"]);
const protocolHosts = new Set(["github.com", "www.bittensor.com", "hyperliquid.gitbook.io", "docs.polymarket.com", "docs.sui.io"]);

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeLink(href) {
  if (publicGuideRoutes.includes(href) || publicAppLinks.has(href)) return href;
  const url = new URL(href);
  if (url.protocol !== "https:" || !protocolHosts.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("Public guide link must be an approved public document");
  }
  return url.href;
}

export function searchPublication(env) {
  const flag = env.MATTERHORN_SEARCH_INDEXABLE?.trim() ?? "";
  if (!["", "0", "1"].includes(flag)) throw new Error("MATTERHORN_SEARCH_INDEXABLE must be 0 or 1");
  // Explicit publication approval AND production build context are required.
  // Canonical-host HTTP noindex rules additionally protect production aliases.
  return flag === "1" && env.VERCEL_ENV === "production";
}

export function validateGuides(guides) {
  const slugs = new Set();
  const titles = new Set();
  for (const guide of guides) {
    if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(guide.slug) || slugs.has(guide.slug)) throw new Error("Invalid or duplicate public guide slug");
    if (!guide.title || titles.has(guide.title) || !guide.description || !guide.answer || !guide.sections?.length) throw new Error("Public guide is incomplete or has a duplicate title");
    slugs.add(guide.slug);
    titles.add(guide.title);
    for (const section of guide.sections) {
      if (!section.title) throw new Error("Public section needs a title");
      for (const [href, label] of section.links ?? []) {
        safeLink(href);
        if (!label) throw new Error("Public link needs a label");
      }
    }
  }
  if (!slugs.has("")) throw new Error("Public guides require an index");
}

function list(items, tag = "ul") {
  return items ? `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>` : "";
}

function renderSection(section, index) {
  return `<section aria-labelledby="section-${index}">
    <h2 id="section-${index}">${escapeHtml(section.title)}</h2>
    ${(section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
    ${list(section.steps, "ol")}${list(section.items)}
    ${section.prompt ? `<div class="guide-prompt"><h3>Example read-only prompt</h3><p>${escapeHtml(section.prompt)}</p><p class="guide-note">Replace bracketed inputs before using this example. It does not send a message or run a tool.</p></div>` : ""}
    ${section.links ? `<ul class="guide-links">${section.links.map(([href, label]) => `<li><a href="${escapeHtml(safeLink(href))}">${escapeHtml(label)}</a></li>`).join("")}</ul>` : ""}
  </section>`;
}

export function renderGuide(guide, { indexable = false, buildCommit = "", retro = true } = {}) {
  if (buildCommit && !/^[a-f0-9]{40}$/i.test(buildCommit)) throw new Error("Guide build commit must be a full SHA");
  const url = `${PUBLIC_ORIGIN}${guidePath(guide)}`;
  const breadcrumbs = [{ "@type": "ListItem", position: 1, name: "Matterhorn guides", item: `${PUBLIC_ORIGIN}/learn` }];
  if (guide.slug) breadcrumbs.push({ "@type": "ListItem", position: 2, name: guide.label, item: url });
  const schema = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "Organization", "@id": `${PUBLIC_ORIGIN}/#organization`, name: "Matterhorn", url: PUBLIC_ORIGIN, logo: `${PUBLIC_ORIGIN}/matterhorn-logo.png`, sameAs: [REPOSITORY] },
      { "@type": "WebSite", "@id": `${PUBLIC_ORIGIN}/learn#website`, name: "Matterhorn Desks guides", url: `${PUBLIC_ORIGIN}/learn`, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, inLanguage: "en" },
      { "@type": "WebPage", "@id": `${url}#webpage`, name: guide.title, description: guide.description, url, inLanguage: "en", dateModified: CONTENT_DATE, isPartOf: { "@id": `${PUBLIC_ORIGIN}/learn#website` }, breadcrumb: { "@id": `${url}#breadcrumb` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: breadcrumbs },
    ],
  };
  const schemaText = JSON.stringify(schema).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"${retro ? ' data-matterhorn-ui="retro"' : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(guide.title)} | Matterhorn Desks</title>
  <meta name="description" content="${escapeHtml(guide.description)}">
  <meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, follow"}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Matterhorn Desks">
  <meta property="og:title" content="${escapeHtml(guide.title)} | Matterhorn Desks">
  <meta property="og:description" content="${escapeHtml(guide.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${PUBLIC_ORIGIN}/matterhorn-logo.png">
  <meta property="og:image:alt" content="Matterhorn logo">
  <meta name="twitter:card" content="summary">
  ${buildCommit ? `<meta name="matterhorn-build-commit" content="${buildCommit}">` : ""}
  <link rel="icon" href="/matterhorn-logo-square.svg" type="image/svg+xml">
  <script src="/theme-bootstrap.js"></script>
  ${retro ? '<link rel="stylesheet" href="/learn/retro.css">' : ""}
  <link rel="stylesheet" href="/learn.css">
  <script type="application/ld+json">${schemaText}</script>
</head>
<body class="guide-page">
  <a class="guide-skip" href="#content">Skip to content</a>
  <header class="guide-header"><div class="guide-container">
    <a class="guide-brand" href="/learn"><img src="/matterhorn-logo-square.svg" width="24" height="24" alt="">Matterhorn Desks</a>
    <a class="guide-app-link" data-matterhorn-button data-variant="default" href="/session">Open app</a>
  </div></header>
  <main class="guide-layout guide-container" id="content" tabindex="-1">
    <nav class="guide-nav" aria-label="Product guides">${publicGuides.map((item) => `<a href="${guidePath(item)}"${item.slug === guide.slug ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`).join("\n")}</nav>
    <article>
      ${guide.slug ? `<nav aria-label="Breadcrumb"><ol class="guide-breadcrumb"><li><a href="/learn">Matterhorn guides</a></li><li aria-current="page">${escapeHtml(guide.label)}</li></ol></nav>` : ""}
      <h1>${escapeHtml(guide.title)}</h1>
      <p class="guide-answer">${escapeHtml(guide.answer)}</p>
      <p class="guide-note">Product guidance · Updated <time datetime="${CONTENT_DATE}">${CONTENT_DATE}</time></p>
      ${guide.sections.map(renderSection).join("\n")}
      <section aria-labelledby="try-desk"><h2 id="try-desk">Continue in Matterhorn</h2>
        <p>Open the app, choose an available model and desk, and review the actual service state before sending. These guides are not a live availability guarantee.</p>
        <a class="guide-app-link" data-matterhorn-button data-variant="default" href="/session">Open Matterhorn Desks</a>
      </section>
    </article>
  </main>
  <footer class="guide-footer"><div class="guide-container">
    <p>Prepared with AI assistance from Matterhorn product source and linked documentation. Research guidance, not financial advice.</p>
    <nav aria-label="Trust and source"><a href="/privacy">Privacy</a><a href="/security">Security</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="${REPOSITORY}">Source code</a></nav>
  </div></footer>
</body></html>\n`;
}

export function renderSitemap(indexable) {
  const urls = indexable ? publicGuideRoutes.map((path) => `<url><loc>${PUBLIC_ORIGIN}${path}</loc><lastmod>${CONTENT_DATE}</lastmod></url>`).join("\n") : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export async function buildPublicGuides({ outDir = resolve(appRoot, "dist"), env = process.env } = {}) {
  validateGuides(publicGuides);
  const indexable = searchPublication(env);
  const buildCommit = env.VITE_MATTERHORN_BUILD_COMMIT?.trim() ?? "";
  const retroFlag = env.VITE_MATTERHORN_RETRO_UI;
  const retro = retroFlag === undefined || retroFlag === "" || retroFlag === "1" || retroFlag === "true";
  // Render and validate everything before writing any generated files.
  const pages = publicGuides.map((guide) => ({ name: guide.slug || "index", html: renderGuide(guide, { indexable, buildCommit, retro }) }));
  const output = join(outDir, "learn");
  await mkdir(output, { recursive: true });
  for (const page of pages) await writeFile(join(output, `${page.name}.html`), page.html);
  // Vite preview resolves extensionless files but not a directory without its
  // trailing slash. Keep both index entry forms identical and canonicalized.
  await writeFile(join(outDir, "learn.html"), pages.find((page) => page.name === "index").html);
  await copyFile(resolve(appRoot, "src/styles/retro.css"), join(output, "retro.css"));
  await copyFile(resolve(appRoot, "public/learn.css"), join(outDir, "learn.css"));
  await writeFile(join(outDir, "sitemap.xml"), renderSitemap(indexable));
  // Allow robots to read noindex on the account shell. This is not access control.
  const robots = await readFile(resolve(appRoot, "public/robots.txt"), "utf8");
  await writeFile(join(outDir, "robots.txt"), `${robots.trim()}\n${indexable ? `Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n` : ""}`);
  return { pages: pages.length, indexable, outDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await buildPublicGuides()));
}
