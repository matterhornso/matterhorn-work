import { execSync } from "node:child_process";

execSync("pnpm --filter @matterhorn-work/desktop build", { stdio: "inherit" });

// The desktop build intentionally emits file://-compatible relative asset URLs.
// Finish the aggregate build with the browser bundle so apps/app/dist is safe to
// serve at deep workspace routes during web deployment and certification.
execSync("pnpm --filter @matterhorn-work/app build:web", { stdio: "inherit" });
