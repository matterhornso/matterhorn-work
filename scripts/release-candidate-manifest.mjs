#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_VERSION = "matterhorn.release-candidate-manifest.v1";

const scriptPath = fileURLToPath(import.meta.url);
const scriptRoot = resolve(dirname(scriptPath), "..");

const BUCKETS = Object.freeze([
  {
    id: "tests-and-release-documentation",
    label: "Tests and release documentation",
    patterns: [
      /(?:^|\/)(?:tests?|e2e)(?:\/|$)/,
      /\.(?:test|spec)\.[cm]?[jt]sx?$/,
      /^docs\//,
      /^evals\//,
      /^qa\//,
    ],
  },
  {
    id: "release-engineering",
    label: "Release engineering",
    patterns: [
      /^\.github\//,
      /^packaging\//,
      /^patches\//,
      /^scripts\/(?:release|public-beta|product-hunt|launch-channel|production|dependency|desktop|electron|lighthouse|matterhorn-platform|matterhorn-product-browser|matterhorn-full-platform|generated-media-browser|workspace-backup|rollback)/,
      /(?:^|\/)(?:electron-builder|vercel|vite)\.(?:ya?ml|json|[cm]?[jt]s)$/,
      /(?:^|\/)(?:Dockerfile|docker-compose\.ya?ml)$/,
      /(?:^|\/)package\.json$/,
      /^pnpm-workspace\.yaml$/,
      /^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/,
      /^\.env\.example$/,
    ],
  },
  {
    id: "public-web-security",
    label: "Public web and security",
    patterns: [
      /(?:^|\/)(?:auth|signin|signed-in|authenticated|public-cloud|public-web-signin|cloud-account|provider-auth)(?:\/|[-_.])/,
      /(?:^|\/)(?:cors|security|permission|capabilit|trust-boundary|workspace-endpoint|env-route)/i,
      /(?:^|\/)(?:index|overlay)\.html$/,
      /(?:^|\/)(?:theme-bootstrap|public-signin-bootstrap|authenticated-app)\./,
    ],
  },
  {
    id: "wallet-and-market-safety",
    label: "Wallet and market safety",
    patterns: [
      /(?:^|\/)(?:wallet|bittensor|hyperliquid|polymarket|sui|crypto|decentralized-services)(?:\/|[-_.])/i,
      /(?:^|\/)(?:market|receipt|approval|transaction|signing-handoff)(?:\/|[-_.])/i,
      /^packages\/matterhorn-work-(?:crypto|wallet)-mcp\//,
    ],
  },
  {
    id: "runtime-and-recovery",
    label: "Runtime and recovery",
    patterns: [
      /^apps\/server\//,
      /^apps\/desktop\/(?:electron|scripts)\//,
      /^apps\/orchestrator\//,
      /^packages\/(?:handsfree|matterhorn-work-mcp|matterhorn-work-ui-mcp|types)\//,
      /(?:^|\/)(?:runtime|server|engine|opencode|recovery|backup|restore|workspace-init|workflow|memory|notes)(?:\/|[-_.])/i,
    ],
  },
  {
    id: "ui-and-accessibility",
    label: "UI and accessibility",
    patterns: [
      /^apps\/app\/src\/(?:react-app|i18n)\//,
      /^apps\/app\/src\/app\/bootstrap\.css$/,
      /^apps\/app\/public\/theme-bootstrap\.js$/,
      /(?:^|\/)(?:design-system|accessibility|readability|responsive|contrast|appearance)(?:\/|[-_.])/i,
    ],
  },
  {
    id: "branding-and-product-truth",
    label: "Branding and product truth",
    patterns: [
      /^apps\/app\/public\//,
      /^packages\/docs\/logo\//,
      /^packages\/email\//,
      /^\.opencode\/agents\//,
      /^docs\/branding\//,
      /(?:^|\/)(?:logo|brand|manifest|metadata)(?:\/|[-_.])/i,
      /^(?:AGENTS|BUILD_PLAN|CLAUDE|CODE_OF_CONDUCT|DESIGN|PRODUCT|README|SECURITY|SUPPORT|TRANSLATIONS)\.md$/,
    ],
  },
]);

