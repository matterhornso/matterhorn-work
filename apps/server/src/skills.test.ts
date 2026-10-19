import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deleteSkill, listSkills, upsertSkill } from "./skills.js";

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
  test("saves a same-name legacy custom skill as a local copy without changing its source", async () => {
    const workspaceRoot = await makeWorkspace();
    const name = "matterhorn-evidence-and-safety";
    const directory = join(workspaceRoot, ".claude", "skills", name);
    const path = join(directory, "SKILL.md");
    const content = `---\nname: ${name}\ndescription: Existing custom guidance\n---\nUser-owned instructions.\n`;
    await mkdir(directory, { recursive: true });
    await writeFile(path, content, "utf8");
    expect((await listSkills(workspaceRoot, false)).find((item) => item.name === name)).toMatchObject({ path });

    await expect(deleteSkill(workspaceRoot, name)).rejects.toThrow("Built-in guidance is read-only");
    const saved = await upsertSkill(workspaceRoot, { name, description: "Edited custom guidance", content: "Edited instructions." });
    expect(saved).toEqual({ path: join(workspaceRoot, ".opencode", "skills", name, "SKILL.md"), action: "added" });
    expect(await readFile(saved.path, "utf8")).toContain("Edited instructions.");
    expect(await readFile(path, "utf8")).toBe(content);
    expect((await listSkills(workspaceRoot, false)).find((item) => item.name === name)?.builtin).toBeUndefined();

    await deleteSkill(workspaceRoot, name);
    expect(await readFile(path, "utf8")).toBe(content);
    expect((await listSkills(workspaceRoot, false)).find((item) => item.name === name)?.path).toBe(path);
  });

  test("does not let virtual guidance or malformed legacy content authorize a local copy", async () => {
    const workspaceRoot = await makeWorkspace();
    const name = "matterhorn-evidence-and-safety";
    const payload = { name, description: "Attempted override", content: "Not a custom source." };
    await expect(upsertSkill(workspaceRoot, payload)).rejects.toThrow("Built-in guidance is read-only");
    const directory = join(workspaceRoot, ".claude", "skills", name);
    const path = join(directory, "SKILL.md");
    await mkdir(directory, { recursive: true });
    const malformed = "---\nmalformed: [\n";
    await writeFile(path, malformed, "utf8");
    await expect(upsertSkill(workspaceRoot, payload)).rejects.toThrow("Built-in guidance is read-only");
    expect(await readFile(path, "utf8")).toBe(malformed);
    expect(await readdir(join(workspaceRoot, ".opencode", "skills"))).toEqual([]);
    for (const invalidName of ["../matterhorn-evidence-and-safety", "matterhorn-evidence-and-safety/../other", "/absolute"]) {
      await expect(upsertSkill(workspaceRoot, { ...payload, name: invalidName })).rejects.toThrow("Skill name must be kebab-case");
    }
  });

  test("does not follow a destination symlink when saving a discovered custom copy", async () => {
    const workspaceRoot = await makeWorkspace();
    const name = "matterhorn-evidence-and-safety";
    const sourceDirectory = join(workspaceRoot, ".claude", "skills", name);
    const sourcePath = join(sourceDirectory, "SKILL.md");
    const content = `---\nname: ${name}\ndescription: Existing custom guidance\n---\nUser-owned instructions.\n`;
    const externalDirectory = join(workspaceRoot, "external-skill-source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(sourcePath, content, "utf8");
    await mkdir(externalDirectory);
    await symlink(externalDirectory, join(workspaceRoot, ".opencode", "skills", name));
    await expect(upsertSkill(workspaceRoot, { name, description: "Edited guidance", content: "Must not escape." })).rejects.toThrow("Built-in guidance is read-only");
    expect(await readdir(externalDirectory)).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe(content);
  });

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

    expect(skills.filter((item) => !item.builtin)).toEqual([
      {
        name: "good",
        description: "Use when validating the skills list.",
        path: join(workspaceRoot, ".opencode", "skills", "good", "SKILL.md"),
        scope: "project",
        trigger: "Good skill trigger.",
        userInvocable: true,
      },
    ]);
  });

  test("preserves an explicit customer-facing invocation boundary", async () => {
    const workspaceRoot = await makeWorkspace();
    await mkdir(join(workspaceRoot, ".opencode", "skills", "maintainer-only"), { recursive: true });
    await writeFile(
      join(workspaceRoot, ".opencode", "skills", "maintainer-only", "SKILL.md"),
      [
        "---",
        "name: maintainer-only",
        "description: Internal release maintenance only.",
        "user-invocable: false",
        "---",
        "# When to use",
        "- Engineering release maintenance.",
        "",
      ].join("\n"),
      "utf8",
    );

    const [skill] = await listSkills(workspaceRoot, false);
    expect(skill?.userInvocable).toBe(false);
  });
});
