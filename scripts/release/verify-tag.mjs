import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const tagIndex = args.indexOf("--tag");
const tagArg = tagIndex >= 0 ? args[tagIndex + 1] : null;
const tag = (tagArg || process.env.RELEASE_TAG || "").trim();

if (!tag) {
  console.error("Release tag missing. Provide --tag or set RELEASE_TAG.");
  process.exit(1);
}

const version = tag.startsWith("v") ? tag.slice(1) : tag;
const versionMatch = version.match(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
);

if (!versionMatch) {
  console.error(`Invalid release tag ${tag}. Expected vX.Y.Z or a SemVer prerelease tag.`);
  process.exit(1);
}

const baseVersion = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;
const expectedVersions = versionMatch[4]
  ? new Set([version, baseVersion])
  : new Set([version]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readText = (path) => readFileSync(path, "utf8");


const appVersion = readJson(resolve(root, "apps", "app", "package.json")).version ?? null;
const desktopVersion = readJson(resolve(root, "apps", "desktop", "package.json")).version ?? null;
const orchestratorVersion =
  readJson(resolve(root, "apps", "orchestrator", "package.json")).version ?? null;
const serverVersion = readJson(resolve(root, "apps", "server", "package.json")).version ?? null;
const opencodeRouterVersion = readJson(resolve(root, "apps", "opencode-router", "package.json")).version ?? null;


const mismatches = [];
const check = (label, actual) => {
  if (!actual) {
    mismatches.push(`${label} missing`);
    return;
  }
  if (!expectedVersions.has(actual)) {
    const expected = [...expectedVersions].join(" or ");
    mismatches.push(`${label}=${actual} (expected ${expected})`);
  }
};

check("app", appVersion);
check("desktop", desktopVersion);
check("openwork-orchestrator", orchestratorVersion);
check("openwork-server", serverVersion);
check("opencode-router", opencodeRouterVersion);

if (mismatches.length) {
  console.error(`Release tag ${tag} does not match package versions:`);
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
  process.exit(1);
}

console.log(`Release tag ${tag} matches all release package versions.`);
