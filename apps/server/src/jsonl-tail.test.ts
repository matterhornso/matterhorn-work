import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRecentJsonl } from "./jsonl-tail.js";

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("readRecentJsonl", () => {
  test("reads only a bounded tail of a 100k-line append-only log", async () => {
    const directory = mkdtempSync(join(tmpdir(), "matterhorn-jsonl-tail-"));
    directories.push(directory);
    const path = join(directory, "events.jsonl");
    const lines = Array.from({ length: 100_000 }, (_, index) => JSON.stringify({ index }));
    await writeFile(path, `${lines.join("\n")}\n`, "utf8");

    const file = await stat(path);
    const result = await readRecentJsonl<{ index: number }>(path, 50);

    expect(result.items).toHaveLength(50);
    expect(result.items[0]?.index).toBe(99_999);
    expect(result.items[49]?.index).toBe(99_950);
    expect(result.bytesRead).toBeLessThan(file.size / 10);
  });

  test("skips malformed tail entries while preserving newest-first order", async () => {
    const directory = mkdtempSync(join(tmpdir(), "matterhorn-jsonl-tail-"));
    directories.push(directory);
    const path = join(directory, "events.jsonl");
    await writeFile(path, '{"index":1}\nnot-json\n{"index":2}\n', "utf8");

    const result = await readRecentJsonl<{ index: number }>(path, 2, 1024);

    expect(result.items.map((item) => item.index)).toEqual([2, 1]);
  });
});
