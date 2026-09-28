#!/usr/bin/env bun

// Native server releases travel as one binary (including orchestrator downloads).
// Keep MCP stdio isolated: this branch must never import the HTTP server/CLI.
if (process.argv[2] === "--stm-mcp") {
  try {
    const { runStmMcp } = await import("./stm-mcp-run.js");
    process.exitCode = await runStmMcp(process.argv.slice(3));
  }
  catch {
    process.stderr.write("Matterhorn secret-backed tool could not start. Review its local setup.\n");
    process.exitCode = 1;
  }
} else {
  await import("./cli.js");
}
