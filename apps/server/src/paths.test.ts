import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveWithinRoot } from "./paths.js";

describe("resolveWithinRoot", () => {
  test("keeps existing and future paths inside the canonical root", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "matterhorn-path-root-"));
    const workspaceRoot = join(fixtureRoot, "workspace");
    await mkdir(workspaceRoot);

    try {
      const canonicalRoot = await realpath(workspaceRoot);
      expect(await resolveWithinRoot(workspaceRoot)).toBe(canonicalRoot);
      expect(await resolveWithinRoot(workspaceRoot, "reports", "future.json")).toBe(
        join(canonicalRoot, "reports", "future.json"),
      );
      await expect(resolveWithinRoot(workspaceRoot, "..", "outside.json")).rejects.toMatchObject({
        code: "path_escape",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects existing and future paths through an escaping symlink", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "matterhorn-path-link-"));
    const workspaceRoot = join(fixtureRoot, "workspace");
    const outsideRoot = join(fixtureRoot, "outside");
    await mkdir(workspaceRoot);
    await mkdir(outsideRoot);
    await symlink(outsideRoot, join(workspaceRoot, "linked"), process.platform === "win32" ? "junction" : "dir");

    try {
      await expect(resolveWithinRoot(workspaceRoot, "linked", "future.json")).rejects.toMatchObject({
        code: "path_escape",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
