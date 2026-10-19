import { readFile } from "node:fs/promises";
import { downloadVerifiedOfficialOpencode } from "../../orchestrator/src/opencode-download.js";
import type { SidecarTarget } from "../../orchestrator/src/sidecar-download.js";

export function sidecarTarget(triple: string): SidecarTarget {
  switch (triple) {
    case "aarch64-apple-darwin": return "darwin-arm64";
    case "x86_64-apple-darwin": return "darwin-x64";
    case "aarch64-unknown-linux-gnu": return "linux-arm64";
    case "x86_64-unknown-linux-gnu": return "linux-x64";
    case "aarch64-pc-windows-msvc": return "windows-arm64";
    case "x86_64-pc-windows-msvc": return "windows-x64";
    default: throw new Error("Unsupported OpenCode sidecar target");
  }
}

export function validateRepository(value: string | undefined): void {
  if (!value?.trim()) return;
  const normalized = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  if (normalized !== "anomalyco/opencode") {
    throw new Error("Desktop builds require the pinned official anomalyco/opencode release; custom repository downloads are unsupported");
  }
}

if (import.meta.main) {
  try {
    validateRepository(process.env.OPENCODE_GITHUB_REPO);
    validateRepository(process.env.OPENWORK_OPENCODE_GITHUB_REPO);
    const [triple, directory] = process.argv.slice(2);
    if (!triple || !directory) throw new Error("Expected target triple and private cache directory");
    const constants = JSON.parse(await readFile(new URL("../../../constants.json", import.meta.url), "utf8"));
    if (typeof constants.opencodeVersion !== "string") throw new Error("Pinned OpenCode version is missing");
    const binary = await downloadVerifiedOfficialOpencode({
      directory, target: sidecarTarget(triple), expectedVersion: constants.opencodeVersion.replace(/^v/, ""),
      assetOverride: process.env.OPENCODE_ASSET,
    });
    process.stdout.write(binary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "OpenCode verification failed");
    process.exitCode = 1;
  }
}
