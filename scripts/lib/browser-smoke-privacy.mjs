import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function validateBrowserTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Browser target must be a valid HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Browser target must use HTTP(S) without URL credentials");
  }
  return url;
}

export function reportUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "[non-HTTP URL omitted]";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch { return "[invalid URL omitted]"; }
}

export async function privateEvidenceDirectory(parent) {
  if (parent) await mkdir(parent, { recursive: true, mode: 0o700 });
  return mkdtemp(join(parent || tmpdir(), "matterhorn-browser-smoke-"));
}

export async function writePrivateEvidence(path, content) {
  await writeFile(path, content, { flag: "wx", mode: 0o600 });
}

export function recordDiagnostic(items, value) {
  if (items.length < 100) items.push(value);
}

export function networkDiagnostic(response) {
  const method = response.request().method();
  return { status: response.status(), method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method) ? method : "OTHER", url: reportUrl(response.url()) };
}
