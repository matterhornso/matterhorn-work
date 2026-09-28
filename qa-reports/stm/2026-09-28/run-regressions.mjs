// Run existing repository gates without passing the operator's credentials or
// home/data roots. Logs are disposable local evidence, not live acceptance.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const stages = {
  server: ["--dir", "apps/server", "test"],
  app: ["--dir", "apps/app", "test"],
  safety: ["test:matterhorn-platform-safety"],
  "app-typecheck": ["--dir", "apps/app", "typecheck"],
  "app-build": ["--dir", "apps/app", "build"],
  "server-build": ["--dir", "apps/server", "build"],
};
const stage = process.argv[2];
const args = stages[stage];
const pnpm = process.env.STM_QA_PNPM;
const bun = process.env.STM_QA_BUN;
if (!args || !pnpm?.startsWith("/") || !bun?.startsWith("/")) {
  throw new Error("Choose a stage and supply absolute STM_QA_PNPM and STM_QA_BUN paths");
}
const root = await mkdtemp(join(tmpdir(), `matterhorn-stm-${stage}-`));
for (const folder of ["home", "tmp", "bin", "data", "config", "cache", "state"]) await mkdir(join(root, folder));
// Nested package scripts also need the repository-pinned pnpm, not global pnpm 9.
await writeFile(join(root, "bin", "pnpm"), `#!/usr/bin/env node\nconst {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,[${JSON.stringify(pnpm)},...process.argv.slice(2)],{stdio:'inherit'});process.exit(r.status??1);\n`, { mode: 0o700 });
const logPath = join(root, "result.log");
const output = createWriteStream(logPath, { mode: 0o600 });
const child = spawn(process.execPath, [pnpm, ...args], { cwd: repo, stdio: ["ignore", "pipe", "pipe"], env: {
  PATH: [join(root, "bin"), dirname(process.execPath), dirname(bun), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
  HOME: join(root, "home"), TMPDIR: join(root, "tmp"),
  XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
  CI: "1", NODE_ENV: "test", MATTERHORN_WORK_STM_ENABLED: "0",
  // HOME/XDG isolate defaults. Do not override application stores globally:
  // tests deliberately select distinct per-fixture paths (including legacy
  // aliases), and a higher-precedence override would collapse their isolation.
} });
child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
console.log(JSON.stringify({ stage, pid: child.pid, root, logPath }));
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", code => output.end(() => resolve(code ?? 1)));
});
const log = await readFile(logPath, "utf8");
console.log(JSON.stringify({ stage, code, logPath, tail: log.slice(-2000) }));
process.exitCode = code;
