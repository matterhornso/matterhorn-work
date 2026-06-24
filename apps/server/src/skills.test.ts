import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listSkills } from "./skills.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "matterhorn-skills-"));
  tempDirs.push(dir);
  await mkdir(join(dir, ".git"), { recursive: true });
  await mkdir(join(dir, ".opencode", "skills"), { recursive: true });
  return dir;
}

describe("skills", () => {
  test("skips malformed skill frontmatter without failing the full list", async () => {
    const workspaceRoot = await makeWorkspace();

    await mkdir(join(workspaceRoot, ".opencode", "skills", "good"), { recursive: true });
    await writeFile(
      join(workspaceRoot, ".opencode", "skills", "good", "SKILL.md"),
      [
        "---",
        "name: good",
        "description: Use when validating the skills list.",
        "---",
        "# When to use",
        "- Good skill trigger.",
        "",
      ].join("\n"),
      "utf8",
    );

    await mkdir(join(workspaceRoot, ".opencode", "skills", "broken"), { recursive: true });
    await writeFile(
      join(workspaceRoot, ".opencode", "skills", "broken", "SKILL.md"),
      [
        "---",
        "name: broken",
        "description: Design finalization: generates production-quality handoffs",
        "---",
        "# Broken",
        "",
      ].join("\n"),
      "utf8",
    );

    const skills = await listSkills(workspaceRoot, false);

    expect(skills).toEqual([
      {
        name: "good",
        description: "Use when validating the skills list.",
        path: join(workspaceRoot, ".opencode", "skills", "good", "SKILL.md"),
        scope: "project",
        trigger: "Good skill trigger.",
      },
    ]);
  });
});
