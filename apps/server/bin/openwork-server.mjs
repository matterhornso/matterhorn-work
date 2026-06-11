#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const canonicalWrapper = fileURLToPath(new URL("./matterhorn-work-server.mjs", import.meta.url));
const result = spawnSync(process.execPath, [canonicalWrapper, ...process.argv.slice(2)], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
