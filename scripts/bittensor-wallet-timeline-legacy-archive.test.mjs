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
  const occupiedArchive = join(root, "occupied.mhbtl");
  writeFileSync(occupiedArchive, "operator-owned");
  const occupied = spawnSync("node", [
    "scripts/bittensor-wallet-timeline-legacy-archive.mjs",
    "--source", source,
    "--output", occupiedArchive,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY: key },
  });
  assert.notEqual(occupied.status, 0);
  assert.match(occupied.stderr, /output already exists/);
  assert.equal(readFileSync(occupiedArchive, "utf8"), "operator-owned");

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

  const secondSource = join(root, "second-wallet-timeline.json");
  const secondRetired = `${secondSource}.operator-archived`;
  const secondArchive = join(root, "archive", "second.mhbtl");
  writeFileSync(secondSource, sensitive);
  writeFileSync(secondRetired, "existing-operator-archive");
  const retiredOccupied = spawnSync("node", [
    "scripts/bittensor-wallet-timeline-legacy-archive.mjs",
    "--source", secondSource,
    "--output", secondArchive,
    "--apply",
    "--confirm-source", secondSource,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MATTERHORN_LEGACY_TIMELINE_ARCHIVE_KEY: key },
  });
  assert.notEqual(retiredOccupied.status, 0);
  assert.match(retiredOccupied.stderr, /retired source destination already exists/);
  assert.equal(existsSync(secondSource), true);
  assert.equal(readFileSync(secondRetired, "utf8"), "existing-operator-archive");
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Encrypted legacy Bittensor timeline archive contract passed.");
