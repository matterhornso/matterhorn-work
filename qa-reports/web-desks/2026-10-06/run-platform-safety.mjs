import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This QA runner changes no assertions or fixture configuration. Only the
// invocation environment and retained diagnostic output are constrained.
const outputDirectory = dirname(fileURLToPath(import.meta.url));
const repository = await realpath(resolve(outputDirectory, "../../.."));
const selection = process.argv.slice(2);
if (selection.length && (selection.length !== 2 || selection[0] !== "--only"
  || !/^[a-z.]+(?:,[a-z.]+)*$/.test(selection[1]))) {
  throw new Error("Only an optional --only stage-id list is supported.");
}
const scratch = await mkdtemp("/private/tmp/matterhorn-platform-safety-");
const bin = join(scratch, "bin");
await mkdir(bin, { mode: 0o700 });
const bunExecutable = "/Users/abhinavramesh/.bun/bin/bun";
await writeFile(join(bin, "bun"), `#!/bin/sh\nexec '${bunExecutable}' --no-env-file "$@"\n`, { mode: 0o700 });
const environment = {
  PATH: `${bin}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  LANG: "en_US.UTF-8",
  TZ: "UTC",
  CI: "1",
  NO_COLOR: "1",
  NPM_CONFIG_USERCONFIG: "/dev/null",
  NPM_CONFIG_GLOBALCONFIG: "/dev/null",
};
const startedAt = new Date().toISOString();
const suffix = selection.length ? `-${selection[1].replaceAll(",", "-")}` : "";
const retained = [];
let omittedLines = 0;
let outputLines = 0;
let retainedBytes = 0;
let stage = "starting";
const redact = (line) => line
  .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
  .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  .replace(/\b(?:sk|owt|mcp|ghp)[-_][A-Za-z0-9_-]{12,}/g, "[redacted]")
  .replace(/\b(?:0x)?[a-fA-F0-9]{48,}\b/g, "[redacted-hex]")
  .replace(/([?&](?:token|secret|key|password)=)[^&\s]+/gi, "$1[redacted]")
  .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[redacted]")
  .slice(0, 800);
function record(line) {
  outputLines += 1;
  const sanitized = redact(line).trim();
  const stageLine = /^(?:\[prepare\]|\[\d+\/\d+\])/.test(sanitized);
  if (stageLine) stage = sanitized;
  const keep = stageLine || /^(?:Matterhorn .*?(?:gate|smoke|readiness)|\d+ (?:pass|fail|skip|expect\(\) calls|tests failed)|Ran \d+ tests|\(fail\)|not ok |# (?:tests|pass|fail|cancelled|skipped|duration_ms)|(?:error|Error|ERROR|AssertionError)(?:\s|:|\s*\[)|ERR_PNPM_|- (?:PASS|FAIL|SKIP) )/.test(sanitized);
  if (!keep || retainedBytes + sanitized.length + 1 > 64_000) { omittedLines += 1; return; }
  retained.push(sanitized);
  retainedBytes += sanitized.length + 1;
  if (stageLine || /gate (?:passed|failed)|^\(fail\)|^not ok |^- FAIL/.test(sanitized)) console.log(sanitized);
}
const child = spawn("/opt/homebrew/bin/pnpm", ["test:matterhorn-platform-safety", ...selection], {
  cwd: repository, env: environment, stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  let buffered = "";
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) record(line);
  });
  stream.on("end", () => { if (buffered) record(buffered); });
}
const outcome = await new Promise((complete) => {
  child.on("error", () => complete({ exitCode: 1, signal: null, spawnError: true }));
  child.on("close", (exitCode, signal) => complete({ exitCode: exitCode ?? 1, signal }));
});
const report = {
  version: "matterhorn.platform-safety-qa.v1", startedAt, completedAt: new Date().toISOString(),
  command: ["pnpm", "test:matterhorn-platform-safety", ...selection],
  environment: { inheritedVariables: false, inheritedMatterhornOverrides: false, bunEnvAutoload: false, credentials: "none supplied", fixtureOverrides: "none" },
  ...outcome, finalStage: stage, outputLines, omittedLines, retainedBytes,
  log: `platform-safety${suffix}.log`,
  note: "Only bounded sanitized stage/test summaries are retained; no raw payload log is saved. Gate assertions and commands are unchanged.",
};
await writeFile(join(outputDirectory, report.log), `${retained.join("\n")}\n`, { mode: 0o600 });
await writeFile(join(outputDirectory, `platform-safety${suffix}-result.json`), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report));
process.exitCode = outcome.exitCode;
