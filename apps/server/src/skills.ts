import { readdir, readFile, writeFile, mkdir, rm, lstat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { SkillItem } from "./types.js";
import { parseFrontmatter, buildFrontmatter } from "./frontmatter.js";
import { exists } from "./utils.js";
import { validateDescription, validateSkillName } from "./validators.js";
import { ApiError } from "./errors.js";
import { projectSkillsDir } from "./workspace-files.js";
import { listBuiltinWorkspaceSkills, MATTERHORN_BUILTIN_SKILL_PREFIX, readBuiltinWorkspaceSkill } from "./builtin-skill-catalog.js";

async function findWorkspaceRoots(workspaceRoot: string): Promise<string[]> {
  const roots: string[] = [];
  let current = resolve(workspaceRoot);
  while (true) {
    roots.push(current);
    const gitPath = join(current, ".git");
    if (await exists(gitPath)) break;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

const extractTriggerFromBody = (body: string) => {
  const lines = body.split(/\r?\n/);
  let inWhenSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^#{1,6}\s+/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,6}\s+/, "").trim();
      inWhenSection = /^when to use$/i.test(heading);
      continue;
    }

    if (!inWhenSection) continue;

    const cleaned = trimmed
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();

    if (cleaned) return cleaned;
  }

  return "";
};

async function parseSkillEntry(
  skillPath: string,
  entryName: string,
  scope: "project" | "global",
): Promise<SkillItem | null> {
  try {
    const content = await readFile(skillPath, "utf8");
    const { data, body } = parseFrontmatter(content);
    const name = typeof data.name === "string" ? data.name : entryName;
    const description = typeof data.description === "string" ? data.description : "";
    const trigger =
      typeof data.trigger === "string"
        ? data.trigger
        : typeof data.when === "string"
          ? data.when
          : extractTriggerFromBody(body);
    const userInvocable =
      typeof data["user-invocable"] === "boolean"
        ? data["user-invocable"]
        : typeof data.userInvocable === "boolean"
          ? data.userInvocable
          : true;
    validateSkillName(name);
    validateDescription(description);
    if (name !== entryName) return null;
    return {
      name,
      description,
      path: skillPath,
      scope,
      trigger: trigger.trim() || undefined,
      userInvocable,
    };
  } catch {
    return null;
  }
}

async function listSkillsInDir(dir: string, scope: "project" | "global"): Promise<SkillItem[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const items: SkillItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    if (await exists(skillPath)) {
      // Direct skill: <dir>/<name>/SKILL.md
      const item = await parseSkillEntry(skillPath, entry.name, scope);
      if (item) items.push(item);
    } else {
      // Domain/category folder: <dir>/<domain>/<name>/SKILL.md – scan one level deeper.
      // This supports the convention where global skills are organised as
      //   skills/<domain>/<skill-name>/SKILL.md
      // in addition to the flat   skills/<skill-name>/SKILL.md  layout.
      const domainDir = join(dir, entry.name);
      let subEntries: Dirent[];
      try {
        subEntries = await readdir(domainDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory()) continue;
        const subSkillPath = join(domainDir, subEntry.name, "SKILL.md");
        if (!(await exists(subSkillPath))) continue;
        const item = await parseSkillEntry(subSkillPath, subEntry.name, scope);
        if (item) items.push(item);
      }
    }
  }
  return items;
}

