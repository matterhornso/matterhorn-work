#!/usr/bin/env node
/**
 * Matterhorn Customer Workflow Template Registry
 *
 * Thin entry point that emits the canonical customer-facing workflow templates.
 * The canonical data lives in the workflow catalog helper so there is one source
 * of truth for customer template metadata.
 *
 * Usage:
 *   node scripts/matterhorn-workflow-template-registry.mjs [--json]
 *   node scripts/matterhorn-workflow-template-registry.mjs --json
 *   node scripts/matterhorn-workflow-template-registry.mjs --category markets --json
 *   node scripts/matterhorn-workflow-template-registry.mjs --status preview_only --json
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const args = process.argv.slice(2);
for (const item of args) {
  const key = item.split("=")[0] || item;
  if (FORBIDDEN_ARG_RE.test(key)) {
    process.stderr.write(`Forbidden credential-shaped flag ${key} is not accepted by the Matterhorn workflow template registry.\n`);
    process.exit(1);
  }
}

const catalogArgs = ["--customer-templates", ...args];
if (!args.includes("--json")) {
  catalogArgs.push("--json");
}

const result = spawnSync(process.execPath, [join(__dirname, "matterhorn-workflow-catalog.mjs"), ...catalogArgs], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
  stdio: "pipe",
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 0);
