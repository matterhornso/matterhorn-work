import { afterEach, describe, expect, test } from "bun:test";
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hubSkillInstallApprovalSummary, installHubSkill, normalizeHubSkillInstallInput } from "./skill-hub.js";

const fixtures: string[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await rm(fixture, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-hub-test-"));
  fixtures.push(root);
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  return { workspace, outside, skill: join(workspace, ".opencode", "skills", "custom-skill") };
}

function repository(options: {
  files?: Array<{ path: string; mode?: string; content: string }>;
  onFile?: () => Promise<void>;
  source?: { owner: string; repo: string; ref: string };
} = {}) {
  const files = options.files ?? [{ path: "SKILL.md", content: "Downloaded custom guidance" }];
  const source = options.source ?? { owner: "different-ai", repo: "openwork-hub", ref: "main" };
  const segments = [source.owner, source.repo, source.ref].map(encodeURIComponent);
  const treeUrl = `https://api.github.com/repos/${segments[0]}/${segments[1]}/git/trees/${segments[2]}?recursive=1`;
  const rawBase = `https://raw.githubusercontent.com/${segments.join("/")}/skills/custom-skill/`;
  const calls: string[] = [];
  const fetchImpl = async (url: string): Promise<Response> => {
    calls.push(url);
    if (url === treeUrl) {
      return Response.json({ tree: files.map(file => ({ type: "blob", path: `skills/custom-skill/${file.path}`, mode: file.mode ?? "100644" })) });
    }
    const file = files.find(candidate => url === `${rawBase}${candidate.path.split("/").map(encodeURIComponent).join("/")}`);
    if (!file) throw new Error("Unexpected mocked hub request");
    await options.onFile?.();
    return new Response(file.content);
  };
  return { fetchImpl, calls };
}

describe("hub installation approval", () => {
  test("normalizes and freezes source selection and overwrite before describing it", () => {
    const input = { name: " custom-skill ", overwrite: true, repo: { owner: " custom-org ", repo: " private-hub ", ref: " feature/custom " } };
    const selected = normalizeHubSkillInstallInput(input);
    input.repo.ref = "different";
    expect(selected).toEqual({ name: "custom-skill", overwrite: true, repo: { owner: "custom-org", repo: "private-hub", ref: "feature/custom" } });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.repo)).toBe(true);
    const summary = hubSkillInstallApprovalSummary(selected);
    expect(summary).toContain('owner="custom-org", repo="private-hub", ref="feature/custom"; overwrite=true');
    expect(summary).toContain("executable scripts require trust");
    expect(normalizeHubSkillInstallInput({ name: "custom-skill", repo: { owner: " " } })).toEqual({
      name: "custom-skill", overwrite: false, repo: { owner: "different-ai", repo: "openwork-hub", ref: "main" },
    });
    expect(() => normalizeHubSkillInstallInput({ name: "../invalid" })).toThrow("Skill name must be kebab-case");
  });

  test("the reachable route approves and executes the same normalized input", async () => {
    const source = await readFile(new URL("./server.ts", import.meta.url), "utf8");
    const start = source.indexOf('addRoute(routes, "POST", "/workspace/:id/skills/hub/:name"');
    const route = source.slice(start, source.indexOf('\n  addRoute(routes, "GET", "/workspace/:id/skills/:name"', start));
    expect(route).toContain("const installInput = normalizeHubSkillInstallInput({ name, overwrite, repo });");
    expect(route).toContain("summary: hubSkillInstallApprovalSummary(installInput)");
    expect(route).toContain('paths: [join(workspace.path, ".opencode", "skills", installInput.name)]');
    expect(route).toContain("installHubSkill(workspace.path, installInput)");
    expect(route.indexOf("normalizeHubSkillInstallInput")).toBeLessThan(route.indexOf("await requireApproval"));
    expect(route.indexOf("await requireApproval")).toBeLessThan(route.indexOf("await installHubSkill"));
    expect(route).toContain('requireClientScope(ctx, "collaborator")');
    expect(route).toContain("if (ctx.matterhornSession) hostedOperationNotAllowed()");
  });
});

