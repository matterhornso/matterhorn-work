#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const VERSION = "matterhorn.product-hunt-evidence-packet.v1";
const SPECS = Object.freeze({
  readiness: { version: "matterhorn.launch-channel-readiness.v1", commit: (value) => value.commit },
  deployment: { version: "matterhorn.product-hunt-deployment-probe.v1", commit: (value) => value.metadata?.expectedCommit },
  operations: { version: "matterhorn.product-hunt-operations-readiness.v1", commit: (value) => value.commit },
  acceptance: { version: "matterhorn.product-hunt-acceptance-readiness.v1", commit: (value) => value.commit },
  desktop: { version: "matterhorn.desktop-public-release-verification.v1", commit: (value) => value.sourceCommit },
});

function parseArgs(argv) {
  const config = { commit: "", outputDir: "", strict: false, json: false, help: false, paths: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--commit") config.commit = next().toLowerCase();
    else if (arg === "--output-dir") config.outputDir = next();
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else if (/^--(?:readiness|deployment|operations|acceptance|desktop)$/.test(arg)) config.paths[arg.slice(2)] = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help) {
    if (!/^[a-f0-9]{40}$/i.test(config.commit)) throw new Error("--commit must be a full 40-character commit SHA.");
    if (!config.outputDir) throw new Error("--output-dir is required.");
    for (const key of Object.keys(SPECS)) if (!config.paths[key]) throw new Error(`--${key} is required.`);
  }
  return config;
}

function help() {
  return [
    "Matterhorn Product Hunt evidence packet",
    "",
    "Binds the final launch-readiness, deployed-host, operations, external-acceptance, and desktop reports to one immutable commit.",
    "Only evaluated reports are accepted. The packet contains hashes and summaries, never credentials or signing material.",
    "",
    "Usage:",
    "  pnpm pack:product-hunt-evidence -- --commit <40-char-sha> --readiness readiness.json --deployment deployment.json --operations operations.json --acceptance acceptance.json --desktop desktop.json --output-dir qa-reports/product-hunt/final",
  ].join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rejectSecrets(value, path = "report") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization|api.?key|secret|private.?key|seed|mnemonic|raw.?signature|signed.?payload|wallet.?export/i.test(key)) {
      throw new Error(`Credential-shaped report key is not allowed: ${path}.${key}`);
    }
    rejectSecrets(item, `${path}.${key}`);
  }
}

function readReport(label, path, spec, commit) {
  const source = readFileSync(path, "utf8");
  const value = JSON.parse(source);
  rejectSecrets(value, label);
  const reportedCommit = String(spec.commit(value) ?? "").toLowerCase();
  const checks = [
    { id: `${label}_version`, pass: value.version === spec.version, detail: value.version ?? "missing" },
    { id: `${label}_ready`, pass: value.ready === true, detail: value.decision ?? value.status ?? "not ready" },
    { id: `${label}_commit`, pass: reportedCommit === commit, detail: reportedCommit || "missing" },
  ];
  if (label === "readiness") checks.push({ id: "readiness_channel", pass: value.channel === "product-hunt", detail: value.channel ?? "missing" });
  return {
    label,
    file: basename(path),
    version: value.version ?? null,
    ready: value.ready === true,
    reportedCommit: reportedCommit || null,
    sha256: sha256(source),
    source,
    checks,
  };
}

function markdown(report) {
  return [
    "# Matterhorn Product Hunt Evidence Packet",
    "",
    `**Decision:** ${report.decision}`,
    `**Commit:** \`${report.commit}\``,
    `**Generated:** ${report.generatedAt}`,
    "",
    "| Report | Ready | Commit | SHA-256 |",
    "|---|---:|---|---|",
    ...report.reports.map((item) => `| ${item.label} | ${item.ready ? "yes" : "no"} | \`${item.reportedCommit ?? "missing"}\` | \`${item.sha256}\` |`),
    "",
    ...(report.blockers.length ? ["## Blockers", "", ...report.blockers.map((item) => `- ${item.id}: ${item.detail}`), ""] : []),
  ].join("\n");
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const evaluatedReports = Object.entries(SPECS).map(([label, spec]) => readReport(label, config.paths[label], spec, config.commit));
  const blockers = evaluatedReports.flatMap((item) => item.checks.filter((check) => !check.pass));
  mkdirSync(config.outputDir, { recursive: true });
  const reports = evaluatedReports.map(({ source, checks: _checks, ...item }) => {
    const file = `${item.label}-${item.file}`;
    writeFileSync(join(config.outputDir, file), source);
    return { ...item, file };
  });
  const report = {
    version: VERSION,
    decision: blockers.length ? "NO-GO" : "GO",
    ready: blockers.length === 0,
    commit: config.commit,
    generatedAt: new Date().toISOString(),
    reports,
    blockers: blockers.map(({ id, detail }) => ({ id, detail })),
  };

  const jsonPath = join(config.outputDir, "product-hunt-evidence-manifest.json");
  const markdownPath = join(config.outputDir, "product-hunt-evidence-manifest.md");
  const jsonSource = `${JSON.stringify(report, null, 2)}\n`;
  const markdownSource = `${markdown(report)}\n`;
  writeFileSync(jsonPath, jsonSource);
  writeFileSync(markdownPath, markdownSource);
  const checksumLines = [
    ...reports.map((item) => `${item.sha256}  ${item.file}`),
    `${sha256(jsonSource)}  ${basename(jsonPath)}`,
    `${sha256(markdownSource)}  ${basename(markdownPath)}`,
  ];
  writeFileSync(join(config.outputDir, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);
  if (config.json) process.stdout.write(jsonSource);
  else process.stdout.write(`Product Hunt evidence packet: ${report.decision}\nManifest: ${jsonPath}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try { main(); } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
