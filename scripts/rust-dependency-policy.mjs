import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function validateRustDependencyGraph(output) {
  if (typeof output !== "string" || !/^microsandbox-openwork-rust v/m.test(output)) {
    throw new Error("Rust dependency graph is missing or incomplete; cannot grant advisory exceptions.");
  }
  if (/^rsa v/m.test(output)) {
    throw new Error("RUSTSEC-2023-0071 is reachable and may not be ignored.");
  }
  if (/^lru v0\.16\.3(?:\s|$)/m.test(output)) {
    throw new Error("RUSTSEC-2026-0253 is reachable through lru 0.16.3.");
  }
  for (const match of output.matchAll(/^rustls v0\.23\.(\d+)(?:\s|$)/gm)) {
    const patch = Number(match[1]);
    if (patch >= 13 && patch < 45) {
      throw new Error("RUSTSEC-2026-0285 requires rustls 0.23.45 or later in the 0.23 line.");
    }
  }
}

export function checkRustDependencyPolicy(run = spawnSync) {
  // Resolve the whole graph first. A failed cargo command must never look like
  // an absent dependency, particularly when granting a lock-only exception.
  const result = run("cargo", [
    "tree", "--locked", "--target", "all", "--prefix", "none",
    "--manifest-path", "examples/microsandbox-openwork-rust/Cargo.toml",
  ], { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Could not resolve the locked Rust dependency graph; security verification failed closed.");
  }
  validateRustDependencyGraph(result.stdout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkRustDependencyPolicy();
    console.log("Locked Rust dependency policy passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