describe("hub destination containment", () => {
  test("installs a selected custom repository and executable scripts without removing custom files", async () => {
    const { workspace, skill } = await fixture();
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "local.txt"), "local customization");
    const source = { owner: "custom-org", repo: "my-hub", ref: "feature/skills" };
    const remote = repository({ source, files: [
      { path: "SKILL.md", content: "Downloaded custom guidance" },
      { path: "scripts/run.sh", mode: "100755", content: "#!/bin/sh\nexit 0\n" },
    ] });
    const selected = normalizeHubSkillInstallInput({ name: " custom-skill ", repo: source });
    expect(await installHubSkill(workspace, selected, remote)).toMatchObject({ action: "added", written: 2, skipped: 0 });
    expect(await readFile(join(skill, "local.txt"), "utf8")).toBe("local customization");
    expect(await readFile(join(skill, "SKILL.md"), "utf8")).toBe("Downloaded custom guidance");
    expect((await lstat(join(skill, "scripts/run.sh"))).mode & 0o777).toBe(0o755);
    expect(remote.calls).toHaveLength(3);
    expect(await readdir(skill)).toEqual(expect.arrayContaining(["local.txt", "SKILL.md", "scripts"]));
    expect((await readdir(skill)).some(name => name.startsWith(".hub-install-"))).toBe(false);
  });

  test("overwrite=false preserves files; overwrite=true replaces only the destination hardlink", async () => {
    const { workspace, outside, skill } = await fixture();
    await mkdir(skill, { recursive: true });
    const original = join(outside, "original.md");
    await writeFile(original, "custom original", { mode: 0o640 });
    await link(original, join(skill, "SKILL.md"));
    const skip = repository();
    expect(await installHubSkill(workspace, { name: "custom-skill" }, skip)).toMatchObject({ action: "updated", written: 0, skipped: 1 });
    expect(skip.calls).toHaveLength(1);
    expect(await readFile(original, "utf8")).toBe("custom original");
    expect(await installHubSkill(workspace, { name: "custom-skill", overwrite: true }, repository())).toMatchObject({ action: "updated", written: 1, skipped: 0 });
    expect(await readFile(join(skill, "SKILL.md"), "utf8")).toBe("Downloaded custom guidance");
    expect(await readFile(original, "utf8")).toBe("custom original");
    expect((await lstat(original)).ino).not.toBe((await lstat(join(skill, "SKILL.md"))).ino);
    expect((await lstat(join(skill, "SKILL.md"))).mode & 0o777).toBe(0o640);
  });

  test("rejects existing and dangling leaf symlinks before fetching even with overwrite disabled", async () => {
    for (const dangling of [false, true]) {
      for (const overwrite of [false, true]) {
        const { workspace, outside, skill } = await fixture();
        await mkdir(skill, { recursive: true });
        const target = join(outside, "protected.md");
        if (!dangling) await writeFile(target, "protected");
        await symlink(target, join(skill, "SKILL.md"));
        const remote = repository();
        await expect(installHubSkill(workspace, { name: "custom-skill", overwrite }, remote)).rejects.toMatchObject({ code: "unsafe_hub_destination" });
        expect(remote.calls).toEqual([]);
        expect(await readdir(outside)).toEqual(dangling ? [] : ["protected.md"]);
        if (!dangling) expect(await readFile(target, "utf8")).toBe("protected");
      }
    }
  });

  test("rejects every preexisting symlink ancestor before any remote request", async () => {
    for (const parts of [[".opencode"], [".opencode", "skills"], [".opencode", "skills", "custom-skill"]]) {
      const { workspace, outside } = await fixture();
      await mkdir(join(workspace, ...parts.slice(0, -1)), { recursive: true });
      await symlink(outside, join(workspace, ...parts));
      const remote = repository();
      await expect(installHubSkill(workspace, { name: "custom-skill", overwrite: true }, remote)).rejects.toMatchObject({ code: "unsafe_hub_destination" });
      expect(remote.calls).toEqual([]);
      expect(await readdir(outside)).toEqual([]);
    }
  });

  test("rejects a nested ancestor link before fetching that file", async () => {
    const { workspace, outside, skill } = await fixture();
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "custom");
    await symlink(outside, join(skill, "scripts"));
    const remote = repository({ files: [{ path: "scripts/run.sh", mode: "100755", content: "not executed" }] });
    await expect(installHubSkill(workspace, { name: "custom-skill", overwrite: true }, remote)).rejects.toMatchObject({ code: "unsafe_hub_destination" });
    expect(remote.calls).toHaveLength(1);
    expect(await readdir(outside)).toEqual([]);
  });

  test("rechecks parent links after a delayed download", async () => {
    const { workspace, outside, skill } = await fixture();
    const remote = repository({ onFile: async () => {
      await rename(skill, `${skill}-original`);
      await symlink(outside, skill);
    } });
    await expect(installHubSkill(workspace, { name: "custom-skill", overwrite: true }, remote)).rejects.toMatchObject({ code: "unsafe_hub_destination" });
    expect(await readdir(outside)).toEqual([]);
    expect(await readdir(`${skill}-original`)).toEqual([]);
  });

  test("rechecks leaf links after a delayed download", async () => {
    const { workspace, outside, skill } = await fixture();
    const target = join(outside, "protected.md");
    await writeFile(target, "protected");
    const remote = repository({ onFile: async () => { await symlink(target, join(skill, "SKILL.md")); } });
    await expect(installHubSkill(workspace, { name: "custom-skill", overwrite: true }, remote)).rejects.toMatchObject({ code: "unsafe_hub_destination" });
    expect(await readFile(target, "utf8")).toBe("protected");
    expect((await readdir(skill)).filter(name => name.startsWith(".hub-install-"))).toEqual([]);
  });

  test("preserves a file created while overwrite=false download is pending", async () => {
    const { workspace, skill } = await fixture();
    const remote = repository({ onFile: async () => { await writeFile(join(skill, "SKILL.md"), "new local customization"); } });
    expect(await installHubSkill(workspace, { name: "custom-skill" }, remote)).toMatchObject({ written: 0, skipped: 1 });
    expect(await readFile(join(skill, "SKILL.md"), "utf8")).toBe("new local customization");
  });

  test("failed downloads leave existing custom content and no staged files", async () => {
    const { workspace, skill } = await fixture();
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "custom");
    const remote = repository({ onFile: async () => { throw new Error("synthetic transport failure"); } });
    await expect(installHubSkill(workspace, { name: "custom-skill", overwrite: true }, remote)).rejects.toThrow("synthetic transport failure");
    expect(await readFile(join(skill, "SKILL.md"), "utf8")).toBe("custom");
    expect(await readdir(skill)).toEqual(["SKILL.md"]);
  });
});