export async function listSkills(workspaceRoot: string, includeGlobal: boolean): Promise<SkillItem[]> {
  const roots = await findWorkspaceRoots(workspaceRoot);
  const items: SkillItem[] = [];
  for (const root of roots) {
    const opencodeDir = join(root, ".opencode", "skills");
    const claudeDir = join(root, ".claude", "skills");
    items.push(...(await listSkillsInDir(opencodeDir, "project")));
    items.push(...(await listSkillsInDir(claudeDir, "project")));
  }

  if (includeGlobal) {
    const globalOpenWork = join(homedir(), ".config", "opencode", "skills");
    const globalClaude = join(homedir(), ".claude", "skills");
    const globalAgents = join(homedir(), ".agents", "skills");
    const globalAgentLegacy = join(homedir(), ".agent", "skills");
    items.push(...(await listSkillsInDir(globalOpenWork, "global")));
    items.push(...(await listSkillsInDir(globalClaude, "global")));
    items.push(...(await listSkillsInDir(globalAgents, "global")));
    items.push(...(await listSkillsInDir(globalAgentLegacy, "global")));
  }

  // Built-ins are immutable release documents, never written into user-owned
  // workspace paths. Existing workspace/global copies retain precedence.
  items.push(...listBuiltinWorkspaceSkills());
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

export async function readSkillContent(item: SkillItem): Promise<string> {
  if (item.builtin === true || item.path.startsWith(MATTERHORN_BUILTIN_SKILL_PREFIX)) {
    const content = readBuiltinWorkspaceSkill(item);
    if (content === null) throw new ApiError(404, "skill_not_found", "Built-in skill not found");
    return content;
  }
  return readFile(item.path, "utf8");
}

/** A virtual document is not a new writable workspace file. Existing user
 * copies retain their prior edit/delete lifecycle and never change policy. */
async function assertMutableSkillCopy(
  workspaceRoot: string,
  name: string,
  options: { allowDiscoveredCopy?: boolean } = {},
): Promise<void> {
  if (!listBuiltinWorkspaceSkills().some((item) => item.name === name)) return;
  let localCopyAbsent = false;
  try {
    const path = join(projectSkillsDir(workspaceRoot), name, "SKILL.md");
    const stat = await lstat(path);
    if (stat.isFile() && !stat.isSymbolicLink()) return;
  } catch (error) {
    // An absent or unreadable file cannot turn immutable guidance into a
    // writable workspace entry.
    localCopyAbsent = error instanceof Error && "code" in error && error.code === "ENOENT";
  }
  if (options.allowDiscoveredCopy && localCopyAbsent) {
    // Editing a discovered custom skill has always saved a workspace-local
    // copy. Never write back to its legacy, ancestor or global source path.
    let localDestination = true;
    for (const path of [
      join(workspaceRoot, ".opencode"),
      projectSkillsDir(workspaceRoot),
      join(projectSkillsDir(workspaceRoot), name),
    ]) {
      try {
        const stat = await lstat(path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) localDestination = false;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) localDestination = false;
      }
      if (!localDestination) break;
    }
    if (localDestination && (await listSkills(workspaceRoot, true)).some((item) => item.name === name && !item.builtin)) return;
  }
  throw new ApiError(409, "builtin_skill_read_only", "Built-in guidance is read-only. Create a separately named workspace skill to customize your workflow.");
}

export type UpsertSkillPayload = {
  name: string;
  content: string;
  description?: string;
};

export function buildSkillContent(payload: UpsertSkillPayload): { name: string; content: string } {
  const name = payload.name.trim();
  validateSkillName(name);
  if (!payload.content) {
    throw new ApiError(400, "invalid_skill_content", "Skill content is required");
  }

  let content = payload.content;
  const { data, body } = parseFrontmatter(payload.content);
  if (Object.keys(data).length > 0) {
    const frontmatterName = typeof data.name === "string" ? data.name : "";
    const frontmatterDescription = typeof data.description === "string" ? data.description : "";
    if (frontmatterName && frontmatterName !== name) {
      throw new ApiError(400, "invalid_skill_name", "Skill frontmatter name must match payload name");
    }
    validateDescription(frontmatterDescription || payload.description);
    const nextDescription = frontmatterDescription || payload.description || "";
    const frontmatter = buildFrontmatter({
      ...data,
      name,
      description: nextDescription,
    });
    content = frontmatter + body.replace(/^\n/, "");
  } else {
    validateDescription(payload.description);
    const frontmatter = buildFrontmatter({ name, description: payload.description });
    content = frontmatter + payload.content.replace(/^\n/, "");
  }

  return {
    name,
    content: content.endsWith("\n") ? content : content + "\n",
  };
}

export async function upsertSkill(
  workspaceRoot: string,
  payload: UpsertSkillPayload,
): Promise<{ path: string; action: "added" | "updated" }> {
  const skill = buildSkillContent(payload);
  await assertMutableSkillCopy(workspaceRoot, skill.name, { allowDiscoveredCopy: true });
  return writeWorkspaceSkill(workspaceRoot, skill);
}

/** Only the authenticated, approved, fingerprint-checked workspace import
 * flow may restore a user-owned copy under a built-in name. This file remains
 * untrusted workspace content; it never replaces canonical desk guidance. */
export async function importWorkspaceSkill(
  workspaceRoot: string,
  payload: UpsertSkillPayload,
): Promise<{ path: string; action: "added" | "updated" }> {
  return writeWorkspaceSkill(workspaceRoot, buildSkillContent(payload));
}

async function writeWorkspaceSkill(
  workspaceRoot: string,
  skill: { name: string; content: string },
): Promise<{ path: string; action: "added" | "updated" }> {
  const baseDir = projectSkillsDir(workspaceRoot);
  const skillDir = join(baseDir, skill.name);
  await mkdir(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  const existed = await exists(skillPath);
  await writeFile(skillPath, skill.content, "utf8");
  return { path: skillPath, action: existed ? "updated" : "added" };
}

export async function deleteSkill(workspaceRoot: string, name: string): Promise<{ path: string }> {
  const trimmed = name.trim();
  validateSkillName(trimmed);
  await assertMutableSkillCopy(workspaceRoot, trimmed);
  const baseDir = projectSkillsDir(workspaceRoot);
  const skillDir = join(baseDir, trimmed);
  const skillPath = join(skillDir, "SKILL.md");
  if (!(await exists(skillPath))) {
    throw new ApiError(404, "skill_not_found", `Skill not found: ${trimmed}`);
  }
  await rm(skillDir, { recursive: true, force: true });
  return { path: skillDir };
}
