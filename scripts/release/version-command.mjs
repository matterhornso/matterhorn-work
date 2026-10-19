import { execFileSync } from "node:child_process";

export function assertReleaseVersion(version) {
  if (typeof version !== "string" || version.length > 100 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Package version must be a release version");
  }
  return version;
}

export function runVersionCommand(step, version, { cwd, dryRun = false, log = console.log, execute = execFileSync } = {}) {
  assertReleaseVersion(version);
  const args = step === "commit" ? ["commit", "-m", `chore: bump version to ${version}`]
    : step === "tag" ? ["tag", `v${version}`] : null;
  if (!args) throw new Error("Unsupported release version command");
  if (dryRun) {
    log(`[dry-run] git ${args.map(arg => JSON.stringify(arg)).join(" ")}`);
    return "";
  }
  return execute("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}