const FALLBACKS = Object.freeze([
  [/^scripts\//, "release-engineering"],
  [/^apps\/server\//, "runtime-and-recovery"],
  [/^apps\/desktop\//, "runtime-and-recovery"],
  [/^apps\/orchestrator\//, "runtime-and-recovery"],
  [/^apps\/app\//, "ui-and-accessibility"],
  [/^packages\//, "runtime-and-recovery"],
  [/^\.opencode\//, "branding-and-product-truth"],
  [/^[^/]+\.md$/, "branding-and-product-truth"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function classifyCandidatePath(path) {
  for (const bucket of BUCKETS) {
    if (bucket.patterns.some((pattern) => pattern.test(path))) return bucket.id;
  }
  for (const [pattern, bucket] of FALLBACKS) {
    if (pattern.test(path)) return bucket;
  }
  return "unclassified";
}

function parseArgs(argv) {
  const config = {
    repoRoot: scriptRoot,
    outputDir: "",
    expectedHead: "",
    strict: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--") continue;
    if (arg === "--repo-root") config.repoRoot = resolve(next());
    else if (arg === "--output-dir") config.outputDir = resolve(next());
    else if (arg === "--expected-head") config.expectedHead = next().toLowerCase();
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && !config.outputDir) throw new Error("--output-dir is required.");
  if (config.expectedHead && !/^[a-f0-9]{40}$/i.test(config.expectedHead)) {
    throw new Error("--expected-head must be a full 40-character Git SHA.");
  }
  return config;
}

function helpText() {
  return [
    "Matterhorn Desks release-candidate manifest",
    "",
    "Usage:",
    "  pnpm release:candidate-manifest -- --output-dir qa-reports/public-beta/candidate-manifest --strict --json",
    "",
    "Classifies and hashes candidate-review paths while reporting protected roots only as aggregate counts.",
    "The command never stages, copies, deletes, or publishes source files.",
  ].join("\n");
}

function readScopeInventory(repoRoot) {
  const source = execFileSync(
    process.execPath,
    [join(scriptRoot, "scripts/release-scope-inventory.mjs"), "--repo-root", repoRoot, "--json"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(source);
}

function safeCandidatePath(repoRoot, path) {
  const target = resolve(repoRoot, path);
  if (target !== repoRoot && !target.startsWith(`${repoRoot}${sep}`)) {
    throw new Error(`Candidate path escapes the repository: ${path}`);
  }
  return target;
}

function fileEvidence(repoRoot, entry) {
  const target = safeCandidatePath(repoRoot, entry.path);
  if (entry.status.includes("D") || !existsSync(target)) {
    return { kind: "deleted", size: 0, sha256: null };
  }
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) {
    const link = readlinkSync(target);
    return { kind: "symlink", size: Buffer.byteLength(link), sha256: sha256(link) };
  }
  if (!stat.isFile()) {
    return { kind: "other", size: stat.size, sha256: null };
  }
  return { kind: "file", size: stat.size, sha256: sha256(readFileSync(target)) };
}

export function buildManifest(repoRoot, inventory, expectedHead = "") {
  const candidateReview = inventory.candidateReview.map((entry) => ({
    ...entry,
    bucket: classifyCandidatePath(entry.path),
    ...fileEvidence(repoRoot, entry),
  }));
  candidateReview.sort((left, right) => left.path.localeCompare(right.path));

  const bucketCounts = Object.fromEntries(
    [...BUCKETS.map((bucket) => bucket.id), "unclassified"].map((id) => [id, 0]),
  );
  for (const entry of candidateReview) bucketCounts[entry.bucket] += 1;

  const unclassifiedPaths = candidateReview
    .filter((entry) => entry.bucket === "unclassified")
    .map((entry) => entry.path);
  const expectedHeadMatches = !expectedHead || inventory.head.toLowerCase() === expectedHead;
  const blockers = [
    ...inventory.stagedProtectedPaths.map((entry) => ({
      id: "protected_path_staged",
      detail: `${entry.protectedRoot} contains staged content.`,
    })),
    ...unclassifiedPaths.map((path) => ({
      id: "unclassified_candidate_path",
      detail: path,
    })),
    ...(expectedHeadMatches
      ? []
      : [{ id: "unexpected_head", detail: `${inventory.head} does not match ${expectedHead}.` }]),
  ];
  const digestInput = candidateReview.map(
    ({ status, path, bucket, kind, size, sha256: digest }) => ({
      status,
      path,
      bucket,
      kind,
      size,
      sha256: digest,
    }),
  );

  return {
    version: MANIFEST_VERSION,
    capturedAt: new Date().toISOString(),
    repository: repoRoot,
    branch: inventory.branch,
    head: inventory.head,
    expectedHead: expectedHead || null,
    expectedHeadMatches,
    decision: blockers.length === 0 ? "REVIEWABLE" : "BLOCKED",
    reviewable: blockers.length === 0,
    candidateSourceDigest: sha256(stableJson(digestInput)),
    totals: {
      candidateReview: candidateReview.length,
      preserveOnly: inventory.totals.preserveOnly,
      stagedCandidate: candidateReview.filter((entry) => entry.staged).length,
      stagedProtected: inventory.stagedProtectedPaths.length,
      unclassified: unclassifiedPaths.length,
    },
    bucketCounts,
    preserveOnly: inventory.preserveOnly,
    blockers,
    candidateReview,
  };
}

function markdown(report) {
  const bucketLabels = new Map(BUCKETS.map((bucket) => [bucket.id, bucket.label]));
  const lines = [
    "# Matterhorn Desks Release Candidate Manifest",
    "",
    `**Decision:** ${report.decision}`,
    `**Branch:** \`${report.branch}\``,
    `**HEAD:** \`${report.head}\``,
    `**Candidate source digest:** \`${report.candidateSourceDigest}\``,
    "",
    `- Candidate-review paths: ${report.totals.candidateReview}`,
    `- Preserve-only paths: ${report.totals.preserveOnly}`,
    `- Staged candidate paths: ${report.totals.stagedCandidate}`,
    `- Staged protected paths: ${report.totals.stagedProtected}`,
    `- Unclassified paths: ${report.totals.unclassified}`,
    "",
    "Preserve-only filenames are intentionally omitted. Only root-level counts are recorded.",
    "",
    "## Buckets",
    "",
    "| Bucket | Paths |",
    "|---|---:|",
    ...Object.entries(report.bucketCounts).map(
      ([id, count]) => `| ${bucketLabels.get(id) ?? "Unclassified"} | ${count} |`,
    ),
  ];

  if (report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const blocker of report.blockers) lines.push(`- ${blocker.id}: ${blocker.detail}`);
  }

  for (const [id, label] of bucketLabels.entries()) {
    const entries = report.candidateReview.filter((entry) => entry.bucket === id);
    if (entries.length === 0) continue;
    lines.push("", `## ${label}`, "", "| Status | Path | Size | SHA-256 |", "|---|---|---:|---|");
    for (const entry of entries) {
      const path = entry.path.replaceAll("`", "\\`").replaceAll("\n", " ");
      lines.push(
        `| \`${entry.status}\` | \`${path}\` | ${entry.size} | \`${entry.sha256 ?? entry.kind}\` |`,
      );
    }
  }

  const unclassified = report.candidateReview.filter((entry) => entry.bucket === "unclassified");
  if (unclassified.length > 0) {
    lines.push("", "## Unclassified", "");
    for (const entry of unclassified) lines.push(`- \`${entry.path}\``);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const inventory = readScopeInventory(config.repoRoot);
  const report = buildManifest(config.repoRoot, inventory, config.expectedHead);
  mkdirSync(config.outputDir, { recursive: true });
  const jsonPath = join(config.outputDir, "release-candidate-manifest.json");
  const markdownPath = join(config.outputDir, "release-candidate-manifest.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(markdownPath, `${markdown(report)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(
      `Release candidate manifest: ${report.decision} (${report.totals.candidateReview} paths, ${report.totals.unclassified} unclassified)\n`,
    );
    process.stdout.write(`Manifest: ${relative(config.repoRoot, jsonPath)}\n`);
  }
  if (config.strict && !report.reviewable) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
