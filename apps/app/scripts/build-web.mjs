import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
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
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
