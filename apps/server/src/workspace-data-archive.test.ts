import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMatterhornWorkspaceArchive,
  WorkspaceArchiveLimitError,
} from "./workspace-data-archive.js";
import type { WorkspaceInfo } from "./types.js";

const roots: string[] = [];
const previousMaxBytes = process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES;
const previousMaxFileBytes =
  process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILE_BYTES;

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
  if (previousMaxBytes === undefined) {
    delete process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES;
  } else {
    process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES = previousMaxBytes;
  }
  if (previousMaxFileBytes === undefined) {
    delete process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILE_BYTES;
  } else {
    process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILE_BYTES =
      previousMaxFileBytes;
  }
});

async function fixtureWorkspace(): Promise<WorkspaceInfo> {
  const path = await mkdtemp(join(tmpdir(), "matterhorn-workspace-archive-"));
  roots.push(path);
  return {
    id: "ws_archive",
    name: "Archive workspace",
    path,
    preset: "starter",
    workspaceType: "local",
  };
}

describe("workspace data archive", () => {
  test("packages structured workspace data and text or binary outputs losslessly", async () => {
    const workspace = await fixtureWorkspace();
    await mkdir(join(workspace.path, "outputs", "research"), {
      recursive: true,
    });
    await writeFile(
      join(workspace.path, "outputs", "research", "summary.md"),
      "# Research summary\n",
    );
    await writeFile(
      join(workspace.path, "outputs", "research", "chart.bin"),
      Buffer.from([0, 255, 4, 8]),
    );

    const result = await buildMatterhornWorkspaceArchive({
      workspace,
      configuration: { opencode: {}, openwork: {} },
      notes: [{ id: "note_1", title: "Research note" }],
      memory: {
        records: [{ id: "memory_1", title: "Remembered decision" }],
        suggestions: [{ id: "suggestion_1", status: "pending" }],
      },
      chats: [
        {
          session: { id: "ses_1", title: "Research" },
          messages: [
            { info: { id: "msg_1" }, parts: [{ text: "Full transcript" }] },
          ],
          todos: [{ content: "Cite sources", status: "completed" }],
        },
      ],
      activity: { version: "matterhorn.project-data-ledger.v1", items: [] },
    });

    expect(result.filename).toMatch(
      /^matterhorn-workspace-Archive-workspace-\d{4}-\d{2}-\d{2}\.json\.gz$/,
    );
    expect(result.contentType).toBe("application/gzip");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.counts).toEqual({
      notes: 1,
      memoryRecords: 1,
      memorySuggestions: 1,
      chats: 1,
      messages: 1,
      files: 2,
    });

    const archive = JSON.parse(gunzipSync(result.compressed).toString("utf8"));
    expect(archive.version).toBe("matterhorn.workspace-data-archive.v1");
    expect(result.sha256).toBe(
      createHash("sha256").update(result.compressed).digest("hex"),
    );
    expect(archive.manifest.integrity).toEqual({
      algorithm: "sha256",
      dataSha256: createHash("sha256")
        .update(JSON.stringify(archive.data))
        .digest("hex"),
    });
    expect(archive.manifest.limits.behavior).toContain(
      "fails instead of truncating",
    );
    expect(archive.manifest.redaction.userContent).toContain(
      "exported as stored",
    );
    expect(archive.data.chats[0].messages[0].parts[0].text).toBe(
      "Full transcript",
    );
    expect(archive.data.files).toEqual([
      expect.objectContaining({
        path: "outputs/research/chart.bin",
        encoding: "base64",
        content: Buffer.from([0, 255, 4, 8]).toString("base64"),
      }),
      expect.objectContaining({
        path: "outputs/research/summary.md",
        encoding: "utf8",
        content: "# Research summary\n",
      }),
    ]);
  });

  test("fails explicitly instead of omitting an oversized file", async () => {
    process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_BYTES = String(1024 * 1024);
    process.env.MATTERHORN_WORKSPACE_ARCHIVE_MAX_FILE_BYTES = "1024";
    const workspace = await fixtureWorkspace();
    await mkdir(join(workspace.path, "outputs"), { recursive: true });
    await writeFile(
      join(workspace.path, "outputs", "oversized.bin"),
      Buffer.alloc(1025),
    );

    const result = buildMatterhornWorkspaceArchive({
      workspace,
      configuration: {},
      notes: [],
      memory: { records: [], suggestions: [] },
      chats: [],
      activity: {},
    });
    await expect(result).rejects.toBeInstanceOf(WorkspaceArchiveLimitError);
    await expect(result).rejects.toThrow("per-file safety limit");
  });

  test("sanitizes adversarial workspace names in linear time", async () => {
    const workspace = await fixtureWorkspace();
    workspace.name = `${"-".repeat(100_000)}Launch room${"!".repeat(100_000)}`;

    const result = await buildMatterhornWorkspaceArchive({
      workspace,
      configuration: {},
      notes: [],
      memory: { records: [], suggestions: [] },
      chats: [],
      activity: {},
    });

    expect(result.filename).toMatch(
      /^matterhorn-workspace-Launch-room-\d{4}-\d{2}-\d{2}\.json\.gz$/,
    );
  });

  test("never follows output symlinks outside the workspace", async () => {
    const workspace = await fixtureWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "matterhorn-archive-outside-"));
    roots.push(outside);
    await mkdir(join(workspace.path, "outputs"), { recursive: true });
    await writeFile(join(outside, "private.txt"), "outside workspace");
    await symlink(
      join(outside, "private.txt"),
      join(workspace.path, "outputs", "outside-link.txt"),
    );

    const result = await buildMatterhornWorkspaceArchive({
      workspace,
      configuration: {},
      notes: [],
      memory: { records: [], suggestions: [] },
      chats: [],
      activity: {},
    });
    const archive = JSON.parse(
      gunzipSync(result.compressed).toString("utf8"),
    );

    expect(archive.data.files).toEqual([]);
    expect(JSON.stringify(archive)).not.toContain("outside workspace");
  });

  test("never follows a symlinked output directory", async () => {
    const workspace = await fixtureWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "matterhorn-archive-root-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "private.txt"), "outside directory");
    await symlink(outside, join(workspace.path, "outputs"));

    const result = await buildMatterhornWorkspaceArchive({
      workspace,
      configuration: {},
      notes: [],
      memory: { records: [], suggestions: [] },
      chats: [],
      activity: {},
    });
    const archive = JSON.parse(
      gunzipSync(result.compressed).toString("utf8"),
    );

    expect(archive.data.files).toEqual([]);
    expect(JSON.stringify(archive)).not.toContain("outside directory");
  });
});
