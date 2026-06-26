#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
const currentFile = fileURLToPath(import.meta.url);

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const DEFAULT_OUTPUT_DIR = "qa-reports/lighthouse-playwright";
const DEFAULT_THRESHOLDS = {
  performance: 0.6,
  accessibility: 0.9,
  "best-practices": 0.9,
  seo: 0.9,
};
const STRICT_THRESHOLDS = {
  performance: 0.75,
  accessibility: 0.95,
  "best-practices": 0.95,
  seo: 0.95,
};

function parseArgs(argv = process.argv.slice(2)) {
  const urls = [];
  const flags = new Set();
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [name, inlineValue] = arg.split("=", 2);
    if (inlineValue !== undefined) {
      values.set(name, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(name, next);
      index += 1;
      continue;
    }
    flags.add(name);
  }

  if (values.has("--url")) urls.push(values.get("--url"));
  if (process.env.MATTERHORN_LIGHTHOUSE_URL) {
    urls.push(...process.env.MATTERHORN_LIGHTHOUSE_URL.split(",").map((url) => url.trim()).filter(Boolean));
  }

  const formFactors = flags.has("--desktop-only")
    ? ["desktop"]
    : flags.has("--mobile-only")
      ? ["mobile"]
      : ["desktop", "mobile"];

  return {
    help: flags.has("--help") || flags.has("-h"),
    json: flags.has("--json"),
    strict: flags.has("--strict") || process.env.MATTERHORN_LIGHTHOUSE_STRICT === "1",
    urls: [...new Set(urls)],
    outputDir: resolve(repoRoot, values.get("--output-dir") || process.env.MATTERHORN_LIGHTHOUSE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR),
    formFactors,
  };
}

function printHelp() {
  console.log(`Matterhorn Lighthouse + Playwright harness

Usage:
  MATTERHORN_LIGHTHOUSE_URL=http://127.0.0.1:<port> pnpm test:lighthouse-playwright -- --strict --json
  node scripts/lighthouse-playwright-harness.mjs --url http://127.0.0.1:<port> --output-dir qa-reports/lighthouse-playwright

Options:
  --url <url>          App URL to audit. Can also use MATTERHORN_LIGHTHOUSE_URL.
  --output-dir <dir>   Evidence directory. Default: ${DEFAULT_OUTPUT_DIR}
  --strict             Fail when category scores miss stricter thresholds.
  --json               Print machine-readable summary to stdout.
  --desktop-only       Run only desktop emulation.
  --mobile-only        Run only mobile emulation.
  --help               Show this message.

Outputs:
  summary.json, summary.md, *-lighthouse.json, *-lighthouse.html, *-screenshot.png,
  network-dependency-graph.json, network-dependency-graph.dot
`);
}

async function getOpenPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function slugFor(url, formFactor) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "root" : parsed.pathname;
    return `${parsed.hostname}-${parsed.port || "default"}-${path}-${formFactor}`
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  } catch {
    return `${basename(url)}-${formFactor}`.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  }
}

function viewportFor(formFactor) {
  if (formFactor === "mobile") {
    return { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true };
  }
  return { width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false };
}

function screenEmulationFor(formFactor) {
  const viewport = viewportFor(formFactor);
  return {
    mobile: viewport.isMobile,
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    disabled: false,
  };
}

async function readGitSha() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function scoreSummary(lhr) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category, lhr.categories?.[category]?.score ?? null]),
  );
}

function metricSummary(lhr) {
  const audits = lhr.audits || {};
  const readMetric = (id) => {
    const audit = audits[id];
    if (!audit) return null;
    return {
      title: audit.title,
      displayValue: audit.displayValue || null,
      numericValue: typeof audit.numericValue === "number" ? Math.round(audit.numericValue) : null,
      score: audit.score ?? null,
    };
  };

  return {
    firstContentfulPaint: readMetric("first-contentful-paint"),
    largestContentfulPaint: readMetric("largest-contentful-paint"),
    totalBlockingTime: readMetric("total-blocking-time"),
    cumulativeLayoutShift: readMetric("cumulative-layout-shift"),
    speedIndex: readMetric("speed-index"),
  };
}

