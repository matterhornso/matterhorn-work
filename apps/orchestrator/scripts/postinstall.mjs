#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import os from "node:os"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const rootDir = dirname(fileURLToPath(import.meta.url))
const platform = os.platform() === "win32" ? "windows" : os.platform()
const pkg = `openwork-orchestrator-${platform}-${os.arch()}`
const extension = platform === "windows" ? ".exe" : ""

try {
  const own = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))
  const packagePath = require.resolve(`${pkg}/package.json`)
  const installed = JSON.parse(readFileSync(packagePath, "utf8"))
  if (typeof own.version !== "string" || !own.version || installed.version !== own.version) {
    throw new Error("Platform package version does not match")
  }
  const hasBinary = ["matterhorn-work", "openwork"].some((name) => {
    try { return lstatSync(join(dirname(packagePath), "bin", `${name}${extension}`)).isFile() }
    catch { return false }
  })
  if (!hasBinary) throw new Error("Platform package binary is missing")
  console.log(`matterhorn-work-orchestrator: verified installed platform package: ${pkg}`)
} catch {
  // The package manager owns download integrity. Never fetch executable bytes
  // independently or reuse an unverified dist/bin left by an older installer.
  console.error(
    `matterhorn-work-orchestrator: matching platform package ${pkg} is missing or incomplete.\n` +
      `Reinstall openwork-orchestrator with optional dependencies enabled and the same pinned version.\n` +
      `Network fallback downloads and legacy dist/bin binaries are no longer supported.`,
  )
  process.exitCode = 1
}
