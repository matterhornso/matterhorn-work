// Isolate QA from operator credentials and data. Never forward the ambient env.
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const stages = {
  tests: ["--dir", "apps/app", "test"],
  typecheck: ["--dir", "apps/app", "typecheck"],
  build: ["--dir", "apps/app", "build"],
  "build-web": ["--dir", "apps/app", "build"],
  "safety-ui": ["test:matterhorn-platform-safety", "--only", "wallet.approval.behavior,observability.error_boundaries,design.contract"],
  "safety-full": ["test:matterhorn-platform-safety"],
};
const [stage, flag = "1"] = process.argv.slice(2);
const pnpm = process.env.RETRO_QA_PNPM;
const bun = process.env.RETRO_QA_BUN;
if (!stages[stage] || !["0", "1"].includes(flag) || !pnpm?.startsWith("/") || !bun?.startsWith("/")) {
  throw new Error("Use tests|typecheck|build|build-web|safety-ui|safety-full 0|1 with absolute RETRO_QA_PNPM and RETRO_QA_BUN");
}
// Vite/Bun can read project env files even when the process env and HOME are
// isolated. Refuse their presence without opening or printing their contents.
for (const directory of [repo, join(repo, "apps/app")]) {
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local", ".env.test", ".env.test.local"]) {
    if (await access(join(directory, name)).then(() => true, () => false)) {
      throw new Error("QA isolation requires a checkout without local env files; none were read.");
    }
  }
}
const root = await mkdtemp("/private/tmp/matterhorn-retro-qa-");
for (const part of ["home", "tmp", "bin", "data", "config", "cache", "state"]) await mkdir(join(root, part));
await writeFile(join(root, "bin", "pnpm"), `#!/usr/bin/env node\nconst {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,[${JSON.stringify(pnpm)},...process.argv.slice(2)],{stdio:'inherit'});process.exit(r.status??1);\n`, { mode: 0o700 });
const logPath = join(root, `${stage}-${flag}.log`);
const output = createWriteStream(logPath, { mode: 0o600 });
// Pin nested lifecycle scripts too; global pnpm may be absent or a different version.
const child = spawn(process.execPath, [pnpm, ...stages[stage]], {
  cwd: repo, stdio: ["ignore", "pipe", "pipe"],
  env: {
    PATH: [join(root, "bin"), dirname(process.execPath), dirname(bun), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    HOME: join(root, "home"), TMPDIR: join(root, "tmp"),
    XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
    CI: "1", VITE_MATTERHORN_RETRO_UI: flag, MATTERHORN_WORK_STM_ENABLED: "0",
    ...(stage === "build-web" ? { VITE_MATTERHORN_DEPLOYMENT: "web", VITE_MATTERHORN_PUBLIC_BETA: "true" } : {}),
  },
});
child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
console.log(JSON.stringify({ stage, flag, logPath }));
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", code => output.end(() => resolve(code ?? 1)));
});
console.log(JSON.stringify({ stage, flag, code, logPath, tail: (await readFile(logPath, "utf8")).slice(-1800) }));
process.exitCode = code;
