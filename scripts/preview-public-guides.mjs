// Local-only visual fixture. It never connects to a backend or changes app data.
// Theme is forced in markup and scripts blocked to inspect no-JavaScript output.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { publicGuides, guidePath } from "../apps/app/content/public-guides.mjs";
import { renderGuide } from "../apps/app/scripts/build-public-guides.mjs";

const assets = new Map([
  ["/learn.css", ["../apps/app/public/learn.css", "text/css"]],
  ["/learn/retro.css", ["../apps/app/src/styles/retro.css", "text/css"]],
  ["/matterhorn-logo-square.svg", ["../apps/app/public/matterhorn-logo-square.svg", "image/svg+xml"]],
]);
const server = createServer(async (request, response) => {
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    const asset = assets.get(url.pathname);
    if (asset) {
      response.setHeader("Content-Type", asset[1]);
      response.end(await readFile(new URL(asset[0], import.meta.url)));
      return;
    }
    const guide = publicGuides.find((item) => guidePath(item) === url.pathname.replace(/\/$/, ""));
    if (!guide) { response.writeHead(404); response.end("Local guide fixture only; no app or API here."); return; }
    const theme = url.searchParams.get("theme");
    const themeAttribute = ["dark", "light"].includes(theme) ? ` data-theme="${theme}"` : "";
    const html = renderGuide(guide, { retro: url.searchParams.get("retro") !== "0" })
      .replace('<html lang="en"', `<html lang="en"${themeAttribute}`)
      .replace('  <script src="/theme-bootstrap.js"></script>', "");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
  } catch {
    response.writeHead(500); response.end("Local fixture could not be rendered.");
  }
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(`No-JavaScript visual fixture: http://127.0.0.1:${address.port}/learn?theme=dark`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
