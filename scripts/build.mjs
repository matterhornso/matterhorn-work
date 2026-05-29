import { execSync } from "node:child_process";

execSync("pnpm --filter @matterhorn-work/desktop build", { stdio: "inherit" });