function thresholdFailures(scores, thresholds) {
  return CATEGORIES.flatMap((category) => {
    const score = scores[category];
    const threshold = thresholds[category];
    if (typeof score !== "number" || score >= threshold) return [];
    return [{ category, score, threshold }];
  });
}

function extractNetworkItems(lhr) {
  return lhr.audits?.["network-requests"]?.details?.items || [];
}

function buildNetworkGraph(runs) {
  const originNodes = new Map();

  for (const run of runs) {
    for (const item of run.networkItems || []) {
      if (!item.url) continue;
      let origin = "unknown";
      try {
        origin = new URL(item.url).origin;
      } catch {
        origin = "invalid-url";
      }
      const current = originNodes.get(origin) || {
        id: origin,
        label: origin,
        requests: 0,
        transferSizeBytes: 0,
        resourceTypes: {},
      };
      const type = item.resourceType || item.mimeType || "other";
      current.requests += 1;
      current.transferSizeBytes += Number(item.transferSize || item.resourceSize || 0);
      current.resourceTypes[type] = (current.resourceTypes[type] || 0) + 1;
      originNodes.set(origin, current);
    }
  }

  const nodes = [{ id: "matterhorn-page", label: "Matterhorn page", type: "root" }, ...originNodes.values()];
  const edges = [...originNodes.values()].map((node) => ({
    from: "matterhorn-page",
    to: node.id,
    requests: node.requests,
    transferSizeBytes: node.transferSizeBytes,
  }));

  return { nodes, edges };
}

function graphToDot(graph) {
  const quote = (value) => `"${String(value).replaceAll('"', '\\"')}"`;
  const lines = [
    "digraph MatterhornLighthouseNetwork {",
    "  rankdir=LR;",
    "  node [shape=box, style=\"rounded,filled\", fillcolor=\"#0C0C0C\", fontcolor=\"#D1F2FF\", color=\"#D1F2FF\"];",
  ];
  for (const node of graph.nodes) {
    lines.push(`  ${quote(node.id)} [label=${quote(`${node.label}\\n${node.requests || 0} requests`)}];`);
  }
  for (const edge of graph.edges) {
    lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)} [label=${quote(`${edge.requests} req / ${Math.round(edge.transferSizeBytes / 1024)} KB`)}];`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function renderSummaryMarkdown(summary) {
  const lines = [
    "# Matterhorn Lighthouse + Playwright Report",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Git SHA: ${summary.gitSha}`,
    `- Strict mode: ${summary.strict ? "yes" : "no"}`,
    "",
    "## Thresholds",
    "",
    "| Category | Threshold |",
    "|---|---:|",
    ...Object.entries(summary.thresholds).map(([category, threshold]) => `| ${category} | ${threshold} |`),
    "",
    "## Runs",
    "",
    "| URL | Form factor | Performance | Accessibility | Best practices | SEO | Console errors | Status |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...summary.runs.map((run) => `| ${run.url} | ${run.formFactor} | ${formatScore(run.scores.performance)} | ${formatScore(run.scores.accessibility)} | ${formatScore(run.scores["best-practices"])} | ${formatScore(run.scores.seo)} | ${run.consoleErrors.length + run.pageErrors.length} | ${run.failures.length ? "FAIL" : "PASS"} |`),
    "",
    "## Atomic Design Performance Notes",
    "",
    "- Atoms: buttons, badges, logos, and chips should not import page-level data or protocol clients.",
    "- Molecules: cards and safety strips should receive already-normalized props and avoid new network fetches.",
    "- Organisms/desks: route-level shells own data loading, suspense/loading states, and degraded-provider copy.",
    "- Templates/pages: use this report to catch layout shifts, oversize bundles, inaccessible controls, and missing SEO metadata before a customer build.",
    "",
    "## Graph Outputs",
    "",
    "- `network-dependency-graph.json` groups Lighthouse network requests by origin.",
    "- `network-dependency-graph.dot` can be rendered with Graphviz or graph tooling.",
  ];

  return `${lines.join("\n")}\n`;
}

