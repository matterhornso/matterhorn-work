#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "matterhorn-bittensor-timeline-archive-"));
const source = join(root, "legacy-wallet-timeline.json");
const archive = join(root, "archive", "legacy.mhbtl");
const key = Buffer.alloc(32, 7).toString("base64");

try {
  const sensitive = JSON.stringify({ snapshots: [{ address: "5Legacy", balance: "42" }] });
  writeFileSync(source, sensitive);
  const overlap = spawnSync("node", [
    "scripts/bittensor-wallet-timeline-legacy-archive.mjs",
    "--source", source,
    "--output", source,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY: key },
  });
  assert.notEqual(overlap.status, 0);
  assert.match(overlap.stderr, /must not overwrite/);
  const result = spawnSync("node", [
    "scripts/bittensor-wallet-timeline-legacy-archive.mjs",
    "--source", source,
    "--output", archive,
    "--apply",
    "--confirm-source", source,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY: key },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).sourceRetired, true);
  assert.equal(existsSync(source), false);
  assert.equal(existsSync(`${source}.operator-archived`), true);
  assert.equal(readFileSync(archive).includes(Buffer.from("5Legacy")), false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Encrypted legacy Bittensor timeline archive contract passed.");
