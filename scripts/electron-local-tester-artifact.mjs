#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { copyFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    outputDir: "",
    json: false,
    skipBuild: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[i + 1] || "";
      i += 1;
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) return "unknown";
  return result.stdout.trim() || "unknown";
}

function assertSafeOutputDir(outputDir) {
  if (!outputDir || outputDir === "/" || outputDir === resolve(".")) {
    throw new Error("Refusing unsafe output directory");
  }
}

const args = parseArgs(process.argv.slice(2));
const sha = gitSha();
const outputDir = resolve(args.outputDir || join(process.env.HOME || "/tmp", "Desktop", `matterhorn-work-build-${sha}`));
const distDir = resolve("apps/desktop/dist-electron");

assertSafeOutputDir(outputDir);

if (!args.skipBuild) {
  run("pnpm", [
    "--filter",
    "@matterhorn-work/desktop",
    "package:electron",
    "--",
    "--mac",
    "dmg",
    "zip",
    "--publish",
    "never",
  ]);
}

if (!existsSync(distDir)) {
  throw new Error(`Electron dist directory does not exist: ${distDir}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const distEntries = await readdir(distDir);
const artifactNames = distEntries.filter((entry) => (
  /^matterhorn-mac-arm64-.*\.(dmg|zip|dmg\.blockmap|zip\.blockmap)$/.test(entry)
));

const dmg = artifactNames.find((entry) => entry.endsWith(".dmg"));
const zip = artifactNames.find((entry) => entry.endsWith(".zip"));
if (!dmg || !zip) {
  throw new Error("Expected Matterhorn macOS arm64 DMG and ZIP artifacts were not found");
}

const copied = [];
for (const name of artifactNames.sort()) {
  const source = join(distDir, name);
  const targetName = name === dmg
    ? `Matterhorn-Work-${sha}-arm64-unsigned.dmg`
    : name === zip
      ? `Matterhorn-Work-${sha}-arm64-unsigned.zip`
      : name;
  const target = join(outputDir, targetName);
  await copyFile(source, target);
  copied.push({
    file: target,
    name: basename(target),
    sha256: sha256(target),
  });
}

const manifest = {
  kind: "matterhorn.electron.local-tester-artifact.v1",
  gitSha: sha,
  outputDir,
  unsigned: true,
  notarized: false,
  publishEnabled: false,
  artifacts: copied,
  safety: {
    privateKeysAccepted: false,
    apiSecretsAccepted: false,
    signingMaterialAccepted: false,
  },
};

const checksums = copied.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n");
writeFileSync(join(outputDir, "SHA256SUMS.txt"), `${checksums}\n`);
writeFileSync(join(outputDir, "matterhorn-electron-local-tester-artifact.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (args.json) {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} else {
  console.log(`Matterhorn Work unsigned tester artifacts written to ${outputDir}`);
  for (const artifact of copied) {
    console.log(`- ${artifact.name} ${artifact.sha256}`);
  }
}
