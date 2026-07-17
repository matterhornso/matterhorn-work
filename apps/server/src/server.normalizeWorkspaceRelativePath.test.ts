import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isSupportedWorkspaceTextFilePath,
  normalizeWorkspaceRelativePath,
  resolveSafeChildPath,
  resolveToyUiEnabled,
} from "./server.js";

describe("resolveToyUiEnabled", () => {
  test("keeps the legacy anonymous Toy UI disabled unless an operator explicitly enables it", () => {
    expect(resolveToyUiEnabled(undefined)).toBe(false);
    expect(resolveToyUiEnabled("")).toBe(false);
    expect(resolveToyUiEnabled("false")).toBe(false);
    expect(resolveToyUiEnabled("1")).toBe(true);
    expect(resolveToyUiEnabled("true")).toBe(true);
  });
});

describe("normalizeWorkspaceRelativePath", () => {
  test("accepts a plain workspace-relative path", () => {
    expect(normalizeWorkspaceRelativePath("notes.md", { allowSubdirs: true })).toBe("notes.md");
  });

  test("strips workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
    expect(normalizeWorkspaceRelativePath("workspace/dir/notes.md", { allowSubdirs: true })).toBe("dir/notes.md");
  });

  test("strips Workspace/<id>/ prefix from rendered artifact paths", () => {
    expect(normalizeWorkspaceRelativePath("Workspace/32423/reports/artifact-eval.md", { allowSubdirs: true })).toBe("reports/artifact-eval.md");
    expect(normalizeWorkspaceRelativePath("workspaces/demo/reports/artifact-eval.csv", { allowSubdirs: true })).toBe("reports/artifact-eval.csv");
  });

  test("strips /workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("/workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
    expect(normalizeWorkspaceRelativePath("//workspace/dir/notes.md", { allowSubdirs: true })).toBe("dir/notes.md");
  });

  test("strips ./workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("./workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
  });

  test("still rejects traversal after stripping prefixes", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/../secrets.md", { allowSubdirs: true })).toThrow();
    expect(() => normalizeWorkspaceRelativePath("/workspace/../secrets.md", { allowSubdirs: true })).toThrow();
  });

  test("still enforces allowSubdirs", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/dir/notes.md", { allowSubdirs: false })).toThrow();
  });

  test("treats workspace/ with no file as invalid", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/", { allowSubdirs: true })).toThrow();
    expect(() => normalizeWorkspaceRelativePath("/workspace/", { allowSubdirs: true })).toThrow();
  });
});

describe("isSupportedWorkspaceTextFilePath", () => {
  test("accepts workspace text artifact extensions", () => {
    expect(isSupportedWorkspaceTextFilePath("reports/revenue.csv")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("reports/revenue.tsv")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("logs/run.log")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("config/app.yaml")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("styles/app.css")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("dist/index.html")).toBe(true);
  });

  test("keeps accepting OpenCode config/plugin text file extensions", () => {
    expect(isSupportedWorkspaceTextFilePath(".opencode/tools/cloud.ts")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath(".opencode/mcps/cloud.json")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath(".opencode/plugins/cloud.txt")).toBe(true);
  });

  test("rejects unsupported binary-like extensions", () => {
    expect(isSupportedWorkspaceTextFilePath(".opencode/plugins/cloud.bin")).toBe(false);
  });
});

describe("resolveSafeChildPath", () => {
  test("rejects existing and not-yet-created files reached through an escaping symlink", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "matterhorn-safe-child-"));
    const workspaceRoot = join(fixtureRoot, "workspace");
    const outsideRoot = join(fixtureRoot, "outside");
    await mkdir(workspaceRoot);
    await mkdir(outsideRoot);
    await symlink(outsideRoot, join(workspaceRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
    const canonicalWorkspaceRoot = await realpath(workspaceRoot);

    try {
      expect(() => resolveSafeChildPath(workspaceRoot, "linked/secret.txt")).toThrow(
        "Path traversal through a symbolic link is not allowed",
      );
      expect(resolveSafeChildPath(workspaceRoot, "reports/safe.txt")).toBe(
        join(canonicalWorkspaceRoot, "reports", "safe.txt"),
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
