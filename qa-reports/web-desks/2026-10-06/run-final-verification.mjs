import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(outputDirectory, "../../..");
const frontendOnly = process.argv.length === 3 && process.argv[2] === "--frontend-only";
const suiOnly = process.argv.length === 3 && process.argv[2] === "--sui-only";
const approvalOnly = process.argv.length === 3 && process.argv[2] === "--approval-only";
if (process.argv.length > 2 && !frontendOnly && !suiOnly && !approvalOnly) throw new Error("Only --frontend-only, --sui-only or --approval-only is supported.");
const suffix = frontendOnly ? "-frontend-rerun" : suiOnly ? "-sui-projection" : approvalOnly ? "-approval-status" : "";
const scratch = await mkdtemp("/private/tmp/matterhorn-final-verification-");
const bin = join(scratch, "bin");
const buildOutput = join(scratch, "web-build");
await mkdir(bin, { mode: 0o700 });
await writeFile(join(bin, "bun"), '#!/bin/sh\nexec /Users/abhinavramesh/.bun/bin/bun --no-env-file "$@"\n', { mode: 0o700 });
const environment = {
  PATH: `${bin}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: "en_US.UTF-8", TZ: "UTC", CI: "1", NO_COLOR: "1",
  NPM_CONFIG_USERCONFIG: "/dev/null", NPM_CONFIG_GLOBALCONFIG: "/dev/null",
};
const startedAt = new Date().toISOString();
const results = [];
async function check(id, command, cwd = repository, env = environment) {
  console.log(`Starting ${id}`);
  const started = Date.now();
  const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const retained = [];
  let bytes = 0;
  let omittedLines = 0;
  function record(line) {
    const clean = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim()
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/\b(?:sk|owt|ghp)[-_][A-Za-z0-9_-]{12,}/g, "[redacted]")
      .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[redacted]")
      .replaceAll(repository, "<repository>").slice(0, 800);
    if (!/^(?:\d+ (?:pass|fail|skip|expect\(\) calls)|Ran \d+ tests|\(fail\)|not ok |Matterhorn |Stages:|- (?:PASS|FAIL|SKIP)|.*error TS\d|(?:error|Error|ERROR|AssertionError)(?:\s|:|\[)|ERR_PNPM_|✓|\(!\)|.*Build success|.*built in)/.test(clean)
      || bytes + clean.length > 24_000) { omittedLines += 1; return; }
    retained.push(clean); bytes += clean.length + 1;
  }
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8"); let buffered = "";
    stream.on("data", chunk => {
      const lines = `${buffered}${chunk}`.split(/\r?\n/); buffered = lines.pop() ?? "";
      lines.forEach(record);
    });
    stream.on("end", () => { if (buffered) record(buffered); });
  }
  const outcome = await new Promise(complete => {
    child.on("error", () => complete({ exitCode: 1, signal: null, spawnError: true }));
    child.on("close", (exitCode, signal) => complete({ exitCode: exitCode ?? 1, signal }));
  });
  const log = `final-${id}${suffix}.log`;
  await writeFile(join(outputDirectory, log), `${retained.join("\n")}\n`, { mode: 0o600 });
  const result = { id, command, ...outcome, durationMs: Date.now() - started, log, retainedBytes: bytes, omittedLines };
  results.push(result); console.log(JSON.stringify(result)); return result;
}
const frontendCommand = ["bun", "test", "apps/app/tests", "apps/server/src/managed-opencode-mcp.test.ts", "apps/server/src/agent-token-budget.test.ts", "apps/server/src/bittensor-chat-routes.e2e.test.ts"];
if (approvalOnly) {
  await Promise.all([
    check("approval-session-safety", ["bun", "test", "apps/server/src/approvals.test.ts", "apps/server/src/session-read-model.e2e.test.ts", "apps/app/tests/session-approval-status-client.test.ts"]),
    check("server-typecheck", ["pnpm", "--dir", "apps/server", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]),
    check("app-typecheck", ["pnpm", "--dir", "apps/app", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]),
  ]);
} else if (suiOnly) {
  await Promise.all([
    check("sui-mcp-safety", ["bun", "test", "apps/server/src/managed-opencode-mcp.test.ts", "apps/server/src/tools/sui.test.ts", "apps/server/src/agent-token-budget.test.ts", "apps/server/src/agent-capability.test.ts", "apps/server/src/guarded-agent-runtime.test.ts"]),
    check("server-typecheck", ["pnpm", "--dir", "apps/server", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]),
  ]);
} else if (frontendOnly) {
  await check("frontend-mcp", frontendCommand);
} else {
  const sdk = await check("sdk-build", ["pnpm", "--dir", "packages/crypto-app-sdk", "build"]);
  const ui = await check("ui-build", ["pnpm", "--dir", "packages/ui", "build"]);
  if (sdk.exitCode === 0 && ui.exitCode === 0) {
  await Promise.all([
    check("server-typecheck", ["pnpm", "--dir", "apps/server", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]),
    check("app-typecheck", ["pnpm", "--dir", "apps/app", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]),
    check("frontend-mcp", frontendCommand),
    check("bittensor-gate", ["pnpm", "smoke:bittensor-beta"]),
  ]);
  const buildCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, env: environment, encoding: "utf8" }).trim();
  const buildEnvironment = { ...environment, VITE_MATTERHORN_DEPLOYMENT: "web", VITE_MATTERHORN_PUBLIC_BETA: "1",
    VITE_MATTERHORN_REQUIRE_SIGNIN: "true", VITE_MATTERHORN_CLOUD_ENABLED: "true", VITE_MATTERHORN_BUILD_COMMIT: buildCommit };
  const web = await check("web-build", ["pnpm", "exec", "vite", "build", "--outDir", buildOutput], join(repository, "apps/app"), buildEnvironment);
  if (web.exitCode === 0) {
    const { buildPublicGuides } = await import(pathToFileURL(join(repository, "apps/app/scripts/build-public-guides.mjs")).href);
    const guides = await buildPublicGuides({ outDir: buildOutput, env: buildEnvironment });
    results.push({ id: "public-guides", exitCode: 0, pages: guides.pages, indexable: guides.indexable });
  }
  }
}
const report = { version: "matterhorn.final-source-verification.v1", startedAt, completedAt: new Date().toISOString(),
  environment: { inheritedVariables: false, bunEnvAutoload: false, credentials: "none supplied" },
  existingPreviewOutputsModified: false, buildOutput: frontendOnly || suiOnly || approvalOnly ? null : buildOutput, results, passed: results.every(result => result.exitCode === 0) };
const resultFile = `final-verification${suffix}-result.json`;
await writeFile(join(outputDirectory, resultFile), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ passed: report.passed, result: resultFile, buildOutput: report.buildOutput }));
process.exitCode = report.passed ? 0 : 1;
