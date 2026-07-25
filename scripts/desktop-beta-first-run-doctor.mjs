#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FORBIDDEN_RE = /(privateKey|private_key|seedPhrase|seed phrase|mnemonic|apiSecret|api secret|rawSignature|raw signature|signedPayload|signed payload|walletExport|wallet export)/i;

function parseArgs(argv) {
  const args = {
    artifactDir: "",
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL || "",
    token: process.env.MATTERHORN_WORK_TOKEN || "",
    json: false,
    strict: false,
    markdownOutput: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--json") args.json = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--artifact-dir") {
      args.artifactDir = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--artifact-dir=")) {
      args.artifactDir = arg.slice("--artifact-dir=".length);
    } else if (arg === "--server-url") {
      args.serverUrl = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--server-url=")) {
      args.serverUrl = arg.slice("--server-url=".length);
    } else if (arg === "--token") {
      args.token = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--token=")) {
      args.token = arg.slice("--token=".length);
    } else if (arg === "--markdown-output") {
      args.markdownOutput = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--markdown-output=")) {
      args.markdownOutput = arg.slice("--markdown-output=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Desks desktop release doctor",
    "",
    "Usage:",
    "  pnpm desktop:release-doctor -- --json",
    "  pnpm desktop:release-doctor -- --artifact-dir ~/Desktop/matterhorn-desks-build-<sha> --strict --json",
    "  pnpm desktop:release-doctor -- --server-url http://127.0.0.1:<port> --token <client-token> --json",
    "",
    "The doctor is read-only. It never asks for keys, secrets, signatures, signed payloads, wallet exports, or funds.",
    "",
  ].join("\n"));
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split(/\n/)[0] || null;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function check(id, label, status, summary, details = {}) {
  return { id, label, status, summary, details };
}

function requireText(path, needles) {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  return needles.every((needle) => text.includes(needle));
}

function inspectArtifactDir(artifactDir) {
  if (!artifactDir) {
    return check(
      "artifact.dir",
      "Tester artifact folder",
      "skip",
      "No --artifact-dir supplied. Run `pnpm electron:tester-artifact -- --output-dir <dir>` before customer install QA.",
    );
  }

  const dir = resolve(artifactDir);
  const manifestPath = join(dir, "matterhorn-electron-local-tester-artifact.json");
  const checksumPath = join(dir, "SHA256SUMS.txt");
  const files = [
    manifestPath,
    checksumPath,
  ];

  if (!existsSync(dir) || files.some((file) => !existsSync(file))) {
    return check("artifact.dir", "Tester artifact folder", "fail", "Artifact folder is missing manifest or checksum files.", { dir });
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dmg = manifest.artifacts?.find((artifact) => artifact.name?.endsWith(".dmg"));
  const zip = manifest.artifacts?.find((artifact) => artifact.name?.endsWith(".zip"));
  if (!dmg || !zip) {
    return check("artifact.dir", "Tester artifact folder", "fail", "Manifest does not include both DMG and ZIP artifacts.", { dir });
  }
  for (const artifact of [dmg, zip]) {
    if (!existsSync(artifact.file)) {
      return check("artifact.dir", "Tester artifact folder", "fail", `Missing artifact file: ${artifact.name}`, { dir });
    }
    if (artifact.sha256 && sha256(artifact.file) !== artifact.sha256) {
      return check("artifact.dir", "Tester artifact folder", "fail", `Checksum mismatch: ${artifact.name}`, { dir });
    }
  }
  if (manifest.unsigned !== true || manifest.notarized !== false || manifest.publishEnabled !== false) {
    return check("artifact.dir", "Tester artifact folder", "fail", "Manifest should clearly mark local tester artifacts as unsigned, not notarized, and not published.", { dir });
  }

  return check("artifact.dir", "Tester artifact folder", "pass", "DMG, ZIP, manifest, and checksums are present and hash-bound.", { dir, gitSha: manifest.gitSha });
}

async function fetchJson(url, token = "") {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { ok: response.ok, status: response.status, body };
}

async function liveServerChecks(config) {
  if (!config.serverUrl) {
    return [
      check(
        "server.health",
        "Local server health",
        "skip",
        "No --server-url supplied. Start Matterhorn Desks and rerun with MATTERHORN_WORK_SERVER_URL when testing the running app.",
      ),
    ];
  }

  const baseUrl = config.serverUrl.replace(/\/+$/, "");
  const checks = [];
  try {
    const health = await fetchJson(`${baseUrl}/health`);
    checks.push(check("server.health", "Local server health", health.ok ? "pass" : "fail", `HTTP ${health.status}`, { body: health.body }));
  } catch (error) {
    checks.push(check("server.health", "Local server health", "fail", error instanceof Error ? error.message : String(error)));
  }

  try {
    const readiness = await fetchJson(`${baseUrl}/api/crypto/readiness`, config.token);
    const accessControlEnforced = !config.token && readiness.status === 401;
    checks.push(check(
      "crypto.readiness",
      "Unified crypto readiness",
      readiness.ok || accessControlEnforced ? "pass" : "fail",
      accessControlEnforced ? "Protected endpoint requires a client token." : `HTTP ${readiness.status}`,
      { body: readiness.body },
    ));
  } catch (error) {
    checks.push(check("crypto.readiness", "Unified crypto readiness", "fail", error instanceof Error ? error.message : String(error)));
  }

  return checks;
}

function markdown(report) {
  const rows = report.checks
    .map((item) => `| ${item.id} | ${item.status} | ${item.summary.replace(/\|/g, "\\|")} |`)
    .join("\n");
  return [
    "# Matterhorn Desks Desktop Release Doctor",
    "",
    `- Git SHA: \`${report.gitSha}\``,
    `- Ready: \`${report.ready}\``,
    `- Generated: \`${report.generatedAt}\``,
    "",
    "## Checks",
    "",
    "| Check | Status | Summary |",
    "|---|---:|---|",
    rows,
    "",
    "## Copy Diagnostics",
    "",
    "```json",
    JSON.stringify(report.copyDiagnostics, null, 2),
    "```",
    "",
  ].join("\n");
}

const config = parseArgs(process.argv.slice(2));
if (config.help) {
  printHelp();
  process.exit(0);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const panelPath = "apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx";
const panelText = existsSync(panelPath) ? readFileSync(panelPath, "utf8") : "";

const checks = [
  check("runtime.node", "Node.js", process.version ? "pass" : "fail", process.version),
  check("runtime.pnpm", "pnpm", commandVersion("pnpm") ? "pass" : "warning", commandVersion("pnpm") ?? "pnpm not found"),
  check("runtime.bun", "Bun", commandVersion("bun") ? "pass" : "warning", commandVersion("bun") ?? "bun not found"),
  check(
    "script.tester_artifact",
    "Tester artifact helper",
    packageJson.scripts?.["electron:tester-artifact"] === "node scripts/electron-local-tester-artifact.mjs" ? "pass" : "fail",
    "Validates `pnpm electron:tester-artifact` wiring.",
  ),
  check(
    "script.doctor",
    "Desktop release doctor",
    packageJson.scripts?.["desktop:release-doctor"] === "node scripts/desktop-beta-first-run-doctor.mjs" ? "pass" : "fail",
    "Validates the stable release doctor wiring.",
  ),
  check(
    "docs.release",
    "Production launch guide",
    requireText("docs/production-launch-configuration.md", ["Production Launch Configuration", "pnpm desktop:release-doctor", "signed/notarized package", "seed phrases"]) ? "pass" : "fail",
    "Docs cover production configuration, release diagnostics, signed packages, and non-custodial safety.",
  ),
  check(
    "ui.release_boundary",
    "Customer-facing release boundary",
    panelText.includes("Read and preview") && panelText.includes("Hyperliquid: Wallet-approved trading") && panelText.includes("Polymarket remains preview only") && panelText.includes("Matterhorn uses public reads and external signer/client handoffs") ? "pass" : "fail",
    "Stable UI distinguishes public reads, wallet-approved Hyperliquid execution, and preview-only Polymarket handoffs.",
  ),
  check(
    "safety.copy",
    "Safety copy",
    FORBIDDEN_RE.test(panelText) && panelText.includes("Automatic execution off") && panelText.includes("Wallet approval per Hyperliquid order") && panelText.includes("External signer required") ? "pass" : "fail",
    "UI rejects secrets, custody, and automatic execution while requiring explicit wallet approval for Hyperliquid orders.",
  ),
  inspectArtifactDir(config.artifactDir),
  ...(await liveServerChecks(config)),
];

const failCount = checks.filter((item) => item.status === "fail").length;
const warningCount = checks.filter((item) => item.status === "warning").length;
const skipCount = checks.filter((item) => item.status === "skip").length;
const report = {
  version: "matterhorn.desktop.release-doctor.v1",
  generatedAt: new Date().toISOString(),
  gitSha: gitSha(),
  ready: failCount === 0,
  summary: {
    pass: checks.filter((item) => item.status === "pass").length,
    warning: warningCount,
    skip: skipCount,
    fail: failCount,
  },
  checks,
  copyDiagnostics: {
    installGuide: "docs/production-launch-configuration.md",
    testerArtifactCommand: "pnpm electron:tester-artifact -- --output-dir ~/Desktop/matterhorn-desks-build-$(git rev-parse --short=8 HEAD) --json",
    doctorCommand: "pnpm desktop:release-doctor -- --artifact-dir <tester-build-dir> --strict --json",
    logLocations: [
      "~/Library/Logs/Matterhorn/",
      "~/Library/Application Support/Matterhorn/",
      "apps/desktop/dist-electron/mac-arm64/Matterhorn Desks.app/Contents/Resources/app.asar",
    ],
    customerBoundary: {
      bittensor: "Bittensor: public read, unsigned preview, and external-signer workflow",
      hyperliquidPolymarket: "Hyperliquid: exact-intent connected-wallet execution; Polymarket: preview/external-signer only",
      servicesWellness: "Services and wellness: workflow packs only; unavailable operator services remain disabled",
    },
  },
};

if (config.markdownOutput) {
  writeFileSync(config.markdownOutput, markdown(report));
}

if (config.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Matterhorn desktop release doctor: ${report.ready ? "READY" : "NOT READY"}`);
  for (const item of checks) {
    console.log(`[${item.status}] ${item.id}: ${item.summary}`);
  }
}

if (config.strict && failCount > 0) {
  process.exit(1);
}
