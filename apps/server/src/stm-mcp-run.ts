#!/usr/bin/env bun
import { dirname, join } from "node:path";
import { StmError, StmMcpLaunches } from "@matterhorn-work/stm-credentials";
import { resolveDefaultEnvStorePath } from "./env-file.js";
import { createLocalStmCredentials } from "./stm-runtime.js";
import { authorizeConfiguredStmMcp } from "./stm-mcp.js";

// Dedicated stdio entry point: stdout belongs exclusively to MCP. Never forward
// native errors, provider values, or child stderr into application/support logs.
// Source Node/Bun runtimes use this entry; packaged launcher selection must be
// supplied by the trusted shell, not by a workspace or by a renderer.
export async function runStmMcp(args: string[]) {
  if (args.length !== 1) throw new StmError("invalid_launch_grant");
  const launches = new StmMcpLaunches({ credentials: createLocalStmCredentials({ host: "127.0.0.1" }),
    registryPath: join(dirname(resolveDefaultEnvStorePath()), "stm-mcp-launches.json") });
  const child = await launches.start(args[0], { cwd: process.cwd(), authorize: authorizeConfiguredStmMcp });
  child.stderr?.resume();
  process.stdin.pipe(child.stdin!);
  child.stdout?.pipe(process.stdout);
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (escalation) return;
    child.kill("SIGTERM");
    escalation = setTimeout(() => child.kill("SIGKILL"), 1500);
    escalation.unref();
  };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  process.stdin.on("end", stop);
  process.stdin.on("error", stop); process.stdout.on("error", stop);
  child.stdin?.on("error", stop); child.stdout?.on("error", stop);
  const code = child.exitCode !== null ? child.exitCode : child.signalCode !== null ? 1
    : await new Promise<number>(resolve => child.once("close", code => resolve(code ?? 1)));
  if (escalation) clearTimeout(escalation);
  process.off("SIGTERM", stop); process.off("SIGINT", stop); process.stdin.off("end", stop);
  process.stdin.off("error", stop); process.stdout.off("error", stop);
  child.stdin?.off("error", stop); child.stdout?.off("error", stop);
  process.stdin.unpipe(); process.stdin.pause();
  // Let the serialized exit acknowledgement finish before the wrapper exits.
  // On an unsafe registry or failed write, leave its active record fail-closed.
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await launches.list()).find(grant => grant.id === args[0])?.active) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return code;
}

// Imported only by the dedicated runtime entry point; no server boot or daemon
// auto-launch. The one fixed error does not include CLI arguments or file paths.
