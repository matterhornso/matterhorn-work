import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const commitPattern = /^[a-f0-9]{40}$/i;
const gitCommitResult = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const buildCommitSource = [
  ["VITE_MATTERHORN_BUILD_COMMIT", process.env.VITE_MATTERHORN_BUILD_COMMIT],
  ["VERCEL_GIT_COMMIT_SHA", process.env.VERCEL_GIT_COMMIT_SHA],
  ["MATTERHORN_BUILD_COMMIT", process.env.MATTERHORN_BUILD_COMMIT],
  ["git rev-parse HEAD", gitCommitResult.status === 0 ? gitCommitResult.stdout : ""],
]
  .map(([name, value]) => [name, value?.trim().toLowerCase() ?? ""])
  .find(([, value]) => value.length > 0);
const buildCommit = buildCommitSource?.[1] ?? "";

if (!commitPattern.test(buildCommit)) {
  throw new Error(
    `${buildCommitSource?.[0] ?? "VITE_MATTERHORN_BUILD_COMMIT"} must provide a full 40-character release commit.`,
  );
}

const result = spawnSync(pnpm, ["exec", "vite", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_MATTERHORN_DEPLOYMENT:
      process.env.VITE_MATTERHORN_DEPLOYMENT?.trim() || "web",
    VITE_MATTERHORN_PUBLIC_BETA:
      process.env.VITE_MATTERHORN_PUBLIC_BETA?.trim() || "1",
    VITE_MATTERHORN_REQUIRE_SIGNIN:
      process.env.VITE_MATTERHORN_REQUIRE_SIGNIN?.trim() || "true",
    VITE_MATTERHORN_CLOUD_ENABLED:
      process.env.VITE_MATTERHORN_CLOUD_ENABLED?.trim() || "true",
    VITE_MATTERHORN_BUILD_COMMIT: buildCommit,
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
