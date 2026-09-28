#!/usr/bin/env bun
import { runStmMcp } from "./stm-mcp-run.js";

runStmMcp(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  process.stderr.write("Matterhorn secret-backed tool could not start. Review its local setup.\n");
  process.exitCode = 1;
});
