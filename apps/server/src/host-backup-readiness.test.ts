import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hostBackupFresh, MATTERHORN_HOST_BACKUP_VERSION } from "./host-backup-readiness.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function marker(capturedAt: string, overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-host-backup-ready-"));
  roots.push(root);
  mkdirSync(join(root, "backups"), { recursive: true });
  writeFileSync(join(root, "backups", "last-success.json"), JSON.stringify({
    version: MATTERHORN_HOST_BACKUP_VERSION,
    capturedAt,
    sha256: "a".repeat(64),
    ...overrides,
  }));
  return root;
}

describe("host backup readiness", () => {
  test("accepts a recent verified upload marker", () => {
    const now = Date.parse("2026-08-20T10:00:00.000Z");
    const root = marker("2026-08-20T09:00:00.000Z");
    expect(hostBackupFresh({ dataRoot: root, now, maxAgeMs: 2 * 60 * 60 * 1_000 })).toBe(true);
  });

  test("fails closed for missing, stale, future, malformed, or wrong-version markers", () => {
    const now = Date.parse("2026-08-20T10:00:00.000Z");
    const missing = mkdtempSync(join(tmpdir(), "matterhorn-host-backup-missing-"));
    roots.push(missing);
    expect(hostBackupFresh({ dataRoot: missing, now })).toBe(false);
    expect(hostBackupFresh({ dataRoot: marker("2026-08-18T10:00:00.000Z"), now })).toBe(false);
    expect(hostBackupFresh({ dataRoot: marker("2026-08-20T10:06:00.000Z"), now })).toBe(false);
    expect(hostBackupFresh({ dataRoot: marker("not-a-date"), now })).toBe(false);
    expect(hostBackupFresh({ dataRoot: marker("2026-08-20T09:00:00.000Z", { version: "wrong" }), now })).toBe(false);
  });
});
