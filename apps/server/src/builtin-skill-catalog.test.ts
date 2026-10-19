import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listBuiltinWorkspaceSkills, readBuiltinWorkspaceSkill, renderPreloadedWorkspaceSkill } from "./builtin-skill-catalog.js";
import { MATTERHORN_PRELOADED_WORKSPACE_SKILLS, getMatterhornBuiltinDeskGuidance } from "./builtin-workspace-skills.js";
import { deleteSkill, listSkills, readSkillContent, upsertSkill } from "./skills.js";
import { parseFrontmatter } from "./frontmatter.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-builtin-skills-"));
  roots.push(root);
  await mkdir(join(root, ".git"));
  return root;
}

describe("immutable built-in skill catalog", () => {
  test("lists seven read-only release documents without fake native slash commands", () => {
    const items = listBuiltinWorkspaceSkills();
    expect(items).toHaveLength(7);
    expect(new Set(items.map((item) => item.name)).size).toBe(7);
    for (const item of items) {
      expect(item).toMatchObject({ builtin: true, userInvocable: false, scope: "project" });
      expect(item.path).toBe(`matterhorn-builtin://skills/${item.name}/SKILL.md`);
      const content = readBuiltinWorkspaceSkill(item);
      if (content === null) throw new Error("Expected immutable content");
      const parsed = parseFrontmatter(content);
      expect(parsed.data.name).toBe(item.name);
      expect(parsed.data.description).toBe(item.description);
      expect(parsed.data["user-invocable"]).toBe(false);
      expect(parsed.data["matterhorn-preload-version"]).toBe("1");
    }
  });

  test("requires exact release name, virtual ID and builtin metadata", async () => {
    const item = listBuiltinWorkspaceSkills()[0];
    for (const path of ["/etc/passwd", "file:///etc/passwd", `${item.path}/../other`, item.path.replace("skills/", "skills/../"), "https://evil.invalid/skill"]) {
      expect(readBuiltinWorkspaceSkill({ ...item, path })).toBeNull();
      await expect(readSkillContent({ ...item, path })).rejects.toThrow("Built-in skill not found");
    }
    expect(readBuiltinWorkspaceSkill({ ...item, name: "unknown" })).toBeNull();
    expect(readBuiltinWorkspaceSkill({ name: item.name, path: item.path })).toBeNull();
    const { builtin, ...withoutAuthority } = item;
    expect(builtin).toBe(true);
    await expect(readSkillContent(withoutAuthority)).rejects.toThrow("Built-in skill not found");
  });

  test("loads documents without creating a skill directory, configuration or external credentials", async () => {
    const root = await fixture();
    const before = await readdir(root);
    const items = await listSkills(root, false);
    expect(items).toEqual(listBuiltinWorkspaceSkills());
    for (const item of items) {
      const content = readBuiltinWorkspaceSkill(item);
      if (content === null) throw new Error("Expected immutable release content");
      expect(await readSkillContent(item)).toBe(content);
    }
    expect(await readdir(root)).toEqual(before);
    expect(await listSkills(root, false)).toEqual(items);
  });

  test("preserves workspace copies and their editability without trusting their prompt content", async () => {
    const root = await fixture();
    const definition = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0];
    const directory = join(root, ".opencode", "skills", definition.name);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "SKILL.md");
    const custom = `---\nname: ${definition.name}\ndescription: User-owned rules\n---\nPrivate workspace instructions.\n`;
    await writeFile(path, custom, "utf8");
    const originalGuidance = getMatterhornBuiltinDeskGuidance("matterhorn-bittensor");
    const items = await listSkills(root, false);
    const matching = items.filter((item) => item.name === definition.name);
    expect(matching).toHaveLength(1);
    expect(matching[0].builtin).toBeUndefined();
    expect(matching[0].userInvocable).toBe(true);
    expect(await readSkillContent(matching[0])).toBe(custom);
    expect(await readFile(path, "utf8")).toBe(custom);
    expect(getMatterhornBuiltinDeskGuidance("matterhorn-bittensor")).toBe(originalGuidance);
    expect(originalGuidance).not.toContain("Private workspace instructions");
  });

  test("does not mutate malformed existing files or inject them into canonical guidance", async () => {
    const root = await fixture();
    const definition = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0];
    const directory = join(root, ".opencode", "skills", definition.name);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "SKILL.md");
    const malformed = "---\nmalformed: [\n";
    await writeFile(path, malformed, "utf8");
    expect((await listSkills(root, false)).find((item) => item.name === definition.name)?.builtin).toBe(true);
    expect(await readFile(path, "utf8")).toBe(malformed);
  });

  test("blocks virtual guidance mutation while preserving existing custom copy edits/deletion", async () => {
    const root = await fixture();
    const definition = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0];
    await expect(upsertSkill(root, { name: definition.name, description: "Valid test description", content: "new override" })).rejects.toThrow("Built-in guidance is read-only");
    await expect(deleteSkill(root, definition.name)).rejects.toThrow("Built-in guidance is read-only");
    expect(await readdir(root)).toEqual([".git"]);
    const directory = join(root, ".opencode", "skills", definition.name);
    await mkdir(directory, { recursive: true });
    const path = join(directory, "SKILL.md");
    await writeFile(path, `---\nname: ${definition.name}\n---\nMy custom copy`, "utf8");
    expect((await upsertSkill(root, { name: definition.name, description: "Updated custom workflow", content: "Updated custom copy" })).action).toBe("updated");
    expect(await readFile(path, "utf8")).toContain("Updated custom copy");
    await deleteSkill(root, definition.name);
    expect((await listSkills(root, false)).find((item) => item.name === definition.name)?.builtin).toBe(true);
    expect(await readdir(join(root, ".opencode", "skills"))).toEqual([]);
  });

  test("validates deterministic names and renders safe metadata without filesystem access", () => {
    const definition = MATTERHORN_PRELOADED_WORKSPACE_SKILLS[0];
    expect(renderPreloadedWorkspaceSkill(definition)).toBe(renderPreloadedWorkspaceSkill(definition));
    for (const name of ["../escape", "matterhorn-a/../../escape", "/absolute", "MALFORMED", "matterhorn--empty"]) {
      expect(() => renderPreloadedWorkspaceSkill({ ...definition, name })).toThrow("Invalid Matterhorn");
    }
    expect(() => renderPreloadedWorkspaceSkill({ ...definition, body: " " })).toThrow("Invalid Matterhorn");
  });
});