function formatScore(score) {
  return typeof score === "number" ? score.toFixed(2) : "n/a";
}

async function runOne({ url, formFactor, outputDir, thresholds }) {
  const slug = slugFor(url, formFactor);
  const port = await getOpenPort();
  const viewport = viewportFor(formFactor);
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${port}`],
  });

  const consoleErrors = [];
  const pageErrors = [];
  let httpStatus = null;

  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    httpStatus = response?.status() ?? null;
    await page.screenshot({
      path: join(outputDir, `${slug}-screenshot.png`),
      fullPage: true,
    });
    await context.close();

    const runnerResult = await lighthouse(url, {
      port,
      output: ["json", "html"],
      onlyCategories: CATEGORIES,
      logLevel: "error",
      formFactor,
      screenEmulation: screenEmulationFor(formFactor),
    });
    const reports = Array.isArray(runnerResult.report) ? runnerResult.report : [runnerResult.report];
    const jsonReport = reports.find((report) => typeof report === "string" && report.trim().startsWith("{"));
    const htmlReport = reports.find((report) => typeof report === "string" && report.trim().startsWith("<"));

    if (jsonReport) await writeFile(join(outputDir, `${slug}-lighthouse.json`), jsonReport);
    if (htmlReport) await writeFile(join(outputDir, `${slug}-lighthouse.html`), htmlReport);

    const scores = scoreSummary(runnerResult.lhr);
    const failures = thresholdFailures(scores, thresholds);

    return {
      url,
      formFactor,
      httpStatus,
      scores,
      metrics: metricSummary(runnerResult.lhr),
      failures,
      consoleErrors,
      pageErrors,
      artifacts: {
        screenshot: `${slug}-screenshot.png`,
        lighthouseJson: `${slug}-lighthouse.json`,
        lighthouseHtml: `${slug}-lighthouse.html`,
      },
      networkItems: extractNetworkItems(runnerResult.lhr),
    };
  } finally {
    await browser.close();
  }
}

export async function runLighthousePlaywrightHarness(options = {}) {
  const parsed = { ...parseArgs([]), ...options };
  if (!parsed.urls?.length) {
    return {
      status: "SKIPPED_NO_URL",
      message: "Set MATTERHORN_LIGHTHOUSE_URL or pass --url after starting pnpm dev:headless-web.",
      generatedAt: new Date().toISOString(),
      runs: [],
    };
  }

  const thresholds = parsed.strict ? STRICT_THRESHOLDS : DEFAULT_THRESHOLDS;
  await mkdir(parsed.outputDir, { recursive: true });
  const runs = [];

  for (const url of parsed.urls) {
    for (const formFactor of parsed.formFactors) {
      runs.push(await runOne({ url, formFactor, outputDir: parsed.outputDir, thresholds }));
    }
  }

  const graph = buildNetworkGraph(runs);
  const summary = {
    status: runs.some((run) => run.failures.length > 0) ? "FAILED_THRESHOLDS" : "PASSED",
    generatedAt: new Date().toISOString(),
    gitSha: await readGitSha(),
    strict: parsed.strict,
    thresholds,
    outputDir: parsed.outputDir,
    runs: runs.map(({ networkItems, ...run }) => run),
    graph,
  };

  await writeFile(join(parsed.outputDir, "network-dependency-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(join(parsed.outputDir, "network-dependency-graph.dot"), graphToDot(graph));
  await writeFile(join(parsed.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(parsed.outputDir, "summary.md"), renderSummaryMarkdown(summary));

  return summary;
}

if (process.argv[1] === currentFile) {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  runLighthousePlaywrightHarness(options)
    .then((summary) => {
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else if (summary.status === "SKIPPED_NO_URL") {
        console.log(`[lighthouse-playwright] ${summary.message}`);
      } else {
        console.log(`[lighthouse-playwright] ${summary.status}: ${summary.outputDir}`);
      }
      if (summary.status === "FAILED_THRESHOLDS" && options.strict) process.exitCode = 1;
    })
    .catch((error) => {
      console.error("[lighthouse-playwright] failed", error);
      process.exit(1);
    });
}
