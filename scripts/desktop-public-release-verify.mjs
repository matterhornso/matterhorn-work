#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import process from "node:process";

const VERSION = "matterhorn.desktop-public-release-verification.v1";

function parseArgs(argv) {
  const config = { distDir: "", expectedVersion: "", sourceCommit: process.env.GITHUB_SHA ?? "", json: false, jsonOutput: "", strict: false, commandFixture: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--dist-dir") config.distDir = next();
    else if (arg === "--expected-version") config.expectedVersion = next().replace(/^v/, "");
    else if (arg === "--source-commit") config.sourceCommit = next().toLowerCase();
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--command-fixture") config.commandFixture = next();
    else if (arg === "--json") config.json = true;
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && !config.distDir) throw new Error("--dist-dir is required.");
  return config;
}

function help() {
  return [
    "Matterhorn macOS public release verifier",
    "",
    "Verifies Developer ID signing, Gatekeeper acceptance, notarization stapling, DMG/ZIP integrity, updater metadata, and SHA-256 digests.",
    "It reads release artifacts only and never accepts signing credentials.",
    "",
    "Usage:",
    "  pnpm desktop:public-release-verify -- --dist-dir apps/desktop/dist-electron --expected-version 0.13.13 --source-commit <40-char-sha> --json-output verification.json",
    "",
    "--command-fixture is reserved for local contract tests and can never produce strict public-release evidence.",
  ].join("\n");
}

function walk(dir) {
  const files = [];
  const apps = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) apps.push(path);
    else if (entry.isDirectory()) {
      const nested = walk(path);
      files.push(...nested.files);
      apps.push(...nested.apps);
    } else if (entry.isFile()) files.push(path);
  }
  return { files, apps };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function check(id, label, pass, summary, details = {}) {
  return { id, label, status: pass ? "pass" : "fail", summary, ...details };
}

function loadFixture(path) {
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function commandRunner(fixture) {
  return (id, command, args) => {
    if (fixture) {
      const result = fixture[id];
      if (!result) return { status: 1, stdout: "", stderr: `Missing command fixture: ${id}` };
      return { status: Number(result.status ?? 1), stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
    }
    const result = spawnSync(command, args, { encoding: "utf8" });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

function commandCheck(id, label, result, expectedPattern, summary) {
  const output = `${result.stdout}\n${result.stderr}`;
  return check(id, label, result.status === 0 && expectedPattern.test(output), summary, { exitCode: result.status });
}

function validateUpdaterManifest(path, expectedVersion, assets) {
  if (!path) return check("updater_manifest", "Updater metadata", false, "latest-mac.yml is missing.");
  const source = readFileSync(path, "utf8");
  const zip = assets.find((asset) => asset.endsWith(".zip"));
  const versionMatch = source.match(/^version:\s*['\"]?([^'\"\s]+)['\"]?\s*$/m);
  const versionOk = !expectedVersion || versionMatch?.[1] === expectedVersion;
  const assetOk = Boolean(zip && source.includes(basename(zip)) && /sha512:\s*\S+/m.test(source));
  return check("updater_manifest", "Updater metadata", versionOk && assetOk, "Updater metadata names the ZIP, includes sha512, and matches the release version.", {
    file: basename(path),
    version: versionMatch?.[1] ?? null,
  });
}

function runVerification(config) {
  const distDir = resolve(config.distDir);
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) throw new Error("Release distribution directory does not exist.");
  const fixture = loadFixture(config.commandFixture);
  if (config.strict && fixture) throw new Error("--command-fixture cannot be used with --strict.");
  if (config.strict && !/^[a-f0-9]{40}$/i.test(config.sourceCommit)) {
    throw new Error("--source-commit must be a full 40-character commit SHA in strict mode.");
  }
  if (config.sourceCommit && !/^[a-f0-9]{40}$/i.test(config.sourceCommit)) {
    throw new Error("--source-commit must be a full 40-character commit SHA.");
  }
  const run = commandRunner(fixture);
  const { files, apps } = walk(distDir);
  const app = apps.find((path) => /matterhorn/i.test(basename(path))) ?? apps[0];
  const dmg = files.find((path) => /matterhorn/i.test(basename(path)) && path.endsWith(".dmg"));
  const zip = files.find((path) => /matterhorn/i.test(basename(path)) && path.endsWith(".zip"));
  const manifest = files.find((path) => basename(path) === "latest-mac.yml");
  const checks = [
    check("artifact_app", "Application bundle", Boolean(app), "A Matterhorn application bundle is present."),
    check("artifact_dmg", "DMG artifact", Boolean(dmg), "A Matterhorn DMG is present."),
    check("artifact_zip", "ZIP artifact", Boolean(zip), "A Matterhorn ZIP is present."),
    validateUpdaterManifest(manifest, config.expectedVersion, [dmg, zip].filter(Boolean)),
  ];

  if (app) {
    checks.push(commandCheck("codesign_verify", "Developer ID signature", run("codesignVerify", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]), /valid on disk|satisfies its Designated Requirement/i, "The app bundle passes strict deep signature verification."));
    checks.push(commandCheck("codesign_identity", "Signing identity", run("codesignIdentity", "codesign", ["-dv", "--verbose=4", app]), /Authority=Developer ID Application:.*TeamIdentifier=[A-Z0-9]+/is, "The app has a Developer ID Application authority and TeamIdentifier."));
    checks.push(commandCheck("gatekeeper", "Gatekeeper assessment", run("gatekeeper", "spctl", ["--assess", "--type", "execute", "--verbose=4", app]), /accepted/i, "Gatekeeper accepts the app bundle."));
    checks.push(commandCheck("app_staple", "App notarization staple", run("appStaple", "xcrun", ["stapler", "validate", app]), /validate action worked|ticket/i, "The app contains a valid notarization ticket."));
  }
  if (dmg) {
    checks.push(commandCheck("dmg_staple", "DMG notarization staple", run("dmgStaple", "xcrun", ["stapler", "validate", dmg]), /validate action worked|ticket/i, "The DMG contains a valid notarization ticket."));
    checks.push(commandCheck("dmg_integrity", "DMG integrity", run("dmgVerify", "hdiutil", ["verify", dmg]), /verified|checksums verified/i, "The DMG passes hdiutil verification."));
  }
  if (zip) checks.push(commandCheck("zip_integrity", "ZIP integrity", run("zipVerify", "unzip", ["-t", zip]), /No errors detected|test of .* OK/i, "The ZIP passes archive integrity verification."));

  const assets = [dmg, zip].filter(Boolean).map((path) => ({ file: basename(path), sha256: sha256(path) }));
  const failures = checks.filter((item) => item.status === "fail");
  const localContract = Boolean(fixture) || process.platform !== "darwin";
  return {
    version: VERSION,
    status: failures.length === 0 && !localContract ? "pass" : failures.length === 0 ? "local_contract" : "fail",
    ok: failures.length === 0,
    ready: failures.length === 0 && !localContract,
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    expectedVersion: config.expectedVersion || null,
    sourceCommit: config.sourceCommit || null,
    localContract,
    artifacts: assets,
    checks,
    failures: failures.map(({ id, label, summary }) => ({ id, label, summary })),
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const report = runVerification(config);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Matterhorn desktop public release: ${report.ready ? "PASS" : report.ok ? "LOCAL CONTRACT" : "BLOCKED"}\n`);
  if (!report.ok || (config.strict && !report.ready)) process.exitCode = 1;
}

try { main(); } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
