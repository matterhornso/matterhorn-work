#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const repoRoot = resolve(readArg("--repo-root") || scriptRoot);
const jsonOutput = readArg("--json-output");
const strict = args.includes("--strict");
const json = args.includes("--json");
const maxFileBytes = Number(readArg("--max-file-bytes") || 2 * 1024 * 1024);

const ignoredPrefixes = [
  ".git/",
  ".matterhorn-work/",
  "notes/",
  "qa-reports/",
  "node_modules/",
  "apps/desktop/dist",
  "apps/desktop/server 2/",
  "apps/desktop/server 3/",
];

const ignoredSegments = ["/fixtures/", "/__fixtures__/", "/snapshots/", "/__snapshots__/"];
const ignoredSuffixes = [
  ".lock",
  ".lockb",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".dmg",
  ".blockmap",
];

const sourceExtensions = new Set([
  ".cjs", ".css", ".env", ".html", ".js", ".json", ".jsx", ".mjs", ".sh",
  ".swift", ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);

const rules = [
  { id: "provider-secret-token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: "github-token", pattern: /\bgh[opusr]_[A-Za-z0-9]{30,}\b/g },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "stripe-secret-key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{32,}=*\b/g },
  {
    id: "private-key-material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s*\n[A-Za-z0-9+/=\r\n]{20,}/g,
  },
];

function git(commandArgs, options = {}) {
  return execFileSync("git", commandArgs, {
    cwd: repoRoot,
    encoding: options.encoding || "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function listFiles() {
  const raw = git(["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "buffer" });
  return raw.toString("utf8").split("\0").filter(Boolean);
}

function isTestOrFixture(path) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(path)
    || path.startsWith("test/")
    || path.startsWith("tests/")
    || path.includes("/tests/")
    || path.includes("/test/");
}

function shouldScan(path) {
  if (ignoredPrefixes.some((prefix) => path.startsWith(prefix))) return false;
  if (ignoredSegments.some((segment) => path.includes(segment))) return false;
  if (ignoredSuffixes.some((suffix) => path.toLowerCase().endsWith(suffix))) return false;
  if (isTestOrFixture(path)) return false;
  if (path.endsWith(".md") || path.endsWith(".mdx")) return false;
  if (path.endsWith("package-lock.json") || path.endsWith("pnpm-lock.yaml")) return false;
  const extension = extname(path).toLowerCase();
  return sourceExtensions.has(extension)
    || path === "Dockerfile"
    || path.endsWith("/Dockerfile")
    || path.endsWith(".env.example");
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

const scanned = [];
const skippedLarge = [];
const findings = [];

for (const path of listFiles()) {
  if (!shouldScan(path)) continue;
  const absolutePath = resolve(repoRoot, path);
  let size;
  try {
    size = statSync(absolutePath).size;
  } catch {
    continue;
  }
  if (size > maxFileBytes) {
    skippedLarge.push({ path, bytes: size });
    continue;
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  scanned.push(path);

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      findings.push({
        path,
        line: lineNumberAt(text, match.index),
        rule: rule.id,
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }
}

const report = {
  version: "matterhorn.release-secret-scan.v1",
  capturedAt: new Date().toISOString(),
  repository: repoRoot,
  branch: git(["branch", "--show-current"]).trim(),
  head: git(["rev-parse", "HEAD"]).trim(),
  ready: findings.length === 0 && skippedLarge.length === 0,
  scannedFiles: scanned.length,
  skippedLarge,
  findings,
  policy: {
    reportsMatchedValues: false,
    excludesTestsFixturesDocsRuntimeAndGeneratedEvidence: true,
  },
};

if (jsonOutput) {
  const target = resolve(repoRoot, jsonOutput);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Release secret scan: ${report.branch}@${report.head.slice(0, 12)}`);
  console.log(`  Source files scanned: ${report.scannedFiles}`);
  console.log(`  Findings:            ${report.findings.length}`);
  console.log(`  Oversized skipped:   ${report.skippedLarge.length}`);
  if (jsonOutput) console.log(`  Report:               ${resolve(repoRoot, jsonOutput)}`);
  for (const finding of findings) {
    console.log(`  - ${finding.path}:${finding.line} (${finding.rule})`);
  }
}

if (strict && !report.ready) {
  console.error("Release secret scan blocked. Matched values were not printed.");
  process.exitCode = 1;
}
